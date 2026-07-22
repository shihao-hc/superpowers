module.exports = {
  id: 'CLOUD_KEY_HARDCODED',
  severity: 'HIGH',
  cwe: 'CWE-798',
  description: '硬编码云服务密钥，应从环境变量或密钥管理服务读取',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/process\.env/.test(line) || /require\(/.test(line)) continue;
      if (/(?:AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})/.test(line)) {
        report('HIGH', 'CLOUD_KEY_HARDCODED', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '硬编码 AWS 访问密钥，应使用 IAM 角色或环境变量');
      }
      if (/['"`](?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}['"`]/.test(line)) {
        report('HIGH', 'CLOUD_KEY_HARDCODED', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '硬编码个人访问令牌（GitHub/npm），应使用环境变量');
      }
      if (/(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/.test(line)) {
        report('HIGH', 'CLOUD_KEY_HARDCODED', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '数据库连接串含硬编码密码，应使用环境变量');
      }
    }
  },
  suggest: '将云服务密钥移至环境变量。AWS：使用 IAM 角色（EC2/Lambda）或 aws-sdk 的默认凭据链。GitHub：使用 Actions secrets 或环境变量。数据库连接串使用 process.env.DATABASE_URL。对遗留硬编码密钥立即轮换。',
  references: ['CWE-798'],
  since: '2026-06-28',
};
