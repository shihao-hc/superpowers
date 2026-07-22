module.exports = {
  id: 'ERROR_HANDLER_MISSING',
  severity: 'MEDIUM',
  cwe: 'CWE-755',
  description: 'Express 应用缺少全局错误处理中间件',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    const src = lines.join('\n');
    if (!/require\s*\(\s*['"]express['"]\s*\)/.test(src) && !/from\s+['"]express['"]/.test(src)) return;
    if (!/app\.\w+\(/.test(src)) return;
    if (/function\s*\(\s*(?:err|error)\s*,/.test(src)) return;
    if (/function\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*\w+\s*\)/.test(src)) return;
    if (/\.use\(\s*(?:\(|function)\s*(?:err|error)\s*[,)]/.test(src)) return;
    if (/\.use\(\s*\w+\.\w+ErrorHandler/.test(src)) return;
    if (/\.use\(\s*\w+\.errorHandler/.test(src)) return;
    if (/\.use\(\s*errorHandler\b/.test(src)) return;
    report('MEDIUM', 'ERROR_HANDLER_MISSING', '文件范围', 'Express 应用缺少全局错误处理中间件');
  },
  suggest: '添加 Express 全局错误处理中间件：app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ error: "服务器内部错误" }); })。该中间件必须放在所有路由之后，且需要 4 个参数。同时考虑使用 http-errors 库管理 HTTP 错误。',
  references: ['CWE-755'],
  since: '2026-06-29',
};
