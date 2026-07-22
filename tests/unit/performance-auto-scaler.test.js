const { PerformanceAutoScaler } = require('../../src/performance/PerformanceAutoScaler');

describe('PerformanceAutoScaler', () => {
  let scaler;

  beforeEach(() => {
    scaler = new PerformanceAutoScaler();
  });

  describe('constructor', () => {
    it('should initialize with default metrics and thresholds', () => {
      expect(scaler.metrics.p95Latency).toBe(0);
      expect(scaler.metrics.errorRate).toBe(0);
      expect(scaler.thresholds.p95Latency).toBe(500);
      expect(scaler.thresholds.errorRate).toBe(0.01);
      expect(scaler.thresholds.cacheHitRate).toBe(0.6);
      expect(scaler.config.resources.replicas.current).toBe(3);
      expect(scaler.history).toEqual([]);
      expect(scaler.recommendations).toEqual([]);
    });

    it('should accept custom thresholds', () => {
      const custom = new PerformanceAutoScaler({ p95Latency: 200, errorRate: 0.05 });
      expect(custom.thresholds.p95Latency).toBe(200);
      expect(custom.thresholds.errorRate).toBe(0.05);
    });
  });

  describe('analyze', () => {
    it('should update metrics and generate recommendations', () => {
      const recs = scaler.analyze({
        p95Latency: 600,
        errorRate: 0.02,
        cacheHitRate: 0.5,
        cpuUsage: 0.9,
        memoryUsage: 0.9
      });

      expect(scaler.metrics.p95Latency).toBe(600);
      expect(scaler.history).toHaveLength(1);
      expect(recs.length).toBeGreaterThan(0);
    });

    it('should limit history to 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        scaler.analyze({ p95Latency: i });
      }
      expect(scaler.history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend latency fix when p95 exceeds threshold', () => {
      scaler.metrics.p95Latency = 600;
      const recs = scaler.generateRecommendations();
      expect(recs.some((r) => r.type === 'latency')).toBe(true);
    });

    it('should set high severity for double threshold latency', () => {
      scaler.metrics.p95Latency = 1200;
      const recs = scaler.generateRecommendations();
      const latencyRec = recs.find((r) => r.type === 'latency');
      expect(latencyRec.severity).toBe('high');
    });

    it('should recommend error rate fix when elevated', () => {
      scaler.metrics.errorRate = 0.02;
      const recs = scaler.generateRecommendations();
      expect(recs.some((r) => r.type === 'error_rate')).toBe(true);
    });

    it('should recommend cache fix when hit rate low', () => {
      scaler.metrics.cacheHitRate = 0.4;
      const recs = scaler.generateRecommendations();
      expect(recs.some((r) => r.type === 'cache')).toBe(true);
    });

    it('should recommend resource fix when CPU high', () => {
      scaler.metrics.cpuUsage = 0.9;
      const recs = scaler.generateRecommendations();
      expect(recs.some((r) => r.type === 'resources')).toBe(true);
    });

    it('should recommend memory fix when memory high', () => {
      scaler.metrics.memoryUsage = 0.9;
      const recs = scaler.generateRecommendations();
      expect(recs.some((r) => r.type === 'memory')).toBe(true);
    });

    it('should return empty when all metrics are normal', () => {
      const s = new PerformanceAutoScaler();
      s.metrics = {
        p95Latency: 100,
        p99Latency: 200,
        errorRate: 0,
        rps: 50,
        cacheHitRate: 0.9,
        cpuUsage: 0.3,
        memoryUsage: 0.4
      };
      const recs = s.generateRecommendations();
      expect(recs).toHaveLength(0);
    });
  });

  describe('optimizeForLatency', () => {
    it('should return actions to reduce latency', () => {
      const actions = scaler.optimizeForLatency();
      expect(actions).toHaveLength(3);
      expect(actions[0].config).toBe('cache.ttl');
      expect(actions[1].config).toBe('resources.replicas');
      expect(actions[2].config).toBe('concurrency.maxConnections');
    });
  });

  describe('optimizeForErrors', () => {
    it('should return emergency scaling actions', () => {
      const actions = scaler.optimizeForErrors();
      expect(actions).toHaveLength(2);
      expect(actions[0].action).toContain('紧急扩容');
    });
  });

  describe('optimizeCache', () => {
    it('should return cache optimization actions', () => {
      const actions = scaler.optimizeCache();
      expect(actions).toHaveLength(2);
      expect(actions[0].config).toBe('cache.ttl');
      expect(actions[1].config).toBe('cache.maxSize');
    });
  });

  describe('optimizeResources', () => {
    it('should return resource scaling actions', () => {
      const actions = scaler.optimizeResources();
      expect(actions).toHaveLength(2);
      expect(actions[0].config).toBe('resources.cpu');
      expect(actions[1].config).toBe('resources.replicas');
    });
  });

  describe('optimizeMemory', () => {
    it('should return memory optimization actions', () => {
      const actions = scaler.optimizeMemory();
      expect(actions).toHaveLength(2);
      expect(actions[0].config).toBe('resources.memory');
      expect(actions[1].config).toBe('cache.maxSize');
    });

    it('should reduce cache maxSize by 20%', () => {
      const actions = scaler.optimizeMemory();
      const cacheAction = actions.find((a) => a.config === 'cache.maxSize');
      expect(cacheAction.recommended).toBe(8000);
    });
  });

  describe('calculateNextResource', () => {
    it('should return the next CPU tier', () => {
      scaler.config.resources.cpu.current = '1000m';
      const result = scaler.calculateNextResource('cpu');
      expect(result).toBe(2);
    });

    it('should return the next memory tier', () => {
      expect(scaler.calculateNextResource('memory')).toBe('2Gi');
    });

    it('should return current if at max', () => {
      scaler.config.resources.cpu.current = '2000m';
      const result = scaler.calculateNextResource('cpu');
      expect(result).toBe(2);
    });
  });

  describe('applyRecommendation', () => {
    it('should update config based on recommendation', () => {
      const actions = scaler.optimizeForLatency();
      const recommendation = { actions };
      const newConfig = scaler.applyRecommendation(recommendation);
      expect(newConfig.cache.ttl.current).toBe(2700000);
      expect(newConfig.resources.replicas.current).toBe(4);
      expect(newConfig.concurrency.maxConnections.current).toBe(80);
    });

    it('should return current config', () => {
      const result = scaler.applyRecommendation({ actions: [] });
      expect(result.resources).toBeDefined();
      expect(result.cache).toBeDefined();
      expect(result.concurrency).toBeDefined();
      expect(result.thresholds).toBeDefined();
    });

    it('should apply resources.cpu action', () => {
      scaler.config.resources.cpu.current = '500m';
      const actions = scaler.optimizeResources();
      const result = scaler.applyRecommendation({ actions });
      expect(result.resources.cpu.current).toBe(2);
    });

    it('should apply resources.memory action', () => {
      const actions = scaler.optimizeMemory();
      const result = scaler.applyRecommendation({ actions });
      expect(result.resources.memory.current).toBe('2Gi');
    });

    it('should skip unknown category actions', () => {
      const before = scaler.getCurrentConfig();
      scaler.applyRecommendation({ actions: [{ config: 'unknown.key', recommended: 'x' }] });
      const after = scaler.getCurrentConfig();
      expect(after).toEqual(before);
    });
  });

  describe('getCurrentConfig', () => {
    it('should return a copy of current config', () => {
      const config = scaler.getCurrentConfig();
      expect(config.resources.cpu.current).toBe('1000m');
      expect(config.cache.ttl.current).toBe(1800000);
      expect(config.concurrency.maxConnections.current).toBe(100);
    });
  });

  describe('getMetrics', () => {
    it('should return current and average metrics', () => {
      scaler.analyze({ p95Latency: 600, errorRate: 0.02 });
      scaler.analyze({ p95Latency: 800, errorRate: 0.01 });

      const metrics = scaler.getMetrics();
      expect(metrics.current.p95Latency).toBe(800);
      expect(metrics.average.p95Latency).toBe(700);
      expect(metrics.history.length).toBe(2);
    });

    it('should return 0 for average when no history', () => {
      const metrics = scaler.getMetrics();
      expect(metrics.average.p95Latency).toBe(0);
      expect(metrics.history).toHaveLength(0);
    });
  });

  describe('getRecommendations', () => {
    it('should return stored recommendations', () => {
      scaler.analyze({ p95Latency: 600, errorRate: 0.02 });
      const recs = scaler.getRecommendations();
      expect(recs.length).toBeGreaterThan(0);
    });
  });
});
