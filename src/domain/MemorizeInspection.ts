import type { CacheInfo } from './CacheInfo';
import type { MemorizeBatchOptions } from './MemorizeBatchOptions';

/** Cache entry metadata safe to return from monitoring endpoints. */
export type MemorizeEntryMetadata = Omit<CacheInfo, 'body'>;

/** Options for a bounded, cooperative cache inspection. */
export interface MemorizeInspectionOptions extends MemorizeBatchOptions {
  /** Zero-based number of active entries to skip. @defaultValue 0 */
  offset?: number;
  /** Maximum number of entries to return (up to 1000). @defaultValue 100 */
  limit?: number;
}

/** A page of cache metadata. Bodies are deliberately excluded. */
export interface MemorizeInspectionPage {
  entries: MemorizeEntryMetadata[];
  /** Offset for the next page, or `null` when this is the last page. */
  nextOffset: number | null;
}
