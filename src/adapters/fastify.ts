import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify';
import type { Memorize } from '../domain/Memorize';

export interface FastifyAdapterOptions {
  /** Time-to-live in milliseconds. Defaults to the global TTL. */
  ttl?: number;
  /** Skip caching for this route. Sets `X-Cache: BYPASS`. */
  noCache?: boolean;
  /** Custom cache key extractor. Defaults to `request.url`. */
  key?: (request: FastifyRequest) => string;
}

function serializePayload(payload: unknown): { body: unknown; contentType?: string } {
  if (
    typeof payload === 'string' ||
    Buffer.isBuffer(payload) ||
    payload instanceof ArrayBuffer ||
    ArrayBuffer.isView(payload)
  ) {
    return { body: payload };
  }

  if (payload === undefined) {
    return { body: '' };
  }

  return { body: JSON.stringify(payload), contentType: 'application/json; charset=utf-8' };
}

/**
 * Creates a Fastify plugin that caches `GET` route responses with a `2xx`
 * status code.
 *
 * Requires `fastify` to be installed as an optional peer dependency.
 *
 * @param cache - The {@link Memorize} instance to use as the backing store.
 * @param options - Optional plugin-level options.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { memorize } from 'express-memorize';
 * import { createFastifyPlugin } from 'express-memorize/fastify';
 *
 * const app = Fastify();
 * const cache = memorize({ ttl: 30_000 });
 *
 * await app.register(createFastifyPlugin(cache));
 * ```
 */
export function createFastifyPlugin(
  cache: Memorize,
  options?: FastifyAdapterOptions,
): FastifyPluginCallback {
  const plugin: FastifyPluginCallback = function memorizeFastifyPlugin(fastify, _pluginOptions, done) {
    fastify.addHook('preHandler', createFastifyPreHandler(cache, options));
    done();
  };

  Object.defineProperties(plugin, {
    [Symbol.for('skip-override')]: { value: true },
    [Symbol.for('fastify.display-name')]: { value: 'express-memorize-fastify' },
    [Symbol.for('plugin-meta')]: { value: { name: 'express-memorize-fastify' } },
  });

  return plugin;
}

/**
 * Creates a route-level Fastify `preHandler` that caches `GET` responses.
 *
 * Use this when only selected routes should be cached, or when a route needs a
 * TTL, `noCache`, or key override.
 */
export function createFastifyPreHandler(
  cache: Memorize,
  options?: FastifyAdapterOptions,
): preHandlerHookHandler {
  return function memorizeFastifyPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
    done,
  ): void {
    if (request.method !== 'GET') {
      done();
      return;
    }

    if (options?.noCache) {
      reply.header('X-Cache', 'BYPASS');
      done();
      return;
    }

    const key = options?.key ? options.key(request) : request.url;
    const cached = cache._store.getRaw(key);

    if (cached) {
      reply
        .header('X-Cache', 'HIT')
        .type(cached.contentType)
        .code(cached.statusCode)
        .send(cached.body);
      return;
    }

    const originalSend = reply.send.bind(reply) as (payload?: unknown) => FastifyReply;

    reply.send = function sendWithCache(payload?: unknown): FastifyReply {
      const statusCode = reply.statusCode;

      if (statusCode >= 200 && statusCode < 300) {
        const ttl = options?.ttl ?? cache._ttl;
        const serialized = serializePayload(payload);
        const contentType =
          reply.getHeader('content-type')?.toString() ??
          serialized.contentType ??
          'application/octet-stream';
        cache._store.set(key, { body: serialized.body, statusCode, contentType }, ttl);
      }

      reply.header('X-Cache', 'MISS');
      return originalSend(payload);
    };

    done();
  };
}
