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
  references: ['CWE-327'],
  since: '2026-06-28',
};
