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
  references: ['CWE-117'],
  since: '2026-06-28',
};
