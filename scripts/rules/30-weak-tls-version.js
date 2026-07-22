module.exports = {
  id: 'WEAK_TLS_VERSION',
  severity: 'HIGH',
  cwe: 'CWE-326',
  description: '使用了不安全的 TLS 版本（TLSv1/TLSv1.1），应使用 TLSv1.2+',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/['"`]TLSv1['"`]/.test(line) && !/TLSv1\.2/.test(line) && !/TLSv1\.3/.test(line)) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        report('HIGH', 'WEAK_TLS_VERSION', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '使用了不安全的 TLS 版本（TLSv1/TLSv1.1），应使用 TLSv1.2+');
      }
    }
  },
  suggest: '将 SSL/TLS 配置中的 TLSv1/TLSv1.1 替换为 TLSv1.2+。对于 Node.js：在 HTTPS 或 TLS 选项中设置 secureProtocol: "TLSv1_2_method" 或更高。对于 nginx：ssl_protocols TLSv1.2 TLSv1.3;。确保服务端也不接受低版本 TLS。',
  references: ['CWE-326'],
  since: '2026-06-28',
};
