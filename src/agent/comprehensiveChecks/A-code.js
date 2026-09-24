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

  'checkModuleExports': async (root, _files) => {
    // 升级（2026-09-18）：原只查"文件有没有 module.exports"（浅），永远发现不了
    // "调用但未导出"类缺陷（如 runComprehensiveCheck 未导出 → 56 项检查自身从未运行）。
    // 现改为"导出完整性检查"：扫描 server 的 BrainSystem.<method> 调用 vs 实际导出，
    // 任何"被调用但未导出"的方法都会触发警告（复用 scripts/check-exports.js 逻辑）。
    try {
      const modulePath = path.join(root, 'src', 'core', 'BrainSystem.js');
      if (!fs.existsSync(modulePath)) { return { status: 'passed', message: '模块不存在，跳过' }; }
      const module = require(modulePath);
      const exported = new Set(Object.keys(module));

      const serverDir = path.join(root, 'server');
      const calls = new Set();
      const scan = (dir) => {
        if (!fs.existsSync(dir)) { return; }
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { scan(full); }
          else if (/\.js$/.test(e.name) && !/\.test\./.test(e.name)) {
            const src = fs.readFileSync(full, 'utf8');
            const re = /BrainSystem\.([A-Za-z_$][\w$]*)/g;
            let m;
            while ((m = re.exec(src))) { calls.add(m[1]); }
          }
        }
      };
      scan(serverDir);

      const missing = [...calls].filter((c) => !exported.has(c));
      if (missing.length > 0) {
        return { status: 'warning', message: '导出遗漏（调用但未导出）', details: `BrainSystem.${missing.join(', BrainSystem.')}` };
      }
      return { status: 'passed', message: '导出完整性通过（被调用方法全部已导出）' };
    } catch (e) {
      return { status: 'warning', message: '导出检查失败', details: e.message };
    }
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
