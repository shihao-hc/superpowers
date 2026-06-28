module.exports = {
  id: 'INSECURE_DESERIALIZATION',
  severity: 'MEDIUM',
  cwe: 'CWE-502',
  description: '用户输入 JSON.parse 未包 try-catch，可能导致异常',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/JSON\.parse\s*\(/.test(line)) {
        if (/(fs\.readFileSync|JSON\.stringify|this\.decrypt)/.test(line)) continue;
        const blockBefore = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
        if (blockBefore.includes('try')) continue;
        if (/req\.|body\b|query|params|input/.test(line)) {
          report('MEDIUM', 'INSECURE_DESERIALIZATION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '用户输入 JSON.parse 未包 try-catch，可能导致异常');
        }
      }
    }
  },
  references: ['CWE-502'],
  since: '2026-06-28',
};
