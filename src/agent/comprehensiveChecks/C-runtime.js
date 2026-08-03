/**
 * C-runtime 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkErrorHandling': async (root, files) => {
    let noTryCatch = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('try {') && (content.includes('require(') || content.includes('async'))) {
        noTryCatch++;
      }
    }

    if (noTryCatch > 2) {
      return { status: 'warning', message: '部分模块缺少错误处理', details: `${noTryCatch}个文件` };
    }

    return { status: 'passed', message: '错误处理检查通过' };
  },

  'checkConcurrency': async (root, files) => {
    const concurrencyPatterns = ['async', 'Promise', 'await', 'setTimeout', 'setInterval', 'Worker'];
    let hasConcurrency = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (concurrencyPatterns.some((p) => content.includes(p))) {
        hasConcurrency++;
      }
    }

    if (hasConcurrency > 0) {
      // 检查是否有锁或同步机制
      const hasLock = files.some((f) =>
        fs.readFileSync(f, 'utf-8').includes('lock') ||
        fs.readFileSync(f, 'utf-8').includes('mutex')
      );

      if (!hasLock) {
        return { status: 'warning', message: '并发场景无同步机制', details: '建议添加锁或互斥机制' };
      }
    }

    return { status: 'passed', message: '并发安全检查通过' };
  },

  'checkMemoryManagement': async (root, files) => {
    const issues = [];

    // 更精确的检测：只检查真正的内存问题
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检查明显的内存泄漏模式：全局变量累积
      if (/global\.\w+\s*=\s*\[\]/.test(content)) {
        issues.push(`${path.basename(file)}: 全局数组累积`);
      }

      // 检查未清理的缓存
      if (/cache\s*=\s*new\s+Map/.test(content) && !content.includes('cache.clear')) {
        issues.push(`${path.basename(file)}: 缓存无清理`);
      }
    }

    if (issues.length > 0) {
      return { status: 'warning', message: '潜在内存问题', details: issues.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '内存管理检查通过' };
  },

  'checkPerformance': async (root, files) => {
    const issues = [];

    for (const file of files.slice(0, 3)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检查递归
      const funcMatch = content.match(/function\s+(\w+)[^{]*\{[^}]*\}|\b\w+\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\}/g);
      if (funcMatch && funcMatch.length > 20) {
        issues.push(`${path.basename(file)}: 函数过多`);
      }

      // 检查嵌套过深
      if (/\{[^}]{0,20}\{[^}]{0,20}\{[^}]{0,20}\{/.test(content)) {
        issues.push(`${path.basename(file)}: 嵌套过深`);
      }
    }

    if (issues.length > 0) {
      return { status: 'warning', message: '性能问题', details: issues.join('; ') };
    }

    return { status: 'passed', message: '性能检查通过' };
  },

  'checkResourceLeaks': async (root, files) => {
    const issues = [];

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检查文件流
      if (content.includes('fs.createReadStream') && !content.includes('.close()')) {
        issues.push('未关闭文件流');
      }

      // 检查数据库连接
      if (content.includes('connect(') && !content.includes('disconnect')) {
        issues.push('未关闭数据库连接');
      }

      // 检查setTimeout无清理
      if (content.includes('setInterval') && !content.includes('clearInterval')) {
        issues.push('setInterval未清理');
      }
    }

    if (issues.length > 0) {
      return { status: 'warning', message: '资源泄露风险', details: issues.join(', ') };
    }

    return { status: 'passed', message: '无明显资源泄露' };
  }


};
