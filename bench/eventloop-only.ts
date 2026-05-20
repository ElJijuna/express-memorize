import { runEventLoopBench } from './eventloop';

runEventLoopBench().catch((err) => {
  console.error(err);
  process.exit(1);
});
