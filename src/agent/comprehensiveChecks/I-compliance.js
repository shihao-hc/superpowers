/**
 * I-compliance 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkLicenseCompliance': async (root) => {
    const licensePath = path.join(root, 'LICENSE');
    if (!fs.existsSync(licensePath)) {
      return { status: 'failed', message: '缺少许可证', details: '必须包含LICENSE文件' };
    }

    const license = fs.readFileSync(licensePath, 'utf-8');
    const knownLicenses = ['MIT', 'Apache', 'GPL', 'BSD', 'ISC', 'MIT License'];
    const isKnown = knownLicenses.some((l) => license.includes(l));

    if (!isKnown) {
      return { status: 'warning', message: '许可证类型不明确', details: '建议使用标准开源许可证' };
    }

    return { status: 'passed', message: '许可证合规' };
  },

  'checkSensitiveData': async (root, files) => {
    const sensitivePatterns = [
      { pattern: /password\s*[:=]\s*['"][^'"]+['"]/i, desc: '密码' },
      { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, desc: 'API Key' },
      { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/i, desc: '密钥' },
      { pattern: /token\s*[:=]\s*['"][^'"]+['"]/i, desc: 'Token' },
      { pattern: /private[_-]?key\s*[:=]/i, desc: '私钥' }
    ];

    const found = [];
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const sp of sensitivePatterns) {
        if (sp.pattern.test(content) && !content.includes('//') && !content.includes('example')) {
          found.push(`${path.basename(file)}: ${sp.desc}`);
        }
      }
    }

    if (found.length > 0) {
      return { status: 'failed', message: '发现敏感信息泄露', details: found.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '无敏感信息泄露' };
  },

  'checkAuditLogs': async (root, files) => {
    let hasAudit = false;

    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      if (content.includes('audit') || content.includes('history') || content.includes('记录')) {
        hasAudit = true;
        break;
      }
    }

    if (!hasAudit) {
      return { status: 'warning', message: '缺少审计日志', details: '建议添加操作审计功能' };
    }

    return { status: 'passed', message: '审计日志机制存在' };
  },

  'checkDataIsolation': async (root, files) => {
    let hasIsolation = false;

    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      if (content.includes('tenant') || content.includes('namespace') ||
          content.includes('隔离') || content.includes('sandbox')) {
        hasIsolation = true;
        break;
      }
    }

    if (!hasIsolation) {
      return { status: 'warning', message: '缺少数据隔离机制', details: '建议为多租户场景添加数据隔离' };
    }

    return { status: 'passed', message: '数据隔离机制存在' };
  }


};
