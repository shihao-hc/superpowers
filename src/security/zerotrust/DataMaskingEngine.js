/**
 * Data Masking Engine
 * 实时数据脱敏引擎
 */

const crypto = require('crypto');

class DataMaskingEngine {
  constructor() {
    this.rules = new Map();
    this.patterns = new Map();
    
    this._initDefaultPatterns();
    this._initDefaultRules();
  }

  _initDefaultPatterns() {
    // 预定义敏感数据模式
    const patterns = {
      'email': /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      'phone': /(\+?86)?[-.\s]?1[3-9]\d{9}/g,
      'id-card': /\b[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
      'credit-card': /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
      'ssn': /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
      'bank-account': /\b\d{10,20}\b/g,
      'ip-address': /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      'medical-record': /\bMRN[:\s]*\d{8,}\b/gi,
      'passport': /\b[A-Z]{1,2}\d{6,9}\b/g,
      'password': /password\s*[=:]\s*["']?[^"'\s]+["']?/gi,
      'api-key': /api[_-]?key\s*[=:]\s*["']?[a-zA-Z0-9]{20,}["']?/gi,
      'name': /([A-Z][a-z]+\s+[A-Z][a-z]+)/g,
      'address': /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Dr|Drive)/gi
    };

    for (const [name, regex] of Object.entries(patterns)) {
      this.patterns.set(name, regex);
    }
  }

  _initDefaultRules() {
    // 默认脱敏规则
    const rules = [
      {
        id: 'pii-email',
        name: '邮箱脱敏',
        pattern: 'email',
        type: 'partial',
        replacement: (match) => {
          const [local, domain] = match.split('@');
          const masked = local[0] + '***' + (local.length > 4 ? local.slice(-2) : '');
          return `${masked}@${domain}`;
        }
      },
      {
        id: 'pii-phone',
        name: '手机号脱敏',
        pattern: 'phone',
        type: 'partial',
        replacement: (match) => {
          return match.replace(/\d(?=\d{4})/g, '*');
        }
      },
      {
        id: 'pii-id-card',
        name: '身份证脱敏',
        pattern: 'id-card',
        type: 'partial',
        replacement: (match) => {
          return match.slice(0, 6) + '********' + match.slice(-4);
        }
      },
      {
        id: 'pii-credit-card',
        name: '信用卡脱敏',
        pattern: 'credit-card',
        type: 'full',
        replacement: (match) => {
          return '**** **** **** ' + match.replace(/[-\s]/g, '').slice(-4);
        }
      },
      {
        id: 'pii-ssn',
        name: 'SSN脱敏',
        pattern: 'ssn',
        type: 'full',
        replacement: (match) => {
          return '***-**-' + match.replace(/[-\s]/g, '').slice(-4);
        }
      },
      {
        id: 'pii-password',
        name: '密码脱敏',
        pattern: 'password',
        type: 'full',
        replacement: () => '[REDACTED]'
      },
      {
        id: 'pii-api-key',
        name: 'API密钥脱敏',
        pattern: 'api-key',
        type: 'full',
        replacement: () => '[API_KEY_REDACTED]'
      }
    ];

    for (const rule of rules) {
      this.rules.set(rule.id, rule);
    }
  }

  // 添加自定义规则
  addRule(rule) {
    this.rules.set(rule.id, {
      ...rule,
      createdAt: Date.now()
    });
  }

  // 脱敏文本
  mask(data, options = {}) {
    const { rules = [], preserveOriginal = false } = options;
    
    if (typeof data === 'string') {
      return this._maskString(data, rules, preserveOriginal);
    }
    
    if (typeof data === 'object' && data !== null) {
      return this._maskObject(data, rules, preserveOriginal);
    }
    
    return data;
  }

  _maskString(str, ruleIds, preserveOriginal) {
    let result = str;
    const masks = [];

    const rulesToApply = ruleIds.length > 0 
      ? ruleIds.map(id => this.rules.get(id)).filter(Boolean)
      : Array.from(this.rules.values());

    for (const rule of rulesToApply) {
      const pattern = this.patterns.get(rule.pattern);
      if (!pattern) continue;

      const regex = new RegExp(pattern.source, pattern.flags);
      
      result = result.replace(regex, (match) => {
        masks.push({
          rule: rule.id,
          original: preserveOriginal ? match : undefined,
          masked: rule.replacement(match),
          position: arguments[arguments.length - 2]
        });
        return rule.replacement(match);
      });
    }

    return {
      masked: result,
      masks
    };
  }

  _maskObject(obj, ruleIds, preserveOriginal) {
    const masked = {};
    const allMasks = [];

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        const result = this._maskString(value, ruleIds, preserveOriginal);
        masked[key] = result.masked;
        allMasks.push(...result.masks.map(m => ({ ...m, field: key })));
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this._maskObject(value, ruleIds, preserveOriginal);
      } else {
        masked[key] = value;
      }
    }

    return { masked, masks: allMasks };
  }

  // 上下文感知脱敏
  maskWithContext(data, context) {
    const { userRole, dataSource, regulation = [] } = context;
    
    const appliedRules = [];
    
    // 根据角色应用规则
    if (userRole === 'admin') {
      // 管理员可以看完整数据
      return { masked: data, rulesApplied: [] };
    }
    
    if (userRole === 'analyst') {
      // 分析师可以看到聚合数据
      appliedRules.push(...['pii-email', 'pii-phone']);
    }
    
    // 根据数据来源应用规则
    if (dataSource === 'medical') {
      appliedRules.push('pii-id-card', 'medical-record');
    }
    
    // 根据法规应用规则
    if (regulation.includes('HIPAA')) {
      appliedRules.push('medical-record', 'ssn');
    }
    
    if (regulation.includes('GDPR')) {
      appliedRules.push('pii-email', 'pii-phone', 'pii-id-card');
    }

    return this.mask(data, { rules: [...new Set(appliedRules)] });
  }

  // 验证脱敏效果
  validateMasking(data, originalData) {
    const issues = [];
    
    // 检查是否还有原始敏感数据泄露
    const sensitivePatterns = [
      { name: 'email', pattern: this.patterns.get('email') },
      { name: 'phone', pattern: this.patterns.get('phone') },
      { name: 'credit-card', pattern: this.patterns.get('credit-card') },
      { name: 'ssn', pattern: this.patterns.get('ssn') }
    ];
    
    for (const { name, pattern } of sensitivePatterns) {
      const matches = data.match(pattern);
      if (matches) {
        issues.push({
          severity: 'high',
          type: 'sensitive_data_exposure',
          pattern: name,
          occurrences: matches.length,
          sample: matches[0]
        });
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
      score: Math.max(0, 100 - issues.length * 25)
    };
  }

  // 加密敏感字段
  encrypt(data, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  // 解密敏感字段
  decrypt(encryptedData, key) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'hex'),
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // 生成脱敏报告
  generateReport(data, options = {}) {
    const { includeSamples = false } = options;
    
    const result = this.mask(data, { preserveOriginal: includeSamples });
    
    const byRule = {};
    for (const mask of result.masks) {
      if (!byRule[mask.rule]) {
        byRule[mask.rule] = { count: 0, positions: [] };
      }
      byRule[mask.rule].count++;
      byRule[mask.rule].positions.push(mask.position);
    }

    return {
      totalMasks: result.masks.length,
      byRule: Object.entries(byRule).map(([rule, data]) => ({
        rule,
        count: data.count,
        positions: data.positions.slice(0, 10) // 最多10个样本位置
      })),
      validation: this.validateMasking(result.masked, data)
    };
  }
}

// 预定义脱敏模板
const MASKING_TEMPLATES = {
  'hipaa': {
    name: 'HIPAA合规脱敏',
    rules: ['pii-id-card', 'pii-ssn', 'medical-record'],
    description: '移除所有PHI相关的识别信息'
  },
  'gdpr': {
    name: 'GDPR合规脱敏',
    rules: ['pii-email', 'pii-phone', 'pii-id-card', 'pii-password'],
    description: '移除欧盟个人数据保护条例要求的PII'
  },
  'financial': {
    name: '金融数据脱敏',
    rules: ['pii-credit-card', 'pii-ssn', 'bank-account'],
    description: '移除金融敏感信息'
  },
  'minimal': {
    name: '最小化脱敏',
    rules: ['pii-email', 'pii-phone'],
    description: '仅脱敏最常见的联系方式'
  }
};

module.exports = { DataMaskingEngine, MASKING_TEMPLATES };
