import { Hono } from 'hono';
import { memorize } from '../../memorize';
import { createHonoMiddleware } from '../../adapters/hono';

function buildApp(cache = memorize(), options?: Parameters<typeof createHonoMiddleware>[1]) {
  const app = new Hono();
  app.get('/users', createHonoMiddleware(cache, options), (c) => c.json({ data: [] }));
  app.post('/users', createHonoMiddleware(cache, options), (c) => c.json({ created: true }));
  app.get('/error', createHonoMiddleware(cache, options), (c) => c.text('Not Found', 404));
  return app;
}

describe('Hono adapter — cache MISS (first request)', () => {
  it('sets X-Cache: MISS on first request', async () => {
    const res = await buildApp().request('/users');
    expect(res.headers.get('X-Cache')).toBe('MISS');
  });

  it('returns the handler response on a miss', async () => {
    const res = await buildApp().request('/users');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: [] });
  });

  it('does not cache non-2xx responses', async () => {
    const cache = memorize();
    const app = buildApp(cache);
    await app.request('/error');
    expect(cache.get('/error')).toBeNull();
  });

  it('does not cache non-GET requests', async () => {
    const cache = memorize();
    const app = buildApp(cache);
    await app.request('/users', { method: 'POST' });
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Hono adapter — cache HIT (subsequent requests)', () => {
  it('sets X-Cache: HIT on second request', async () => {
    const app = buildApp();
    await app.request('/users');
    const res = await app.request('/users');
    expect(res.headers.get('X-Cache')).toBe('HIT');
  });

  it('returns cached body on hit', async () => {
    const app = buildApp();
    await app.request('/users');
    const res = await app.request('/users');
    const body = await res.json();
    expect(body).toEqual({ data: [] });
  });

  it('returns 200 status on hit', async () => {
    const app = buildApp();
    await app.request('/users');
    const res = await app.request('/users');
    expect(res.status).toBe(200);
  });

  it('restores Content-Type on hit', async () => {
    const app = buildApp();
    await app.request('/users');
    const res = await app.request('/users');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('increments hit counter on cache hit', async () => {
    const cache = memorize();
    const app = buildApp(cache);
    await app.request('/users');
    await app.request('/users');
    await app.request('/users');
    expect(cache.get('/users')!.hits).toBe(3);
  });
});

describe('Hono adapter — noCache', () => {
  it('sets X-Cache: BYPASS when noCache is true', async () => {
    const res = await buildApp(memorize(), { noCache: true }).request('/users');
    expect(res.headers.get('X-Cache')).toBe('BYPASS');
  });

  it('does not store response when noCache is true', async () => {
    const cache = memorize();
    await buildApp(cache, { noCache: true }).request('/users');
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Hono adapter — TTL', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('respects per-route TTL', async () => {
    const cache = memorize();
    const app = buildApp(cache, { ttl: 500 });
    await app.request('/users');

    jest.advanceTimersByTime(499);
    expect(cache.get('/users')).not.toBeNull();

    jest.advanceTimersByTime(2);
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Hono adapter — custom key', () => {
  it('uses custom key extractor', async () => {
    const cache = memorize();
    const app = new Hono();
    app.get('/users', createHonoMiddleware(cache, { key: () => 'custom-key' }), (c) =>
      c.json({ data: [] }),
    );

    await app.request('/users');
    expect(cache.get('custom-key')).not.toBeNull();
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Hono adapter — shared store with Express adapter', () => {
  it('cache.delete() invalidates Hono-cached entries', async () => {
    const cache = memorize();
    const app = buildApp(cache);

    await app.request('/users');
    expect(cache.get('/users')).not.toBeNull();

    cache.delete('/users');
    expect(cache.get('/users')).toBeNull();
  });
});
