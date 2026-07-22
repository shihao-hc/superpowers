module.exports = {
  id: 'TODO_COMMENT',
  severity: 'LOW',
  cwe: 'CWE-1104',
  description: '待办事项遗留，建议尽快处理',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    const count = lines.filter(l => /(?:TODO|FIXME|HACK|XXX|TEMP):/i.test(l) && /^\s*(\/\/|\*)/.test(l)).length;
    if (count > 0) {
      report('LOW', 'TODO_COMMENT', `${count} 个待办注释`, `文件含 ${count} 个 TODO/FIXME 注释`);
    }
  },
  suggest: '尽快处理遗留的 TODO/FIXME 注释。按优先级分类处理：FIXME（高优先级，可能导致 bug）→ TODO（中优先级，功能缺失）→ HACK（低优先级，技术债务）。使用项目管理工具（如 Jira/GitHub Issues）追踪替代注释。',
  references: ['CWE-1104'],
  since: '2026-06-28',
};
