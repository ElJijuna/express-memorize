import { createExpressMiddleware } from './adapters/express';
import { createWorkerAsyncSerializer } from './asyncSerializer';
import type { Memorize } from './domain/Memorize';
import type { MemorizeCallOptions } from './domain/MemorizeCallOptions';
import type { MemorizeOptions } from './domain/MemorizeOptions';
import { MemorizeStore } from './MemorizeStore';
import { createSerializer } from './serializer';

export type { Serializer, SerializerOption } from './serializer';

export type { Memorize, MemorizeCallOptions, MemorizeOptions };

function serializedByteSize(body: string | Buffer): number {
  return Buffer.isBuffer(body) ? body.byteLength : Buffer.byteLength(body);
}

function estimateAsyncInputSize(value: unknown): number {
  if (typeof value === 'string') {
    return Buffer.byteLength(value);
  }
  if (Buffer.isBuffer(value)) {
    return value.byteLength;
  }
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (ArrayBuffer.isView(value)) {
    return (value as ArrayBufferView).byteLength;
  }
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function normalizeAsyncSerializerThreshold(value: number | undefined): number {
  if (value === undefined) {
    return 64_000;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('asyncSerializerThresholdBytes must be greater than or equal to 0');
  }
  return value;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function nextVersion(versions: Map<string, number>, key: string): number {
  const version = (versions.get(key) ?? 0) + 1;
  versions.set(key, version);
  return version;
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
    asyncSerializerWorkers,
    asyncSerializerThresholdBytes,
    serializer: serializerOption,
  } = options;
  const store = new MemorizeStore({ maxEntries, maxValueBytes, maxTotalBytes, sizeLimitAction });
  const serializer = createSerializer(serializerOption);
  const workerSerializer =
    asyncSerializerMode === 'worker'
      ? createWorkerAsyncSerializer(serializerOption, asyncSerializerWorkers)
      : null;
  const workerThresholdBytes = normalizeAsyncSerializerThreshold(asyncSerializerThresholdBytes);
  const expressMiddleware = createExpressMiddleware(store, ttl);
  const keyVersions = new Map<string, number>();
  const inFlightRemember = new Map<string, Promise<unknown>>();
  let mutationEpoch = 0;

  const cache = ((callOptions?: MemorizeCallOptions) => expressMiddleware(callOptions)) as Memorize;

  cache.express = (callOptions?: MemorizeCallOptions) => expressMiddleware(callOptions);

  cache.set = <T>(key: string, value: T, entryTtl?: number): void => {
    nextVersion(keyVersions, key);
    const body = serializer.serialize(value);
    const contentType = Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json';
    store.set(
      key,
      { body, statusCode: 200, contentType, size: serializedByteSize(body) },
      entryTtl ?? ttl,
    );
  };

  cache.setAsync = async <T>(key: string, value: T, entryTtl?: number): Promise<void> => {
    const version = nextVersion(keyVersions, key);
    const epoch = mutationEpoch;
    await yieldToEventLoop();
    if (!workerSerializer || estimateAsyncInputSize(value) < workerThresholdBytes) {
      if (keyVersions.get(key) !== version || mutationEpoch !== epoch) {
        return;
      }
      const body = serializer.serialize(value);
      if (keyVersions.get(key) !== version || mutationEpoch !== epoch) {
        return;
      }
      const contentType = Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json';
      store.set(
        key,
        { body, statusCode: 200, contentType, size: serializedByteSize(body) },
        entryTtl ?? ttl,
      );
      return;
    }

    const body = await workerSerializer.serialize(value);
    if (keyVersions.get(key) !== version || mutationEpoch !== epoch) {
      return;
    }
    const contentType = Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json';
    store.set(
      key,
      { body, statusCode: 200, contentType, size: serializedByteSize(body) },
      entryTtl ?? ttl,
    );
  };

  cache.getValue = <T>(key: string): T | undefined => {
    const entry = store.getRaw(key);
    if (!entry) {
      return undefined;
    }
    try {
      return serializer.deserialize(entry.body as string | Buffer) as T;
    } catch {
      return undefined;
    }
  };

  cache.getValueAsync = async <T>(key: string): Promise<T | undefined> => {
    await yieldToEventLoop();
    if (!workerSerializer) {
      return cache.getValue<T>(key);
    }

    const entry = store.getRaw(key);
    if (!entry) {
      return undefined;
    }
    if (entry.size < workerThresholdBytes) {
      try {
        return serializer.deserialize(entry.body as string | Buffer) as T;
      } catch {
        return undefined;
      }
    }
    try {
      return (await workerSerializer.deserialize(entry.body as string | Buffer)) as T;
    } catch {
      return undefined;
    }
  };

  cache.remember = async <T>(
    key: string,
    factory: () => T | Promise<T>,
    rememberTtl?: number,
  ): Promise<T> => {
    const existing = cache.getValue<T>(key);
    if (existing !== undefined) {
      return existing;
    }
    const inFlight = inFlightRemember.get(key);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    const promise = (async () => {
      const value = await factory();
      cache.set(key, value, rememberTtl);
      return value;
    })();

    inFlightRemember.set(key, promise);
    try {
      return await promise;
    } finally {
      if (inFlightRemember.get(key) === promise) {
        inFlightRemember.delete(key);
      }
    }
  };

  cache.rememberAsync = async <T>(
    key: string,
    factory: () => T | Promise<T>,
    rememberTtl?: number,
  ): Promise<T> => {
    const existing = await cache.getValueAsync<T>(key);
    if (existing !== undefined) {
      return existing;
    }
    const inFlight = inFlightRemember.get(key);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    const promise = (async () => {
      const value = await factory();
      await cache.setAsync(key, value, rememberTtl);
      return value;
    })();

    inFlightRemember.set(key, promise);
    try {
      return await promise;
    } finally {
      if (inFlightRemember.get(key) === promise) {
        inFlightRemember.delete(key);
      }
    }
  };

  cache.get = (key: string) => store.get(key);
  cache.getAll = () => store.getAll();
  cache.getAllAsync = (batchOptions) => store.getAllAsync(batchOptions);
  cache.delete = (key: string) => {
    nextVersion(keyVersions, key);
    return store.delete(key);
  };
  cache.deleteMatching = (pattern: string) => {
    mutationEpoch++;
    return store.deleteMatching(pattern);
  };
  cache.deleteMatchingAsync = (pattern, batchOptions) => {
    mutationEpoch++;
    return store.deleteMatchingAsync(pattern, batchOptions);
  };
  cache.clear = () => {
    mutationEpoch++;
    keyVersions.clear();
    store.clear();
  };
  cache.clearAsync = async (batchOptions) => {
    mutationEpoch++;
    keyVersions.clear();
    return store.clearAsync(batchOptions);
  };
  cache.on = store.on.bind(store) as Memorize['on'];
  cache.size = () => store.size();
  cache.byteSize = () => store.byteSize();
  cache.getStats = () => store.getStats();
  cache._store = store;
  cache._ttl = ttl;

  return cache;
}
