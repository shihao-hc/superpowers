module.exports = {
  id: 'MISSING_BODY_LIMIT',
  severity: 'LOW',
  cwe: 'CWE-770',
  description: 'express.json/urlencoded 未显式设置 limit，建议根据业务显式配置',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/(?:express\.json|express\.urlencoded|bodyParser\.json)\s*\(/.test(line)) { continue; }
      if (/limit\s*[:=]/.test(line)) { continue; }
      let hasLimit = false;
      for (let j = 1; j <= 3; j++) {
        if (i + j < lines.length && /limit\s*[:=]/.test(lines[i + j])) {
          hasLimit = true;
          break;
        }
      }
      if (hasLimit) { continue; }
      const detail = `行 ${i + 1}: ${line.trim().substring(0, 100)}`;
      report('LOW', 'MISSING_BODY_LIMIT', detail, 'express.json/urlencoded 未显式设置 limit，建议根据业务显式配置');
    }
  },
  suggest: '为 express.json() 和 express.urlencoded() 显式设置 limit 参数：express.json({ limit: "1mb" })。根据接口预期请求体大小合理配置：JSON API 推荐 100kb-1mb，文件上传使用 multer 的 limits 配置而非 body parser。',
  references: ['CWE-770'],
  since: '2026-06-28'
};
