/**
 * Cost & Performance Optimizer
 * 成本与性能优化系统
 */

const crypto = require('crypto');

class CostOptimizer {
  constructor() {
    this.costSettings = new Map();
    this.billingCycles = new Map();
    this.usageRecords = new Map();
    this.alerts = new Map();
    this.budgets = new Map();
    
    this._initDefaults();
  }

  _initDefaults() {
    // 默认定价
    this.pricing = {
      compute: {
        cpu: 0.0000167, // per vCPU-second
        memory: 0.0000087, // per GB-second
        ephemeral: 0.000000084 // per GB-second
      },
      storage: {
        standard: 0.000023148, // per GB-hour
        intelligent: 0.000012837, // per GB-hour
        archive: 0.0000041667
      },
      network: {
        outbound: 0.12, // per GB
        inbound: 0
      },
      api: {
        skillExecution: 0.001, // per execution
        modelCall: {
          'gpt-4': 0.03,
          'gpt-4-turbo': 0.01,
          'gpt-35-turbo': 0.0005,
          'claude-3-opus': 0.015,
          'claude-3-sonnet': 0.003
        }
      }
    };

    // 成本中心
    this.costCenters = {
      'skill-execution': { name: '技能执行', parent: null },
      'model-inference': { name: '模型推理', parent: null },
      'storage': { name: '存储', parent: null },
      'network': { name: '网络', parent: null },
      'compute': { name: '计算', parent: null }
    };
  }

  // 成本记录
  recordUsage(record) {
    const key = `${record.tenantId}:${record.period}`;
    const existing = this.usageRecords.get(key) || {
      tenantId: record.tenantId,
      period: record.period,
      costs: {},
      usage: {},
      records: []
    };

    // 更新成本
    const cost = this._calculateCost(record);
    existing.costs[record.category] = (existing.costs[record.category] || 0) + cost;
    existing.usage[record.category] = (existing.usage[record.category] || 0) + (record.quantity || 1);
    existing.records.push({
      ...record,
      cost,
      timestamp: Date.now()
    });

    this.usageRecords.set(key, existing);

    // 检查预算
    this._checkBudget(record.tenantId, existing);

    return { cost, total: existing.costs[record.category] };
  }

  _calculateCost(record) {
    switch (record.category) {
      case 'model-inference':
        const modelPrice = this.pricing.api.modelCall[record.model] || 0.001;
        return modelPrice * (record.tokens || 1000) / 1000;
      
      case 'storage':
        const storagePrice = this.pricing.storage[record.storageType] || this.pricing.storage.standard;
        return storagePrice * record.sizeGB * record.durationHours;
      
      case 'compute':
        return (record.cpuSeconds * this.pricing.compute.cpu) +
               (record.memoryGB * this.pricing.compute.memory);
      
      case 'network':
        return record.dataGB * this.pricing.network.outbound;
      
      case 'skill-execution':
        return this.pricing.api.skillExecution * (record.executions || 1);
      
      default:
        return record.cost || 0;
    }
  }

  // 预算管理
  setBudget(tenantId, budget) {
    this.budgets.set(tenantId, {
      tenantId,
      monthly: budget.monthly,
      alertThresholds: budget.alertThresholds || [50, 75, 90, 100],
      period: 'monthly',
      resetDay: budget.resetDay || 1,
      createdAt: Date.now()
    });

    return this.budgets.get(tenantId);
  }

  _checkBudget(tenantId, usage) {
    const budget = this.budgets.get(tenantId);
    if (!budget) return;

    const totalCost = Object.values(usage.costs).reduce((a, b) => a + b, 0);
    const percentage = (totalCost / budget.monthly) * 100;

    for (const threshold of budget.alertThresholds) {
      if (percentage >= threshold) {
        const alertKey = `${tenantId}:${threshold}`;
        const existing = this.alerts.get(alertKey);
        
        if (!existing || existing.sentAt < Date.now() - 24 * 60 * 60 * 1000) {
          this._sendBudgetAlert(tenantId, percentage, threshold);
          this.alerts.set(alertKey, { sentAt: Date.now() });
        }
      }
    }
  }

  _sendBudgetAlert(tenantId, percentage, threshold) {
    console.log(`[Budget Alert] Tenant ${tenantId} at ${percentage.toFixed(1)}% of budget (threshold: ${threshold}%)`);
    // 实际实现会发送邮件/消息
  }

  // 获取成本报告
  getCostReport(tenantId, options = {}) {
    const period = options.period || 'monthly';
    const startDate = options.startDate || this._getPeriodStart(period);
    const endDate = options.endDate || Date.now();

    const allRecords = Array.from(this.usageRecords.values())
      .filter(r => r.tenantId === tenantId)
      .filter(r => {
        const recordPeriod = this._parsePeriod(r.period);
        return recordPeriod >= startDate && recordPeriod <= endDate;
      });

    const breakdown = {};
    let totalCost = 0;

    for (const record of allRecords) {
      for (const [category, cost] of Object.entries(record.costs)) {
        breakdown[category] = (breakdown[category] || 0) + cost;
        totalCost += cost;
      }
    }

    return {
      period: { start: startDate, end: endDate },
      totalCost,
      breakdown: {
        ...breakdown,
        _total: totalCost
      },
      byDay: this._getCostByDay(allRecords),
      trends: this._getCostTrends(breakdown),
      forecast: this._forecastCost(totalCost, period),
      recommendations: this._getCostRecommendations(breakdown)
    };
  }

  _getPeriodStart(period) {
    const now = new Date();
    switch (period) {
      case 'daily':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      case 'weekly':
        const dayOfWeek = now.getDay();
        return new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000).getTime();
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      default:
        return now.getTime() - 30 * 24 * 60 * 60 * 1000;
    }
  }

  _parsePeriod(period) {
    return typeof period === 'number' ? period : Date.parse(period);
  }

  _getCostByDay(records) {
    const byDay = new Map();
    
    for (const record of records) {
      for (const detail of record.records) {
        const day = new Date(detail.timestamp).toISOString().split('T')[0];
        byDay.set(day, (byDay.get(day) || 0) + detail.cost);
      }
    }

    return Array.from(byDay.entries())
      .map(([date, cost]) => ({ date, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  _getCostTrends(breakdown) {
    const trends = [];
    const categories = Object.keys(breakdown);
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

    for (const category of categories) {
      const amount = breakdown[category];
      trends.push({
        category,
        amount,
        percentage: total > 0 ? Math.round(amount / total * 100) : 0,
        trend: 'stable' // 简化计算
      });
    }

    return trends.sort((a, b) => b.amount - a.amount);
  }

  _forecastCost(currentCost, period) {
    const daysElapsed = this._getDaysElapsed(period);
    const daysInPeriod = this._getDaysInPeriod(period);
    
    const dailyRate = currentCost / daysElapsed;
    const projectedTotal = dailyRate * daysInPeriod;

    return {
      current: currentCost,
      projected: Math.round(projectedTotal * 100) / 100,
      confidence: daysElapsed / daysInPeriod
    };
  }

  _getDaysElapsed(period) {
    const now = new Date();
    const start = new Date(this._getPeriodStart(period));
    return Math.max(1, Math.ceil((now - start) / (24 * 60 * 60 * 1000)));
  }

  _getDaysInPeriod(period) {
    switch (period) {
      case 'daily': return 1;
      case 'weekly': return 7;
      case 'monthly': return 30;
      default: return 30;
    }
  }

  _getCostRecommendations(breakdown) {
    const recommendations = [];

    // 模型优化建议
    if (breakdown['model-inference'] && breakdown['model-inference'] > 100) {
      recommendations.push({
        category: 'model',
        priority: 'high',
        title: '考虑使用更小的模型',
        description: '对于简单任务，考虑使用GPT-3.5或本地模型来降低成本',
        potentialSavings: '40-60%'
      });
    }

    // 缓存建议
    if (!breakdown['storage'] || breakdown['storage'] < 10) {
      recommendations.push({
        category: 'storage',
        priority: 'medium',
        title: '启用智能存储分层',
        description: '将不常访问的数据自动迁移到归档存储',
        potentialSavings: '30-50%'
      });
    }

    // 计算优化
    if (breakdown['compute'] && breakdown['compute'] > 50) {
      recommendations.push({
        category: 'compute',
        priority: 'medium',
        title: '考虑使用预留实例',
        description: '对于稳定的基线工作负载，预留实例可节省60%',
        potentialSavings: '60%'
      });
    }

    return recommendations;
  }

  // 成本分摊
  allocateCosts(tenantId, allocation) {
    const report = this.getCostReport(tenantId, { period: allocation.period });
    const allocations = [];

    for (const [dimension, percentage] of Object.entries(allocation.dimensions || {})) {
      const amount = report.totalCost * (percentage / 100);
      allocations.push({
        dimension,
        amount: Math.round(amount * 100) / 100,
        percentage
      });
    }

    return {
      tenantId,
      period: allocation.period,
      totalCost: report.totalCost,
      allocations
    };
  }
}

class PerformanceOptimizer {
  constructor() {
    this.cache = new Map();
    this.optimizations = new Map();
    this.metrics = new Map();
  }

  // 缓存优化
  setCache(key, value, ttl) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      hits: 0
    });
  }

  getCache(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (item.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    item.hits++;
    return item.value;
  }

  // 批量操作优化
  async batchOptimize(items, options = {}) {
    const { concurrency = 10, batchSize = 100 } = options;
    
    const results = [];
    const batches = this._chunkArray(items, batchSize);
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.slice(0, concurrency).map(item => this._optimizeItem(item))
      );
      results.push(...batchResults);
    }

    return results;
  }

  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async _optimizeItem(item) {
    // 优化逻辑
    return item;
  }

  // 性能指标
  recordMetric(name, value, tags = {}) {
    const key = `${name}:${JSON.stringify(tags)}`;
    const existing = this.metrics.get(key) || {
      name,
      tags,
      values: [],
      stats: {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        p50: 0,
        p95: 0,
        p99: 0
      }
    };

    existing.values.push(value);
    existing.stats.count++;
    existing.stats.sum += value;
    existing.stats.min = Math.min(existing.stats.min, value);
    existing.stats.max = Math.max(existing.stats.max, value);

    // 保持最近1000个值
    if (existing.values.length > 1000) {
      existing.values = existing.values.slice(-1000);
    }

    // 计算百分位数
    existing.values.sort((a, b) => a - b);
    const p50Idx = Math.floor(existing.values.length * 0.5);
    const p95Idx = Math.floor(existing.values.length * 0.95);
    const p99Idx = Math.floor(existing.values.length * 0.99);
    
    existing.stats.p50 = existing.values[p50Idx] || 0;
    existing.stats.p95 = existing.values[p95Idx] || 0;
    existing.stats.p99 = existing.values[p99Idx] || 0;

    this.metrics.set(key, existing);
    return existing.stats;
  }

  getMetrics(name, tags = {}) {
    const key = `${name}:${JSON.stringify(tags)}`;
    return this.metrics.get(key)?.stats || null;
  }

  // 自适应优化建议
  getOptimizationSuggestions() {
    const suggestions = [];

    // 缓存命中率分析
    for (const [key, item] of this.cache.entries()) {
      if (item.hits === 0) {
        suggestions.push({
          type: 'cache',
          action: 'remove',
          reason: 'Cache entry has no hits',
          key
        });
      }
    }

    // 性能指标分析
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.stats.p95 > 5000) {
        suggestions.push({
          type: 'performance',
          action: 'optimize',
          reason: 'P95 latency exceeds 5s',
          metric: key,
          current: metric.stats.p95
        });
      }
    }

    return suggestions;
  }
}

class AutoScaler {
  constructor() {
    this.rules = new Map();
    this.instances = new Map();
    this.scalingHistory = [];
  }

  addScalingRule(rule) {
    this.rules.set(rule.id, {
      ...rule,
      createdAt: Date.now(),
      lastTriggered: null
    });
  }

  evaluateScaling(serviceId) {
    const rule = this.rules.get(serviceId);
    if (!rule) return null;

    const metrics = this._getServiceMetrics(serviceId);
    const action = this._determineAction(rule, metrics);

    if (action) {
      this._executeScaling(serviceId, action, rule);
    }

    return action;
  }

  _getServiceMetrics(serviceId) {
    // 简化实现
    return {
      cpu: 50,
      memory: 60,
      requests: 1000,
      latency: 200
    };
  }

  _determineAction(rule, metrics) {
    const { conditions, action } = rule;
    
    for (const condition of conditions) {
      const metricValue = metrics[condition.metric];
      
      switch (condition.operator) {
        case 'gt':
          if (metricValue <= condition.value) return null;
          break;
        case 'lt':
          if (metricValue >= condition.value) return null;
          break;
        case 'eq':
          if (metricValue !== condition.value) return null;
          break;
      }
    }

    // 判断扩容还是缩容
    if (action.type === 'scale') {
      const currentInstances = this.instances.get(rule.serviceId) || 1;
      const newCount = action.direction === 'up' 
        ? Math.min(currentInstances + action.count, action.maxInstances || 10)
        : Math.max(currentInstances - action.count, action.minInstances || 1);
      
      if (newCount !== currentInstances) {
        return {
          type: 'scale',
          direction: action.direction,
          currentInstances,
          newInstances: newCount
        };
      }
    }

    return null;
  }

  _executeScaling(serviceId, action, rule) {
    this.scalingHistory.push({
      serviceId,
      action,
      ruleId: rule.id,
      timestamp: Date.now()
    });

    this.instances.set(serviceId, action.newInstances);
    rule.lastTriggered = Date.now();
  }
}

module.exports = { CostOptimizer, PerformanceOptimizer, AutoScaler };
