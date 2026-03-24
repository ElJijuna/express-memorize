/**
 * The raw data stored for a cached response.
 */
export interface CacheEntry {
  /** The serialized response body, as passed to `res.send()`. */
  body: unknown;
  /** HTTP status code of the cached response (e.g. `200`, `201`). */
  statusCode: number;
  /** Value of the `Content-Type` response header (e.g. `application/json; charset=utf-8`). */
  contentType: string;
  /** Unix timestamp (ms) at which the entry expires, or `null` if it never expires. */
  expiresAt: number | null;
}

/**
 * A cache entry enriched with lookup metadata, returned by {@link Memorize.get} and
 * {@link Memorize.getAll}.
 */
export interface CacheInfo extends CacheEntry {
  /** The cache key — the full request path including query string (e.g. `/users?page=1`). */
  key: string;
  /** Milliseconds remaining until the entry expires. `null` if the entry has no TTL. */
  remainingTtl: number | null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Emitted when a new response is stored in the cache.
 *
 * @example
 * ```ts
 * cache.on('set', (e) => {
 *   console.log(`stored ${e.key} — status ${e.statusCode}`);
 * });
 * ```
 */
export interface MemorizeSetEvent {
  type: 'set';
  /** The cache key (full request URL). */
  key: string;
  /** The stored response body. */
  body: unknown;
  /** HTTP status code of the stored response. */
  statusCode: number;
  /** `Content-Type` header value of the stored response. */
  contentType: string;
  /** Expiry timestamp in ms, or `null` if no TTL was set. */
  expiresAt: number | null;
}

/**
 * Emitted when a cache entry is manually removed via {@link Memorize.delete} or
 * {@link Memorize.clear}.
 *
 * @example
 * ```ts
 * cache.on('delete', (e) => {
 *   console.log(`deleted ${e.key}`);
 * });
 * ```
 */
export interface MemorizeDeleteEvent {
  type: 'delete';
  /** The cache key that was removed. */
  key: string;
}

/**
 * Emitted when a cache entry is automatically removed after its TTL elapses.
 *
 * @example
 * ```ts
 * cache.on('expire', (e) => {
 *   console.log(`expired ${e.key}`);
 * });
 * ```
 */
export interface MemorizeExpireEvent {
  type: 'expire';
  /** The cache key that expired. */
  key: string;
}

/**
 * Emitted when the last entry is removed from the cache, leaving it empty.
 * Triggered after a `'delete'` or `'expire'` eviction.
 *
 * @example
 * ```ts
 * cache.on('empty', () => {
 *   console.log('cache is now empty');
 * });
 * ```
 */
export interface MemorizeEmptyEvent {
  type: 'empty';
}

/** Union of all possible cache events. */
export type MemorizeEvent = MemorizeSetEvent | MemorizeDeleteEvent | MemorizeExpireEvent | MemorizeEmptyEvent;

/** The string literal union of supported event names. */
export type MemorizeEventType = MemorizeEvent['type'];

type ListenerMap = {
  set: Array<(e: MemorizeSetEvent) => void>;
  delete: Array<(e: MemorizeDeleteEvent) => void>;
  expire: Array<(e: MemorizeExpireEvent) => void>;
  empty: Array<(e: MemorizeEmptyEvent) => void>;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Low-level in-memory key-value store with optional TTL and event emission.
 *
 * You do not usually interact with this class directly — use the {@link memorize} factory
 * instead, which wraps this store in an Express middleware.
 */
export class MemorizeStore {
  private _store = new Map<string, CacheEntry>();
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _listeners: ListenerMap = { set: [], delete: [], expire: [], empty: [] };

  /**
   * Registers an event listener.
   *
   * @param event - The event to listen for: `'set'`, `'delete'`, or `'expire'`.
   * @param handler - Callback invoked with the event payload.
   *
   * @example
   * ```ts
   * store.on('set', (e) => console.log('cached', e.key));
   * store.on('expire', (e) => console.log('expired', e.key));
   * ```
   */
  on(event: 'set', handler: (e: MemorizeSetEvent) => void): void;
  on(event: 'delete', handler: (e: MemorizeDeleteEvent) => void): void;
  on(event: 'expire', handler: (e: MemorizeExpireEvent) => void): void;
  on(event: 'empty', handler: (e: MemorizeEmptyEvent) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: MemorizeEventType, handler: (e: any) => void): void {
    this._listeners[event].push(handler);
  }

  /**
   * Stores an entry in the cache.
   *
   * If an entry already exists for the given key its TTL timer is reset and the
   * value is overwritten. Emits a `'set'` event.
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

    this._emit('set', { type: 'set', key, ...entry, expiresAt });

    if (ttl) {
      const timer = setTimeout(() => {
        this._evict(key, 'expire');
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
      this._evict(key, 'expire');
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
        this._evict(key, 'expire');
        continue;
      }
      result[key] = this._format(key, entry);
    }

    return result;
  }

  /**
   * Removes a single entry from the cache. Emits a `'delete'` event.
   *
   * @param key - The cache key to remove.
   * @returns `true` if the entry existed and was removed, `false` otherwise.
   */
  delete(key: string): boolean {
    if (!this._store.has(key)) return false;
    this._evict(key, 'delete');
    return true;
  }

  /**
   * Removes all entries from the cache. Emits a `'delete'` event for each entry.
   */
  clear(): void {
    for (const key of this._store.keys()) {
      this._evict(key, 'delete');
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
      this._evict(key, 'expire');
      return null;
    }

    return entry;
  }

  private _evict(key: string, reason: 'delete' | 'expire'): void {
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key)!);
      this._timers.delete(key);
    }
    this._store.delete(key);
    this._emit(reason, { type: reason, key });
    if (this._store.size === 0) {
      this._emit('empty', { type: 'empty' });
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
