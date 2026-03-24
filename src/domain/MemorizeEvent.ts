import { MemorizeSetEvent } from './MemorizeSetEvent';
import { MemorizeDeleteEvent } from './MemorizeDeleteEvent';
import { MemorizeExpireEvent } from './MemorizeExpireEvent';
import { MemorizeEmptyEvent } from './MemorizeEmptyEvent';

/** Union of all possible cache events. */
export type MemorizeEvent =
  | MemorizeSetEvent
  | MemorizeDeleteEvent
  | MemorizeExpireEvent
  | MemorizeEmptyEvent;
