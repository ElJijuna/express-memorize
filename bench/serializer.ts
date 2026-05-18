import { Bench } from 'tinybench';
import v8 from 'node:v8';
import { createSerializer } from '../src/serializer';

const json = createSerializer('json');
const v8s  = createSerializer('v8');

const simplePayload = { id: 1, name: 'Alice', active: true, score: 98.6 };
const complexPayload = {
  id: 42,
  date: new Date('2024-01-01'),
  tags: new Set(['a', 'b', 'c']),
  meta: new Map([['key', 'value']]),
  buffer: Buffer.from('hello world'),
  nested: { deep: { deeper: [1, 2, 3] } },
};
const largePayload = Array.from({ length: 500 }, (_, i) => ({
  id: i,
  name: `user_${i}`,
  value: Math.random(),
}));

export async function runSerializerBench() {
  console.log('\n=== Serializer: simple object ===');
  const simple = new Bench({ iterations: 50_000 });
  simple.add('JSON serialize  ', () => json.serialize(simplePayload));
  simple.add('v8   serialize  ', () => v8s.serialize(simplePayload));
  simple.add('JSON deserialize', () => json.deserialize(json.serialize(simplePayload)));
  simple.add('v8   deserialize', () => v8s.deserialize(v8s.serialize(simplePayload)));
  await simple.run();
  console.table(simple.table());

  console.log('\n=== Serializer: large array (500 items) ===');
  const jsonLargeEncoded = json.serialize(largePayload);
  const v8LargeEncoded  = v8s.serialize(largePayload);
  const large = new Bench({ iterations: 5_000 });
  large.add('JSON serialize  ', () => json.serialize(largePayload));
  large.add('v8   serialize  ', () => v8s.serialize(largePayload));
  large.add('JSON deserialize', () => json.deserialize(jsonLargeEncoded));
  large.add('v8   deserialize', () => v8s.deserialize(v8LargeEncoded));
  await large.run();
  console.table(large.table());

  console.log('\n=== Serializer: v8-only types (Date, Map, Set, Buffer) ===');
  const v8Encoded = v8.serialize(complexPayload);
  const complex = new Bench({ iterations: 20_000 });
  complex.add('v8 serialize complex  ', () => v8s.serialize(complexPayload));
  complex.add('v8 deserialize complex', () => v8s.deserialize(v8Encoded));
  await complex.run();
  console.table(complex.table());
}
