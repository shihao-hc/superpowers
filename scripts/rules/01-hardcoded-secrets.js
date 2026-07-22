module.exports = {
  id: 'HARDCODED_SECRET',
  severity: 'HIGH',
  cwe: 'CWE-798',
  description: '硬编码密钥/密码，应从环境变量或密钥管理服务读取',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line) || /^\s*\/\*/.test(line)) continue;
      if (/\.test\.js|\.spec\.js|mock|example|fixture/i.test(relativePath)) break;
      if (/process\.env/.test(line) || /require\(/.test(line) || /import\s/.test(line)) continue;
      if (/['"]default['"]\s*[:=]/.test(line)) continue;
      const m = line.match(/(?:password|apiKey|api_key|api_secret|secret|private_key|accessToken|refreshToken)\s*[:=]\s*['"]([^'"\s]{8,})['"]/);
      if (m && !/placeholder|changeme|your-|example|test-|dummy|fake/i.test(m[1])) {
        report('HIGH', 'HARDCODED_SECRET', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '硬编码密钥/密码，应从环境变量或密钥管理服务读取');
      }
    }
  },
  suggest: '将所有密钥、密码和令牌移至环境变量（process.env.*）或密钥管理服务（如 AWS Secrets Manager、Vault）。确保 .env 文件不被提交到版本控制（添加到 .gitignore）。',
  references: ['CWE-798'],
  since: '2026-06-28',
};
