module.exports = {
  id: 'INSECURE_RANDOM',
  severity: 'HIGH',
  cwe: 'CWE-338',
  description: 'Math.random() 用于安全上下文（token/secret/key），应使用 crypto.randomBytes',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\bMath\.random\(\)/.test(line)) {
        if (/tempFile|tmpdir|extract|filename|path\.join|folder|dir/i.test(line)) continue;
        if (/concepts|keywords|phrases|adjectives|nouns|verbs|choices|items|candidates/i.test(line)) continue;
        if (/\b(token|secret|password|csrf|nonce)\b/i.test(line) || /\bapiKey\b|\bapi_key\b|\bsession[^-\w]|\bjwt\b|\bauth\b|\breset\b/i.test(line)) {
          report('HIGH', 'INSECURE_RANDOM', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'Math.random() 用于安全上下文（token/secret/key），应使用 crypto.randomBytes');
        }
      }
    }
  },
  references: ['CWE-338'],
  since: '2026-06-28',
};
