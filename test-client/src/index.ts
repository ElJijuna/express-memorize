import express from 'express';
import { memorize } from '../../src';

const app = express();
app.use(express.json());

const cache = memorize({ ttl: 30_000 }); // TTL global: 30s

cache.on('set', (e) => {
  console.log(`[cache:set]    ${e.key} — status ${e.statusCode} | ttl: ${e.expiresAt ? `${e.expiresAt - Date.now()}ms` : 'none'}`);
});

cache.on('delete', (e) => {
  console.log(`[cache:delete] ${e.key}`);
});

cache.on('expire', (e) => {
  console.log(`[cache:expire] ${e.key}`);
});

// --- Fake data ---

const users = [
  { id: 1, name: 'Ivan' },
  { id: 2, name: 'Maria' },
];

const products = [
  { id: 1, name: 'Laptop', price: 999 },
  { id: 2, name: 'Mouse', price: 29 },
];

// --- Routes ---

// Cached with global TTL (30s)
app.get('/users', cache(), (req, res) => {
  console.log('[handler] GET /users — computing response');
  res.json({ data: users });
});

// Cached with global TTL (30s)
app.get('/users/:id', cache(), (req, res) => {
  console.log('[handler] GET /users/:id — computing response');
  const user = users.find((u) => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ data: user });
});

app.delete('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return res.status(404).json({ error: 'User not found' });
  users.splice(index, 1);
  cache.delete(`/users/${id}`);
  cache.delete('/users');
  console.log(`[handler] DELETE /users/${id} — user deleted, cache invalidated`);
  res.json({ message: 'User deleted' });
});

// Cached with TTL override (10s)
app.get('/products', cache({ ttl: 10_000 }), (req, res) => {
  console.log('[handler] GET /products — computing response');
  res.json({ data: products });
});

// Cached as plain text
app.get('/ping', cache(), (req, res) => {
  console.log('[handler] GET /ping — computing response');
  res.type('text').send('pong');
});

// Not cached (5xx always bypasses cache)
app.get('/error', cache(), (req, res) => {
  console.log('[handler] GET /error — computing response');
  res.status(500).json({ error: 'Something went wrong' });
});

// Mutates data — triggers cache invalidation manually
app.post('/users', (req, res) => {
  const { name } = req.body as { name: string };
  const newUser = { id: users.length + 1, name };
  users.push(newUser);
  cache.delete('/users');
  console.log(`[handler] POST /users — added "${name}", cache invalidated`);
  res.status(201).json({ data: newUser });
});

// --- Cache inspection / management ---

app.get('/cache', (req, res) => {
  res.json({ data: cache.getAll() });
});

app.get('/cache/:key(*)', (req, res) => {
  const key = `/${req.params.key}`;
  const entry = cache.get(key);
  if (!entry) return res.status(404).json({ error: `No cache entry for "${key}"` });
  res.json({ data: entry });
});

app.delete('/cache/:key(*)', (req, res) => {
  const key = `/${req.params.key}`;
  const deleted = cache.delete(key);
  if (!deleted) return res.status(404).json({ error: `No cache entry for "${key}"` });
  res.json({ message: `Cache entry "${key}" deleted` });
});

app.delete('/cache', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache cleared' });
});

// --- Start ---

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET    /users              — cached (30s TTL)');
  console.log('  GET    /products           — cached (10s TTL override)');
  console.log('  GET    /ping               — cached as text/plain');
  console.log('  GET    /error              — never cached (500)');
  console.log('  POST   /users              — adds user + invalidates /users cache');
  console.log('  GET    /cache              — inspect all cache entries');
  console.log('  GET    /cache/:key         — inspect a specific entry');
  console.log('  DELETE /cache/:key         — delete a specific entry');
  console.log('  DELETE /cache              — clear all cache');
});
