import type { Context } from 'koa';
import { memorize } from '../../memorize';
import { createKoaMiddleware } from '../../adapters/koa';

interface TestContext extends Context {
  headers: Record<string, string>;
}

function createContext(method = 'GET', url = '/users'): TestContext {
  const headers: Record<string, string> = {};
  const ctx = {
    method,
    url,
    originalUrl: url,
    status: 404,
    body: undefined,
    type: '',
    response: {
      type: '',
    },
    headers,
    set(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
  };

  return ctx as unknown as TestContext;
}

function header(ctx: TestContext, name: string): string | undefined {
  return ctx.headers[name.toLowerCase()];
}

async function sendUsers(ctx: TestContext): Promise<void> {
  ctx.status = 200;
  ctx.body = { data: [] };
}

describe('Koa adapter — cache MISS (first request)', () => {
  it('sets X-Cache: MISS on first request', async () => {
    const ctx = createContext();
    await createKoaMiddleware(memorize())(ctx, async () => {
      ctx.status = 200;
      ctx.body = { data: [] };
    });

    expect(header(ctx, 'X-Cache')).toBe('MISS');
  });

  it('returns the downstream response on a miss', async () => {
    const ctx = createContext();
    await createKoaMiddleware(memorize())(ctx, async () => {
      ctx.status = 200;
      ctx.body = { data: [] };
    });

    expect(ctx.status).toBe(200);
    expect(ctx.body).toEqual({ data: [] });
  });

  it('does not cache non-2xx responses', async () => {
    const cache = memorize();
    const ctx = createContext('GET', '/error');
    await createKoaMiddleware(cache)(ctx, async () => {
      ctx.status = 404;
      ctx.body = 'Not Found';
    });

    expect(cache.get('/error')).toBeNull();
  });

  it('does not cache non-GET requests', async () => {
    const cache = memorize();
    const ctx = createContext('POST');
    await createKoaMiddleware(cache)(ctx, async () => {
      ctx.status = 201;
      ctx.body = { created: true };
    });

    expect(cache.get('/users')).toBeNull();
  });
});

describe('Koa adapter — cache HIT (subsequent requests)', () => {
  it('sets X-Cache: HIT on second request', async () => {
    const cache = memorize();
    const middleware = createKoaMiddleware(cache);
    const missCtx = createContext();
    await middleware(missCtx, async () => sendUsers(missCtx));

    const ctx = createContext();
    await middleware(ctx, jest.fn());
    expect(header(ctx, 'X-Cache')).toBe('HIT');
  });

  it('returns cached body on hit', async () => {
    const cache = memorize();
    cache._store.set('/users', { body: { data: [] }, statusCode: 200, contentType: 'application/json' });

    const ctx = createContext();
    await createKoaMiddleware(cache)(ctx, jest.fn());
    expect(ctx.body).toEqual({ data: [] });
  });

  it('skips downstream middleware on hit', async () => {
    const cache = memorize();
    const middleware = createKoaMiddleware(cache);
    const next = jest.fn();

    const missCtx = createContext();
    await middleware(missCtx, async () => sendUsers(missCtx));

    await middleware(createContext(), next);
    expect(next).not.toHaveBeenCalled();
  });

  it('restores status and Content-Type on hit', async () => {
    const cache = memorize();
    cache._store.set('/text', { body: 'pong', statusCode: 204, contentType: 'text/plain' });

    const ctx = createContext('GET', '/text');
    await createKoaMiddleware(cache)(ctx, jest.fn());

    expect(ctx.status).toBe(204);
    expect(ctx.type).toBe('text/plain');
    expect(ctx.body).toBe('pong');
  });

  it('increments hit counter on cache hit', async () => {
    const cache = memorize();
    const middleware = createKoaMiddleware(cache);
    const missCtx = createContext();
    await middleware(missCtx, async () => sendUsers(missCtx));
    await middleware(createContext(), jest.fn());
    await middleware(createContext(), jest.fn());

    expect(cache.get('/users')!.hits).toBe(3);
  });
});

describe('Koa adapter — noCache', () => {
  it('sets X-Cache: BYPASS when noCache is true', async () => {
    const ctx = createContext();
    await createKoaMiddleware(memorize(), { noCache: true })(ctx, async () => {
      ctx.status = 200;
      ctx.body = { data: [] };
    });

    expect(header(ctx, 'X-Cache')).toBe('BYPASS');
  });

  it('does not store response when noCache is true', async () => {
    const cache = memorize();
    const ctx = createContext();
    await createKoaMiddleware(cache, { noCache: true })(ctx, async () => sendUsers(ctx));

    expect(cache.get('/users')).toBeNull();
  });
});

describe('Koa adapter — TTL', () => {
  afterEach(() => jest.useRealTimers());

  it('respects global TTL from memorize options', async () => {
    const cache = memorize({ ttl: 500 });
    const ctx = createContext();
    await createKoaMiddleware(cache)(ctx, async () => sendUsers(ctx));
    const cached = cache.get('/users');
    expect(cached).not.toBeNull();

    jest.useFakeTimers({ now: cached!.expiresAt! + 1 });
    expect(cache.get('/users')).toBeNull();
  });

  it('respects per-route TTL', async () => {
    const cache = memorize();
    const ctx = createContext();
    await createKoaMiddleware(cache, { ttl: 500 })(ctx, async () => sendUsers(ctx));
    const cached = cache.get('/users');
    expect(cached).not.toBeNull();

    jest.useFakeTimers({ now: cached!.expiresAt! - 1 });
    expect(cache.get('/users')).not.toBeNull();

    jest.setSystemTime(cached!.expiresAt! + 1);
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Koa adapter — custom key', () => {
  it('uses custom key extractor', async () => {
    const cache = memorize();
    const ctx = createContext();
    await createKoaMiddleware(cache, { key: () => 'custom-key' })(ctx, async () => sendUsers(ctx));

    expect(cache.get('custom-key')).not.toBeNull();
    expect(cache.get('/users')).toBeNull();
  });

  it('includes query string in default key', async () => {
    const cache = memorize();
    const ctx = createContext('GET', '/users?page=1');
    await createKoaMiddleware(cache)(ctx, async () => sendUsers(ctx));

    expect(cache.get('/users?page=1')).not.toBeNull();
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Koa adapter — cache invalidation', () => {
  it('cache.delete() invalidates Koa-cached entries', async () => {
    const cache = memorize();
    const middleware = createKoaMiddleware(cache);

    const missCtx = createContext();
    await middleware(missCtx, async () => sendUsers(missCtx));
    cache.delete('/users');

    const ctx = createContext();
    await middleware(ctx, async () => {
      ctx.status = 200;
      ctx.body = { data: [] };
    });

    expect(header(ctx, 'X-Cache')).toBe('MISS');
  });
});
