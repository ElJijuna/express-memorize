/**
 * Returns the byte length of an already-serialized value (`string` or `Buffer`).
 * @internal
 */
export function serializedByteSize(body: string | Buffer): number {
  return Buffer.isBuffer(body) ? body.byteLength : Buffer.byteLength(body);
}

/**
 * Estimates the serialized byte size of an arbitrary value.
 *
 * Falls back to `JSON.stringify` for objects. If that also fails, returns
 * `fallback` — callers choose `0` (conservative: don't reject) or
 * `Infinity` (conservative: assume large, offload to worker).
 *
 * @internal
 */
export function estimateByteSize(value: unknown, fallback = 0): number {
  if (typeof value === 'string') {
    return Buffer.byteLength(value);
  }

  if (Buffer.isBuffer(value)) {
    return value.byteLength;
  }

  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }

  if (ArrayBuffer.isView(value)) {
    return (value as ArrayBufferView).byteLength;
  }

  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '');
  } catch {
    return fallback;
  }
}
