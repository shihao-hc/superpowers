module.exports = {
  id: 'CORS_CREDENTIALS_WILDCARD',
  severity: 'HIGH',
  cwe: 'CWE-942',
  description: 'CORS credentials: true 与 origin: "*" 或 origin: true 并用完全关闭跨域安全',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    const content = lines.join('\n');
    const hasCredentials = /credentials\s*[=:]\s*true/.test(content);
    if (!hasCredentials) return;
    const hasWildcard = /origin\s*[=:]\s*(?:'\\*'|"\\*"|true)/.test(content);
    if (hasWildcard) {
      report('HIGH', 'CORS_CREDENTIALS_WILDCARD', '文件范围', 'credentials: true 与通配符 origin 并用');
    }
  },
  suggest: 'credentials: true 时必须指定明确的 origin（如 origin: "https://example.com"），不能使用 "*" 或 true。否则浏览器会拒绝携带凭据的请求。',
  references: ['CWE-942', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSNotSupportingCredentials'],
  since: '2026-06-29',
};
