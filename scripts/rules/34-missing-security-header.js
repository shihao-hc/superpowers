module.exports = {
  id: 'MISSING_SECURITY_HEADER',
  severity: 'MEDIUM',
  cwe: 'CWE-693',
  description: '服务端配置缺少推荐的安全 HTTP 头',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    const src = lines.join('\n');
    if (!/require\s*\(\s*['"]express['"]\s*\)/.test(src)) return;
    if (!/require\s*\(\s*['"]helmet['"]\s*\)/.test(src)) return;
    if (!/X-Content-Type-Options/.test(src)) {
      report('MEDIUM', 'MISSING_SECURITY_HEADER', '文件范围', '已引入 helmet 但未配置 X-Content-Type-Options');
    }
    if (!/X-Frame-Options/.test(src)) {
      report('MEDIUM', 'MISSING_SECURITY_HEADER', '文件范围', '已引入 helmet 但未配置 X-Frame-Options');
    }
  },
  suggest: '在 helmet 配置中显式设置缺失的安全头：检查 helmet() 的默认配置是否满足需求，或传入自定义选项覆盖缺失的头。参考 https://helmetjs.github.io/',
  references: ['CWE-693'],
  since: '2026-06-28',
};
