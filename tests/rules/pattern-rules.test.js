const { runRule } = require('./helpers/testRule');

describe('pattern-based rules', () => {
  describe('INNER_HTML_XSS (MEDIUM)', () => {
    it('detects innerHTML assignment', () => {
      const r = runRule('element.innerHTML = userInput;', 'INNER_HTML_XSS');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('INNER_HTML_XSS');
    });

    it('does not flag textContent', () => {
      const r = runRule('element.textContent = userInput;', 'INNER_HTML_XSS');
      expect(r).toHaveLength(0);
    });
  });

  describe('WEAK_TLS (HIGH)', () => {
    it('detects rejectUnauthorized: false', () => {
      const r = runRule('rejectUnauthorized: false', 'WEAK_TLS');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('WEAK_TLS');
    });

    it('detects NODE_TLS_REJECT_UNAUTHORIZED=0', () => {
      const r = runRule('NODE_TLS_REJECT_UNAUTHORIZED=0', 'WEAK_TLS');
      expect(r).toHaveLength(1);
    });

    it('does not flag rejectUnauthorized: true', () => {
      const r = runRule('rejectUnauthorized: true', 'WEAK_TLS');
      expect(r).toHaveLength(0);
    });
  });

  describe('ERROR_MESSAGE_LEAK (MEDIUM)', () => {
    it('detects error.message in json response', () => {
      const r = runRule('res.json({ error: error.message })', 'ERROR_MESSAGE_LEAK');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('ERROR_MESSAGE_LEAK');
    });

    it('does not flag safe response', () => {
      const r = runRule('res.json({ error: "Internal error" })', 'ERROR_MESSAGE_LEAK');
      expect(r).toHaveLength(0);
    });
  });

  describe('PROTOCOL_RELATIVE_URL (LOW)', () => {
    it('detects protocol-relative URL in quotes', () => {
      const r = runRule('src=\'//cdn.example.com/lib.js\'', 'PROTOCOL_RELATIVE_URL');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('PROTOCOL_RELATIVE_URL');
    });

    it('ignores localhost and known CDN exceptions', () => {
      const r1 = runRule('href=\'//fonts.googleapis.com/css\'', 'PROTOCOL_RELATIVE_URL');
      expect(r1).toHaveLength(0);
      const r2 = runRule('url=\'//localhost:3000/api\'', 'PROTOCOL_RELATIVE_URL');
      expect(r2).toHaveLength(0);
    });
  });
});
