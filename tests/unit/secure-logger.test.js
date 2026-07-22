const { levels } = require('../../src/utils/SecureLogger');

describe('SecureLogger', () => {
  let logger;
  let originalLogLevel;

  beforeAll(() => {
    originalLogLevel = process.env.LOG_LEVEL;
  });

  beforeEach(() => {
    process.env.LOG_LEVEL = 'DEBUG';
    jest.resetModules();
    const fresh = require('../../src/utils/SecureLogger');
    logger = fresh.createLogger('test-module');
  });

  afterAll(() => {
    process.env.LOG_LEVEL = originalLogLevel;
  });

  describe('levels', () => {
    it('should have correct level values', () => {
      expect(levels.ERROR).toBe(0);
      expect(levels.WARN).toBe(1);
      expect(levels.INFO).toBe(2);
      expect(levels.DEBUG).toBe(3);
    });
  });

  describe('logger methods', () => {
    it('should provide error, warn, info, debug, audit methods', () => {
      expect(logger.error).toBeInstanceOf(Function);
      expect(logger.warn).toBeInstanceOf(Function);
      expect(logger.info).toBeInstanceOf(Function);
      expect(logger.debug).toBeInstanceOf(Function);
      expect(logger.audit).toBeInstanceOf(Function);
    });
  });

  describe('level gating', () => {
    it('should output when level is sufficient', () => {
      process.env.LOG_LEVEL = 'WARN';
      jest.resetModules();
      const lowLogger = require('../../src/utils/SecureLogger').createLogger('test');

      const spy = jest.spyOn(console, 'error').mockImplementation();
      lowLogger.error('test error');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should suppress DEBUG when level is INFO', () => {
      process.env.LOG_LEVEL = 'INFO';
      jest.resetModules();
      const infoLogger = require('../../src/utils/SecureLogger').createLogger('test');

      const spy = jest.spyOn(console, 'log').mockImplementation();
      infoLogger.debug('should not appear');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('format', () => {
    it('should produce JSON string', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      logger.info('hello');
      const call = JSON.parse(spy.mock.calls[0][0]);
      expect(call.level).toBe('INFO');
      expect(call.module).toBe('test-module');
      expect(call.message).toBe('hello');
      expect(call).toHaveProperty('timestamp');
      expect(call).toHaveProperty('pid');
      spy.mockRestore();
    });

    it('should include data when provided', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      logger.info('with data', { key: 'value' });
      const call = JSON.parse(spy.mock.calls[0][0]);
      expect(call.data).toEqual({ key: 'value' });
      spy.mockRestore();
    });
  });

  describe('audit', () => {
    it('should produce audit log entry', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      logger.audit('login', 'user1', { ip: '1.2.3.4' });
      const call = JSON.parse(spy.mock.calls[0][0]);
      expect(call.type).toBe('AUDIT');
      expect(call.action).toBe('login');
      expect(call.user).toBe('user1');
      spy.mockRestore();
    });

    it('should suppress audit when LOG_LEVEL is ERROR', () => {
      const originalLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'ERROR';
      jest.resetModules();
      const errLogger = require('../../src/utils/SecureLogger').createLogger('test');
      const spy = jest.spyOn(console, 'log').mockImplementation();
      errLogger.audit('login', 'user1', { ip: '1.2.3.4' });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
      process.env.LOG_LEVEL = originalLevel;
    });
  });

  describe('sanitize', () => {
    it('should redact sensitive data', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      logger.info('login', { password: 'mysecret123', apiKey: 'somekeyvalue' });
      const call = JSON.parse(spy.mock.calls[0][0]);
      expect(call.data.password).toBe('[REDACTED]');
      expect(call.data.apiKey).toBe('[REDACTED]');
      spy.mockRestore();
    });
  });

  describe('sanitize array and primitive', () => {
    it('should sanitize arrays inside data', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      logger.info('test', { items: ['a', { password: 'secret' }] });
      const call = JSON.parse(spy.mock.calls[0][0]);
      expect(call.data.items[0]).toBe('a');
      expect(call.data.items[1].password).toBe('[REDACTED]');
      spy.mockRestore();
    });

    it('should pass through non-string primitives', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      logger.info('test', { count: 42, active: true, score: null });
      const call = JSON.parse(spy.mock.calls[0][0]);
      expect(call.data.count).toBe(42);
      expect(call.data.active).toBe(true);
      expect(call.data.score).toBe(null);
      spy.mockRestore();
    });
  });

  describe('error level output', () => {
    it('should use console.error for ERROR level', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation();
      logger.error('critical');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should use console.warn for WARN level', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      logger.warn('caution');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
