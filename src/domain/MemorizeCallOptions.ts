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
   * Pass `0` or omit to fall back to the global TTL.
   */
  ttl?: number;
}
