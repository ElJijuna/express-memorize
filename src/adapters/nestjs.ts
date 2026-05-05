import { memorize } from '../memorize';
import type { Memorize } from '../domain/Memorize';
import type { MemorizeOptions } from '../domain/MemorizeOptions';

export const MEMORIZE_CACHE = Symbol('MEMORIZE_CACHE');
export const MEMORIZE_MODULE_OPTIONS = Symbol('MEMORIZE_MODULE_OPTIONS');

const CACHE_KEY_METADATA = 'express-memorize:nestjs:cache-key';
const TTL_METADATA = 'express-memorize:nestjs:ttl';
const NO_CACHE_METADATA = 'express-memorize:nestjs:no-cache';

type MetadataTarget = object;

interface MetadataReflect {
  defineMetadata?: (metadataKey: string, metadataValue: unknown, target: MetadataTarget) => void;
  getMetadata?: (metadataKey: string, target: MetadataTarget) => unknown;
}

export interface MemorizeNestExecutionContext {
  getClass(): MetadataTarget;
  getHandler(): MetadataTarget;
  switchToHttp(): {
    getRequest(): MemorizeNestHttpRequest;
    getResponse(): MemorizeNestHttpResponse;
  };
}

export interface MemorizeNestCallHandler<T = unknown> {
  handle(): MemorizeNestObservable<T>;
}

export interface MemorizeNestObservable<T = unknown> {
  subscribe(observerOrNext?: Partial<ObserverLike<T>> | ((value: T) => void), error?: (error: unknown) => void, complete?: () => void): unknown;
}

interface ObserverLike<T = unknown> {
  next(value: T): void;
  error(error: unknown): void;
  complete(): void;
}

export interface MemorizeNestHttpRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
}

export interface MemorizeNestHttpResponse {
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
  header?: (name: string, value: string) => void;
  headersSent?: boolean;
}

export interface MemorizeNestKeyContext {
  context: MemorizeNestExecutionContext;
  request: MemorizeNestHttpRequest;
}

export interface MemorizeNestOptions extends MemorizeOptions {
  /**
   * Custom request-based cache key generator. Defaults to
   * `request.originalUrl ?? request.url`.
   */
  key?: (ctx: MemorizeNestKeyContext) => string;
}

interface DynamicModuleLike {
  module: unknown;
  providers: unknown[];
  exports: unknown[];
  global?: boolean;
}

const metadataFallback = new WeakMap<MetadataTarget, Map<string, unknown>>();

function setMetadata(key: string, value: unknown, target: MetadataTarget): void {
  const reflect = Reflect as MetadataReflect;
  if (reflect.defineMetadata) {
    reflect.defineMetadata(key, value, target);
    return;
  }

  const existing = metadataFallback.get(target) ?? new Map<string, unknown>();
  existing.set(key, value);
  metadataFallback.set(target, existing);
}

function getOwnMetadata<T>(key: string, target: MetadataTarget): T | undefined {
  const reflect = Reflect as MetadataReflect;
  const value = reflect.getMetadata ? reflect.getMetadata(key, target) : metadataFallback.get(target)?.get(key);
  return value as T | undefined;
}

function getMetadata<T>(key: string, context: MemorizeNestExecutionContext): T | undefined {
  return getOwnMetadata<T>(key, context.getHandler()) ?? getOwnMetadata<T>(key, context.getClass());
}

function createMetadataDecorator(key: string, value: unknown): MethodDecorator & ClassDecorator {
  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    setMetadata(key, value, descriptor?.value ?? target);
  };
}

function setCacheHeader(response: MemorizeNestHttpResponse | undefined, value: 'HIT' | 'MISS' | 'BYPASS'): void {
  if (!response || response.headersSent) return;
  if (response.setHeader) response.setHeader('X-Cache', value);
  else if (response.header) response.header('X-Cache', value);
}

function defaultKey(request: MemorizeNestHttpRequest): string {
  return request.originalUrl ?? request.url ?? '';
}

function parseCachedBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function toObservable<T>(value: T): MemorizeNestObservable<T> {
  return {
    subscribe(observerOrNext?: Partial<ObserverLike<T>> | ((value: T) => void), _error?: (error: unknown) => void, complete?: () => void) {
      if (typeof observerOrNext === 'function') {
        observerOrNext(value);
        complete?.();
        return { unsubscribe() {} };
      }

      observerOrNext?.next?.(value);
      observerOrNext?.complete?.();
      return { unsubscribe() {} };
    },
  };
}

function normalizeObserver<T>(
  observerOrNext?: Partial<ObserverLike<T>> | ((value: T) => void),
  error?: (error: unknown) => void,
  complete?: () => void,
): Partial<ObserverLike<T>> {
  if (typeof observerOrNext === 'function') {
    return { next: observerOrNext, error, complete };
  }
  return observerOrNext ?? {};
}

function cacheObservable<T>(
  source: MemorizeNestObservable<T>,
  onCompleteValue: (value: T) => void,
): MemorizeNestObservable<T> {
  return {
    subscribe(observerOrNext?: Partial<ObserverLike<T>> | ((value: T) => void), error?: (error: unknown) => void, complete?: () => void) {
      const observer = normalizeObserver(observerOrNext, error, complete);
      let hasValue = false;
      let latestValue: T;

      return source.subscribe({
        next(value: T) {
          hasValue = true;
          latestValue = value;
          observer.next?.(value);
        },
        error(err: unknown) {
          observer.error?.(err);
        },
        complete() {
          if (hasValue) onCompleteValue(latestValue);
          observer.complete?.();
        },
      });
    },
  };
}

/**
 * Decorates a controller or handler with a fixed cache key.
 */
export function MemorizeCacheKey(key: string): MethodDecorator & ClassDecorator {
  return createMetadataDecorator(CACHE_KEY_METADATA, key);
}

/**
 * Decorates a controller or handler with a TTL override in milliseconds.
 */
export function MemorizeTtl(ttl: number): MethodDecorator & ClassDecorator {
  return createMetadataDecorator(TTL_METADATA, ttl);
}

/**
 * Decorates a controller or handler so the interceptor bypasses cache reads and writes.
 */
export function MemorizeNoCache(): MethodDecorator & ClassDecorator {
  return createMetadataDecorator(NO_CACHE_METADATA, true);
}

/**
 * NestJS interceptor backed by a shared {@link Memorize} cache instance.
 *
 * Register through {@link MemorizeModule.forRoot} for dependency injection, or
 * instantiate directly in tests and small applications.
 */
export class MemorizeInterceptor {
  constructor(
    private readonly cache: Memorize = memorize(),
    private readonly options: MemorizeNestOptions = {},
  ) {}

  intercept(context: MemorizeNestExecutionContext, next: MemorizeNestCallHandler): MemorizeNestObservable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();

    if (request.method !== 'GET') {
      return next.handle();
    }

    const noCache = getMetadata<boolean>(NO_CACHE_METADATA, context);
    if (noCache) {
      setCacheHeader(response, 'BYPASS');
      return next.handle();
    }

    const metadataKey = getMetadata<string>(CACHE_KEY_METADATA, context);
    const key = metadataKey ?? this.options.key?.({ context, request }) ?? defaultKey(request);
    const ttl = getMetadata<number>(TTL_METADATA, context) ?? this.options.ttl;
    const cached = this.cache._store.getRaw(key);

    if (cached) {
      setCacheHeader(response, 'HIT');
      return toObservable(parseCachedBody(cached.body));
    }

    setCacheHeader(response, 'MISS');
    return cacheObservable(next.handle(), (value) => {
      if (value === undefined || response.headersSent) return;
      this.cache.set(key, value, ttl);
    });
  }
}

/**
 * Dynamic Nest module that provides a shared cache and interceptor.
 */
export class MemorizeModule {
  static forRoot(options: MemorizeNestOptions = {}): DynamicModuleLike {
    return {
      module: MemorizeModule,
      providers: [
        { provide: MEMORIZE_MODULE_OPTIONS, useValue: options },
        {
          provide: MEMORIZE_CACHE,
          useFactory: () => memorize(options),
        },
        {
          provide: MemorizeInterceptor,
          useFactory: (cache: Memorize, moduleOptions: MemorizeNestOptions) =>
            new MemorizeInterceptor(cache, moduleOptions),
          inject: [MEMORIZE_CACHE, MEMORIZE_MODULE_OPTIONS],
        },
      ],
      exports: [MEMORIZE_CACHE, MemorizeInterceptor],
    };
  }
}
