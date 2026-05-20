import type { SerializerOption } from './serializer';

type AsyncSerializerRequest =
  | { id: number; action: 'serialize'; serializer: 'json' | 'v8' | 'auto'; value: unknown }
  | { id: number; action: 'deserialize'; serializer: 'json' | 'v8' | 'auto'; data: string | Buffer };

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

function isWorkerSerializer(option: SerializerOption | undefined): option is 'json' | 'v8' | 'auto' | undefined {
  return option === undefined || option === 'json' || option === 'v8' || option === 'auto';
}

function normalizeWorkerResult(result: unknown): string | Buffer {
  if (typeof result === 'string') return result;
  if (Buffer.isBuffer(result)) return result;
  if (result instanceof Uint8Array) return Buffer.from(result);
  throw new TypeError('worker serializer returned an unsupported value');
}

export class WorkerAsyncSerializer {
  private _worker: WorkerLike | null = null;
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _nextId = 1;
  private readonly _pending = new Map<number, PendingRequest>();

  constructor(private readonly _serializer: 'json' | 'v8' | 'auto') {}

  serialize(value: unknown): Promise<string | Buffer> {
    return this._request({ id: 0, action: 'serialize', serializer: this._serializer, value })
      .then(normalizeWorkerResult);
  }

  deserialize(data: string | Buffer): Promise<unknown> {
    return this._request({ id: 0, action: 'deserialize', serializer: this._serializer, data });
  }

  private _request(message: AsyncSerializerRequest): Promise<unknown> {
    const id = this._nextId++;
    const request = { ...message, id } as AsyncSerializerRequest;

    return new Promise((resolve, reject) => {
      this._clearIdleTimer();
      this._pending.set(id, { resolve, reject });
      try {
        this._getWorker().postMessage(request);
      } catch (error) {
        this._pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private _getWorker(): WorkerLike {
    if (this._worker) return this._worker;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require('node:worker_threads') as { Worker: WorkerConstructor };
    const worker = new Worker(WORKER_SOURCE, { eval: true });
    worker.unref?.();
    worker.on('message', (message) => this._handleMessage(message));
    worker.on('error', (error) => this._rejectAll(error));
    this._worker = worker;
    return worker;
  }

  private _handleMessage(message: AsyncSerializerResponse): void {
    const pending = this._pending.get(message.id);
    if (!pending) return;
    this._pending.delete(message.id);

    if ('error' in message) {
      const error = new Error(message.error.message ?? 'worker serializer failed');
      error.name = message.error.name ?? 'Error';
      pending.reject(error);
      this._scheduleIdleShutdown();
      return;
    }

    pending.resolve(message.result);
    this._scheduleIdleShutdown();
  }

  private _rejectAll(error: Error): void {
    this._clearIdleTimer();
    for (const [id, pending] of this._pending) {
      this._pending.delete(id);
      pending.reject(error);
    }
    this._worker = null;
  }

  private _scheduleIdleShutdown(): void {
    if (this._pending.size > 0 || !this._worker) return;

    this._idleTimer = setTimeout(() => {
      const worker = this._worker;
      this._worker = null;
      this._idleTimer = null;
      void worker?.terminate();
    }, 50);

    if (typeof this._idleTimer === 'object' && 'unref' in this._idleTimer) {
      this._idleTimer.unref();
    }
  }

  private _clearIdleTimer(): void {
    if (!this._idleTimer) return;
    clearTimeout(this._idleTimer);
    this._idleTimer = null;
  }
}

export function createWorkerAsyncSerializer(option: SerializerOption | undefined): WorkerAsyncSerializer | null {
  if (!isWorkerSerializer(option)) return null;
  return new WorkerAsyncSerializer(option ?? 'auto');
}
