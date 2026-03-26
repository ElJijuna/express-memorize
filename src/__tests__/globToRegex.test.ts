import { globToRegex } from '../utils/globToRegex';

describe('globToRegex', () => {
  describe('* (single segment wildcard)', () => {
    it('matches within a segment', () => {
      const re = globToRegex('/users/*');
      expect(re.test('/users/abc')).toBe(true);
      expect(re.test('/users/abc123')).toBe(true);
    });

    it('does not cross path separators', () => {
      const re = globToRegex('/users/*');
      expect(re.test('/users/abc/extra')).toBe(false);
    });

    it('matches trailing query string', () => {
      const re = globToRegex('/users/abc*');
      expect(re.test('/users/abc')).toBe(true);
      expect(re.test('/users/abc?page=1')).toBe(true);
      expect(re.test('/users/abc?page=1&lang=es')).toBe(true);
    });
  });

  describe('** (cross-segment wildcard)', () => {
    it('matches across path segments', () => {
      const re = globToRegex(['**', 'users', 'abc'].join('/'));
      expect(re.test('/api/users/abc')).toBe(true);
      expect(re.test('/v2/users/abc')).toBe(true);
    });

    it('matches zero segments', () => {
      const re = globToRegex(['**', 'users', 'abc'].join('/'));
      expect(re.test('users/abc')).toBe(true);
    });
  });

  describe('? (single character wildcard)', () => {
    it('matches a single non-slash character', () => {
      const re = globToRegex('/users/?');
      expect(re.test('/users/a')).toBe(true);
      expect(re.test('/users/1')).toBe(true);
    });

    it('does not match a slash', () => {
      const re = globToRegex('/users/?');
      expect(re.test('/users//')).toBe(false);
    });

    it('does not match more than one character', () => {
      const re = globToRegex('/users/?');
      expect(re.test('/users/ab')).toBe(false);
    });
  });

  describe('literal characters', () => {
    it('escapes regex special characters in literal parts', () => {
      const re = globToRegex('/users/abc.123');
      expect(re.test('/users/abc.123')).toBe(true);
      expect(re.test('/users/abcX123')).toBe(false);
    });
  });
});
