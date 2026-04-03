class AutoScaler {
  constructor(options = {}) {
    this.minInstances = options.minInstances || 1;
    this.maxInstances = options.maxInstances || 10;
    this.currentInstances = this.minInstances;
    this.scaleUpThreshold = options.scaleUpThreshold || 0.8;
    this.scaleDownThreshold = options.scaleDownThreshold || 0.2;
    this.cooldownPeriod = options.cooldownPeriod || 60000;
    this.checkInterval = options.checkInterval || 10000;
    this.metrics = {
      queueLength: 0,
      activeTasks: 0,
      completedTasks: 0,
      avgResponseTime: 0,
      cpuUsage: 0,
      memoryUsage: 0
    };
    this._checkTimer = null;
    this._lastScaleAction = 0;
    this._scaleHistory = [];
    this._onScale = options.onScale || (() => {});
    this._getMetrics = options.getMetrics || (() => this.metrics);
  }

  start() {
    if (this._checkTimer) return;

    this._checkTimer = setInterval(() => {
      this._checkAndScale();
    }, this.checkInterval);
  }

  stop() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
  }

  async _checkAndScale() {
    try {
      const metrics = await this._getMetrics();
      this.metrics = { ...this.metrics, ...metrics };

      const now = Date.now();
      if (now - this._lastScaleAction < this.cooldownPeriod) {
        return;
      }

      const load = this._calculateLoad();
      const recommendation = this._getScaleRecommendation(load);

      if (recommendation !== 'none') {
        await this._executeScale(recommendation, load);
      }

    } catch (error) {
      console.error('[AutoScaler] Check failed:', error.message);
    }
  }

  _calculateLoad() {
    const queueLoad = this.metrics.queueLength / (this.currentInstances * 10);
    const taskLoad = this.metrics.activeTasks / (this.currentInstances * 5);
    const responseLoad = Math.min(this.metrics.avgResponseTime / 5000, 1);

    return {
      queue: Math.min(queueLoad, 1),
      tasks: Math.min(taskLoad, 1),
      response: responseLoad,
      overall: (queueLoad + taskLoad + responseLoad) / 3
    };
  }

  _getScaleRecommendation(load) {
    if (load.overall >= this.scaleUpThreshold) {
      if (this.currentInstances < this.maxInstances) {
        return 'up';
      }
    }

    if (load.overall <= this.scaleDownThreshold) {
      if (this.currentInstances > this.minInstances) {
        return 'down';
      }
    }

    return 'none';
  }

  async _executeScale(direction, load) {
    const previousInstances = this.currentInstances;

    if (direction === 'up') {
      const increment = Math.ceil((load.overall - this.scaleUpThreshold) * 3) + 1;
      this.currentInstances = Math.min(
        this.currentInstances + increment,
        this.maxInstances
      );
    } else {
      const decrement = Math.ceil((this.scaleDownThreshold - load.overall) * 2) + 1;
      this.currentInstances = Math.max(
        this.currentInstances - decrement,
        this.minInstances
      );
    }

    this._lastScaleAction = Date.now();

    const scaleEvent = {
      direction,
      from: previousInstances,
      to: this.currentInstances,
      load,
      timestamp: Date.now()
    };

    this._scaleHistory.push(scaleEvent);
    if (this._scaleHistory.length > 100) {
      this._scaleHistory = this._scaleHistory.slice(-50);
    }

    this._onScale(scaleEvent);

    console.log(`[AutoScaler] Scaled ${direction}: ${previousInstances} → ${this.currentInstances} (load: ${(load.overall * 100).toFixed(1)}%)`);
  }

  updateMetrics(newMetrics) {
    this.metrics = { ...this.metrics, ...newMetrics };
  }

  manualScale(targetInstances) {
    const target = Math.max(this.minInstances, Math.min(this.maxInstances, targetInstances));
    const previous = this.currentInstances;

    if (target === previous) return false;

    this.currentInstances = target;
    this._lastScaleAction = Date.now();

    const scaleEvent = {
      direction: target > previous ? 'up' : 'down',
      from: previous,
      to: target,
      load: this._calculateLoad(),
      timestamp: Date.now(),
      manual: true
    };

    this._scaleHistory.push(scaleEvent);
    this._onScale(scaleEvent);

    return true;
  }

  getStatus() {
    return {
      currentInstances: this.currentInstances,
      minInstances: this.minInstances,
      maxInstances: this.maxInstances,
      metrics: this.metrics,
      load: this._calculateLoad(),
      lastScaleAction: this._lastScaleAction,
      scaleHistory: this._scaleHistory.slice(-10)
    };
  }

  getScaleHistory(limit = 20) {
    return this._scaleHistory.slice(-limit);
  }

  setThresholds(up, down) {
    this.scaleUpThreshold = Math.max(0.1, Math.min(0.9, up));
    this.scaleDownThreshold = Math.max(0.1, Math.min(up - 0.1, down));
  }

  setLimits(min, max) {
    this.minInstances = Math.max(1, min);
    this.maxInstances = Math.max(this.minInstances, max);
    this.currentInstances = Math.max(this.minInstances, Math.min(this.maxInstances, this.currentInstances));
  }

  destroy() {
    this.stop();
    this._scaleHistory = [];
  }
}

module.exports = { AutoScaler };
