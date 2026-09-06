import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memorize } from '../memorize';
import { canUseNativeSqlite } from '../SqliteMemorizeStore';

describe.each(['memory', 'sqlite'] as const)('%s cache integrity', (type) => {
  const testWithStorage = type === 'sqlite' && !canUseNativeSqlite() ? it.skip : it;

  testWithStorage.each([-1, NaN, -Infinity])('rejects TTL %s without losing entries', (ttl) => {
    const directory = mkdtempSync(join(tmpdir(), 'memorize-integrity-'));
    const cache = memorize({ maxEntries: 1, storage: { type, directory } });

    try {
      cache.set('existing', 'original');
      const bytes = cache.byteSize();

      expect(() => cache.set('existing', 'replacement', ttl)).toThrow();
      expect(cache.getValue('existing')).toBe('original');
      expect(() => cache.set('new', 'replacement', ttl)).toThrow();
      expect(cache.getValue('existing')).toBe('original');
      expect(cache.size()).toBe(1);
      expect(cache.byteSize()).toBe(bytes);
    } finally {
      cache.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  testWithStorage('lists special object keys as own enumerable properties', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memorize-integrity-'));
    const cache = memorize({ storage: { type, directory } });
    const keys = ['__proto__', 'constructor', 'toString'];

    try {
      for (const key of keys) {
        cache.set(key, key);
      }

      for (const result of [cache.getAll(), await cache.getAllAsync({ batchSize: 1 })]) {
        expect(Object.keys(result).sort()).toEqual([...keys].sort());

        for (const key of keys) {
          expect(Object.hasOwn(result, key)).toBe(true);
          expect(result[key].key).toBe(key);
        }
      }
    } finally {
      cache.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('rememberAsync concurrent mutations', () => {
  it.each([
    'set',
    'delete',
    'clear',
    'deleteMatching',
    'dispose',
  ] as const)('respects %s while the factory is pending', async (mutation) => {
    const cache = memorize();

    let resolveFactory!: (value: string) => void;
    let markStarted!: () => void;

    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const value = new Promise<string>((resolve) => {
      resolveFactory = resolve;
    });
    const pending = cache.rememberAsync('key', () => {
      markStarted();

      return value;
    });

    try {
      await started;

      if (mutation === 'set') {
        cache.set('key', 'newer');
      } else if (mutation === 'delete' || mutation === 'deleteMatching') {
        cache[mutation]('key');
      } else {
        cache[mutation]();
      }

      resolveFactory('stale');

      await expect(pending).resolves.toBe('stale');
      expect(cache.getValue('key')).toBe(mutation === 'set' ? 'newer' : undefined);
    } finally {
      cache.dispose();
    }
  });
});
