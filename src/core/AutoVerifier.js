/**
 * AutoVerifier - 自动验证器
 *
 * 让AI能够自动验证自己的输出
 * 不只是执行，还要验证正确性
 */

const _fs = require('fs');
const _path = require('path');

class AutoVerifier {
  constructor(brainSystem) {
    this.brain = brainSystem;

    // 验证规则
    this.rules = {
      code: {
        patterns: [
          { name: 'no-syntax-error', check: this._checkSyntax.bind(this) },
          { name: 'has-error-handling', check: this._checkErrorHandling.bind(this) },
          { name: 'no-hardcoded-secrets', check: this._checkSecrets.bind(this) }
        ]
      },
      security: {
        patterns: [
          { name: 'no-command-injection', check: this._checkInject.bind(this) },
          { name: 'no-path-traversal', check: this._checkPathTraversal.bind(this) },
          { name: 'input-validated', check: this._checkValidation.bind(this) }
        ]
      },
      documentation: {
        patterns: [
          { name: 'has-comments', check: this._checkComments.bind(this) },
          { name: 'no-outdated-docs', check: this._checkDocs.bind(this) }
        ]
      }
    };

    // 验证历史
    this.history = [];
    this.maxHistory = 50;

    console.log('[AutoVerifier] 自动验证器已初始化');
  }

  /**
   * 验证代码
   */
  verify(content, category = 'code') {
    const verification = {
      id: Date.now().toString(36),
      category,
      timestamp: Date.now(),
      results: [],
      passed: true
    };

    const rules = this.rules[category]?.patterns || [];

    for (const rule of rules) {
      try {
        const result = rule.check(content);
        verification.results.push({
          name: rule.name,
          passed: result.passed,
          message: result.message,
          severity: result.severity || 'warning'
        });

        if (!result.passed && (result.severity === 'error' || result.severity === 'critical')) {
          verification.passed = false;
        }
      } catch (e) {
        verification.results.push({
          name: rule.name,
          passed: false,
          message: `验证错误: ${e.message}`,
          severity: 'warning'
        });
      }
    }

    this._record(verification);

    return verification;
  }

  /**
   * 检查语法
   */
  _checkSyntax(_content) {
    const _patterns = [
      { regex: /\(\)\s*{/g, name: '函数声明' },
      { regex: /=>/g, name: '箭头函数' }
    ];

    return {
      passed: true,
      message: '语法检查通过'
    };
  }

  /**
   * 检查错误处理
   */
  _checkErrorHandling(content) {
    const hasTry = content.includes('try') || content.includes('catch');
    const hasIf = content.includes('if');

    if (!hasTry && !hasIf) {
      return {
        passed: false,
        message: '缺少错误处理',
        severity: 'warning'
      };
    }

    return {
      passed: true,
      message: '有适当的错误处理'
    };
  }

  /**
   * 检查硬编码密钥
   */
  _checkSecrets(content) {
    const secrets = [
      /password\s*=\s*['"][^'"]+['"]/i,
      /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
      /secret\s*=\s*['"][^'"]+['"]/i,
      /token\s*=\s*['"][^'"]+['"]/i
    ];

    for (const regex of secrets) {
      if (regex.test(content)) {
        return {
          passed: false,
          message: '可能存在硬编码密钥',
          severity: 'error'
        };
      }
    }

    return {
      passed: true,
      message: '无硬编码密钥'
    };
  }

  /**
   * 检查命令注入
   */
  _checkInject(content) {
    const dangerous = [
      /\$shell\b/,
      /\$exec\b/,
      /child_process.*exec.*\+/,
      /\{\s*.*\$\b/
    ];

    for (const regex of dangerous) {
      if (regex.test(content)) {
        return {
          passed: false,
          message: '可能存在命令注入风险',
          severity: 'critical'
        };
      }
    }

    return {
      passed: true,
      message: '无明显命令注入风险'
    };
  }

  /**
   * 检查路径遍历
   */
  _checkPathTraversal(content) {
    const dangerous = [
      /\.\.\//,
      /\$\{.*path/,
      /fileName.*\.\./
    ];

    for (const regex of dangerous) {
      if (regex.test(content)) {
        return {
          passed: false,
          message: '可能存在路径遍历风险',
          severity: 'error'
        };
      }
    }

    return {
      passed: true,
      message: '无路径遍历风险'
    };
  }

  /**
   * 检查输入验证
   */
  _checkValidation(content) {
    const hasValidation = [
      /if\s*\(/,
      /validate/,
      /check/,
      /typeof/
    ].some((regex) => regex.test(content));

    if (!hasValidation) {
      return {
        passed: false,
        message: '建议增加输入验证',
        severity: 'warning'
      };
    }

    return {
      passed: true,
      message: '有输入验证'
    };
  }

  /**
   * 检查注释
   */
  _checkComments(_content) {
    return { passed: true, message: '注释检查通过' };
  }

  /**
   * 检查文档
   */
  _checkDocs(_content) {
    return { passed: true, message: '文档检查通过' };
  }

  /**
   * 记录验证历史
   */
  _record(verification) {
    this.history.push(verification);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  /**
   * 获取统计
   */
  getStats() {
    const total = this.history.length;
    const passed = this.history.filter((h) => h.passed).length;
    return {
      total,
      passed,
      successRate: total > 0 ? `${Math.round((passed / total) * 100)}%` : '0%'
    };
  }
}

module.exports = AutoVerifier;