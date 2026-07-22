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
  suggest: '对用户输入的 JSON.parse 添加 try-catch 保护：try { JSON.parse(input) } catch { /* 记录错误，返回默认值 */ }。也可考虑使用 JSON.parse 的 reviver 参数验证字段。优先使用类型验证库（如 zod、joi）解析并验证 JSON 输入。',
  references: ['CWE-502'],
  since: '2026-06-28',
};
