module.exports = {
  id: 'JWT_HARDCODED_SECRET',
  severity: 'HIGH',
  cwe: 'CWE-798',
  description: 'JWT 签名使用硬编码密钥，应使用环境变量',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/jwt\.sign\([^,]+,\s*['"]([^'"]{8,})['"]/.test(line)) {
        if (/process\.env/.test(line)) continue;
        report('HIGH', 'JWT_HARDCODED_SECRET', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'JWT 签名使用硬编码密钥，应使用环境变量');
      }
    }
  },
  suggest: '将 JWT 签名密钥移至环境变量：const SECRET = process.env.JWT_SECRET。确保密钥长度 ≥ 32 字符。在生产环境启动时验证 JWT_SECRET 已设置，缺失则拒绝启动。定期轮换签名密钥。',
  references: ['CWE-798'],
  since: '2026-06-28',
};
