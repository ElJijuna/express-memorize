import { MemorizeStore } from './MemorizeStore';
import { Memorize } from './domain/Memorize';
import { MemorizeOptions } from './domain/MemorizeOptions';
import { MemorizeCallOptions } from './domain/MemorizeCallOptions';
import { createExpressMiddleware } from './adapters/express';
import { createSerializer } from './serializer';
import { createWorkerAsyncSerializer } from './asyncSerializer';
export type { Serializer, SerializerOption } from './serializer';

export type { Memorize, MemorizeOptions, MemorizeCallOptions };

function serializedByteSize(body: string | Buffer): number {
  return Buffer.isBuffer(body) ? body.byteLength : Buffer.byteLength(body);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Creates an in-memory cache instance.
 *
 * Returns a {@link Memorize} instance that can be used as Express middleware,
 * as a direct service-level cache, or as a cache management API — all sharing
 * the same underlying store.
 *
 * **HTTP middleware:** Only `GET` requests with a `2xx` status code are cached.
 * The cache key is `req.originalUrl`, which includes the query string.
 *
 * **Direct cache:** Use {@link Memorize.set}, {@link Memorize.getValue}, and
 * {@link Memorize.remember} to cache arbitrary values from services, workers,
 * or any non-HTTP code.
 *
 * @param options - Global configuration for the cache instance.
 *
 * @example Express middleware
 * ```ts
 * const cache = memorize({ ttl: 30_000 });
 *
 * app.get('/users', cache.express(), handler);
 * app.get('/users', cache(), handler);           // backwards-compatible alias
 * ```
 *
 * @example Service-level caching
 * ```ts
 * const cache = memorize({ ttl: 30_000 });
 *
 * const users = await cache.remember('users:list', () => userService.findAll());
 * cache.set('config', appConfig);
 * const config = cache.getValue<AppConfig>('config');
 * ```
 *
 * @example Cache invalidation
 * ```ts
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
  const {
    ttl,
    maxEntries,
    maxValueBytes,
    maxTotalBytes,
    sizeLimitAction,
    asyncSerializer: asyncSerializerMode = 'yield',
    serializer: serializerOption,
  } = options;
  const store = new MemorizeStore({ maxEntries, maxValueBytes, maxTotalBytes, sizeLimitAction });
  const serializer = createSerializer(serializerOption);
  const workerSerializer = asyncSerializerMode === 'worker'
    ? createWorkerAsyncSerializer(serializerOption)
    : null;
  const expressMiddleware = createExpressMiddleware(store, ttl);

  const cache = function (callOptions?: MemorizeCallOptions) {
    return expressMiddleware(callOptions);
  } as Memorize;

  cache.express = (callOptions?: MemorizeCallOptions) => expressMiddleware(callOptions);

  cache.set = <T>(key: string, value: T, entryTtl?: number): void => {
    const body = serializer.serialize(value);
    const contentType = Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json';
    store.set(key, { body, statusCode: 200, contentType, size: serializedByteSize(body) }, entryTtl ?? ttl);
  };

  cache.setAsync = async <T>(key: string, value: T, entryTtl?: number): Promise<void> => {
    await yieldToEventLoop();
    if (!workerSerializer) {
      cache.set(key, value, entryTtl);
      return;
    }

    const body = await workerSerializer.serialize(value);
    const contentType = Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json';
    store.set(key, { body, statusCode: 200, contentType, size: serializedByteSize(body) }, entryTtl ?? ttl);
  };

  cache.getValue = <T>(key: string): T | undefined => {
    const entry = store.getRaw(key);
    if (!entry) return undefined;
    try {
      return serializer.deserialize(entry.body as string | Buffer) as T;
    } catch {
      return undefined;
    }
  };

  cache.getValueAsync = async <T>(key: string): Promise<T | undefined> => {
    await yieldToEventLoop();
    if (!workerSerializer) return cache.getValue<T>(key);

    const entry = store.getRaw(key);
    if (!entry) return undefined;
    try {
      return await workerSerializer.deserialize(entry.body as string | Buffer) as T;
    } catch {
      return undefined;
    }
  };

  cache.remember = async <T>(key: string, factory: () => T | Promise<T>, rememberTtl?: number): Promise<T> => {
    const existing = cache.getValue<T>(key);
    if (existing !== undefined) return existing;
    const value = await factory();
    cache.set(key, value, rememberTtl);
    return value;
  };

  cache.rememberAsync = async <T>(key: string, factory: () => T | Promise<T>, rememberTtl?: number): Promise<T> => {
    const existing = await cache.getValueAsync<T>(key);
    if (existing !== undefined) return existing;
    const value = await factory();
    await cache.setAsync(key, value, rememberTtl);
    return value;
  };

  cache.get            = (key: string) => store.get(key);
  cache.getAll         = () => store.getAll();
  cache.getAllAsync    = (batchOptions) => store.getAllAsync(batchOptions);
  cache.delete         = (key: string) => store.delete(key);
  cache.deleteMatching = (pattern: string) => store.deleteMatching(pattern);
  cache.deleteMatchingAsync = (pattern, batchOptions) => store.deleteMatchingAsync(pattern, batchOptions);
  cache.clear          = () => store.clear();
  cache.clearAsync     = (batchOptions) => store.clearAsync(batchOptions);
  cache.on             = store.on.bind(store) as Memorize['on'];
  cache.size           = () => store.size();
  cache.byteSize       = () => store.byteSize();
  cache.getStats       = () => store.getStats();
  cache._store         = store;
  cache._ttl           = ttl;

  return cache;
}
