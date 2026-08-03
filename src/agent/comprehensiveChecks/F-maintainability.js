/**
 * F-maintainability 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const { splitLines } = require('../../utils/UltraWorkUtils');
module.exports = {
  'checkReadability': async (root, files) => {
    let issues = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = splitLines(content);

      // 检查超长行
      const longLines = lines.filter((l) => l.length > 120);
      if (longLines.length > 5) {
        issues++;
      }
    }

    if (issues > 2) {
      return { status: 'warning', message: '代码可读性有待提升', details: '部分文件存在超长行' };
    }

    return { status: 'passed', message: '代码可读性检查通过' };
  },

  'checkCommentCoverage': async (root, files) => {
    // Node.js项目通常注释较少，降低阈值到5%
    let totalLines = 0;
    let commentLines = 0;
    let jsdocCount = 0;

    for (const file of files.slice(0, 20)) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = splitLines(content);
      totalLines += lines.length;

      // 行注释
      commentLines += lines.filter((l) =>
        l.trim().startsWith('//') ||
        l.trim().startsWith('/*') ||
        l.trim().startsWith('*')
      ).length;

      // JSDoc加分
      if (/\/\*\*[\s\S]*?@\w+/.test(content)) {
        jsdocCount++;
      }
    }

    const coverage = totalLines > 0 ? (commentLines / totalLines * 100).toFixed(1) : 0;
    const jsdocRatio = files.length > 0 ? (jsdocCount / Math.min(files.length, 20) * 100).toFixed(1) : 0;

    // JSDoc密集的项目降低注释要求
    const effectiveCoverage = parseFloat(coverage) + (parseFloat(jsdocRatio) * 0.5);

    if (effectiveCoverage < 5) {
      return { status: 'warning', message: '注释覆盖率过低', details: `行注释${coverage}%, JSDoc ${jsdocCount}个文件` };
    }

    return { status: 'passed', message: `注释覆盖率: ${coverage}%` };
  },

  'checkNamingConsistency': async (root, files) => {
    // Node.js项目中混合camelCase(方法)和PascalCase(类)是正常的
    // 这里只检查真正的命名问题：如同一上下文中混用不同风格

    let issues = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检查常量命名：如果有常量使用camelCase而不是SCREAMING_SNAKE_CASE
      const constDecl = content.match(/\bconst\s+[a-z][A-Z]\w*\s*=/g);
      const letDecl = content.match(/\blet\s+[a-z][A-Z]\w*\s*=/g);

      if ((constDecl?.length || 0) + (letDecl?.length || 0) > 3) {
        issues++;
      }
    }

    if (issues > 2) {
      return { status: 'warning', message: '部分常量未使用大写下划线', details: '建议常量使用SCREAMING_SNAKE_CASE' };
    }

    return { status: 'passed', message: '命名规范一致' };
  },

  'checkModularization': async (root, files) => {
    const coreFiles = files.filter((f) => f.includes('/core/') || f.includes('/agent/'));
    let largeFiles = 0;

    for (const file of coreFiles.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.length > 5000) {
        largeFiles++;
      }
    }

    if (largeFiles > 3) {
      return { status: 'warning', message: '部分模块过大', details: `${largeFiles}个文件超过5000字符` };
    }

    return { status: 'passed', message: '模块化程度良好' };
  }


};
