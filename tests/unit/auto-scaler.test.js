const { AutoScaler, ScalingRule } = require('../../src/integration/AutoScaler');

describe('ScalingRule', () => {
  describe('constructor', () => {
    it('sets name, metric, condition, action, cooldown', () => {
      const rule = new ScalingRule({
        name: 'test',
        metric: 'cpu',
        condition: (v) => v > 80,
        action: 'scale_up',
        cooldown: 60000
      });
      expect(rule.name).toBe('test');
      expect(rule.metric).toBe('cpu');
      expect(rule.condition(85)).toBe(true);
      expect(rule.condition(75)).toBe(false);
      expect(rule.action).toBe('scale_up');
      expect(rule.cooldown).toBe(60000);
      expect(rule.lastTriggered).toBeNull();
    });

    it('uses default cooldown of 60000', () => {
      const rule = new ScalingRule({ name: 't', metric: 'm', condition: () => true, action: 'scale_up' });
      expect(rule.cooldown).toBe(60000);
    });
  });

  describe('evaluate', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(1000);
    });
    afterEach(() => jest.useRealTimers());

    it('returns false when metric is missing', () => {
      const rule = new ScalingRule({ name: 't', metric: 'cpu', condition: () => true, action: 'scale_up' });
      expect(rule.evaluate({})).toBe(false);
    });

    it('returns action when condition is met and can trigger', () => {
      const rule = new ScalingRule({ name: 't', metric: 'cpu', condition: (v) => v > 80, action: 'scale_up' });
      expect(rule.evaluate({ cpu: 90 })).toBe('scale_up');
      expect(rule.lastTriggered).toBe(1000);
    });

    it('returns false when condition is not met', () => {
      const rule = new ScalingRule({ name: 't', metric: 'cpu', condition: (v) => v > 80, action: 'scale_up' });
      expect(rule.evaluate({ cpu: 50 })).toBe(false);
    });

    it('respects cooldown period', () => {
      const rule = new ScalingRule({ name: 't', metric: 'cpu', condition: (v) => v > 80, action: 'scale_up', cooldown: 5000 });
      expect(rule.evaluate({ cpu: 90 })).toBe('scale_up');
      jest.advanceTimersByTime(3000);
      expect(rule.evaluate({ cpu: 90 })).toBe(false);
      jest.advanceTimersByTime(2001);
      expect(rule.evaluate({ cpu: 90 })).toBe('scale_up');
    });
  });

  describe('canTrigger', () => {
    it('returns true when lastTriggered is null', () => {
      const rule = new ScalingRule({ name: 't', metric: 'm', condition: () => true, action: 'scale_up' });
      expect(rule.canTrigger()).toBe(true);
    });

    it('returns false during cooldown', () => {
      jest.useFakeTimers();
      jest.setSystemTime(1000);
      const rule = new ScalingRule({ name: 't', metric: 'm', condition: () => true, action: 'scale_up', cooldown: 5000 });
      rule.lastTriggered = 1000;
      jest.advanceTimersByTime(3000);
      expect(rule.canTrigger()).toBe(false);
      jest.advanceTimersByTime(2001);
      expect(rule.canTrigger()).toBe(true);
      jest.useRealTimers();
    });
  });
});

describe('AutoScaler', () => {
  let scaler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1000);
    scaler = new AutoScaler({ scaleInterval: 999999 });
  });

  afterEach(() => {
    scaler.stop();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('sets default options', () => {
      const s = new AutoScaler();
      expect(s.options.minReplicas).toBe(1);
      expect(s.options.maxReplicas).toBe(10);
      expect(s.options.scaleInterval).toBe(30000);
      expect(s.options.stabilizationWindow).toBe(300000);
      expect(s.currentReplicas).toBe(1);
      expect(s.targetReplicas).toBe(1);
      expect(s.rules).toEqual([]);
      expect(s.metricsHistory).toEqual([]);
      expect(s.isRunning).toBe(false);
      expect(s.timer).toBeNull();
      s.stop();
    });

    it('accepts custom options', () => {
      const s = new AutoScaler({ minReplicas: 2, maxReplicas: 20, scaleInterval: 10000 });
      expect(s.options.minReplicas).toBe(2);
      expect(s.options.maxReplicas).toBe(20);
      expect(s.options.scaleInterval).toBe(10000);
      expect(s.currentReplicas).toBe(2);
      s.stop();
    });
  });

  describe('addRule', () => {
    it('adds a ScalingRule and returns this', () => {
      const result = scaler.addRule({ name: 't', metric: 'cpu', condition: (v) => v > 80, action: 'scale_up' });
      expect(result).toBe(scaler);
      expect(scaler.rules).toHaveLength(1);
      expect(scaler.rules[0]).toBeInstanceOf(ScalingRule);
      expect(scaler.rules[0].name).toBe('t');
    });
  });

  describe('addPresetRules', () => {
    it('adds 5 preset rules and returns this', () => {
      const result = scaler.addPresetRules();
      expect(result).toBe(scaler);
      expect(scaler.rules).toHaveLength(5);
      expect(scaler.rules.map(r => r.name)).toEqual([
        'high_cpu_scale_up', 'low_cpu_scale_down', 'high_memory_scale_up',
        'high_queue_scale_up', 'low_queue_scale_down'
      ]);
    });
  });

  describe('recordMetric', () => {
    it('adds metric entry with timestamp and replicas', () => {
      scaler.recordMetric('cpu', 75, { host: 'web-1' });
      expect(scaler.metricsHistory).toHaveLength(1);
      const entry = scaler.metricsHistory[0];
      expect(entry.metric).toBe('cpu');
      expect(entry.value).toBe(75);
      expect(entry.labels).toEqual({ host: 'web-1' });
      expect(entry.timestamp).toBe(1000);
      expect(entry.replicas).toBe(1);
    });

    it('trims history when over maxHistoryLength', () => {
      scaler.maxHistoryLength = 3;
      for (let i = 0; i < 5; i++) {
        scaler.recordMetric('cpu', i);
      }
      expect(scaler.metricsHistory).toHaveLength(3);
      expect(scaler.metricsHistory[0].value).toBe(2);
    });

    it('uses empty labels default', () => {
      scaler.recordMetric('cpu', 50);
      expect(scaler.metricsHistory[0].labels).toEqual({});
    });
  });

  describe('start / stop', () => {
    it('starts the scaler and emits started', () => {
      const events = [];
      scaler.on('started', () => events.push('started'));
      scaler.start();
      expect(scaler.isRunning).toBe(true);
      expect(scaler.timer).not.toBeNull();
      expect(events).toEqual(['started']);
    });

    it('does not start again if already running', () => {
      scaler.start();
      const timerBefore = scaler.timer;
      scaler.start();
      expect(scaler.timer).toBe(timerBefore);
    });

    it('stops the scaler and emits stopped', () => {
      scaler.start();
      const events = [];
      scaler.on('stopped', () => events.push('stopped'));
      scaler.stop();
      expect(scaler.isRunning).toBe(false);
      expect(scaler.timer).toBeNull();
      expect(events).toEqual(['stopped']);
    });

    it('stop is safe when not running', () => {
      expect(() => scaler.stop()).not.toThrow();
    });

    it('interval triggers evaluate', async () => {
      scaler.addRule({ name: 'cpu_up', metric: 'cpu', condition: (v) => v > 80, action: 'scale_up' });
      scaler.recordMetric('cpu', 90);
      scaler.start();
      jest.advanceTimersByTime(999999);
      await Promise.resolve();
      expect(scaler.currentReplicas).toBe(2);
    });
  });

  describe('getCurrentMetrics', () => {
    it('returns first value per metric', () => {
      scaler.recordMetric('cpu', 50);
      scaler.recordMetric('mem', 70);
      scaler.recordMetric('cpu', 80);
      expect(scaler.getCurrentMetrics()).toEqual({ cpu: 50, mem: 70 });
    });

    it('returns empty object when no metrics', () => {
      expect(scaler.getCurrentMetrics()).toEqual({});
    });
  });

  describe('calculateTargetReplicas', () => {
    it('increments target on scale_up', () => {
      scaler.currentReplicas = 3;
      expect(scaler.calculateTargetReplicas([{ action: 'scale_up' }])).toBe(4);
    });

    it('decrements target on scale_down', () => {
      scaler.currentReplicas = 3;
      expect(scaler.calculateTargetReplicas([{ action: 'scale_down' }])).toBe(2);
    });

    it('ignores unknown action types', () => {
      scaler.currentReplicas = 3;
      expect(scaler.calculateTargetReplicas([{ action: 'unknown' }])).toBe(3);
    });

    it('net counts multiple actions', () => {
      scaler.currentReplicas = 3;
      const target = scaler.calculateTargetReplicas([{ action: 'scale_up' }, { action: 'scale_up' }, { action: 'scale_down' }]);
      expect(target).toBe(4);
    });

    it('clamps to maxReplicas', () => {
      scaler.currentReplicas = 9;
      expect(scaler.calculateTargetReplicas([{ action: 'scale_up' }, { action: 'scale_up' }])).toBe(10);
    });

    it('clamps to minReplicas', () => {
      scaler.currentReplicas = 1;
      expect(scaler.calculateTargetReplicas([{ action: 'scale_down' }])).toBe(1);
    });

    it('stays at current replicas when history is unstable', () => {
      scaler.currentReplicas = 5;
      for (let i = 0; i < 10; i++) {
        scaler.recordMetric('cpu', 80);
        scaler.metricsHistory[i].replicas = i % 2 === 0 ? 3 : 5;
      }
      expect(scaler.calculateTargetReplicas([{ action: 'scale_up' }])).toBe(5);
    });
  });

  describe('hasUnstableHistory', () => {
    it('returns true when 3+ replica changes in last 10', () => {
      scaler.recordMetric('cpu', 80, {}, 2);
      scaler.recordMetric('cpu', 80, {}, 3);
      scaler.recordMetric('cpu', 80, {}, 2);
      scaler.recordMetric('cpu', 80, {}, 3);
      for (let i = 4; i < 10; i++) scaler.recordMetric('cpu', 50);
      // manually set replicas in history entries
      scaler.metricsHistory[0].replicas = 1;
      scaler.metricsHistory[1].replicas = 2;
      scaler.metricsHistory[2].replicas = 1;
      scaler.metricsHistory[3].replicas = 2;
      for (let i = 4; i < 10; i++) scaler.metricsHistory[i].replicas = 2;
      expect(scaler.hasUnstableHistory()).toBe(true);
    });

    it('returns false when less than 3 replica changes', () => {
      scaler.recordMetric('cpu', 50);
      scaler.recordMetric('cpu', 50);
      scaler.recordMetric('cpu', 50);
      expect(scaler.hasUnstableHistory()).toBe(false);
    });

    it('returns false when history is too short', () => {
      expect(scaler.hasUnstableHistory()).toBe(false);
    });
  });

  describe('scale', () => {
    it('scales within bounds and emits events', async () => {
      scaler.currentReplicas = 2;
      const events = [];
      scaler.on('scaling', (e) => events.push(['scaling', e]));
      scaler.on('scaled', (e) => events.push(['scaled', e]));
      const result = await scaler.scale(5);
      expect(result).toBe(true);
      expect(scaler.currentReplicas).toBe(5);
      expect(scaler.targetReplicas).toBe(5);
      expect(events).toHaveLength(2);
      expect(events[0][0]).toBe('scaling');
      expect(events[0][1].from).toBe(2);
      expect(events[0][1].to).toBe(5);
      expect(events[1][0]).toBe('scaled');
      expect(events[1][1].from).toBe(2);
      expect(events[1][1].to).toBe(5);
    });

    it('returns false when target is below min', async () => {
      scaler.options.minReplicas = 1;
      const result = await scaler.scale(0);
      expect(result).toBe(false);
    });

    it('returns false when target is above max', async () => {
      scaler.options.maxReplicas = 10;
      const result = await scaler.scale(11);
      expect(result).toBe(false);
    });
  });

  describe('setReplicas', () => {
    it('delegates to scale', async () => {
      scaler.currentReplicas = 1;
      await scaler.setReplicas(3);
      expect(scaler.currentReplicas).toBe(3);
    });
  });

  describe('getScaleReason', () => {
    it('returns formatted metrics string', () => {
      scaler.recordMetric('cpu', 85);
      scaler.recordMetric('mem', 70);
      const reason = scaler.getScaleReason();
      expect(reason).toContain('cpu=85');
      expect(reason).toContain('mem=70');
    });
  });

  describe('getStatus', () => {
    it('returns full status object', () => {
      scaler.addPresetRules();
      scaler.recordMetric('cpu', 50);
      scaler.start();
      const status = scaler.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.currentReplicas).toBe(1);
      expect(status.targetReplicas).toBe(1);
      expect(status.minReplicas).toBe(1);
      expect(status.maxReplicas).toBe(10);
      expect(status.metrics).toEqual({ cpu: 50 });
      expect(status.rules).toHaveLength(5);
      expect(status.rules[0].name).toBe('high_cpu_scale_up');
    });
  });

  describe('getHistory', () => {
    it('returns last N metric entries', () => {
      for (let i = 0; i < 10; i++) scaler.recordMetric('cpu', i);
      expect(scaler.getHistory(3)).toHaveLength(3);
      expect(scaler.getHistory(3)[0].value).toBe(7);
    });

    it('returns all entries when count exceeds history', () => {
      scaler.recordMetric('cpu', 1);
      scaler.recordMetric('mem', 2);
      expect(scaler.getHistory(10)).toHaveLength(2);
    });

    it('uses default limit of 100', () => {
      for (let i = 0; i < 50; i++) scaler.recordMetric('cpu', i);
      expect(scaler.getHistory()).toHaveLength(50);
    });
  });

  describe('evaluate (integration)', () => {
    it('scales up when CPU exceeds threshold', async () => {
      scaler.addRule({ name: 'cpu_up', metric: 'cpu', condition: (v) => v > 80, action: 'scale_up', cooldown: 1000 });
      scaler.recordMetric('cpu', 90);
      await scaler.evaluate();
      expect(scaler.currentReplicas).toBeGreaterThan(1);
    });

    it('does not scale when no rules trigger', async () => {
      scaler.addRule({ name: 'cpu_up', metric: 'cpu', condition: (v) => v > 80, action: 'scale_up' });
      scaler.recordMetric('cpu', 50);
      await scaler.evaluate();
      expect(scaler.currentReplicas).toBe(1);
    });

    it('scales down when CPU is low via preset rules', async () => {
      scaler.currentReplicas = 3;
      scaler.addPresetRules();
      scaler.recordMetric('cpu_usage', 10);
      await scaler.evaluate();
      expect(scaler.currentReplicas).toBe(2);
    });

    it('does not scale when already at target', async () => {
      scaler.currentReplicas = 5;
      scaler.targetReplicas = 5;
      scaler.options.maxReplicas = 10;
      scaler.addRule({ name: 'noop', metric: 'cpu', condition: () => true, action: 'scale_up' });
      scaler.addRule({ name: 'noop2', metric: 'cpu', condition: () => true, action: 'scale_down' });
      scaler.recordMetric('cpu', 50);
      await scaler.evaluate();
      expect(scaler.currentReplicas).toBe(5);
    });

    it('scales down via evaluate with preset rule', async () => {
      scaler.currentReplicas = 5;
      scaler.addPresetRules();
      scaler.recordMetric('queue_depth', 5);
      await scaler.evaluate();
      expect(scaler.currentReplicas).toBe(4);
    });

    it('evaluates all preset rule conditions with matching metrics', async () => {
      scaler.addPresetRules();
      scaler.recordMetric('cpu_usage', 90);
      scaler.recordMetric('memory_usage', 90);
      scaler.recordMetric('queue_depth', 200);
      await scaler.evaluate();
      expect(scaler.currentReplicas).toBeGreaterThan(1);
    });
  });
});
