module.exports = {
  id: 'WEAK_SESSION_SECRET',
  severity: 'HIGH',
  cwe: 'CWE-326',
  description: 'session 密钥过短或硬编码，可被暴力破解/泄露导致会话伪造',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    let inSessionConfig = false;
    const src = lines.join('\n');
    if (!/session|cookie[-_]?session/i.test(src)) return;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/secret\s*[=:]\s*['"](.{0,15})['"]/.test(line)) {
        if (/\$\{|process\.env/.test(line)) continue;
        const secret = RegExp.$1;
        if (secret.length < 16 || /secret|session|key|change.?me|default/i.test(secret)) {
          report('HIGH', 'WEAK_SESSION_SECRET', `行 ${i + 1}: ${line.trim().substring(0, 80)}`, 'session 密钥过短或为占位符');
        }
      }
    }
  },
  suggest: '设置长度 ≥ 32 字符的强随机 session secret：使用 crypto.randomBytes(32).toString("hex") 生成。通过环境变量注入：app.use(session({ secret: process.env.SESSION_SECRET }))。避免使用常见词或占位符作为密钥。',
  references: ['CWE-326'],
  since: '2026-06-29',
};
