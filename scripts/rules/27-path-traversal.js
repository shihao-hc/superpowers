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
  suggest: '验证用户输入的文件路径：使用 path.resolve() + path.startsWith() 确保路径在允许的目录内；使用白名单允许的字符（/^[a-zA-Z0-9_-]+$/）；避免将用户输入直接拼入 path.join()。使用唯一 ID 映射到存储路径而非直接使用用户输入。',
  references: ['CWE-22'],
  since: '2026-06-28',
};
