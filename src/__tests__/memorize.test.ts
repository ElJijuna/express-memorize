import { Request, NextFunction } from 'express';
import { memorize } from '../memorize';
import { MemorizeEventType } from '../domain/MemorizeEventType';

function createMockReqRes(url = '/test', method = 'GET') {
  const responseHeaders: Record<string, string> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      responseHeaders[name] = value;
      return this;
    },
    getHeader(name: string): string | undefined {
      return responseHeaders[name];
    },
    send: jest.fn().mockReturnThis(),
  };

  // Simulate Express's res.json: sets Content-Type then calls res.send
  (res as any).json = function (body: unknown) {
    (res as any).setHeader('Content-Type', 'application/json; charset=utf-8');
    return (res as any).send(JSON.stringify(body));
  };

  const req = { originalUrl: url, method } as unknown as Request;
  const next = jest.fn() as unknown as NextFunction;

  return { req, res, next, responseHeaders };
}

describe('memorize middleware', () => {
  describe('cache MISS (first request)', () => {
    it('calls next on first request', () => {
      const { req, res, next } = createMockReqRes();
      memorize()()(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('sets X-Cache: MISS on the response', () => {
      const { req, res, next, responseHeaders } = createMockReqRes();
      memorize()()(req, res, next);
      (res as any).json({ data: [] });

      expect(responseHeaders['X-Cache']).toBe('MISS');
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'bypasses cache for %s requests',
      (method) => {
        const cache = memorize();
        const middleware = cache();

        // Prime the cache with a GET
        const { req: getReq, res: getRes, next: getNext } = createMockReqRes('/users', 'GET');
        middleware(getReq, getRes, getNext);
        (getRes as any).json({ data: [] });

        // Non-GET to same URL: must call next and not return cached response
        const { req, res, next } = createMockReqRes('/users', method);
        middleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.send).not.toHaveBeenCalled();
      }
    );

    it('does not cache non-2xx responses', () => {
      const cache = memorize();
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/error');
      res.statusCode = 404;
      middleware(req, res, next);
      (res as any).send('Not Found');

      // Second request: should still call next, not return cached data
      const { req: req2, res: res2, next: next2 } = createMockReqRes('/error');
      middleware(req2, res2, next2);
      expect(next2).toHaveBeenCalledTimes(1);
    });

    it('caches 201 Created responses', () => {
      const cache = memorize();
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/resource');
      res.statusCode = 201;
      middleware(req, res, next);
      (res as any).json({ created: true });

      const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes('/resource');
      middleware(req2, res2, next2);

      expect(next2).not.toHaveBeenCalled();
      expect(h2['X-Cache']).toBe('HIT');
    });
  });

  describe('cache HIT (subsequent requests)', () => {
    it('does not call next on a cache hit', () => {
      const cache = memorize();
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/users');
      middleware(req, res, next);
      (res as any).json({ data: [{ name: 'Ivan' }] });

      const { req: req2, res: res2, next: next2 } = createMockReqRes('/users');
      middleware(req2, res2, next2);

      expect(next2).not.toHaveBeenCalled();
    });

    it('sets X-Cache: HIT on the response', () => {
      const cache = memorize();
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/users');
      middleware(req, res, next);
      (res as any).json({ data: [] });

      const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes('/users');
      middleware(req2, res2, next2);

      expect(h2['X-Cache']).toBe('HIT');
    });

    it('restores the stored Content-Type on a hit', () => {
      const cache = memorize();
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/ping');
      middleware(req, res, next);
      (res as any).setHeader('Content-Type', 'text/plain; charset=utf-8');
      (res as any).send('pong');

      const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes('/ping');
      middleware(req2, res2, next2);

      expect(h2['Content-Type']).toBe('text/plain; charset=utf-8');
    });

    it('different URLs have independent cache entries', () => {
      const cache = memorize();
      const middleware = cache();

      const { req: rA, res: rsA, next: nA } = createMockReqRes('/a');
      middleware(rA, rsA, nA);
      (rsA as any).json({ route: 'a' });

      // /b has never been cached — next must be called
      const { req: rB, res: rsB, next: nB } = createMockReqRes('/b');
      middleware(rB, rsB, nB);
      expect(nB).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache management methods', () => {
    it('cache.get returns info for a cached key', () => {
      const cache = memorize();
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/users');
      middleware(req, res, next);
      (res as any).json({ data: [] });

      const info = cache.get('/users');
      expect(info).not.toBeNull();
      expect(info!.statusCode).toBe(200);
    });

    it('cache.get returns null for an uncached key', () => {
      expect(memorize().get('/missing')).toBeNull();
    });

    it('cache.delete removes a key', () => {
      const cache = memorize();
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/users');
      middleware(req, res, next);
      (res as any).json({ data: [] });

      cache.delete('/users');

      const { req: req2, res: res2, next: next2 } = createMockReqRes('/users');
      middleware(req2, res2, next2);
      expect(next2).toHaveBeenCalledTimes(1);
    });

    it('cache.getAll returns all active entries', () => {
      const cache = memorize();
      const middleware = cache();

      ['/a', '/b', '/c'].forEach((url) => {
        const { req, res, next } = createMockReqRes(url);
        middleware(req, res, next);
        (res as any).json({ url });
      });

      expect(Object.keys(cache.getAll())).toHaveLength(3);
    });

    it('cache.clear removes all entries', () => {
      const cache = memorize();
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/users');
      middleware(req, res, next);
      (res as any).json({ data: [] });

      cache.clear();
      expect(cache.getAll()).toEqual({});
    });
  });

  describe('noCache', () => {
    it('sets X-Cache: BYPASS and calls next', () => {
      const cache = memorize();
      const middleware = cache({ noCache: true });

      const { req, res, next, responseHeaders } = createMockReqRes();
      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(responseHeaders['X-Cache']).toBe('BYPASS');
    });

    it('does not store the response when noCache is true', () => {
      const cache = memorize();
      const middleware = cache({ noCache: true });

      const { req, res, next } = createMockReqRes('/users');
      middleware(req, res, next);
      (res as any).json({ data: [] });

      expect(cache.get('/users')).toBeNull();
    });

    it('does not serve a cached entry when noCache is true', () => {
      const cache = memorize();

      // Prime the cache with a normal request
      const { req, res, next } = createMockReqRes('/users');
      cache()(req, res, next);
      (res as any).json({ data: [] });

      // noCache request: must call next and set BYPASS, not serve the cached HIT
      const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes('/users');
      cache({ noCache: true })(req2, res2, next2);

      expect(next2).toHaveBeenCalledTimes(1);
      expect(h2['X-Cache']).toBe('BYPASS');
    });
  });

  describe('TTL', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('uses global TTL when no call-level TTL is set', () => {
      const cache = memorize({ ttl: 1000 });
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/users');
      middleware(req, res, next);
      (res as any).json({ data: [] });

      jest.advanceTimersByTime(999);
      expect(cache.get('/users')).not.toBeNull();

      jest.advanceTimersByTime(2);
      expect(cache.get('/users')).toBeNull();
    });

    it('call-level TTL overrides the global TTL', () => {
      const cache = memorize({ ttl: 60_000 });
      const middleware = cache({ ttl: 500 });

      const { req, res, next } = createMockReqRes('/fast');
      middleware(req, res, next);
      (res as any).json({ ok: true });

      jest.advanceTimersByTime(600);
      expect(cache.get('/fast')).toBeNull();
    });

    it('after TTL expires the next request is a MISS again', () => {
      const cache = memorize({ ttl: 1000 });
      const middleware = cache();

      const { req, res, next } = createMockReqRes('/users');
      middleware(req, res, next);
      (res as any).json({ data: [] });

      jest.advanceTimersByTime(1001);

      const { req: req2, res: res2, next: next2 } = createMockReqRes('/users');
      middleware(req2, res2, next2);
      expect(next2).toHaveBeenCalledTimes(1);
    });
  });

  describe('shared store across middleware instances', () => {
    it('two cache() calls share the same store', () => {
      const cache = memorize();
      const m1 = cache();
      const m2 = cache();

      // Cache via m1
      const { req, res, next } = createMockReqRes('/shared');
      m1(req, res, next);
      (res as any).json({ via: 'm1' });

      // Hit via m2
      const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes('/shared');
      m2(req2, res2, next2);

      expect(next2).not.toHaveBeenCalled();
      expect(h2['X-Cache']).toBe('HIT');
    });

    it('two memorize() calls have independent stores', () => {
      const cache1 = memorize();
      const cache2 = memorize();

      const { req, res, next } = createMockReqRes('/users');
      cache1()(req, res, next);
      (res as any).json({ data: [] });

      // cache2 has its own store — should be a MISS
      const { req: req2, res: res2, next: next2 } = createMockReqRes('/users');
      cache2()(req2, res2, next2);
      expect(next2).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache.express()', () => {
    it('behaves identically to cache() on a MISS', () => {
      const cache = memorize();
      const { req, res, next, responseHeaders } = createMockReqRes('/users');
      cache.express()(req, res, next);
      (res as any).json({ data: [] });
      expect(next).toHaveBeenCalledTimes(1);
      expect(responseHeaders['X-Cache']).toBe('MISS');
    });

    it('behaves identically to cache() on a HIT', () => {
      const cache = memorize();

      const { req, res, next } = createMockReqRes('/users');
      cache.express()(req, res, next);
      (res as any).json({ data: [] });

      const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes('/users');
      cache.express()(req2, res2, next2);
      expect(next2).not.toHaveBeenCalled();
      expect(h2['X-Cache']).toBe('HIT');
    });

    it('shares the store with cache()', () => {
      const cache = memorize();

      // Prime via cache()
      const { req, res, next } = createMockReqRes('/ping');
      cache()(req, res, next);
      (res as any).json({ ok: true });

      // Hit via cache.express()
      const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes('/ping');
      cache.express()(req2, res2, next2);
      expect(next2).not.toHaveBeenCalled();
      expect(h2['X-Cache']).toBe('HIT');
    });
  });

  describe('cache.set / cache.getValue', () => {
    it('stores and retrieves an object', () => {
      const cache = memorize();
      cache.set('config', { theme: 'dark', version: 2 });
      expect(cache.getValue('config')).toEqual({ theme: 'dark', version: 2 });
    });

    it('stores and retrieves a primitive', () => {
      const cache = memorize();
      cache.set('count', 42);
      expect(cache.getValue<number>('count')).toBe(42);
    });

    it('stores and retrieves a string', () => {
      const cache = memorize();
      cache.set('greeting', 'hello');
      expect(cache.getValue<string>('greeting')).toBe('hello');
    });

    it('returns undefined for a missing key', () => {
      expect(memorize().getValue('nonexistent')).toBeUndefined();
    });

    it('overwrites an existing value', () => {
      const cache = memorize();
      cache.set('key', 'first');
      cache.set('key', 'second');
      expect(cache.getValue<string>('key')).toBe('second');
    });

    it('entry is visible via cache.get after set', () => {
      const cache = memorize();
      cache.set('mykey', { data: 1 });
      const info = cache.get('mykey');
      expect(info).not.toBeNull();
      expect(info!.statusCode).toBe(200);
    });

    it('respects TTL', () => {
      jest.useFakeTimers();
      const cache = memorize();
      cache.set('temp', 'value', 500);

      jest.advanceTimersByTime(499);
      expect(cache.getValue('temp')).toBe('value');

      jest.advanceTimersByTime(2);
      expect(cache.getValue('temp')).toBeUndefined();

      jest.useRealTimers();
    });

    it('uses global TTL when no ttl argument given', () => {
      jest.useFakeTimers();
      const cache = memorize({ ttl: 300 });
      cache.set('x', 1);

      jest.advanceTimersByTime(299);
      expect(cache.getValue('x')).toBe(1);

      jest.advanceTimersByTime(2);
      expect(cache.getValue('x')).toBeUndefined();

      jest.useRealTimers();
    });
  });

  describe('cache.remember', () => {
    it('calls factory and returns value on cache miss', async () => {
      const cache = memorize();
      const factory = jest.fn().mockResolvedValue({ data: [1, 2, 3] });

      const result = await cache.remember('list', factory);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ data: [1, 2, 3] });
    });

    it('does not call factory on cache hit', async () => {
      const cache = memorize();
      const factory = jest.fn().mockResolvedValue({ data: [] });

      await cache.remember('list', factory);
      await cache.remember('list', factory);

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('returns the cached value on second call', async () => {
      const cache = memorize();
      const factory = jest.fn().mockResolvedValue({ data: 'original' });

      const first = await cache.remember('item', factory);
      const second = await cache.remember('item', factory);

      expect(first).toEqual(second);
    });

    it('works with a sync factory', async () => {
      const cache = memorize();
      const result = await cache.remember('sync', () => 42);
      expect(result).toBe(42);
    });

    it('respects per-call TTL', async () => {
      jest.useFakeTimers();
      const cache = memorize();
      await cache.remember('key', () => 'value', 500);

      jest.advanceTimersByTime(501);
      const factory2 = jest.fn().mockResolvedValue('new');
      await cache.remember('key', factory2, 500);
      expect(factory2).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('size / byteSize / getStats', () => {
    it('size() returns 0 for empty cache', () => {
      expect(memorize().size()).toBe(0);
    });

    it('size() reflects number of cached entries', () => {
      const cache = memorize();
      const middleware = cache();
      ['/a', '/b'].forEach((url) => {
        const { req, res, next } = createMockReqRes(url);
        middleware(req, res, next);
        (res as any).json({ url });
      });
      expect(cache.size()).toBe(2);
    });

    it('byteSize() returns 0 for empty cache', () => {
      expect(memorize().byteSize()).toBe(0);
    });

    it('byteSize() is positive after caching via set()', () => {
      const cache = memorize();
      cache.set('key', { data: 'hello' });
      expect(cache.byteSize()).toBeGreaterThan(0);
    });

    it('getStats() returns correct shape', () => {
      const cache = memorize({ maxEntries: 10 });
      cache.set('key', 'value');
      const stats = cache.getStats();
      expect(stats.entries).toBe(1);
      expect(stats.maxEntries).toBe(10);
      expect(stats.byteSize).toBeGreaterThan(0);
    });

    it('getStats() maxEntries is null when not configured', () => {
      expect(memorize().getStats().maxEntries).toBeNull();
    });
  });

  describe('maxEntries', () => {
    it('evicts LRU entry when limit is reached', () => {
      const cache = memorize({ maxEntries: 2 });
      cache.set('/a', 'a');
      cache.set('/b', 'b');
      cache.set('/c', 'c'); // evicts /a
      expect(cache.getValue('/a')).toBeUndefined();
      expect(cache.getValue('/b')).toBe('b');
      expect(cache.getValue('/c')).toBe('c');
    });

    it('emits Evict event', () => {
      const cache = memorize({ maxEntries: 1 });
      const evicted: string[] = [];
      cache.on(MemorizeEventType.Evict, (e) => evicted.push(e.key));
      cache.set('/a', 'a');
      cache.set('/b', 'b');
      expect(evicted).toEqual(['/a']);
    });
  });
});
