const { Alert, AlertManager, ConsoleChannel, WebhookChannel } = require('../../src/monitoring/AlertNotificationSystem');

describe('AlertNotificationSystem', () => {
  describe('Alert', () => {
    let alert;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockImplementation(() => 1000000);
      alert = new Alert('test_alert', {
        name: 'test_alert',
        severity: 'warning',
        condition: (v) => v > 80,
        message: 'CPU too high',
        threshold: 80,
        cooldown: 60000
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('constructor', () => {
      it('should initialize with given config', () => {
        expect(alert.id).toBe('test_alert');
        expect(alert.name).toBe('test_alert');
        expect(alert.severity).toBe('warning');
        expect(alert.message).toBe('CPU too high');
        expect(alert.threshold).toBe(80);
        expect(alert.cooldown).toBe(60000);
        expect(alert.lastTriggered).toBeNull();
        expect(alert.isActive).toBe(false);
        expect(alert.triggerCount).toBe(0);
      });

      it('should use default severity and cooldown when not specified', () => {
        const a = new Alert('minimal', {
          name: 'minimal',
          condition: () => true,
          message: 'test'
        });
        expect(a.severity).toBe('warning');
        expect(a.cooldown).toBe(60000);
      });
    });

    describe('check', () => {
      it('should trigger when condition is met', () => {
        const triggered = alert.check(95);
        expect(triggered).toBe(true);
        expect(alert.isActive).toBe(true);
        expect(alert.triggerCount).toBe(1);
        expect(alert.lastTriggered).toBe(1000000);
      });

      it('should not trigger when condition is not met', () => {
        const triggered = alert.check(50);
        expect(triggered).toBe(false);
        expect(alert.isActive).toBe(false);
        expect(alert.triggerCount).toBe(0);
      });

      it('should resolve when value returns to normal and alert was active', () => {
        alert.check(95);
        expect(alert.isActive).toBe(true);

        const triggered = alert.check(50);
        expect(triggered).toBe(false);
        expect(alert.isActive).toBe(false);
      });

      it('should respect cooldown period', () => {
        alert.check(95);
        expect(alert.triggerCount).toBe(1);

        const result = alert.check(95);
        expect(result).toBe(false);
        expect(alert.triggerCount).toBe(1);

        jest.spyOn(Date, 'now').mockImplementation(() => 1000000 + 60001);
        const afterCooldown = alert.check(95);
        expect(afterCooldown).toBe(true);
        expect(alert.triggerCount).toBe(2);
      });

      it('should emit triggered event', () => {
        const handler = jest.fn();
        alert.on('triggered', handler);

        alert.check(95);

        expect(handler).toHaveBeenCalledWith({
          alert,
          context: true,
          timestamp: 1000000
        });
      });

      it('should emit resolved event', () => {
        const resolvedHandler = jest.fn();
        alert.on('resolved', resolvedHandler);

        alert.check(95);
        alert.check(50);

        expect(resolvedHandler).toHaveBeenCalledWith({
          alert,
          duration: 0
        });
      });
    });

    describe('canTrigger', () => {
      it('should return true when never triggered', () => {
        expect(alert.canTrigger()).toBe(true);
      });

      it('should return false within cooldown', () => {
        alert.lastTriggered = 1000000;
        jest.spyOn(Date, 'now').mockImplementation(() => 1000000 + 30000);
        expect(alert.canTrigger()).toBe(false);
      });

      it('should return true after cooldown', () => {
        alert.lastTriggered = 1000000;
        jest.spyOn(Date, 'now').mockImplementation(() => 1000000 + 60001);
        expect(alert.canTrigger()).toBe(true);
      });
    });

    describe('trigger', () => {
      it('should set active state and increment count', () => {
        alert.trigger({ value: 95 });
        expect(alert.isActive).toBe(true);
        expect(alert.triggerCount).toBe(1);
        expect(alert.lastTriggered).toBe(1000000);
      });

      it('should emit triggered event with context', () => {
        const handler = jest.fn();
        alert.on('triggered', handler);

        alert.trigger({ value: 95 });

        expect(handler).toHaveBeenCalledWith({
          alert,
          context: { value: 95 },
          timestamp: 1000000
        });
      });
    });

    describe('resolve', () => {
      it('should set isActive to false and emit resolved', () => {
        alert.isActive = true;
        alert.lastTriggered = 1000000;

        const handler = jest.fn();
        alert.on('resolved', handler);

        alert.resolve();

        expect(alert.isActive).toBe(false);
        expect(handler).toHaveBeenCalledWith({
          alert,
          duration: 0
        });
      });
    });

    describe('getStatus', () => {
      it('should return current alert status', () => {
        alert.isActive = true;
        alert.lastTriggered = 1000000;
        alert.triggerCount = 3;

        const status = alert.getStatus();
        expect(status).toEqual({
          id: 'test_alert',
          name: 'test_alert',
          severity: 'warning',
          isActive: true,
          lastTriggered: 1000000,
          triggerCount: 3
        });
      });
    });
  });

  describe('AlertManager', () => {
    let manager;

    beforeEach(() => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'error').mockImplementation(() => {});
      manager = new AlertManager();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('constructor', () => {
      it('should initialize with default options', () => {
        expect(manager.options.enableNotifications).toBe(true);
        expect(manager.alerts).toBeInstanceOf(Map);
        expect(manager.handlers).toBeInstanceOf(Map);
        expect(manager.notificationChannels).toBeInstanceOf(Set);
      });

      it('should accept custom options', () => {
        const custom = new AlertManager({ enableNotifications: false });
        expect(custom.options.enableNotifications).toBe(false);
      });
    });

    describe('createAlert', () => {
      it('should create and register an alert', () => {
        const alert = manager.createAlert('high_cpu', {
          name: 'high_cpu',
          severity: 'warning',
          condition: (v) => v > 80,
          message: 'CPU high',
          threshold: 80
        });

        expect(alert).toBeInstanceOf(Alert);
        expect(alert.id).toMatch(/^alert_/);
        expect(alert.name).toBe('high_cpu');
        expect(manager.alerts.has(alert.id)).toBe(true);
      });

      it('should forward alert events as manager events', () => {
        const alert = manager.createAlert('test', {
          name: 'test',
          condition: (v) => v > 50,
          message: 'test'
        });

        const triggeredHandler = jest.fn();
        const resolvedHandler = jest.fn();
        manager.on('alert:triggered', triggeredHandler);
        manager.on('alert:resolved', resolvedHandler);

        alert.check(100);
        alert.check(0);

        expect(triggeredHandler).toHaveBeenCalled();
        expect(resolvedHandler).toHaveBeenCalled();
      });
    });

    describe('addHandler', () => {
      it('should add event handler to an existing alert', () => {
        const alert = manager.createAlert('cpu', {
          name: 'cpu',
          condition: (v) => v > 80,
          message: 'CPU high'
        });

        const handler = jest.fn();
        manager.addHandler(alert.id, handler);

        alert.check(90);
        expect(handler).toHaveBeenCalled();
      });

      it('should silently ignore non-existent alert id', () => {
        expect(() => manager.addHandler('ghost', jest.fn())).not.toThrow();
      });
    });

    describe('registerChannel / unregisterChannel', () => {
      it('should register and unregister a notification channel', () => {
        const channel = { send: jest.fn() };
        manager.registerChannel(channel);
        expect(manager.notificationChannels.has(channel)).toBe(true);

        manager.unregisterChannel(channel);
        expect(manager.notificationChannels.has(channel)).toBe(false);
      });
    });

    describe('handleTriggered', () => {
      it('should not send notifications when disabled', () => {
        const custom = new AlertManager({ enableNotifications: false });
        const channel = { send: jest.fn() };
        custom.registerChannel(channel);

        custom.handleTriggered({ alert: { severity: 'warning' } });

        expect(channel.send).not.toHaveBeenCalled();
      });

      it('should send to all registered channels', () => {
        const channel1 = { send: jest.fn() };
        const channel2 = { send: jest.fn() };
        manager.registerChannel(channel1);
        manager.registerChannel(channel2);

        manager.handleTriggered({ alert: 'test' });

        expect(channel1.send).toHaveBeenCalledWith({ alert: 'test' });
        expect(channel2.send).toHaveBeenCalledWith({ alert: 'test' });
      });

      it('should handle channel send errors gracefully', () => {
        const channel = { send: jest.fn(() => { throw new Error('send fail'); }) };
        manager.registerChannel(channel);

        expect(() => manager.handleTriggered({ alert: 'test' })).not.toThrow();
        expect(console.error).toHaveBeenCalledWith('Notification failed:', 'send fail');
      });
    });

    describe('checkAll', () => {
      beforeEach(() => {
        manager.createAlert('cpu', {
          name: 'high_cpu',
          condition: (v) => v > 80,
          message: 'CPU high'
        });

        manager.createAlert('mem', {
          name: 'high_memory',
          severity: 'error',
          condition: (v) => v > 90,
          message: 'Memory high',
          threshold: 90
        });
      });

      it('should check all alerts against metrics', () => {
        const results = manager.checkAll({
          high_cpu: 95,
          high_memory: 50
        });

        expect(results).toHaveLength(2);
        expect(results[0].triggered).toBe(true);
        expect(results[1].triggered).toBe(false);
      });

      it('should return empty when no metrics match alert names', () => {
        const results = manager.checkAll({});
        expect(results).toEqual([]);
      });

      it('should return empty for non-object metrics', () => {
        const results = manager.checkAll('not_an_object');
        expect(results).toEqual([]);
      });
    });

    describe('getMetricValue', () => {
      it('should return metric value from object', () => {
        expect(manager.getMetricValue({ cpu: 90 }, 'cpu')).toBe(90);
      });

      it('should return undefined for non-object types', () => {
        expect(manager.getMetricValue('string', 'cpu')).toBeUndefined();
        expect(manager.getMetricValue(undefined, 'cpu')).toBeUndefined();
      });
    });

    describe('getStatus', () => {
      it('should return empty status when no alerts', () => {
        const status = manager.getStatus();
        expect(status.total).toBe(0);
        expect(status.active).toBe(0);
        expect(status.bySeverity).toEqual({
          critical: 0,
          error: 0,
          warning: 0,
          info: 0
        });
        expect(status.alerts).toEqual([]);
      });

      it('should aggregate alert statuses', () => {
        const cpuAlert = manager.createAlert('cpu', {
          name: 'high_cpu',
          severity: 'warning',
          condition: (v) => v > 80,
          message: 'CPU high'
        });

        manager.createAlert('err', {
          name: 'high_error',
          severity: 'error',
          condition: (v) => v > 5,
          message: 'Error rate high'
        });

        cpuAlert.check(90);

        const status = manager.getStatus();
        expect(status.total).toBe(2);
        expect(status.active).toBe(1);
        expect(status.bySeverity.warning).toBe(1);
        expect(status.bySeverity.error).toBe(0);
        expect(status.alerts).toHaveLength(2);
      });

      it('should count critical severity alerts', () => {
        const crit = manager.createAlert('crit1', {
          name: 'crit1',
          severity: 'critical',
          condition: (v) => v > 50,
          message: 'crit'
        });
        crit.check(100);

        const status = manager.getStatus();
        expect(status.bySeverity.critical).toBe(1);

        const resolved = manager.createAlert('crit2', {
          name: 'crit2',
          severity: 'critical',
          condition: (v) => v > 50,
          message: 'crit2'
        });
        resolved.check(30);

        const status2 = manager.getStatus();
        expect(status2.bySeverity.critical).toBe(1);
      });

      it('should count info severity alerts', () => {
        const info = manager.createAlert('info1', {
          name: 'info1',
          severity: 'info',
          condition: (v) => v > 50,
          message: 'info'
        });
        info.check(100);

        const status = manager.getStatus();
        expect(status.bySeverity.info).toBe(1);
      });
    });

    describe('createPresetAlerts', () => {
      it('should create 4 preset alerts', () => {
        AlertManager.createPresetAlerts(manager);
        expect(manager.alerts.size).toBe(4);
      });

      it('should create alerts with correct configurations', () => {
        AlertManager.createPresetAlerts(manager);

        const alerts = Array.from(manager.alerts.values());
        const names = alerts.map((a) => a.name);
        expect(names).toContain('high_cpu');
        expect(names).toContain('high_memory');
        expect(names).toContain('high_error_rate');
        expect(names).toContain('high_latency');

        const cpuAlert = alerts.find((a) => a.name === 'high_cpu');
        expect(cpuAlert.severity).toBe('warning');
        expect(cpuAlert.threshold).toBe(80);

        const errorAlert = alerts.find((a) => a.name === 'high_error_rate');
        expect(errorAlert.severity).toBe('error');
        expect(errorAlert.threshold).toBe(0.05);
      });

      it('should trigger preset alerts when threshold exceeded', () => {
        AlertManager.createPresetAlerts(manager);
        const alerts = Array.from(manager.alerts.values());

        const cpu = alerts.find((a) => a.name === 'high_cpu');
        expect(cpu.check(90)).toBe(true);

        const mem = alerts.find((a) => a.name === 'high_memory');
        expect(mem.check(90)).toBe(true);

        const err = alerts.find((a) => a.name === 'high_error_rate');
        expect(err.check(0.1)).toBe(true);

        const lat = alerts.find((a) => a.name === 'high_latency');
        expect(lat.check(2000)).toBe(true);
      });

      it('should not trigger preset alerts when threshold not exceeded', () => {
        AlertManager.createPresetAlerts(manager);
        const alerts = Array.from(manager.alerts.values());

        const cpu = alerts.find((a) => a.name === 'high_cpu');
        expect(cpu.check(70)).toBe(false);

        const mem = alerts.find((a) => a.name === 'high_memory');
        expect(mem.check(70)).toBe(false);

        const err = alerts.find((a) => a.name === 'high_error_rate');
        expect(err.check(0.01)).toBe(false);

        const lat = alerts.find((a) => a.name === 'high_latency');
        expect(lat.check(500)).toBe(false);
      });
    });
  });

  describe('ConsoleChannel', () => {
    it('should log alert message to console', () => {
      const channel = new ConsoleChannel();
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      channel.send({
        alert: { severity: 'warning', message: 'CPU too high' },
        context: { value: 95 }
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('CPU too high'),
        { value: 95 }
      );
      logSpy.mockRestore();
    });
  });

  describe('WebhookChannel', () => {
    afterEach(() => {
      delete global.fetch;
    });

    it('should send POST request with alert data', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      const channel = new WebhookChannel('https://hooks.example.com/alert', {
        headers: { 'X-Custom': 'val' }
      });

      await channel.send({
        alert: { name: 'high_cpu', severity: 'warning', message: 'CPU high' },
        context: { cpu: 95 },
        timestamp: 1000000
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.example.com/alert',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom': 'val'
          }),
          body: expect.any(String)
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.alert).toBe('high_cpu');
      expect(body.severity).toBe('warning');
      expect(body.message).toBe('CPU high');
    });

    it('should throw on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      const channel = new WebhookChannel('https://hooks.example.com/alert');

      await expect(channel.send({
        alert: { name: 'test', severity: 'error', message: 'fail' },
        context: {},
        timestamp: 0
      })).rejects.toThrow('Webhook failed: 500');
    });

    it('should propagate fetch errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

      const channel = new WebhookChannel('https://hooks.example.com/alert');

      await expect(channel.send({
        alert: { name: 'test', severity: 'error', message: 'fail' },
        context: {},
        timestamp: 0
      })).rejects.toThrow('network error');
    });
  });
});
