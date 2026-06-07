import { Bench } from 'tinybench';
import { memorize } from '../src/memorize';

const smallPayload = { id: 1, name: 'small', ok: true };
const largePayload = Array.from({ length: 2_000 }, (_, i) => ({
  id: i,
  name: `user_${i}`,
  score: Math.random(),
  nested: { active: i % 2 === 0, tags: [`tag_${i % 10}`, `tag_${i % 5}`] },
}));

export async function runAsyncCacheBench() {
  console.log('\n=== Async cache setAsync() — small payload ===');
  const smallYield = memorize({ serializer: 'json', ttl: Infinity });
  const smallWorker = memorize({
    serializer: 'json',
    ttl: Infinity,
    asyncSerializer: 'worker',
    asyncSerializerThresholdBytes: 0,
  });
  const smallBench = new Bench({ iterations: 500 });
  let i = 0;
  smallBench.add('yield setAsync small', () =>
    smallYield.setAsync(`small:yield:${i++}`, smallPayload, Infinity),
  );
  smallBench.add('worker setAsync small', () =>
    smallWorker.setAsync(`small:worker:${i++}`, smallPayload, Infinity),
  );
  await smallBench.run();
  console.table(smallBench.table());

  console.log('\n=== Async cache setAsync() — large payload ===');
  const largeYield = memorize({ serializer: 'json', ttl: Infinity });
  const largeWorker1 = memorize({
    serializer: 'json',
    ttl: Infinity,
    asyncSerializer: 'worker',
    asyncSerializerWorkers: 1,
    asyncSerializerThresholdBytes: 0,
  });
  const largeWorkerAuto = memorize({
    serializer: 'json',
    ttl: Infinity,
    asyncSerializer: 'worker',
    asyncSerializerWorkers: 'auto',
    asyncSerializerThresholdBytes: 0,
  });
  const largeWorker4 = memorize({
    serializer: 'json',
    ttl: Infinity,
    asyncSerializer: 'worker',
    asyncSerializerWorkers: 4,
    asyncSerializerThresholdBytes: 0,
  });
  const largeBench = new Bench({ iterations: 100 });
  largeBench.add('yield setAsync large', () =>
    largeYield.setAsync(`large:yield:${i++}`, largePayload, Infinity),
  );
  largeBench.add('worker(1) setAsync large', () =>
    largeWorker1.setAsync(`large:w1:${i++}`, largePayload, Infinity),
  );
  largeBench.add('worker(auto) setAsync large', () =>
    largeWorkerAuto.setAsync(`large:wauto:${i++}`, largePayload, Infinity),
  );
  largeBench.add('worker(4) setAsync large', () =>
    largeWorker4.setAsync(`large:w4:${i++}`, largePayload, Infinity),
  );
  await largeBench.run();
  console.table(largeBench.table());

  console.log('\n=== Async cache getValueAsync() — large payload hot entry ===');
  await largeYield.setAsync('large:yield:hot', largePayload, Infinity);
  await largeWorker1.setAsync('large:w1:hot', largePayload, Infinity);
  await largeWorkerAuto.setAsync('large:wauto:hot', largePayload, Infinity);
  await largeWorker4.setAsync('large:w4:hot', largePayload, Infinity);
  const getBench = new Bench({ iterations: 100 });
  getBench.add('yield getValueAsync large', () => largeYield.getValueAsync('large:yield:hot'));
  getBench.add('worker(1) getValueAsync large', () => largeWorker1.getValueAsync('large:w1:hot'));
  getBench.add('worker(auto) getValueAsync large', () =>
    largeWorkerAuto.getValueAsync('large:wauto:hot'),
  );
  getBench.add('worker(4) getValueAsync large', () => largeWorker4.getValueAsync('large:w4:hot'));
  await getBench.run();
  console.table(getBench.table());
}
