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
   * Omit to use the store's finite default TTL. Pass `Infinity` to cache indefinitely.
   * Can be overridden per-route via {@link MemorizeCallOptions}.
   */
  ttl?: number;

  /**
   * Maximum number of entries the cache may hold at any time.
   *
   * When the limit is reached, the least-recently-used (LRU) entry is evicted
   * before the new one is stored. Omit for an unlimited cache.
   *
   * @example
   * ```ts
   * const cache = memorize({ maxEntries: 1_000 });
   * ```
   */
  maxEntries?: number;
}
