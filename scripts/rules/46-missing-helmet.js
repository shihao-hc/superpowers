module.exports = {
  id: 'MISSING_HELMET',
  severity: 'MEDIUM',
  cwe: 'CWE-693',
  description: 'Express 应用未引入 helmet 安全头中间件',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    const src = lines.join('\n');
    if (!/require\s*\(\s*['"]express['"]\s*\)/.test(src) && !/from\s+['"]express['"]/.test(src)) return;
    if (/require\s*\(\s*['"]helmet['"]\s*\)/.test(src) || /from\s+['"]helmet['"]/.test(src)) return;
    if (/\bhelmet\s*\(/.test(src)) return;
    report('MEDIUM', 'MISSING_HELMET', '文件范围', 'Express 应用未引入 helmet，建议添加安全头中间件');
  },
  suggest: '安装并引入 helmet 中间件：npm install helmet，然后在 Express 应用中添加：const helmet = require("helmet"); app.use(helmet());。helmet 会自动设置 Content-Security-Policy、X-Frame-Options、X-Content-Type-Options 等安全头。可按需自定义：app.use(helmet({ contentSecurityPolicy: false }))。',
  references: ['CWE-693', 'https://helmetjs.github.io/'],
  since: '2026-06-29',
};
