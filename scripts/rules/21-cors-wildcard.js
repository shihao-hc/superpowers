module.exports = {
  id: 'CORS_WILDCARD',
  severity: 'MEDIUM',
  cwe: 'CWE-942',
  description: 'CORS 通配符过于宽松，建议限制具体域名',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/Access-Control-Allow-Origin/.test(line)) {
        if (/\*\s*['"]/.test(line) || /['"]\*['"]/.test(line)) {
          const contextBlock = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');
          if (/credentials|withCredentials/.test(contextBlock)) {
            report('HIGH', 'CORS_WILDCARD_CREDENTIALS', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '通配符 CORS 与 credentials 同时使用，存在安全风险');
          } else {
            report('MEDIUM', 'CORS_WILDCARD', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'CORS 通配符过于宽松，建议限制具体域名');
          }
        }
      }
    }
  },
  references: ['CWE-942'],
  since: '2026-06-28',
};
