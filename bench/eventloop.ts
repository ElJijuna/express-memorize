import { monitorEventLoopDelay } from 'node:perf_hooks';
import { memorize } from '../src/memorize';

const DEFAULT_ENTRIES = 25_000;
const DEFAULT_PAYLOAD_ITEMS = 25;
const DEFAULT_BATCH_SIZE = 1_000;

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function createPayload(seed: number, items: number) {
  return Array.from({ length: items }, (_, i) => ({
    id: seed * items + i,
    name: `item_${seed}_${i}`,
    active: i % 2 === 0,
    value: Math.random(),
  }));
}

function msFromNs(ns: number): number {
  return ns / 1_000_000;
}

function formatMs(value: number): string {
  return `${value.toFixed(2)} ms`;
}

async function waitForMonitorTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function measureBlock(
  name: string,
  fn: () => undefined | number | Promise<undefined | number>,
): Promise<{ name: string; durationMs: string; eventLoopMaxMs: string; result: number | string }> {
  const delay = monitorEventLoopDelay({ resolution: 1 });

  delay.enable();
  await waitForMonitorTick();

  const startedAt = process.hrtime.bigint();
  const result = await fn();
  const durationMs = msFromNs(Number(process.hrtime.bigint() - startedAt));

  await waitForMonitorTick();
  delay.disable();

  return {
    name,
    durationMs: formatMs(durationMs),
    eventLoopMaxMs: formatMs(msFromNs(delay.max)),
    result: typeof result === 'number' ? result : '',
  };
}

export async function runEventLoopBench() {
  const entries = readPositiveInt('EVENTLOOP_ENTRIES', DEFAULT_ENTRIES);
  const payloadItems = readPositiveInt('EVENTLOOP_PAYLOAD_ITEMS', DEFAULT_PAYLOAD_ITEMS);
  const batchSize = readPositiveInt('EVENTLOOP_BATCH_SIZE', DEFAULT_BATCH_SIZE);

  console.log(`\n=== Event loop pressure — ${entries} entries, ${payloadItems} payload items ===`);
  console.log(
    'Set EVENTLOOP_ENTRIES, EVENTLOOP_PAYLOAD_ITEMS, and EVENTLOOP_BATCH_SIZE to scale this check.',
  );

  const cache = memorize({ ttl: Infinity, maxEntries: entries + 1, serializer: 'json' });
  const asyncCache = memorize({ ttl: Infinity, maxEntries: entries + 1, serializer: 'json' });
  const rows = [];

  rows.push(
    await measureBlock('populate set()', () => {
      for (let i = 0; i < entries; i++) {
        cache.set(`key:${i}`, createPayload(i, payloadItems));
      }

      return cache.size();
    }),
  );

  rows.push(
    await measureBlock('hot getValue()', () => {
      let hits = 0;

      for (let i = 0; i < entries; i++) {
        if (cache.getValue(`key:${i}`) !== undefined) {
          hits++;
        }
      }

      return hits;
    }),
  );

  rows.push(await measureBlock('getAll()', () => Object.keys(cache.getAll()).length));

  rows.push(await measureBlock('deleteMatching(key:1*)', () => cache.deleteMatching('key:1*')));

  rows.push(
    await measureBlock('clear()', () => {
      const before = cache.size();

      cache.clear();

      return before;
    }),
  );

  rows.push(
    await measureBlock('populate async target', () => {
      for (let i = 0; i < entries; i++) {
        asyncCache.set(`key:${i}`, createPayload(i, payloadItems));
      }

      return asyncCache.size();
    }),
  );

  rows.push(
    await measureBlock(
      `getAllAsync(${batchSize})`,
      async () => Object.keys(await asyncCache.getAllAsync({ batchSize })).length,
    ),
  );

  rows.push(
    await measureBlock(`deleteMatchingAsync(key:1*, ${batchSize})`, () =>
      asyncCache.deleteMatchingAsync('key:1*', { batchSize }),
    ),
  );

  rows.push(
    await measureBlock(`clearAsync(${batchSize})`, () => asyncCache.clearAsync({ batchSize })),
  );

  console.table(rows);
}
