import Fastify from 'fastify';
import { memorize } from '../../memorize';
import { createFastifyPlugin, createFastifyPreHandler } from '../../adapters/fastify';

function buildApp(cache = memorize(), options?: Parameters<typeof createFastifyPlugin>[1]) {
  const app = Fastify();
  app.register(createFastifyPlugin(cache, options));
  app.get('/users', async () => ({ data: [] }));
  app.post('/users', async () => ({ created: true }));
  app.get('/error', async (_request, reply) => reply.code(404).send('Not Found'));
  return app;
}

describe('Fastify adapter — cache MISS (first request)', () => {
  it('sets X-Cache: MISS on first request', async () => {
    const res = await buildApp().inject('/users');
    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('returns the handler response on a miss', async () => {
    const res = await buildApp().inject('/users');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [] });
  });

  it('does not cache non-2xx responses', async () => {
    const cache = memorize();
    const app = buildApp(cache);
    await app.inject('/error');
    expect(cache.get('/error')).toBeNull();
  });

  it('does not cache non-GET requests', async () => {
    const cache = memorize();
    const app = buildApp(cache);
    await app.inject({ url: '/users', method: 'POST' });
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Fastify adapter — cache HIT (subsequent requests)', () => {
  it('sets X-Cache: HIT on second request', async () => {
    const app = buildApp();
    await app.inject('/users');
    const res = await app.inject('/users');
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('returns cached body on hit', async () => {
    const app = buildApp();
    await app.inject('/users');
    const res = await app.inject('/users');
    expect(res.json()).toEqual({ data: [] });
  });

  it('skips the route handler on cache hit', async () => {
    const cache = memorize();
    const app = Fastify();
    const handler = jest.fn().mockResolvedValue({ data: [] });

    app.register(createFastifyPlugin(cache));
    app.get('/users', handler);

    await app.inject('/users');
    await app.inject('/users');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('restores Content-Type on hit', async () => {
    const app = buildApp();
    await app.inject('/users');
    const res = await app.inject('/users');
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('increments hit counter on cache hit', async () => {
    const cache = memorize();
    const app = buildApp(cache);
    await app.inject('/users');
    await app.inject('/users');
    await app.inject('/users');
    expect(cache.get('/users')!.hits).toBe(3);
  });
});

describe('Fastify adapter — noCache', () => {
  it('sets X-Cache: BYPASS when noCache is true', async () => {
    const res = await buildApp(memorize(), { noCache: true }).inject('/users');
    expect(res.headers['x-cache']).toBe('BYPASS');
  });

  it('does not store response when noCache is true', async () => {
    const cache = memorize();
    await buildApp(cache, { noCache: true }).inject('/users');
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Fastify adapter — TTL', () => {
  afterEach(() => jest.useRealTimers());

  it('respects global TTL from memorize options', async () => {
    const cache = memorize({ ttl: 500 });
    const app = buildApp(cache);
    await app.inject('/users');
    const cached = cache.get('/users');
    expect(cached).not.toBeNull();

    jest.useFakeTimers({ now: cached!.expiresAt! + 1 });
    expect(cache.get('/users')).toBeNull();
  });

  it('respects per-route TTL', async () => {
    const cache = memorize();
    const app = buildApp(cache, { ttl: 500 });
    await app.inject('/users');
    const cached = cache.get('/users');
    expect(cached).not.toBeNull();

    jest.useFakeTimers({ now: cached!.expiresAt! - 1 });
    expect(cache.get('/users')).not.toBeNull();

    jest.setSystemTime(cached!.expiresAt! + 1);
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Fastify adapter — custom key', () => {
  it('uses custom key extractor', async () => {
    const cache = memorize();
    const app = buildApp(cache, { key: () => 'custom-key' });

    await app.inject('/users');
    expect(cache.get('custom-key')).not.toBeNull();
    expect(cache.get('/users')).toBeNull();
  });

  it('includes query string in default key', async () => {
    const cache = memorize();
    const app = buildApp(cache);

    await app.inject('/users?page=1');
    expect(cache.get('/users?page=1')).not.toBeNull();
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Fastify adapter — route-level preHandler', () => {
  it('supports route-level TTL and invalidation', async () => {
    const cache = memorize();
    const app = Fastify();

    app.get(
      '/users',
      { preHandler: createFastifyPreHandler(cache, { ttl: 500 }) },
      async () => ({ data: [] }),
    );

    await app.inject('/users');
    expect(cache.get('/users')).not.toBeNull();

    cache.delete('/users');
    const res = await app.inject('/users');
    expect(res.headers['x-cache']).toBe('MISS');
  });
});
