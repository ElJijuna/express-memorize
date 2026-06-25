export interface CacheKeyOptions {
  separator?: string;
}

export const DEFAULT_SEPARATOR = ':';

function escapeGlob(value: string): string {
  return value.replace(/[*?]/g, '\\$&');
}

function partToString(part: unknown): string {
  return escapeGlob(String(part ?? ''));
}

export function createCacheKey(key: unknown | Array<unknown>, options?: CacheKeyOptions): string {
  const sep = options?.separator ?? DEFAULT_SEPARATOR;

  if (Array.isArray(key)) {
    return key.map(partToString).join(sep);
  }

  return escapeGlob(String(key ?? ''));
}
