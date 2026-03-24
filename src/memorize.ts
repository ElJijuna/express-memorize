import { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  MemorizeStore,
  CacheInfo,
  MemorizeSetEvent,
  MemorizeDeleteEvent,
  MemorizeExpireEvent,
} from './MemorizeStore';

export interface MemorizeOptions {
  ttl?: number;
}

export interface MemorizeCallOptions {
  ttl?: number;
}

export interface Memorize {
  (options?: MemorizeCallOptions): RequestHandler;
  get(key: string): CacheInfo | null;
  getAll(): Record<string, CacheInfo>;
  delete(key: string): boolean;
  clear(): void;
  on(event: 'set', handler: (e: MemorizeSetEvent) => void): void;
  on(event: 'delete', handler: (e: MemorizeDeleteEvent) => void): void;
  on(event: 'expire', handler: (e: MemorizeExpireEvent) => void): void;
}

export function memorize(options: MemorizeOptions = {}): Memorize {
  const { ttl } = options;
  const store = new MemorizeStore();

  const cache = function (callOptions?: MemorizeCallOptions): RequestHandler {
    const effectiveTtl = callOptions?.ttl ?? ttl;

    return function (req: Request, res: Response, next: NextFunction): void {
      if (req.method !== 'GET') {
        next();
        return;
      }

      const key = req.originalUrl;
      const cached = store.getRaw(key);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', cached.contentType);
        res.status(cached.statusCode).send(cached.body);
        return;
      }

      const originalSend = res.send.bind(res) as (body?: unknown) => Response;

      res.send = function (body?: unknown): Response {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const contentType = (res.getHeader('Content-Type') as string) ?? 'application/octet-stream';
          store.set(key, { body, statusCode: res.statusCode, contentType }, effectiveTtl);
        }
        res.setHeader('X-Cache', 'MISS');
        return originalSend(body);
      };

      next();
    };
  } as Memorize;

  cache.get = (key: string) => store.get(key);
  cache.getAll = () => store.getAll();
  cache.delete = (key: string) => store.delete(key);
  cache.clear = () => store.clear();
  cache.on = store.on.bind(store) as Memorize['on'];

  return cache;
}
