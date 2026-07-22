const { CostOptimizer, PerformanceOptimizer, AutoScaler } = require('../../src/cost/CostOptimizer');

describe('CostOptimizer', () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new CostOptimizer();
  });

  describe('constructor', () => {
    it('should initialize with default pricing', () => {
      expect(optimizer.pricing).toBeDefined();
      expect(optimizer.pricing.compute.cpu).toBe(0.0000167);
      expect(optimizer.pricing.storage.standard).toBe(0.000023148);
      expect(optimizer.pricing.network.outbound).toBe(0.12);
      expect(optimizer.pricing.api.skillExecution).toBe(0.001);
    });

    it('should initialize with default cost centers', () => {
      expect(optimizer.costCenters['skill-execution']).toBeDefined();
      expect(optimizer.costCenters['model-inference']).toBeDefined();
      expect(optimizer.costCenters.storage).toBeDefined();
      expect(optimizer.costCenters.network).toBeDefined();
      expect(optimizer.costCenters.compute).toBeDefined();
    });

    it('should initialize empty Maps', () => {
      expect(optimizer.costSettings instanceof Map).toBe(true);
      expect(optimizer.billingCycles instanceof Map).toBe(true);
      expect(optimizer.usageRecords instanceof Map).toBe(true);
      expect(optimizer.alerts instanceof Map).toBe(true);
      expect(optimizer.budgets instanceof Map).toBe(true);
    });
  });

  describe('_calculateCost', () => {
    it('should calculate model-inference cost', () => {
      const cost = optimizer._calculateCost({
        category: 'model-inference',
        model: 'gpt-4',
        tokens: 1000
      });
      expect(cost).toBe(0.03);
    });

    it('should calculate model-inference cost with custom model', () => {
      const cost = optimizer._calculateCost({
        category: 'model-inference',
        model: 'gpt-4-turbo',
        tokens: 2000
      });
      expect(cost).toBe(0.02);
    });

    it('should fallback to default price for unknown model', () => {
      const cost = optimizer._calculateCost({
        category: 'model-inference',
        model: 'unknown-model',
        tokens: 1000
      });
      expect(cost).toBe(0.001);
    });

    it('should calculate storage cost', () => {
      const cost = optimizer._calculateCost({
        category: 'storage',
        storageType: 'standard',
        sizeGB: 100,
        durationHours: 24
      });
      expect(cost).toBeCloseTo(0.0555552, 5);
    });

    it('should calculate storage cost with intelligent tier', () => {
      const cost = optimizer._calculateCost({
        category: 'storage',
        storageType: 'intelligent',
        sizeGB: 50,
        durationHours: 10
      });
      expect(cost).toBeCloseTo(0.0064185, 6);
    });

    it('should calculate compute cost', () => {
      const cost = optimizer._calculateCost({
        category: 'compute',
        cpuSeconds: 100,
        memoryGB: 2
      });
      const expected = (100 * 0.0000167) + (2 * 0.0000087);
      expect(cost).toBeCloseTo(expected, 6);
    });

    it('should calculate network cost', () => {
      const cost = optimizer._calculateCost({
        category: 'network',
        dataGB: 10
      });
      expect(cost).toBe(1.2);
    });

    it('should calculate skill-execution cost', () => {
      const cost = optimizer._calculateCost({
        category: 'skill-execution',
        executions: 5
      });
      expect(cost).toBe(0.005);
    });

    it('should return record.cost for unknown category', () => {
      const cost = optimizer._calculateCost({
        category: 'unknown',
        cost: 42
      });
      expect(cost).toBe(42);
    });

    it('should return 0 for unknown category without cost', () => {
      const cost = optimizer._calculateCost({
        category: 'unknown'
      });
      expect(cost).toBe(0);
    });
  });

  describe('recordUsage', () => {
    it('should record usage and return cost', () => {
      const result = optimizer.recordUsage({
        tenantId: 'tenant1',
        period: '2026-07',
        category: 'compute',
        cpuSeconds: 100,
        memoryGB: 2
      });

      expect(result).toHaveProperty('cost');
      expect(result).toHaveProperty('total');
    });

    it('should accumulate costs for same tenant and period', () => {
      optimizer.recordUsage({
        tenantId: 't1',
        period: '2026-07',
        category: 'compute',
        cpuSeconds: 100,
        memoryGB: 1
      });

      const result = optimizer.recordUsage({
        tenantId: 't1',
        period: '2026-07',
        category: 'compute',
        cpuSeconds: 50,
        memoryGB: 1
      });

      expect(result.total).toBeGreaterThan(0);
    });

    it('should track multiple categories separately', () => {
      optimizer.recordUsage({
        tenantId: 't1',
        period: '2026-07',
        category: 'compute',
        cpuSeconds: 100,
        memoryGB: 1
      });

      optimizer.recordUsage({
        tenantId: 't1',
        period: '2026-07',
        category: 'network',
        dataGB: 5
      });

      const key = 't1:2026-07';
      const record = optimizer.usageRecords.get(key);
      expect(Object.keys(record.costs)).toContain('compute');
      expect(Object.keys(record.costs)).toContain('network');
    });

    it('should attach timestamp to each record', () => {
      const result = optimizer.recordUsage({
        tenantId: 't1',
        period: '2026-07',
        category: 'compute',
        cpuSeconds: 10,
        memoryGB: 1
      });

      expect(result).toBeDefined();
    });
  });

  describe('setBudget', () => {
    it('should set a budget for a tenant', () => {
      const budget = optimizer.setBudget('tenant1', {
        monthly: 1000,
        alertThresholds: [50, 80, 100]
      });

      expect(budget.tenantId).toBe('tenant1');
      expect(budget.monthly).toBe(1000);
      expect(budget.alertThresholds).toEqual([50, 80, 100]);
    });

    it('should use default alert thresholds when not provided', () => {
      const budget = optimizer.setBudget('t1', { monthly: 500 });
      expect(budget.alertThresholds).toEqual([50, 75, 90, 100]);
    });

    it('should use default resetDay when not provided', () => {
      const budget = optimizer.setBudget('t1', { monthly: 500 });
      expect(budget.resetDay).toBe(1);
    });

    it('should set createdAt timestamp', () => {
      const budget = optimizer.setBudget('t1', { monthly: 500 });
      expect(budget.createdAt).toBeGreaterThan(0);
    });
  });

  describe('_checkBudget', () => {
    it('should not trigger alerts when no budget is set', () => {
      const alertsBefore = optimizer.alerts.size;
      optimizer.recordUsage({ tenantId: 'no-budget', period: '2026-07', category: 'compute', cpuSeconds: 9999999, memoryGB: 999 });
      expect(optimizer.alerts.size).toBe(alertsBefore);
    });

    it('should trigger alert when exceeding threshold', () => {
      optimizer.setBudget('t1', { monthly: 1, alertThresholds: [100] });
      optimizer.recordUsage({ tenantId: 't1', period: '2026-07', category: 'network', dataGB: 100 });
      expect(optimizer.alerts.has('t1:100')).toBe(true);
    });

    it('should not re-send alert within 24 hours', () => {
      optimizer.setBudget('t1', { monthly: 1, alertThresholds: [100] });
      optimizer.recordUsage({ tenantId: 't1', period: '2026-07', category: 'network', dataGB: 100 });
      const beforeSize = optimizer.alerts.size;
      optimizer.recordUsage({ tenantId: 't1', period: '2026-07', category: 'network', dataGB: 100 });
      expect(optimizer.alerts.size).toBe(beforeSize);
    });

    it('should not trigger alert when below threshold', () => {
      optimizer.setBudget('low-cost', { monthly: 1000, alertThresholds: [50] });
      optimizer.recordUsage({ tenantId: 'low-cost', period: '2026-07', category: 'compute', cpuSeconds: 1, memoryGB: 1 });
      expect(optimizer.alerts.size).toBe(0);
    });
  });

  describe('getCostReport', () => {
    it('should return empty report for tenant with no records', () => {
      const report = optimizer.getCostReport('nonexistent');
      expect(report.totalCost).toBe(0);
      expect(report.breakdown).toBeDefined();
      expect(report.period).toBeDefined();
    });

    it('should include costs and breakdown', () => {
      optimizer.recordUsage({ tenantId: 't1', period: Date.now(), category: 'compute', cpuSeconds: 100, memoryGB: 1 });
      const report = optimizer.getCostReport('t1');
      expect(report.totalCost).toBeGreaterThan(0);
      expect(report.breakdown._total).toBeGreaterThan(0);
    });

    it('should include byDay, trends, forecast, recommendations', () => {
      optimizer.recordUsage({ tenantId: 't1', period: Date.now(), category: 'compute', cpuSeconds: 100, memoryGB: 1 });
      const report = optimizer.getCostReport('t1');
      expect(Array.isArray(report.byDay)).toBe(true);
      expect(Array.isArray(report.trends)).toBe(true);
      expect(report.forecast).toBeDefined();
      expect(report.forecast.current).toBeGreaterThan(0);
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should filter by period', () => {
      optimizer.recordUsage({ tenantId: 't1', period: Date.now(), category: 'compute', cpuSeconds: 100, memoryGB: 1 });
      const report = optimizer.getCostReport('t1', { period: 'daily' });
      expect(report.period).toBeDefined();
    });
  });

  describe('_getCostRecommendations', () => {
    it('should recommend model optimization when model-inference > 100', () => {
      const recs = optimizer._getCostRecommendations({ 'model-inference': 150 });
      expect(recs.some((r) => r.category === 'model' && r.priority === 'high')).toBe(true);
    });

    it('should recommend storage tiering when storage < 10', () => {
      const recs = optimizer._getCostRecommendations({ compute: 5 });
      expect(recs.some((r) => r.category === 'storage')).toBe(true);
    });

    it('should recommend reserved compute when compute > 50', () => {
      const recs = optimizer._getCostRecommendations({ compute: 100 });
      expect(recs.some((r) => r.category === 'compute' && r.priority === 'medium')).toBe(true);
    });
  });

  describe('allocateCosts', () => {
    it('should allocate costs by dimension percentages', () => {
      optimizer.recordUsage({ tenantId: 't1', period: Date.now(), category: 'compute', cpuSeconds: 1000, memoryGB: 2 });
      const result = optimizer.allocateCosts('t1', {
        period: 'monthly',
        dimensions: { engineering: 60, marketing: 40 }
      });
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0].dimension).toBe('engineering');
      expect(result.allocations[1].dimension).toBe('marketing');
    });

    it('should return round amounts', () => {
      optimizer.recordUsage({ tenantId: 't1', period: Date.now(), category: 'compute', cpuSeconds: 100, memoryGB: 1 });
      const result = optimizer.allocateCosts('t1', {
        period: 'monthly',
        dimensions: { teamA: 50, teamB: 50 }
      });
      for (const alloc of result.allocations) {
        expect(typeof alloc.amount).toBe('number');
      }
    });
  });

  describe('_getPeriodStart', () => {
    it('should return start of day for daily', () => {
      const start = optimizer._getPeriodStart('daily');
      const d = new Date(start);
      expect(d.getHours()).toBe(0);
    });

    it('should return start of month for monthly', () => {
      const start = optimizer._getPeriodStart('monthly');
      const d = new Date(start);
      expect(d.getDate()).toBe(1);
    });
  });

  describe('_forecastCost', () => {
    it('should return forecast with projected cost and confidence', () => {
      const forecast = optimizer._forecastCost(100, 'monthly');
      expect(forecast.current).toBe(100);
      expect(forecast.projected).toBeGreaterThan(0);
      expect(forecast.confidence).toBeGreaterThan(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('_getPeriodStart', () => {
    it('should return start of week for weekly', () => {
      const start = optimizer._getPeriodStart('weekly');
      const d = new Date(start);
      expect(d.getDay()).toBe(0);
    });

    it('should return default for unknown period', () => {
      const start = optimizer._getPeriodStart('annually');
      const d = new Date();
      expect(start).toBeLessThan(Date.now());
      expect(start).toBeGreaterThan(d.getTime() - 31 * 24 * 60 * 60 * 1000);
    });
  });

  describe('_parsePeriod', () => {
    it('should parse string period', () => {
      const result = optimizer._parsePeriod('2026-07-01');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('_getCostByDay', () => {
    it('should sort byDate with multiple entries', () => {
      const records = [{
        tenantId: 't1',
        period: 'test',
        costs: {},
        usage: {},
        records: [
          { timestamp: Date.UTC(2026, 0, 1), cost: 10 },
          { timestamp: Date.UTC(2026, 0, 2), cost: 20 }
        ]
      }];
      const byDay = optimizer._getCostByDay(records);
      expect(byDay.length).toBe(2);
    });
  });

  describe('_getCostTrends', () => {
    it('should handle zero total cost', () => {
      const trends = optimizer._getCostTrends({ test: 0 });
      expect(trends).toHaveLength(1);
      expect(trends[0].percentage).toBe(0);
    });

    it('should sort trends by amount descending', () => {
      const trends = optimizer._getCostTrends({ a: 10, b: 20 });
      expect(trends).toHaveLength(2);
      expect(trends[0].category).toBe('b');
      expect(trends[1].category).toBe('a');
    });
  });

  describe('_getDaysInPeriod', () => {
    it('should return 1 for daily', () => {
      expect(optimizer._getDaysInPeriod('daily')).toBe(1);
    });

    it('should return 7 for weekly', () => {
      expect(optimizer._getDaysInPeriod('weekly')).toBe(7);
    });

    it('should return 30 for default period', () => {
      expect(optimizer._getDaysInPeriod('annually')).toBe(30);
    });
  });

  describe('_calculateCost edge cases', () => {
    it('should use default 1000 tokens when tokens omitted', () => {
      const cost = optimizer._calculateCost({
        category: 'model-inference',
        model: 'gpt-4'
      });
      expect(cost).toBe(0.03);
    });

    it('should fallback to standard storage type when omitted', () => {
      const cost = optimizer._calculateCost({
        category: 'storage',
        sizeGB: 100,
        durationHours: 24
      });
      expect(cost).toBeCloseTo(0.0555552, 5);
    });

    it('should use 1 execution when executions omitted', () => {
      const cost = optimizer._calculateCost({
        category: 'skill-execution'
      });
      expect(cost).toBe(0.001);
    });
  });

  describe('_getCostRecommendations negatives', () => {
    it('should not recommend model optimization when <= 100', () => {
      const recs = optimizer._getCostRecommendations({ 'model-inference': 50 });
      expect(recs.some(r => r.category === 'model')).toBe(false);
    });

    it('should not recommend storage tiering when storage >= 10', () => {
      const recs = optimizer._getCostRecommendations({ storage: 15, compute: 5 });
      expect(recs.some(r => r.category === 'storage')).toBe(false);
    });

    it('should not recommend reserved compute when <= 50', () => {
      const recs = optimizer._getCostRecommendations({ compute: 30 });
      expect(recs.some(r => r.category === 'compute')).toBe(false);
    });
  });

  describe('allocateCosts missing dimensions', () => {
    it('should handle missing dimensions', () => {
      optimizer.recordUsage({
        tenantId: 't-no-dim',
        period: Date.now(),
        category: 'compute',
        cpuSeconds: 100,
        memoryGB: 1
      });
      const result = optimizer.allocateCosts('t-no-dim', { period: 'monthly' });
      expect(result.allocations).toEqual([]);
    });
  });

  describe('getCostReport with string period records', () => {
    it('should parse string periods from stored records', () => {
      optimizer.recordUsage({
        tenantId: 't-str',
        period: '2026-07-01',
        category: 'compute',
        cpuSeconds: 100,
        memoryGB: 1
      });
      const report = optimizer.getCostReport('t-str');
      expect(report.totalCost).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('PerformanceOptimizer', () => {
  let perf;

  beforeEach(() => {
    perf = new PerformanceOptimizer();
  });

  describe('constructor', () => {
    it('should initialize Maps', () => {
      expect(perf.cache instanceof Map).toBe(true);
      expect(perf.optimizations instanceof Map).toBe(true);
      expect(perf.metrics instanceof Map).toBe(true);
    });
  });

  describe('setCache / getCache', () => {
    it('should store and retrieve cached values', () => {
      perf.setCache('key1', 'value1', 60000);
      expect(perf.getCache('key1')).toBe('value1');
    });

    it('should return null for missing cache key', () => {
      expect(perf.getCache('nonexistent')).toBeNull();
    });

    it('should return null for expired cache', () => {
      perf.setCache('expired', 'val', -1);
      expect(perf.getCache('expired')).toBeNull();
    });

    it('should delete expired cache entries', () => {
      perf.setCache('expired', 'val', -1);
      perf.getCache('expired');
      expect(perf.cache.has('expired')).toBe(false);
    });

    it('should track cache hit count', () => {
      perf.setCache('key', 'val', 60000);
      perf.getCache('key');
      perf.getCache('key');
      expect(perf.cache.get('key').hits).toBe(2);
    });
  });

  describe('batchOptimize', () => {
    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await perf.batchOptimize(items, { batchSize: 2 });
      expect(results).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return empty array for empty input', async () => {
      const results = await perf.batchOptimize([]);
      expect(results).toEqual([]);
    });
  });

  describe('_chunkArray', () => {
    it('should split array into chunks', () => {
      const chunks = perf._chunkArray([1, 2, 3, 4, 5], 2);
      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should return single chunk if size > length', () => {
      const chunks = perf._chunkArray([1, 2], 10);
      expect(chunks).toEqual([[1, 2]]);
    });
  });

  describe('recordMetric / getMetrics', () => {
    it('should record a metric and return stats', () => {
      const stats = perf.recordMetric('latency', 100, { service: 'api' });
      expect(stats.count).toBe(1);
      expect(stats.sum).toBe(100);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(100);
    });

    it('should aggregate multiple values', () => {
      perf.recordMetric('latency', 100);
      perf.recordMetric('latency', 200);
      const stats = perf.recordMetric('latency', 150);
      expect(stats.count).toBe(3);
      expect(stats.sum).toBe(450);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(200);
    });

    it('should calculate percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        perf.recordMetric('test', i);
      }
      const stats = perf.getMetrics('test');
      expect(stats.p50).toBeGreaterThan(0);
      expect(stats.p95).toBeGreaterThan(0);
      expect(stats.p99).toBeGreaterThan(0);
    });

    it('should return null for unknown metric', () => {
      expect(perf.getMetrics('unknown')).toBeNull();
    });

    it('should separate metrics by tags', () => {
      perf.recordMetric('latency', 100, { env: 'dev' });
      perf.recordMetric('latency', 200, { env: 'prod' });
      const devStats = perf.getMetrics('latency', { env: 'dev' });
      const prodStats = perf.getMetrics('latency', { env: 'prod' });
      expect(devStats.max).toBe(100);
      expect(prodStats.max).toBe(200);
    });
  });

  describe('getOptimizationSuggestions', () => {
    it('should suggest removing cache entries with no hits', () => {
      perf.setCache('unused', 'val', 60000);
      perf.setCache('used', 'val', 60000);
      perf.getCache('used');
      const suggestions = perf.getOptimizationSuggestions();
      expect(suggestions.some((s) => s.key === 'unused')).toBe(true);
    });

    it('should suggest optimizing metrics with high p95', () => {
      for (let i = 0; i < 50; i++) {
        perf.recordMetric('slow-op', 6000);
      }
      const suggestions = perf.getOptimizationSuggestions();
      expect(suggestions.some((s) => s.type === 'performance')).toBe(true);
    });

    it('should return empty array when nothing to optimize', () => {
      expect(perf.getOptimizationSuggestions()).toEqual([]);
    });
  });
});

describe('AutoScaler', () => {
  let scaler;

  beforeEach(() => {
    scaler = new AutoScaler();
  });

  describe('constructor', () => {
    it('should initialize Maps and history', () => {
      expect(scaler.rules instanceof Map).toBe(true);
      expect(scaler.instances instanceof Map).toBe(true);
      expect(Array.isArray(scaler.scalingHistory)).toBe(true);
    });
  });

  describe('addScalingRule', () => {
    it('should add a scaling rule', () => {
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'gt', value: 80 }],
        action: { type: 'scale', direction: 'up', count: 2, maxInstances: 10 }
      });
      expect(scaler.rules.has('svc1')).toBe(true);
    });

    it('should set createdAt and lastTriggered on rule', () => {
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'gt', value: 80 }],
        action: { type: 'scale', direction: 'up', count: 1, maxInstances: 5 }
      });
      const rule = scaler.rules.get('svc1');
      expect(rule.createdAt).toBeGreaterThan(0);
      expect(rule.lastTriggered).toBeNull();
    });
  });

  describe('evaluateScaling', () => {
    it('should return null when no rule exists', () => {
      expect(scaler.evaluateScaling('unknown')).toBeNull();
    });

    it('should scale up when condition is met', () => {
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'gt', value: 30 }],
        action: { type: 'scale', direction: 'up', count: 2, maxInstances: 10 }
      });
      const action = scaler.evaluateScaling('svc1');
      expect(action).not.toBeNull();
      expect(action.type).toBe('scale');
      expect(action.direction).toBe('up');
      expect(action.currentInstances).toBe(1);
      expect(action.newInstances).toBe(3);
    });

    it('should scale down when condition is met with lt operator', () => {
      scaler.instances.set('svc1', 3);
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'lt', value: 70 }],
        action: { type: 'scale', direction: 'down', count: 1, minInstances: 1 }
      });
      const action = scaler.evaluateScaling('svc1');
      expect(action).not.toBeNull();
      expect(action.direction).toBe('down');
      expect(action.newInstances).toBe(2);
    });

    it('should return null when condition is not met', () => {
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'gt', value: 90 }],
        action: { type: 'scale', direction: 'up', count: 1, maxInstances: 10 }
      });
      const action = scaler.evaluateScaling('svc1');
      expect(action).toBeNull();
    });

    it('should respect max instances limit', () => {
      scaler.instances.set('svc1', 8);
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'gt', value: 30 }],
        action: { type: 'scale', direction: 'up', count: 5, maxInstances: 10 }
      });
      const action = scaler.evaluateScaling('svc1');
      expect(action.newInstances).toBe(10);
    });

    it('should respect min instances limit', () => {
      scaler.instances.set('svc1', 3);
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'lt', value: 70 }],
        action: { type: 'scale', direction: 'down', count: 5, minInstances: 1 }
      });
      const action = scaler.evaluateScaling('svc1');
      expect(action.newInstances).toBe(1);
    });

    it('should return null using eq operator when not equal', () => {
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'eq', value: 99 }],
        action: { type: 'scale', direction: 'up', count: 1, maxInstances: 10 }
      });
      expect(scaler.evaluateScaling('svc1')).toBeNull();
    });

    it('should handle eq operator when equal', () => {
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'eq', value: 50 }],
        action: { type: 'scale', direction: 'up', count: 1, maxInstances: 10 }
      });
      expect(scaler.evaluateScaling('svc1')).not.toBeNull();
    });

    it('should record scaling history on execution', () => {
      scaler.addScalingRule({
        id: 'svc1',
        serviceId: 'svc1',
        conditions: [{ metric: 'cpu', operator: 'gt', value: 30 }],
        action: { type: 'scale', direction: 'up', count: 1, maxInstances: 10 }
      });
      scaler.evaluateScaling('svc1');
      expect(scaler.scalingHistory.length).toBe(1);
      expect(scaler.scalingHistory[0].serviceId).toBe('svc1');
    });

    it('should not scale when lt operator condition not met', () => {
      scaler.instances.set('svc-lt', 3);
      scaler.addScalingRule({
        id: 'svc-lt',
        serviceId: 'svc-lt',
        conditions: [{ metric: 'cpu', operator: 'lt', value: 30 }],
        action: { type: 'scale', direction: 'down', count: 1, minInstances: 1 }
      });
      expect(scaler.evaluateScaling('svc-lt')).toBeNull();
    });

    it('should return null for non-scale action type', () => {
      scaler.addScalingRule({
        id: 'svc-restart',
        serviceId: 'svc-restart',
        conditions: [{ metric: 'cpu', operator: 'gt', value: 30 }],
        action: { type: 'restart' }
      });
      expect(scaler.evaluateScaling('svc-restart')).toBeNull();
    });

    it('should not scale up when at max instances', () => {
      scaler.instances.set('svc-maxed', 5);
      scaler.addScalingRule({
        id: 'svc-maxed',
        serviceId: 'svc-maxed',
        conditions: [{ metric: 'cpu', operator: 'gt', value: 30 }],
        action: { type: 'scale', direction: 'up', count: 1, maxInstances: 5 }
      });
      expect(scaler.evaluateScaling('svc-maxed')).toBeNull();
    });

    it('should scale up without maxInstances defaulting to 10', () => {
      scaler.addScalingRule({
        id: 'svc-no-max',
        serviceId: 'svc-no-max',
        conditions: [{ metric: 'cpu', operator: 'gt', value: 30 }],
        action: { type: 'scale', direction: 'up', count: 3 }
      });
      const action = scaler.evaluateScaling('svc-no-max');
      expect(action.newInstances).toBe(4);
    });

    it('should scale down without minInstances defaulting to 1', () => {
      scaler.instances.set('svc-no-min', 5);
      scaler.addScalingRule({
        id: 'svc-no-min',
        serviceId: 'svc-no-min',
        conditions: [{ metric: 'cpu', operator: 'lt', value: 70 }],
        action: { type: 'scale', direction: 'down', count: 2 }
      });
      const action = scaler.evaluateScaling('svc-no-min');
      expect(action.newInstances).toBe(3);
    });
  });
});

describe('PerformanceOptimizer - edge cases', () => {
  let perf;

  beforeEach(() => {
    perf = new PerformanceOptimizer();
  });

  describe('recordMetric > 1000 values', () => {
    it('should cap recorded values at 1000', () => {
      for (let i = 0; i < 1001; i++) {
        perf.recordMetric('many', i);
      }
      const stats = perf.getMetrics('many');
      expect(stats.count).toBe(1001);
    });
  });

  describe('getOptimizationSuggestions', () => {
    it('should not suggest performance optimizations when p95 is low', () => {
      perf.recordMetric('fast-op', 100);
      const suggestions = perf.getOptimizationSuggestions();
      expect(suggestions.some(s => s.type === 'performance' && s.metric && s.metric.includes('fast-op'))).toBe(false);
    });
  });
});
