module.exports = {
  id: 'COMMAND_INJECTION',
  severity: 'HIGH',
  cwe: 'CWE-78',
  description: 'shell 执行含变量参数，可能导致命令注入',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\b(?:exec|execSync)\s*\(/.test(line) && !/\b(?:execFile|execFileSync)\s*\(/.test(line)) {
        if (/^\s*['"`]/.test(line) || /^\s*\/\//.test(line)) continue;
        const prevLine = i > 0 ? lines[i - 1] : '';
        if (prevLine.trim().startsWith('//')) continue;
        const hasVar = /\$\{|['"`]\s*\+/.test(line);
        if (hasVar) {
          if (/shell:\s*false/.test(line)) continue;
          if (/npm\s*(?:run|install|test)|npx\s+\w+|git\s+(?:status|log|diff|checkout)/.test(line)) continue;
          report('HIGH', 'COMMAND_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'exec/execSync 含变量参数，可能导致命令注入');
        }
      }
      if (/\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(/.test(line)) {
        if (/shell:\s*true/.test(line)) {
          if (/npm\s*(?:run|install|test)|npx\s+\w+|git\s+(?:status|log|diff|checkout)/.test(line)) continue;
          report('HIGH', 'COMMAND_INJECTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'spawn/execFile 设 shell:true 且含变量参数，可能导致命令注入');
        }
      }
    }
  },
  suggest: '将 exec/execSync 替换为 execFile/execFileSync（不启动 shell，参数独立传递）。如果必须用 exec，确保 shell: false 且参数经过白名单验证。',
  references: ['CWE-78'],
  since: '2026-06-28',
};
