module.exports = {
  id: 'WEAK_HASH',
  severity: 'HIGH',
  cwe: 'CWE-327',
  description: 'md5/sha1 用于安全相关哈希，建议使用 sha256 或更高',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:['"`]md5['"`]|['"`]sha1['"`])/.test(line) && /createHash/.test(line)) {
        if (/(password|token|secret|key|sign|auth|hash|hmac)/i.test(line)) {
          report('HIGH', 'WEAK_HASH', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'md5/sha1 用于安全相关哈希，建议使用 sha256 或更高');
        }
      }
    }
  },
  suggest: '将 crypto.createHash("md5"/"sha1") 替换为 crypto.createHash("sha256") 或更高。对于密码哈希，使用 bcrypt（推荐）或 scrypt。对于 HMAC，使用 crypto.createHmac("sha256", key)。',
  references: ['CWE-327'],
  since: '2026-06-28',
};
