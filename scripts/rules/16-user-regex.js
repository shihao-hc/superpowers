module.exports = {
  id: 'USER_REGEX',
  severity: 'MEDIUM',
  cwe: 'CWE-1333',
  description: '动态创建 RegExp，需验证/限制输入防止 ReDoS',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      if (!/new\s+RegExp\(/.test(lines[i])) continue;
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (/\.source/.test(lines[i]) || /escapeRegex\(/.test(prevLine + lines[i]) || !/\$\{/.test(lines[i]) || /\.replace\(\/.+?\]\/g/.test(prevLine)) continue;
      const contextBlock = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 2)).join('\n');
      if (/Object\.entries\(/.test(contextBlock)) continue;
      if (/\bdangerousTags\b/.test(contextBlock)) continue;
      if (/for\s*\([^)]*of\s+\w+\s*\)/.test(contextBlock)) continue;
      report('MEDIUM', 'USER_REGEX', `行 ${i + 1}: ${lines[i].trim().substring(0, 100)}`, '动态创建 RegExp，需验证/限制输入防止 ReDoS');
    }
  },
  references: ['CWE-1333'],
  since: '2026-06-28',
};
