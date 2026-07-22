module.exports = {
  id: 'WEAK_JWT_EXPIRY',
  severity: 'MEDIUM',
  cwe: 'CWE-613',
  description: 'JWT 过期时间过长，增加令牌泄露风险窗口',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/jwt\.sign\s*\(/.test(line)) {
        if (/expiresIn\s*[:=]\s*['"](?:30|60|90)\s*d(?:ays?)?['"]/i.test(line) ||
            /expiresIn\s*[:=]\s*['"]\d+\s*(?:month|year)s?['"]/i.test(line) ||
            /expiresIn\s*[:=]\s*['"]\d{4,}['"]/.test(line)) {
          report('MEDIUM', 'WEAK_JWT_EXPIRY', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'JWT 过期时间过长');
        }
        if (/expiresIn\s*[:=]\s*(?!['"`])(\d+)/.test(line) && parseInt(RegExp.$1, 10) > 86400) {
          report('MEDIUM', 'WEAK_JWT_EXPIRY', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'JWT 过期时间超过 24 小时');
        }
        if (/expiresIn\s*[:=]\s*['"](\d+)\s*(?:d|h)/i.test(line)) {
          const val = parseInt(RegExp.$1, 10);
          const unit = RegExp.$2;
          if ((unit === 'd' && val > 1) || (unit === 'h' && val > 24)) {
            report('MEDIUM', 'WEAK_JWT_EXPIRY', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'JWT 过期时间超过建议值');
          }
        }
      }
    }
  },
  suggest: '缩短 JWT 过期时间：访问令牌建议 15 分钟以内（expiresIn: "15m"），刷新令牌建议 7 天（expiresIn: "7d"）。配合刷新令牌机制（refresh token）实现长期登录保持。考虑使用 Redis 维护令牌黑名单支持即时撤销。',
  references: ['CWE-613'],
  since: '2026-06-29',
};
