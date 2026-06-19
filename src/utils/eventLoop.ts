import { setImmediate as timerSetImmediate } from 'node:timers';

/** @internal */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => (globalThis.setImmediate ?? timerSetImmediate)(resolve));
}
