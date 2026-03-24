# Changelog

All notable changes to this project will be documented in this file.

This file is automatically updated by [release-please](https://github.com/googleapis/release-please) based on [Conventional Commits](https://www.conventionalcommits.org/).

## [1.1.0](https://github.com/ElJijuna/express-memorize/compare/v1.0.0...v1.1.0) (2026-03-24)


### Features

* add evento to notify when cache is empty. ([8484f29](https://github.com/ElJijuna/express-memorize/commit/8484f29f1d1f2bd275970a0c02fa9b64a46576b9))

## 1.0.0 (2026-03-24)


### Features

* add events to log activity in memory store. ([5b3905b](https://github.com/ElJijuna/express-memorize/commit/5b3905b898a5d91c4c61510dd5d8c92eabf096e9))
* add github action to publish in NPM ([7f79eca](https://github.com/ElJijuna/express-memorize/commit/7f79eca766356280f677411b166c8e2608140d16))
* add middleware to use memorize. ([73a02a0](https://github.com/ElJijuna/express-memorize/commit/73a02a096750ec66bb8d9c183b0f07c2aeb3cd83))
* add tests and express client to execute local implementation. ([75d3cf8](https://github.com/ElJijuna/express-memorize/commit/75d3cf81f979a04ef9f0964a444e2966a2ba8164))
* add validation to only add to store GET methods in middleware. ([04e2918](https://github.com/ElJijuna/express-memorize/commit/04e291884ab083321838cca40755e2c02e98ec6c))

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
