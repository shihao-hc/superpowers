const crypto = require('crypto');

class APIMarket {
  constructor(options = {}) {
    this.services = new Map();
    this.apiKeys = new Map();
    this.usageStats = new Map();
    this.rateLimits = new Map();
    this.defaultRateLimit = options.defaultRateLimit || { requests: 100, window: 60000 };
    this.pricing = options.pricing || {};
  }

  registerService(serviceId, config) {
    const service = {
      id: serviceId,
      name: config.name,
      description: config.description,
      endpoint: config.endpoint,
      method: config.method || 'POST',
      params: config.params || [],
      price: config.price || 0,
      currency: config.currency || 'credits',
      version: config.version || '1.0',
      status: 'active',
      createdAt: Date.now(),
      usageCount: 0,
      lastUsed: null
    };

    this.services.set(serviceId, service);
    return service;
  }

  registerTemplateAsService(template) {
    const serviceId = `svc_${template.key}`;

    return this.registerService(serviceId, {
      name: template.name,
      description: template.description,
      endpoint: `/api/market/${serviceId}`,
      method: 'POST',
      params: template.params,
      price: this.pricing[template.key] || 1,
      version: '1.0'
    });
  }

  createAPIKey(name, permissions = {}) {
    const keyId = `key_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
    const apiKey = `sk_${crypto.randomBytes(24).toString('hex')}`;

    const keyData = {
      id: keyId,
      name,
      key: apiKey,
      permissions: {
        services: permissions.services || ['*'],
        maxRequests: permissions.maxRequests || 1000,
        rateLimit: permissions.rateLimit || this.defaultRateLimit
      },
      credits: permissions.credits || 100,
      createdAt: Date.now(),
      lastUsed: null,
      status: 'active'
    };

    this.apiKeys.set(apiKey, keyData);
    this.usageStats.set(apiKey, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCreditsUsed: 0,
      requestsByService: {}
    });

    return { id: keyId, key: apiKey, name, credits: keyData.credits };
  }

  validateAPIKey(apiKey) {
    const keyData = this.apiKeys.get(apiKey);

    if (!keyData) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (keyData.status !== 'active') {
      return { valid: false, error: 'API key is disabled' };
    }

    if (keyData.credits <= 0) {
      return { valid: false, error: 'Insufficient credits' };
    }

    return { valid: true, keyData };
  }

  validateRateLimit(apiKey) {
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) return false;

    const limit = keyData.permissions.rateLimit;
    const now = Date.now();

    if (!this.rateLimits.has(apiKey)) {
      this.rateLimits.set(apiKey, { count: 1, windowStart: now });
      return true;
    }

    const record = this.rateLimits.get(apiKey);

    if (now - record.windowStart > limit.window) {
      record.count = 1;
      record.windowStart = now;
      return true;
    }

    if (record.count >= limit.requests) {
      return false;
    }

    record.count++;
    return true;
  }

  canAccessService(apiKey, serviceId) {
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) return false;

    const allowedServices = keyData.permissions.services;

    if (allowedServices.includes('*')) {
      return true;
    }

    return allowedServices.includes(serviceId);
  }

  deductCredits(apiKey, amount) {
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) return false;

    if (keyData.credits < amount) {
      return false;
    }

    keyData.credits -= amount;

    const stats = this.usageStats.get(apiKey);
    if (stats) {
      stats.totalCreditsUsed += amount;
    }

    return true;
  }

  recordUsage(apiKey, serviceId, success) {
    const stats = this.usageStats.get(apiKey);
    if (!stats) return;

    stats.totalRequests++;
    if (success) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
    }

    if (!stats.requestsByService[serviceId]) {
      stats.requestsByService[serviceId] = 0;
    }
    stats.requestsByService[serviceId]++;

    const service = this.services.get(serviceId);
    if (service) {
      service.usageCount++;
      service.lastUsed = Date.now();
    }

    const keyData = this.apiKeys.get(apiKey);
    if (keyData) {
      keyData.lastUsed = Date.now();
    }
  }

  async callService(apiKey, serviceId, params) {
    const validation = this.validateAPIKey(apiKey);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    if (!this.validateRateLimit(apiKey)) {
      return { success: false, error: 'Rate limit exceeded' };
    }

    if (!this.canAccessService(apiKey, serviceId)) {
      return { success: false, error: 'Access denied to this service' };
    }

    const service = this.services.get(serviceId);
    if (!service) {
      return { success: false, error: 'Service not found' };
    }

    if (service.status !== 'active') {
      return { success: false, error: 'Service is not active' };
    }

    if (!this.deductCredits(apiKey, service.price)) {
      return { success: false, error: 'Insufficient credits' };
    }

    try {
      const result = await this._executeService(service, params);
      this.recordUsage(apiKey, serviceId, true);
      return { success: true, result, creditsUsed: service.price };
    } catch (error) {
      this.recordUsage(apiKey, serviceId, false);
      return { success: false, error: error.message };
    }
  }

  async _executeService(service, params) {
    return {
      service: service.id,
      message: 'Service executed',
      params
    };
  }

  getServices() {
    return Array.from(this.services.values()).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      endpoint: s.endpoint,
      method: s.method,
      params: s.params,
      price: s.price,
      currency: s.currency,
      version: s.version,
      status: s.status
    }));
  }

  getService(serviceId) {
    return this.services.get(serviceId);
  }

  getAPIKeyInfo(apiKey) {
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) return null;

    return {
      id: keyData.id,
      name: keyData.name,
      credits: keyData.credits,
      status: keyData.status,
      createdAt: keyData.createdAt,
      lastUsed: keyData.lastUsed
    };
  }

  getUsageStats(apiKey) {
    return this.usageStats.get(apiKey) || null;
  }

  addCredits(apiKey, amount) {
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) return false;

    keyData.credits += amount;
    return true;
  }

  revokeAPIKey(apiKey) {
    const keyData = this.apiKeys.get(apiKey);
    if (keyData) {
      keyData.status = 'revoked';
      return true;
    }
    return false;
  }

  getMarketStats() {
    const services = Array.from(this.services.values());
    const keys = Array.from(this.apiKeys.values());

    return {
      services: {
        total: services.length,
        active: services.filter(s => s.status === 'active').length,
        totalUsage: services.reduce((sum, s) => sum + s.usageCount, 0)
      },
      apiKeys: {
        total: keys.length,
        active: keys.filter(k => k.status === 'active').length
      },
      credits: {
        total: keys.reduce((sum, k) => sum + k.credits, 0),
        used: keys.reduce((sum, k) => {
          const stats = this.usageStats.get(k.key);
          return sum + (stats?.totalCreditsUsed || 0);
        }, 0)
      }
    };
  }
}

module.exports = { APIMarket };
