/**
 * Unit Tests for UltraWorkUtils
 * 测试统一工具类库的各项功能
 */

const UltraWorkUtils = require('../../src/utils/UltraWorkUtils');

describe('UltraWorkUtils', () => {
  beforeEach(() => {
    // 测试前的准备工作
  });

  afterEach(() => {
    // 测试后的清理工作
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      expect(UltraWorkUtils.escapeHtml(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(UltraWorkUtils.escapeHtml('')).toBe('');
      expect(UltraWorkUtils.escapeHtml(null)).toBe('');
      expect(UltraWorkUtils.escapeHtml(undefined)).toBe('');
    });

    it('should escape all special characters', () => {
      const input = '& < > " \'';
      const output = UltraWorkUtils.escapeHtml(input);
      expect(output).toContain('&amp;');
      expect(output).toContain('&lt;');
      expect(output).toContain('&gt;');
      expect(output).toContain('&quot;');
      expect(output).toContain('&#x27;');
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const input = '{"name": "test", "value": 123}';
      const result = UltraWorkUtils.safeJsonParse(input);
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should return default value for invalid JSON', () => {
      const input = 'invalid json';
      const result = UltraWorkUtils.safeJsonParse(input, { default: true });
      expect(result).toEqual({ default: true });
    });

    it('should prevent prototype pollution', () => {
      const input = '{"__proto__": {"admin": true}}';
      const result = UltraWorkUtils.safeJsonParse(input);
      expect(result.admin).toBeUndefined();
      expect(Object.getPrototypeOf(result)).toBeNull();
    });
  });

  describe('escapeRegex', () => {
    it('should escape regex special characters', () => {
      const input = '.*+?^${}()|[]\\';
      const output = UltraWorkUtils.escapeRegex(input);
      expect(output).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });

    it('should handle empty string', () => {
      expect(UltraWorkUtils.escapeRegex('')).toBe('');
    });
  });

  describe('InputValidator', () => {
    describe('validateEmail', () => {
      it('should validate correct email', () => {
        expect(UltraWorkUtils.InputValidator.validateEmail('test@example.com')).toBe(true);
        expect(UltraWorkUtils.InputValidator.validateEmail('user.name@domain.co')).toBe(true);
      });

      it('should reject invalid email', () => {
        expect(UltraWorkUtils.InputValidator.validateEmail('invalid')).toBe(false);
        expect(UltraWorkUtils.InputValidator.validateEmail('@domain.com')).toBe(false);
        expect(UltraWorkUtils.InputValidator.validateEmail('user@')).toBe(false);
      });
    });

    describe('validateUrl', () => {
      it('should validate correct URL', () => {
        expect(UltraWorkUtils.InputValidator.validateUrl('https://example.com')).toBe(true);
        expect(UltraWorkUtils.InputValidator.validateUrl('http://localhost:3000')).toBe(true);
      });

      it('should reject invalid URL', () => {
        expect(UltraWorkUtils.InputValidator.validateUrl('not a url')).toBe(false);
        expect(UltraWorkUtils.InputValidator.validateUrl('')).toBe(false);
      });
    });

    describe('validateStringLength', () => {
      it('should validate string length', () => {
        expect(UltraWorkUtils.InputValidator.validateStringLength('test', 1, 10)).toBe(true);
        expect(UltraWorkUtils.InputValidator.validateStringLength('test', 5, 10)).toBe(false);
        expect(UltraWorkUtils.InputValidator.validateStringLength('test', 1, 3)).toBe(false);
      });
    });
  });

  describe('TimerManager', () => {
    let timerManager;

    beforeEach(() => {
      timerManager = new UltraWorkUtils.TimerManager();
    });

    afterEach(() => {
      timerManager.cleanup();
    });

    it('should track active timers', () => {
      timerManager.setTimeout(() => {}, 1000);
      timerManager.setInterval(() => {}, 1000);
      
      const stats = timerManager.getStats();
      expect(stats.total).toBe(2);
    });

    it('should cleanup all timers', () => {
      let count = 0;
      timerManager.setInterval(() => { count++; }, 10);
      timerManager.setTimeout(() => { count++; }, 10);
      
      timerManager.cleanup();
      
      const stats = timerManager.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('EnhancedEventBus', () => {
    let eventBus;

    beforeEach(() => {
      eventBus = new UltraWorkUtils.EnhancedEventBus();
    });

    it('should emit and receive events', () => {
      let received = false;
      eventBus.on('test', () => { received = true; });
      eventBus.emit('test');
      
      expect(received).toBe(true);
    });

    it('should support once listeners', () => {
      let count = 0;
      eventBus.once('test', () => { count++; });
      
      eventBus.emit('test');
      eventBus.emit('test');
      
      expect(count).toBe(1);
    });

    it('should remove listeners', () => {
      let count = 0;
      const unsubscribe = eventBus.on('test', () => { count++; });
      
      eventBus.emit('test');
      unsubscribe();
      eventBus.emit('test');
      
      expect(count).toBe(1);
    });

    it('should track event history', () => {
      eventBus.emit('event1', { data: 1 });
      eventBus.emit('event2', { data: 2 });
      
      const history = eventBus.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].event).toBe('event1');
      expect(history[1].event).toBe('event2');
    });
  });

  describe('ErrorHandler', () => {
    it('should handle errors', () => {
      const error = new Error('Test error');
      const result = UltraWorkUtils.ErrorHandler.handle(error, 'test-context');
      
      expect(result.message).toBe('Test error');
      expect(result.context).toBe('test-context');
      expect(result.timestamp).toBeDefined();
    });

    it('should wrap async functions', async () => {
      const asyncFn = async () => { throw new Error('Async error'); };
      const wrapped = UltraWorkUtils.ErrorHandler.wrapAsync(asyncFn, 'async-test');
      
      await expect(wrapped()).rejects.toThrow('Async error');
    });

    it('should wrap sync functions', () => {
      const syncFn = () => { throw new Error('Sync error'); };
      const wrapped = UltraWorkUtils.ErrorHandler.wrapSync(syncFn, 'sync-test');
      
      expect(() => wrapped()).toThrow('Sync error');
    });
  });

  describe('RetryHandler', () => {
    it('should retry failed operations', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) throw new Error('Not yet');
        return 'success';
      };
      
      const result = await UltraWorkUtils.RetryHandler.retry(fn, {
        maxAttempts: 5,
        delay: 10
      });
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should fail after max attempts', async () => {
      const fn = async () => { throw new Error('Always fails'); };
      
      await expect(
        UltraWorkUtils.RetryHandler.retry(fn, { maxAttempts: 2, delay: 10 })
      ).rejects.toThrow('Always fails');
    });
  });

  describe('ConfigManager', () => {
    let configManager;

    beforeEach(() => {
      configManager = new UltraWorkUtils.ConfigManager({
        debug: false,
        timeout: 5000
      });
    });

    it('should get config values', () => {
      expect(configManager.get('debug')).toBe(false);
      expect(configManager.get('timeout')).toBe(5000);
      expect(configManager.get('missing', 'default')).toBe('default');
    });

    it('should set config values', () => {
      configManager.set('debug', true);
      expect(configManager.get('debug')).toBe(true);
    });

    it('should notify watchers', () => {
      let watchedValue = null;
      let oldValue = null;
      
      configManager.watch('debug', (newValue, oldVal) => {
        watchedValue = newValue;
        oldValue = oldVal;
      });
      
      configManager.set('debug', true);
      
      expect(watchedValue).toBe(true);
      expect(oldValue).toBe(false);
    });

    it('should update multiple values', () => {
      configManager.update({
        debug: true,
        timeout: 10000
      });
      
      expect(configManager.get('debug')).toBe(true);
      expect(configManager.get('timeout')).toBe(10000);
    });

    it('should get all config', () => {
      const all = configManager.getAll();
      expect(all).toEqual({
        debug: false,
        timeout: 5000
      });
    });

    it('should reset config', () => {
      configManager.set('newKey', 'newValue');
      configManager.reset();
      
      expect(configManager.get('newKey')).toBeNull();
      expect(configManager.get('debug')).toBeNull();
    });
  });
});