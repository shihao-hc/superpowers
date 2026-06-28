module.exports = {
  id: 'DOM_XSS_EXTENDED',
  severity: 'HIGH',
  cwe: 'CWE-79',
  description: 'DOM XSS 注入点 — document.write/insertAdjacentHTML/outerHTML',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/document\.(write|writeln)\s*\(/.test(line) || /\.insertAdjacentHTML\s*\(/.test(line) || /\.outerHTML\s*=/.test(line)) {
        if (/\$\{|['"`]\s*\+/.test(line) || !/['"`]/.test(line) || /\b(req|body|query|params|input|data|value|text|html|url|name|user|content|msg|result)\b/.test(line)) {
          report('HIGH', 'DOM_XSS_EXTENDED', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, 'DOM XSS 注入点 — document.write/insertAdjacentHTML/outerHTML');
        }
      }
    }
  },
  references: ['CWE-79'],
  since: '2026-06-28',
};
