const path = require('path');
const { sanitizeFilename, strictId, ensureInDirectory } = require('../../src/utils/SafePath');

describe('SafePath', () => {
  describe('sanitizeFilename', () => {
    it('should strip path separators (replaces with empty)', () => {
      expect(sanitizeFilename('foo/bar')).toBe('foobar');
      expect(sanitizeFilename('a\\b')).toBe('ab');
    });

    it('should strip directory traversal', () => {
      const result = sanitizeFilename('../etc/passwd');
      expect(result).not.toContain('..');
    });

    it('should replace special chars with underscores', () => {
      expect(sanitizeFilename('hello world')).toBe('hello_world');
      expect(sanitizeFilename('file#1?')).toBe('file_1_');
    });

    it('should allow alphanumeric, dot, hyphen, underscore', () => {
      expect(sanitizeFilename('my-file_v2.5.js')).toBe('my-file_v2.5.js');
    });

    it('should truncate at 255 chars', () => {
      const long = 'a'.repeat(300);
      expect(sanitizeFilename(long).length).toBe(255);
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeFilename(null)).toBe('');
      expect(sanitizeFilename(undefined)).toBe('');
      expect(sanitizeFilename(123)).toBe('');
    });
  });

  describe('strictId', () => {
    it('should keep alphanumeric, underscore, hyphen', () => {
      expect(strictId('abc123_-')).toBe('abc123_-');
    });

    it('should strip everything else (replaces with empty)', () => {
      expect(strictId('hello world!@#')).toBe('helloworld');
    });

    it('should truncate at 128 chars', () => {
      const long = 'a'.repeat(200);
      expect(strictId(long).length).toBe(128);
    });

    it('should return empty string for non-string input', () => {
      expect(strictId(null)).toBe('');
      expect(strictId(undefined)).toBe('');
      expect(strictId(123)).toBe('');
    });
  });

  describe('ensureInDirectory', () => {
    it('should resolve path within allowed directory', () => {
      const result = ensureInDirectory('/base/sub/file.txt', '/base');
      const expected = path.resolve('/base/sub/file.txt');
      expect(result).toBe(expected);
    });

    it('should throw for path traversal', () => {
      expect(() => {
        ensureInDirectory('/base/../etc/passwd', '/base');
      }).toThrow('Path traversal detected');
    });

    it('should allow exact match with allowed directory', () => {
      const result = ensureInDirectory('/base', '/base');
      expect(result).toBe(path.resolve('/base'));
    });
  });
});
