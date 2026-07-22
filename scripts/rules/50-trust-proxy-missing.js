module.exports = {
  id: 'TRUST_PROXY_MISSING',
  severity: 'LOW',
  cwe: 'CWE-348',
  description: 'Express 缺少 trust proxy 设置，可能影响 IP 相关安全逻辑',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    const src = lines.join('\n');
    if (!/require\s*\(\s*['"]express['"]\s*\)/.test(src) && !/from\s+['"]express['"]/.test(src)) return;
    if (/trust\s*proxy/i.test(src)) return;
    report('LOW', 'TRUST_PROXY_MISSING', '文件范围', 'Express 缺少 trust proxy 配置，负载均衡下 req.ip 可能不准确');
  },
  suggest: '添加 trust proxy 设置：app.set("trust proxy", 1)（信任一级代理）或 app.set("trust proxy", "loopback")（信任本地代理）。通过环境变量控制：app.set("trust proxy", process.env.TRUST_PROXY || false)。查看 Express 代理指南了解详情。',
  references: ['CWE-348', 'https://expressjs.com/en/guide/behind-proxies.html'],
  since: '2026-06-29',
};
