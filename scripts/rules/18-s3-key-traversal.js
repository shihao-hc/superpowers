module.exports = {
  id: 'S3_KEY_PATH_TRAVERSAL',
  severity: 'HIGH',
  cwe: 'CWE-22',
  description: 'file.originalname 未经 path.basename() 等 sanitizer 直接使用',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      if (!/file\.originalname/.test(lines[i])) continue;
      if (/path\.basename\(|Validation\.sanitizeString\(|encodeURIComponent\(|_generateKey\(/.test(lines[i])) continue;
      if (/filename:\s*req\.file\.originalname|originalName:\s*file\.originalname/.test(lines[i])) continue;
      report('HIGH', 'S3_KEY_PATH_TRAVERSAL', `行 ${i + 1}: ${lines[i].trim().substring(0, 100)}`, 'file.originalname 未经 path.basename() 等 sanitizer 直接使用');
    }
  },
  suggest: '使用 path.basename() 过滤文件名：const safeName = path.basename(file.originalname)。结合唯一 ID 生成存储键：${uuid()}-${safeName}。避免将用户提供的文件名直接用于文件系统或 S3 路径。',
  references: ['CWE-22'],
  since: '2026-06-28',
};
