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
  suggest: '优先使用 textContent（纯文本）或安全的 DOM API 替代 innerHTML。如需插入 HTML，使用 DOMPurify.sanitize() 处理后再赋值。使用前端框架（Vue/React）时，利用其模板自动转义机制。',
  references: ['CWE-79'],
  since: '2026-06-28',
};
