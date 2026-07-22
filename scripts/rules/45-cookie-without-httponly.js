module.exports = {
  id: 'COOKIE_WITHOUT_HTTPONLY',
  severity: 'MEDIUM',
  cwe: 'CWE-1004',
  description: 'cookie 未设置 httpOnly 标志，XSS 时可被脚本读取泄露会话',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\bres\.cookie\s*\(/.test(line) || /ctx\.cookies?.set\s*\(/.test(line)) {
        const surrounding = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 6)).join('\n');
        if (!/httpOnly\s*[=:]\s*true/i.test(surrounding)) {
          report('MEDIUM', 'COOKIE_WITHOUT_HTTPONLY', `行 ${i + 1}: ${line.trim().substring(0, 80)}`, 'cookie 未设置 httpOnly 标志');
        }
      }
    }
  },
  suggest: '给 cookie 设置添加 httpOnly: true 标志：res.cookie("session", value, { httpOnly: true, secure: true })。这将阻止客户端 JavaScript 访问 cookie，降低 XSS 泄露会话的风险。Express-session 默认已启用 httpOnly。',
  references: ['CWE-1004'],
  since: '2026-06-29',
};
