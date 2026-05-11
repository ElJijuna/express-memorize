import type { Context, Middleware } from 'koa';
import type { Memorize } from '../domain/Memorize';

export interface KoaAdapterOptions {
  /** Time-to-live in milliseconds. Defaults to the global TTL. */
  ttl?: number;
  /** Skip caching for this route. Sets `X-Cache: BYPASS`. */
  noCache?: boolean;
  /** Custom cache key extractor. Defaults to `ctx.originalUrl ?? ctx.url`. */
  key?: (ctx: Context) => string;
}

function defaultKey(ctx: Context): string {
  return ctx.originalUrl ?? ctx.url;
}

function inferContentType(body: unknown): string {
  if (Buffer.isBuffer(body) || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return 'application/octet-stream';
  }

  if (typeof body === 'string') {
    return 'text/plain';
  }

  if (body === undefined || body === null) {
    return 'application/octet-stream';
  }

  return 'application/json';
}

/**
 * Creates Koa middleware that caches `GET` responses with a `2xx` status code.
 *
 * Requires `koa` to be installed as an optional peer dependency.
 *
 * @param cache - The {@link Memorize} instance to use as the backing store.
 * @param options - Optional per-route options.
 *
 * @example
 * ```ts
 * import Koa from 'koa';
 * import Router from '@koa/router';
 * import { memorize } from 'express-memorize';
 * import { createKoaMiddleware } from 'express-memorize/koa';
 *
 * const app = new Koa();
 * const router = new Router();
 * const cache = memorize({ ttl: 30_000 });
 *
 * router.get('/users', createKoaMiddleware(cache), async (ctx) => {
 *   ctx.body = await usersService.findAll();
 * });
 * ```
 */
export function createKoaMiddleware(
  cache: Memorize,
  options?: KoaAdapterOptions,
): Middleware {
  return async function memorizeKoaMiddleware(ctx: Context, next): Promise<void> {
    if (ctx.method !== 'GET') {
      await next();
      return;
    }

    if (options?.noCache) {
      ctx.set('X-Cache', 'BYPASS');
      await next();
      return;
    }

    const key = options?.key ? options.key(ctx) : defaultKey(ctx);
    const cached = cache._store.getRaw(key);

    if (cached) {
      ctx.set('X-Cache', 'HIT');
      ctx.status = cached.statusCode;
      ctx.type = cached.contentType;
      ctx.body = cached.body;
      return;
    }

    await next();

    if (ctx.status >= 200 && ctx.status < 300) {
      const contentType = ctx.response.type || inferContentType(ctx.body);
      cache._store.set(
        key,
        { body: ctx.body, statusCode: ctx.status, contentType },
        options?.ttl ?? cache._ttl,
      );
      ctx.set('X-Cache', 'MISS');
    }
  };
}
