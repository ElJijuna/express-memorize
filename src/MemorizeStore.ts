export interface CacheEntry {
  body: unknown;
  statusCode: number;
  expiresAt: number | null;
}

export interface CacheInfo extends CacheEntry {
  key: string;
  remainingTtl: number | null;
}

export class MemorizeStore {
  private _store = new Map<string, CacheEntry>();
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();

  set(key: string, entry: Omit<CacheEntry, 'expiresAt'>, ttl?: number): void {
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key)!);
      this._timers.delete(key);
    }

    const expiresAt = ttl ? Date.now() + ttl : null;
    this._store.set(key, { ...entry, expiresAt });

    if (ttl) {
      const timer = setTimeout(() => {
        this._store.delete(key);
        this._timers.delete(key);
      }, ttl);

      if (typeof timer === 'object' && 'unref' in timer) timer.unref();
      this._timers.set(key, timer);
    }
  }

  get(key: string): CacheInfo | null {
    const entry = this._store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._evict(key);
      return null;
    }

    return this._format(key, entry);
  }

  getAll(): Record<string, CacheInfo> {
    const result: Record<string, CacheInfo> = {};

    for (const [key, entry] of this._store) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this._evict(key);
        continue;
      }
      result[key] = this._format(key, entry);
    }

    return result;
  }

  delete(key: string): boolean {
    if (!this._store.has(key)) return false;
    this._evict(key);
    return true;
  }

  clear(): void {
    for (const key of this._store.keys()) {
      this._evict(key);
    }
  }

  getRaw(key: string): CacheEntry | null {
    const entry = this._store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._evict(key);
      return null;
    }

    return entry;
  }

  private _evict(key: string): void {
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key)!);
      this._timers.delete(key);
    }
    this._store.delete(key);
  }

  private _format(key: string, entry: CacheEntry): CacheInfo {
    return {
      key,
      body: entry.body,
      statusCode: entry.statusCode,
      expiresAt: entry.expiresAt,
      remainingTtl: entry.expiresAt ? Math.max(0, entry.expiresAt - Date.now()) : null,
    };
  }
}
