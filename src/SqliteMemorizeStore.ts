import { clearTimeout as timerClearTimeout, setTimeout as timerSetTimeout } from 'node:timers';
import type { CacheEntry } from './domain/CacheEntry';
import type { CacheInfo } from './domain/CacheInfo';
import type { MemorizeBatchOptions } from './domain/MemorizeBatchOptions';
import type { MemorizeDeleteEvent } from './domain/MemorizeDeleteEvent';
import type { MemorizeEmptyEvent } from './domain/MemorizeEmptyEvent';
import type { MemorizeEvent } from './domain/MemorizeEvent';
import { MemorizeEventType } from './domain/MemorizeEventType';
import type { MemorizeEvictEvent } from './domain/MemorizeEvictEvent';
import type { MemorizeExpireEvent } from './domain/MemorizeExpireEvent';
import type { MemorizeSetEvent } from './domain/MemorizeSetEvent';
import type { MemorizeStats } from './domain/MemorizeStats';
import { normalizeBatchSize, normalizeByteLimit, normalizeTtl } from './MemorizeStore';
import type { MemorizeStoreLike, MemorizeStoreOptions, StoreEntryInput } from './MemorizeStoreLike';
import { estimateByteSize } from './utils/byteSize';
import { yieldToEventLoop } from './utils/eventLoop';
import { globToRegex } from './utils/globToRegex';

type DatabaseSyncConstructor = new (path: string) => SqliteDatabase;

interface V8Serializer {
  serialize(value: unknown): Buffer;
  deserialize(data: Buffer): unknown;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteStatement {
  all(...values: unknown[]): unknown[];
  get(...values: unknown[]): unknown;
  run(...values: unknown[]): { changes?: number };
}

type ListenerMap = {
  [MemorizeEventType.Set]: Array<(e: MemorizeSetEvent) => void>;
  [MemorizeEventType.Delete]: Array<(e: MemorizeDeleteEvent) => void>;
  [MemorizeEventType.Expire]: Array<(e: MemorizeExpireEvent) => void>;
  [MemorizeEventType.Empty]: Array<(e: MemorizeEmptyEvent) => void>;
  [MemorizeEventType.Evict]: Array<(e: MemorizeEvictEvent) => void>;
};

type BodyEncoding = 'buffer' | 'string' | 'v8';

interface StoredRow {
  key: string;
  body: Buffer | Uint8Array | string;
  body_encoding: BodyEncoding;
  status_code: number;
  content_type: string;
  expires_at: number | null;
  hits: number;
  size: number;
  last_accessed: number;
  stale_at: number | null;
  tags: string | null;
}

export const SQLITE_STORAGE_WARNING =
  '[express-memorize] SQLite storage requires Node.js 24 or newer. Falling back to in-memory storage.';

export interface SqliteMemorizeStoreOptions extends MemorizeStoreOptions {
  directory?: string;
}

export function canUseNativeSqlite(): boolean {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return false;
  }

  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);

  if (major < 24) {
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:sqlite');

    return true;
  } catch {
    return false;
  }
}

function loadDatabaseSync(): DatabaseSyncConstructor {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sqlite = require('node:sqlite') as { DatabaseSync: DatabaseSyncConstructor };

  return sqlite.DatabaseSync;
}

function loadV8Serializer(): V8Serializer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:v8') as V8Serializer;
}

function encodeBody(body: unknown): { body: Buffer | string; bodyEncoding: BodyEncoding } {
  if (Buffer.isBuffer(body)) {
    return { body, bodyEncoding: 'buffer' };
  }

  if (typeof body === 'string') {
    return { body, bodyEncoding: 'string' };
  }

  return { body: loadV8Serializer().serialize(body), bodyEncoding: 'v8' };
}

function decodeBody(body: Buffer | Uint8Array | string, bodyEncoding: BodyEncoding): unknown {
  if (bodyEncoding === 'string') {
    return typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
  }

  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

  if (bodyEncoding === 'buffer') {
    return buffer;
  }

  return loadV8Serializer().deserialize(buffer);
}

export class SqliteMemorizeStore implements MemorizeStoreLike {
  private readonly _db: SqliteDatabase;
  private readonly _statements = new Map<string, SqliteStatement>();
  private readonly _maxEntries?: number;
  private readonly _maxValueBytes?: number;
  private readonly _maxTotalBytes?: number;
  private readonly _sizeLimitAction: 'skip' | 'throw';
  private _accessCounter = Date.now();
  private _hits = 0;
  private _misses = 0;
  private _expiryTimer: ReturnType<typeof timerSetTimeout> | null = null;
  private _nextExpiryAt: number | null = null;
  private _nextExpiryKey: string | null = null;
  private _listeners: ListenerMap = {
    [MemorizeEventType.Set]: [],
    [MemorizeEventType.Delete]: [],
    [MemorizeEventType.Expire]: [],
    [MemorizeEventType.Empty]: [],
    [MemorizeEventType.Evict]: [],
  };

  constructor(options: SqliteMemorizeStoreOptions = {}) {
    const directory = options.directory ?? 'database';
    const DatabaseSync = loadDatabaseSync();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mkdirSync } = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('node:path') as typeof import('node:path');

    mkdirSync(directory, { recursive: true });

    this._db = new DatabaseSync(join(directory, 'express-memorize.sqlite'));
    this._maxEntries = options.maxEntries;
    this._maxValueBytes = normalizeByteLimit('maxValueBytes', options.maxValueBytes);
    this._maxTotalBytes = normalizeByteLimit('maxTotalBytes', options.maxTotalBytes);
    this._sizeLimitAction = options.sizeLimitAction ?? 'skip';

    this._db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        body BLOB NOT NULL,
        body_encoding TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        expires_at INTEGER NULL,
        hits INTEGER NOT NULL,
        size INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        stale_at INTEGER NULL,
        tags TEXT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_last_accessed ON cache_entries(last_accessed);
    `);
    this._migrate();
    this._accessCounter = Math.max(Date.now(), this._maxLastAccessed());
    this._scheduleNextExpiry();
  }

  /** Adds columns introduced after the first release to databases created by older versions. */
  private _migrate(): void {
    for (const column of ['stale_at INTEGER NULL', 'tags TEXT NULL']) {
      try {
        this._db.exec(`ALTER TABLE cache_entries ADD COLUMN ${column}`);
      } catch {
        // Column already exists.
      }
    }
  }

  on(event: MemorizeEventType.Set, handler: (e: MemorizeSetEvent) => void): () => void;
  on(event: MemorizeEventType.Delete, handler: (e: MemorizeDeleteEvent) => void): () => void;
  on(event: MemorizeEventType.Expire, handler: (e: MemorizeExpireEvent) => void): () => void;
  on(event: MemorizeEventType.Empty, handler: (e: MemorizeEmptyEvent) => void): () => void;
  on(event: MemorizeEventType.Evict, handler: (e: MemorizeEvictEvent) => void): () => void;
  on(event: MemorizeEventType, handler: (e: never) => void): () => void {
    const listeners = this._listeners[event] as Array<(e: never) => void>;

    listeners.push(handler);

    return () => this._off(event, handler);
  }

  off(event: MemorizeEventType.Set, handler: (e: MemorizeSetEvent) => void): void;
  off(event: MemorizeEventType.Delete, handler: (e: MemorizeDeleteEvent) => void): void;
  off(event: MemorizeEventType.Expire, handler: (e: MemorizeExpireEvent) => void): void;
  off(event: MemorizeEventType.Empty, handler: (e: MemorizeEmptyEvent) => void): void;
  off(event: MemorizeEventType.Evict, handler: (e: MemorizeEvictEvent) => void): void;
  off(event: MemorizeEventType, handler: (e: never) => void): void {
    this._off(event, handler);
  }

  private _off(event: MemorizeEventType, handler: (e: never) => void): void {
    const listeners = this._listeners[event] as Array<(e: never) => void>;
    const index = listeners.indexOf(handler);

    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  set(key: string, entry: StoreEntryInput, ttl?: number | null): void {
    const size = entry.size ?? estimateByteSize(entry.body);

    if (!this._canStoreSize(size, this._maxValueBytes, 'maxValueBytes')) {
      return;
    }

    if (!this._canStoreSize(size, this._maxTotalBytes, 'maxTotalBytes')) {
      return;
    }

    const removed = this._deleteRow(key);

    if (this._maxEntries && this._countRows() >= this._maxEntries) {
      this._evictLRU();
    }

    while (
      this._maxTotalBytes !== undefined &&
      this._sumByteSize() + size > this._maxTotalBytes &&
      this._countRows() > 0
    ) {
      this._evictLRU();
    }

    const { expiresAt } = normalizeTtl(ttl);
    const encoded = encodeBody(entry.body);

    this._prepare(
      `
        INSERT OR REPLACE INTO cache_entries
          (key, body, body_encoding, status_code, content_type, expires_at, hits, size, last_accessed, stale_at, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      key,
      encoded.body,
      encoded.bodyEncoding,
      entry.statusCode,
      entry.contentType,
      expiresAt,
      1,
      size,
      this._nextAccessed(),
      entry.staleAt ?? null,
      entry.tags && entry.tags.length > 0 ? JSON.stringify(entry.tags) : null,
    );

    this._emit(MemorizeEventType.Set, {
      type: MemorizeEventType.Set,
      key,
      ...entry,
      expiresAt,
      size,
    });

    if (removed && key === this._nextExpiryKey) {
      this._scheduleNextExpiry();
    }

    this._scheduleExpiryFor(key, expiresAt);
  }

  get(key: string): CacheInfo | null {
    const entry = this._getActiveEntry(key, false);

    if (!entry) {
      return null;
    }

    return this._format(key, entry);
  }

  getAll(): Record<string, CacheInfo> {
    this._evictExpiredEntries();

    const result: Record<string, CacheInfo> = {};
    const rows = this._prepare('SELECT * FROM cache_entries ORDER BY last_accessed ASC').all();

    for (const row of rows) {
      const stored = row as StoredRow;
      const entry = this._rowToEntry(stored);

      result[stored.key] = this._format(stored.key, entry);
    }

    return result;
  }

  async getAllAsync(options?: MemorizeBatchOptions): Promise<Record<string, CacheInfo>> {
    const batchSize = normalizeBatchSize(options);
    const result: Record<string, CacheInfo> = {};
    const rows = this._prepare('SELECT * FROM cache_entries ORDER BY last_accessed ASC').all();

    let scanned = 0;
    let expired = false;

    for (const row of rows) {
      const stored = row as StoredRow;

      if (stored.expires_at && Date.now() >= stored.expires_at) {
        expired = this._evictExpiredEntry(stored.key) || expired;
      } else {
        const entry = this._rowToEntry(stored);

        result[stored.key] = this._format(stored.key, entry);
      }

      scanned++;

      if (scanned % batchSize === 0) {
        await yieldToEventLoop();
      }
    }

    if (expired) {
      this._scheduleNextExpiry();
    }

    return result;
  }

  delete(key: string): boolean {
    if (!this._hasRow(key)) {
      return false;
    }

    this._evict(key, MemorizeEventType.Delete);

    return true;
  }

  deleteMatching(pattern: string): number {
    const regex = globToRegex(pattern);
    const keys = this._keys();

    let count = 0;

    for (const key of keys) {
      if (regex.test(key)) {
        this._evict(key, MemorizeEventType.Delete);
        count++;
      }
    }

    return count;
  }

  async deleteMatchingAsync(pattern: string, options?: MemorizeBatchOptions): Promise<number> {
    const regex = globToRegex(pattern);
    const batchSize = normalizeBatchSize(options);
    const keys = this._keys();

    let count = 0;
    let scanned = 0;

    for (const key of keys) {
      if (regex.test(key) && this._hasRow(key)) {
        this._evict(key, MemorizeEventType.Delete);
        count++;
      }

      scanned++;

      if (scanned % batchSize === 0) {
        await yieldToEventLoop();
      }
    }

    return count;
  }

  clear(): void {
    for (const key of this._keys()) {
      this._evict(key, MemorizeEventType.Delete);
    }
  }

  async clearAsync(options?: MemorizeBatchOptions): Promise<number> {
    const batchSize = normalizeBatchSize(options);

    let count = 0;

    while (this._countRows() > 0) {
      const keys = this._keys(batchSize);

      if (keys.length === 0) {
        break;
      }

      for (const key of keys) {
        if (this._hasRow(key)) {
          this._evict(key, MemorizeEventType.Delete);
          count++;
        }
      }

      if (this._countRows() > 0) {
        await yieldToEventLoop();
      }
    }

    return count;
  }

  size(): number {
    this._evictExpiredEntries();

    return this._countRows();
  }

  byteSize(): number {
    this._evictExpiredEntries();

    return this._sumByteSize();
  }

  getStats(): MemorizeStats {
    this._evictExpiredEntries();

    const lookups = this._hits + this._misses;

    return {
      entries: this._countRows(),
      maxEntries: this._maxEntries ?? null,
      maxValueBytes: this._maxValueBytes ?? null,
      maxTotalBytes: this._maxTotalBytes ?? null,
      byteSize: this._sumByteSize(),
      hits: this._hits,
      misses: this._misses,
      hitRatio: lookups === 0 ? null : this._hits / lookups,
    };
  }

  getRaw(key: string): CacheEntry | null {
    const entry = this._getActiveEntry(key, true);

    if (entry) {
      this._hits++;
    } else {
      this._misses++;
    }

    return entry;
  }

  private _getActiveEntry(key: string, touch: boolean): CacheEntry | null {
    const row = this._getRow(key);

    if (!row) {
      return null;
    }

    if (row.expires_at && Date.now() >= row.expires_at) {
      this._evict(key, MemorizeEventType.Expire);

      return null;
    }

    const entry = this._rowToEntry(row);

    if (touch) {
      entry.hits++;
      this._prepare('UPDATE cache_entries SET hits = ?, last_accessed = ? WHERE key = ?').run(
        entry.hits,
        this._nextAccessed(),
        key,
      );
    }

    return entry;
  }

  private _prepare(sql: string): SqliteStatement {
    let statement = this._statements.get(sql);

    if (!statement) {
      statement = this._db.prepare(sql);
      this._statements.set(sql, statement);
    }

    return statement;
  }

  private _getRow(key: string): StoredRow | null {
    return (
      (this._prepare('SELECT * FROM cache_entries WHERE key = ?').get(key) as StoredRow | null) ??
      null
    );
  }

  private _hasRow(key: string): boolean {
    return this._prepare('SELECT 1 FROM cache_entries WHERE key = ?').get(key) !== undefined;
  }

  private _rowToEntry(row: StoredRow): CacheEntry {
    return {
      body: decodeBody(row.body, row.body_encoding),
      statusCode: row.status_code,
      contentType: row.content_type,
      expiresAt: row.expires_at,
      hits: row.hits,
      size: row.size,
      staleAt: row.stale_at ?? null,
      tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
    };
  }

  private _keys(limit?: number): string[] {
    const sql =
      limit === undefined
        ? 'SELECT key FROM cache_entries ORDER BY last_accessed ASC'
        : 'SELECT key FROM cache_entries ORDER BY last_accessed ASC LIMIT ?';
    const rows = limit === undefined ? this._prepare(sql).all() : this._prepare(sql).all(limit);

    return rows.map((row) => (row as { key: string }).key);
  }

  private _countRows(): number {
    const row = this._prepare('SELECT COUNT(*) AS count FROM cache_entries').get() as {
      count: number;
    };

    return row.count;
  }

  private _sumByteSize(): number {
    const row = this._prepare('SELECT COALESCE(SUM(size), 0) AS size FROM cache_entries').get() as {
      size: number;
    };

    return row.size;
  }

  private _maxLastAccessed(): number {
    const row = this._prepare(
      'SELECT COALESCE(MAX(last_accessed), 0) AS lastAccessed FROM cache_entries',
    ).get() as { lastAccessed: number };

    return row.lastAccessed;
  }

  private _nextAccessed(): number {
    this._accessCounter = Math.max(Date.now(), this._accessCounter + 1);

    return this._accessCounter;
  }

  private _deleteRow(key: string): boolean {
    return (this._prepare('DELETE FROM cache_entries WHERE key = ?').run(key).changes ?? 0) > 0;
  }

  private _canStoreSize(size: number, limit: number | undefined, limitName: string): boolean {
    if (limit === undefined || size <= limit) {
      return true;
    }

    if (this._sizeLimitAction === 'throw') {
      throw new RangeError(`${limitName} exceeded`);
    }

    return false;
  }

  private _evictLRU(): void {
    const [key] = this._keys(1);

    if (key !== undefined) {
      this._evict(key, MemorizeEventType.Evict);
    }
  }

  private _evict(
    key: string,
    reason: MemorizeEventType.Delete | MemorizeEventType.Expire | MemorizeEventType.Evict,
  ): void {
    const removed = this._deleteRow(key);

    if (!removed) {
      return;
    }

    this._emit(reason, { type: reason, key });

    if (this._countRows() === 0) {
      this._emit(MemorizeEventType.Empty, { type: MemorizeEventType.Empty });
    }

    if (key === this._nextExpiryKey) {
      this._scheduleNextExpiry();
    }
  }

  private _scheduleNextExpiry(): void {
    const row = this._prepare(
      'SELECT key, expires_at FROM cache_entries WHERE expires_at IS NOT NULL ORDER BY expires_at ASC LIMIT 1',
    ).get() as { key: string; expires_at: number } | null;

    this._scheduleExpiryAt(row?.key ?? null, row?.expires_at ?? null);
  }

  private _scheduleExpiryFor(key: string, expiresAt: number | null): void {
    if (expiresAt === null) {
      return;
    }

    if (this._nextExpiryAt !== null && expiresAt >= this._nextExpiryAt) {
      return;
    }

    this._scheduleExpiryAt(key, expiresAt);
  }

  private _scheduleExpiryAt(nextExpiryKey: string | null, nextExpiryAt: number | null): void {
    if (nextExpiryKey === this._nextExpiryKey && nextExpiryAt === this._nextExpiryAt) {
      return;
    }

    this._clearExpiryTimer();
    this._nextExpiryKey = nextExpiryKey;
    this._nextExpiryAt = nextExpiryAt;

    if (nextExpiryAt === null) {
      return;
    }

    const delay = Math.max(0, nextExpiryAt - Date.now());
    const timer = (globalThis.setTimeout ?? timerSetTimeout)(() => {
      this._expiryTimer = null;
      this._nextExpiryKey = null;
      this._nextExpiryAt = null;
      this._evictExpiredEntries();
    }, delay);

    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }

    this._expiryTimer = timer;
  }

  private _clearExpiryTimer(): void {
    if (!this._expiryTimer) {
      return;
    }

    (globalThis.clearTimeout ?? timerClearTimeout)(this._expiryTimer);
    this._expiryTimer = null;
  }

  private _evictExpiredEntries(): void {
    const rows = this._prepare(
      'SELECT key FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at <= ?',
    ).all(Date.now());

    let expired = false;

    for (const row of rows) {
      expired = this._evictExpiredEntry((row as { key: string }).key) || expired;
    }

    if (expired) {
      this._scheduleNextExpiry();
    }
  }

  private _evictExpiredEntry(key: string): boolean {
    const removed = this._deleteRow(key);

    if (!removed) {
      return false;
    }

    this._emit(MemorizeEventType.Expire, { type: MemorizeEventType.Expire, key });

    if (this._countRows() === 0) {
      this._emit(MemorizeEventType.Empty, { type: MemorizeEventType.Empty });
    }

    return true;
  }

  /**
   * Releases all resources held by the store: cancels the expiry timer, drops
   * every listener, and closes the underlying SQLite database. Persisted
   * entries are kept on disk. The store must not be used after disposal.
   */
  dispose(): void {
    this._clearExpiryTimer();
    this._nextExpiryKey = null;
    this._nextExpiryAt = null;
    this._statements.clear();
    this._listeners = {
      [MemorizeEventType.Set]: [],
      [MemorizeEventType.Delete]: [],
      [MemorizeEventType.Expire]: [],
      [MemorizeEventType.Empty]: [],
      [MemorizeEventType.Evict]: [],
    };
    this._db.close();
  }

  private _emit(event: MemorizeEventType, payload: MemorizeEvent): void {
    for (const handler of this._listeners[event] as Array<(e: MemorizeEvent) => void>) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[express-memorize] "${event}" event listener threw`, error);
      }
    }
  }

  private _format(key: string, entry: CacheEntry): CacheInfo {
    return {
      key,
      body: entry.body,
      statusCode: entry.statusCode,
      contentType: entry.contentType,
      expiresAt: entry.expiresAt,
      hits: entry.hits,
      size: entry.size,
      remainingTtl: entry.expiresAt ? Math.max(0, entry.expiresAt - Date.now()) : null,
    };
  }
}
