import {
  MemorizeCacheKey,
  MemorizeInterceptor,
  MemorizeModule,
  MemorizeNoCache,
  MemorizeTtl,
} from '../../adapters/nestjs';
import { memorize } from '../../memorize';

function observableOf<T>(value: T) {
  return {
    subscribe(observer: { next?: (value: T) => void; complete?: () => void }) {
      observer.next?.(value);
      observer.complete?.();

      return { unsubscribe() {} };
    },
  };
}

function observableError(error: unknown) {
  return {
    subscribe(observer: { error?: (error: unknown) => void }) {
      observer.error?.(error);

      return { unsubscribe() {} };
    },
  };
}

function observableEmpty() {
  return {
    subscribe(observer: { complete?: () => void }) {
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

function subscribe<T>(source: {
  subscribe: (observer: { next?: (value: T) => void; complete?: () => void }) => unknown;
}) {
  let result: T | undefined;

  source.subscribe({
    next: (value) => {
      result = value;
    },
  });

  return result;
}

describe('NestJS adapter', () => {
  it('stores handler results on cache miss and marks MISS', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context, headers } = createContext();
    const result = subscribe(
      interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }),
    );

    expect(result).toEqual({ data: [] });
    expect(headers['X-Cache']).toBe('MISS');
    expect(cache.get('/users')).not.toBeNull();
  });

  it('supports function subscribers on cache miss observables', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext();
    const next = jest.fn();
    const complete = jest.fn();

    interceptor
      .intercept(context, { handle: () => observableOf({ data: [] }) })
      .subscribe(next, undefined, complete);

    expect(next).toHaveBeenCalledWith({ data: [] });
    expect(complete).toHaveBeenCalled();
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

  it('parses cached JSON string bodies on hit', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext();

    cache._store.set('/users', {
      body: JSON.stringify({ data: ['cached'] }),
      statusCode: 200,
      contentType: 'application/json',
    });

    const result = subscribe(interceptor.intercept(context, { handle: jest.fn() }));

    expect(result).toEqual({ data: ['cached'] });
  });

  it('returns cached non-JSON strings unchanged', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext();

    cache._store.set('/users', {
      body: 'not json',
      statusCode: 200,
      contentType: 'text/plain',
    });

    const result = subscribe(interceptor.intercept(context, { handle: jest.fn() }));

    expect(result).toBe('not json');
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

  it('uses default request url when originalUrl is missing', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext({ url: undefined as unknown as string });

    context.switchToHttp = () => ({
      getRequest: () => ({ method: 'GET', url: '/fallback-url' }),
      getResponse: () => ({ setHeader: jest.fn() }),
    });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

    expect(cache.get('/fallback-url')).not.toBeNull();
  });

  it('uses empty key when request has no url fields', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext();

    context.switchToHttp = () => ({
      getRequest: () => ({ method: 'GET' }),
      getResponse: () => ({ setHeader: jest.fn() }),
    });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

    expect(cache.get('')).not.toBeNull();
  });

  it('uses the module key generator when no metadata key is present', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache, {
      key: ({ request }) => `generated:${request.originalUrl}`,
    });
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

  it('does not set cache headers when response headers were already sent', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext();
    const setHeader = jest.fn();

    context.switchToHttp = () => ({
      getRequest: () => ({ method: 'GET', originalUrl: '/users' }),
      getResponse: () => ({ headersSent: true, setHeader }),
    });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

    expect(setHeader).not.toHaveBeenCalled();
    expect(cache.get('/users')).toBeNull();
  });

  it('sets headers with response.header when setHeader is unavailable', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const header = jest.fn();
    const { context } = createContext();

    context.switchToHttp = () => ({
      getRequest: () => ({ method: 'GET', originalUrl: '/users' }),
      getResponse: () => ({ header }),
    });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

    expect(header).toHaveBeenCalledWith('X-Cache', 'MISS');
  });

  it('does not cache non-GET handlers', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext({ method: 'POST' });

    subscribe(interceptor.intercept(context, { handle: () => observableOf({ created: true }) }));

    expect(cache.get('/users')).toBeNull();
  });

  it('does not cache undefined handler results', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext();

    subscribe(interceptor.intercept(context, { handle: () => observableOf(undefined) }));

    expect(cache.get('/users')).toBeNull();
  });

  it('does not cache when observable completes without a value', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext();

    subscribe(interceptor.intercept(context, { handle: () => observableEmpty() }));

    expect(cache.get('/users')).toBeNull();
  });

  it('forwards observable errors without caching', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext();
    const error = new Error('boom');
    const seen = jest.fn();

    interceptor.intercept(context, { handle: () => observableError(error) }).subscribe({
      error: seen,
    });

    expect(seen).toHaveBeenCalledWith(error);
    expect(cache.get('/users')).toBeNull();
  });

  it('supports function subscribers for cached hits', () => {
    const cache = memorize();
    const interceptor = new MemorizeInterceptor(cache);
    const { context } = createContext();
    const next = jest.fn();
    const complete = jest.fn();

    cache._store.set('/users', {
      body: { data: [] },
      statusCode: 200,
      contentType: 'application/json',
    });

    interceptor.intercept(context, { handle: jest.fn() }).subscribe(next, undefined, complete);

    expect(next).toHaveBeenCalledWith({ data: [] });
    expect(complete).toHaveBeenCalled();
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

  it('uses Reflect metadata APIs when available', () => {
    const defineMetadata = jest.fn();
    const metadata = new WeakMap<object, Map<string, unknown>>();
    const getMetadata = jest.fn((key: string, target: object) => metadata.get(target)?.get(key));
    const originalDefineMetadata = (Reflect as unknown as { defineMetadata?: unknown })
      .defineMetadata;
    const originalGetMetadata = (Reflect as unknown as { getMetadata?: unknown }).getMetadata;

    (Reflect as unknown as { defineMetadata: typeof defineMetadata }).defineMetadata = (
      key,
      value,
      target,
    ) => {
      defineMetadata(key, value, target);
      const values = metadata.get(target) ?? new Map<string, unknown>();

      values.set(key, value);
      metadata.set(target, values);
    };

    (Reflect as unknown as { getMetadata: typeof getMetadata }).getMetadata = getMetadata;

    try {
      const cache = memorize();
      const interceptor = new MemorizeInterceptor(cache);
      const handler = function handler() {};

      MemorizeCacheKey('reflect-users')(handler);
      const { context } = createContext({ handler });

      subscribe(interceptor.intercept(context, { handle: () => observableOf({ data: [] }) }));

      expect(defineMetadata).toHaveBeenCalled();
      expect(getMetadata).toHaveBeenCalled();
      expect(cache.get('reflect-users')).not.toBeNull();
    } finally {
      (Reflect as unknown as { defineMetadata?: unknown }).defineMetadata = originalDefineMetadata;
      (Reflect as unknown as { getMetadata?: unknown }).getMetadata = originalGetMetadata;
    }
  });

  it('provides a dynamic module with cache and interceptor providers', () => {
    const module = MemorizeModule.forRoot({ ttl: 30_000 });

    expect(module.module).toBe(MemorizeModule);
    expect(module.providers).toHaveLength(3);
    expect(module.exports).toContain(MemorizeInterceptor);
  });

  it('module providers create cache and interceptor instances', () => {
    const module = MemorizeModule.forRoot({ ttl: 30_000 });
    const cacheProvider = module.providers[1] as { useFactory: () => ReturnType<typeof memorize> };
    const interceptorProvider = module.providers[2] as {
      useFactory: (cache: ReturnType<typeof memorize>, options: object) => MemorizeInterceptor;
    };
    const cache = cacheProvider.useFactory();
    const interceptor = interceptorProvider.useFactory(cache, {});

    expect(cache.getStats().entries).toBe(0);
    expect(interceptor).toBeInstanceOf(MemorizeInterceptor);
  });
});
