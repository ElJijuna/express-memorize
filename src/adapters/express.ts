import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Memorize } from '../domain/Memorize';
import type { MemorizeCallOptions } from '../domain/MemorizeCallOptions';
import type { MemorizeStore } from '../MemorizeStore';

/**
 * Creates an Express `RequestHandler` that caches `GET` responses using the
 * provided {@link Memorize} instance.
 *
 * Import from `express-memorize/express` when you need the adapter directly,
 * without going through the `memorize()` factory.
 *
 * @example
 * ```ts
 * import { memorize } from 'express-memorize';
 * import { createExpressAdapter } from 'express-memorize/express';
 *
 * const cache = memorize({ ttl: 30_000 });
 * app.get('/users', createExpressAdapter(cache), handler);
 * app.get('/products', createExpressAdapter(cache, { ttl: 5_000 }), handler);
 * ```
 */
export function createExpressAdapter(
  cache: Memorize,
  options?: MemorizeCallOptions,
): RequestHandler {
  return cache.express(options);
}

/** @internal Used by the memorize() factory. */
export function createExpressMiddleware(
  store: MemorizeStore,
  globalTtl?: number,
): (callOptions?: MemorizeCallOptions) => RequestHandler {
  return (callOptions?: MemorizeCallOptions): RequestHandler => {
    const effectiveTtl = callOptions?.ttl ?? globalTtl;

    return (req: Request, res: Response, next: NextFunction): void => {
      if (req.method !== 'GET') {
        next();
        return;
      }

      if (callOptions?.noCache) {
        res.setHeader('X-Cache', 'BYPASS');
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

      res.send = (body?: unknown): Response => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const contentType =
            (res.getHeader('Content-Type') as string) ?? 'application/octet-stream';
          store.set(key, { body, statusCode: res.statusCode, contentType }, effectiveTtl);
        }
        res.setHeader('X-Cache', 'MISS');
        return originalSend(body);
      };

      next();
    };
  };
}
