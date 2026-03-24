import { MemorizeEventType } from './MemorizeEventType';

/**
 * Emitted when a cache entry is automatically removed after its TTL elapses.
 *
 * @example
 * ```ts
 * cache.on(MemorizeEventType.Expire, (e) => {
 *   console.log(`expired ${e.key}`);
 * });
 * ```
 */
export interface MemorizeExpireEvent {
  type: MemorizeEventType.Expire;
  /** The cache key that expired. */
  key: string;
}
