/**
 * Performance AutoScaler
 * 基于 k6 测试报告和 Grafana 指标自动调整资源配额
 */

class PerformanceAutoScaler {
  constructor(options = {}) {
    this.metrics = {
      p95Latency: 0,
      p99Latency: 0,
      errorRate: 0,
      rps: 0,
      cacheHitRate: 0,
      cpuUsage: 0,
      memoryUsage: 0
    };
    
    this.thresholds = {
      p95Latency: options.p95Latency || 500,
      p99Latency: options.p99Latency || 1000,
      errorRate: options.errorRate || 0.01,
      rps: options.rps || 100,
      cacheHitRate: options.cacheHitRate || 0.6,
      cpuUsage: options.cpuUsage || 0.8,
      memoryUsage: options.memoryUsage || 0.85
    };
    
    this.config = {
      resources: {
        cpu: { min: '500m', max: '2000m', current: '1000m' },
        memory: { min: '512Mi', max: '2Gi', current: '1Gi' },
        replicas: { min: 2, max: 20, current: 3 }
      },
      cache: {
        ttl: { min: 300000, max: 3600000, current: 1800000 },
        maxSize: { min: 1000, max: 50000, current: 10000 }
      },
      concurrency: {
        maxConnections: { min: 50, max: 500, current: 100 },
        rateLimit: { min: 50, max: 200, current: 100 }
      }
    };
    
    this.history = [];
    this.recommendations = [];
  }
  
  analyze(metrics) {
    this.metrics = { ...this.metrics, ...metrics };
    this.history.push({
      timestamp: Date.now(),
      metrics: { ...this.metrics }
    });
    
    if (this.history.length > 100) {
      this.history.shift();
    }
    
    return this.generateRecommendations();
  }
  
  generateRecommendations() {
    this.recommendations = [];
    
    if (this.metrics.p95Latency > this.thresholds.p95Latency) {
      const severity = this.metrics.p95Latency > this.thresholds.p95Latency * 2 ? 'high' : 'medium';
      this.recommendations.push({
        type: 'latency',
        severity,
        message: `P95 延迟过高: ${this.metrics.p95Latency}ms > ${this.thresholds.p95Latency}ms`,
        actions: this.optimizeForLatency()
      });
    }
    
    if (this.metrics.errorRate > this.thresholds.errorRate) {
      this.recommendations.push({
        type: 'error_rate',
        severity: 'critical',
        message: `错误率过高: ${(this.metrics.errorRate * 100).toFixed(2)}% > ${(this.thresholds.errorRate * 100)}%`,
        actions: this.optimizeForErrors()
      });
    }
    
    if (this.metrics.cacheHitRate < this.thresholds.cacheHitRate) {
      this.recommendations.push({
        type: 'cache',
        severity: 'medium',
        message: `缓存命中率低: ${(this.metrics.cacheHitRate * 100).toFixed(1)}% < ${(this.thresholds.cacheHitRate * 100)}%`,
        actions: this.optimizeCache()
      });
    }
    
    if (this.metrics.cpuUsage > this.thresholds.cpuUsage) {
      this.recommendations.push({
        type: 'resources',
        severity: 'high',
        message: `CPU 使用率高: ${(this.metrics.cpuUsage * 100).toFixed(1)}% > ${(this.thresholds.cpuUsage * 100)}%`,
        actions: this.optimizeResources()
      });
    }
    
    if (this.metrics.memoryUsage > this.thresholds.memoryUsage) {
      this.recommendations.push({
        type: 'memory',
        severity: 'high',
        message: `内存使用率高: ${(this.metrics.memoryUsage * 100).toFixed(1)}% > ${(this.thresholds.memoryUsage * 100)}%`,
        actions: this.optimizeMemory()
      });
    }
    
    return this.recommendations;
  }
  
  optimizeForLatency() {
    const actions = [];
    
    actions.push({
      config: 'cache.ttl',
      current: this.config.cache.ttl.current,
      recommended: Math.min(
        this.config.cache.ttl.current * 1.5,
        this.config.cache.ttl.max
      ),
      action: '增加缓存 TTL'
    });
    
    actions.push({
      config: 'resources.replicas',
      current: this.config.resources.replicas.current,
      recommended: Math.min(
        this.config.resources.replicas.current + 1,
        this.config.resources.replicas.max
      ),
      action: '增加副本数'
    });
    
    actions.push({
      config: 'concurrency.maxConnections',
      current: this.config.concurrency.maxConnections.current,
      recommended: Math.max(
        this.config.concurrency.maxConnections.current - 20,
        this.config.concurrency.maxConnections.min
      ),
      action: '减少并发连接数'
    });
    
    return actions;
  }
  
  optimizeForErrors() {
    return [
      {
        config: 'resources.replicas',
        current: this.config.resources.replicas.current,
        recommended: this.config.resources.replicas.current + 2,
        action: '紧急扩容'
      },
      {
        config: 'concurrency.rateLimit',
        current: this.config.concurrency.rateLimit.current,
        recommended: Math.max(
          this.config.concurrency.rateLimit.current * 0.7,
          this.config.concurrency.rateLimit.min
        ),
        action: '降低限流阈值以保护服务'
      }
    ];
  }
  
  optimizeCache() {
    return [
      {
        config: 'cache.ttl',
        current: this.config.cache.ttl.current,
        recommended: Math.min(
          this.config.cache.ttl.current * 1.2,
          this.config.cache.ttl.max
        ),
        action: '延长缓存 TTL'
      },
      {
        config: 'cache.maxSize',
        current: this.config.cache.maxSize.current,
        recommended: Math.min(
          this.config.cache.maxSize.current * 1.5,
          this.config.cache.maxSize.max
        ),
        action: '增加缓存容量'
      }
    ];
  }
  
  optimizeResources() {
    return [
      {
        config: 'resources.cpu',
        current: this.config.resources.cpu.current,
        recommended: this.calculateNextResource('cpu'),
        action: '增加 CPU 配额'
      },
      {
        config: 'resources.replicas',
        current: this.config.resources.replicas.current,
        recommended: Math.min(
          this.config.resources.replicas.current + 1,
          this.config.resources.replicas.max
        ),
        action: '水平扩展'
      }
    ];
  }
  
  optimizeMemory() {
    return [
      {
        config: 'resources.memory',
        current: this.config.resources.memory.current,
        recommended: this.calculateNextResource('memory'),
        action: '增加内存配额'
      },
      {
        config: 'cache.maxSize',
        current: this.config.cache.maxSize.current,
        recommended: Math.max(
          this.config.cache.maxSize.current * 0.8,
          this.config.cache.maxSize.min
        ),
        action: '减少缓存容量以释放内存'
      }
    ];
  }
  
  calculateNextResource(type) {
    const multipliers = {
      cpu: [1, 1.5, 2],
      memory: ['512Mi', '1Gi', '2Gi', '4Gi']
    };
    
    const current = this.config.resources[type].current;
    const units = multipliers[type];
    const idx = units.indexOf(current);
    
    if (idx < 0 || idx >= units.length - 1) {
      return units[units.length - 1];
    }
    
    return units[idx + 1];
  }
  
  applyRecommendation(recommendation) {
    for (const action of recommendation.actions) {
      const [category, key] = action.config.split('.');
      
      if (category === 'resources' && key === 'replicas') {
        this.config.resources.replicas.current = action.recommended;
      } else if (category === 'cache') {
        this.config.cache[key].current = action.recommended;
      } else if (category === 'concurrency') {
        this.config.concurrency[key].current = action.recommended;
      } else if (category === 'resources') {
        this.config.resources[key].current = action.recommended;
      }
    }
    
    return this.getCurrentConfig();
  }
  
  getCurrentConfig() {
    return {
      resources: { ...this.config.resources },
      cache: { ...this.config.cache },
      concurrency: { ...this.config.concurrency },
      thresholds: { ...this.thresholds }
    };
  }
  
  getMetrics() {
    const recent = this.history.slice(-10);
    const avg = (key) => {
      if (recent.length === 0) return 0;
      return recent.reduce((sum, h) => sum + h.metrics[key], 0) / recent.length;
    };
    
    return {
      current: { ...this.metrics },
      average: {
        p95Latency: avg('p95Latency'),
        p99Latency: avg('p99Latency'),
        errorRate: avg('errorRate'),
        rps: avg('rps'),
        cacheHitRate: avg('cacheHitRate'),
        cpuUsage: avg('cpuUsage'),
        memoryUsage: avg('memoryUsage')
      },
      history: this.history.slice(-20)
    };
  }
  
  getRecommendations() {
    return this.recommendations;
  }
}

module.exports = { PerformanceAutoScaler };
