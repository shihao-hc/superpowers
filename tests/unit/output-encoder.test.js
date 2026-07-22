const { OutputEncoder } = require('../../src/security/OutputEncoder');

describe('OutputEncoder', () => {
  let enc;

  beforeEach(() => {
    enc = new OutputEncoder();
  });

  describe('encodeHTML', () => {
    it('encodes HTML special chars', () => {
      expect(enc.encodeHTML('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('encodes ampersand first', () => {
      expect(enc.encodeHTML('a&b')).toBe('a&amp;b');
    });

    it('encodes backtick and equals', () => {
      expect(enc.encodeHTML('`= ')).toBe('&#96;&#x3D; ');
    });

    it('returns empty string for null/undefined', () => {
      expect(enc.encodeHTML(null)).toBe('');
      expect(enc.encodeHTML(undefined)).toBe('');
    });

    it('converts non-string to string', () => {
      expect(enc.encodeHTML(42)).toBe('42');
    });

    it('passes through safe strings', () => {
      expect(enc.encodeHTML('hello world')).toBe('hello world');
    });

    it('falls back to raw char when entity missing', () => {
      const saved = enc.htmlEntities['&'];
      delete enc.htmlEntities['&'];
      expect(enc.encodeHTML('a&b')).toBe('a&b');
      enc.htmlEntities['&'] = saved;
    });
  });

  describe('encodeHTMLAttribute', () => {
    it('encodes HTML attribute chars', () => {
      expect(enc.encodeHTMLAttribute('" onclick="evil()"')).toBe('&quot; onclick&#x3D;&quot;evil()&quot;');
    });

    it('does not encode slash', () => {
      expect(enc.encodeHTMLAttribute('/')).toBe('/');
    });

    it('returns empty for null', () => {
      expect(enc.encodeHTMLAttribute(null)).toBe('');
    });

    it('converts non-string to string', () => {
      expect(enc.encodeHTMLAttribute(42)).toBe('42');
    });

    it('falls back to raw char when entity missing', () => {
      const saved = enc.htmlEntities['&'];
      delete enc.htmlEntities['&'];
      expect(enc.encodeHTMLAttribute('a&b')).toBe('a&b');
      enc.htmlEntities['&'] = saved;
    });
  });

  describe('encodeJavaScript', () => {
    it('escapes JS string chars', () => {
      expect(enc.encodeJavaScript('test\'s "quote"')).toBe('test\\\'s \\"quote\\"');
    });

    it('escapes newlines and tabs', () => {
      expect(enc.encodeJavaScript('line1\nline2\tend')).toBe('line1\\nline2\\tend');
    });

    it('returns empty for null', () => {
      expect(enc.encodeJavaScript(null)).toBe('');
    });

    it('converts non-string to string', () => {
      expect(enc.encodeJavaScript(42)).toBe('42');
    });
  });

  describe('encodeURL', () => {
    it('passes through allowed URL chars', () => {
      expect(enc.encodeURL('http://example.com/path?q=1')).toBe('http://example.com/path?q=1');
    });

    it('encodes non-URL chars in non-strict mode', () => {
      expect(enc.encodeURL('hello world')).toBe('hello%20world');
    });

    it('encodes everything in strict mode', () => {
      expect(enc.encodeURL('http://example.com/path', true)).toBe(encodeURIComponent('http://example.com/path'));
    });

    it('returns empty for null', () => {
      expect(enc.encodeURL(null)).toBe('');
    });

    it('converts non-string to string', () => {
      expect(enc.encodeURL(42)).toBe('42');
    });
  });

  describe('encodeCSS', () => {
    it('escapes CSS injection chars', () => {
      const result = enc.encodeCSS('";');
      expect(result).toMatch(/\\22/);
      expect(result).toMatch(/\\3b/);
    });

    it('returns empty for null', () => {
      expect(enc.encodeCSS(null)).toBe('');
    });

    it('converts non-string to string', () => {
      expect(enc.encodeCSS(42)).toBe('42');
    });
  });

  describe('sanitizeText', () => {
    it('removes dangerous tags', () => {
      expect(enc.sanitizeText('<script>alert(1)</script>')).toBe('alert(1)');
    });

    it('keeps allowed tags by default', () => {
      expect(enc.sanitizeText('<p>safe</p>')).toBe('<p>safe</p>');
    });

    it('removes event handlers', () => {
      const result = enc.sanitizeText('<p onclick="evil()">text</p>');
      expect(result).toBe('<p>text</p>');
    });

    it('returns empty for null', () => {
      expect(enc.sanitizeText(null)).toBe('');
    });

    it('converts non-string to string', () => {
      expect(enc.sanitizeText(42)).toBe('42');
    });

    it('accepts custom allowed tags', () => {
      expect(enc.sanitizeText('<b>bold</b><i>italic</i>', ['i'])).toBe('bold<i>italic</i>');
    });
  });

  describe('safeStringify', () => {
    it('encodes HTML in strings', () => {
      const result = enc.safeStringify({ msg: '<script>evil</script>' });
      expect(result).toContain('&lt;script&gt;evil&lt;&#x2F;script&gt;');
    });

    it('replaces functions with placeholder', () => {
      expect(enc.safeStringify({ fn() {} })).toContain('[Function]');
    });

    it('handles circular references', () => {
      const obj = { a: 1 };
      obj.self = obj;
      expect(enc.safeStringify(obj)).toContain('[Circular]');
    });

    it('formats with space parameter', () => {
      expect(enc.safeStringify({ a: 1 }, 2)).toContain('\n');
    });
  });

  describe('encodeMulti', () => {
    it('applies single context', () => {
      expect(enc.encodeMulti('<test>', ['html'])).toBe('&lt;test&gt;');
    });

    it('applies multiple contexts in order', () => {
      expect(enc.encodeMulti('hello world', ['url', 'html'])).toBe('hello%20world');
    });

    it('supports js context', () => {
      expect(enc.encodeMulti('it\'s', ['js'])).toBe('it\\\'s');
    });

    it('supports url context', () => {
      expect(enc.encodeMulti('hello world', ['url'])).toBe('hello%20world');
    });

    it('supports css context', () => {
      const result = enc.encodeMulti('"', ['css']);
      expect(result).toMatch(/\\22/);
    });

    it('supports attr context', () => {
      const result = enc.encodeMulti('"<test>"', ['attr']);
      expect(result).toBe('&quot;&lt;test&gt;&quot;');
    });

    it('defaults to html context', () => {
      expect(enc.encodeMulti('<test>')).toBe('&lt;test&gt;');
    });
  });
});
