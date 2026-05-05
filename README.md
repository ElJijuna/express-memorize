# express-memorize

<p align="center">
  <a href="https://www.npmjs.com/package/express-memorize"><img src="https://img.shields.io/npm/v/express-memorize?color=blue&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/express-memorize"><img src="https://img.shields.io/npm/dm/express-memorize?color=blue" alt="npm downloads" /></a>
  <a href="https://github.com/ElJijuna/express-memorize/actions"><img src="https://github.com/ElJijuna/express-memorize/actions/workflows/publish.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/ElJijuna/express-memorize/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license" /></a>
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  In-memory HTTP cache for <strong>Express, NestJS, Hono, Fetch API</strong>, and more.<br/>
  Caches <code>GET</code> responses with optional TTL — zero dependencies, fully typed.
</p>

---

## Features

- Caches `GET` responses automatically when status code is `2xx`
- Works with **Express**, **NestJS**, **Hono**, **Fetch API / serverless**, and direct service-level usage
- Per-route TTL override and `noCache` bypass
- **`maxEntries` cap with LRU eviction** to bound memory usage
- **Size metrics**: `size()`, `byteSize()`, `getStats()`
- **Service-level cache**: `remember()`, `set()`, `getValue()`
- Event hooks: `set`, `delete`, `expire`, `evict`
- Cache inspection and invalidation API (`get`, `getAll`, `delete`, `deleteMatching`, `clear`)
- Hit counter per cache entry
- `X-Cache: HIT | MISS | BYPASS` response header
- Zero runtime dependencies, fully typed

## Installation

```bash
npm install express-memorize
```

Adapters for non-Express runtimes are optional — install only what you need:

```bash
npm install hono   # only if using the Hono adapter
npm install @nestjs/common @nestjs/core rxjs   # only if using the NestJS adapter
```

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

// Explicit set/get
cache.set('config', appConfig);
const config = cache.getValue<AppConfig>('config');
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

app.get('/users',    cache(),               handler); // 60s
app.get('/products', cache({ ttl: 10_000 }), handler); // 10s
app.get('/config',   cache({ ttl: 0 }),      handler); // no expiry
```

### noCache bypass

```typescript
app.get('/live-feed', cache({ noCache: true }), handler);
// Sets X-Cache: BYPASS, never reads or writes the cache
```

### NestJS decorators

Use `MemorizeInterceptor` on a controller or globally, then configure caching at the controller or method level.

```typescript
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import {
  MemorizeCacheKey,
  MemorizeInterceptor,
  MemorizeNoCache,
  MemorizeTtl,
} from 'express-memorize/nestjs';

@Controller('users')
@UseInterceptors(MemorizeInterceptor)
@MemorizeTtl(30_000)
export class UsersController {
  @Get()
  @MemorizeCacheKey('users:list')
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

**Glob rules:**

| Pattern | Behaviour |
|---------|-----------|
| `*` | Matches any sequence within a single path segment (does not cross `/`) |
| `**` | Matches any sequence across path segments (crosses `/`) |
| `?` | Matches any single character except `/` |

### Bounding memory with `maxEntries`

Prevent unbounded growth by setting a maximum number of entries. When the limit is reached, the **least-recently-used (LRU)** entry is evicted before the new one is stored.

```typescript
const cache = memorize({ ttl: 30_000, maxEntries: 1_000 });
```

### Size metrics

```typescript
cache.size();      // number of active entries
cache.byteSize();  // approximate total body size in bytes
cache.getStats();  // { entries, maxEntries, byteSize }
```

> `byteSize()` is an estimate based on UTF-8 encoding for strings and `byteLength` for buffers. It may not reflect actual VM memory usage.

### Inspect the cache

```typescript
cache.get('/users');   // CacheInfo | null
cache.getAll();        // Record<string, CacheInfo>
```

`CacheInfo` shape:

```typescript
{
  key: string;
  body: unknown;
  statusCode: number;
  contentType: string;
  expiresAt: number | null;
  remainingTtl: number | null; // ms until expiry, null if no TTL
  hits: number;                // times this key was served from cache
  size: number;                // approximate body size in bytes
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
```

---

## API Reference

### `memorize(options?)`

Creates a cache instance. Returns a `Memorize` object.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `undefined` | Time-to-live in milliseconds. Omit for no expiry. |
| `maxEntries` | `number` | `undefined` | Maximum number of entries. LRU eviction when reached. |

### `cache(options?)` / `cache.express(options?)`

Returns an Express `RequestHandler`. `cache()` is a backwards-compatible alias for `cache.express()`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | global `ttl` | TTL override for this route. |
| `noCache` | `boolean` | `false` | Skip cache entirely. Sets `X-Cache: BYPASS`. |

### Service-level cache methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `remember` | `(key, factory, ttl?) => Promise<T>` | Return cached value or call factory and cache the result. |
| `set` | `(key, value, ttl?) => void` | Store an arbitrary value. |
| `getValue` | `(key) => T \| undefined` | Retrieve a value stored via `set` or `remember`. |

### Cache management

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(key) => CacheInfo \| null` | Returns info for a cached key. |
| `getAll` | `() => Record<string, CacheInfo>` | Returns all active entries. |
| `delete` | `(key) => boolean` | Removes a single entry. |
| `deleteMatching` | `(pattern) => number` | Removes entries matching a glob pattern. |
| `clear` | `() => void` | Removes all entries. |
| `size` | `() => number` | Number of active entries. |
| `byteSize` | `() => number` | Approximate total body size in bytes. |
| `getStats` | `() => MemorizeStats` | Aggregate stats: `{ entries, maxEntries, byteSize }`. |

### Adapters

| Import path | Export | Framework |
|-------------|--------|-----------|
| `express-memorize` | `memorize` | Core factory |
| `express-memorize/express` | `createExpressAdapter(cache, options?)` | Express |
| `express-memorize/nestjs` | `MemorizeModule`, `MemorizeInterceptor`, decorators | NestJS |
| `express-memorize/hono` | `createHonoMiddleware(cache, options?)` | Hono |
| `express-memorize/fetch` | `cacheFetchHandler(cache, handler, options?)` | Fetch API / Serverless |

### Events

| Event | Payload | When |
|-------|---------|------|
| `set` | `{ type, key, body, statusCode, contentType, expiresAt, size }` | A response is stored |
| `delete` | `{ type, key }` | Manual removal via `delete`, `deleteMatching`, or `clear` |
| `expire` | `{ type, key }` | TTL timer fires or lazy expiry is detected |
| `evict` | `{ type, key }` | LRU eviction due to `maxEntries` limit |
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
- Byte size is an approximation — strings use UTF-8 encoding, objects use `JSON.stringify` length.

## License

[MIT](LICENSE)
