import { runAsyncCacheBench } from './async-cache';
import { runCacheBench } from './cache';
import { runEventLoopBench } from './eventloop';
import { runSerializerBench } from './serializer';

async function main() {
  console.log('express-memorize benchmark suite\n');
  await runSerializerBench();
  await runCacheBench();
  await runAsyncCacheBench();
  await runEventLoopBench();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
