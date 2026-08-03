/**
 * L-extensibility 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkPluginSystem': async (root, files) => {
    const hasPlugin = files.some((f) => {
      const content = fs.readFileSync(f, 'utf-8');
      return content.includes('plugin') ||
             content.includes('Plugin') ||
             content.includes('extension') ||
             content.includes('hook');
    });

    if (!hasPlugin) {
      return { status: 'warning', message: '缺少插件机制', details: '建议实现插件系统提高可扩展性' };
    }

    return { status: 'passed', message: '插件机制存在' };
  },

  'checkExtensionPoints': async (root, files) => {
    const extensionPatterns = ['before', 'after', 'on', 'emit', 'subscribe', 'middleware'];
    let extensionCount = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      extensionCount += extensionPatterns.filter((p) => content.includes(p)).length;
    }

    if (extensionCount < 3) {
      return { status: 'warning', message: '扩展点不足', details: '建议添加更多生命周期钩子' };
    }

    return { status: 'passed', message: '扩展点设计良好' };
  },

  'checkUpgradePath': async (root) => {
    const upgradeDoc = ['UPGRADE.md', 'docs/upgrade.md', 'MIGRATION.md'];
    const exists = upgradeDoc.some((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少升级指南', details: '建议添加UPGRADE.md指导版本升级' };
    }

    return { status: 'passed', message: '升级指南存在' };
  }


};
