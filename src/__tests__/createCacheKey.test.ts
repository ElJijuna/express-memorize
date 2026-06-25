import { createCacheKey } from '../utils/createCacheKey';

describe('createCacheKey', () => {
  describe('string input', () => {
    it('returns a plain string unchanged', () => {
      expect(createCacheKey('users')).toBe('users');
    });

    it('escapes * in string', () => {
      expect(createCacheKey('a*b')).toBe('a\\*b');
    });

    it('escapes ? in string', () => {
      expect(createCacheKey('a?b')).toBe('a\\?b');
    });
  });

  describe('array input', () => {
    it('joins parts with colon separator by default', () => {
      expect(createCacheKey(['users', 21])).toBe('users:21');
    });

    it('escapes * in array parts', () => {
      expect(createCacheKey(['search', 'a*b'])).toBe('search:a\\*b');
    });

    it('escapes ? in array parts', () => {
      expect(createCacheKey(['search', 'a?b'])).toBe('search:a\\?b');
    });

    it('converts non-string types to string', () => {
      expect(createCacheKey(['users', 21, true])).toBe('users:21:true');
    });

    it('converts null and undefined parts to empty string', () => {
      expect(createCacheKey(['users', null])).toBe('users:');
      expect(createCacheKey(['users', undefined])).toBe('users:');
    });

    it('uses custom separator when provided', () => {
      expect(createCacheKey(['users', 21], { separator: '/' })).toBe('users/21');
    });
  });
});
