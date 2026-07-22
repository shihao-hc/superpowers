module.exports = {
  id: 'EMPTY_CATCH',
  severity: 'LOW',
  cwe: 'CWE-390',
  description: '空的 catch 块会静默吞掉错误',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length - 3; i++) {
      if (/}\s*catch/.test(lines[i]) && /\s*{\s*}/.test(lines[i + 1])) {
        report('LOW', 'EMPTY_CATCH', `行 ${i + 1}: ${lines[i].trim()} ${lines[i + 1].trim()}`, '空的 catch 块会静默吞掉错误');
      }
    }
  },
  suggest: '在 catch 块中添加错误处理逻辑，至少记录日志：catch (e) { console.error("操作失败:", e); }。如果确实需要忽略特定错误，添加注释说明原因：catch { /* 非关键路径，可安全忽略 */ }。考虑使用 .catch() 的链式错误处理替代 try-catch。',
  references: ['CWE-390'],
  since: '2026-06-28',
};
