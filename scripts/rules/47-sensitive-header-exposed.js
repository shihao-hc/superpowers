module.exports = {
  id: 'SENSITIVE_HEADER_EXPOSED',
  severity: 'LOW',
  cwe: 'CWE-200',
  description: '未禁用 X-Powered-By 头，暴露技术栈信息',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    const src = lines.join('\n');
    if (!/require\s*\(\s*['"]express['"]\s*\)/.test(src) && !/from\s+['"]express['"]/.test(src)) return;
    // Express Router 文件不创建 app，不拥有 app 级设置；x-powered-by 由 app 入口统一禁用
    if (/express\.Router\(\)/.test(src)) return;
    if (/(?:app|express)\.disable\s*\(\s*['"]x-powered-by['"]\s*\)/.test(src)) return;
    // helmet 默认启用 hidePoweredBy (移除 X-Powered-By 头)；除非显式禁用
    if (/helmet\s*\(/.test(src) && !/hidePoweredBy\s*:\s*false/.test(src)) return;
    if (/app\.set\s*\(\s*['"]x-powered-by['"]\s*,\s*false\s*\)/.test(src)) return;
    if (helmetDisables(src)) return;
    report('LOW', 'SENSITIVE_HEADER_EXPOSED', '文件范围', '未禁用 X-Powered-By 头，建议 app.disable("x-powered-by")');
  },
  suggest: '禁用 X-Powered-By 头：app.disable("x-powered-by")。如果使用 helmet，确保 hidePoweredBy 已启用（helmet 默认包含）。也可通过 Nginx 配置：proxy_hide_header X-Powered-By;。',
  references: ['CWE-200'],
  since: '2026-06-29',
};

function helmetDisables(src) {
  return /helmet\.hidePoweredBy/.test(src) || /helmet\s*\(\s*\{[^}]*hidePoweredBy/.test(src);
}
