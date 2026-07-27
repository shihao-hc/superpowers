module.exports = {
  id: 'HARDCODED_IP',
  severity: 'MEDIUM',
  cwe: 'CWE-200',
  description: '硬编码 IP 地址或内网域名，建议提取到配置文件',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      // Exclude loopback addresses (127.0.0.1, localhost, ::1) — always local, not a security risk
      if (/['"`]127\.0\.0\.1['"`]/.test(line) || /['"`]localhost['"`]/.test(line) || /['"`]::1['"`]/.test(line)) continue;
      if (/['"`](?:10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.)['"`]/.test(line)) {
        if (/(conf|config|example|default|sample)/i.test(line)) continue;
        if (/host|url|endpoint|server|proxy|origin/.test(line) && !/process\.env/.test(line)) {
          report('MEDIUM', 'HARDCODED_IP', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '硬编码 IP 地址或内网域名，建议提取到配置文件');
        }
      }
    }
  },
  suggest: '将硬编码的 IP/域名提取到 .env 配置文件中，通过 process.env.HOST/URL 引用，方便不同环境切换。',
  references: ['CWE-200'],
  since: '2026-06-28',
};
