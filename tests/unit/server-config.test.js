/**
 * server/config 单元测试
 * 覆盖: mergeConfig, get, set, getAll, reset, validate, loadFromEnv
 */

const path = require('path');

// 保存原始环境变量
const originalEnv = { ...process.env };

const configPath = path.join(__dirname, '..', '..', 'server', 'config');

function freshConfig() {
  jest.resetModules();
  return require(configPath);
}

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
});

describe('server/config', () => {
  describe('get', () => {
    test('gets top-level config', () => {
      const config = freshConfig();
      expect(config.get('server.port')).toBe(3000);
    });

    test('gets nested config with dot notation', () => {
      const config = freshConfig();
      expect(config.get('security.jwtExpiresIn')).toBe('15m');
    });

    test('gets deeply nested config', () => {
      const config = freshConfig();
      expect(config.get('rateLimit.max.api')).toBe(100);
    });

    test('returns default for missing key', () => {
      const config = freshConfig();
      expect(config.get('nonexistent.key', 'fallback')).toBe('fallback');
    });

    test('returns null for missing key without default', () => {
      const config = freshConfig();
      expect(config.get('nonexistent.key')).toBeNull();
    });

    test('returns default for partial missing path', () => {
      const config = freshConfig();
      expect(config.get('server.nonexistent.nested', 42)).toBe(42);
    });
  });

  describe('set', () => {
    test('sets a simple value', () => {
      const config = freshConfig();
      config.set('server.port', 8080);
      expect(config.get('server.port')).toBe(8080);
    });

    test('sets a nested value', () => {
      const config = freshConfig();
      config.set('security.jwtExpiresIn', '30m');
      expect(config.get('security.jwtExpiresIn')).toBe('30m');
    });

    test('creates intermediate objects if path does not exist', () => {
      const config = freshConfig();
      config.set('new.nested.path', 'value');
      expect(config.get('new.nested.path')).toBe('value');
    });

    test('overwrites non-object with object if needed', () => {
      const config = freshConfig();
      config.set('server.port', 'not-a-number');
      config.set('server.port.nested', 'deep');
      expect(config.get('server.port.nested')).toBe('deep');
    });
  });

  describe('getAll', () => {
    test('returns a copy of the full config', () => {
      const config = freshConfig();
      const all = config.getAll();
      expect(all).toHaveProperty('server');
      expect(all).toHaveProperty('security');
      expect(all).toHaveProperty('rateLimit');
      expect(all).toHaveProperty('websocket');
      expect(all).toHaveProperty('ollama');
      expect(all).toHaveProperty('database');
      expect(all).toHaveProperty('frontend');
      expect(all).toHaveProperty('logging');
    });

    test('returned object is a copy, not reference', () => {
      const config = freshConfig();
      const all = config.getAll();
      all.server.port = 9999;
      expect(config.get('server.port')).not.toBe(9999);
    });
  });

  describe('reset', () => {
    test('restores config to defaults after set', () => {
      const config = freshConfig();
      config.set('server.port', 9999);
      expect(config.get('server.port')).toBe(9999);
      config.reset();
      expect(config.get('server.port')).toBe(3000);
    });

    test('re-applies env vars after reset', () => {
      process.env.PORT = '4000';
      const config = freshConfig();
      config.set('server.port', 9999);
      config.reset();
      expect(config.get('server.port')).toBe(4000);
    });
  });

  describe('validate', () => {
    test('valid config returns valid: true', () => {
      const config = freshConfig();
      const result = config.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('invalid port returns error', () => {
      const config = freshConfig();
      config.set('server.port', 0);
      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('服务器端口必须在1-65535之间');
    });

    test('port > 65535 returns error', () => {
      const config = freshConfig();
      config.set('server.port', 70000);
      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('服务器端口必须在1-65535之间');
    });

    test('production with short JWT_SECRET returns error', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const config = freshConfig();
      config.set('security.jwtSecret', 'short');
      const result = config.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('JWT_SECRET'))).toBe(true);
      process.env.NODE_ENV = originalNodeEnv;
    });

    test('production with empty JWT_SECRET returns error', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const config = freshConfig();
      config.set('security.jwtSecret', '');
      const result = config.validate();
      expect(result.valid).toBe(false);
      process.env.NODE_ENV = originalNodeEnv;
    });

    test('non-production with short JWT_SECRET is allowed', () => {
      process.env.NODE_ENV = 'development';
      const config = freshConfig();
      config.set('security.jwtSecret', 'short');
      const result = config.validate();
      expect(result.valid).toBe(true);
    });
  });

  describe('loadFromEnv', () => {
    test('loads PORT from env', () => {
      process.env.PORT = '5000';
      const config = freshConfig();
      config.reset();
      expect(config.get('server.port')).toBe(5000);
    });

    test('loads HOST from env', () => {
      process.env.HOST = '127.0.0.1';
      const config = freshConfig();
      config.reset();
      expect(config.get('server.host')).toBe('127.0.0.1');
    });

    test('TRUST_PROXY=true enables trust proxy', () => {
      process.env.TRUST_PROXY = 'true';
      const config = freshConfig();
      config.reset();
      expect(config.get('server.trustProxy')).toBe(true);
    });

    test('TRUST_PROXY=false disables trust proxy', () => {
      process.env.TRUST_PROXY = 'false';
      const config = freshConfig();
      config.reset();
      expect(config.get('server.trustProxy')).toBe(false);
    });

    test('JWT_SECRET from env overrides generateSecureSecret', () => {
      process.env.JWT_SECRET = 'my-super-secret-key-with-32-chars!!';
      const config = freshConfig();
      config.reset();
      expect(config.get('security.jwtSecret')).toBe('my-super-secret-key-with-32-chars!!');
    });

    test('PORT=NaN falls back to default 3000', () => {
      process.env.PORT = 'not-a-number';
      const config = freshConfig();
      config.reset();
      expect(config.get('server.port')).toBe(3000);
    });
  });

  describe('env-driven CORS origins', () => {
    test('ALLOWED_ORIGINS env var sets corsOrigins', () => {
      process.env.ALLOWED_ORIGINS = 'https://a.com,https://b.com';
      // 必须在 require 之前设置，因为 defaultConfig.corsOrigins 在模块加载时求值
      const config = freshConfig();
      expect(config.get('security.corsOrigins')).toEqual(['https://a.com', 'https://b.com']);
    });

    test('no ALLOWED_ORIGINS uses default origins', () => {
      delete process.env.ALLOWED_ORIGINS;
      const config = freshConfig();
      expect(config.get('security.corsOrigins')).toContain('http://localhost:3000');
    });
  });
});
