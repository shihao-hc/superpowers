module.exports = {
  id: 'PATH_TRAVERSAL_GENERIC',
  severity: 'HIGH',
  cwe: 'CWE-22',
  description: '用户输入用于文件路径操作，可能导致路径遍历',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:path\.join|res\.sendFile|fs\.createReadStream)\s*\(/.test(line)) {
        const hasUserSource = /req\.|\.query\.|\.params\.|\.body\.|\.file\.|userInput/i.test(line);
        const hasUserContext = /\b(?:input|upload|download)\b/i.test(line);
        if (hasUserSource || (hasUserContext && /\$\{/.test(line))) {
          if (/Validator|validate|sanitize|allowlist|allowed|path\.basename|encodeURIComponent/i.test(line)) continue;
          report('HIGH', 'PATH_TRAVERSAL_GENERIC', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '用户输入用于文件路径操作，可能导致路径遍历');
        }
      }
    }
  },
  references: ['CWE-22'],
  since: '2026-06-28',
};
