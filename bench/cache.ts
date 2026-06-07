import { Bench } from 'tinybench';
import { memorize } from '../src/memorize';

const ENTRIES = 1_000;

export async function runCacheBench() {
  const cacheJson = memorize({ serializer: 'json', ttl: Infinity });
  const cacheV8 = memorize({ serializer: 'v8', ttl: Infinity });

  // Pre-populate for get benchmarks
  for (let i = 0; i < ENTRIES; i++) {
    cacheJson.set(`key:${i}`, { id: i, name: `user_${i}`, value: Math.random() });
    cacheV8.set(`key:${i}`, { id: i, name: `user_${i}`, value: Math.random() });
  }

  console.log(`\n=== Cache set() — ${ENTRIES} unique keys ===`);
  const setBench = new Bench({ iterations: 10_000 });
  let i = 0;
  setBench.add('json set()', () => {
    cacheJson.set(`bench:${i++ % ENTRIES}`, { v: i });
  });
  setBench.add('v8   set()', () => {
    cacheV8.set(`bench:${i++ % ENTRIES}`, { v: i });
  });
  await setBench.run();
  console.table(setBench.table());

  console.log('\n=== Cache getValue() — hot entries ===');
  const getBench = new Bench({ iterations: 50_000 });
  getBench.add('json getValue()', () => cacheJson.getValue(`key:${i++ % ENTRIES}`));
  getBench.add('v8   getValue()', () => cacheV8.getValue(`key:${i++ % ENTRIES}`));
  await getBench.run();
  console.table(getBench.table());

  console.log('\n=== Cache remember() — cache hit path ===');
  const factory = async () => ({ computed: true });
  const remBench = new Bench({ iterations: 10_000 });
  remBench.add('json remember() hit', () => cacheJson.remember('remember:json', factory, Infinity));
  remBench.add('v8   remember() hit', () => cacheV8.remember('remember:v8', factory, Infinity));
  await remBench.run();
  console.table(remBench.table());
}
