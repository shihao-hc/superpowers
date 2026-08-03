module.exports = {
  id: 'TODO_COMMENT',
  severity: 'LOW',
  cwe: 'CWE-1104',
  description: '待办事项遗留，建议尽快处理',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    let inTemplate = false;
    let count = 0;
    for (const line of lines) {
      const n = countUnescaped(line, '`');
      if (inTemplate) {
        if (n % 2 === 1) {inTemplate = false;}
        else if (n === 0) {continue;}
        // n 为偶数(如 `` 闭合再开启)时模板状态不变，继续跳过该行
        continue;
      }
      if (n % 2 === 1) {inTemplate = true;}
      if (inTemplate) {continue;}
      if (/(?:TODO|FIXME|HACK|XXX|TEMP):/i.test(line) && /^\s*(\/\/|\*)/.test(line)) {count++;}
    }
    if (count > 0) {
      report('LOW', 'TODO_COMMENT', `${count} 个待办注释`, `文件含 ${count} 个 TODO/FIXME 注释`);
    }
  },
  suggest: '尽快处理遗留的 TODO/FIXME 注释。按优先级分类处理：FIXME（高优先级，可能导致 bug）→ TODO（中优先级，功能缺失）→ HACK（低优先级，技术债务）。使用项目管理工具（如 Jira/GitHub Issues）追踪替代注释。',
  references: ['CWE-1104'],
  since: '2026-06-28',
};

function countUnescaped(str, ch) {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\') {i++;}
    else if (str[i] === ch) {count++;}
  }
  return count;
}
