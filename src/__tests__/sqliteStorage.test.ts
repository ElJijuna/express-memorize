import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemorizeEventType } from '../domain/MemorizeEventType';
import { memorize } from '../memorize';
import {
  canUseNativeSqlite,
  SQLITE_STORAGE_WARNING,
  SqliteMemorizeStore,
} from '../SqliteMemorizeStore';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'express-memorize-sqlite-'));
}

function cleanup(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

describe('SQLite storage', () => {
  it('keeps classic configuration on the in-memory store', () => {
    const cache = memorize({ ttl: 60_000 });

    cache.set('config', { ok: true });

    expect(cache.getValue('config')).toEqual({ ok: true });
  });

  it('uses memory storage when storage.type is memory', () => {
    const cache = memorize({ storage: { type: 'memory' } });

    cache.set('config', { ok: true });

    expect(cache.getValue('config')).toEqual({ ok: true });
  });

  it('warns and falls back to memory on Node versions below 24', () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.versions, 'node');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const directory = makeTempDir();

    Object.defineProperty(process.versions, 'node', {
      configurable: true,
      value: '23.0.0',
    });

    try {
      const cache = memorize({ storage: { type: 'sqlite', directory } });

      cache.set('config', { ok: true });

      expect(warn).toHaveBeenCalledWith(SQLITE_STORAGE_WARNING);
      expect(cache.getValue('config')).toEqual({ ok: true });
      expect(existsSync(join(directory, 'express-memorize.sqlite'))).toBe(false);
    } finally {
      if (descriptor) {
        Object.defineProperty(process.versions, 'node', descriptor);
      }

      warn.mockRestore();
      cleanup(directory);
    }
  });

  const describeIfSqlite = canUseNativeSqlite() ? describe : describe.skip;

  describeIfSqlite('native node:sqlite backend', () => {
    let directory: string;

    beforeEach(() => {
      directory = makeTempDir();
    });

    afterEach(() => {
      cleanup(directory);
    });

    it('creates express-memorize.sqlite in the configured directory', () => {
      memorize({ storage: { type: 'sqlite', directory } });

      expect(existsSync(join(directory, 'express-memorize.sqlite'))).toBe(true);
    });

    it('stores and retrieves service-level values', () => {
      const cache = memorize({ storage: { type: 'sqlite', directory }, serializer: 'json' });

      cache.set('users:list', [{ id: 1 }]);

      expect(cache.getValue('users:list')).toEqual([{ id: 1 }]);
      expect(cache.size()).toBe(1);
      expect(cache.byteSize()).toBeGreaterThan(0);
    });

    it('getAll returns active entries keyed by cache key', () => {
      const cache = memorize({ storage: { type: 'sqlite', directory } });

      cache._store.set('/a', { body: 'a', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/b', { body: 'b', statusCode: 200, contentType: 'text/plain' });

      expect(cache.getAll()).toEqual({
        '/a': expect.objectContaining({ body: 'a', key: '/a' }),
        '/b': expect.objectContaining({ body: 'b', key: '/b' }),
      });
    });

    it('round-trips raw string Buffer and object bodies', () => {
      const store = new SqliteMemorizeStore({ directory });
      const buffer = Buffer.from('bytes');

      store.set('/text', { body: 'hello', statusCode: 200, contentType: 'text/plain' });
      store.set('/buffer', {
        body: buffer,
        statusCode: 200,
        contentType: 'application/octet-stream',
      });
      store.set('/object', {
        body: { ok: true, values: [1, 2, 3] },
        statusCode: 200,
        contentType: 'application/json',
      });

      expect(store.getRaw('/text')?.body).toBe('hello');
      expect(Buffer.isBuffer(store.getRaw('/buffer')?.body)).toBe(true);
      expect(store.getRaw('/buffer')?.body).toEqual(buffer);
      expect(store.getRaw('/object')?.body).toEqual({ ok: true, values: [1, 2, 3] });
    });

    it('persists entries across cache instances using the same directory', () => {
      const first = memorize({ storage: { type: 'sqlite', directory }, serializer: 'json' });

      first.set('users:list', [{ id: 1 }], Infinity);

      const second = memorize({ storage: { type: 'sqlite', directory }, serializer: 'json' });

      expect(second.getValue('users:list')).toEqual([{ id: 1 }]);
    });

    it('expires persisted entries by TTL', () => {
      jest.useFakeTimers();

      const cache = memorize({ storage: { type: 'sqlite', directory }, serializer: 'json' });

      cache.set('short', { ok: true }, 1000);
      jest.advanceTimersByTime(1000);

      expect(cache.getValue('short')).toBeUndefined();

      jest.useRealTimers();
    });

    it('getRaw expires ttl 0 entries immediately', () => {
      const cache = memorize({ storage: { type: 'sqlite', directory } });

      cache._store.set('/expired', { body: 'old', statusCode: 200, contentType: 'text/plain' }, 0);

      expect(cache._store.getRaw('/expired')).toBeNull();
      expect(cache.size()).toBe(0);
    });

    it('evicts the least-recently-used entry when maxEntries is reached', () => {
      const cache = memorize({ storage: { type: 'sqlite', directory }, maxEntries: 2 });

      cache._store.set('/a', { body: 'a', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/b', { body: 'b', statusCode: 200, contentType: 'text/plain' });
      cache._store.getRaw('/a');
      cache._store.set('/c', { body: 'c', statusCode: 200, contentType: 'text/plain' });

      expect(cache._store.get('/a')).not.toBeNull();
      expect(cache._store.get('/b')).toBeNull();
      expect(cache._store.get('/c')).not.toBeNull();
    });

    it('evicts least-recently-used entries until maxTotalBytes fits', () => {
      const cache = memorize({ storage: { type: 'sqlite', directory }, maxTotalBytes: 6 });

      cache._store.set('/a', { body: 'aa', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/b', { body: 'bb', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/c', { body: 'cccc', statusCode: 200, contentType: 'text/plain' });

      expect(cache._store.get('/a')).toBeNull();
      expect(cache._store.get('/b')).not.toBeNull();
      expect(cache._store.get('/c')).not.toBeNull();
      expect(cache.byteSize()).toBe(6);
    });

    it('skips and throws when a single entry exceeds maxTotalBytes', () => {
      const skip = memorize({ storage: { type: 'sqlite', directory }, maxTotalBytes: 3 });

      skip._store.set('/big', { body: 'hello', statusCode: 200, contentType: 'text/plain' });
      expect(skip._store.get('/big')).toBeNull();

      const throwCache = memorize({
        storage: { type: 'sqlite', directory },
        maxTotalBytes: 3,
        sizeLimitAction: 'throw',
      });

      expect(() =>
        throwCache._store.set('/big', {
          body: 'hello',
          statusCode: 200,
          contentType: 'text/plain',
        }),
      ).toThrow(RangeError);
    });

    it('overwrites entries and recomputes stats', () => {
      const cache = memorize({ storage: { type: 'sqlite', directory }, maxEntries: 5 });

      cache._store.set('/a', { body: 'aa', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/a', { body: 'longer', statusCode: 201, contentType: 'text/plain' });

      expect(cache._store.get('/a')).toMatchObject({
        body: 'longer',
        statusCode: 201,
        hits: 1,
        size: 6,
      });
      expect(cache.getStats()).toEqual({
        entries: 1,
        maxEntries: 5,
        maxValueBytes: null,
        maxTotalBytes: null,
        byteSize: 6,
      });
    });

    it('honors maxValueBytes skip and throw modes', () => {
      const skip = memorize({ storage: { type: 'sqlite', directory }, maxValueBytes: 3 });

      skip._store.set('/big', { body: 'hello', statusCode: 200, contentType: 'text/plain' });
      expect(skip._store.get('/big')).toBeNull();

      const throwCache = memorize({
        storage: { type: 'sqlite', directory },
        maxValueBytes: 3,
        sizeLimitAction: 'throw',
      });

      expect(() =>
        throwCache._store.set('/big', {
          body: 'hello',
          statusCode: 200,
          contentType: 'text/plain',
        }),
      ).toThrow(RangeError);
    });

    it('emits set delete evict expire and empty events', () => {
      jest.useFakeTimers();

      const cache = memorize({ storage: { type: 'sqlite', directory }, maxEntries: 1 });
      const events: string[] = [];

      cache.on(MemorizeEventType.Set, (event) => events.push(event.type));
      cache.on(MemorizeEventType.Delete, (event) => events.push(event.type));
      cache.on(MemorizeEventType.Evict, (event) => events.push(event.type));
      cache.on(MemorizeEventType.Expire, (event) => events.push(event.type));
      cache.on(MemorizeEventType.Empty, (event) => events.push(event.type));

      cache._store.set('/a', { body: 'a', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/b', { body: 'b', statusCode: 200, contentType: 'text/plain' });
      cache.delete('/b');
      cache._store.set('/c', { body: 'c', statusCode: 200, contentType: 'text/plain' }, 1000);
      jest.advanceTimersByTime(1000);

      expect(events).toContain(MemorizeEventType.Set);
      expect(events).toContain(MemorizeEventType.Delete);
      expect(events).toContain(MemorizeEventType.Evict);
      expect(events).toContain(MemorizeEventType.Expire);
      expect(events).toContain(MemorizeEventType.Empty);

      jest.useRealTimers();
    });

    it('deletes matching keys and clears entries', async () => {
      const cache = memorize({ storage: { type: 'sqlite', directory } });

      cache._store.set('/api/users/1', { body: 'a', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/api/users/2', { body: 'b', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/api/products/1', {
        body: 'c',
        statusCode: 200,
        contentType: 'text/plain',
      });

      expect(cache.deleteMatching('/api/users/*')).toBe(2);
      expect(cache._store.get('/api/products/1')).not.toBeNull();
      await expect(cache.clearAsync({ batchSize: 1 })).resolves.toBe(1);
      expect(cache.getAll()).toEqual({});
    });

    it('returns false or zero for missing deletes and unmatched patterns', async () => {
      const cache = memorize({ storage: { type: 'sqlite', directory } });

      cache._store.set('/api/products/1', {
        body: 'c',
        statusCode: 200,
        contentType: 'text/plain',
      });

      expect(cache.delete('/missing')).toBe(false);
      expect(cache.deleteMatching('/api/users/*')).toBe(0);
      await expect(cache.deleteMatchingAsync('/api/users/*', { batchSize: 1 })).resolves.toBe(0);
      expect(cache._store.get('/api/products/1')).not.toBeNull();
    });

    it('deleteMatchingAsync removes matching keys in batches', async () => {
      const cache = memorize({ storage: { type: 'sqlite', directory } });

      cache._store.set('/api/users/1', { body: 'a', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/api/users/2', { body: 'b', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/api/products/1', {
        body: 'c',
        statusCode: 200,
        contentType: 'text/plain',
      });

      await expect(cache.deleteMatchingAsync('/api/users/*', { batchSize: 1 })).resolves.toBe(2);
      expect(cache._store.get('/api/users/1')).toBeNull();
      expect(cache._store.get('/api/users/2')).toBeNull();
      expect(cache._store.get('/api/products/1')).not.toBeNull();
    });

    it('clear removes all entries synchronously', () => {
      const cache = memorize({ storage: { type: 'sqlite', directory } });

      cache._store.set('/a', { body: 'a', statusCode: 200, contentType: 'text/plain' });
      cache._store.set('/b', { body: 'b', statusCode: 200, contentType: 'text/plain' });

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.getAll()).toEqual({});
    });

    it('getAllAsync yields in batches and skips expired rows', async () => {
      const cache = memorize({ storage: { type: 'sqlite', directory } });

      cache._store.set('/expired', { body: 'a', statusCode: 200, contentType: 'text/plain' }, 0);
      cache._store.set('/alive', { body: 'b', statusCode: 200, contentType: 'text/plain' }, 5000);

      await expect(cache.getAllAsync({ batchSize: 1 })).resolves.toEqual({
        '/alive': expect.objectContaining({ body: 'b' }),
      });
      expect(cache._store.get('/expired')).toBeNull();
    });

    it('validates async batch sizes', async () => {
      const cache = memorize({ storage: { type: 'sqlite', directory } });

      await expect(cache.getAllAsync({ batchSize: 0 })).rejects.toThrow(RangeError);
      await expect(cache.clearAsync({ batchSize: 0 })).rejects.toThrow(RangeError);
      await expect(cache.deleteMatchingAsync('/api/*', { batchSize: 0 })).rejects.toThrow(
        RangeError,
      );
    });
  });
});
