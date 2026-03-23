import { Request, Response, NextFunction, RequestHandler } from 'express';
import { MemorizeStore, CacheInfo } from './MemorizeStore';

export interface MemorizeOptions {
  ttl?: number;
}

export interface MemorizeMiddleware extends RequestHandler {
  get(key: string): CacheInfo | null;
  getAll(): Record<string, CacheInfo>;
  delete(key: string): boolean;
  clear(): void;
}

export function memorize(options: MemorizeOptions = {}): MemorizeMiddleware {
  const { ttl } = options;
  const store = new MemorizeStore();

  const middleware = function (req: Request, res: Response, next: NextFunction): void {
    const key = req.originalUrl;
    const cached = store.getRaw(key);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.status(cached.statusCode).json(cached.body);
      return;
    }

    const originalJson = res.json.bind(res) as (body: unknown) => Response;

    res.json = function (body: unknown): Response {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.set(key, { body, statusCode: res.statusCode }, ttl);
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  } as MemorizeMiddleware;

  middleware.get = (key: string) => store.get(key);
  middleware.getAll = () => store.getAll();
  middleware.delete = (key: string) => store.delete(key);
  middleware.clear = () => store.clear();

  return middleware;
}
