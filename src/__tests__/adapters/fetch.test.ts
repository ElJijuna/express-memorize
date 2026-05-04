import { memorize } from '../../memorize';
import { cacheFetchHandler } from '../../adapters/fetch';

const jsonHandler = async (_req: Request): Promise<Response> =>
  Response.json({ data: [] });

const textHandler = async (_req: Request): Promise<Response> =>
  new Response('pong', { status: 200, headers: { 'Content-Type': 'text/plain' } });

const errorHandler = async (_req: Request): Promise<Response> =>
  new Response('Not Found', { status: 404 });

function makeRequest(path = '/users', method = 'GET') {
  return new Request(`http://localhost${path}`, { method });
}

describe('Fetch adapter — cache MISS (first request)', () => {
  it('sets X-Cache: MISS on first request', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    const res = await handler(makeRequest());
    expect(res.headers.get('X-Cache')).toBe('MISS');
  });

  it('returns the handler response body on miss', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    const res = await handler(makeRequest());
    expect(await res.json()).toEqual({ data: [] });
  });

  it('returns 200 status on miss', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
  });

  it('does not cache non-2xx responses', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, errorHandler);
    await handler(makeRequest('/error'));
    expect(cache.get('/error')).toBeNull();
  });

  it('does not cache non-GET requests', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    await handler(makeRequest('/users', 'POST'));
    expect(cache.get('/users')).toBeNull();
  });

  it('passes non-GET requests through unchanged', async () => {
    const cache = memorize();
    const spy = jest.fn().mockResolvedValue(new Response('ok'));
    const handler = cacheFetchHandler(cache, spy);
    await handler(makeRequest('/users', 'POST'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('Fetch adapter — cache HIT (subsequent requests)', () => {
  it('sets X-Cache: HIT on second request', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    await handler(makeRequest());
    const res = await handler(makeRequest());
    expect(res.headers.get('X-Cache')).toBe('HIT');
  });

  it('returns cached body on hit', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    await handler(makeRequest());
    const res = await handler(makeRequest());
    expect(await res.json()).toEqual({ data: [] });
  });

  it('returns 200 status on hit', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    await handler(makeRequest());
    const res = await handler(makeRequest());
    expect(res.status).toBe(200);
  });

  it('restores Content-Type on hit', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, textHandler);
    await handler(makeRequest());
    const res = await handler(makeRequest());
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('does not call the original handler on a hit', async () => {
    const cache = memorize();
    const spy = jest.fn().mockResolvedValue(Response.json({ data: [] }));
    const handler = cacheFetchHandler(cache, spy);
    await handler(makeRequest());
    await handler(makeRequest());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('increments hit counter on cache hit', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    await handler(makeRequest());
    await handler(makeRequest());
    await handler(makeRequest());
    expect(cache.get('/users')!.hits).toBe(3);
  });
});

describe('Fetch adapter — noCache', () => {
  it('sets X-Cache: BYPASS when noCache is true', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler, { noCache: true });
    const res = await handler(makeRequest());
    expect(res.headers.get('X-Cache')).toBe('BYPASS');
  });

  it('does not store response when noCache is true', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler, { noCache: true });
    await handler(makeRequest());
    expect(cache.get('/users')).toBeNull();
  });

  it('still calls the original handler when noCache is true', async () => {
    const cache = memorize();
    const spy = jest.fn().mockResolvedValue(Response.json({ data: [] }));
    const handler = cacheFetchHandler(cache, spy, { noCache: true });
    await handler(makeRequest());
    await handler(makeRequest());
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('Fetch adapter — TTL', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('respects per-handler TTL', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler, { ttl: 500 });
    await handler(makeRequest());

    jest.advanceTimersByTime(499);
    expect(cache.get('/users')).not.toBeNull();

    jest.advanceTimersByTime(2);
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Fetch adapter — custom key', () => {
  it('uses custom key extractor', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler, {
      key: () => 'custom-key',
    });
    await handler(makeRequest());
    expect(cache.get('custom-key')).not.toBeNull();
    expect(cache.get('/users')).toBeNull();
  });

  it('includes query string in default key', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    await handler(makeRequest('/users?page=1'));
    expect(cache.get('/users?page=1')).not.toBeNull();
    expect(cache.get('/users')).toBeNull();
  });
});

describe('Fetch adapter — cache invalidation', () => {
  it('cache.delete() invalidates fetch-cached entries', async () => {
    const cache = memorize();
    const handler = cacheFetchHandler(cache, jsonHandler);
    await handler(makeRequest());
    cache.delete('/users');
    const res = await handler(makeRequest());
    expect(res.headers.get('X-Cache')).toBe('MISS');
  });
});
