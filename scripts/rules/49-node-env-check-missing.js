module.exports = {
  id: 'NODE_ENV_CHECK_MISSING',
  severity: 'LOW',
  cwe: 'CWE-477',
  description: '服务器入口文件未检测 NODE_ENV 环境变量',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    const basename = relativePath.split(/[/\\]/).pop();
    if (!/^(?:server|index|app|main)/.test(basename)) return;
    const src = lines.join('\n');
    if (/NODE_ENV/.test(src) && /production/.test(src) && /process\.env/.test(src)) return;
    report('LOW', 'NODE_ENV_CHECK_MISSING', '文件范围', '服务器入口文件未检测 NODE_ENV 环境变量');
  },
  suggest: '在服务器入口文件顶部检测 NODE_ENV：if (!process.env.NODE_ENV) { process.env.NODE_ENV = "production"; } 或在 package.json 启动脚本中设置 NODE_ENV=production node server.js。考虑使用 dotenv 管理环境变量并提供 .env.example 模板。',
  references: ['CWE-477'],
  since: '2026-06-29',
};
