import { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  MemorizeStore,
  CacheInfo,
  MemorizeSetEvent,
  MemorizeDeleteEvent,
  MemorizeExpireEvent,
  MemorizeEmptyEvent,
} from './MemorizeStore';

/**
 * Options passed to the {@link memorize} factory.
 *
 * @example
 * ```ts
 * const cache = memorize({ ttl: 60_000 }); // cache entries live for 60 seconds
 * ```
 */
export interface MemorizeOptions {
  /**
   * Default time-to-live for every cached entry, in milliseconds.
   * Omit to cache indefinitely. Can be overridden per-route via {@link MemorizeCallOptions}.
   */
  ttl?: number;
}

/**
 * Options passed when invoking `cache()` to create a route-level middleware.
 *
 * @example
 * ```ts
 * // This route uses a 10-second TTL instead of the global 60-second TTL.
 * app.get('/products', cache({ ttl: 10_000 }), handler);
 * ```
 */
export interface MemorizeCallOptions {
  /**
   * Time-to-live override for this specific route, in milliseconds.
   * Takes precedence over the global `ttl` set in {@link MemorizeOptions}.
   * Pass `0` or omit to fall back to the global TTL.
   */
  ttl?: number;
}

/**
 * The cache instance returned by {@link memorize}.
 *
 * It is both a callable that produces Express middleware **and** a namespace for
 * cache management methods and event hooks. All middleware created from the same
 * `Memorize` instance share a single underlying store.
 *
 * @example
 * ```ts
 * const cache = memorize({ ttl: 30_000 });
 *
 * // Per-route middleware
 * app.get('/users', cache(), handler);
 *
 * // Global middleware — caches every GET route automatically
 * app.use(cache());
 *
 * // Cache management
 * cache.delete('/users');
 * cache.clear();
 * ```
 */
export interface Memorize {
  /**
   * Returns an Express `RequestHandler` that caches `GET` responses with a `2xx`
   * status code.
   *
   * - On a **cache miss** the request proceeds normally. The response is intercepted
   *   and stored after being sent. Sets `X-Cache: MISS`.
   * - On a **cache hit** the stored response is returned immediately without calling
   *   downstream handlers. Sets `X-Cache: HIT`.
   * - Non-`GET` requests are forwarded to `next()` unchanged.
   *
   * @param options - Optional per-route options (e.g. TTL override).
   *
   * @example
   * ```ts
   * app.get('/users',    cache(),               handler); // global TTL
   * app.get('/products', cache({ ttl: 5_000 }), handler); // 5-second override
   * app.use(cache());                                      // global middleware
   * ```
   */
  (options?: MemorizeCallOptions): RequestHandler;

  /**
   * Returns the {@link CacheInfo} for a specific cache key, or `null` if the key
   * does not exist or has expired.
   *
   * @param key - The full request URL used as the cache key (e.g. `/users?page=1`).
   *
   * @example
   * ```ts
   * const info = cache.get('/users');
   * if (info) {
   *   console.log(`expires in ${info.remainingTtl}ms`);
   * }
   * ```
   */
  get(key: string): CacheInfo | null;

  /**
   * Returns all active (non-expired) cache entries as a plain object keyed by URL.
   *
   * @example
   * ```ts
   * const entries = cache.getAll();
   * console.log(Object.keys(entries)); // ['/users', '/products']
   * ```
   */
  getAll(): Record<string, CacheInfo>;

  /**
   * Removes a single entry from the cache and emits a `'delete'` event.
   * Useful for manual invalidation after a mutation.
   *
   * @param key - The full request URL to invalidate (e.g. `/users`).
   * @returns `true` if the entry existed and was removed, `false` otherwise.
   *
   * @example
   * ```ts
   * app.post('/users', (req, res) => {
   *   users.push(req.body);
   *   cache.delete('/users'); // invalidate stale list
   *   res.status(201).json(req.body);
   * });
   * ```
   */
  delete(key: string): boolean;

  /**
   * Removes **all** entries from the cache and emits a `'delete'` event for each.
   *
   * @example
   * ```ts
   * cache.clear();
   * ```
   */
  clear(): void;

  /**
   * Registers a listener for cache events.
   *
   * | Event | When |
   * |-------|------|
   * | `'set'` | A response is stored (first request or after expiry) |
   * | `'delete'` | An entry is removed via `delete()` or `clear()` |
   * | `'expire'` | An entry is removed because its TTL elapsed |
   *
   * @example
   * ```ts
   * cache.on('set', (e) => {
   *   console.log(`[cache] stored ${e.key} — status ${e.statusCode}`);
   * });
   *
   * cache.on('expire', (e) => {
   *   console.log(`[cache] expired ${e.key}`);
   * });
   * ```
   */
  on(event: 'set', handler: (e: MemorizeSetEvent) => void): void;
  on(event: 'delete', handler: (e: MemorizeDeleteEvent) => void): void;
  on(event: 'expire', handler: (e: MemorizeExpireEvent) => void): void;
  on(event: 'empty', handler: (e: MemorizeEmptyEvent) => void): void;
}

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
 * cache.on('set',    (e) => console.log('stored',  e.key));
 * cache.on('delete', (e) => console.log('deleted', e.key));
 * cache.on('expire', (e) => console.log('expired', e.key));
 * ```
 */
export function memorize(options: MemorizeOptions = {}): Memorize {
  const { ttl } = options;
  const store = new MemorizeStore();

  const cache = function (callOptions?: MemorizeCallOptions): RequestHandler {
    const effectiveTtl = callOptions?.ttl ?? ttl;

    return function (req: Request, res: Response, next: NextFunction): void {
      if (req.method !== 'GET') {
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

  cache.get = (key: string) => store.get(key);
  cache.getAll = () => store.getAll();
  cache.delete = (key: string) => store.delete(key);
  cache.clear = () => store.clear();
  cache.on = store.on.bind(store) as Memorize['on'];

  return cache;
}
