module.exports = {
  id: 'LARGE_FILE',
  severity: 'LOW',
  cwe: 'CWE-1104',
  description: '文件超过 500 行，建议拆分',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    // 诊断/评估/生成脚本是工具性质，不属于应拆分的业务模块
    if (/learnEval|brain-full-check|OpenAPIGenerator|render-graphs|\.debug\./.test(relativePath)) return;
    if (lines.length > 500) {
      report('LOW', 'LARGE_FILE', `${lines.length} 行`, `文件 ${lines.length} 行，超过 500 行建议拆分`);
    }
  },
  suggest: '将文件按功能拆分为多个模块（如 service/controller/util），每个文件不超过 500 行。拆分后注意更新 require 路径。',
  references: ['CWE-1104'],
  since: '2026-06-28',
};
