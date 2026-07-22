/**
 * AutoScaler
 * 自动扩缩容系统
 */

const { EventEmitter } = require('events');

class ScalingRule {
  constructor(config) {
    this.name = config.name;
    this.metric = config.metric;
    this.condition = config.condition;
    this.action = config.action;
    this.cooldown = config.cooldown || 60000;
    this.lastTriggered = null;
  }

  evaluate(metrics) {
    const value = metrics[this.metric];
    if (value === undefined) {return false;}

    const result = this.condition(value);

    if (result && this.canTrigger()) {
      this.lastTriggered = Date.now();
      return this.action;
    }

    return false;
  }

  canTrigger() {
    if (!this.lastTriggered) {return true;}
    return Date.now() - this.lastTriggered > this.cooldown;
  }
}

class AutoScaler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      minReplicas: options.minReplicas || 1,
      maxReplicas: options.maxReplicas || 10,
      scaleInterval: options.scaleInterval || 30000,
      stabilizationWindow: options.stabilizationWindow || 300000,
      ...options
    };

    this.rules = [];
    this.currentReplicas = this.options.minReplicas;
    this.targetReplicas = this.currentReplicas;
    this.metricsHistory = [];
    this.maxHistoryLength = 100;

    this.timer = null;
    this.isRunning = false;
  }

  /**
   * 添加扩缩容规则
   */
  addRule(config) {
    const rule = new ScalingRule(config);
    this.rules.push(rule);
    return this;
  }

  /**
   * 预设规则
   */
  addPresetRules() {
    // CPU 使用率规则
    this.addRule({
      name: 'high_cpu_scale_up',
      metric: 'cpu_usage',
      condition: (value) => value > 80,
      action: 'scale_up',
      cooldown: 120000
    });

    this.addRule({
      name: 'low_cpu_scale_down',
      metric: 'cpu_usage',
      condition: (value) => value < 20,
      action: 'scale_down',
      cooldown: 300000
    });

    // 内存使用率规则
    this.addRule({
      name: 'high_memory_scale_up',
      metric: 'memory_usage',
      condition: (value) => value > 85,
      action: 'scale_up',
      cooldown: 180000
    });

    // 请求队列规则
    this.addRule({
      name: 'high_queue_scale_up',
      metric: 'queue_depth',
      condition: (value) => value > 100,
      action: 'scale_up',
      cooldown: 60000
    });

    this.addRule({
      name: 'low_queue_scale_down',
      metric: 'queue_depth',
      condition: (value) => value < 10,
      action: 'scale_down',
      cooldown: 600000
    });

    return this;
  }

  /**
   * 记录指标
   */
  recordMetric(metric, value, labels = {}) {
    const entry = {
      timestamp: Date.now(),
      metric,
      value,
      labels,
      replicas: this.currentReplicas
    };

    this.metricsHistory.push(entry);

    if (this.metricsHistory.length > this.maxHistoryLength) {
      this.metricsHistory.shift();
    }
  }

  /**
   * 启动自动扩缩容
   */
  start() {
    if (this.isRunning) {return;}

    this.isRunning = true;
    this.timer = setInterval(() => this.evaluate(), this.options.scaleInterval);

    this.emit('started');
  }

  /**
   * 停止自动扩缩容
   */
  stop() {
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.emit('stopped');
  }

  /**
   * 评估扩缩容
   */
  async evaluate() {
    const metrics = this.getCurrentMetrics();
    const scaleActions = [];

    for (const rule of this.rules) {
      const action = rule.evaluate(metrics);
      if (action) {
        scaleActions.push({ rule: rule.name, action });
      }
    }

    if (scaleActions.length === 0) {return;}

    // 计算目标副本数
    const newReplicas = this.calculateTargetReplicas(scaleActions);

    if (newReplicas !== this.targetReplicas) {
      await this.scale(newReplicas);
    }
  }

  /**
   * 获取当前指标值
   */
  getCurrentMetrics() {
    const latest = {};

    for (const entry of this.metricsHistory) {
      if (latest[entry.metric] === undefined) {
        latest[entry.metric] = entry.value;
      }
    }

    return latest;
  }

  /**
   * 计算目标副本数
   */
  calculateTargetReplicas(actions) {
    let target = this.currentReplicas;

    for (const { action } of actions) {
      if (action === 'scale_up') {
        target = Math.min(target + 1, this.options.maxReplicas);
      } else if (action === 'scale_down') {
        target = Math.max(target - 1, this.options.minReplicas);
      }
    }

    // 稳定性窗口：检查历史是否有波动
    if (this.hasUnstableHistory()) {
      target = this.currentReplicas;
    }

    return target;
  }

  /**
   * 检查历史是否稳定
   */
  hasUnstableHistory() {
    const recent = this.metricsHistory.slice(-10);
    const replicaChanges = recent.filter((m, i) =>
      i > 0 && m.replicas !== recent[i - 1].replicas
    );

    return replicaChanges.length >= 3;
  }

  /**
   * 执行扩缩容
   */
  async scale(targetReplicas) {
    if (targetReplicas < this.options.minReplicas ||
        targetReplicas > this.options.maxReplicas) {
      return false;
    }

    const oldReplicas = this.currentReplicas;
    this.targetReplicas = targetReplicas;

    this.emit('scaling', {
      from: oldReplicas,
      to: targetReplicas,
      reason: this.getScaleReason()
    });

    // 实际执行扩缩容逻辑
    // 这里简化实现
    this.currentReplicas = targetReplicas;

    this.emit('scaled', {
      from: oldReplicas,
      to: targetReplicas
    });

    return true;
  }

  /**
   * 获取扩缩容原因
   */
  getScaleReason() {
    const metrics = this.getCurrentMetrics();
    return Object.entries(metrics)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
  }

  /**
   * 手动设置副本数
   */
  async setReplicas(count) {
    return this.scale(count);
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentReplicas: this.currentReplicas,
      targetReplicas: this.targetReplicas,
      minReplicas: this.options.minReplicas,
      maxReplicas: this.options.maxReplicas,
      metrics: this.getCurrentMetrics(),
      rules: this.rules.map((r) => ({
        name: r.name,
        metric: r.metric,
        lastTriggered: r.lastTriggered
      }))
    };
  }

  /**
   * 获取扩缩容历史
   */
  getHistory(limit = 100) {
    return this.metricsHistory.slice(-limit);
  }
}

module.exports = { AutoScaler, ScalingRule };
