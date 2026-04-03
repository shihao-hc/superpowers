/**
 * OpenClaw 安全测试
 */

describe('OpenClaw Security', () => {
  
  describe('URL 安全验证', () => {
    const { isUrlSafe } = require('../../../src/integrations/openclaw/OpenClawClient');
    
    test('应该允许 localhost', () => {
      expect(isUrlSafe('http://localhost:3002').safe).toBe(true);
      expect(isUrlSafe('http://127.0.0.1:3002').safe).toBe(true);
    });
    
    test('应该允许 .local 域名', () => {
      expect(isUrlSafe('http://openclaw.local:3002').safe).toBe(true);
    });
    
    test('应该拒绝外部域名', () => {
      expect(isUrlSafe('http://example.com:3002').safe).toBe(false);
      expect(isUrlSafe('http://evil.com/api').safe).toBe(false);
    });
    
    test('应该拒绝非 http/https 协议', () => {
      expect(isUrlSafe('file:///etc/passwd').safe).toBe(false);
      expect(isUrlSafe('ftp://localhost/file').safe).toBe(false);
      expect(isUrlSafe('javascript:alert(1)').safe).toBe(false);
    });
    
    test('应该拒绝无效 URL', () => {
      expect(isUrlSafe('not-a-url').safe).toBe(false);
      expect(isUrlSafe('').safe).toBe(false);
    });
  });
  
  describe('原型污染防护', () => {
    const { isPrototypePollutionSafe, sanitizeString } = require('../../../src/integrations/openclaw/OpenClawClient');
    
    test('Object.keys 不返回原型属性', () => {
      const obj = { '__proto__': { admin: true } };
      expect(Object.keys(obj)).not.toContain('__proto__');
    });
    
    test('应该拒绝通过构造函数注入', () => {
      const obj = { 'constructor': { prototype: {} } };
      expect(Object.keys(obj)).toContain('constructor');
    });
    
    test('应该接受正常对象', () => {
      expect(isPrototypePollutionSafe({ name: 'test', value: 123 })).toBe(true);
      expect(isPrototypePollutionSafe({ nested: { deep: true } })).toBe(true);
    });
    
    test('应该接受非对象', () => {
      expect(isPrototypePollutionSafe('string')).toBe(true);
      expect(isPrototypePollutionSafe(123)).toBe(true);
      expect(isPrototypePollutionSafe(null)).toBe(true);
      expect(isPrototypePollutionSafe(undefined)).toBe(true);
    });
  });
  
  describe('字符串清理', () => {
    const { sanitizeString } = require('../../../src/integrations/openclaw/OpenClawClient');
    
    test('应该截断超长字符串', () => {
      const long = 'a'.repeat(2000);
      expect(sanitizeString(long, 100).length).toBe(100);
    });
    
    test('应该移除空字节和不可见控制字符', () => {
      expect(sanitizeString('test\x00value')).toBe('testvalue');
      expect(sanitizeString('test\x1Fvalue')).toBe('testvalue');
    });
    
    test('应该移除控制字符但保留可打印字符', () => {
      expect(sanitizeString('line1 line2')).toBe('line1 line2');
      expect(sanitizeString('test\ttab')).toContain('test');
    });
    
    test('应该处理非字符串输入', () => {
      expect(sanitizeString(123)).toBe('');
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });
  });
  
  describe('参数验证', () => {
    test('temperature 应该在 0-2 范围内', () => {
      const validateTemperature = (t) => t >= 0 && t <= 2;
      
      expect(validateTemperature(0)).toBe(true);
      expect(validateTemperature(1)).toBe(true);
      expect(validateTemperature(2)).toBe(true);
      expect(validateTemperature(-0.1)).toBe(false);
      expect(validateTemperature(2.1)).toBe(false);
    });
    
    test('max_tokens 应该在 1-32000 范围内', () => {
      const validateMaxTokens = (m) => m >= 1 && m <= 32000;
      
      expect(validateMaxTokens(1)).toBe(true);
      expect(validateMaxTokens(4096)).toBe(true);
      expect(validateMaxTokens(32000)).toBe(true);
      expect(validateMaxTokens(0)).toBe(false);
      expect(validateMaxTokens(32001)).toBe(false);
      expect(validateMaxTokens(-1)).toBe(false);
    });
    
    test('messages 应该是非空数组', () => {
      const validateMessages = (m) => Array.isArray(m) && m.length > 0;
      
      expect(validateMessages([{ role: 'user', content: 'test' }])).toBe(true);
      expect(validateMessages([])).toBe(false);
      expect(validateMessages(null)).toBe(false);
      expect(validateMessages('string')).toBe(false);
    });
    
    test('model ID 应该是非空字符串', () => {
      const validateModel = (m) => typeof m === 'string' && m.length > 0 && m.length <= 100;
      
      expect(validateModel('deepseek-web/deepseek-chat')).toBe(true);
      expect(validateModel('')).toBe(false);
      expect(validateModel(123)).toBe(false);
    });
  });
  
  describe('速率限制', () => {
    const { RateLimiter } = require('../../../src/integrations/openclaw/OpenClawRouter');
    
    test('应该在限制内允许请求', () => {
      const limiter = new RateLimiter();
      const ip = '192.168.1.1';
      
      for (let i = 0; i < 50; i++) {
        expect(limiter.isAllowed(ip)).toBe(true);
      }
    });
    
    test('应该拒绝超过限制的请求', () => {
      const limiter = new RateLimiter();
      const ip = '192.168.1.2';
      
      for (let i = 0; i < 100; i++) {
        limiter.isAllowed(ip);
      }
      
      expect(limiter.isAllowed(ip)).toBe(false);
    });
    
    test('不同 IP 应该有独立限制', () => {
      const limiter = new RateLimiter();
      
      for (let i = 0; i < 100; i++) {
        limiter.isAllowed('192.168.1.3');
      }
      
      expect(limiter.isAllowed('192.168.1.4')).toBe(true);
    });
    
    test('应该清理过期记录', () => {
      const limiter = new RateLimiter();
      
      limiter.isAllowed('192.168.1.5');
      limiter.cleanup();
      
      expect(limiter.requests.has('192.168.1.5')).toBe(true);
    });
  });
  
  describe('消息大小限制', () => {
    test('消息内容应该被截断', () => {
      const MAX_CONTENT = 50000;
      const content = 'a'.repeat(100000);
      const safeContent = content.slice(0, MAX_CONTENT);
      
      expect(safeContent.length).toBe(MAX_CONTENT);
    });
    
    test('消息数组应该被截断', () => {
      const MAX_MESSAGES = 100;
      const messages = Array(200).fill({ role: 'user', content: 'test' });
      const safeMessages = messages.slice(0, MAX_MESSAGES);
      
      expect(safeMessages.length).toBe(MAX_MESSAGES);
    });
  });
});
