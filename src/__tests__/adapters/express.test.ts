import type { NextFunction, Request, Response } from 'express';
import { createExpressAdapter } from '../../adapters/express';
import { memorize } from '../../memorize';

function createMockReqRes(url = '/users', method = 'GET') {
  const responseHeaders: Record<string, string> = {};
  const res = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;

      return this;
    },
    setHeader(name: string, value: string) {
      responseHeaders[name] = value;

      return this;
    },
    getHeader(name: string) {
      return responseHeaders[name];
    },
    send: jest.fn().mockReturnThis(),
    json(body: unknown) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');

      return this.send(JSON.stringify(body));
    },
  } as unknown as Response;
  const req = { originalUrl: url, method } as unknown as Request;
  const next = jest.fn() as unknown as NextFunction;

  return { req, res, next, responseHeaders };
}

describe('createExpressAdapter (express-memorize/express)', () => {
  it('returns a RequestHandler that sets X-Cache: MISS on first request', () => {
    const cache = memorize();
    const handler = createExpressAdapter(cache);
    const { req, res, next, responseHeaders } = createMockReqRes();

    handler(req, res, next);
    res.json({ data: [] });
    expect(responseHeaders['X-Cache']).toBe('MISS');
  });

  it('returns a RequestHandler that sets X-Cache: HIT on second request', () => {
    const cache = memorize();
    const handler = createExpressAdapter(cache);
    const { req, res, next } = createMockReqRes();

    handler(req, res, next);
    res.json({ data: [] });

    const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes();

    handler(req2, res2, next2);
    expect(h2['X-Cache']).toBe('HIT');
    expect(next2).not.toHaveBeenCalled();
  });

  it('shares the store with cache.express()', () => {
    const cache = memorize();
    // Prime via cache.express()
    const { req, res, next } = createMockReqRes('/ping');

    cache.express()(req, res, next);
    res.json({ ok: true });

    // Hit via createExpressAdapter
    const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes('/ping');

    createExpressAdapter(cache)(req2, res2, next2);
    expect(h2['X-Cache']).toBe('HIT');
    expect(next2).not.toHaveBeenCalled();
  });

  it('respects per-route TTL override', () => {
    jest.useFakeTimers();
    const cache = memorize({ ttl: 60_000 });
    const handler = createExpressAdapter(cache, { ttl: 500 });
    const { req, res, next } = createMockReqRes();

    handler(req, res, next);
    res.json({ ok: true });

    jest.advanceTimersByTime(600);
    expect(cache.get('/users')).toBeNull();
    jest.useRealTimers();
  });

  it('sets X-Cache: BYPASS when noCache is true', () => {
    const cache = memorize();
    const handler = createExpressAdapter(cache, { noCache: true });
    const { req, res, next, responseHeaders } = createMockReqRes();

    handler(req, res, next);
    expect(responseHeaders['X-Cache']).toBe('BYPASS');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('uses a custom key extractor when provided', () => {
    const cache = memorize();
    const handler = createExpressAdapter(cache, {
      key: (req) => req.originalUrl.split('?')[0] ?? req.originalUrl,
    });
    const { req, res, next } = createMockReqRes('/users?page=1');

    handler(req, res, next);
    res.json({ data: [] });

    // Different query string, same extracted key → served from cache
    const {
      req: req2,
      res: res2,
      next: next2,
      responseHeaders: h2,
    } = createMockReqRes('/users?page=2');

    handler(req2, res2, next2);
    expect(h2['X-Cache']).toBe('HIT');
    expect(next2).not.toHaveBeenCalled();
    expect(cache.get('/users')).not.toBeNull();
  });

  it('bypasses the cache when shouldCache returns false', () => {
    const cache = memorize();
    const handler = createExpressAdapter(cache, { shouldCache: () => false });
    const { req, res, next, responseHeaders } = createMockReqRes();

    handler(req, res, next);

    expect(responseHeaders['X-Cache']).toBe('BYPASS');
    expect(next).toHaveBeenCalledTimes(1);

    res.json({ data: [] });
    expect(cache.size()).toBe(0);
  });

  it('caches normally when shouldCache returns true', () => {
    const cache = memorize();
    const handler = createExpressAdapter(cache, { shouldCache: () => true });
    const { req, res, next } = createMockReqRes();

    handler(req, res, next);
    res.json({ data: [] });

    const { req: req2, res: res2, next: next2, responseHeaders: h2 } = createMockReqRes();

    handler(req2, res2, next2);
    expect(h2['X-Cache']).toBe('HIT');
    expect(next2).not.toHaveBeenCalled();
  });

  it('passes the request and response to shouldCache', () => {
    const cache = memorize();
    const shouldCache = jest.fn().mockReturnValue(true);
    const handler = createExpressAdapter(cache, { shouldCache });
    const { req, res, next } = createMockReqRes();

    handler(req, res, next);
    expect(shouldCache).toHaveBeenCalledWith(req, res);
  });
});
