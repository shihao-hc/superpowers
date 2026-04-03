const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DEFAULT_CONFIG = {
  workflow: {
    maxConcurrent: 10,
    cacheTTL: 60,
    enableParameterCache: true,
    enablePreheating: true,
    maxCompiledPlans: 50
  },
  mcp: {
    connectionPoolSize: 2,
    callTimeout: 30000,
    readonlyCacheTTL: 60000,
    writeCacheTTL: 5000,
    circuitBreaker: {
      failureThreshold: 5,
      halfOpenAttempts: 3,
      recoveryTimeout: 30000,
      slowCallThreshold: 10000
    },
    rateLimit: {
      enabled: true,
      maxRequestsPerSecond: 20,
      windowMs: 1000,
      maxConcurrentPerUser: 5
    }
  },
  agent: {
    minInstances: 2,
    maxInstances: 10,
    scalingMetric: 'queueLength',
    scaleUpThreshold: 10,
    scaleDownThreshold: 2,
    scalingCooldown: 60000,
    memoryLimitMB: 512,
    idleTimeout: 300000
  },
  dataStorage: {
    auditBatchSize: 100,
    auditFlushInterval: 5000,
    auditMaxMemoryEntries: 10000,
    auditRetentionDays: 30,
    enableRedisCache: false,
    redis: {
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0,
      keyPrefix: 'mcp:perf:',
      ttl: 300
    }
  },
  frontend: {
    virtualScrollEnabled: true,
    virtualScrollBatchSize: 50,
    wsLogBufferSize: 100,
    wsLogSampleRate: 1.0,
    maxWsSubscriptions: 10
  },
  monitoring: {
    alerts: {
      workflowP95Latency: 5000,
      mcpSuccessRate: 0.99,
      cacheHitRate: 0.5,
      nodeQueueLength: 100
    },
    prometheusEnabled: true,
    metricsInterval: 10000,
    verboseLogging: false
  },
  hotReload: {
    enabled: true,
    checkInterval: 30000,
    excludePatterns: ['hotReload', 'monitoring.alerts']
  }
};

class PerformanceManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(process.cwd(), 'config', 'performance.yaml');
    this.config = this._deepMerge(DEFAULT_CONFIG, {});
    this.listeners = new Map();
    this.watchInterval = null;
    this.lastModified = null;
    this._configSchema = this._buildSchema();
    
    this._loadConfig();
    
    if (this.config.hotReload.enabled) {
      this._startWatching();
    }
  }

  _buildSchema() {
    return {
      workflow: {
        maxConcurrent: { type: 'number', min: 1, max: 100 },
        cacheTTL: { type: 'number', min: 1, max: 86400 },
        enableParameterCache: { type: 'boolean' },
        enablePreheating: { type: 'boolean' },
        maxCompiledPlans: { type: 'number', min: 1, max: 1000 }
      },
      mcp: {
        connectionPoolSize: { type: 'number', min: 0, max: 50 },
        callTimeout: { type: 'number', min: 1000, max: 300000 },
        readonlyCacheTTL: { type: 'number', min: 1000, max: 86400000 },
        writeCacheTTL: { type: 'number', min: 1000, max: 86400000 },
        circuitBreaker: {
          failureThreshold: { type: 'number', min: 1, max: 100 },
          halfOpenAttempts: { type: 'number', min: 1, max: 10 },
          recoveryTimeout: { type: 'number', min: 1000, max: 600000 },
          slowCallThreshold: { type: 'number', min: 100, max: 60000 }
        },
        rateLimit: {
          enabled: { type: 'boolean' },
          maxRequestsPerSecond: { type: 'number', min: 1, max: 10000 },
          windowMs: { type: 'number', min: 100, max: 60000 },
          maxConcurrentPerUser: { type: 'number', min: 1, max: 100 }
        }
      },
      agent: {
        minInstances: { type: 'number', min: 0, max: 100 },
        maxInstances: { type: 'number', min: 1, max: 1000 },
        scaleUpThreshold: { type: 'number', min: 1, max: 10000 },
        scaleDownThreshold: { type: 'number', min: 0, max: 1000 },
        scalingCooldown: { type: 'number', min: 1000, max: 600000 },
        memoryLimitMB: { type: 'number', min: 64, max: 65536 },
        idleTimeout: { type: 'number', min: 1000, max: 3600000 }
      },
      dataStorage: {
        auditBatchSize: { type: 'number', min: 1, max: 10000 },
        auditFlushInterval: { type: 'number', min: 100, max: 60000 },
        auditMaxMemoryEntries: { type: 'number', min: 100, max: 1000000 },
        auditRetentionDays: { type: 'number', min: 1, max: 365 }
      }
    };
  }

  _validateValue(value, schema, path) {
    if (schema.type === 'boolean') {
      if (typeof value !== 'boolean') {
        console.warn(`[PerformanceManager] Invalid config ${path}: expected boolean, got ${typeof value}`);
        return false;
      }
    } else if (schema.type === 'number') {
      if (typeof value !== 'number' || isNaN(value)) {
        console.warn(`[PerformanceManager] Invalid config ${path}: expected number, got ${typeof value}`);
        return false;
      }
      if (schema.min !== undefined && value < schema.min) {
        console.warn(`[PerformanceManager] Config ${path} below minimum: ${value} < ${schema.min}`);
        return false;
      }
      if (schema.max !== undefined && value > schema.max) {
        console.warn(`[PerformanceManager] Config ${path} above maximum: ${value} > ${schema.max}`);
        return false;
      }
    }
    return true;
  }

  _validateConfig(config, schema, path = '') {
    for (const [key, schemaDef] of Object.entries(schema)) {
      const fullPath = path ? `${path}.${key}` : key;
      const value = config[key];
      
      if (value === undefined) continue;
      
      if (typeof schemaDef === 'object' && !schemaDef.type) {
        if (typeof value !== 'object' || value === null) {
          console.warn(`[PerformanceManager] Invalid config ${fullPath}: expected object`);
          continue;
        }
        this._validateConfig(value, schemaDef, fullPath);
      } else {
        this._validateValue(value, schemaDef, fullPath);
      }
    }
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source || {})) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  _loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf8');
        const loaded = yaml.load(content);
        this._validateConfig(loaded || {}, this._configSchema);
        this.config = this._deepMerge(DEFAULT_CONFIG, loaded || {});
        
        const stats = fs.statSync(this.configPath);
        this.lastModified = stats.mtime.getTime();
      }
    } catch (error) {
      console.warn('[PerformanceManager] Failed to load config:', error.message);
    }
  }

  _startWatching() {
    const interval = this.config.hotReload?.checkInterval || 30000;
    
    this.watchInterval = setInterval(() => {
      this._checkAndReload();
    }, interval);
    
    this.watchInterval.unref();
  }

  _checkAndReload() {
    try {
      if (!fs.existsSync(this.configPath)) return;
      
      const stats = fs.statSync(this.configPath);
      if (stats.mtime.getTime() !== this.lastModified) {
        const oldConfig = { ...this.config };
        this._loadConfig();
        
        const changes = this._detectChanges(oldConfig, this.config);
        if (changes.length > 0) {
          this._notifyListeners('configChanged', { changes, newConfig: this.config });
        }
      }
    } catch (error) {
      console.warn('[PerformanceManager] Config check failed:', error.message);
    }
  }

  _detectChanges(oldConfig, newConfig, prefix = '') {
    const changes = [];
    
    for (const key of Object.keys(newConfig)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (this.config.hotReload.excludePatterns.some(p => new RegExp(p).test(fullKey))) {
        continue;
      }
      
      if (typeof newConfig[key] === 'object' && !Array.isArray(newConfig[key])) {
        changes.push(...this._detectChanges(oldConfig[key] || {}, newConfig[key], fullKey));
      } else if (JSON.stringify(oldConfig[key]) !== JSON.stringify(newConfig[key])) {
        changes.push({ key: fullKey, oldValue: oldConfig[key], newValue: newConfig[key] });
      }
    }
    
    return changes;
  }

  _notifyListeners(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error('[PerformanceManager] Listener error:', error.message);
      }
    }
  }

  get(path = null) {
    if (!path) return this.config;
    
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  set(path, value) {
    const keys = path.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    const lastKey = keys[keys.length - 1];
    const oldValue = current[lastKey];
    current[lastKey] = value;
    
    this._notifyListeners('valueChanged', { path, oldValue, newValue: value });
    
    return oldValue;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
    
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this.listeners.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  getWorkflowConfig() {
    return { ...this.config.workflow };
  }

  getMCPConfig() {
    return { ...this.config.mcp };
  }

  getAgentConfig() {
    return { ...this.config.agent };
  }

  getStorageConfig() {
    return { ...this.config.dataStorage };
  }

  getMonitoringConfig() {
    return { ...this.config.monitoring };
  }

  getAlertThresholds() {
    return { ...this.config.monitoring.alerts };
  }

  checkAlerts(metrics) {
    const thresholds = this.config.monitoring.alerts;
    const alerts = [];
    
    if (metrics.workflowP95Latency > thresholds.workflowP95Latency) {
      alerts.push({
        type: 'WORKFLOW_SLOW',
        message: `Workflow P95 latency ${metrics.workflowP95Latency}ms exceeds threshold ${thresholds.workflowP95Latency}ms`,
        severity: 'warning'
      });
    }
    
    if (metrics.mcpSuccessRate < thresholds.mcpSuccessRate) {
      alerts.push({
        type: 'MCP_LOW_SUCCESS_RATE',
        message: `MCP success rate ${metrics.mcpSuccessRate.toFixed(2)}% below threshold ${(thresholds.mcpSuccessRate * 100).toFixed(1)}%`,
        severity: 'critical'
      });
    }
    
    if (metrics.cacheHitRate !== undefined && metrics.cacheHitRate < thresholds.cacheHitRate) {
      alerts.push({
        type: 'LOW_CACHE_HIT_RATE',
        message: `Cache hit rate ${metrics.cacheHitRate.toFixed(2)}% below threshold ${(thresholds.cacheHitRate * 100).toFixed(1)}%`,
        severity: 'warning'
      });
    }
    
    if (metrics.nodeQueueLength > thresholds.nodeQueueLength) {
      alerts.push({
        type: 'QUEUE_OVERFLOW',
        message: `Node queue length ${metrics.nodeQueueLength} exceeds threshold ${thresholds.nodeQueueLength}`,
        severity: 'warning'
      });
    }
    
    return alerts;
  }

  destroy() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    this.listeners.clear();
  }

  static getDefaultConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  exportConfig() {
    return { ...this.config };
  }
}

module.exports = { PerformanceManager, DEFAULT_CONFIG };
