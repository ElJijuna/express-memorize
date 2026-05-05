import { memorize } from '../../memorize';
import {
  MemorizeCacheKey,
  MemorizeInterceptor,
  MemorizeModule,
  MemorizeNoCache,
  MemorizeTtl,
} from '../../adapters/nestjs';

function observableOf<T>(value: T) {
  return {
    subscribe(observer: { next?: (value: T) => void; complete?: () => void }) {
      observer.next?.(value);
      observer.complete?.();
      return { unsubscribe() {} };
    },
  };
}

function createContext({
  method = 'GET',
  url = '/users',
  handler = function handler() {},
  controller = class Controller {},
}: {
  method?: string;
  url?: string;
  handler?: object;
  controller?: object;
} = {}) {
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  };

  return {
    headers,
    context: {
      getClass: () => controller,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({ method, originalUrl: url }),
        getResponse: () => response,
      }),
    },
  };
}

function subscribe<T>(source: { subscribe: (observer: { next?: (value: T) => void; complete?: () => void }) => unknown }) {
  let result: T | undefined;
  source.subscribe({ next: (value) => { result = value; } });
  return result;
}

describe('NestJS adapter', () => {
  it('stores handler results on cache miss and marks MISS', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context, headers } = createContext();

    const result = subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

    expect(result).toEqual({ data: [] });
    expect(headers['X-Cache']).toBe('MISS');
    expect(cache.get('/users')).not.toBeNull();
  });

  it('returns cached values on hit without calling the handler', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context, headers } = createContext();
    const handler = jest.fn(() => observableOf({ data: [] }));

    subscribe(interceptor.intercept(context, { handle: handler }));
    const second = subscribe(interceptor.intercept(context, { handle: handler }));

    expect(second).toEqual({ data: [] });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(headers['X-Cache']).toBe('HIT');
  });

  it('respects method-level TTL metadata', () => {
    jest.useFakeTimers();
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const handler = function handler() {};
    MemorizeTtl(500)(handler);
    const { context } = createContext({ handler });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));
    jest.advanceTimersByTime(501);

    expect(cache.get('/users')).toBeNull();
    jest.useRealTimers();
  });

  it('uses custom cache key metadata', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const handler = function handler() {};
    MemorizeCacheKey('users:list')(handler);
    const { context } = createContext({ handler });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

    expect(cache.get('users:list')).not.toBeNull();
    expect(cache.get('/users')).toBeNull();
  });

  it('uses the module key generator when no metadata key is present', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache, { key: ({ request }) => `generated:${request.originalUrl}` });
    const { context } = createContext();

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

    expect(cache.get('generated:/users')).not.toBeNull();
  });

  it('bypasses cache when no-cache metadata is present', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const handler = function handler() {};
    MemorizeNoCache()(handler);
    const { context, headers } = createContext({ handler });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

    expect(headers['X-Cache']).toBe('BYPASS');
    expect(cache.get('/users')).toBeNull();
  });

  it('does not cache non-GET handlers', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext({ method: 'POST' });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ created: true }) }));

    expect(cache.get('/users')).toBeNull();
  });

  it('supports controller-level metadata', () => {
    class UsersController {}
    MemorizeCacheKey('controller-users')(UsersController);
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext({ controller: UsersController });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

    expect(cache.get('controller-users')).not.toBeNull();
  });

  it('provides a dynamic module with cache and interceptor providers', () => {
    const module = MemorizeModule.forRoot({ ttl: 30_000 });

    expect(module.module).toBe(MemorizeModule);
    expect(module.providers).toHaveLength(3);
    expect(module.exports).toContain(MemorizeInterceptor);
  });
});
