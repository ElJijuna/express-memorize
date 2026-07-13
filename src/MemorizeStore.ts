import { clearTimeout as timerClearTimeout, setTimeout as timerSetTimeout } from 'node:timers';
import type { CacheEntry } from './domain/CacheEntry';
import type { CacheInfo } from './domain/CacheInfo';
import type { MemorizeBatchOptions } from './domain/MemorizeBatchOptions';
import type { MemorizeDeleteEvent } from './domain/MemorizeDeleteEvent';
import type { MemorizeEmptyEvent } from './domain/MemorizeEmptyEvent';
import type { MemorizeEvent } from './domain/MemorizeEvent';
import { MemorizeEventType } from './domain/MemorizeEventType';
import type { MemorizeEvictEvent } from './domain/MemorizeEvictEvent';
import type { MemorizeExpireEvent } from './domain/MemorizeExpireEvent';
import type { MemorizeSetEvent } from './domain/MemorizeSetEvent';
import type { MemorizeStats } from './domain/MemorizeStats';
import type { MemorizeStoreLike, MemorizeStoreOptions, StoreEntryInput } from './MemorizeStoreLike';
import { estimateByteSize } from './utils/byteSize';
import { yieldToEventLoop } from './utils/eventLoop';
import { ExpiryHeap, type ExpiryHeapNode } from './utils/expiryHeap';
import { globToRegex } from './utils/globToRegex';

export type {
  CacheEntry,
  CacheInfo,
  MemorizeDeleteEvent,
  MemorizeEmptyEvent,
  MemorizeEvent,
  MemorizeEvictEvent,
  MemorizeExpireEvent,
  MemorizeSetEvent,
  MemorizeStats,
};
export { MemorizeEventType };

type ListenerMap = {
  [MemorizeEventType.Set]: Array<(e: MemorizeSetEvent) => void>;
  [MemorizeEventType.Delete]: Array<(e: MemorizeDeleteEvent) => void>;
  [MemorizeEventType.Expire]: Array<(e: MemorizeExpireEvent) => void>;
  [MemorizeEventType.Empty]: Array<(e: MemorizeEmptyEvent) => void>;
  [MemorizeEventType.Evict]: Array<(e: MemorizeEvictEvent) => void>;
};

const DEFAULT_TTL = 60_000;
const DEFAULT_BATCH_SIZE = 1_000;

export function normalizeTtl(ttl?: number | null): { expiresAt: number | null } {
  if (ttl === Infinity) {
    return { expiresAt: null };
  }

  const effectiveTtl = ttl ?? DEFAULT_TTL;

  if (
    typeof effectiveTtl !== 'number' ||
    Number.isNaN(effectiveTtl) ||
    !Number.isFinite(effectiveTtl)
  ) {
    throw new TypeError('ttl must be a finite number or Infinity');
  }

  if (effectiveTtl < 0) {
    throw new RangeError('ttl must be greater than or equal to 0');
  }

  return { expiresAt: Date.now() + effectiveTtl };
}

export function normalizeBatchSize(options?: MemorizeBatchOptions): number {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new RangeError('batchSize must be a positive integer');
  }

  return batchSize;
}

export function normalizeByteLimit(name: string, value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be greater than or equal to 0`);
  }

  return value;
}

/**
 * Low-level in-memory key-value store with optional TTL, LRU eviction, and event emission.
 *
 * You do not usually interact with this class directly — use the {@link memorize} factory
 * instead, which wraps this store in an Express middleware.
 */
export class MemorizeStore implements MemorizeStoreLike {
  private _store = new Map<string, CacheEntry>();
  private _expiryHeap = new ExpiryHeap();
  private _expiryTimer: ReturnType<typeof timerSetTimeout> | null = null;
  private _nextExpiryAt: number | null = null;
  private _nextExpiryKey: string | null = null;
  private _totalByteSize = 0;
  private _listeners: ListenerMap = {
    [MemorizeEventType.Set]: [],
    [MemorizeEventType.Delete]: [],
    [MemorizeEventType.Expire]: [],
    [MemorizeEventType.Empty]: [],
    [MemorizeEventType.Evict]: [],
  };

  private readonly _maxEntries?: number;
  private readonly _maxValueBytes?: number;
  private readonly _maxTotalBytes?: number;
  private readonly _sizeLimitAction: 'skip' | 'throw';

  constructor(maxEntriesOrOptions?: number | MemorizeStoreOptions) {
    const options =
      typeof maxEntriesOrOptions === 'number'
        ? { maxEntries: maxEntriesOrOptions }
        : (maxEntriesOrOptions ?? {});

    this._maxEntries = options.maxEntries;
    this._maxValueBytes = normalizeByteLimit('maxValueBytes', options.maxValueBytes);
    this._maxTotalBytes = normalizeByteLimit('maxTotalBytes', options.maxTotalBytes);
    this._sizeLimitAction = options.sizeLimitAction ?? 'skip';
  }

  /**
   * Registers an event listener.
   *
   * @param event - The event to listen for.
   * @param handler - Callback invoked with the event payload.
   *
   * @example
   * ```ts
   * store.on(MemorizeEventType.Set,   (e) => console.log('cached',  e.key));
   * store.on(MemorizeEventType.Evict, (e) => console.log('evicted', e.key));
   * ```
   */
  on(event: MemorizeEventType.Set, handler: (e: MemorizeSetEvent) => void): void;
  on(event: MemorizeEventType.Delete, handler: (e: MemorizeDeleteEvent) => void): void;
  on(event: MemorizeEventType.Expire, handler: (e: MemorizeExpireEvent) => void): void;
  on(event: MemorizeEventType.Empty, handler: (e: MemorizeEmptyEvent) => void): void;
  on(event: MemorizeEventType.Evict, handler: (e: MemorizeEvictEvent) => void): void;
  on(event: MemorizeEventType, handler: (e: never) => void): void {
    const listeners = this._listeners[event] as Array<(e: never) => void>;

    listeners.push(handler);
  }

  /**
   * Stores an entry in the cache.
   *
   * If an entry already exists for the given key its TTL timer is reset and the
   * value is overwritten. If `maxEntries` is configured and the store is full,
   * the least-recently-used entry is evicted first. Emits a {@link MemorizeEventType.Set} event.
   *
   * @param key - The cache key (typically `req.originalUrl`).
   * @param entry - The response data to store.
   * @param ttl - Time-to-live in milliseconds. Omit or pass `null` to use the default TTL.
   * Pass `Infinity` for no expiry.
   */
  set(key: string, entry: StoreEntryInput, ttl?: number | null): void {
    const size = entry.size ?? estimateByteSize(entry.body);
    const existing = this._store.get(key);

    if (!this._canStoreSize(size, this._maxValueBytes, 'maxValueBytes')) {
      return;
    }

    if (!this._canStoreSize(size, this._maxTotalBytes, 'maxTotalBytes')) {
      return;
    }

    const removed = existing ? this._removeStoredEntry(key) : null;

    if (this._maxEntries && this._store.size >= this._maxEntries) {
      this._evictLRU();
    }

    while (
      this._maxTotalBytes !== undefined &&
      this._totalByteSize + size > this._maxTotalBytes &&
      this._store.size > 0
    ) {
      this._evictLRU();
    }

    const { expiresAt } = normalizeTtl(ttl);
    const stored: CacheEntry = { ...entry, expiresAt, hits: 1, size };

    this._store.set(key, stored);
    this._totalByteSize += size;

    if (expiresAt !== null) {
      this._expiryHeap.push(key, expiresAt);

      // Stale nodes from overwritten or deleted entries accumulate until popped;
      // rebuild once they outnumber live entries to bound heap memory.
      if (this._expiryHeap.length > this._store.size * 2 + 16) {
        this._rebuildExpiryHeap();
      }
    }

    this._emit(MemorizeEventType.Set, {
      type: MemorizeEventType.Set,
      key,
      ...entry,
      expiresAt,
      size,
    });

    if (removed && key === this._nextExpiryKey) {
      this._scheduleNextExpiry();
    }

    this._scheduleExpiryFor(key, expiresAt);
  }

  /**
   * Returns the formatted {@link CacheInfo} for the given key, or `null` if the
   * key does not exist or its TTL has elapsed.
   *
   * @param key - The cache key to look up.
   */
  get(key: string): CacheInfo | null {
    const entry = this._store.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
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

    let expired = false;

    for (const [key, entry] of this._store) {
      if (entry.expiresAt && Date.now() >= entry.expiresAt) {
        expired = this._evictExpiredEntry(key) || expired;
        continue;
      }

      result[key] = this._format(key, entry);
    }

    if (expired) {
      this._scheduleNextExpiry();
    }

    return result;
  }

  /**
   * Async variant of {@link getAll} that yields between batches to reduce
   * event-loop blocking on large stores.
   *
   * @param options - Batch options.
   * @returns All active cache entries keyed by cache key.
   */
  async getAllAsync(options?: MemorizeBatchOptions): Promise<Record<string, CacheInfo>> {
    const batchSize = normalizeBatchSize(options);
    const result: Record<string, CacheInfo> = {};

    let scanned = 0;
    let expired = false;

    for (const [key, entry] of this._store) {
      if (entry.expiresAt && Date.now() >= entry.expiresAt) {
        expired = this._evictExpiredEntry(key) || expired;
      } else {
        result[key] = this._format(key, entry);
      }

      scanned++;

      if (scanned % batchSize === 0) {
        await yieldToEventLoop();
      }
    }

    if (expired) {
      this._scheduleNextExpiry();
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
    if (!this._store.has(key)) {
      return false;
    }

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
   * Async variant of {@link deleteMatching} that yields between batches to
   * reduce event-loop blocking on large stores.
   *
   * @param pattern - Glob pattern to match against cache keys.
   * @param options - Batch options.
   * @returns The number of entries removed.
   */
  async deleteMatchingAsync(pattern: string, options?: MemorizeBatchOptions): Promise<number> {
    const regex = globToRegex(pattern);
    const batchSize = normalizeBatchSize(options);

    let count = 0;
    let scanned = 0;

    for (const key of this._store.keys()) {
      if (regex.test(key) && this._store.has(key)) {
        this._evict(key, MemorizeEventType.Delete);
        count++;
      }

      scanned++;

      if (scanned % batchSize === 0) {
        await yieldToEventLoop();
      }
    }

    return count;
  }

  /**
   * Removes all entries from the cache. Emits a {@link MemorizeEventType.Delete} event
   * for each entry.
   */
  clear(): void {
    for (const key of [...this._store.keys()]) {
      this._evict(key, MemorizeEventType.Delete);
    }
  }

  /**
   * Async variant of {@link clear} that yields between batches to reduce
   * event-loop blocking on large stores.
   *
   * @param options - Batch options.
   * @returns The number of entries removed.
   */
  async clearAsync(options?: MemorizeBatchOptions): Promise<number> {
    const batchSize = normalizeBatchSize(options);

    let count = 0;

    while (this._store.size > 0) {
      const keys = this._takeKeys(batchSize);

      if (keys.length === 0) {
        break;
      }

      for (const key of keys) {
        if (this._store.has(key)) {
          this._evict(key, MemorizeEventType.Delete);
          count++;
        }
      }

      if (this._store.size > 0) {
        await yieldToEventLoop();
      }
    }

    return count;
  }

  private _takeKeys(limit: number): string[] {
    const keys: string[] = [];

    for (const key of this._store.keys()) {
      keys.push(key);

      if (keys.length >= limit) {
        break;
      }
    }

    return keys;
  }

  /**
   * Returns the number of active cache entries.
   */
  size(): number {
    return this._store.size;
  }

  /**
   * Returns the approximate total byte size of all cached bodies.
   *
   * The value is an estimate and may not reflect actual memory usage.
   */
  byteSize(): number {
    return this._totalByteSize;
  }

  /**
   * Returns aggregate cache statistics.
   */
  getStats(): MemorizeStats {
    return {
      entries: this._store.size,
      maxEntries: this._maxEntries ?? null,
      maxValueBytes: this._maxValueBytes ?? null,
      maxTotalBytes: this._maxTotalBytes ?? null,
      byteSize: this._totalByteSize,
    };
  }

  /**
   * Returns the raw {@link CacheEntry} for the given key without formatting metadata,
   * or `null` if the entry is missing or expired. Used internally by the middleware
   * to serve cached responses. Updates LRU order and increments the hit counter.
   *
   * @param key - The cache key to look up.
   * @internal
   */
  getRaw(key: string): CacheEntry | null {
    const entry = this._store.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt && Date.now() >= entry.expiresAt) {
      this._evict(key, MemorizeEventType.Expire);

      return null;
    }

    // Move to most-recently-used position for LRU eviction
    this._store.delete(key);
    this._store.set(key, entry);

    entry.hits++;

    return entry;
  }

  private _evictLRU(): void {
    const firstKey = this._store.keys().next().value as string | undefined;

    if (firstKey !== undefined) {
      this._evict(firstKey, MemorizeEventType.Evict);
    }
  }

  private _canStoreSize(size: number, limit: number | undefined, limitName: string): boolean {
    if (limit === undefined || size <= limit) {
      return true;
    }

    if (this._sizeLimitAction === 'throw') {
      throw new RangeError(`${limitName} exceeded`);
    }

    return false;
  }

  private _removeStoredEntry(key: string): CacheEntry | null {
    const entry = this._store.get(key);

    if (!entry) {
      return null;
    }

    this._totalByteSize = Math.max(0, this._totalByteSize - entry.size);
    this._store.delete(key);

    return entry;
  }

  private _evict(
    key: string,
    reason: MemorizeEventType.Delete | MemorizeEventType.Expire | MemorizeEventType.Evict,
  ): void {
    const removed = this._removeStoredEntry(key);

    this._emit(reason, { type: reason, key });

    if (removed && this._store.size === 0) {
      this._expiryHeap.clear();
      this._emit(MemorizeEventType.Empty, { type: MemorizeEventType.Empty });
    }

    if (removed) {
      this._scheduleAfterRemoval(removed, key);
    }
  }

  private _scheduleAfterRemoval(_removed: CacheEntry, key: string): void {
    if (key === this._nextExpiryKey) {
      this._scheduleNextExpiry();
    }
  }

  private _scheduleNextExpiry(): void {
    const next = this._findNextExpiry();

    this._scheduleExpiryAt(next?.key ?? null, next?.expiresAt ?? null);
  }

  private _scheduleExpiryFor(key: string, expiresAt: number | null): void {
    if (expiresAt === null) {
      return;
    }

    if (this._nextExpiryAt !== null && expiresAt >= this._nextExpiryAt) {
      return;
    }

    this._scheduleExpiryAt(key, expiresAt);
  }

  private _scheduleExpiryAt(nextExpiryKey: string | null, nextExpiryAt: number | null): void {
    if (nextExpiryKey === this._nextExpiryKey && nextExpiryAt === this._nextExpiryAt) {
      return;
    }

    this._clearExpiryTimer();
    this._nextExpiryKey = nextExpiryKey;
    this._nextExpiryAt = nextExpiryAt;

    if (nextExpiryAt === null) {
      return;
    }

    const delay = Math.max(0, nextExpiryAt - Date.now());
    const timer = (globalThis.setTimeout ?? timerSetTimeout)(() => {
      this._expiryTimer = null;
      this._nextExpiryKey = null;
      this._nextExpiryAt = null;
      this._evictExpiredEntries();
    }, delay);

    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }

    this._expiryTimer = timer;
  }

  private _clearExpiryTimer(): void {
    if (!this._expiryTimer) {
      return;
    }

    (globalThis.clearTimeout ?? timerClearTimeout)(this._expiryTimer);
    this._expiryTimer = null;
  }

  private _findNextExpiry(): ExpiryHeapNode | null {
    for (;;) {
      const top = this._expiryHeap.peek();

      if (!top) {
        return null;
      }

      if (this._store.get(top.key)?.expiresAt === top.expiresAt) {
        return top;
      }

      this._expiryHeap.pop();
    }
  }

  private _rebuildExpiryHeap(): void {
    const nodes: ExpiryHeapNode[] = [];

    for (const [key, entry] of this._store) {
      if (entry.expiresAt !== null) {
        nodes.push({ key, expiresAt: entry.expiresAt });
      }
    }

    this._expiryHeap.rebuild(nodes);
  }

  private _evictExpiredEntries(): void {
    const now = Date.now();

    for (;;) {
      const top = this._expiryHeap.peek();

      if (!top || top.expiresAt > now) {
        break;
      }

      this._expiryHeap.pop();

      if (this._store.get(top.key)?.expiresAt === top.expiresAt) {
        this._evictExpiredEntry(top.key);
      }
    }

    this._scheduleNextExpiry();
  }

  private _evictExpiredEntry(key: string): boolean {
    const removed = this._removeStoredEntry(key);

    if (!removed) {
      return false;
    }

    this._emit(MemorizeEventType.Expire, { type: MemorizeEventType.Expire, key });

    if (this._store.size === 0) {
      this._expiryHeap.clear();
      this._emit(MemorizeEventType.Empty, { type: MemorizeEventType.Empty });
    }

    return true;
  }

  private _emit(event: MemorizeEventType, payload: MemorizeEvent): void {
    for (const handler of this._listeners[event] as Array<(e: MemorizeEvent) => void>) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[express-memorize] "${event}" event listener threw`, error);
      }
    }
  }

  private _format(key: string, entry: CacheEntry): CacheInfo {
    return {
      key,
      body: entry.body,
      statusCode: entry.statusCode,
      contentType: entry.contentType,
      expiresAt: entry.expiresAt,
      hits: entry.hits,
      size: entry.size,
      remainingTtl: entry.expiresAt ? Math.max(0, entry.expiresAt - Date.now()) : null,
    };
  }
}
