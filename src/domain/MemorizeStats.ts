/**
 * Aggregate cache statistics returned by {@link Memorize.getStats}.
 */
export interface MemorizeStats {
  /** Number of active (non-expired) cache entries. */
  entries: number;
  /** Configured maximum number of entries, or `null` if unlimited. */
  maxEntries: number | null;
  /** Configured maximum byte size for a single entry, or `null` if unlimited. */
  maxValueBytes: number | null;
  /** Configured maximum byte size for the whole cache, or `null` if unlimited. */
  maxTotalBytes: number | null;
  /** Approximate total byte size of all cached bodies. */
  byteSize: number;
  /** Number of cache lookups that returned a value since this instance was created. */
  hits: number;
  /** Number of cache lookups that found no entry (missing or expired) since this instance was created. */
  misses: number;
  /** `hits / (hits + misses)`, or `null` when no lookups have happened yet. */
  hitRatio: number | null;
}
