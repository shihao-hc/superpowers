/**
 * EnhancedInputValidator - 增强输入验证服务
 * 提供全面的输入验证、净化和安全检查
 */

class EnhancedInputValidator {
  constructor() {
    // 验证规则配置
    this.rules = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      url: /^https?:\/\/[^\s]+$/i,
      phone: /^\+?[\d\s\-()]{10,20}$/,
      ipv4: /^(\d{1,3}\.){3}\d{1,3}$/,
      ipv6: /^([\da-f]{1,4}:){7}[\da-f]{1,4}$/i,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      alphanumeric: /^[a-zA-Z0-9]+$/,
      numeric: /^\d+$/,
      alpha: /^[a-zA-Z]+$/
    };
    
    // 危险模式检测
    this.dangerousPatterns = [
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      /javascript\s*:/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi,
      /data:\s*text\/html/gi,
      /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
      /<\/?[\w]+[\s>]/g,
      /\$\{[^}]+\}/g,
      /<%[^>]+%>/g
    ];
    
    // SQL 注入模式
    this.sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
      /(\b(UNION|INTERSECT|MINUS)\b)/i,
      /(;\s*\w+\s*=)/i,
      /(--|#|\/\*|\*\/)/,
      /('s*='s*')/i,
      /('s*ORs*'?\d*'?=s*'?d)/i,
      /(INTOs+(OUT|DUMP)FILE)/i
    ];
    
    // 路径遍历模式
    this.pathTraversalPatterns = [
      /\.\.\//gi,
      /\.\.\\/gi,
      /%2e%2e/gi,
      /%252e%252e/gi,
      /\/etc\/passwd/gi,
      /\/etc\/shadow/gi,
      /c:\\windows/gi
    ];
    
    // 命令注入模式
    this.commandInjectionPatterns = [
      /[;&|`$]/,
      /\|\s*\w+/,
      /&&\s*\w+/,
      /\$[\w{]/,
      /\`[^\`]+\`/,
      /\|\|/,
      /;\s*rm\s+-rf/i,
      /;\s*del\s+/i,
      /\s*>\s*\/dev\//i
    ];
  }
  
  // 验证并净化输入
  validate(input, type = 'text', options = {}) {
    const result = {
      valid: true,
      value: input,
      errors: [],
      warnings: [],
      sanitized: null
    };
    
    // 空值检查
    if (input === null || input === undefined) {
      if (options.required) {
        result.valid = false;
        result.errors.push('Input is required');
      }
      return result;
    }
    
    // 转换为字符串
    const strInput = String(input);
    
    // 类型特定验证
    if (type !== 'text' && this.rules[type]) {
      if (!this.rules[type].test(strInput)) {
        result.valid = false;
        result.errors.push(`Invalid ${type} format`);
      }
    }
    
    // 长度检查
    if (options.minLength && strInput.length < options.minLength) {
      result.valid = false;
      result.errors.push(`Minimum length is ${options.minLength}`);
    }
    
    if (options.maxLength && strInput.length > options.maxLength) {
      result.warnings.push(`Truncated to ${options.maxLength} characters`);
      result.value = strInput.substring(0, options.maxLength);
    }
    
    // 危险模式检测
    if (options.checkDangerous !== false) {
      const dangerousCheck = this.checkDangerousPatterns(strInput);
      if (dangerousCheck.dangerous) {
        result.valid = false;
        result.errors.push(...dangerousCheck.matches);
      }
    }
    
    // SQL 注入检测
    if (options.checkSQL !== false) {
      const sqlCheck = this.checkSQLInjection(strInput);
      if (sqlCheck.dangerous) {
        result.valid = false;
        result.errors.push(...sqlCheck.matches);
      }
    }
    
    // 路径遍历检测
    if (options.checkPathTraversal !== false) {
      const pathCheck = this.checkPathTraversal(strInput);
      if (pathCheck.dangerous) {
        result.valid = false;
        result.errors.push(...pathCheck.matches);
      }
    }
    
    // 净化输入
    if (result.valid) {
      result.sanitized = this.sanitize(strInput, options.sanitizeOptions);
    }
    
    return result;
  }
  
  // 检查危险模式
  checkDangerousPatterns(input) {
    const matches = [];
    for (const pattern of this.dangerousPatterns) {
      const found = input.match(pattern);
      if (found) {
        matches.push(`Dangerous pattern found: ${found[0].substring(0, 30)}...`);
      }
    }
    return {
      dangerous: matches.length > 0,
      matches
    };
  }
  
  // 检查 SQL 注入
  checkSQLInjection(input) {
    const matches = [];
    for (const pattern of this.sqlPatterns) {
      const found = input.match(pattern);
      if (found) {
        matches.push(`SQL pattern detected: ${found[0].substring(0, 30)}...`);
      }
    }
    return {
      dangerous: matches.length > 0,
      matches
    };
  }
  
  // 检查路径遍历
  checkPathTraversal(input) {
    const matches = [];
    for (const pattern of this.pathTraversalPatterns) {
      const found = input.match(pattern);
      if (found) {
        matches.push(`Path traversal detected: ${found[0].substring(0, 30)}...`);
      }
    }
    return {
      dangerous: matches.length > 0,
      matches
    };
  }
  
  // 检查命令注入
  checkCommandInjection(input) {
    for (const pattern of this.commandInjectionPatterns) {
      if (pattern.test(input)) {
        return { dangerous: true, pattern: pattern.toString() };
      }
    }
    return { dangerous: false };
  }
  
  // 净化输入
  sanitize(input, options = {}) {
    let result = String(input);
    
    // 移除 NULL 字节
    result = result.replace(/\x00/g, '');
    
    // 移除控制字符 (保留换行和制表符)
    if (!options.preserveWhitespace) {
      result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }
    
    // 移除 HTML 标签 (除非允许)
    if (!options.allowHTML) {
      result = result.replace(/<[^>]*>/g, '');
    }
    
    // 移除事件处理器
    result = result.replace(/\s*on\w+\s*=/gi, '');
    
    // 移除 JavaScript 协议
    result = result.replace(/javascript:/gi, '');
    result = result.replace(/data:/gi, '');
    
    // 截断过长输入
    if (options.maxLength && result.length > options.maxLength) {
      result = result.substring(0, options.maxLength);
    }
    
    return result;
  }
  
  // 批量验证
  validateBatch(inputs, type = 'text', options = {}) {
    return inputs.map((input, index) => ({
      index,
      ...this.validate(input, type, options)
    }));
  }
  
  // 创建验证中间件
  createMiddleware(type = 'text', options = {}) {
    return (req, res, next) => {
      const body = req.body;
      const errors = [];
      
      for (const [key, value] of Object.entries(body)) {
        const result = this.validate(value, type, options);
        if (!result.valid) {
          errors.push({ field: key, errors: result.errors });
        } else if (result.sanitized !== null) {
          req.body[key] = result.sanitized;
        }
      }
      
      if (errors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
      }
      
      next();
    };
  }
}

const validator = new EnhancedInputValidator();

module.exports = { EnhancedInputValidator, validator };