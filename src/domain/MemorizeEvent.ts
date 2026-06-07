import type { MemorizeDeleteEvent } from './MemorizeDeleteEvent';
import type { MemorizeEmptyEvent } from './MemorizeEmptyEvent';
import type { MemorizeEvictEvent } from './MemorizeEvictEvent';
import type { MemorizeExpireEvent } from './MemorizeExpireEvent';
import type { MemorizeSetEvent } from './MemorizeSetEvent';

/** Union of all possible cache events. */
export type MemorizeEvent =
  | MemorizeSetEvent
  | MemorizeDeleteEvent
  | MemorizeExpireEvent
  | MemorizeEmptyEvent
  | MemorizeEvictEvent;
