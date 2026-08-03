/**
 * N-cleanliness 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkCleanup': async (root, files) => {
    const srcDir = path.join(root, 'src');
    const emptyDirs = [];

    // 检查空目录
    try {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const dirPath = path.join(srcDir, entry.name);
          const subFiles = fs.readdirSync(dirPath);
          if (subFiles.length === 0) {
            emptyDirs.push(entry.name);
          }
        }
      }
    } catch (e) { /* 忽略错误 */ }

    // 检查TODO/FIXME（警告级别）
    let todoCount = 0;
    for (const file of files.slice(0, 20)) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(/\bTODO\b|\bFIXME\b|\bXXX\b|\bHACK\b/g);
      if (matches) {todoCount += matches.length;}
    }

    const issues = [];
    if (emptyDirs.length > 0) {
      issues.push(`空目录: ${emptyDirs.slice(0, 5).join(', ')}${emptyDirs.length > 5 ? '...' : ''}`);
    }
    if (todoCount > 10) {
      issues.push(`TODO/FIXME: ${todoCount}处`);
    }

    if (issues.length > 0) {
      return { status: 'warning', message: '需要清理', details: issues.join('; ') };
    }

    return { status: 'passed', message: '代码整洁，无明显垃圾' };
  }
};
