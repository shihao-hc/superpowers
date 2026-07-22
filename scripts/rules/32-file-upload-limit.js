module.exports = {
  id: 'FILE_UPLOAD_LIMIT',
  severity: 'MEDIUM',
  cwe: 'CWE-770',
  description: '文件上传未显式限制大小，建议设置 maxFileSize',
  enabled: true,
  match: function (lines, relativePath, filePath, report) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/multer\s*\(|upload\.single|upload\.array|upload\.fields|upload\.any/.test(line)) {
        if (!/limits?\s*[=:]/.test(line) && !/maxFileSize|fileSize|maxCount/.test(line)) {
          report('MEDIUM', 'FILE_UPLOAD_LIMIT', `行 ${i + 1}: ${line.trim().substring(0, 100)}`, '文件上传未显式限制大小，建议设置 maxFileSize');
        }
      }
    }
  },
  suggest: '设置 multer 的 limits.fileSize 限制文件大小：upload.fields([...], { limits: { fileSize: 5 * 1024 * 1024 } })。根据业务需求设置合理的最大值，对超出大小限制返回 413 错误。同时设置 Nginx/AWS ALB 层的请求体大小限制。',
  references: ['CWE-770'],
  since: '2026-06-28',
};
