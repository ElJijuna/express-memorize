# [2.7.0](https://github.com/ElJijuna/express-memorize/compare/v2.6.0...v2.7.0) (2026-06-25)


### Features

* implement createCacheKey and deleteMatching functionality with array support and exact match option ([c4b7daa](https://github.com/ElJijuna/express-memorize/commit/c4b7daa8fca216eca99c10b57d2f95a54db011a2))

# [2.6.0](https://github.com/ElJijuna/express-memorize/compare/v2.5.1...v2.6.0) (2026-06-19)


### Features

* enhance serializer tests and improve cache handling in various adapters ([dd9feb9](https://github.com/ElJijuna/express-memorize/commit/dd9feb956c9e0fc3de3bcc5d54b6222b405f1027))
* refactor async cache and event loop benchmarks; improve error handling and code structure ([7be2242](https://github.com/ElJijuna/express-memorize/commit/7be22420d0a809f8573b0711ade4f0010828dbd3))
* refactor byte size estimation and event loop handling; remove redundant functions ([57139b9](https://github.com/ElJijuna/express-memorize/commit/57139b9b94dbfd594d2de6ac2045819daf5ea128))

## [2.5.1](https://github.com/ElJijuna/express-memorize/compare/v2.5.0...v2.5.1) (2026-06-07)


### Bug Fixes

* add super-configs lint and format setup ([827a279](https://github.com/ElJijuna/express-memorize/commit/827a279afbf778a85f24febcea35a1efd11517ec))

# [2.5.0](https://github.com/ElJijuna/express-memorize/compare/v2.4.0...v2.5.0) (2026-05-20)


### Features

* add lazy worker pool for async serialization ([53026f7](https://github.com/ElJijuna/express-memorize/commit/53026f7351abb81877440d63fa8088d985c01d99))


### Performance Improvements

* add async serializer threshold and benchmarks ([c258d22](https://github.com/ElJijuna/express-memorize/commit/c258d2203f94615507c0b528d5700052b7fc2cc1))
* avoid full key snapshot in clearAsync ([6c16053](https://github.com/ElJijuna/express-memorize/commit/6c16053d0f87ff275629e851c97c81a39b07d093))

# [2.4.0](https://github.com/ElJijuna/express-memorize/compare/v2.3.1...v2.4.0) (2026-05-20)


### Bug Fixes

* guard async cache writes and coalesce remember calls ([24bf853](https://github.com/ElJijuna/express-memorize/commit/24bf853eb26ff55652e0bbf5a55b130d448ed2d7))


### Features

* add async direct cache APIs with cooperative yielding ([0f8e99d](https://github.com/ElJijuna/express-memorize/commit/0f8e99d1f20d933196ccdd2726c8e607b606e40e))
* add batched cache operations and byte-size limits ([8ec1000](https://github.com/ElJijuna/express-memorize/commit/8ec1000ccb409cfc71c5857d541ebda829af8449))
* add worker-backed async serialization ([1dd1883](https://github.com/ElJijuna/express-memorize/commit/1dd18838c9643989d99c753a07b1d77ae8b25f68))


### Performance Improvements

* batch lazy ttl expiry cleanup ([92e6d68](https://github.com/ElJijuna/express-memorize/commit/92e6d682352693fd14c703cd9a878cb74bb3ea06))
* optimize ttl scheduler reprogramming ([c51aadc](https://github.com/ElJijuna/express-memorize/commit/c51aadc0c39afda7fe1cfe69fd4794e31b0d91fc))
* replace per-entry ttl timers with shared scheduler ([df9f9d4](https://github.com/ElJijuna/express-memorize/commit/df9f9d4baf937270d855f0ba1fc71367bdd5c5cc))

## [2.3.1](https://github.com/ElJijuna/express-memorize/compare/v2.3.0...v2.3.1) (2026-05-20)


### Bug Fixes

* update LRU order on direct cache reads ([885867d](https://github.com/ElJijuna/express-memorize/commit/885867d0cb8e15b9236fd6f0a0c32ef5bfaae667))

# [2.3.0](https://github.com/ElJijuna/express-memorize/compare/v2.2.0...v2.3.0) (2026-05-18)


### Features

* add pluggable serializer option with node:v8 support and benchmark suite ([6b86a3e](https://github.com/ElJijuna/express-memorize/commit/6b86a3eebffc0f513261e6fd657904ad4daab911)), closes [#19](https://github.com/ElJijuna/express-memorize/issues/19)

# [2.2.0](https://github.com/ElJijuna/express-memorize/compare/v2.1.0...v2.2.0) (2026-05-11)


### Features

* **fastify:** add Fastify cache adapter (Closes [#9](https://github.com/ElJijuna/express-memorize/issues/9)) ([9b940cd](https://github.com/ElJijuna/express-memorize/commit/9b940cdc4a15c27d17264a497c29d32bde09e523))
* **koa:** add Koa cache adapter (Closes [#8](https://github.com/ElJijuna/express-memorize/issues/8)) ([39673fc](https://github.com/ElJijuna/express-memorize/commit/39673fcd92b5cb5d57560adb982cf1d4b85d4eb5))

# [2.1.0](https://github.com/ElJijuna/express-memorize/compare/v2.0.0...v2.1.0) (2026-05-11)


### Features

* add Infinity TTL support and finite default TTL ([e353785](https://github.com/ElJijuna/express-memorize/commit/e353785966e3ae425610cba200df6f89691beaa0))

# Changelog

All notable changes to this project will be documented in this file.

This file is automatically updated by [release-please](https://github.com/googleapis/release-please) based on [Conventional Commits](https://www.conventionalcommits.org/).

## [1.4.0](https://github.com/ElJijuna/express-memorize/compare/v1.3.0...v1.4.0) (2026-03-31)


### Features

* add hits counter to track cache key consumption ([8104029](https://github.com/ElJijuna/express-memorize/commit/81040296354c8a6de78542d6cc6c3fdc18e21e04))


### Bug Fixes

* add header X-Cache: BYPASS value when set noCache: true in middleware config to override. ([cab3c85](https://github.com/ElJijuna/express-memorize/commit/cab3c85f53885ff287e569248a402632363f31fd))

## [1.3.0](https://github.com/ElJijuna/express-memorize/compare/v1.2.0...v1.3.0) (2026-03-26)


### Features

* add 'deleteMatching' to delete with pattern from cache. ([3564f0a](https://github.com/ElJijuna/express-memorize/commit/3564f0a316c54031216fce8df042b78c81d27fe3))
* add config in middleware to disable cache to specific paths. ([cf89777](https://github.com/ElJijuna/express-memorize/commit/cf897777a2c5c984466ec6061a1befbddf73f502))

## [1.2.0](https://github.com/ElJijuna/express-memorize/compare/v1.1.0...v1.2.0) (2026-03-24)


### Features

* refactor to separate in domain files (one file per scope) and update memorize and Memorize store with implementation ([4f41f8c](https://github.com/ElJijuna/express-memorize/commit/4f41f8c0c350df36dcf111315857b6fd34c1a031))

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
