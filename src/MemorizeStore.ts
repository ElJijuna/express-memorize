import { globToRegex } from './utils/globToRegex';
import { CacheEntry } from './domain/CacheEntry';
import { CacheInfo } from './domain/CacheInfo';
import { MemorizeEventType } from './domain/MemorizeEventType';
import { MemorizeEvent } from './domain/MemorizeEvent';
import { MemorizeSetEvent } from './domain/MemorizeSetEvent';
import { MemorizeDeleteEvent } from './domain/MemorizeDeleteEvent';
import { MemorizeExpireEvent } from './domain/MemorizeExpireEvent';
import { MemorizeEmptyEvent } from './domain/MemorizeEmptyEvent';

export type {
  CacheEntry,
  CacheInfo,
  MemorizeEvent,
  MemorizeSetEvent,
  MemorizeDeleteEvent,
  MemorizeExpireEvent,
  MemorizeEmptyEvent,
};
export { MemorizeEventType };

type ListenerMap = {
  [MemorizeEventType.Set]:    Array<(e: MemorizeSetEvent) => void>;
  [MemorizeEventType.Delete]: Array<(e: MemorizeDeleteEvent) => void>;
  [MemorizeEventType.Expire]: Array<(e: MemorizeExpireEvent) => void>;
  [MemorizeEventType.Empty]:  Array<(e: MemorizeEmptyEvent) => void>;
};

/**
 * Low-level in-memory key-value store with optional TTL and event emission.
 *
 * You do not usually interact with this class directly — use the {@link memorize} factory
 * instead, which wraps this store in an Express middleware.
 */
export class MemorizeStore {
  private _store = new Map<string, CacheEntry>();
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _listeners: ListenerMap = {
    [MemorizeEventType.Set]:    [],
    [MemorizeEventType.Delete]: [],
    [MemorizeEventType.Expire]: [],
    [MemorizeEventType.Empty]:  [],
  };

  /**
   * Registers an event listener.
   *
   * @param event - The event to listen for.
   * @param handler - Callback invoked with the event payload.
   *
   * @example
   * ```ts
   * store.on(MemorizeEventType.Set,    (e) => console.log('cached',  e.key));
   * store.on(MemorizeEventType.Expire, (e) => console.log('expired', e.key));
   * ```
   */
  on(event: MemorizeEventType.Set,    handler: (e: MemorizeSetEvent) => void): void;
  on(event: MemorizeEventType.Delete, handler: (e: MemorizeDeleteEvent) => void): void;
  on(event: MemorizeEventType.Expire, handler: (e: MemorizeExpireEvent) => void): void;
  on(event: MemorizeEventType.Empty,  handler: (e: MemorizeEmptyEvent) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: MemorizeEventType, handler: (e: any) => void): void {
    this._listeners[event].push(handler);
  }

  /**
   * Stores an entry in the cache.
   *
   * If an entry already exists for the given key its TTL timer is reset and the
   * value is overwritten. Emits a {@link MemorizeEventType.Set} event.
   *
   * @param key - The cache key (typically `req.originalUrl`).
   * @param entry - The response data to store.
   * @param ttl - Time-to-live in milliseconds. Omit or pass `null` for no expiry.
   */
  set(key: string, entry: Omit<CacheEntry, 'expiresAt'>, ttl?: number | null): void {
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key)!);
      this._timers.delete(key);
    }

    const expiresAt = ttl ? Date.now() + ttl : null;
    const stored: CacheEntry = { ...entry, expiresAt };
    this._store.set(key, stored);

    this._emit(MemorizeEventType.Set, { type: MemorizeEventType.Set, key, ...entry, expiresAt });

    if (ttl) {
      const timer = setTimeout(() => {
        this._evict(key, MemorizeEventType.Expire);
      }, ttl);

      if (typeof timer === 'object' && 'unref' in timer) timer.unref();
      this._timers.set(key, timer);
    }
  }

  /**
   * Returns the formatted {@link CacheInfo} for the given key, or `null` if the
   * key does not exist or its TTL has elapsed.
   *
   * @param key - The cache key to look up.
   */
  get(key: string): CacheInfo | null {
    const entry = this._store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._evict(key, MemorizeEventType.Expire);
      return null;
    }

    return this._format(key, entry);
  }

  /**
   * Returns all active (non-expired) cache entries as a key→{@link CacheInfo} map.
   * Expired entries are lazily evicted during this call.
   */
  getAll(): Record<string, CacheInfo> {
    const result: Record<string, CacheInfo> = {};

    for (const [key, entry] of this._store) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this._evict(key, MemorizeEventType.Expire);
        continue;
      }
      result[key] = this._format(key, entry);
    }

    return result;
  }

  /**
   * Removes a single entry from the cache. Emits a {@link MemorizeEventType.Delete} event.
   *
   * @param key - The cache key to remove.
   * @returns `true` if the entry existed and was removed, `false` otherwise.
   */
  delete(key: string): boolean {
    if (!this._store.has(key)) return false;
    this._evict(key, MemorizeEventType.Delete);
    return true;
  }

  /**
   * Removes all cache entries whose keys match the given glob pattern.
   * Emits a {@link MemorizeEventType.Delete} event for each removed entry.
   *
   * Glob rules:
   * - `*`  — matches any character sequence **within** a single path segment (does not cross `/`).
   * - `**` — matches any character sequence **across** path segments (crosses `/`).
   * - `?`  — matches any single character except `/`.
   *
   * @param pattern - Glob pattern to match against cache keys.
   * @returns The number of entries removed.
   */
  deleteMatching(pattern: string): number {
    const regex = globToRegex(pattern);
    let count = 0;
    for (const key of [...this._store.keys()]) {
      if (regex.test(key)) {
        this._evict(key, MemorizeEventType.Delete);
        count++;
      }
    }
    return count;
  }

  /**
   * Removes all entries from the cache. Emits a {@link MemorizeEventType.Delete} event
   * for each entry.
   */
  clear(): void {
    for (const key of this._store.keys()) {
      this._evict(key, MemorizeEventType.Delete);
    }
  }

  /**
   * Returns the raw {@link CacheEntry} for the given key without formatting metadata,
   * or `null` if the entry is missing or expired. Used internally by the middleware
   * to serve cached responses.
   *
   * @param key - The cache key to look up.
   * @internal
   */
  getRaw(key: string): CacheEntry | null {
    const entry = this._store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._evict(key, MemorizeEventType.Expire);
      return null;
    }

    return entry;
  }

  private _evict(key: string, reason: MemorizeEventType.Delete | MemorizeEventType.Expire): void {
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key)!);
      this._timers.delete(key);
    }
    this._store.delete(key);
    this._emit(reason, { type: reason, key });
    if (this._store.size === 0) {
      this._emit(MemorizeEventType.Empty, { type: MemorizeEventType.Empty });
    }
  }

  private _emit(event: MemorizeEventType, payload: MemorizeEvent): void {
    for (const handler of this._listeners[event] as Array<(e: MemorizeEvent) => void>) {
      handler(payload);
    }
  }

  private _format(key: string, entry: CacheEntry): CacheInfo {
    return {
      key,
      body: entry.body,
      statusCode: entry.statusCode,
      contentType: entry.contentType,
      expiresAt: entry.expiresAt,
      remainingTtl: entry.expiresAt ? Math.max(0, entry.expiresAt - Date.now()) : null,
    };
  }
}
