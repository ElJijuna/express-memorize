import { runSerializerBench } from './serializer';
import { runCacheBench } from './cache';

async function main() {
  console.log('express-memorize benchmark suite\n');
  await runSerializerBench();
  await runCacheBench();
}

main().catch((err) => { console.error(err); process.exit(1); });
