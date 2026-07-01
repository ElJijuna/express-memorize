import type { CacheEntry } from './domain/CacheEntry';
import type { CacheInfo } from './domain/CacheInfo';
import type { MemorizeBatchOptions } from './domain/MemorizeBatchOptions';
import type { MemorizeDeleteEvent } from './domain/MemorizeDeleteEvent';
import type { MemorizeEmptyEvent } from './domain/MemorizeEmptyEvent';
import type { MemorizeEventType } from './domain/MemorizeEventType';
import type { MemorizeEvictEvent } from './domain/MemorizeEvictEvent';
import type { MemorizeExpireEvent } from './domain/MemorizeExpireEvent';
import type { MemorizeSetEvent } from './domain/MemorizeSetEvent';
import type { MemorizeStats } from './domain/MemorizeStats';

export interface MemorizeStoreOptions {
  maxEntries?: number;
  maxValueBytes?: number;
  maxTotalBytes?: number;
  sizeLimitAction?: 'skip' | 'throw';
}

export type StoreEntryInput = Omit<CacheEntry, 'expiresAt' | 'hits' | 'size'> & {
  size?: number;
};

export interface MemorizeStoreLike {
  on(event: MemorizeEventType.Set, handler: (e: MemorizeSetEvent) => void): void;
  on(event: MemorizeEventType.Delete, handler: (e: MemorizeDeleteEvent) => void): void;
  on(event: MemorizeEventType.Expire, handler: (e: MemorizeExpireEvent) => void): void;
  on(event: MemorizeEventType.Empty, handler: (e: MemorizeEmptyEvent) => void): void;
  on(event: MemorizeEventType.Evict, handler: (e: MemorizeEvictEvent) => void): void;
  set(key: string, entry: StoreEntryInput, ttl?: number | null): void;
  get(key: string): CacheInfo | null;
  getAll(): Record<string, CacheInfo>;
  getAllAsync(options?: MemorizeBatchOptions): Promise<Record<string, CacheInfo>>;
  delete(key: string): boolean;
  deleteMatching(pattern: string): number;
  deleteMatchingAsync(pattern: string, options?: MemorizeBatchOptions): Promise<number>;
  clear(): void;
  clearAsync(options?: MemorizeBatchOptions): Promise<number>;
  size(): number;
  byteSize(): number;
  getStats(): MemorizeStats;
  getRaw(key: string): CacheEntry | null;
}
