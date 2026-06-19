import { runAsyncCacheBench } from './async-cache';
import { runCacheBench } from './cache';
import { runEventLoopBench } from './eventloop';
import { runSerializerBench } from './serializer';

async function main() {
  try {
    console.log('express-memorize benchmark suite\n');
    await runSerializerBench();
    await runCacheBench();
    await runAsyncCacheBench();
    await runEventLoopBench();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

void main();
