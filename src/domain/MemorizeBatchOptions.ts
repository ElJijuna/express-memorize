/**
 * Options for cache operations that can yield between batches to reduce
 * event-loop blocking on large stores.
 */
export interface MemorizeBatchOptions {
  /**
   * Number of entries to process before yielding back to the event loop.
   *
   * @defaultValue 1000
   */
  batchSize?: number;
}
