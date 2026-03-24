import { Request, NextFunction } from 'express';
import { memorize } from '../memorize';

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
});
