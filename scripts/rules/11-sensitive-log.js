module.exports = {
  id: 'SENSITIVE_LOG',
  severity: 'MEDIUM',
  cwe: 'CWE-532',
  description: '可能将敏感数据写入日志',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/console\.(?:log|info)|logger\.(?:info|debug|log)|winston\.(?:info|debug)/.test(line)) {
        if (/(password|token|secret|credential|apiKey|authorization)\s*[:=]\s*.+/.test(line) && !/masking|sanitize|redact|hidden|\*/.test(line)) {
          report('MEDIUM', 'SENSITIVE_LOG', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '可能将敏感数据写入日志');
        }
      }
    }
  },
  references: ['CWE-532'],
  since: '2026-06-28',
};
