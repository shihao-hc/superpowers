module.exports = {
  id: 'NODE_ENV_CHECK_MISSING',
  severity: 'LOW',
  cwe: 'CWE-477',
  description: '服务器入口文件未检测 NODE_ENV 环境变量',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    // 只检查真正的服务器/应用入口，不检查模块出口 (如 src/agent/index.js, config/index.js)
    const parts = relativePath.split(/[/\\]/).filter(Boolean);
    const isRootEntry = parts.length === 1 && /^(?:server|index|app|main)\.js$/.test(parts[0]);
    const isServerEntry = parts.length === 2 && parts[0] === 'server' && parts[1] === 'index.js';
    const isSrcEntry = parts.length === 2 && parts[0] === 'src' && parts[1] === 'index.js';
    if (!isRootEntry && !isServerEntry && !isSrcEntry) return;
    const src = lines.join('\n');
    if (/NODE_ENV/.test(src) && /production/.test(src) && /process\.env/.test(src)) return;
    report('LOW', 'NODE_ENV_CHECK_MISSING', '文件范围', '服务器入口文件未检测 NODE_ENV 环境变量');
  },
  suggest: '在服务器入口文件顶部检测 NODE_ENV：if (!process.env.NODE_ENV) { process.env.NODE_ENV = "production"; } 或在 package.json 启动脚本中设置 NODE_ENV=production node server.js。考虑使用 dotenv 管理环境变量并提供 .env.example 模板。',
  references: ['CWE-477'],
  since: '2026-06-29',
};
