/**
 * MCP Bridge Health Monitor - 桥接器健康监控
 * 提供统一健康检查、指标暴露、日志记录
 */

const { rootsManager } = require('./engines/RootsManager');
const { thinkingChain } = require('./engines/ThinkingChain');
const { thinkingChain } = require('./engines/ThinkingChainStorage');

class BridgeHealthMonitor {
  constructor() {
    this.bridges = new Map();
    this.metrics = {
      calls: new Map(),
      errors: new Map(),
      latency: new Map()
    };
    this.startTime = Date.now();
  }

  /**
   * 注册桥接器
   */
  registerBridge(name, bridge) {
    this.bridges.set(name, bridge);
  }

  /**
   * 记录工具调用
   */
  recordCall(bridgeName, toolName, duration, success = true) {
    const key = `${bridgeName}:${toolName}`;
    
    if (!this.metrics.calls.has(key)) {
      this.metrics.calls.set(key, { total: 0, success: 0, errors: 0 });
    }
    
    const stats = this.metrics.calls.get(key);
    stats.total++;
    if (success) stats.success++;
    else stats.errors++;

    if (!this.metrics.latency.has(key)) {
      this.metrics.latency.set(key, []);
    }
    this.metrics.latency.get(key).push(duration);
  }

  /**
   * 执行健康检查
   */
  async healthCheck() {
    const results = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      bridges: {},
      system: {
        roots: await this.checkRoots(),
        thinking: await this.checkThinking(),
        memory: this.checkMemory()
      },
      overall: 'healthy'
    };

    let unhealthyCount = 0;

    for (const [name, bridge] of this.bridges) {
      try {
        const health = await bridge.healthCheck?.() || { status: 'unknown' };
        results.bridges[name] = health;
        
        if (health.status !== 'healthy' && health.status !== 'unknown') {
          unhealthyCount++;
        }
      } catch (error) {
        results.bridges[name] = {
          status: 'error',
          error: error.message
        };
        unhealthyCount++;
      }
    }

    results.overall = unhealthyCount === 0 ? 'healthy' : 
                      unhealthyCount < this.bridges.size ? 'degraded' : 'unhealthy';

    return results;
  }

  /**
   * 检查 Roots 状态
   */
  async checkRoots() {
    const roots = rootsManager.getRoots();
    const rootChecks = roots.map(root => ({
      path: root,
      readable: rootsManager.isReadable(root),
      writable: rootsManager.isWritable(root)
    }));

    return {
      configured: roots.length,
      roots: rootChecks
    };
  }

  /**
   * 检查思维链状态
   */
  async checkThinking() {
    const chains = thinkingChain.listChains();
    const storageStats = thinkingChain.getStorageStats?.() || {};

    return {
      activeChains: chains.filter(c => c.status === 'in_progress').length,
      totalChains: chains.length,
      storage: storageStats
    };
  }

  /**
   * 检查内存状态
   */
  checkMemory() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
      external: Math.round(usage.external / 1024 / 1024) + ' MB',
      rss: Math.round(usage.rss / 1024 / 1024) + ' MB'
    };
  }

  /**
   * 获取指标
   */
  getMetrics() {
    const metrics = {
      calls: {},
      latency: {},
      errorRate: {}
    };

    for (const [key, stats] of this.metrics.calls) {
      const [bridge, tool] = key.split(':');
      metrics.calls[key] = stats;
      metrics.errorRate[key] = stats.total > 0 ? 
        (stats.errors / stats.total * 100).toFixed(1) + '%' : '0%';
    }

    for (const [key, values] of this.metrics.latency) {
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        
        metrics.latency[key] = {
          count: values.length,
          avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
          p50,
          p95,
          p99
        };
      }
    }

    return metrics;
  }

  /**
   * 获取 Dry-run 统计
   */
  getDryRunStats() {
    const history = new (require('./engines/DryRunHistory'))();
    const stats = history.getStats();

    return {
      ...stats,
      previewVsExecution: stats.previewOnly > 0 && stats.executed > 0 ? 
        (stats.previewOnly / stats.executed).toFixed(2) + ':1' : 'N/A'
    };
  }

  /**
   * 获取完整监控数据
   */
  async getFullReport() {
    const [health, metrics, dryRunStats] = await Promise.all([
      this.healthCheck(),
      Promise.resolve(this.getMetrics()),
      Promise.resolve(this.getDryRunStats())
    ]);

    return {
      ...health,
      metrics,
      dryRun: dryRunStats
    };
  }

  /**
   * 生成结构化日志
   */
  log(requestId, chainId, toolName, params, result, duration) {
    return {
      timestamp: new Date().toISOString(),
      requestId,
      chainId,
      toolName,
      params: this.sanitizeParams(params),
      success: !result.error,
      duration,
      resultSummary: result.error ? result.error : 'ok'
    };
  }

  /**
   * 清理敏感参数
   */
  sanitizeParams(params) {
    const sensitive = ['token', 'password', 'secret', 'apiKey', 'authorization'];
    const sanitized = { ...params };
    
    for (const key of Object.keys(sanitized)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  /**
   * 重置指标
   */
  resetMetrics() {
    this.metrics.calls.clear();
    this.metrics.errors.clear();
    this.metrics.latency.clear();
    return { success: true };
  }
}

// 单例
const healthMonitor = new BridgeHealthMonitor();

module.exports = {
  BridgeHealthMonitor,
  healthMonitor
};
