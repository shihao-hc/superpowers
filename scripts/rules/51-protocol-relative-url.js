module.exports = {
  id: 'PROTOCOL_RELATIVE_URL',
  severity: 'LOW',
  cwe: 'CWE-319',
  description: '协议相对 URL (//) 在 HTTP 页面下会降级为 HTTP，可能导致混合内容',
  enabled: true,
  patterns: [
    /['"`]\/\/[^'"`\s]+['"`]/
  ],
  excludePatterns: [
    /['"`]\/\/localhost/,
    /['"`]\/\/127\.0\.0\.1/,
    /['"`]\/\/fonts\.googleapis/,
    /http(s?):\/\/\//,
  ],
  suggest: '将协议相对 URL (//example.com) 替换为完整 HTTPS URL (https://example.com)。确保所有外部资源（脚本、样式、图片、字体）都使用 HTTPS。如果必须动态切换协议，从环境变量读取基础 URL。',
  references: ['CWE-319'],
  since: '2026-06-29',
};
