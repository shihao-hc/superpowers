module.exports = {
  id: 'VAR_DECLARATION',
  severity: 'LOW',
  cwe: 'CWE-1104',
  description: '使用 var 声明，建议改用 const/let',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*var\s+\w+/.test(lines[i]) && !/^\s*(\/\/|\*)/.test(lines[i])) {
        count++;
      }
    }
    if (count > 0) {
      report('LOW', 'VAR_DECLARATION', `${count} 处 var 声明`, `文件含 ${count} 处 var 声明，建议改用 const/let`);
    }
  },
  suggest: '将 var 替换为 const（不会被重新赋值的变量）或 let（需要重新赋值的变量）。使用 ESLint 的 no-var 规则自动化检测和修复。注意：var 的函数作用域行为与 let/const 的块作用域不同，替换后需验证变量作用域是否改变。',
  references: ['CWE-1104'],
  since: '2026-06-28',
};
