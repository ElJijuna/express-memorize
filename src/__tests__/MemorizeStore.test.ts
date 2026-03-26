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

    it('remainingTtl is null when no TTL is set', () => {
      store.set('/users', entry());
      expect(store.get('/users')!.remainingTtl).toBeNull();
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

    it('entries without TTL never expire', () => {
      store.set('/users', entry());
      jest.advanceTimersByTime(9_999_999);

      expect(store.get('/users')).not.toBeNull();
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
});
