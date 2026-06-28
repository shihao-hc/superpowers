module.exports = {
  id: 'INNER_HTML_XSS',
  severity: 'MEDIUM',
  cwe: 'CWE-79',
  description: 'innerHTML 赋值可能导致 XSS，确认内容已 sanitize 或改用 textContent',
  enabled: true,
  patterns: [
    /\.innerHTML\s*=/
  ],
  excludePatterns: [],
  context: {
    requireKeywords: [],
  },
  references: ['CWE-79'],
  since: '2026-06-28',
};
