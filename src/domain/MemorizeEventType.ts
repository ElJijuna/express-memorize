/**
 * Enum of all supported cache event types.
 *
 * @example
 * ```ts
 * cache.on(MemorizeEventType.Set,    (e) => console.log('stored',  e.key));
 * cache.on(MemorizeEventType.Delete, (e) => console.log('deleted', e.key));
 * cache.on(MemorizeEventType.Expire, (e) => console.log('expired', e.key));
 * cache.on(MemorizeEventType.Empty,  ()  => console.log('cache is empty'));
 * ```
 */
export enum MemorizeEventType {
  /** Fired when a response is stored in the cache. */
  Set = 'set',
  /** Fired when an entry is manually removed via `delete()` or `clear()`. */
  Delete = 'delete',
  /** Fired when an entry is automatically removed after its TTL elapses. */
  Expire = 'expire',
  /** Fired when the last entry is removed, leaving the cache empty. */
  Empty = 'empty',
  /** Fired when an entry is automatically removed because `maxEntries` was reached. */
  Evict = 'evict',
}
