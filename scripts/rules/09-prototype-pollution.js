module.exports = {
  id: 'PROTOTYPE_POLLUTION',
  severity: 'MEDIUM',
  cwe: 'CWE-1321',
  description: '用户输入直接用于对象合并，可能导致原型污染',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/Object\.assign\s*\(/.test(line) || /\{\.\.\.\w+,\s*\.\.\.\w+\}/.test(line)) {
        if (/req\.|body|query|params|input|userInput/.test(line)) {
          report('MEDIUM', 'PROTOTYPE_POLLUTION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '用户输入直接用于对象合并，可能导致原型污染');
        }
      }
    }
  },
  suggest: '使用 Object.create(null) 创建无原型对象，或使用 Object.freeze 冻结对象。合并操作前对 __proto__/constructor/prototype 键名做过滤。',
  references: ['CWE-1321'],
  since: '2026-06-28',
};
