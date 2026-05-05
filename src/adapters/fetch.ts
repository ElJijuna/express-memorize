import type { Memorize } from '../domain/Memorize';

type FetchHandler = (request: Request) => Promise<Response>;

export interface FetchAdapterOptions {
  /** Time-to-live in milliseconds. Defaults to the global TTL. */
  ttl?: number;
  /** Skip caching. Sets `X-Cache: BYPASS`. */
  noCache?: boolean;
  /** Custom cache key extractor. Defaults to `pathname + search`. */
  key?: (request: Request) => string;
}

/**
 * Wraps a Fetch API handler with in-memory caching for `GET` requests with
 * `2xx` responses.
 *
 * Works in any runtime that supports the Web-standard `Request` and `Response`
 * APIs: Node.js, Bun, Deno, Cloudflare Workers, and similar environments.
 *
 * @param cache - The {@link Memorize} instance to use as the backing store.
 * @param handler - The original fetch handler to wrap.
 * @param options - Optional per-handler options.
 *
 * @example Serverless handler
 * ```ts
 * import { memorize } from 'express-memorize';
 * import { cacheFetchHandler } from 'express-memorize/fetch';
 *
 * const cache = memorize({ ttl: 30_000 });
 *
 * export default cacheFetchHandler(cache, async (request) => {
 *   const users = await usersService.findAll();
 *   return Response.json(users);
 * });
 * ```
 *
 * @example With options
 * ```ts
 * const handler = cacheFetchHandler(cache, originalHandler, {
 *   ttl: 60_000,
 *   key: (req) => new URL(req.url).pathname,
 * });
 * ```
 */
export function cacheFetchHandler(
  cache: Memorize,
  handler: FetchHandler,
  options?: FetchAdapterOptions,
): FetchHandler {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') {
      return handler(request);
    }

    if (options?.noCache) {
      const response = await handler(request);
      const headers = new Headers(response.headers);
      headers.set('X-Cache', 'BYPASS');
      return new Response(response.body, { status: response.status, headers });
    }

    const { pathname, search } = new URL(request.url);
    const key = options?.key ? options.key(request) : pathname + search;
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

    const response = await handler(request);

    if (response.status >= 200 && response.status < 300) {
      const body = await response.clone().text();
      const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream';
      cache._store.set(key, { body, statusCode: response.status, contentType }, options?.ttl);

      const headers = new Headers(response.headers);
      headers.set('X-Cache', 'MISS');
      return new Response(body, { status: response.status, headers });
    }

    return response;
  };
}
