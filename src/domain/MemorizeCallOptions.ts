/**
 * Options passed when invoking `cache()` to create a route-level middleware.
 *
 * @example
 * ```ts
 * // This route uses a 10-second TTL instead of the global 60-second TTL.
 * app.get('/products', cache({ ttl: 10_000 }), handler);
 * ```
 */
export interface MemorizeCallOptions {
  /**
   * Time-to-live override for this specific route, in milliseconds.
   * Takes precedence over the global `ttl` set in {@link MemorizeOptions}.
   * Omit to fall back to the global TTL. Pass `Infinity` to cache indefinitely.
   * Pass `0` to expire immediately.
   */
  ttl?: number;
  /**
   * When `true`, the middleware skips both reading from and writing to the cache
   * for this route and sets `X-Cache: BYPASS` on the response. Useful when a
   * global `app.use(cache())` is in place but a specific route should never be cached.
   */
  noCache?: boolean;
}
