module.exports = {
  id: 'DUPLICATE_OBJECT_KEY',
  severity: 'LOW',
  cwe: 'CWE-1104',
  description: '对象字面量中存在重复键',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*\w+\s*:/.test(lines[i])) {
        const key = lines[i].match(/^\s*(\w+)\s*:/);
        if (!key) continue;
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const re = new RegExp(`^\\s*${key[1]}\\s*:`);
          if (re.test(lines[j])) {
            report('LOW', 'DUPLICATE_OBJECT_KEY', `行 ${i + 1} 与行 ${j + 1}: 重复键 "${key[1]}"`, '对象字面量中存在重复键');
            return;
          }
        }
      }
    }
  },
  suggest: '删除多余的重复键，只保留意图正确的那个。如果两个键值不同，可能是复制粘贴错误，需要合并或重命名其中一个。',
  references: ['CWE-1104'],
  since: '2026-06-28',
};
