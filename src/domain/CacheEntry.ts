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
  /** Unix timestamp (ms) at which the entry expires, or `null` when TTL is `Infinity`. */
  expiresAt: number | null;
  /** Number of times this entry has been requested (including the initial cache miss). */
  hits: number;
  /** Approximate size of the cached body in bytes. */
  size: number;
  /**
   * Unix timestamp (ms) after which the entry is considered stale but still
   * servable while a background refresh runs (stale-while-revalidate).
   * `null` or absent when the entry has no stale window.
   */
  staleAt?: number | null;
  /** Invalidation tags attached to the entry. See `deleteByTag`. */
  tags?: string[];
}
