'use strict';

const { APIMarket } = require('../../src/agent/APIMarket');

describe('APIMarket', () => {
  let market;

  beforeEach(() => {
    market = new APIMarket();
  });

  describe('constructor', () => {
    it('should set default values', () => {
      expect(market.services).toBeInstanceOf(Map);
      expect(market.apiKeys).toBeInstanceOf(Map);
      expect(market.usageStats).toBeInstanceOf(Map);
      expect(market.rateLimits).toBeInstanceOf(Map);
      expect(market.defaultRateLimit).toEqual({ requests: 100, window: 60000 });
      expect(market.pricing).toEqual({});
    });

    it('should accept custom options', () => {
      const custom = new APIMarket({
        defaultRateLimit: { requests: 50, window: 30000 },
        pricing: { translation: 5 }
      });
      expect(custom.defaultRateLimit).toEqual({ requests: 50, window: 30000 });
      expect(custom.pricing).toEqual({ translation: 5 });
    });
  });

  describe('registerService', () => {
    it('should register a service with all fields', () => {
      const svc = market.registerService('translate', {
        name: 'Translation',
        description: 'Text translation',
        endpoint: '/api/translate',
        method: 'POST',
        params: ['text', 'lang'],
        price: 2,
        currency: 'credits',
        version: '2.0'
      });

      expect(svc.id).toBe('translate');
      expect(svc.name).toBe('Translation');
      expect(svc.description).toBe('Text translation');
      expect(svc.endpoint).toBe('/api/translate');
      expect(svc.method).toBe('POST');
      expect(svc.params).toEqual(['text', 'lang']);
      expect(svc.price).toBe(2);
      expect(svc.currency).toBe('credits');
      expect(svc.version).toBe('2.0');
      expect(svc.status).toBe('active');
      expect(typeof svc.createdAt).toBe('number');
      expect(svc.usageCount).toBe(0);
      expect(svc.lastUsed).toBeNull();

      expect(market.services.get('translate')).toBe(svc);
    });

    it('should use defaults for optional fields', () => {
      const svc = market.registerService('basic', { name: 'Basic' });
      expect(svc.method).toBe('POST');
      expect(svc.params).toEqual([]);
      expect(svc.price).toBe(0);
      expect(svc.currency).toBe('credits');
      expect(svc.version).toBe('1.0');
    });
  });

  describe('registerTemplateAsService', () => {
    it('should create service from template', () => {
      const template = {
        key: 'ocr',
        name: 'OCR Service',
        description: 'Image text extraction',
        params: ['image']
      };

      const svc = market.registerTemplateAsService(template);
      expect(svc.id).toBe('svc_ocr');
      expect(svc.name).toBe('OCR Service');
      expect(svc.endpoint).toBe('/api/market/svc_ocr');
      expect(svc.params).toEqual(['image']);
    });

    it('should use pricing config for template', () => {
      const priced = new APIMarket({ pricing: { ocr: 10 } });
      const svc = priced.registerTemplateAsService({ key: 'ocr', name: 'OCR', params: [] });
      expect(svc.price).toBe(10);
    });

    it('should default to price 1 when pricing not configured', () => {
      const svc = market.registerTemplateAsService({ key: 'ocr', name: 'OCR', params: [] });
      expect(svc.price).toBe(1);
    });
  });

  describe('createAPIKey', () => {
    it('should create an API key with defaults', () => {
      const result = market.createAPIKey('test-key');
      expect(result.id).toMatch(/^key_/);
      expect(result.key).toMatch(/^sk_/);
      expect(result.name).toBe('test-key');
      expect(result.credits).toBe(100);

      const keyData = market.apiKeys.get(result.key);
      expect(keyData).toBeDefined();
      expect(keyData.status).toBe('active');
      expect(keyData.permissions.services).toEqual(['*']);
      expect(keyData.permissions.maxRequests).toBe(1000);
      expect(keyData.permissions.rateLimit).toEqual({ requests: 100, window: 60000 });
    });

    it('should use custom permissions', () => {
      const result = market.createAPIKey('limited', {
        services: ['translate'],
        maxRequests: 50,
        rateLimit: { requests: 10, window: 1000 },
        credits: 500
      });
      const keyData = market.apiKeys.get(result.key);
      expect(keyData.permissions.services).toEqual(['translate']);
      expect(keyData.permissions.maxRequests).toBe(50);
      expect(keyData.permissions.rateLimit).toEqual({ requests: 10, window: 1000 });
      expect(keyData.credits).toBe(500);
    });
  });

  describe('validateAPIKey', () => {
    it('should validate a valid key', () => {
      const { key } = market.createAPIKey('test');
      const result = market.validateAPIKey(key);
      expect(result.valid).toBe(true);
      expect(result.keyData).toBeDefined();
    });

    it('should reject invalid key', () => {
      const result = market.validateAPIKey('sk_invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should reject revoked key', () => {
      const { key } = market.createAPIKey('test');
      market.revokeAPIKey(key);
      const result = market.validateAPIKey(key);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('API key is disabled');
    });

    it('should reject key when credits are depleted', () => {
      const { key } = market.createAPIKey('spent', { credits: 5 });
      market.deductCredits(key, 5);
      const result = market.validateAPIKey(key);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Insufficient credits');
    });
  });

  describe('revokeAPIKey', () => {
    it('should revoke an active key', () => {
      const { key } = market.createAPIKey('test');
      expect(market.revokeAPIKey(key)).toBe(true);
      expect(market.apiKeys.get(key).status).toBe('revoked');
    });

    it('should return false for non-existent key', () => {
      expect(market.revokeAPIKey('sk_nonexistent')).toBe(false);
    });
  });

  describe('validateRateLimit', () => {
    it('should allow first request', () => {
      const { key } = market.createAPIKey('test');
      expect(market.validateRateLimit(key)).toBe(true);
    });

    it('should block when rate limit exceeded', () => {
      const { key } = market.createAPIKey('limited', {
        rateLimit: { requests: 2, window: 60000 }
      });
      expect(market.validateRateLimit(key)).toBe(true);
      expect(market.validateRateLimit(key)).toBe(true);
      expect(market.validateRateLimit(key)).toBe(false);
    });

    it('should reset window after time passes', () => {
      const { key } = market.createAPIKey('limited', {
        rateLimit: { requests: 1, window: 500 }
      });
      expect(market.validateRateLimit(key)).toBe(true);
      expect(market.validateRateLimit(key)).toBe(false);
    });

    it('should return false for missing key', () => {
      expect(market.validateRateLimit('sk_ghost')).toBe(false);
    });

    it('should reset window when window has expired', () => {
      const dateSpy = jest.spyOn(Date, 'now');
      dateSpy.mockReturnValue(1000);
      const { key } = market.createAPIKey('test', {
        rateLimit: { requests: 1, window: 500 }
      });
      expect(market.validateRateLimit(key)).toBe(true);
      dateSpy.mockReturnValue(1501);
      expect(market.validateRateLimit(key)).toBe(true);
      dateSpy.mockRestore();
    });
  });

  describe('canAccessService', () => {
    it('should allow access with wildcard', () => {
      const { key } = market.createAPIKey('admin');
      expect(market.canAccessService(key, 'any-service')).toBe(true);
    });

    it('should allow access to specific services', () => {
      const { key } = market.createAPIKey('translator', {
        services: ['translate']
      });
      expect(market.canAccessService(key, 'translate')).toBe(true);
      expect(market.canAccessService(key, 'ocr')).toBe(false);
    });

    it('should deny access for missing key', () => {
      expect(market.canAccessService('sk_ghost', 'translate')).toBe(false);
    });
  });

  describe('deductCredits', () => {
    it('should deduct credits from key', () => {
      const { key } = market.createAPIKey('test', { credits: 100 });
      expect(market.deductCredits(key, 30)).toBe(true);
      expect(market.apiKeys.get(key).credits).toBe(70);
    });

    it('should fail when insufficient credits', () => {
      const { key } = market.createAPIKey('test', { credits: 5 });
      expect(market.deductCredits(key, 10)).toBe(false);
      expect(market.apiKeys.get(key).credits).toBe(5);
    });

    it('should return false for missing key', () => {
      expect(market.deductCredits('sk_ghost', 10)).toBe(false);
    });

    it('should deduct credits without usage stats', () => {
      const { key } = market.createAPIKey('test', { credits: 100 });
      market.usageStats.delete(key);
      expect(market.deductCredits(key, 30)).toBe(true);
      expect(market.apiKeys.get(key).credits).toBe(70);
    });
  });

  describe('recordUsage', () => {
    it('should record successful usage', () => {
      const { key } = market.createAPIKey('test');
      const svc = market.registerService('translate', { name: 'Translation' });
      market.recordUsage(key, 'translate', true);

      const stats = market.usageStats.get(key);
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(0);
      expect(stats.requestsByService.translate).toBe(1);
      expect(svc.usageCount).toBe(1);
    });

    it('should record failed usage', () => {
      const { key } = market.createAPIKey('test');
      market.recordUsage(key, 'ocr', false);
      const stats = market.usageStats.get(key);
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(1);
    });

    it('should silently skip for missing stats', () => {
      expect(() => market.recordUsage('sk_ghost', 's', true)).not.toThrow();
    });

    it('should increment existing service request count', () => {
      const { key } = market.createAPIKey('test');
      market.recordUsage(key, 'translate', true);
      market.recordUsage(key, 'translate', true);
      const stats = market.usageStats.get(key);
      expect(stats.requestsByService.translate).toBe(2);
    });

    it('should handle missing keyData in recordUsage', () => {
      const { key } = market.createAPIKey('test');
      market.apiKeys.delete(key);
      market.recordUsage(key, 'translate', true);
      const stats = market.usageStats.get(key);
      expect(stats.totalRequests).toBe(1);
    });
  });

  describe('callService', () => {
    it('should execute service successfully', async () => {
      const { key } = market.createAPIKey('test', { credits: 100 });
      market.registerService('ping', { name: 'Ping', price: 5 });

      const result = await market.callService(key, 'ping', { echo: 'hello' });
      expect(result.success).toBe(true);
      expect(result.result.service).toBe('ping');
      expect(result.result.params).toEqual({ echo: 'hello' });
      expect(result.creditsUsed).toBe(5);
    });

    it('should reject invalid key', async () => {
      const result = await market.callService('sk_invalid', 'ping', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should reject rate-limited key', async () => {
      const { key } = market.createAPIKey('test', {
        credits: 100,
        rateLimit: { requests: 1, window: 60000 }
      });
      market.registerService('ping', { name: 'Ping' });
      await market.callService(key, 'ping', {});
      const result = await market.callService(key, 'ping', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    it('should reject access denied service', async () => {
      const { key } = market.createAPIKey('test', {
        services: ['translate'],
        credits: 100
      });
      market.registerService('ocr', { name: 'OCR' });
      const result = await market.callService(key, 'ocr', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Access denied to this service');
    });

    it('should reject non-existent service', async () => {
      const { key } = market.createAPIKey('test', { credits: 100 });
      const result = await market.callService(key, 'ghost', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Service not found');
    });

    it('should reject inactive service', async () => {
      const { key } = market.createAPIKey('test', { credits: 100 });
      market.registerService('deprecated', { name: 'Dep' });
      market.services.get('deprecated').status = 'deprecated';
      const result = await market.callService(key, 'deprecated', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Service is not active');
    });

    it('should reject when credits insufficient', async () => {
      const { key } = market.createAPIKey('test', { credits: 1 });
      market.registerService('expensive', { name: 'Exp', price: 10 });
      const result = await market.callService(key, 'expensive', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient credits');
    });

    it('should catch execution errors', async () => {
      const { key } = market.createAPIKey('test', { credits: 100 });
      market.registerService('broken', { name: 'Broken' });
      market._executeService = jest.fn().mockRejectedValue(new Error('Execution failed'));
      const result = await market.callService(key, 'broken', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });
  });

  describe('getServices', () => {
    it('should return all services', () => {
      market.registerService('a', { name: 'A', description: 'Service A', endpoint: '/a', price: 1 });
      market.registerService('b', { name: 'B', description: 'Service B', endpoint: '/b', price: 2 });
      const services = market.getServices();
      expect(services).toHaveLength(2);
      expect(services[0]).toHaveProperty('id');
      expect(services[0]).toHaveProperty('name');
      expect(services[0]).toHaveProperty('description');
      expect(services[0]).toHaveProperty('endpoint');
      expect(services[0]).toHaveProperty('method');
      expect(services[0]).toHaveProperty('price');
    });

    it('should return empty array when no services', () => {
      expect(market.getServices()).toEqual([]);
    });
  });

  describe('getService', () => {
    it('should return a service by id', () => {
      market.registerService('ping', { name: 'Ping' });
      const svc = market.getService('ping');
      expect(svc.name).toBe('Ping');
    });

    it('should return undefined for missing service', () => {
      expect(market.getService('ghost')).toBeUndefined();
    });
  });

  describe('getAPIKeyInfo', () => {
    it('should return key info', () => {
      const { key } = market.createAPIKey('my-key');
      const info = market.getAPIKeyInfo(key);
      expect(info.name).toBe('my-key');
      expect(info.credits).toBe(100);
      expect(info.status).toBe('active');
    });

    it('should return null for missing key', () => {
      expect(market.getAPIKeyInfo('sk_ghost')).toBeNull();
    });
  });

  describe('getUsageStats', () => {
    it('should return usage stats', () => {
      const { key } = market.createAPIKey('test');
      market.recordUsage(key, 'svc', true);
      const stats = market.getUsageStats(key);
      expect(stats.totalRequests).toBe(1);
    });

    it('should return null for missing key', () => {
      expect(market.getUsageStats('sk_ghost')).toBeNull();
    });
  });

  describe('addCredits', () => {
    it('should add credits to key', () => {
      const { key } = market.createAPIKey('test', { credits: 50 });
      expect(market.addCredits(key, 30)).toBe(true);
      expect(market.apiKeys.get(key).credits).toBe(80);
    });

    it('should return false for missing key', () => {
      expect(market.addCredits('sk_ghost', 10)).toBe(false);
    });
  });

  describe('getMarketStats', () => {
    it('should return market statistics', () => {
      market.registerService('s1', { name: 'S1' });
      market.registerService('s2', { name: 'S2' });
      const k1 = market.createAPIKey('ak1', { credits: 100 });
      market.recordUsage(k1.key, 's1', true);

      const stats = market.getMarketStats();
      expect(stats.services.total).toBe(2);
      expect(stats.services.active).toBe(2);
      expect(stats.services.totalUsage).toBe(1);
      expect(stats.apiKeys.total).toBe(1);
      expect(stats.apiKeys.active).toBe(1);
      expect(stats.credits.total).toBe(100);
      expect(stats.credits.used).toBe(0);
    });

    it('should return zeros for empty market', () => {
      const stats = market.getMarketStats();
      expect(stats.services.total).toBe(0);
      expect(stats.apiKeys.total).toBe(0);
      expect(stats.credits.total).toBe(0);
    });

    it('should aggregate credit usage', () => {
      const k1 = market.createAPIKey('k1', { credits: 100 });
      const k2 = market.createAPIKey('k2', { credits: 200 });
      market.usageStats.get(k1.key).totalCreditsUsed = 30;
      market.usageStats.get(k2.key).totalCreditsUsed = 50;
      const stats = market.getMarketStats();
      expect(stats.credits.total).toBe(300);
      expect(stats.credits.used).toBe(80);
    });
  });
});
