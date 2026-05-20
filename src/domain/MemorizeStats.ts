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
}
