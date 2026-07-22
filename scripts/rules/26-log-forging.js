module.exports = {
  id: 'LOG_FORGING',
  severity: 'MEDIUM',
  cwe: 'CWE-117',
  description: '用户输入直接拼入日志，可能导致日志伪造',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:console\.(?:log|info|warn|error)|logger\.\w+|winston\.\w+)\s*\(/.test(line)) {
        if (/['"`]\s*\+/.test(line) && /req\.|\.body|\.query|\.params|\.ip|\.url/.test(line)) {
          if (/(?:input|log|message|msg)\s*[:=]\s*['"`]/.test(line) && /sanitize|escape|trim|replace/.test(line)) continue;
          report('MEDIUM', 'LOG_FORGING', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '用户输入直接拼入日志，可能导致日志伪造');
        }
      }
    }
  },
  suggest: '对用户输入进行日志安全处理：移除或转义换行符和特殊字符；使用结构化日志（JSON 格式）而非字符串拼接；用 winston 或 pino 的序列化器自动处理敏感字段。例如：log.info({ userId, action }, "用户操作")。',
  references: ['CWE-117'],
  since: '2026-06-28',
};
