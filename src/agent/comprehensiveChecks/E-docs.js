/**
 * E-docs 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkReadme': async (root) => {
    const readmeFiles = ['README.md', 'README.txt', 'readme.md'];
    const exists = readmeFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'failed', message: '缺少README文件', details: '项目根目录应包含README.md' };
    }

    const content = fs.readFileSync(path.join(root, exists), 'utf-8');

    // 检测项目类型（优先Python）
    const isPython = fs.existsSync(path.join(root, 'requirements.txt')) ||
                     fs.existsSync(path.join(root, 'setup.py')) ||
                     fs.existsSync(path.join(root, 'pyproject.toml'));
    const isNode = fs.existsSync(path.join(root, 'package.json')) && !isPython;

    // 根据项目类型检查对应内容
    const required = ['#'];
    if (isNode) {
      required.push(...['npm', 'install', 'node']);
    } else if (isPython) {
      required.push(...['pip', 'install', 'python']);
    } else {
      required.push(...['install']);
    }

    // 通用内容（支持多种表达）
    const hasInstall = /install|pip|npm|yarn/i.test(content);
    const hasUsage = /usage|quick start|start|run/i.test(content);

    if (!hasInstall) {required.push('install');}
    if (!hasUsage) {required.push('start/usage');}

    const missing = required.filter((r) => !content.toLowerCase().includes(r.toLowerCase()));

    if (missing.length > 2) {
      return { status: 'warning', message: 'README可能不完整', details: `建议添加: ${missing.slice(0, 3).join(', ')}` };
    }

    return { status: 'passed', message: 'README检查通过' };
  },

  'checkAPIDocs': async (root, files) => {
    const docsFiles = ['docs/API.md', 'docs/api.md', 'API.md', 'api.md'];
    const exists = docsFiles.find((f) => fs.existsSync(path.join(root, f)));

    // 检查JSDoc注释
    let jsdocCount = 0;
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/\/\*\*[\s\S]*?@\w+/.test(content)) {
        jsdocCount++;
      }
    }

    if (!exists && jsdocCount < 3) {
      return { status: 'warning', message: '缺少API文档', details: `仅${jsdocCount}个文件有JSDoc` };
    }

    return { status: 'passed', message: exists ? 'API文档存在' : 'JSDoc注释充足' };
  },

  'checkExamples': async (root) => {
    const exampleDirs = ['examples', 'example', 'demo', 'samples'];
    const exists = exampleDirs.find((d) =>
      fs.existsSync(path.join(root, d)) ||
      fs.existsSync(path.join(root, 'docs', d))
    );

    if (!exists) {
      return { status: 'warning', message: '缺少示例代码', details: '建议添加examples目录' };
    }

    return { status: 'passed', message: `示例目录: ${exists}` };
  },

  'checkChangelog': async (root) => {
    const changelogFiles = ['CHANGELOG.md', 'CHANGELOG', 'HISTORY.md', 'changelog.md'];
    const exists = changelogFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少CHANGELOG', details: '建议添加CHANGELOG.md记录版本变更' };
    }

    return { status: 'passed', message: 'CHANGELOG存在' };
  },

  'checkLicense': async (root) => {
    const licenseFiles = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license.md'];
    const exists = licenseFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'failed', message: '缺少许可证文件', details: '项目根目录应包含LICENSE文件' };
    }

    return { status: 'passed', message: '许可证文件存在' };
  }


};
