module.exports = {
  id: 'SENSITIVE_LOG',
  severity: 'MEDIUM',
  cwe: 'CWE-532',
  description: '可能将敏感数据写入日志',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/console\.(?:log|info|warn)|logger\.(?:info|debug|log|warn)|winston\.(?:info|debug|warn)/.test(line)) {
        const hasSensitiveField = /(password|token|secret|credential|apiKey|authorization)\s*[:=]\s*.+/.test(line)
          || /\$\{[^}]*(password|token|secret|credential|apiKey|authorization)[^}]*\}/i.test(line)
          || /['"][^'"]*(password|token|secret|credential|apiKey|authorization)['"]\s*[:+]/i.test(line);
        if (hasSensitiveField && !/masking|sanitize|redact|hidden|\*|set['"]|not\s|not\sset|configured|REDACTED/i.test(line)) {
          report('MEDIUM', 'SENSITIVE_LOG', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '可能将敏感数据写入日志');
        }
      }
    }
  },
  suggest: '在日志输出前对敏感字段（password/token/secret）做掩码处理，例如：log({ ...data, password: "***" })。也可以使用 dataMask 中间件自动过滤。',
  references: ['CWE-532'],
  since: '2026-06-28',
};
