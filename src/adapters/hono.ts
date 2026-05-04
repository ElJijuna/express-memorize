import type { Context, Next, MiddlewareHandler } from 'hono';
import type { Memorize } from '../domain/Memorize';

export interface HonoCallOptions {
  /** Time-to-live in milliseconds. Defaults to the global TTL. */
  ttl?: number;
  /** Skip caching for this route. Sets `X-Cache: BYPASS`. */
  noCache?: boolean;
  /** Custom cache key extractor. Defaults to `c.req.url`. */
  key?: (c: Context) => string;
}

/**
 * Creates a Hono middleware that caches `GET` responses with a `2xx` status code.
 *
 * Requires `hono` to be installed as a peer dependency.
 *
 * @param cache - The {@link Memorize} instance to use as the backing store.
 * @param options - Optional per-route options.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { memorize } from 'express-memorize';
 * import { createHonoMiddleware } from 'express-memorize/hono';
 *
 * const app = new Hono();
 * const cache = memorize({ ttl: 30_000 });
 *
 * app.get('/users', createHonoMiddleware(cache), async (c) => {
 *   return c.json(await usersService.findAll());
 * });
 * ```
 */
export function createHonoMiddleware(cache: Memorize, options?: HonoCallOptions): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (c.req.method !== 'GET') {
      return next();
    }

    if (options?.noCache) {
      await next();
      const headers = new Headers(c.res.headers);
      headers.set('X-Cache', 'BYPASS');
      c.res = new Response(c.res.body, { status: c.res.status, headers });
      return;
    }

    const { pathname, search } = new URL(c.req.url);
    const key = options?.key ? options.key(c) : pathname + search;
    const cached = cache._store.getRaw(key);

    if (cached) {
      return new Response(cached.body as string, {
        status: cached.statusCode,
        headers: {
          'Content-Type': cached.contentType,
          'X-Cache': 'HIT',
        },
      });
    }

    await next();

    const { status } = c.res;

    if (status >= 200 && status < 300) {
      const body = await c.res.clone().text();
      const contentType = c.res.headers.get('Content-Type') ?? 'application/octet-stream';
      cache._store.set(key, { body, statusCode: status, contentType }, options?.ttl);

      const headers = new Headers(c.res.headers);
      headers.set('X-Cache', 'MISS');
      c.res = new Response(body, { status, headers });
    }
  };
}
