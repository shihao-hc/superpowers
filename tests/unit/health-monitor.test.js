const { HealthMonitor } = require('../../src/monitoring/HealthMonitor');

describe('HealthMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new HealthMonitor({ checkInterval: 50000, alertThreshold: 3 });
  });

  describe('constructor', () => {
    it('applies default options', () => {
      const m = new HealthMonitor();
      expect(m.maxHistory).toBe(100);
      expect(m.checkInterval).toBe(30000);
      expect(m.alertThreshold).toBe(3);
      expect(m.consecutiveFailures).toBe(0);
      expect(typeof m.onAlert).toBe('function');
    });

    it('accepts custom options', () => {
      const onAlert = jest.fn();
      const m = new HealthMonitor({
        maxHistory: 50, checkInterval: 10000, alertThreshold: 5, onAlert
      });
      expect(m.maxHistory).toBe(50);
      expect(m.checkInterval).toBe(10000);
      expect(m.alertThreshold).toBe(5);
      expect(m.consecutiveFailures).toBe(0);
      expect(m.onAlert).toBe(onAlert);
    });
  });

  describe('registerCheck', () => {
    it('registers a check with defaults', () => {
      const fn = async () => ({ ok: true });
      monitor.registerCheck('db', fn);

      const entry = monitor.checks.get('db');
      expect(entry.name).toBe('db');
      expect(entry.checkFn).toBe(fn);
      expect(entry.critical).toBe(true);
      expect(entry.timeout).toBe(5000);
      expect(entry.lastResult).toBeNull();
      expect(entry.lastCheck).toBeNull();
      expect(entry.failures).toBe(0);
    });

    it('registers a non-critical check', () => {
      monitor.registerCheck('cache', async () => ({}), { critical: false });
      expect(monitor.checks.get('cache').critical).toBe(false);
    });

    it('registers a check with custom timeout', () => {
      monitor.registerCheck('slow', async () => ({}), { timeout: 10000 });
      expect(monitor.checks.get('slow').timeout).toBe(10000);
    });
  });

  describe('runChecks', () => {
    it('returns healthy when all checks pass', async () => {
      monitor.registerCheck('db', async () => ({ latency: 5 }));
      monitor.registerCheck('api', async () => ({ healthy: true }));

      const results = await monitor.runChecks();

      expect(results.status).toBe('healthy');
      expect(results.checks.db.status).toBe('pass');
      expect(results.checks.db.latency).toBe(5);
      expect(results.checks.api.status).toBe('pass');
      expect(results.checks.api.healthy).toBe(true);
      expect(monitor.history).toHaveLength(1);
    });

    it('marks check as failed on thrown error', async () => {
      monitor.registerCheck('db', async () => { throw new Error('Connection refused'); });

      const results = await monitor.runChecks();

      expect(results.checks.db.status).toBe('fail');
      expect(results.checks.db.error).toBe('Connection refused');
      expect(results.checks.db.failures).toBe(1);
    });

    it('sets overall status to unhealthy on critical failure', async () => {
      monitor.registerCheck('critical-svc', async () => { throw new Error('Down'); });

      const results = await monitor.runChecks();

      expect(results.status).toBe('unhealthy');
    });

    it('keeps overall status healthy on non-critical failure', async () => {
      monitor.registerCheck('minor', async () => { throw new Error('Warning'); }, { critical: false });
      monitor.registerCheck('main', async () => ({ ok: true }));

      const results = await monitor.runChecks();

      expect(results.status).toBe('healthy');
      expect(results.checks.minor.status).toBe('fail');
      expect(results.checks.minor.failures).toBe(1);
    });

    it('handles check timeout', async () => {
      monitor.registerCheck('slow', () => new Promise(() => {}), { timeout: 50 });

      const results = await monitor.runChecks();

      expect(results.checks.slow.status).toBe('fail');
      expect(results.checks.slow.error).toBe('Timeout');
    });

    it('increments consecutive failures on repeated critical failures', async () => {
      const mon = new HealthMonitor({ alertThreshold: 3 });
      mon.registerCheck('critical-svc', async () => { throw new Error('Down'); });

      await mon.runChecks();
      expect(mon.consecutiveFailures).toBe(1);

      await mon.runChecks();
      expect(mon.consecutiveFailures).toBe(2);
    });

    it('resets consecutive failures on success', async () => {
      let shouldFail = true;
      monitor.registerCheck('flaky', async () => {
        if (shouldFail) { throw new Error('Fail'); }
        return { ok: true };
      });

      await monitor.runChecks();
      expect(monitor.consecutiveFailures).toBe(1);

      shouldFail = false;
      await monitor.runChecks();
      expect(monitor.consecutiveFailures).toBe(0);
    });

    it('triggers onAlert when threshold reached', async () => {
      const alertFn = jest.fn();
      monitor = new HealthMonitor({ alertThreshold: 2, onAlert: alertFn });
      monitor.registerCheck('critical-svc', async () => { throw new Error('Down'); });

      await monitor.runChecks();
      expect(alertFn).not.toHaveBeenCalled();

      await monitor.runChecks();
      expect(alertFn).toHaveBeenCalledWith({
        type: 'health_critical',
        message: 'Health check failed 2 consecutive times',
        checks: expect.any(Object)
      });
    });

    it('limits history to maxHistory', async () => {
      const m = new HealthMonitor({ maxHistory: 5 });
      m.registerCheck('t', async () => ({ ok: true }));
      for (let i = 0; i < 20; i++) {
        await m.runChecks();
      }
      expect(m.history.length).toBeLessThanOrEqual(5);
    });

    it('records duration for passing checks', async () => {
      monitor.registerCheck('fast', async () => ({ ok: true }));
      const results = await monitor.runChecks();
      expect(results.checks.fast.duration).toEqual(expect.any(Number));
    });
  });

  describe('start / stop', () => {
    it('start creates interval and runs initial check', async () => {
      const spy = jest.spyOn(global, 'setInterval');
      monitor.registerCheck('test', async () => ({ ok: true }));
      await monitor.start();

      expect(spy).toHaveBeenCalled();
      expect(monitor._timer).toBeDefined();
      clearInterval(monitor._timer);
      monitor._timer = null;
      spy.mockRestore();
    });

    it('start is idempotent', () => {
      const spy = jest.spyOn(global, 'setInterval');
      monitor.start();
      monitor.start();
      expect(spy).toHaveBeenCalledTimes(1);
      clearInterval(monitor._timer);
      monitor._timer = null;
      spy.mockRestore();
    });

    it('stop clears the timer', () => {
      monitor.start();
      const timer = monitor._timer;
      monitor.stop();
      expect(monitor._timer).toBeNull();
      clearInterval(timer);
    });

    it('stop is safe when timer is not running', () => {
      expect(() => { monitor.stop(); }).not.toThrow();
    });

    it('should run checks on interval', () => {
      jest.useFakeTimers();
      const m = new HealthMonitor({ checkInterval: 100 });
      m.registerCheck('test', async () => ({ ok: true }));
      m.start();
      const spy = jest.spyOn(m, 'runChecks');
      jest.advanceTimersByTime(100);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      m.stop();
      jest.useRealTimers();
    });
  });

  describe('getLastCheck', () => {
    it('returns null when no checks have run', () => {
      expect(monitor.getLastCheck()).toBeNull();
    });

    it('returns the most recent result', async () => {
      monitor.registerCheck('t', async () => ({ ok: true }));
      const results = await monitor.runChecks();
      expect(monitor.getLastCheck()).toBe(results);
    });
  });

  describe('getHistory', () => {
    it('returns empty array when no history', () => {
      expect(monitor.getHistory()).toEqual([]);
    });

    it('returns limited number of entries', async () => {
      monitor.registerCheck('t', async () => ({ ok: true }));
      for (let i = 0; i < 10; i++) {
        await monitor.runChecks();
      }
      expect(monitor.getHistory(5)).toHaveLength(5);
    });

    it('returns all entries when limit exceeds history', async () => {
      monitor.registerCheck('t', async () => ({ ok: true }));
      await monitor.runChecks();
      expect(monitor.getHistory(100)).toHaveLength(1);
    });
  });

  describe('getUptime', () => {
    it('returns 100 for empty history', () => {
      expect(monitor.getUptime()).toBe(100);
    });

    it('calculates percentage over last 20 entries', () => {
      monitor.history.push({ status: 'healthy' }, { status: 'healthy' });
      monitor.history.push({ status: 'unhealthy' });
      monitor.history.push({ status: 'healthy' });
      expect(monitor.getUptime()).toBe('75.00');
    });

    it('returns 100 when all healthy', async () => {
      monitor.registerCheck('t', async () => ({ ok: true }));
      await monitor.runChecks();
      expect(monitor.getUptime()).toBe('100.00');
    });

    it('returns 0 when all unhealthy', () => {
      for (let i = 0; i < 5; i++) {
        monitor.history.push({ status: 'unhealthy' });
      }
      expect(monitor.getUptime()).toBe('0.00');
    });
  });

  describe('getStats', () => {
    it('returns current stats', async () => {
      monitor.registerCheck('db', async () => ({ ok: true }));
      await monitor.runChecks();

      const stats = monitor.getStats();
      expect(stats.checks).toBe(1);
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.historySize).toBe(1);
      expect(stats.uptime).toBe('100.00%');
    });
  });

  describe('destroy', () => {
    it('stops timer and clears all state', () => {
      monitor.registerCheck('db', async () => ({ ok: true }));
      monitor.start();
      monitor.destroy();

      expect(monitor._timer).toBeNull();
      expect(monitor.checks.size).toBe(0);
      expect(monitor.history).toEqual([]);
    });
  });
});
