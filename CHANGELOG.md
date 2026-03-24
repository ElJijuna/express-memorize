# Changelog

All notable changes to this project will be documented in this file.

This file is automatically updated by [release-please](https://github.com/googleapis/release-please) based on [Conventional Commits](https://www.conventionalcommits.org/).

## [1.0.0] - 2026-03-24

### Features

- In-memory cache middleware for Express.js
- Key-value store using full request path (`originalUrl`) as key
- TTL support with automatic expiry via `setTimeout`
- Per-route TTL override
- Caches only `GET` requests with `2xx` status codes
- `Content-Type` preservation on cache hits
- `X-Cache: HIT | MISS` response header
- Cache management API: `get`, `getAll`, `delete`, `clear`
- Event system: `set`, `delete`, `expire` hooks
- Full TypeScript support with declaration files
