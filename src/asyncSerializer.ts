import { clearTimeout as timerClearTimeout, setTimeout as timerSetTimeout } from 'node:timers';
import type { SerializerOption } from './serializer';

type BuiltInSerializerOption = 'json' | 'v8' | 'auto';

type AsyncSerializerRequest =
  | { id: number; action: 'serialize'; serializer: BuiltInSerializerOption; value: unknown }
  | {
      id: number;
      action: 'deserialize';
      serializer: BuiltInSerializerOption;
      data: string | Buffer;
    };

type AsyncSerializerResponse =
  | { id: number; result: unknown }
  | { id: number; error: { name?: string; message?: string } };

interface WorkerLike {
  on(event: 'message', listener: (message: AsyncSerializerResponse) => void): WorkerLike;
  on(event: 'error', listener: (error: Error) => void): WorkerLike;
  postMessage(message: AsyncSerializerRequest): void;
  terminate(): Promise<number>;
  unref?(): void;
}

interface WorkerConstructor {
  new (filename: string, options: { eval: true }): WorkerLike;
}

interface WorkerSlot {
  worker: WorkerLike;
  pending: Map<number, PendingRequest>;
  idleTimer: ReturnType<typeof timerSetTimeout> | null;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export type AsyncSerializerMode = 'yield' | 'worker';

const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
const v8 = require('node:v8');

function normalizeBuffer(data) {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function serialize(serializer, value) {
  if (serializer === 'json') return JSON.stringify(value);
  return v8.serialize(value);
}

function deserialize(serializer, data) {
  if (serializer === 'json') {
    return JSON.parse(typeof data === 'string' ? data : normalizeBuffer(data).toString());
  }
  return v8.deserialize(normalizeBuffer(data));
}

parentPort.on('message', (message) => {
  try {
    const result = message.action === 'serialize'
      ? serialize(message.serializer, message.value)
      : deserialize(message.serializer, message.data);
    parentPort.postMessage({ id: message.id, result });
  } catch (error) {
    parentPort.postMessage({
      id: message.id,
      error: {
        name: error && error.name,
        message: error && error.message ? error.message : String(error),
      },
    });
  }
});
`;

function isWorkerSerializer(
  option: SerializerOption | undefined,
): option is 'json' | 'v8' | 'auto' | undefined {
  return option === undefined || option === 'json' || option === 'v8' || option === 'auto';
}

function getAvailableParallelism(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('node:os') as typeof import('node:os');

    return os.availableParallelism?.() ?? os.cpus().length;
  } catch {
    return 1;
  }
}

function normalizeWorkerCount(workers: number | 'auto' | undefined): number {
  const available = Math.max(1, getAvailableParallelism());
  const auto = Math.max(1, Math.min(4, available - 1 || 1));
  const requested = workers === undefined || workers === 'auto' ? auto : workers;

  if (!Number.isInteger(requested) || requested <= 0) {
    throw new RangeError('asyncSerializerWorkers must be a positive integer or "auto"');
  }

  return Math.max(1, Math.min(requested, available, 8));
}

function normalizeWorkerResult(result: unknown): string | Buffer {
  if (typeof result === 'string') {
    return result;
  }

  if (Buffer.isBuffer(result)) {
    return result;
  }

  if (result instanceof Uint8Array) {
    return Buffer.from(result);
  }

  throw new TypeError('worker serializer returned an unsupported value');
}

export class WorkerAsyncSerializer {
  private _nextId = 1;
  private readonly _slots: WorkerSlot[] = [];
  private _WorkerCtor: WorkerConstructor | null | undefined;
  readonly workerCount: number;

  constructor(
    private readonly _serializer: BuiltInSerializerOption,
    workers?: number | 'auto',
  ) {
    this.workerCount = normalizeWorkerCount(workers);
  }

  async serialize(value: unknown): Promise<string | Buffer> {
    const result = await this._request({
      id: 0,
      action: 'serialize',
      serializer: this._serializer,
      value,
    });

    return normalizeWorkerResult(result);
  }

  deserialize(data: string | Buffer): Promise<unknown> {
    return this._request({ id: 0, action: 'deserialize', serializer: this._serializer, data });
  }

  private _request(message: AsyncSerializerRequest): Promise<unknown> {
    const id = this._nextId++;
    const request = { ...message, id } as AsyncSerializerRequest;

    return new Promise((resolve, reject) => {
      const slot = this._getSlot();

      this._clearIdleTimer(slot);
      slot.pending.set(id, { resolve, reject });

      try {
        slot.worker.postMessage(request);
      } catch (error) {
        slot.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private _getSlot(): WorkerSlot {
    const available = this._slots.find((slot) => slot.pending.size === 0);

    if (available) {
      return available;
    }

    if (this._slots.length < this.workerCount) {
      return this._createSlot();
    }

    return this._slots.reduce((best, slot) =>
      slot.pending.size < best.pending.size ? slot : best,
    );
  }

  private _createSlot(): WorkerSlot {
    const worker = new (this._getWorkerConstructor())(WORKER_SOURCE, { eval: true });

    worker.unref?.();
    const slot: WorkerSlot = { worker, pending: new Map(), idleTimer: null };

    worker.on('message', (message) => this._handleMessage(slot, message));
    worker.on('error', (error) => this._rejectAll(slot, error));
    this._slots.push(slot);

    return slot;
  }

  private _getWorkerConstructor(): WorkerConstructor {
    if (this._WorkerCtor !== undefined) {
      if (!this._WorkerCtor) {
        throw new Error('node:worker_threads is not available');
      }

      return this._WorkerCtor;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Worker } = require('node:worker_threads') as { Worker: WorkerConstructor };

      this._WorkerCtor = Worker;

      return Worker;
    } catch {
      this._WorkerCtor = null;

      throw new Error('node:worker_threads is not available');
    }
  }

  private _handleMessage(slot: WorkerSlot, message: AsyncSerializerResponse): void {
    const pending = slot.pending.get(message.id);

    if (!pending) {
      return;
    }

    slot.pending.delete(message.id);

    if ('error' in message) {
      const error = new Error(message.error.message ?? 'worker serializer failed');

      error.name = message.error.name ?? 'Error';
      pending.reject(error);
      this._scheduleIdleShutdown(slot);

      return;
    }

    pending.resolve(message.result);
    this._scheduleIdleShutdown(slot);
  }

  private _rejectAll(slot: WorkerSlot, error: Error): void {
    this._clearIdleTimer(slot);

    for (const [id, pending] of slot.pending) {
      slot.pending.delete(id);
      pending.reject(error);
    }

    this._removeSlot(slot);
  }

  private _scheduleIdleShutdown(slot: WorkerSlot): void {
    if (slot.pending.size > 0) {
      return;
    }

    slot.idleTimer = (globalThis.setTimeout ?? timerSetTimeout)(() => {
      this._removeSlot(slot);
      void slot.worker.terminate();
    }, 50);

    if (typeof slot.idleTimer === 'object' && 'unref' in slot.idleTimer) {
      slot.idleTimer.unref();
    }
  }

  private _clearIdleTimer(slot: WorkerSlot): void {
    if (!slot.idleTimer) {
      return;
    }

    (globalThis.clearTimeout ?? timerClearTimeout)(slot.idleTimer);
    slot.idleTimer = null;
  }

  private _removeSlot(slot: WorkerSlot): void {
    this._clearIdleTimer(slot);
    const index = this._slots.indexOf(slot);

    if (index !== -1) {
      this._slots.splice(index, 1);
    }
  }

  /**
   * Terminates every worker immediately. Pending requests are rejected.
   * The serializer must not be used after disposal.
   */
  dispose(): void {
    for (const slot of [...this._slots]) {
      this._rejectAll(slot, new Error('[express-memorize] async serializer disposed'));
      void slot.worker.terminate();
    }
  }
}

export function createWorkerAsyncSerializer(
  option: SerializerOption | undefined,
  workers?: number | 'auto',
): WorkerAsyncSerializer | null {
  if (!isWorkerSerializer(option)) {
    return null;
  }

  return new WorkerAsyncSerializer(option ?? 'auto', workers);
}
