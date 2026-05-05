import { MemorizeEventType } from './MemorizeEventType';

/**
 * Emitted when a new response is stored in the cache.
 *
 * @example
 * ```ts
 * cache.on(MemorizeEventType.Set, (e) => {
 *   console.log(`stored ${e.key} — status ${e.statusCode}`);
 * });
 * ```
 */
export interface MemorizeSetEvent {
  type: MemorizeEventType.Set;
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
  /** Approximate byte size of the cached body. */
  size: number;
}
