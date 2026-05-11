import { CacheEntry } from './CacheEntry';

/**
 * A cache entry enriched with lookup metadata, returned by {@link Memorize.get} and
 * {@link Memorize.getAll}.
 */
export interface CacheInfo extends CacheEntry {
  /** The cache key — the full request path including query string (e.g. `/users?page=1`). */
  key: string;
  /** Milliseconds remaining until the entry expires. `null` when TTL is `Infinity`. */
  remainingTtl: number | null;
}
