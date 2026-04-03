class HealthMonitor {
  constructor(options = {}) {
    this.checks = new Map();
    this.history = [];
    this.maxHistory = options.maxHistory || 100;
    this.checkInterval = options.checkInterval || 30000;
    this.alertThreshold = options.alertThreshold || 3;
    this.consecutiveFailures = 0;
    this.onAlert = options.onAlert || (() => {});
    this._timer = null;
  }

  registerCheck(name, checkFn, options = {}) {
    this.checks.set(name, {
      name,
      checkFn,
      critical: options.critical !== false,
      timeout: options.timeout || 5000,
      lastResult: null,
      lastCheck: null,
      failures: 0
    });
  }

  async runChecks() {
    const results = {
      timestamp: Date.now(),
      status: 'healthy',
      checks: {}
    };

    let hasCriticalFailure = false;

    for (const [name, check] of this.checks) {
      try {
        const startTime = Date.now();
        const checkResult = await Promise.race([
          check.checkFn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), check.timeout)
          )
        ]);

        const duration = Date.now() - startTime;

        results.checks[name] = {
          status: 'pass',
          duration,
          ...checkResult
        };

        check.lastResult = results.checks[name];
        check.lastCheck = Date.now();
        check.failures = 0;

      } catch (error) {
        check.failures++;

        results.checks[name] = {
          status: 'fail',
          error: error.message,
          failures: check.failures
        };

        check.lastResult = results.checks[name];

        if (check.critical) {
          hasCriticalFailure = true;
        }
      }
    }

    results.status = hasCriticalFailure ? 'unhealthy' : 'healthy';

    this.history.push(results);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory / 2);
    }

    if (hasCriticalFailure) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.alertThreshold) {
        this.onAlert({
          type: 'health_critical',
          message: `Health check failed ${this.consecutiveFailures} consecutive times`,
          checks: results.checks
        });
      }
    } else {
      this.consecutiveFailures = 0;
    }

    return results;
  }

  start() {
    if (this._timer) return;

    this._timer = setInterval(() => {
      this.runChecks().catch(console.error);
    }, this.checkInterval);

    this.runChecks().catch(console.error);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getLastCheck() {
    return this.history[this.history.length - 1] || null;
  }

  getHistory(limit = 20) {
    return this.history.slice(-limit);
  }

  getUptime() {
    if (this.history.length === 0) return 100;

    const recent = this.history.slice(-20);
    const healthy = recent.filter(h => h.status === 'healthy').length;
    return (healthy / recent.length * 100).toFixed(2);
  }

  getStats() {
    return {
      checks: this.checks.size,
      consecutiveFailures: this.consecutiveFailures,
      uptime: this.getUptime() + '%',
      historySize: this.history.length
    };
  }

  destroy() {
    this.stop();
    this.checks.clear();
    this.history = [];
  }
}

module.exports = { HealthMonitor };
