import { MemorizeEventType } from './MemorizeEventType';

/**
 * Emitted when an entry is automatically removed because the cache reached
 * its `maxEntries` limit.
 *
 * @example
 * ```ts
 * cache.on(MemorizeEventType.Evict, (e) => {
 *   console.log(`evicted ${e.key} to make room`);
 * });
 * ```
 */
export interface MemorizeEvictEvent {
  type: MemorizeEventType.Evict;
  /** The cache key that was evicted. */
  key: string;
}
