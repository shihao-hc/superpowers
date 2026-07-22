module.exports = {
  id: 'HARDCODED_USER_AGENT',
  severity: 'LOW',
  cwe: 'CWE-200',
  description: '硬编码 User-Agent 可能泄露客户端信息',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/['"`]User-Agent['"`]\s*[:=]\s*['"`]/.test(line)) {
        report('LOW', 'HARDCODED_USER_AGENT', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '硬编码 User-Agent 可能泄露客户端信息');
      }
    }
  },
  suggest: '避免硬编码 User-Agent，使用运行的 HTTP 客户端库的默认值，或从配置文件/环境变量读取。如需自定义，使用随机轮换机制避免指纹追踪。例如：const userAgent = process.env.USER_AGENT || DefaultUserAgent。',
  references: ['CWE-200'],
  since: '2026-06-28',
};
