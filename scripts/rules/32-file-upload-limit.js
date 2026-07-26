module.exports = {
  id: 'FILE_UPLOAD_LIMIT',
  severity: 'MEDIUM',
  cwe: 'CWE-770',
  description: '文件上传未显式限制大小，建议设置 maxFileSize',
  enabled: true,
  isCustomMatchRule: true,
  match: function (lines, relativePath, filePath, report) {
    // First check if file has multer constructor with limits (file-level)
    const src = lines.join('\n');
    const hasFileLevelLimits = /multer\s*\(\s*\{[\s\S]*?limits\s*[:{=][\s\S]*?fileSize|multer\s*\(\s*\{[\s\S]*?fileSize[\s\S]*?limits/.test(src);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/multer\s*\(|upload\.single|upload\.array|upload\.fields|upload\.any/.test(line)) {
        if (/limits?\s*[=:]/.test(line) || /maxFileSize|fileSize|maxCount/.test(line)) continue;
        // Lookahead up to 3 lines for inline limits config
        let foundLimit = false;
        for (let j = 1; j <= 3 && i + j < lines.length; j++) {
          if (/limits?\s*[:{=]/.test(lines[i + j]) || /maxFileSize|fileSize/.test(lines[i + j])) {
            foundLimit = true;
            break;
          }
        }
        if (!foundLimit && !hasFileLevelLimits) {
          report('MEDIUM', 'FILE_UPLOAD_LIMIT', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '文件上传未显式限制大小，建议设置 maxFileSize');
        }
      }
    }
  },
  suggest: '设置 multer 的 limits.fileSize 限制文件大小：upload.fields([...], { limits: { fileSize: 5 * 1024 * 1024 } })。根据业务需求设置合理的最大值，对超出大小限制返回 413 错误。同时设置 Nginx/AWS ALB 层的请求体大小限制。',
  references: ['CWE-770'],
  since: '2026-06-28',
};
