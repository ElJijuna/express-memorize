import type { SerializerOption } from '../serializer';

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

  /**
   * Serializer used by {@link Memorize.set} and {@link Memorize.getValue}.
   *
   * - `'auto'` (default) — uses `node:v8` when available, falls back to JSON silently.
   * - `'json'` — always uses `JSON.stringify` / `JSON.parse` (edge-runtime safe, human-readable).
   * - `'v8'`  — always uses `node:v8`; throws at construction if not available.
   * - Custom object — `{ serialize(v): string | Buffer; deserialize(d): unknown }`.
   *
   * HTTP middleware caching (Express, Hono, Fastify, etc.) is not affected by this option.
   *
   * @example
   * ```ts
   * const cache = memorize({ serializer: 'v8' });  // opt-in to faster v8 serialization
   * ```
   */
  serializer?: SerializerOption;
}
