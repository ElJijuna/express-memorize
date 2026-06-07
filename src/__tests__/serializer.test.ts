import type { Serializer } from '../serializer';
import { createSerializer } from '../serializer';

describe('createSerializer', () => {
  describe("'json'", () => {
    const s = createSerializer('json');

    it('round-trips primitives', () => {
      expect(s.deserialize(s.serialize('hello'))).toBe('hello');
      expect(s.deserialize(s.serialize(42))).toBe(42);
      expect(s.deserialize(s.serialize(true))).toBe(true);
      expect(s.deserialize(s.serialize(null))).toBeNull();
    });

    it('round-trips objects and arrays', () => {
      const obj = { a: 1, b: [2, 3] };
      expect(s.deserialize(s.serialize(obj))).toEqual(obj);
    });

    it('serialize returns a string', () => {
      expect(typeof s.serialize({ x: 1 })).toBe('string');
    });
  });

  describe("'v8'", () => {
    const s = createSerializer('v8');

    it('round-trips primitives', () => {
      expect(s.deserialize(s.serialize('hello'))).toBe('hello');
      expect(s.deserialize(s.serialize(42))).toBe(42);
    });

    it('round-trips types unsupported by JSON', () => {
      const date = new Date('2024-01-01');
      expect((s.deserialize(s.serialize(date)) as Date).getTime()).toBe(date.getTime());

      const map = new Map([['k', 'v']]);
      const roundTrippedMap = s.deserialize(s.serialize(map)) as Map<string, string>;
      expect(roundTrippedMap.get('k')).toBe('v');
      expect(roundTrippedMap.size).toBe(1);

      const set = new Set([1, 2, 3]);
      const roundTrippedSet = s.deserialize(s.serialize(set)) as Set<number>;
      expect(roundTrippedSet.has(1)).toBe(true);
      expect(roundTrippedSet.has(3)).toBe(true);
      expect(roundTrippedSet.size).toBe(3);

      const buf = Buffer.from('binary data');
      expect(s.deserialize(s.serialize(buf))).toEqual(buf);
    });

    it('serialize returns a Buffer', () => {
      expect(Buffer.isBuffer(s.serialize({ x: 1 }))).toBe(true);
    });

    it('does not throw on Node.js (v8 is always available)', () => {
      expect(() => createSerializer('v8')).not.toThrow();
    });
  });

  describe("'auto'", () => {
    it('returns a working serializer (v8 available in Node)', () => {
      const s = createSerializer('auto');
      const obj = { a: 1 };
      expect(s.deserialize(s.serialize(obj))).toEqual(obj);
    });
  });

  describe('default (no arg)', () => {
    it('behaves like auto', () => {
      const s = createSerializer();
      expect(s.deserialize(s.serialize(99))).toBe(99);
    });
  });

  describe('custom serializer', () => {
    it('delegates to provided serialize/deserialize', () => {
      const serialize = jest.fn((v: unknown) => JSON.stringify(v));
      const deserialize = jest.fn((d: string | Buffer) => JSON.parse(d as string));
      const custom: Serializer = { serialize, deserialize };

      const s = createSerializer(custom);
      const result = s.deserialize(s.serialize({ x: 42 }));

      expect(result).toEqual({ x: 42 });
      expect(serialize).toHaveBeenCalledTimes(1);
      expect(deserialize).toHaveBeenCalledTimes(1);
    });
  });
});

describe('memorize() with serializer option', () => {
  // Integration: verify set/getValue work end-to-end per serializer
  const { memorize } = jest.requireActual('../memorize') as typeof import('../memorize');

  it('json: set/getValue round-trip', () => {
    const cache = memorize({ serializer: 'json', ttl: Infinity });
    cache.set('k', { hello: 'world' });
    expect(cache.getValue('k')).toEqual({ hello: 'world' });
  });

  it('v8: set/getValue round-trip with Date', () => {
    const cache = memorize({ serializer: 'v8', ttl: Infinity });
    const date = new Date('2024-06-01');
    cache.set('date', date);
    expect(cache.getValue<Date>('date')?.getTime()).toBe(date.getTime());
  });

  it('auto: set/getValue round-trip', () => {
    const cache = memorize({ serializer: 'auto', ttl: Infinity });
    cache.set('x', [1, 2, 3]);
    expect(cache.getValue('x')).toEqual([1, 2, 3]);
  });
});
