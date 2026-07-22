module.exports = {
  id: 'HOST_HEADER_INJECTION',
  severity: 'MEDIUM',
  cwe: 'CWE-644',
  description: 'req.headers.host 可能被篡改，用于 URL 构建或重定向有风险',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/req\.headers\.host|req\.get\(['"]host['"]\)/.test(line)) {
        const contextBlock = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');
        if (/(redirect|Location|res\.redirect|fetch|URL|href)/i.test(contextBlock)) {
          report('MEDIUM', 'HOST_HEADER_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'req.headers.host 可能被篡改，用于 URL 构建或重定向有风险');
        }
      }
    }
  },
  suggest: '避免在 URL 构建或重定向中直接使用 req.headers.host。应从可信来源（如 X-Forwarded-Host 经代理验证后）获取目标域名，使用 allowlist 验证 host，或使用 app.set("trust proxy") 后的 req.hostname。',
  references: ['CWE-644'],
  since: '2026-06-28',
};
