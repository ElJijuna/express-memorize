export interface CacheEntry {
  body: unknown;
  statusCode: number;
  contentType: string;
  expiresAt: number | null;
}

export interface CacheInfo extends CacheEntry {
  key: string;
  remainingTtl: number | null;
}

// --- Events ---

export interface MemorizeSetEvent {
  type: 'set';
  key: string;
  body: unknown;
  statusCode: number;
  contentType: string;
  expiresAt: number | null;
}

export interface MemorizeDeleteEvent {
  type: 'delete';
  key: string;
}

export interface MemorizeExpireEvent {
  type: 'expire';
  key: string;
}

export type MemorizeEvent = MemorizeSetEvent | MemorizeDeleteEvent | MemorizeExpireEvent;
export type MemorizeEventType = MemorizeEvent['type'];
type ListenerMap = {
  set: Array<(e: MemorizeSetEvent) => void>;
  delete: Array<(e: MemorizeDeleteEvent) => void>;
  expire: Array<(e: MemorizeExpireEvent) => void>;
};

// --- Store ---

export class MemorizeStore {
  private _store = new Map<string, CacheEntry>();
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _listeners: ListenerMap = { set: [], delete: [], expire: [] };

  on(event: 'set', handler: (e: MemorizeSetEvent) => void): void;
  on(event: 'delete', handler: (e: MemorizeDeleteEvent) => void): void;
  on(event: 'expire', handler: (e: MemorizeExpireEvent) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: MemorizeEventType, handler: (e: any) => void): void {
    this._listeners[event].push(handler);
  }

  set(key: string, entry: Omit<CacheEntry, 'expiresAt'>, ttl?: number | null): void {
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key)!);
      this._timers.delete(key);
    }

    const expiresAt = ttl ? Date.now() + ttl : null;
    const stored: CacheEntry = { ...entry, expiresAt };
    this._store.set(key, stored);

    this._emit('set', { type: 'set', key, ...entry, expiresAt });

    if (ttl) {
      const timer = setTimeout(() => {
        this._evict(key, 'expire');
      }, ttl);

      if (typeof timer === 'object' && 'unref' in timer) timer.unref();
      this._timers.set(key, timer);
    }
  }

  get(key: string): CacheInfo | null {
    const entry = this._store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._evict(key, 'expire');
      return null;
    }

    return this._format(key, entry);
  }

  getAll(): Record<string, CacheInfo> {
    const result: Record<string, CacheInfo> = {};

    for (const [key, entry] of this._store) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this._evict(key, 'expire');
        continue;
      }
      result[key] = this._format(key, entry);
    }

    return result;
  }

  delete(key: string): boolean {
    if (!this._store.has(key)) return false;
    this._evict(key, 'delete');
    return true;
  }

  clear(): void {
    for (const key of this._store.keys()) {
      this._evict(key, 'delete');
    }
  }

  getRaw(key: string): CacheEntry | null {
    const entry = this._store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._evict(key, 'expire');
      return null;
    }

    return entry;
  }

  private _evict(key: string, reason: 'delete' | 'expire'): void {
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key)!);
      this._timers.delete(key);
    }
    this._store.delete(key);
    this._emit(reason, { type: reason, key });
  }

  private _emit(event: MemorizeEventType, payload: MemorizeEvent): void {
    for (const handler of this._listeners[event] as Array<(e: MemorizeEvent) => void>) {
      handler(payload);
    }
  }

  private _format(key: string, entry: CacheEntry): CacheInfo {
    return {
      key,
      body: entry.body,
      statusCode: entry.statusCode,
      contentType: entry.contentType,
      expiresAt: entry.expiresAt,
      remainingTtl: entry.expiresAt ? Math.max(0, entry.expiresAt - Date.now()) : null,
    };
  }
}
