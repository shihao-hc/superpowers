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
    // helmet() defaults set X-Content-Type-Options: nosniff and X-Frame-Options: SAMEORIGIN
    // Only flag if explicitly disabled (e.g. xContentTypeOptions: false)
    if (/X-Content-Type-Options/.test(src)) return;
    if (/xContentTypeOptions\s*:\s*false/.test(src)) {
      report('MEDIUM', 'MISSING_SECURITY_HEADER', '文件范围', 'helmet 已禁用 X-Content-Type-Options，建议启用');
    }
    if (/X-Frame-Options/.test(src)) return;
    if (/xFrameOptions\s*:\s*false/.test(src)) {
      report('MEDIUM', 'MISSING_SECURITY_HEADER', '文件范围', 'helmet 已禁用 X-Frame-Options，建议启用');
    }
  },
  suggest: 'helmet 默认设置 X-Content-Type-Options: nosniff 和 X-Frame-Options: SAMEORIGIN。如果显式禁用了这些头（xContentTypeOptions: false 或 xFrameOptions: false），建议重新启用。参考 https://helmetjs.github.io/',
  references: ['CWE-693'],
  since: '2026-06-28',
};
