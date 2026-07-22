module.exports = {
  id: 'COOKIE_WITHOUT_SECURE',
  severity: 'MEDIUM',
  cwe: 'CWE-614',
  description: 'cookie 未设置 Secure 标志，在 HTTPS 下可能被中间人窃取',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\bres\.cookie\s*\(/.test(line) || /ctx\.cookies?.set\s*\(/.test(line)) {
        const surrounding = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 6)).join('\n');
        if (!/secure\s*[=:]\s*true/i.test(surrounding)) {
          report('MEDIUM', 'COOKIE_WITHOUT_SECURE', `行 ${i + 1}: ${line.trim().substring(0, 80)}`, 'cookie 未设置 Secure 标志');
        }
      }
    }
  },
  suggest: '给 cookie 设置添加 secure: true 标志：res.cookie("session", value, { secure: true, httpOnly: true, sameSite: "lax" })。确保应用运行在 HTTPS 下时 Secure 标志生效。对于 Express-session：cookie.secure: true。',
  references: ['CWE-614'],
  since: '2026-06-29',
};
