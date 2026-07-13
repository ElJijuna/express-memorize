import { createWorkerAsyncSerializer, WorkerAsyncSerializer } from '../asyncSerializer';

type WorkerMessage =
  | { id: number; action: 'serialize'; value: unknown }
  | { id: number; action: 'deserialize'; data: string | Buffer };

class FakeWorker {
  static instances: FakeWorker[] = [];
  listeners: Record<string, Array<(value: unknown) => void>> = {};
  terminate = jest.fn(async () => 0);
  unref = jest.fn();

  constructor() {
    FakeWorker.instances.push(this);
  }

  on(event: 'message' | 'error', listener: (value: unknown) => void): FakeWorker {
    this.listeners[event] = [...(this.listeners[event] ?? []), listener];

    return this;
  }

  postMessage(message: WorkerMessage): void {
    this.emit('message', { id: -1, result: 'ignored' });

    if (message.action === 'serialize') {
      if (message.value === 'buffer-result') {
        this.emit('message', { id: message.id, result: Buffer.from('ok') });

        return;
      }

      if (message.value === 'uint8-result') {
        this.emit('message', { id: message.id, result: new Uint8Array([1, 2, 3]) });

        return;
      }

      if (message.value === 'unsupported-result') {
        this.emit('message', { id: message.id, result: 123 });

        return;
      }

      this.emit('message', { id: message.id, result: JSON.stringify(message.value) });

      return;
    }

    this.emit('message', { id: message.id, result: JSON.parse(message.data as string) });
  }

  emit(event: 'message' | 'error', value: unknown): void {
    for (const listener of this.listeners[event] ?? []) {
      listener(value);
    }
  }
}

class ThrowingWorker extends FakeWorker {
  postMessage(): void {
    throw new Error('post failed');
  }
}

class SilentWorker extends FakeWorker {
  postMessage(): void {
    // Never responds, leaving the request pending.
  }
}

function withWorkerCtor(serializer: WorkerAsyncSerializer, workerCtor: unknown): void {
  (serializer as unknown as { _WorkerCtor: unknown })._WorkerCtor = workerCtor;
}

describe('WorkerAsyncSerializer', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
  });

  it('returns null for custom serializer options', () => {
    const serializer = createWorkerAsyncSerializer({
      serialize: (value) => JSON.stringify(value),
      deserialize: (value) => JSON.parse(value as string),
    });

    expect(serializer).toBeNull();
  });

  it('round-trips JSON values directly', async () => {
    const serializer = new WorkerAsyncSerializer('json', 1);
    const serialized = await serializer.serialize({ ok: true });

    expect(typeof serialized).toBe('string');
    await expect(serializer.deserialize(serialized)).resolves.toEqual({ ok: true });
  });

  it('dispose() terminates workers and rejects pending requests', async () => {
    const serializer = new WorkerAsyncSerializer('json', 1);

    withWorkerCtor(serializer, SilentWorker);

    const pending = serializer.serialize({ ok: true });

    serializer.dispose();

    await expect(pending).rejects.toThrow('async serializer disposed');
    expect(FakeWorker.instances[0]?.terminate).toHaveBeenCalledTimes(1);
  });

  it('dispose() is a no-op when no worker was ever started', () => {
    const serializer = new WorkerAsyncSerializer('json', 1);

    expect(() => serializer.dispose()).not.toThrow();
  });

  it('round-trips v8 values directly', async () => {
    const serializer = new WorkerAsyncSerializer('v8', 1);
    const value = { created: new Date('2026-01-01') };
    const serialized = await serializer.serialize(value);

    expect(Buffer.isBuffer(serialized)).toBe(true);
    await expect(serializer.deserialize(serialized)).resolves.toEqual(value);
  });

  it('rejects worker-side serializer errors', async () => {
    const serializer = new WorkerAsyncSerializer('json', 1);

    await expect(serializer.deserialize('{bad json')).rejects.toThrow();
  });

  it('runs concurrent requests across limited worker slots', async () => {
    const serializer = new WorkerAsyncSerializer('json', 1);

    await expect(
      Promise.all([
        serializer.serialize({ id: 1 }),
        serializer.serialize({ id: 2 }),
        serializer.serialize({ id: 3 }),
      ]),
    ).resolves.toHaveLength(3);
  });

  it('normalizes Buffer and Uint8Array worker results', async () => {
    const serializer = new WorkerAsyncSerializer('json', 1);

    withWorkerCtor(serializer, FakeWorker);

    await expect(serializer.serialize('buffer-result')).resolves.toEqual(Buffer.from('ok'));
    await expect(serializer.serialize('uint8-result')).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it('rejects unsupported worker result values', async () => {
    const serializer = new WorkerAsyncSerializer('json', 1);

    withWorkerCtor(serializer, FakeWorker);

    await expect(serializer.serialize('unsupported-result')).rejects.toThrow(
      'worker serializer returned an unsupported value',
    );
  });

  it('rejects when worker postMessage throws', async () => {
    const serializer = new WorkerAsyncSerializer('json', 1);

    withWorkerCtor(serializer, ThrowingWorker);

    await expect(serializer.serialize({ ok: true })).rejects.toThrow('post failed');
  });

  it('rejects pending requests when a worker emits an error', async () => {
    class HangingWorker extends FakeWorker {
      postMessage(): void {}
    }

    const serializer = new WorkerAsyncSerializer('json', 1);

    withWorkerCtor(serializer, HangingWorker);

    const promise = serializer.serialize({ ok: true });

    FakeWorker.instances[0].emit('error', new Error('worker exploded'));

    await expect(promise).rejects.toThrow('worker exploded');
  });

  it('reuses cached unavailable worker constructor errors', async () => {
    const serializer = new WorkerAsyncSerializer('json', 1);

    withWorkerCtor(serializer, null);

    await expect(serializer.serialize({ ok: true })).rejects.toThrow(
      'node:worker_threads is not available',
    );
  });
});
