/**
 * OutputEncoder - 安全输出编码服务
 * 防止 XSS、HTML注入、特殊字符注入等安全问题
 */

class OutputEncoder {
  constructor() {
    // HTML 实体编码映射
    this.htmlEntities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
      '`': '&#96;',
      '=': '&#x3D;'
    };
    
    // JavaScript 字符串编码映射
    this.jsEntities = {
      '\\': '\\\\',
      '"': '\\"',
      "'": "\\'",
      '\n': '\\n',
      '\r': '\\r',
      '\t': '\\t',
      '\b': '\\b',
      '\f': '\\f'
    };
    
    // URL 编码选项
    this.urlAllowedChars = /^[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;
  }
  
  // HTML 编码 - 防止 XSS
  encodeHTML(input) {
    if (input === null || input === undefined) return '';
    if (typeof input !== 'string') return String(input);
    
    return input.replace(/[&<>"'`=/]/g, char => this.htmlEntities[char] || char);
  }
  
  // HTML 属性编码
  encodeHTMLAttribute(input) {
    if (input === null || input === undefined) return '';
    if (typeof input !== 'string') return String(input);
    
    return input.replace(/[&<>"'`=]/g, char => this.htmlEntities[char] || char);
  }
  
  // JavaScript 编码
  encodeJavaScript(input) {
    if (input === null || input === undefined) return '';
    if (typeof input !== 'string') return String(input);
    
    let result = '';
    for (const char of input) {
      result += this.jsEntities[char] || char;
    }
    return result;
  }
  
  // URL 编码
  encodeURL(input, strict = false) {
    if (input === null || input === undefined) return '';
    if (typeof input !== 'string') return String(input);
    
    if (strict) {
      return encodeURIComponent(input);
    }
    
    // 允许部分 URL 字符
    if (this.urlAllowedChars.test(input)) {
      return input;
    }
    
    return encodeURIComponent(input);
  }
  
  // CSS 编码
  encodeCSS(input) {
    if (input === null || input === undefined) return '';
    if (typeof input !== 'string') return String(input);
    
    // 移除可能导致 CSS 注入的字符
    return input.replace(/[<>"'();\\]/g, char => {
      return '\\' + char.charCodeAt(0).toString(16) + ' ';
    });
  }
  
  // 文本净化 - 移除危险标签
  sanitizeText(input, allowedTags = []) {
    if (input === null || input === undefined) return '';
    if (typeof input !== 'string') return String(input);
    
    // 默认允许的标签
    const defaultAllowed = ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li'];
    const tags = allowedTags.length > 0 ? allowedTags : defaultAllowed;
    
    // 移除所有 HTML 标签除非在允许列表中
    let result = input;
    const tagRegex = /<(\/?)(\w+)[^>]*>/gi;
    
    result = result.replace(tagRegex, (match, isClosing, tagName) => {
      const lowerTag = tagName.toLowerCase();
      if (tags.includes(lowerTag)) {
        return match;
      }
      return '';
    });
    
    // 移除事件处理器
    result = result.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
    result = result.replace(/\s*on\w+\s*=\s*[^\s>]+/gi, '');
    
    return result;
  }
  
  // JSON 安全序列化
  safeStringify(obj, space = 0) {
    const seen = new WeakSet();
    
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'string') {
        return this.encodeHTML(value);
      }
      
      if (typeof value === 'function') {
        return '[Function]';
      }
      
      if (value && typeof value === 'object') {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      
      return value;
    }, space);
  }
  
  // 多层编码 - 用于不同上下文
  encodeMulti(input, contexts = ['html']) {
    let result = input;
    
    for (const context of contexts) {
      switch (context) {
        case 'html':
          result = this.encodeHTML(result);
          break;
        case 'js':
          result = this.encodeJavaScript(result);
          break;
        case 'url':
          result = this.encodeURL(result);
          break;
        case 'css':
          result = this.encodeCSS(result);
          break;
        case 'attr':
          result = this.encodeHTMLAttribute(result);
          break;
      }
    }
    
    return result;
  }
}

// 导出单例
const outputEncoder = new OutputEncoder();

module.exports = { OutputEncoder, outputEncoder };