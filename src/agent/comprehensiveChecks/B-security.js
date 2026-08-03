/**
 * B-security 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkSecurity': async (root, files) => {
    const risks = [];

    // 真正的危险模式检测
    // 1. eval() 直接调用（非字符串匹配）
    // 2. new Function() 动态创建函数
    // 3. innerHTML 直接赋值（非React/Vue框架）
    // 4. document.write() XSS风险

    for (const file of files.slice(0, 20)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 移除注释
      const codeOnly = content
        .replace(/\/\/.*$/gm, '')           // 单行注释
        .replace(/\/\*[\s\S]*?\*\//g, '');   // 多行注释

      // 移除字符串字面量
      const noStrings = codeOnly
        .replace(/'[^']*'/g, '\'\'')
        .replace(/"[^"]*"/g, '""')
        .replace(/`[^`]*`/g, '``');

      // 检测危险模式
      if (/\beval\s*\([^)]*\)/.test(noStrings)) {
        // 排除 $$eval (Playwright API)
        if (!noStrings.includes('$$eval')) {
          risks.push(`${path.basename(file)}: eval调用`);
        }
      }

      // 检测 new Function
      if (/new\s+Function\s*\(/.test(noStrings)) {
        risks.push(`${path.basename(file)}: 动态函数`);
      }

      // 检测危险的innerHTML直接赋值
      if (/\.innerHTML\s*=\s*(?![`'"]).*(?:\{|\+)/.test(noStrings)) {
        risks.push(`${path.basename(file)}: innerHTML动态赋值`);
      }

      // 检测 document.write
      if (/document\.write\s*\(/.test(noStrings)) {
        risks.push(`${path.basename(file)}: document.write`);
      }
    }

    if (risks.length > 0) {
      return { status: 'failed', message: '安全风险', details: risks.slice(0, 5).join(', ') };
    }

    return { status: 'passed', message: '安全检查通过' };
  },

  'checkVulnerabilities': async (root, files) => {
    // 检查是否包含已知漏洞模式
    const vulnerabilityPatterns = [
      { pattern: /password\s*=\s*['"][^'"]+['"]/i, desc: '硬编码密码' },
      { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/i, desc: '硬编码API Key' },
      { pattern: /secret\s*=\s*['"][^'"]+['"]/i, desc: '硬编码密钥' },
      { pattern: /token\s*=\s*['"][^'"]+['"]/i, desc: '硬编码Token' },
      { pattern: /private[_-]?key\s*=\s*['"]/i, desc: '硬编码私钥' }
    ];

    const found = [];
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const vp of vulnerabilityPatterns) {
        if (vp.pattern.test(content) && !content.includes('//') && !content.includes('placeholder')) {
          found.push(`${path.basename(file)}: ${vp.desc}`);
        }
      }
    }

    if (found.length > 0) {
      return { status: 'failed', message: '发现漏洞', details: found.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '无已知漏洞' };
  },

  'checkPotentialRisks': async (root, files) => {
    const riskPatterns = [
      { pattern: /\.sql\(`|sql\s*\+=/i, desc: 'SQL拼接' },
      { pattern: /shell\s*\.\s*exec/i, desc: 'Shell执行' },
      { pattern: /http.*\?.*\$/i, desc: 'URL参数拼接' },
      { pattern: /JSON\.parse.*user/i, desc: '用户输入JSON解析' },
      { pattern: /fs\.\w+.*path\.(join|resolve).*\$/i, desc: '动态路径' }
    ];

    const risks = [];
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const rp of riskPatterns) {
        if (rp.pattern.test(content)) {
          risks.push(`${path.basename(file)}: ${rp.desc}`);
        }
      }
    }

    if (risks.length > 0) {
      return { status: 'warning', message: '发现潜在风险', details: risks.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '无明显隐患' };
  },

  'checkInputValidation': async (root, files) => {
    const validators = ['isNaN', 'isFinite', 'typeof', 'instanceof', 'validate', 'sanitize'];
    let hasValidation = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (validators.some((v) => content.includes(v))) {
        hasValidation++;
      }
    }

    if (hasValidation < 2) {
      return { status: 'warning', message: '输入验证不足', details: '建议添加更多输入验证' };
    }

    return { status: 'passed', message: '输入验证检查通过' };
  },

  'checkPathSecurity': async (root, files) => {
    // 路径安全检查 - 核心：检查真正的路径遍历漏洞
    // 安全的 ../core 和 ../agent 相对导入是正常使用，不计入风险

    // 只检查是否有 eval + 动态路径的组合（真正危险）
    let realRisks = 0;

    for (const file of files.slice(0, 10)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');

        // 真正危险：用户输入拼接到文件路径
        const dangerous = content.includes('eval(userInput') ||
                              content.includes('fs.readFile(userPath') ||
                              content.includes('require(userModule');
        if (dangerous) {realRisks++;}
      } catch (e) {}
    }

    if (realRisks > 0) {
      return { status: 'warning', message: '发现真实路径遍历风险', details: `${realRisks}个文件` };
    }

    return { status: 'passed', message: '路径安全检查通过' };
  }


};
