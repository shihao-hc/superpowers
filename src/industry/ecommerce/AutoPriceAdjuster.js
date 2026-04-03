const crypto = require('crypto');

class AutoPriceAdjuster {
  constructor(options = {}) {
    this.rules = new Map();
    this.executions = [];
    this.maxExecutions = options.maxExecutions || 500;
    this.autoExecute = options.autoExecute || false;
    this.onAdjust = options.onAdjust || (() => {});
    this.onNotify = options.onNotify || (() => {});
    this.onError = options.onError || ((e) => console.error('[AutoPrice]', e));
  }

  addRule(config) {
    const ruleId = `rule_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const rule = {
      id: ruleId,
      name: config.name,
      productId: config.productId,
      productName: config.productName,
      condition: {
        type: config.conditionType || 'price_below',
        value: config.conditionValue,
        competitorUrl: config.competitorUrl || null
      },
      action: {
        type: config.actionType || 'set_price',
        value: config.actionValue,
        percentage: config.actionPercentage || null
      },
      limits: {
        minPrice: config.minPrice || 0,
        maxPrice: config.maxPrice || Infinity,
        maxAdjustment: config.maxAdjustment || 20
      },
      enabled: config.enabled !== false,
      createdAt: Date.now(),
      lastTriggered: null,
      triggerCount: 0
    };

    this.rules.set(ruleId, rule);
    return rule;
  }

  removeRule(ruleId) {
    return this.rules.delete(ruleId);
  }

  async evaluate(productId, currentPrice, competitorPrice = null) {
    const triggeredRules = [];

    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled) continue;
      if (rule.productId && rule.productId !== productId) continue;

      let triggered = false;

      switch (rule.condition.type) {
        case 'price_below':
          triggered = currentPrice <= rule.condition.value;
          break;
        case 'price_above':
          triggered = currentPrice >= rule.condition.value;
          break;
        case 'competitor_lower':
          if (competitorPrice !== null) {
            triggered = competitorPrice < currentPrice;
          }
          break;
        case 'competitor_higher':
          if (competitorPrice !== null) {
            triggered = competitorPrice > currentPrice;
          }
          break;
        case 'competitor_diff':
          if (competitorPrice !== null) {
            const diff = Math.abs(currentPrice - competitorPrice) / currentPrice * 100;
            triggered = diff >= rule.condition.value;
          }
          break;
      }

      if (triggered) {
        const newPrice = this._calculateNewPrice(rule, currentPrice, competitorPrice);

        if (newPrice !== null && newPrice >= rule.limits.minPrice && newPrice <= rule.limits.maxPrice) {
          const adjustment = Math.abs((newPrice - currentPrice) / currentPrice * 100);

          if (adjustment <= rule.limits.maxAdjustment) {
            triggeredRules.push({
              rule,
              currentPrice,
              newPrice,
              adjustment: adjustment.toFixed(2) + '%',
              reason: this._getReason(rule, currentPrice, competitorPrice)
            });
          }
        }
      }
    }

    return triggeredRules;
  }

  _calculateNewPrice(rule, currentPrice, competitorPrice) {
    switch (rule.action.type) {
      case 'set_price':
        return rule.action.value;

      case 'match_competitor':
        return competitorPrice || currentPrice;

      case 'undercut_competitor':
        if (competitorPrice) {
          const undercut = rule.action.percentage || 1;
          return competitorPrice * (1 - undercut / 100);
        }
        return null;

      case 'percentage_change':
        const change = rule.action.percentage || 0;
        return currentPrice * (1 + change / 100);

      case 'fixed_change':
        return currentPrice + (rule.action.value || 0);

      default:
        return null;
    }
  }

  _getReason(rule, currentPrice, competitorPrice) {
    switch (rule.condition.type) {
      case 'price_below':
        return `价格 ${currentPrice} 低于阈值 ${rule.condition.value}`;
      case 'price_above':
        return `价格 ${currentPrice} 高于阈值 ${rule.condition.value}`;
      case 'competitor_lower':
        return `竞品价格 ${competitorPrice} 低于当前价格 ${currentPrice}`;
      case 'competitor_higher':
        return `竞品价格 ${competitorPrice} 高于当前价格 ${currentPrice}`;
      case 'competitor_diff':
        return `价格差异超过 ${rule.condition.value}%`;
      default:
        return '条件触发';
    }
  }

  async execute(productId, newPrice, ruleId, reason) {
    const execution = {
      id: `exec_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      productId,
      ruleId,
      newPrice,
      reason,
      status: this.autoExecute ? 'executed' : 'pending',
      timestamp: Date.now()
    };

    this.executions.push(execution);

    if (this.executions.length > this.maxExecutions) {
      this.executions = this.executions.slice(-this.maxExecutions);
    }

    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.lastTriggered = Date.now();
      rule.triggerCount++;
    }

    this.onAdjust(execution);
    this.onNotify({
      type: 'price_adjustment',
      productId,
      newPrice,
      reason,
      ruleId
    });

    return execution;
  }

  async approveExecution(executionId) {
    const execution = this.executions.find(e => e.id === executionId);
    if (!execution) return false;

    execution.status = 'approved';
    execution.approvedAt = Date.now();

    return true;
  }

  async rejectExecution(executionId, reason) {
    const execution = this.executions.find(e => e.id === executionId);
    if (!execution) return false;

    execution.status = 'rejected';
    execution.rejectedAt = Date.now();
    execution.rejectReason = reason;

    return true;
  }

  getRule(ruleId) {
    return this.rules.get(ruleId);
  }

  getAllRules() {
    return Array.from(this.rules.values());
  }

  getActiveRules() {
    return Array.from(this.rules.values()).filter(r => r.enabled);
  }

  getPendingExecutions() {
    return this.executions.filter(e => e.status === 'pending');
  }

  getExecutionHistory(limit = 50) {
    return this.executions.slice(-limit);
  }

  getStats() {
    const rules = Array.from(this.rules.values());
    const executions = this.executions;

    return {
      rules: {
        total: rules.length,
        enabled: rules.filter(r => r.enabled).length
      },
      executions: {
        total: executions.length,
        pending: executions.filter(e => e.status === 'pending').length,
        approved: executions.filter(e => e.status === 'approved').length,
        rejected: executions.filter(e => e.status === 'rejected').length
      }
    };
  }

  destroy() {
    this.rules.clear();
    this.executions = [];
  }
}

module.exports = { AutoPriceAdjuster };
