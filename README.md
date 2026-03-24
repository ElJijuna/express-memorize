# express-memorize

<p align="center">
  <a href="https://www.npmjs.com/package/express-memorize"><img src="https://img.shields.io/npm/v/express-memorize?color=blue&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/express-memorize"><img src="https://img.shields.io/npm/dm/express-memorize?color=blue" alt="npm downloads" /></a>
  <a href="https://github.com/ElJijuna/express-memorize/actions"><img src="https://github.com/ElJijuna/express-memorize/actions/workflows/publish.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/ElJijuna/express-memorize/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ElJijuna/express-memorize?color=blue" alt="license" /></a>
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  In-memory cache middleware for <strong>Express.js</strong>.<br/>
  Caches <code>GET</code> responses with optional TTL — zero dependencies, fully typed.
</p>

---

## Features

- Caches `GET` responses automatically when status code is `2xx`
- Per-route TTL override
- Event hooks: `set`, `delete`, `expire`
- Cache inspection and invalidation API
- `X-Cache: HIT | MISS` response header
- Zero runtime dependencies
- Full TypeScript support

## Installation

```bash
npm install express-memorize
```

## Quick Start

```typescript
import express from 'express';
import { memorize } from 'express-memorize';

const app = express();
const cache = memorize({ ttl: 30_000 }); // 30 seconds global TTL

app.get('/users', cache(), async (req, res) => {
  const users = await db.getUsers();
  res.json({ data: users });
});

app.listen(3000);
```

The first request computes the response normally. Every subsequent `GET /users` is served from memory until the TTL expires.

## Usage

### Basic cache

```typescript
const cache = memorize({ ttl: 60_000 }); // cache for 60 seconds

app.get('/products', cache(), (req, res) => {
  res.json({ data: products });
});
```

### Per-route TTL override

```typescript
const cache = memorize({ ttl: 60_000 }); // global: 60s

app.get('/users',    cache(),               handler); // 60s
app.get('/products', cache({ ttl: 10_000 }), handler); // override: 10s
app.get('/config',   cache({ ttl: 0 }),      handler); // no expiry
```

### Cache invalidation

```typescript
const cache = memorize({ ttl: 30_000 });

app.get('/users', cache(), (req, res) => {
  res.json({ data: users });
});

app.post('/users', (req, res) => {
  users.push(req.body);
  cache.delete('/users'); // invalidate after mutation
  res.status(201).json({ data: req.body });
});
```

### Event hooks

```typescript
const cache = memorize({ ttl: 30_000 });

cache.on('set', (e) => {
  console.log(`[cache] stored ${e.key} — expires in ${e.expiresAt ? e.expiresAt - Date.now() : '∞'}ms`);
});

cache.on('delete', (e) => {
  console.log(`[cache] deleted ${e.key}`);
});

cache.on('expire', (e) => {
  console.log(`[cache] expired ${e.key}`);
});
```

### Inspect the cache

```typescript
cache.get('/users');   // CacheInfo | null — single entry
cache.getAll();        // Record<string, CacheInfo> — all active entries
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
}
```

### Clear the cache

```typescript
cache.delete('/users');  // remove one entry
cache.clear();           // remove all entries
```

## API Reference

### `memorize(options?)`

Creates a cache instance. Returns a `Memorize` object.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `undefined` | Time-to-live in milliseconds. Omit for no expiry. |

### `cache(options?)`

Returns an Express `RequestHandler` middleware. Can override the global TTL.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | global `ttl` | TTL override for this specific route. |

### Cache management

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(key: string) => CacheInfo \| null` | Returns info for a cached key. |
| `getAll` | `() => Record<string, CacheInfo>` | Returns all active cache entries. |
| `delete` | `(key: string) => boolean` | Removes a single entry. Returns `false` if not found. |
| `clear` | `() => void` | Removes all entries. |

### Events

| Event | Payload | When |
|-------|---------|------|
| `set` | `{ type, key, body, statusCode, contentType, expiresAt }` | A response is stored |
| `delete` | `{ type, key }` | `cache.delete()` or `cache.clear()` is called |
| `expire` | `{ type, key }` | TTL timer fires or lazy expiry is detected |

## Response Headers

| Header | Value | Description |
|--------|-------|-------------|
| `X-Cache` | `HIT` | Response served from cache |
| `X-Cache` | `MISS` | Response computed and stored |

## Behavior

- Only `GET` requests are cached. All other methods bypass the middleware entirely.
- Only responses with a `2xx` status code are stored.
- Each call to `cache()` returns an independent middleware handler, but all handlers created from the same `memorize()` instance **share the same store**.
- Two separate `memorize()` calls produce **independent stores**.

## License

[MIT](LICENSE)
