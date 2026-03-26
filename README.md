# express-memorize

<p align="center">
  <a href="https://www.npmjs.com/package/express-memorize"><img src="https://img.shields.io/npm/v/express-memorize?color=blue&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/express-memorize"><img src="https://img.shields.io/npm/dm/express-memorize?color=blue" alt="npm downloads" /></a>
  <a href="https://github.com/ElJijuna/express-memorize/actions"><img src="https://github.com/ElJijuna/express-memorize/actions/workflows/publish.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/ElJijuna/express-memorize/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="license" /></a>
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

### Global middleware

Apply the cache to the entire application with `app.use()`. Every `GET` route is cached automatically — non-`GET` requests are bypassed without any extra configuration.

```typescript
const cache = memorize({ ttl: 60_000 });

app.use(cache()); // applies to all GET routes

app.get('/users',   (req, res) => { res.json({ data: users }) });
app.get('/products', (req, res) => { res.json({ data: products }) });
// POST, PUT, PATCH, DELETE routes are unaffected
```

### Per-route cache

```typescript
const cache = memorize({ ttl: 60_000 });

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

### Pattern-based invalidation

Use `cache.deleteMatching(pattern)` to remove all cache entries whose keys match a glob pattern. This is useful when you don't know the exact key — for example, when a URL may have different query strings.

```typescript
// Cached keys: /api/users/abc123, /api/users/abc123?lang=es, /api/users/abc123?page=1
app.put('/users/:id', (req, res) => {
  users.update(req.params.id, req.body);

  // Remove all cached variants of this user, regardless of query params
  const deleted = cache.deleteMatching(`**/users/${req.params.id}*`);
  console.log(`${deleted} cache entries removed`);

  res.json({ ok: true });
});
```

**Glob rules:**

| Pattern | Behaviour |
|---------|-----------|
| `*` | Matches any sequence of characters **within** a single path segment (does not cross `/`) |
| `**` | Matches any sequence of characters **across** path segments (crosses `/`) |
| `?` | Matches any single character except `/` |

`deleteMatching` returns the number of entries removed and emits a `delete` event for each one.

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
cache.delete('/users');                  // remove one entry
cache.deleteMatching('**/users/*');      // remove all /users/* entries
cache.clear();                           // remove all entries
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
| `deleteMatching` | `(pattern: string) => number` | Removes all entries matching a glob pattern. Returns the count removed. |
| `clear` | `() => void` | Removes all entries. |

### Events

| Event | Payload | When |
|-------|---------|------|
| `set` | `{ type, key, body, statusCode, contentType, expiresAt }` | A response is stored |
| `delete` | `{ type, key }` | `cache.delete()`, `cache.deleteMatching()`, or `cache.clear()` is called |
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
