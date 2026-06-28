module.exports = {
  id: 'OPEN_REDIRECT',
  severity: 'MEDIUM',
  cwe: 'CWE-601',
  description: '基于用户输入的重定向可能导致开放重定向漏洞',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/res\.redirect\s*\(/.test(line)) {
        const contextBlock = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');
        if (/(req\.|query\.|params\.|body\.|\.url|\.originalUrl|returnUrl|redirectUrl|next|to\b)/i.test(contextBlock) &&
            !/allowlist|allowed|valid|whitelist|sanitize|validate/i.test(contextBlock)) {
          report('MEDIUM', 'OPEN_REDIRECT', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '基于用户输入的重定向可能导致开放重定向漏洞');
        }
      }
    }
  },
  references: ['CWE-601'],
  since: '2026-06-28',
};
