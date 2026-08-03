/**
 * K-ux 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkErrorMessages': async (root, files) => {
    let friendlyErrors = 0;
    let unfriendlyErrors = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 友好错误消息
      if (/throw\s+new\s+Error\(['"`].*[.!。]/.test(content)) {
        friendlyErrors++;
      }

      // 不友好错误消息
      if (/throw\s+Error\(['"`]\w{1,20}['"`]\)/.test(content)) {
        unfriendlyErrors++;
      }
    }

    if (unfriendlyErrors > friendlyErrors) {
      return { status: 'warning', message: '错误消息不够友好', details: '建议使用描述性错误消息' };
    }

    return { status: 'passed', message: '错误提示友好性良好' };
  },

  'checkHelpDocs': async (root) => {
    const helpFiles = ['docs/help.md', 'docs/guide.md', 'HELP.md', 'docs/README.md'];
    const exists = helpFiles.some((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少帮助文档', details: '建议添加docs/guide.md' };
    }

    return { status: 'passed', message: '帮助文档存在' };
  },

  'checkAPIFriendliness': async (root, files) => {
    // 检查更多文件的核心模块
    const coreFiles = files.filter((f) =>
      f.includes('/core/') || f.includes('/agent/') || f.includes('/api/')
    ).slice(0, 15);

    let jsdocCount = 0;

    for (const file of coreFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/\/\*\*[\s\S]*?@param/.test(content)) {
        jsdocCount++;
      }
    }

    // 调整阈值：至少20%的核心文件有JSDoc
    const threshold = Math.ceil(coreFiles.length * 0.2);
    if (jsdocCount < threshold) {
      return { status: 'warning', message: '核心模块API文档不足', details: `${jsdocCount}/${coreFiles.length}个核心文件有JSDoc` };
    }

    return { status: 'passed', message: `API文档充足 (${jsdocCount}/${coreFiles.length})` };
  },

  'checkBackwardCompatibility': async (root) => {
    const changelogPath = path.join(root, 'CHANGELOG.md');
    if (!fs.existsSync(changelogPath)) {
      return { status: 'warning', message: '缺少变更日志', details: '建议维护CHANGELOG记录Breaking Changes' };
    }

    const changelog = fs.readFileSync(changelogPath, 'utf-8');
    const hasBreakingChanges = changelog.includes('BREAKING') ||
                              changelog.includes('破坏性') ||
                              changelog.includes('!');

    return { status: 'passed', message: hasBreakingChanges ? '变更日志完整' : '未发现Breaking Changes' };
  }


};
