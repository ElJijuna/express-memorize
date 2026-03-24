import { MemorizeEventType } from './MemorizeEventType';

/**
 * Emitted when a cache entry is manually removed via {@link Memorize.delete} or
 * {@link Memorize.clear}.
 *
 * @example
 * ```ts
 * cache.on(MemorizeEventType.Delete, (e) => {
 *   console.log(`deleted ${e.key}`);
 * });
 * ```
 */
export interface MemorizeDeleteEvent {
  type: MemorizeEventType.Delete;
  /** The cache key that was removed. */
  key: string;
}
