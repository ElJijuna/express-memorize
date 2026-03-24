import { MemorizeEventType } from './MemorizeEventType';

/**
 * Emitted when the last entry is removed from the cache, leaving it empty.
 * Triggered after a `delete` or `expire` eviction.
 *
 * @example
 * ```ts
 * cache.on(MemorizeEventType.Empty, () => {
 *   console.log('cache is now empty');
 * });
 * ```
 */
export interface MemorizeEmptyEvent {
  type: MemorizeEventType.Empty;
}
