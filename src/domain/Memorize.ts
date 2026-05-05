import { RequestHandler } from 'express';
import { CacheInfo } from './CacheInfo';
import { MemorizeCallOptions } from './MemorizeCallOptions';
import { MemorizeEventType } from './MemorizeEventType';
import { MemorizeSetEvent } from './MemorizeSetEvent';
import { MemorizeDeleteEvent } from './MemorizeDeleteEvent';
import { MemorizeExpireEvent } from './MemorizeExpireEvent';
import { MemorizeEmptyEvent } from './MemorizeEmptyEvent';
import { MemorizeEvictEvent } from './MemorizeEvictEvent';
import { MemorizeStats } from './MemorizeStats';
import { MemorizeStore } from '../MemorizeStore';

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
 * // Direct service-level usage
 * const users = await cache.remember('users:list', () => userService.findAll());
 *
 * // Cache management
 * cache.delete('/users');
 * cache.clear();
 * ```
 */
export interface Memorize {
  /**
   * Returns an Express `RequestHandler` that caches `GET` responses with a `2xx`
   * status code. Alias of {@link Memorize.express} kept for backwards compatibility.
   *
   * @param options - Optional per-route options (e.g. TTL override).
   */
  (options?: MemorizeCallOptions): RequestHandler;

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
   * app.get('/users',    cache.express(),               handler); // global TTL
   * app.get('/products', cache.express({ ttl: 5_000 }), handler); // 5-second override
   * app.use(cache.express());                                      // global middleware
   * ```
   */
  express(options?: MemorizeCallOptions): RequestHandler;

  /**
   * Stores an arbitrary value in the cache under the given key.
   *
   * The value is serialized with `JSON.stringify`. Retrieve it with {@link getValue}.
   *
   * @param key - Cache key.
   * @param value - Value to cache.
   * @param ttl - Time-to-live in milliseconds. Defaults to the global TTL.
   *
   * @example
   * ```ts
   * cache.set('config', { theme: 'dark' });
   * cache.set('config', { theme: 'dark' }, 60_000);
   * ```
   */
  set<T>(key: string, value: T, ttl?: number): void;

  /**
   * Returns the cached value for the given key, or `undefined` if the key does
   * not exist or has expired.
   *
   * Values stored via {@link set} or {@link remember} are deserialized with
   * `JSON.parse`.
   *
   * @param key - Cache key.
   *
   * @example
   * ```ts
   * const config = cache.getValue<Config>('config');
   * ```
   */
  getValue<T>(key: string): T | undefined;

  /**
   * Returns the cached value for the given key if it exists, otherwise calls
   * `factory`, caches the result, and returns it.
   *
   * @param key - Cache key.
   * @param factory - Async or sync function that produces the value on a cache miss.
   * @param ttl - Time-to-live in milliseconds. Defaults to the global TTL.
   *
   * @example
   * ```ts
   * const users = await cache.remember('users:list', () => userService.findAll());
   * const users = await cache.remember('users:list', () => userService.findAll(), 30_000);
   * ```
   */
  remember<T>(key: string, factory: () => T | Promise<T>, ttl?: number): Promise<T>;

  /**
   * Returns the {@link CacheInfo} for a specific cache key, or `null` if the key
   * does not exist or has expired.
   *
   * @param key - The full request URL used as the cache key (e.g. `/users?page=1`).
   *
   * @example
   * ```ts
   * const info = cache.get('/users');
   * if (info) console.log(`expires in ${info.remainingTtl}ms`);
   * ```
   */
  get(key: string): CacheInfo | null;

  /**
   * Returns all active (non-expired) cache entries as a plain object keyed by URL.
   *
   * @example
   * ```ts
   * console.log(Object.keys(cache.getAll())); // ['/users', '/products']
   * ```
   */
  getAll(): Record<string, CacheInfo>;

  /**
   * Removes a single entry from the cache and emits a {@link MemorizeEventType.Delete} event.
   *
   * @param key - The full request URL to invalidate.
   * @returns `true` if the entry existed and was removed, `false` otherwise.
   *
   * @example
   * ```ts
   * app.post('/users', (req, res) => {
   *   users.push(req.body);
   *   cache.delete('/users');
   *   res.status(201).json(req.body);
   * });
   * ```
   */
  delete(key: string): boolean;

  /**
   * Removes all cache entries whose keys match the given glob pattern.
   * Emits a {@link MemorizeEventType.Delete} event for each removed entry.
   *
   * Glob rules:
   * - `**` — matches any character sequence **across** path segments (crosses `/`).
   * - `*`  — matches any character sequence **within** a single path segment (does not cross `/`).
   * - `?`  — matches any single character except `/`.
   *
   * @param pattern - Glob pattern to match against cache keys.
   * @returns The number of entries removed.
   *
   * @example
   * ```ts
   * // Invalidate all cached variants of a user regardless of query params.
   * // Build the pattern with join to avoid the closing-comment sequence in source.
   * app.put('/users/:id', (req, res) => {
   *   users.update(req.params.id, req.body);
   *   const pattern = ['**', 'users', req.params.id + '*'].join('/');
   *   cache.deleteMatching(pattern); // e.g. ** /users/abc123*  (no space)
   *   res.json({ ok: true });
   * });
   * ```
   */
  deleteMatching(pattern: string): number;

  /**
   * Removes **all** entries from the cache and emits a {@link MemorizeEventType.Delete}
   * event for each.
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
   * | `MemorizeEventType.Set` | A response is stored |
   * | `MemorizeEventType.Delete` | An entry is removed via `delete()` or `clear()` |
   * | `MemorizeEventType.Expire` | An entry's TTL elapses |
   * | `MemorizeEventType.Empty` | The last entry is removed, cache is now empty |
   *
   * @example
   * ```ts
   * cache.on(MemorizeEventType.Set,    (e) => console.log('stored',  e.key));
   * cache.on(MemorizeEventType.Delete, (e) => console.log('deleted', e.key));
   * cache.on(MemorizeEventType.Expire, (e) => console.log('expired', e.key));
   * cache.on(MemorizeEventType.Empty,  ()  => console.log('cache is empty'));
   * ```
   */
  on(event: MemorizeEventType.Set,    handler: (e: MemorizeSetEvent) => void): void;
  on(event: MemorizeEventType.Delete, handler: (e: MemorizeDeleteEvent) => void): void;
  on(event: MemorizeEventType.Expire, handler: (e: MemorizeExpireEvent) => void): void;
  on(event: MemorizeEventType.Empty,  handler: (e: MemorizeEmptyEvent) => void): void;
  on(event: MemorizeEventType.Evict,  handler: (e: MemorizeEvictEvent) => void): void;

  /**
   * Returns the number of active (non-expired) cache entries.
   *
   * @example
   * ```ts
   * console.log(`${cache.size()} entries in cache`);
   * ```
   */
  size(): number;

  /**
   * Returns the approximate total byte size of all cached bodies.
   *
   * The value is an estimate based on UTF-8 encoding for strings and
   * `byteLength` for buffers. It may not reflect actual memory usage.
   *
   * @example
   * ```ts
   * console.log(`~${cache.byteSize()} bytes cached`);
   * ```
   */
  byteSize(): number;

  /**
   * Returns aggregate cache statistics.
   *
   * @example
   * ```ts
   * const { entries, maxEntries, byteSize } = cache.getStats();
   * ```
   */
  getStats(): MemorizeStats;

  /**
   * The underlying store. Intended for use by framework adapters only.
   * @internal
   */
  _store: MemorizeStore;
}
