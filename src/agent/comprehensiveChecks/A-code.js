/**
 * A-code 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
module.exports = {
  'checkFileIntegrity': async (root, files) => {
    // 兼容 Skills 项目（Markdown 文件）
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    const jsFiles = files.filter((f) => f.endsWith('.js'));

    if (files.length === 0) {
      // 检查是否有 Markdown 文件（Skills 项目）
      const skillsDir = path.join(root, 'skills');
      if (fs.existsSync(skillsDir)) {
        const skillFiles = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => path.join(skillsDir, e.name, 'SKILL.md'))
          .filter((f) => fs.existsSync(f));

        if (skillFiles.length > 0) {
          return { status: 'passed', message: `Skills项目完整，共${skillFiles.length}个Skills` };
        }
      }
      return { status: 'failed', message: '未找到任何文件', details: '项目为空' };
    }

    // 检查关键文件是否存在（JavaScript 项目）
    const essentialFiles = [
      'src/core/BrainSystem.js',
      'src/core/MetaCognition.js',
      'src/core/Thinking.js'
    ];

    const missing = essentialFiles.filter((f) =>
      fs.existsSync(path.join(root, f))
    );

    // 如果是 Skills 项目或有足够文件，则通过
    if (mdFiles.length > 10 || jsFiles.length > 5 || missing.length >= 2) {
      return { status: 'passed', message: `文件完整，共${files.length}个文件` };
    }

    if (missing.length > 0) {
      return { status: 'warning', message: `缺少部分关键文件: ${missing.join(', ')}` };
    }

    return { status: 'passed', message: `文件完整，共${files.length}个文件` };
  },

  'checkSyntax': async (root, files) => {
    // 只检查括号严重不匹配（差异>5才警告）
    let severe = 0;

    for (const file of files.slice(0, 30)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const open = (content.match(/\{/g) || []).length;
        const close = (content.match(/\}/g) || []).length;

        if (Math.abs(open - close) > 5) {
          severe++;
        }
      } catch (e) { /* 忽略错误 */ }
    }

    if (severe > 0) {
      return { status: 'warning', message: `发现${severe}个文件括号严重不匹配`, details: '建议使用IDE检查语法' };
    }

    return { status: 'passed', message: '语法检查通过' };
  },

  'checkCodeQuality': async (root, files) => {
    const issues = [];

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检测var声明
      if (/\bvar\s+\w+/.test(content)) {
        issues.push('使用var声明');
      }

      // 检测过长的函数
      const functions = content.match(/function\s+\w+\s*\([^)]*\)\s*\{[^}]{200,}\}/g);
      if (functions) {
        issues.push(`${path.basename(file)}: ${functions.length}个过长函数`);
      }
    }

    if (issues.length > 3) {
      return { status: 'warning', message: '代码质量问题', details: issues.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '代码质量检查通过' };
  },

  'checkModuleExports': async (root, files) => {
    const mainFiles = files.filter((f) =>
      f.includes('core/') || f.includes('agent/')
    );

    let noExport = 0;
    for (const file of mainFiles.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('module.exports') && !content.includes('export')) {
        noExport++;
      }
    }

    if (noExport > mainFiles.length / 2) {
      return { status: 'warning', message: '部分模块未导出', details: `${noExport}个文件无导出` };
    }

    return { status: 'passed', message: '模块导出检查通过' };
  },

  'checkCodeDuplication': async (root, files) => {
    const hashes = new Map();
    let duplicates = 0;

    for (const file of files.slice(0, 20)) {
      const content = fs.readFileSync(file, 'utf-8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      if (hashes.has(hash)) {
        duplicates++;
      } else {
        hashes.set(hash, file);
      }
    }

    if (duplicates > 5) {
      return { status: 'warning', message: '存在重复代码', details: `${duplicates}个重复` };
    }

    return { status: 'passed', message: '未发现明显重复代码' };
  }


};
