import { MemorizeStore } from '../MemorizeStore';
import { MemorizeEventType } from '../domain/MemorizeEventType';

const entry = (body: unknown = 'value') => ({
  body,
  statusCode: 200,
  contentType: 'application/json',
});

describe('MemorizeStore', () => {
  let store: MemorizeStore;

  beforeEach(() => {
    store = new MemorizeStore();
  });

  describe('set / get', () => {
    it('stores and retrieves an entry', () => {
      store.set('/users', entry({ data: [] }));
      const result = store.get('/users');

      expect(result).not.toBeNull();
      expect(result!.body).toEqual({ data: [] });
      expect(result!.statusCode).toBe(200);
      expect(result!.contentType).toBe('application/json');
      expect(result!.key).toBe('/users');
    });

    it('returns null for an unknown key', () => {
      expect(store.get('/missing')).toBeNull();
    });

    it('overrides an existing entry', () => {
      store.set('/users', entry('first'));
      store.set('/users', entry('second'));

      expect(store.get('/users')!.body).toBe('second');
    });

    it('uses a finite default TTL when no TTL is set', () => {
      jest.useFakeTimers();
      store.set('/users', entry());
      const remainingTtl = store.get('/users')!.remainingTtl;

      expect(remainingTtl).not.toBeNull();
      expect(remainingTtl).toBeGreaterThan(0);
      jest.useRealTimers();
    });
  });

  describe('hits counter', () => {
    it('starts at 1 after set', () => {
      store.set('/users', entry());
      expect(store.get('/users')!.hits).toBe(1);
    });

    it('increments on each getRaw call', () => {
      store.set('/users', entry());
      store.getRaw('/users');
      store.getRaw('/users');
      expect(store.get('/users')!.hits).toBe(3);
    });

    it('resets to 1 when key is re-set', () => {
      store.set('/users', entry());
      store.getRaw('/users');
      store.getRaw('/users');
      store.set('/users', entry('new'));
      expect(store.get('/users')!.hits).toBe(1);
    });

    it('getAll includes hits', () => {
      store.set('/a', entry());
      store.getRaw('/a');
      const all = store.getAll();
      expect(all['/a'].hits).toBe(2);
    });
  });

  describe('getAll', () => {
    it('returns all stored entries', () => {
      store.set('/a', entry(1));
      store.set('/b', entry(2));

      const all = store.getAll();
      expect(Object.keys(all)).toHaveLength(2);
      expect(all['/a'].body).toBe(1);
      expect(all['/b'].body).toBe(2);
    });

    it('returns an empty object when the store is empty', () => {
      expect(store.getAll()).toEqual({});
    });

    it('getAllAsync returns all stored entries', async () => {
      store.set('/a', entry(1));
      store.set('/b', entry(2));

      const all = await store.getAllAsync({ batchSize: 1 });

      expect(Object.keys(all)).toHaveLength(2);
      expect(all['/a'].body).toBe(1);
      expect(all['/b'].body).toBe(2);
    });

    it('getAllAsync yields between batches', async () => {
      jest.useRealTimers();
      const s = new MemorizeStore();
      let yielded = false;

      for (let i = 0; i < 5; i++) s.set(`/key/${i}`, entry(i));
      setImmediate(() => { yielded = true; });

      const resultPromise = s.getAllAsync({ batchSize: 2 });
      expect(yielded).toBe(false);

      const result = await resultPromise;

      expect(Object.keys(result)).toHaveLength(5);
      expect(yielded).toBe(true);
    });

    it('getAllAsync rejects invalid batch sizes', async () => {
      await expect(store.getAllAsync({ batchSize: 0 })).rejects.toThrow(RangeError);
    });
  });

  describe('empty event', () => {
    it('fires when the last entry is deleted', () => {
      const handler = jest.fn();
      store.on(MemorizeEventType.Empty, handler);
      store.set('/a', entry());
      store.set('/b', entry());

      store.delete('/a');
      expect(handler).not.toHaveBeenCalled();

      store.delete('/b');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ type: MemorizeEventType.Empty });
    });

    it('fires when clear() empties the store', () => {
      const handler = jest.fn();
      store.on(MemorizeEventType.Empty, handler);
      store.set('/a', entry());
      store.set('/b', entry());
      store.clear();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires when the last entry expires', () => {
      jest.useFakeTimers();
      const handler = jest.fn();
      store.on(MemorizeEventType.Empty, handler);
      store.set('/a', entry(), 500);
      jest.advanceTimersByTime(600);

      expect(handler).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('does not fire when the store still has entries', () => {
      const handler = jest.fn();
      store.on(MemorizeEventType.Empty, handler);
      store.set('/a', entry());
      store.set('/b', entry());
      store.delete('/a');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('removes an existing entry and returns true', () => {
      store.set('/users', entry());
      expect(store.delete('/users')).toBe(true);
      expect(store.get('/users')).toBeNull();
    });

    it('returns false for a non-existent key', () => {
      expect(store.delete('/missing')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      store.set('/a', entry());
      store.set('/b', entry());
      store.clear();

      expect(store.getAll()).toEqual({});
    });

    it('clearAsync removes all entries and returns the count', async () => {
      store.set('/a', entry());
      store.set('/b', entry());

      await expect(store.clearAsync({ batchSize: 1 })).resolves.toBe(2);

      expect(store.getAll()).toEqual({});
    });

    it('clearAsync yields between batches', async () => {
      jest.useRealTimers();
      const s = new MemorizeStore();
      const yieldedByDelete: boolean[] = [];
      let yielded = false;

      s.on(MemorizeEventType.Delete, () => yieldedByDelete.push(yielded));
      for (let i = 0; i < 5; i++) s.set(`/key/${i}`, entry());
      setImmediate(() => { yielded = true; });

      await s.clearAsync({ batchSize: 2 });

      expect(yieldedByDelete).toEqual([false, false, true, true, true]);
    });

    it('clearAsync rejects invalid batch sizes', async () => {
      store.set('/a', entry());

      await expect(store.clearAsync({ batchSize: 0 })).rejects.toThrow(RangeError);
    });
  });

  describe('deleteMatching', () => {
    it('removes all keys matching a simple wildcard', () => {
      store.set('/api/users/abc', entry());
      store.set('/api/users/abc?lang=es', entry());
      store.set('/api/products/1', entry());

      const count = store.deleteMatching('/api/users/*');

      expect(count).toBe(2);
      expect(store.get('/api/users/abc')).toBeNull();
      expect(store.get('/api/users/abc?lang=es')).toBeNull();
      expect(store.get('/api/products/1')).not.toBeNull();
    });

    it('removes keys matching a cross-segment wildcard (**)', () => {
      store.set('/api/users/abc', entry());
      store.set('/v2/users/abc', entry());
      store.set('/api/products/1', entry());

      const count = store.deleteMatching(['**', 'users', 'abc'].join('/'));

      expect(count).toBe(2);
      expect(store.get('/api/users/abc')).toBeNull();
      expect(store.get('/v2/users/abc')).toBeNull();
      expect(store.get('/api/products/1')).not.toBeNull();
    });

    it('returns 0 when no keys match', () => {
      store.set('/api/users/abc', entry());

      expect(store.deleteMatching('/api/orders/*')).toBe(0);
      expect(store.get('/api/users/abc')).not.toBeNull();
    });

    it('emits a delete event for each removed entry', () => {
      const handler = jest.fn();
      store.on(MemorizeEventType.Delete, handler);
      store.set('/api/users/1', entry());
      store.set('/api/users/2', entry());

      store.deleteMatching('/api/users/*');

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('emits empty event when last entries are removed', () => {
      const handler = jest.fn();
      store.on(MemorizeEventType.Empty, handler);
      store.set('/api/users/1', entry());
      store.set('/api/users/2', entry());

      store.deleteMatching('/api/users/*');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('matches trailing query string with *', () => {
      store.set('/api/users/abc?page=1', entry());
      store.set('/api/users/abc?page=2', entry());
      store.set('/api/users/xyz', entry());

      const count = store.deleteMatching('/api/users/abc*');

      expect(count).toBe(2);
      expect(store.get('/api/users/xyz')).not.toBeNull();
    });

    it('deleteMatchingAsync removes matching entries and returns the count', async () => {
      store.set('/api/users/1', entry());
      store.set('/api/users/2', entry());
      store.set('/api/products/1', entry());

      await expect(store.deleteMatchingAsync('/api/users/*', { batchSize: 1 })).resolves.toBe(2);

      expect(store.get('/api/users/1')).toBeNull();
      expect(store.get('/api/users/2')).toBeNull();
      expect(store.get('/api/products/1')).not.toBeNull();
    });

    it('deleteMatchingAsync yields between batches', async () => {
      jest.useRealTimers();
      const s = new MemorizeStore();
      const yieldedByDelete: boolean[] = [];
      let yielded = false;

      s.on(MemorizeEventType.Delete, () => yieldedByDelete.push(yielded));
      for (let i = 0; i < 5; i++) s.set(`/api/users/${i}`, entry());
      setImmediate(() => { yielded = true; });

      await s.deleteMatchingAsync('/api/users/*', { batchSize: 2 });

      expect(yieldedByDelete).toEqual([false, false, true, true, true]);
    });

    it('deleteMatchingAsync yields while scanning non-matching keys', async () => {
      jest.useRealTimers();
      const s = new MemorizeStore();
      const yieldedByDelete: boolean[] = [];
      let yielded = false;

      s.on(MemorizeEventType.Delete, () => yieldedByDelete.push(yielded));
      s.set('/api/products/1', entry());
      s.set('/api/products/2', entry());
      s.set('/api/users/1', entry());
      setImmediate(() => { yielded = true; });

      await s.deleteMatchingAsync('/api/users/*', { batchSize: 2 });

      expect(yieldedByDelete).toEqual([true]);
    });

    it('deleteMatchingAsync rejects invalid batch sizes', async () => {
      await expect(store.deleteMatchingAsync('/api/users/*', { batchSize: -1 })).rejects.toThrow(RangeError);
    });
  });

  describe('TTL', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('entry is accessible before TTL expires', () => {
      store.set('/users', entry(), 1000);
      jest.advanceTimersByTime(999);

      expect(store.get('/users')).not.toBeNull();
    });

    it('entry is evicted after TTL expires via timer', () => {
      store.set('/users', entry(), 1000);
      jest.advanceTimersByTime(1001);

      expect(store.getRaw('/users')).toBeNull();
    });

    it('entry is evicted after TTL expires via Date.now check', () => {
      store.set('/users', entry(), 1000);
      jest.setSystemTime(Date.now() + 1001);

      expect(store.get('/users')).toBeNull();
    });

    it('remainingTtl decreases over time', () => {
      store.set('/users', entry(), 5000);
      jest.setSystemTime(Date.now() + 2000);

      const info = store.get('/users');
      expect(info!.remainingTtl).toBeLessThanOrEqual(3000);
    });

    it('re-setting a key resets the timer', () => {
      store.set('/users', entry('v1'), 1000);
      jest.advanceTimersByTime(800);

      store.set('/users', entry('v2'), 1000); // timer resets
      jest.advanceTimersByTime(800); // 1600ms total but timer reset at 800ms

      expect(store.get('/users')).not.toBeNull();
      expect(store.get('/users')!.body).toBe('v2');
    });

    it('entries without TTL use the default finite TTL', () => {
      store.set('/users', entry());
      jest.advanceTimersByTime(59_999);

      expect(store.get('/users')).not.toBeNull();

      jest.advanceTimersByTime(2);
      expect(store.get('/users')).toBeNull();
    });

    it('only Infinity creates an entry without expiry', () => {
      store.set('/users', entry(), Infinity);
      jest.advanceTimersByTime(9_999_999);

      const info = store.get('/users');
      expect(info).not.toBeNull();
      expect(info!.remainingTtl).toBeNull();
      expect(info!.expiresAt).toBeNull();
    });

    it('unrefs the shared TTL scheduler so it does not keep the process alive', () => {
      jest.useRealTimers();
      const unref = jest.fn();
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockReturnValue({ unref } as unknown as ReturnType<typeof setTimeout>);

      try {
        store.set('/users', entry(), 1000);
        expect(unref).toHaveBeenCalledTimes(1);
      } finally {
        setTimeoutSpy.mockRestore();
        jest.useFakeTimers();
      }
    });

    it('uses a single shared TTL scheduler for multiple entries', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      store.set('/a', entry(), 1000);
      store.set('/b', entry(), 2000);

      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
      setTimeoutSpy.mockRestore();
    });

    it('reprograms the shared TTL scheduler when an earlier entry is added', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      store.set('/later', entry(), 2000);
      store.set('/earlier', entry(), 1000);

      expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });

    it('does not create a TTL scheduler for Infinity', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      store.set('/users', entry(), Infinity);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });

    it('ttl 0 expires immediately instead of creating an infinite entry', () => {
      store.set('/users', entry(), 0);

      expect(store.get('/users')).toBeNull();
    });

    it('rejects negative TTL values', () => {
      expect(() => store.set('/users', entry(), -1)).toThrow(RangeError);
    });

    it('rejects NaN TTL values', () => {
      expect(() => store.set('/users', entry(), NaN)).toThrow(TypeError);
    });

    it('expired entries are excluded from getAll', () => {
      store.set('/expired', entry(), 500);
      store.set('/alive', entry(), 5000);
      jest.setSystemTime(Date.now() + 1000);

      const all = store.getAll();
      expect(all['/expired']).toBeUndefined();
      expect(all['/alive']).toBeDefined();
    });
  });

  describe('size / byteSize / getStats', () => {
    it('size() returns number of active entries', () => {
      store.set('/a', entry('x'));
      store.set('/b', entry('y'));
      expect(store.size()).toBe(2);
    });

    it('size() decrements after delete', () => {
      store.set('/a', entry('x'));
      store.delete('/a');
      expect(store.size()).toBe(0);
    });

    it('byteSize() reflects stored string bodies', () => {
      store.set('/a', entry('hello'));
      expect(store.byteSize()).toBe(Buffer.byteLength('hello'));
    });

    it('byteSize() accumulates across entries', () => {
      store.set('/a', entry('abc'));
      store.set('/b', entry('de'));
      expect(store.byteSize()).toBe(Buffer.byteLength('abc') + Buffer.byteLength('de'));
    });

    it('byteSize() decrements after delete', () => {
      store.set('/a', entry('hello'));
      store.delete('/a');
      expect(store.byteSize()).toBe(0);
    });

    it('byteSize() updates when key is overwritten', () => {
      store.set('/a', entry('hi'));
      store.set('/a', entry('longer value'));
      expect(store.byteSize()).toBe(Buffer.byteLength('longer value'));
    });

    it('getStats() returns correct shape', () => {
      store.set('/a', entry('x'));
      const stats = store.getStats();
      expect(stats.entries).toBe(1);
      expect(stats.maxEntries).toBeNull();
      expect(stats.byteSize).toBeGreaterThan(0);
    });

    it('getStats() reflects maxEntries when configured', () => {
      const s = new MemorizeStore(5);
      s.set('/a', entry('x'));
      expect(s.getStats().maxEntries).toBe(5);
    });

    it('getStats() reflects byte limits when configured', () => {
      const s = new MemorizeStore({ maxValueBytes: 10, maxTotalBytes: 20 });
      const stats = s.getStats();
      expect(stats.maxValueBytes).toBe(10);
      expect(stats.maxTotalBytes).toBe(20);
    });

    it('CacheInfo includes size field', () => {
      store.set('/a', entry('hello'));
      const info = store.get('/a');
      expect(info!.size).toBe(Buffer.byteLength('hello'));
    });

    it('uses a precomputed entry size when provided', () => {
      store.set('/a', { ...entry('hello'), size: 123 });

      expect(store.byteSize()).toBe(123);
      expect(store.get('/a')!.size).toBe(123);
    });
  });

  describe('byte limits', () => {
    it('skips entries larger than maxValueBytes by default', () => {
      const s = new MemorizeStore({ maxValueBytes: 3 });

      s.set('/a', entry('abcd'));

      expect(s.get('/a')).toBeNull();
      expect(s.byteSize()).toBe(0);
    });

    it('throws for entries larger than maxValueBytes when configured', () => {
      const s = new MemorizeStore({ maxValueBytes: 3, sizeLimitAction: 'throw' });

      expect(() => s.set('/a', entry('abcd'))).toThrow(RangeError);
      expect(s.get('/a')).toBeNull();
    });

    it('keeps an existing entry when an oversized replacement is skipped', () => {
      const s = new MemorizeStore({ maxValueBytes: 5 });
      s.set('/a', entry('ok'));

      s.set('/a', entry('too-large'));

      expect(s.get('/a')!.body).toBe('ok');
    });

    it('evicts LRU entries until a new entry fits maxTotalBytes', () => {
      const s = new MemorizeStore({ maxTotalBytes: 6 });
      s.set('/a', entry('aa'));
      s.set('/b', entry('bb'));
      s.getRaw('/a');

      s.set('/c', entry('ccc'));

      expect(s.get('/a')).not.toBeNull();
      expect(s.get('/b')).toBeNull();
      expect(s.get('/c')).not.toBeNull();
      expect(s.byteSize()).toBe(5);
    });

    it('skips entries larger than maxTotalBytes by default', () => {
      const s = new MemorizeStore({ maxTotalBytes: 3 });

      s.set('/a', entry('abcd'));

      expect(s.get('/a')).toBeNull();
      expect(s.byteSize()).toBe(0);
    });

    it('emits Evict when maxTotalBytes removes an entry', () => {
      const s = new MemorizeStore({ maxTotalBytes: 4 });
      const evicted: string[] = [];
      s.on(MemorizeEventType.Evict, (e) => evicted.push(e.key));
      s.set('/a', entry('aa'));
      s.set('/b', entry('bbb'));

      expect(evicted).toEqual(['/a']);
    });
  });

  describe('maxEntries / LRU eviction', () => {
    it('does not evict when below limit', () => {
      const s = new MemorizeStore(3);
      s.set('/a', entry());
      s.set('/b', entry());
      expect(s.size()).toBe(2);
    });

    it('evicts the LRU entry when maxEntries is reached', () => {
      const s = new MemorizeStore(2);
      s.set('/a', entry());
      s.set('/b', entry());
      s.set('/c', entry()); // /a should be evicted (LRU)
      expect(s.get('/a')).toBeNull();
      expect(s.get('/b')).not.toBeNull();
      expect(s.get('/c')).not.toBeNull();
    });

    it('does not exceed maxEntries after multiple sets', () => {
      const s = new MemorizeStore(3);
      ['/a', '/b', '/c', '/d', '/e'].forEach((k) => s.set(k, entry()));
      expect(s.size()).toBe(3);
    });

    it('accessing a key makes it MRU (not evicted first)', () => {
      const s = new MemorizeStore(2);
      s.set('/a', entry());
      s.set('/b', entry());
      s.getRaw('/a'); // promote /a to MRU
      s.set('/c', entry()); // /b should be evicted, not /a
      expect(s.get('/a')).not.toBeNull();
      expect(s.get('/b')).toBeNull();
      expect(s.get('/c')).not.toBeNull();
    });

    it('re-setting an existing key does not evict when at limit', () => {
      const s = new MemorizeStore(2);
      s.set('/a', entry());
      s.set('/b', entry());
      s.set('/a', entry('updated')); // overwrite, not a new entry
      expect(s.size()).toBe(2);
      expect(s.get('/a')!.body).toBe('updated');
    });

    it('does not expire unrelated entries after evicting a scheduled entry', () => {
      jest.useFakeTimers();
      const s = new MemorizeStore(2);
      s.set('/a', entry(), 10_000);
      s.set('/b', entry('b'), Infinity);
      s.set('/c', entry()); // evicts /a

      jest.advanceTimersByTime(10_001);

      expect(s.get('/a')).toBeNull();
      expect(s.get('/b')).not.toBeNull();
      expect(s.get('/c')).not.toBeNull();
      jest.useRealTimers();
    });

    it('emits Evict event when entry is evicted', () => {
      const s = new MemorizeStore(1);
      const evicted: string[] = [];
      s.on(MemorizeEventType.Evict, (e) => evicted.push(e.key));
      s.set('/a', entry());
      s.set('/b', entry()); // evicts /a
      expect(evicted).toEqual(['/a']);
    });

    it('byteSize stays consistent after LRU eviction', () => {
      const s = new MemorizeStore(2);
      s.set('/a', entry('aaaa'));
      s.set('/b', entry('bb'));
      const beforeEviction = s.byteSize();
      s.set('/c', entry('ccc')); // evicts /a
      expect(s.byteSize()).toBe(beforeEviction - Buffer.byteLength('aaaa') + Buffer.byteLength('ccc'));
    });
  });
});
