/**
 * Performance Configuration Manager
 * Centralized configuration for performance tuning
 */

class PerformanceConfig {
  constructor() {
    this.config = this._getDefaultConfig();
  }

  _getDefaultConfig() {
    return {
      // Cache Configuration
      cache: {
        enabled: true,
        ttl: {
          default: 3600,
          skillMetadata: 3600,
          userPermissions: 7200,
          industrySolutions: 1800,
          toolAnnotations: 3600,
          hotData: 300
        },
        maxSize: 10000,
        cleanupInterval: 60000
      },

      // Redis Configuration
      redis: {
        enabled: process.env.REDIS_URL !== undefined,
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        keyPrefix: 'ultrawork:',
        retryDelay: 1000,
        maxRetries: 3
      },

      // Skill Execution
      skillExecution: {
        maxConcurrent: parseInt(process.env.SKILL_MAX_CONCURRENT) || 5,
        timeout: 120000,
        retryAttempts: 2,
        warmupOnStart: true,
        warmupDelay: 2000
      },

      // Async Batch Writer
      batchWriter: {
        batchSize: parseInt(process.env.BATCH_SIZE) || 100,
        flushInterval: parseInt(process.env.FLUSH_INTERVAL) || 5000,
        maxQueueSize: 10000
      },

      // Resource Limits
      resources: {
        maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB) || 512,
        maxCPUPercent: parseInt(process.env.MAX_CPU_PERCENT) || 80,
        heapWarningThreshold: 0.85,
        heapCriticalThreshold: 0.95
      },

      // Monitoring
      monitoring: {
        metricsEnabled: true,
        metricsPort: 9090,
        healthCheckInterval: 30000,
        slowRequestThreshold: 5000
      },

      // SLA Configuration
      sla: {
        availabilityTarget: 0.999,
        responseTimeTarget: 2000,
        errorRateTarget: 0.01
      },

      // Cost Controls
      cost: {
        dailyBudgetUSD: parseFloat(process.env.DAILY_BUDGET_USD) || 100,
        alertThreshold: 0.8,
        llmTokenLimit: parseInt(process.env.LLM_TOKEN_LIMIT) || 100000
      }
    };
  }

  get(path) {
    const parts = path.split('.');
    let current = this.config;
    for (const part of parts) {
      if (current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  set(path, value) {
    const parts = path.split('.');
    let current = this.config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    return this;
  }

  getAll() {
    return { ...this.config };
  }

  getCacheConfig() {
    return this.config.cache;
  }

  getRedisConfig() {
    return this.config.redis;
  }

  getSkillExecutionConfig() {
    return this.config.skillExecution;
  }

  getBatchWriterConfig() {
    return this.config.batchWriter;
  }

  getResourceConfig() {
    return this.config.resources;
  }

  getMonitoringConfig() {
    return this.config.monitoring;
  }

  getSLAConfig() {
    return this.config.sla;
  }

  getCostConfig() {
    return this.config.cost;
  }

  /**
   * Load configuration from environment
   */
  loadFromEnv() {
    const envMappings = {
      'REDIS_URL': 'redis.url',
      'SKILL_MAX_CONCURRENT': 'skillExecution.maxConcurrent',
      'BATCH_SIZE': 'batchWriter.batchSize',
      'FLUSH_INTERVAL': 'batchWriter.flushInterval',
      'MAX_MEMORY_MB': 'resources.maxMemoryMB',
      'DAILY_BUDGET_USD': 'cost.dailyBudgetUSD',
      'LLM_TOKEN_LIMIT': 'cost.llmTokenLimit'
    };

    for (const [envVar, configPath] of Object.entries(envMappings)) {
      if (process.env[envVar]) {
        this.set(configPath, process.env[envVar]);
      }
    }

    return this;
  }

  /**
   * Generate optimization recommendations based on current metrics
   */
  generateRecommendations(metrics) {
    const recommendations = [];

    // Cache recommendations
    if (metrics.cacheHitRate < 0.7) {
      recommendations.push({
        type: 'cache',
        priority: 'high',
        action: 'Increase TTL for frequently accessed data',
        current: metrics.cacheHitRate,
        target: 0.85
      });
    }

    // Memory recommendations
    if (metrics.memoryUsage > this.config.resources.heapWarningThreshold) {
      recommendations.push({
        type: 'memory',
        priority: 'high',
        action: 'Increase memory limit or optimize cache size',
        current: metrics.memoryUsage,
        target: 0.7
      });
    }

    // Concurrency recommendations
    if (metrics.queueLength > 10) {
      recommendations.push({
        type: 'concurrency',
        priority: 'medium',
        action: 'Increase maxConcurrent skill executions',
        current: this.config.skillExecution.maxConcurrent,
        suggested: this.config.skillExecution.maxConcurrent + 2
      });
    }

    // Batch writer recommendations
    if (metrics.batchQueueSize > this.config.batchWriter.batchSize * 0.8) {
      recommendations.push({
        type: 'batch',
        priority: 'medium',
        action: 'Increase batch size or flush interval',
        current: this.config.batchWriter.batchSize,
        suggested: Math.ceil(this.config.batchWriter.batchSize * 1.5)
      });
    }

    return recommendations;
  }
}

// Singleton instance
let instance = null;

PerformanceConfig.getInstance = function() {
  if (!instance) {
    instance = new PerformanceConfig();
    instance.loadFromEnv();
  }
  return instance;
};

module.exports = { PerformanceConfig };
