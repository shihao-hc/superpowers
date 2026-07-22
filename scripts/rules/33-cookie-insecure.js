module.exports = {
  id: 'COOKIE_INSECURE',
  severity: 'MEDIUM',
  cwe: 'CWE-614',
  description: 'Cookie 缺少 Secure/HttpOnly 标志，建议显式设置',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/res\.cookie\(|res\.cookies?\s*=|cookie\s*[:=]/.test(line)) {
        if (/Secure|HttpOnly|signed/.test(line)) continue;
        if (/(token|session|auth|jwt|sid)/i.test(line)) {
          if (/process\.env|config|secret|key/.test(line)) continue;
          report('MEDIUM', 'COOKIE_INSECURE', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'Cookie 缺少 Secure/HttpOnly 标志，建议显式设置');
        }
      }
    }
  },
  suggest: '设置 cookie 时显式指定安全标志：res.cookie("token", value, { httpOnly: true, secure: true, sameSite: "strict" })。对于 Express-session 配置：app.use(session({ cookie: { httpOnly: true, secure: true } }))。',
  references: ['CWE-614'],
  since: '2026-06-28',
};
