/**
 * Converts a glob pattern to a `RegExp`.
 *
 * Glob rules:
 * - `**` — matches any character sequence across path segments (crosses `/`).
 * - `*`  — matches any character sequence within a single path segment (does not cross `/`).
 * - `?`  — matches any single character except `/`.
 *
 * @internal
 */
export function globToRegex(pattern: string): RegExp {
  let result = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      result += '.*';
      i += 2;
      if (pattern[i] === '/') i++;
    } else if (ch === '*') {
      result += '[^/]*';
      i++;
    } else if (ch === '?') {
      result += '[^/]';
      i++;
    } else {
      result += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  result += '$';
  return new RegExp(result);
}
