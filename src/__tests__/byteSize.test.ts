import { estimateByteSize, serializedByteSize } from '../utils/byteSize';

describe('byteSize utilities', () => {
  it('measures serialized strings and buffers', () => {
    expect(serializedByteSize('hello')).toBe(Buffer.byteLength('hello'));
    expect(serializedByteSize(Buffer.from('hello'))).toBe(5);
  });

  it('estimates strings buffers ArrayBuffers and typed arrays', () => {
    expect(estimateByteSize('hello')).toBe(Buffer.byteLength('hello'));
    expect(estimateByteSize(Buffer.from('abc'))).toBe(3);
    expect(estimateByteSize(new ArrayBuffer(4))).toBe(4);
    expect(estimateByteSize(new Uint16Array(3))).toBe(6);
  });

  it('estimates JSON-serializable objects and nullish JSON output', () => {
    expect(estimateByteSize({ ok: true })).toBe(Buffer.byteLength(JSON.stringify({ ok: true })));
    expect(estimateByteSize(undefined)).toBe(0);
  });

  it('returns the fallback when JSON.stringify throws', () => {
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    expect(estimateByteSize(circular, 123)).toBe(123);
  });
});
