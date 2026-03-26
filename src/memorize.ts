import { Request, Response, NextFunction, RequestHandler } from 'express';
import { MemorizeStore } from './MemorizeStore';
import { Memorize } from './domain/Memorize';
import { MemorizeOptions } from './domain/MemorizeOptions';
import { MemorizeCallOptions } from './domain/MemorizeCallOptions';

export type { Memorize, MemorizeOptions, MemorizeCallOptions };

/**
 * Creates an in-memory cache for an Express application.
 *
 * Returns a {@link Memorize} instance that can be used as per-route middleware,
 * a global `app.use()` middleware, or a cache management API — all sharing the
 * same underlying store.
 *
 * **Only `GET` requests are cached.** Responses are cached only when the HTTP
 * status code is in the `2xx` range. The cache key is `req.originalUrl`, which
 * includes the query string.
 *
 * @param options - Global configuration for the cache instance.
 *
 * @example Per-route middleware
 * ```ts
 * const cache = memorize({ ttl: 30_000 });
 *
 * app.get('/users', cache(), (req, res) => {
 *   res.json({ data: users });
 * });
 * ```
 *
 * @example Global middleware
 * ```ts
 * const cache = memorize({ ttl: 60_000 });
 * app.use(cache()); // caches all GET routes
 * ```
 *
 * @example Cache invalidation
 * ```ts
 * const cache = memorize({ ttl: 30_000 });
 *
 * app.post('/users', (req, res) => {
 *   users.push(req.body);
 *   cache.delete('/users');
 *   res.status(201).json(req.body);
 * });
 * ```
 *
 * @example Event hooks
 * ```ts
 * cache.on(MemorizeEventType.Set,    (e) => console.log('stored',  e.key));
 * cache.on(MemorizeEventType.Delete, (e) => console.log('deleted', e.key));
 * cache.on(MemorizeEventType.Expire, (e) => console.log('expired', e.key));
 * cache.on(MemorizeEventType.Empty,  ()  => console.log('cache is empty'));
 * ```
 */
export function memorize(options: MemorizeOptions = {}): Memorize {
  const { ttl } = options;
  const store = new MemorizeStore();

  const cache = function (callOptions?: MemorizeCallOptions): RequestHandler {
    const effectiveTtl = callOptions?.ttl ?? ttl;

    return function (req: Request, res: Response, next: NextFunction): void {
      if (req.method !== 'GET' || callOptions?.noCache) {
        next();
        return;
      }

      const key = req.originalUrl;
      const cached = store.getRaw(key);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', cached.contentType);
        res.status(cached.statusCode).send(cached.body);
        return;
      }

      const originalSend = res.send.bind(res) as (body?: unknown) => Response;

      res.send = function (body?: unknown): Response {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const contentType = (res.getHeader('Content-Type') as string) ?? 'application/octet-stream';
          store.set(key, { body, statusCode: res.statusCode, contentType }, effectiveTtl);
        }
        res.setHeader('X-Cache', 'MISS');
        return originalSend(body);
      };

      next();
    };
  } as Memorize;

  cache.get            = (key: string) => store.get(key);
  cache.getAll         = () => store.getAll();
  cache.delete         = (key: string) => store.delete(key);
  cache.deleteMatching = (pattern: string) => store.deleteMatching(pattern);
  cache.clear          = () => store.clear();
  cache.on             = store.on.bind(store) as Memorize['on'];

  return cache;
}
