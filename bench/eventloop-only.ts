import { runEventLoopBench } from './eventloop';

async function run() {
  try {
    await runEventLoopBench();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

void run();
