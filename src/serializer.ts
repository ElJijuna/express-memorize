export interface Serializer {
  serialize(value: unknown): string | Buffer;
  deserialize(data: string | Buffer): unknown;
}

export type SerializerOption = 'json' | 'v8' | 'auto' | Serializer;

const jsonSerializer: Serializer = {
  serialize: (v) => JSON.stringify(v),
  deserialize: (d) => JSON.parse(d as string),
};

function tryV8(): Serializer | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const v8 = require('node:v8') as typeof import('node:v8');

    return {
      serialize: (v) => v8.serialize(v),
      deserialize: (data) =>
        v8.deserialize(Buffer.isBuffer(data) ? data : Buffer.from(data as string, 'binary')),
    };
  } catch {
    return null;
  }
}

export function createSerializer(option: SerializerOption = 'auto'): Serializer {
  if (typeof option === 'object') {
    return option;
  }

  if (option === 'json') {
    return jsonSerializer;
  }

  if (option === 'v8') {
    const s = tryV8();

    if (!s) {
      throw new Error('[express-memorize] node:v8 is not available in this runtime');
    }

    return s;
  }

  // 'auto': v8 si está disponible, JSON como fallback
  return tryV8() ?? jsonSerializer;
}
