# express-memorize

<p align="center">
  <img src="https://raw.githubusercontent.com/ElJijuna/express-memorize/main/public/assets/logo.svg" alt="express-memorize logo" width="200" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/express-memorize"><img src="https://img.shields.io/npm/v/express-memorize?color=blue&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/express-memorize"><img src="https://img.shields.io/npm/dm/express-memorize?color=blue" alt="npm downloads" /></a>
  <a href="https://github.com/ElJijuna/express-memorize/actions"><img src="https://github.com/ElJijuna/express-memorize/actions/workflows/publish.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/ElJijuna/express-memorize/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license" /></a>
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  In-memory HTTP cache for <strong>Express, Fastify, Koa, NestJS, Hono, Fetch API</strong>, and more.<br/>
  Caches <code>GET</code> responses with optional TTL — zero required dependencies, fully typed.
</p>

<p align="center">
  <a href="#express"><img src="https://img.shields.io/badge/Express-000000?logo=express&logoColor=white" alt="Express adapter" /></a>
  <a href="#fastify"><img src="https://img.shields.io/badge/Fastify-000000?logo=fastify&logoColor=white" alt="Fastify adapter" /></a>
  <a href="#koa"><img src="https://img.shields.io/badge/Koa-33333D?logo=koa&logoColor=white" alt="Koa adapter" /></a>
  <a href="#nestjs"><img src="https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white" alt="NestJS adapter" /></a>
  <a href="#hono"><img src="https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white" alt="Hono adapter" /></a>
  <a href="#fetch-api--serverless"><img src="https://img.shields.io/badge/Fetch%20API-F7DF1E?logo=javascript&logoColor=black" alt="Fetch API adapter" /></a>
</p>

---

## Features

- Caches `GET` responses automatically when status code is `2xx`
- Works with **Express**, **Fastify**, **Koa**, **NestJS**, **Hono**, **Fetch API / serverless**, and direct service-level usage
- Per-route TTL override and `noCache` bypass
- **`maxEntries` cap with LRU eviction** to bound memory usage
- **Size metrics**: `size()`, `byteSize()`, `getStats()`
- **Service-level cache**: `remember()`, `set()`, `getValue()`
- **Pluggable serializer**: `'auto'` (node:v8 when available, else JSON), `'json'`, `'v8'`, or custom
- Event hooks: `set`, `delete`, `expire`, `evict`
- Cache inspection and invalidation API (`get`, `getAll`, `delete`, `deleteMatching`, `clear`)
- Hit counter per cache entry
- `X-Cache: HIT | MISS | BYPASS` response header
- Zero required runtime dependencies, fully typed
- Optional persistent SQLite storage via Node.js `node:sqlite`

## How it works

```text
GET request
    |
    v
+-------------------+
| express-memorize  |
+-------------------+
    |
    +--> noCache or non-GET? ---- yes ----> handler ----> response
    |
    no
    |
    v
+-------------------+
| cache lookup      |
+-------------------+
    |
    +--> HIT -----------------------------> cached response
    |                                      X-Cache: HIT
    |
    +--> MISS / expired
            |
            v
        handler
            |
            v
        2xx response?
            |
            +--> yes --> store body + ttl + size --> response
            |                                X-Cache: MISS
            |
            +--> no -----------------------> response
                                             X-Cache: MISS
```

## Installation

```bash
npm install express-memorize
```

Adapters for non-Express runtimes are optional — install only what you need:

```bash
npm install fastify   # only if using the Fastify adapter
npm install koa @koa/router   # only if using the Koa adapter
npm install hono   # only if using the Hono adapter
npm install @nestjs/common @nestjs/core rxjs   # only if using the NestJS adapter
```

SQLite storage uses Node.js `node:sqlite`, so no driver package is required. Use
Node.js 24 or newer for SQLite storage. Older Node.js runtimes automatically
fall back to memory storage and emit a warning.

## Quick Start

### Express

```typescript
import express from 'express';
import { memorize } from 'express-memorize';

const app = express();
const cache = memorize({ ttl: 30_000 });

app.get('/users', cache(), async (req, res) => {
  const users = await db.getUsers();
  res.json({ data: users });
});

app.listen(3000);
```

### Fastify

```typescript
import Fastify from 'fastify';
import { memorize } from 'express-memorize';
import { createFastifyPlugin } from 'express-memorize/fastify';

const app = Fastify();
const cache = memorize({ ttl: 30_000 });

await app.register(createFastifyPlugin(cache));

app.get('/users', async () => {
  return usersService.findAll();
});
```

### Koa

```typescript
import Koa from 'koa';
import Router from '@koa/router';
import { memorize } from 'express-memorize';
import { createKoaMiddleware } from 'express-memorize/koa';

const app = new Koa();
const router = new Router();
const cache = memorize({ ttl: 30_000 });

router.get('/users', createKoaMiddleware(cache), async (ctx) => {
  ctx.body = await usersService.findAll();
});

app.use(router.routes());
app.use(router.allowedMethods());
```

### Hono

```typescript
import { Hono } from 'hono';
import { memorize } from 'express-memorize';
import { createHonoMiddleware } from 'express-memorize/hono';

const app = new Hono();
const cache = memorize({ ttl: 30_000 });

app.get('/users', createHonoMiddleware(cache), async (c) => {
  return c.json(await usersService.findAll());
});
```

### NestJS

```typescript
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  MemorizeCacheKey,
  MemorizeInterceptor,
  MemorizeModule,
  MemorizeTtl,
} from 'express-memorize/nestjs';

@Module({
  imports: [MemorizeModule.forRoot({ ttl: 30_000 })],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useExisting: MemorizeInterceptor,
    },
  ],
})
export class AppModule {}

export class UsersController {
  @MemorizeCacheKey('users:list')
  @MemorizeTtl(10_000)
  findAll() {
    return usersService.findAll();
  }
}
```

### Fetch API / Serverless

```typescript
import { memorize } from 'express-memorize';
import { cacheFetchHandler } from 'express-memorize/fetch';

const cache = memorize({ ttl: 30_000 });

export default cacheFetchHandler(cache, async (request) => {
  const users = await usersService.findAll();
  return Response.json(users);
});
```

### Service-level caching

Cache arbitrary values directly — no HTTP layer required.

```typescript
const cache = memorize({ ttl: 60_000 });

// Compute-and-cache pattern
const users = await cache.remember('users:list', () => usersService.findAll());

// Per-call TTL
const user = await cache.remember(
  `users:${id}`,
  () => usersService.findById(id),
  10_000
);

// Concurrent calls for the same key share one in-flight factory
const [featuredA, featuredB] = await Promise.all([
  cache.remember('users:featured', () => usersService.findFeatured()),
  cache.remember('users:featured', () => usersService.findFeatured()),
]);

// Async direct-cache variant: yields around serialization/deserialization
const stats = await cache.rememberAsync(
  'reports:daily-stats',
  () => reportsService.dailyStats(),
  30_000
);

// Explicit set/get
cache.set('config', appConfig);
const config = cache.getValue<AppConfig>('config');
```

Inside an Express route:

```typescript
import express from 'express';
import { memorize } from 'express-memorize';

const app = express();
const cache = memorize({ ttl: 60_000 });

app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await cache.remember(
      `users:${req.params.id}`,
      () => usersService.findById(req.params.id),
      10_000
    );

    res.json(user);
  } catch (err) {
    next(err);
  }
});
```

### Serializer

The `serializer` option controls how values passed to `set()` / `getValue()` / `remember()` are stored internally. It does **not** affect HTTP middleware caching — adapters store response bodies as-is.

| Value | Serializes to | Handles `Date`, `Map`, `Set`, `Buffer` | Runtime |
|-------|--------------|----------------------------------------|---------|
| `'auto'` *(default)* | Buffer (v8) or string (JSON) | Yes — when `node:v8` is available | Any |
| `'json'` | string | No | Any (edge runtimes, human-readable) |
| `'v8'` | Buffer | Yes | Node.js / Bun — throws at construction otherwise |
| Custom object | user-defined | user-defined | Any |

```typescript
// auto (default): uses node:v8 when available, falls back to JSON silently
const cache = memorize();

// Always JSON — useful for edge runtimes or when you need human-readable bodies
const cache = memorize({ serializer: 'json' });

// Always v8 — throws at construction if node:v8 is not available
const cache = memorize({ serializer: 'v8' });

// Custom serializer — bring your own (MessagePack, CBOR, etc.)
import { pack, unpack } from 'msgpackr';
const cache = memorize({
  serializer: {
    serialize:   (v) => Buffer.from(pack(v)),
    deserialize: (d) => unpack(d as Buffer),
  },
});
```

With `'v8'` or `'auto'`, `set()` correctly round-trips types that JSON cannot represent:

```typescript
const cache = memorize({ serializer: 'v8', ttl: Infinity });

cache.set('created', new Date());
cache.getValue<Date>('created');   // Date instance preserved

cache.set('roles', new Set(['admin', 'editor']));
cache.getValue<Set<string>>('roles');  // Set instance preserved
```

---

## Usage

### Global middleware (Express)

```typescript
const cache = memorize({ ttl: 60_000 });

app.use(cache()); // applies to all GET routes
```

### Per-route TTL override

```typescript
const cache = memorize({ ttl: 60_000 }); // global: 60s

app.get('/users',    cache(),                  handler); // 60s
app.get('/products', cache({ ttl: 10_000 }),    handler); // 10s
app.get('/config',   cache({ ttl: Infinity }),  handler); // no expiry
```

### noCache bypass

```typescript
app.get('/live-feed', cache({ noCache: true }), handler);
// Sets X-Cache: BYPASS, never reads or writes the cache
```

### Custom cache key

```typescript
// Default key is req.originalUrl (includes the query string).
app.get('/users', cache({ key: (req) => req.path }), handler);
// Now /users?page=1 and /users?page=2 share one cache entry
```

### Conditional caching

```typescript
// Keep per-user responses out of the shared cache.
// When shouldCache returns false the request bypasses the cache entirely
// (no read, no write) and gets X-Cache: BYPASS.
app.use(cache({ shouldCache: (req) => !req.headers.authorization }));
```

> ⚠️ The cache key is the URL, so authenticated or otherwise personalized responses stored in a shared cache would be served to every caller of that URL. Use `shouldCache` (or per-route mounting) to exclude them.

### Stale-while-revalidate

`remember` / `rememberAsync` accept an options object with a `staleWhileRevalidate` window. After `ttl` elapses the entry becomes *stale* but is still returned instantly for up to `staleWhileRevalidate` ms while the factory re-runs **in the background** (concurrent stale reads trigger a single refresh). After the window closes the entry is evicted and the next read is a regular miss.

```typescript
const users = await cache.remember('users:list', () => userService.findAll(), {
  ttl: 30_000,               // fresh for 30s
  staleWhileRevalidate: 60_000, // then stale-but-served for up to 60s more
});
```

`set` / `setAsync` accept the same options; a value written with `staleWhileRevalidate` stays readable through the stale window, and `CacheInfo.staleAt` tells you when it went stale. If a background refresh fails, the stale value keeps being served until the window closes and the error is logged.

### Tag-based invalidation

Attach `tags` when writing and invalidate whole groups at once — often more ergonomic than glob patterns:

```typescript
cache.set('users:1', alice, { tags: ['users'] });
cache.set('users:2', bob,   { tags: ['users', 'admins'] });

// Middleware entries can be tagged too:
app.get('/users', cache({ tags: ['users'] }), handler);

cache.deleteByTag('users');            // → removes all three
cache.deleteByTag(['users', 'posts']); // multiple tags
await cache.deleteByTagAsync('users', { batchSize: 500 }); // batched variant
```

Every adapter accepts the same `tags` option (Fastify, Koa, Hono, Fetch); in NestJS use the `@MemorizeTags('users')` decorator on a controller or handler.

### Fastify route-level usage

```typescript
import { createFastifyPreHandler } from 'express-memorize/fastify';

app.get(
  '/users',
  {
    preHandler: createFastifyPreHandler(cache, { ttl: 10_000 }),
  },
  async () => usersService.findAll(),
);
```

### GraphQL caching

GraphQL is not a simple route-level caching problem. A single `POST /graphql`
endpoint can execute different operations, use variables, depend on the current
viewer, and return partial data with errors. For now, the recommended strategy
is **service-level caching** with `remember()` inside resolvers or the services
they call.

```typescript
const cache = memorize({ ttl: 30_000 });

const resolvers = {
  Query: {
    user: (_parent, args, context) => {
      const viewerScope = context.user ? `user:${context.user.id}` : 'anonymous';
      return cache.remember(
        `graphql:${viewerScope}:user:${args.id}`,
        () => usersService.findVisibleById(args.id, context.user),
      );
    },
  },
  Mutation: {
    updateUser: async (_parent, args) => {
      const user = await usersService.update(args.id, args.input);
      cache.deleteMatching(`graphql:*:user:${args.id}`);
      return user;
    },
  },
};
```

**GraphQL cache key rules:**

- Include every input that can change the result: operation name, normalized query or field name, variables, locale, feature flags, and any relevant authorization scope.
- Do not share cached data across users unless the resolver result is genuinely public.
- Keep mutation invalidation explicit with `delete()` or `deleteMatching()`; automatic invalidation is too schema-specific for a generic adapter.
- Avoid caching responses that contain GraphQL errors unless your application has a deliberate policy for partial data.
- Prefer resolver or service-level caching for expensive data fetches. Operation-level caching may be considered later for public, query-only workloads with strict keying rules.

There is currently no dedicated GraphQL adapter. If one is added later, the
first practical target should be **Apollo Server**, because its plugin lifecycle
can cache complete operation responses without coupling the core package entry
point to GraphQL. NestJS GraphQL, Mercurius, and Yoga integrations should stay
separate implementation issues unless a shared GraphQL abstraction emerges.

### NestJS decorators

Use `MemorizeInterceptor` on a controller or globally, then configure caching at the controller or method level.

```typescript
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import {
  MemorizeCacheKey,
  MemorizeInterceptor,
  MemorizeNoCache,
  MemorizeTags,
  MemorizeTtl,
} from 'express-memorize/nestjs';

@Controller('users')
@UseInterceptors(MemorizeInterceptor)
@MemorizeTtl(30_000)
export class UsersController {
  @Get()
  @MemorizeCacheKey('users:list')
  @MemorizeTags('users')
  findAll() {
    return usersService.findAll();
  }

  @Get('live')
  @MemorizeNoCache()
  live() {
    return usersService.live();
  }
}
```

For global usage, import `MemorizeModule.forRoot()` and register `APP_INTERCEPTOR` with `useExisting: MemorizeInterceptor` so the interceptor receives the module's shared cache instance.

### Cache invalidation

```typescript
app.post('/users', (req, res) => {
  users.push(req.body);
  cache.delete('/users');
  res.status(201).json(req.body);
});
```

### Pattern-based invalidation

Use `cache.deleteMatching(pattern)` to remove entries by glob pattern.

```typescript
app.put('/users/:id', (req, res) => {
  users.update(req.params.id, req.body);
  const deleted = cache.deleteMatching(`**/users/${req.params.id}*`);
  console.log(`${deleted} entries removed`);
  res.json({ ok: true });
});
```

For large caches, use the async variants to process removals in batches and
yield back to the event loop between batches:

```typescript
await cache.deleteMatchingAsync(`**/users/${req.params.id}*`, { batchSize: 500 });
await cache.clearAsync({ batchSize: 500 });
```

**Glob rules:**

| Pattern | Behaviour |
|---------|-----------|
| `*` | Matches any sequence within a single path segment (does not cross `/`) |
| `**` | Matches any sequence across path segments (crosses `/`) |
| `?` | Matches any single character except `/` |

### Bounding memory

Prevent unbounded growth by setting a maximum number of entries or bytes. When
`maxEntries` or `maxTotalBytes` is reached, the **least-recently-used (LRU)**
entry is evicted before the new one is stored. Entries larger than
`maxValueBytes` are skipped by default.

```typescript
const cache = memorize({
  ttl: 30_000,
  maxEntries: 1_000,
  maxValueBytes: 256_000,
  maxTotalBytes: 50_000_000,
});
```

### Size metrics

```typescript
cache.size();      // number of active entries
cache.byteSize();  // approximate total body size in bytes
cache.getStats();  // { entries, maxEntries, maxValueBytes, maxTotalBytes, byteSize,
                   //   hits, misses, hitRatio }
```

> `byteSize()` is an estimate based on UTF-8 encoding for strings and `byteLength` for buffers. It may not reflect actual VM memory usage.

`hits` / `misses` count value lookups (middleware reads, `getValue`, `remember`) since the instance was created; `hitRatio` is `hits / (hits + misses)`, or `null` before the first lookup.

### SQLite storage

Memory storage is the default and keeps the classic configuration working:

```typescript
const cache = memorize({ ttl: 60_000 });
```

Enable persistent SQLite storage with `storage.type: 'sqlite'`:

```typescript
const cache = memorize({
  ttl: 60_000,
  storage: {
    type: 'sqlite',
    directory: 'database',
  },
});
```

The SQLite backend creates `express-memorize.sqlite` inside the configured
directory. If `directory` is omitted, `database` is used. Cached entries persist
across process restarts until their TTL expires or they are invalidated.

SQLite storage requires Node.js 24 or newer. If configured on an older runtime,
`express-memorize` logs a warning and falls back to the in-memory store.

### Inspect the cache

```typescript
cache.get('/users');   // CacheInfo | null
cache.getAll();        // Record<string, CacheInfo>
cache.getAllAsync();   // Promise<Record<string, CacheInfo>>
```

`CacheInfo` shape:

```typescript
{
  key: string;
  body: unknown;
  statusCode: number;
  contentType: string;
  expiresAt: number | null;
  remainingTtl: number | null; // ms until expiry, null when ttl is Infinity
  hits: number;                // times this key was served from cache
  size: number;                // approximate body size in bytes
  staleAt?: number | null;     // when the entry went stale (staleWhileRevalidate)
  tags?: string[];             // invalidation tags, see deleteByTag
}
```

`hits` starts at `1` on the initial cache miss and increments on every hit. It resets to `1` if the entry is evicted and re-cached.

### Event hooks

```typescript
import { MemorizeEventType } from 'express-memorize';

cache.on(MemorizeEventType.Set,    (e) => console.log('stored',  e.key));
cache.on(MemorizeEventType.Delete, (e) => console.log('deleted', e.key));
cache.on(MemorizeEventType.Expire, (e) => console.log('expired', e.key));
cache.on(MemorizeEventType.Evict,  (e) => console.log('evicted', e.key)); // maxEntries LRU
cache.on(MemorizeEventType.Empty,  ()  => console.log('cache is empty'));

// on() returns an unsubscribe function; off() removes a listener by reference
const unsubscribe = cache.on(MemorizeEventType.Set, handler);
unsubscribe();                              // or:
cache.off(MemorizeEventType.Set, handler);
```

### Disposing an instance

```typescript
// Cancels the expiry timer, removes all listeners, terminates worker threads,
// and closes the SQLite handle (persisted entries stay on disk).
// Useful in tests and graceful shutdowns.
cache.dispose();
```

---

## API Reference

### `memorize(options?)`

Creates a cache instance. Returns a `Memorize` object.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storage` | `{ type: 'memory' } \| { type: 'sqlite'; directory?: string }` | `{ type: 'memory' }` | Storage backend. SQLite uses Node.js `node:sqlite`, creates `express-memorize.sqlite`, and falls back to memory with a warning on Node.js below 24. |
| `ttl` | `number` | `60_000` | Time-to-live in milliseconds. Pass `Infinity` for no expiry. |
| `maxEntries` | `number` | `undefined` | Maximum number of entries. LRU eviction when reached. |
| `maxValueBytes` | `number` | `undefined` | Maximum serialized byte size for one entry. Oversized entries are skipped by default. |
| `maxTotalBytes` | `number` | `undefined` | Maximum approximate byte size for the whole cache. LRU eviction when reached. |
| `sizeLimitAction` | `'skip' \| 'throw'` | `'skip'` | Behavior when one entry exceeds a byte limit. |
| `asyncSerializer` | `'yield' \| 'worker'` | `'yield'` | Backend for `setAsync` / `getValueAsync` / `rememberAsync`. `'worker'` offloads built-in serializers to `worker_threads`. |
| `asyncSerializerWorkers` | `'auto' \| number` | `'auto'` | Maximum lazy worker count for `asyncSerializer: 'worker'`. Numeric values are clamped to available CPU parallelism and an internal safety cap. |
| `asyncSerializerThresholdBytes` | `number` | `64_000` | Minimum estimated serialized size before async direct-cache APIs offload work to a worker. Smaller values use cooperative yielding. |
| `serializer` | `'auto' \| 'json' \| 'v8' \| Serializer` | `'auto'` | Serializer for `set()` / `getValue()`. `'auto'` uses `node:v8` when available, falls back to JSON. Does not affect HTTP middleware caching. |

### `cache(options?)` / `cache.express(options?)`

Returns an Express `RequestHandler`. `cache()` is a backwards-compatible alias for `cache.express()`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | global `ttl` | TTL override for this route. Pass `Infinity` for no expiry. |
| `noCache` | `boolean` | `false` | Skip cache entirely. Sets `X-Cache: BYPASS`. |
| `key` | `(req) => string` | `req.originalUrl` | Custom cache key extractor. |
| `shouldCache` | `(req, res) => boolean` | — | Evaluated before the cache is read; return `false` to bypass the cache for that request (sets `X-Cache: BYPASS`). |
| `tags` | `string[]` | — | Invalidation tags attached to every entry cached by this middleware. See `deleteByTag`. |

### Service-level cache methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `remember` | `(key, factory, ttlOrOptions?) => Promise<T>` | Return cached value or call factory and cache the result. Supports `staleWhileRevalidate`. |
| `rememberAsync` | `(key, factory, ttlOrOptions?) => Promise<T>` | Async variant using cooperative yielding around direct-cache serialization. |
| `set` | `(key, value, ttlOrOptions?) => void` | Store an arbitrary value. |
| `setAsync` | `(key, value, ttlOrOptions?) => Promise<void>` | Async variant that yields before serializing and storing. |
| `getValue` | `(key) => T \| undefined` | Retrieve a value stored via `set` or `remember`. |
| `getValueAsync` | `(key) => Promise<T \| undefined>` | Async variant that yields before deserializing. |

`ttlOrOptions` is either a TTL in milliseconds or an options object
`{ ttl?, tags?, staleWhileRevalidate? }`.

Concurrent `remember()` / `rememberAsync()` calls for the same key are
coalesced: while one factory is in flight, later calls wait for the same
promise instead of running the factory again.

`setAsync()` guards against stale async writes. If another write or broad
invalidation (`clear`, `clearAsync`, `deleteMatching`, `deleteMatchingAsync`)
touches the cache before serialization finishes, the older async write is
discarded instead of overwriting newer state.

### Cache management

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(key) => CacheInfo \| null` | Returns info for a cached key. |
| `getAll` | `() => Record<string, CacheInfo>` | Returns all active entries. |
| `getAllAsync` | `({ batchSize }?) => Promise<Record<string, CacheInfo>>` | Async batched variant of `getAll`. |
| `delete` | `(key) => boolean` | Removes a single entry. |
| `deleteByTag` | `(tag) => number` | Removes entries carrying a tag (or any of a list of tags). |
| `deleteByTagAsync` | `(tag, { batchSize }?) => Promise<number>` | Async batched variant of `deleteByTag`. |
| `deleteMatching` | `(pattern) => number` | Removes entries matching a glob pattern. |
| `deleteMatchingAsync` | `(pattern, { batchSize }?) => Promise<number>` | Async batched variant of `deleteMatching`. |
| `clear` | `() => void` | Removes all entries. |
| `clearAsync` | `({ batchSize }?) => Promise<number>` | Async batched variant of `clear`. |
| `off` | `(event, handler) => void` | Removes a listener registered with `on` (which also returns an unsubscribe function). |
| `dispose` | `() => void` | Releases timers, listeners, worker threads, and the SQLite handle. The instance must not be used afterwards. |
| `size` | `() => number` | Number of active entries. |
| `byteSize` | `() => number` | Approximate total body size in bytes. |
| `getStats` | `() => MemorizeStats` | Aggregate stats: `{ entries, maxEntries, maxValueBytes, maxTotalBytes, byteSize, hits, misses, hitRatio }`. |

### Adapters

| Import path | Export | Framework |
|-------------|--------|-----------|
| `express-memorize` | `memorize` | Core factory |
| `express-memorize/express` | `createExpressAdapter(cache, options?)` | Express |
| `express-memorize/fastify` | `createFastifyPlugin(cache, options?)`, `createFastifyPreHandler(cache, options?)` | Fastify |
| `express-memorize/koa` | `createKoaMiddleware(cache, options?)` | Koa |
| `express-memorize/nestjs` | `MemorizeModule`, `MemorizeInterceptor`, decorators | NestJS |
| `express-memorize/hono` | `createHonoMiddleware(cache, options?)` | Hono |
| `express-memorize/fetch` | `cacheFetchHandler(cache, handler, options?)` | Fetch API / Serverless |

### Events

| Event | Payload | When |
|-------|---------|------|
| `set` | `{ type, key, body, statusCode, contentType, expiresAt, size }` | A response is stored |
| `delete` | `{ type, key }` | Manual removal via `delete`, `deleteMatching`, or `clear` |
| `expire` | `{ type, key }` | TTL timer fires or lazy expiry is detected |
| `evict` | `{ type, key }` | LRU eviction due to `maxEntries` or `maxTotalBytes` limit |
| `empty` | `{ type }` | Last entry removed, cache is now empty |

## Response Headers

| Header | Value | Description |
|--------|-------|-------------|
| `X-Cache` | `HIT` | Response served from cache |
| `X-Cache` | `MISS` | Response computed and stored |
| `X-Cache` | `BYPASS` | Cache skipped — `noCache: true` |

## Behavior

- Only `GET` requests are cached. All other methods bypass the cache entirely.
- Only responses with a `2xx` status code are stored.
- All middleware and adapter instances created from the same `memorize()` call **share the same store**.
- Two separate `memorize()` calls produce **independent stores**.
- SQLite-backed stores persist entries between process restarts when they use the same directory.
- Byte size is an approximation — strings use UTF-8 encoding, objects use `JSON.stringify` length.
- Async batched inspection/invalidation methods are eventually consistent, not transactional snapshots; other cache operations may interleave between batches.

## License

[MIT](LICENSE)
