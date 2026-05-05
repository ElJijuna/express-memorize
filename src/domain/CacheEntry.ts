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
  /** Number of times this entry has been requested (including the initial cache miss). */
  hits: number;
  /** Approximate size of the cached body in bytes. */
  size: number;
}
