/**
 * 路径安全守卫：executor 的 read/edit/图片 路径必须位于 uploads/skills 白名单内
 * 修复：此前 Docx/Pdf/Canvas/Xlsx 的 read/edit 直读任意路径（任意文件读取/写入），
 * 仅创建类用 path.basename 受限 —— 统一入口强制白名单。
 */
const path = require('path');

function assertPathWithinUploads(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('filePath required');
  }
  const root = path.resolve(process.cwd(), 'uploads', 'skills');
  const resolved = path.resolve(filePath);
  if (!(resolved === root || resolved.startsWith(root + path.sep))) {
    throw new Error(`Path must be within uploads/skills: ${filePath}`);
  }
  return resolved;
}

module.exports = { assertPathWithinUploads };