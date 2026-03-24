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
