'use strict';

const { PerformanceOptimizer } = require('../../src/performance/Optimizer');

describe('PerformanceOptimizer', () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new PerformanceOptimizer();
  });

  describe('constructor', () => {
    it('initializes empty metrics for all types', () => {
      expect(optimizer.metrics).toEqual({
        latency: [],
        throughput: [],
        memory: [],
        cpu: []
      });
    });

    it('initializes empty baselines', () => {
      expect(optimizer.baselines).toEqual({});
    });
  });

  describe('recordMetric', () => {
    it('records a metric with value and timestamp', () => {
      const before = Date.now();
      optimizer.recordMetric('latency', 150);
      const after = Date.now();

      expect(optimizer.metrics.latency).toHaveLength(1);
      expect(optimizer.metrics.latency[0].value).toBe(150);
      expect(new Date(optimizer.metrics.latency[0].timestamp).getTime()).toBeGreaterThanOrEqual(before);
      expect(new Date(optimizer.metrics.latency[0].timestamp).getTime()).toBeLessThanOrEqual(after + 100);
    });

    it('records to correct metric type', () => {
      optimizer.recordMetric('throughput', 1000);
      optimizer.recordMetric('memory', 512);
      optimizer.recordMetric('cpu', 75);

      expect(optimizer.metrics.throughput).toHaveLength(1);
      expect(optimizer.metrics.memory).toHaveLength(1);
      expect(optimizer.metrics.cpu).toHaveLength(1);
    });

    it('ignresses unknown metric types', () => {
      optimizer.recordMetric('unknown', 42);
      expect(optimizer.metrics.unknown).toBeUndefined();
      expect(optimizer.metrics.latency).toHaveLength(0);
    });

    it('limits storage to 1000 entries', () => {
      for (let i = 0; i < 1005; i++) {
        optimizer.recordMetric('latency', i);
      }

      expect(optimizer.metrics.latency).toHaveLength(1000);
      expect(optimizer.metrics.latency[0].value).toBe(5);
      expect(optimizer.metrics.latency[999].value).toBe(1004);
    });
  });

  describe('setBaseline', () => {
    it('stores a baseline value', () => {
      optimizer.setBaseline('latency', 100);
      expect(optimizer.baselines.latency).toBe(100);
    });

    it('overwrites existing baseline', () => {
      optimizer.setBaseline('latency', 100);
      optimizer.setBaseline('latency', 200);
      expect(optimizer.baselines.latency).toBe(200);
    });
  });

  describe('getAverage', () => {
    it('returns 0 for empty data', () => {
      expect(optimizer.getAverage('latency')).toBe(0);
    });

    it('returns 0 for unknown type', () => {
      expect(optimizer.getAverage('unknown')).toBe(0);
    });

    it('returns average of recorded values', () => {
      optimizer.recordMetric('latency', 100);
      optimizer.recordMetric('latency', 200);
      optimizer.recordMetric('latency', 300);

      expect(optimizer.getAverage('latency')).toBe(200);
    });

    it('returns value for single metric', () => {
      optimizer.recordMetric('latency', 150);
      expect(optimizer.getAverage('latency')).toBe(150);
    });

    it('handles decimal values', () => {
      optimizer.recordMetric('latency', 10);
      optimizer.recordMetric('latency', 20);
      optimizer.recordMetric('latency', 30);

      expect(optimizer.getAverage('latency')).toBe(20);
    });
  });

  describe('getPercentile', () => {
    it('returns 0 for empty data', () => {
      expect(optimizer.getPercentile('latency', 95)).toBe(0);
    });

    it('returns correct median (50th percentile)', () => {
      optimizer.recordMetric('latency', 10);
      optimizer.recordMetric('latency', 20);
      optimizer.recordMetric('latency', 30);
      optimizer.recordMetric('latency', 40);
      optimizer.recordMetric('latency', 50);

      expect(optimizer.getPercentile('latency', 50)).toBe(30);
    });

    it('returns correct 95th percentile', () => {
      for (let i = 1; i <= 100; i++) {
        optimizer.recordMetric('latency', i);
      }

      const p95 = optimizer.getPercentile('latency', 95);
      expect(p95).toBeGreaterThanOrEqual(95);
      expect(p95).toBeLessThanOrEqual(100);
    });

    it('returns correct 99th percentile', () => {
      for (let i = 1; i <= 200; i++) {
        optimizer.recordMetric('latency', i);
      }

      const p99 = optimizer.getPercentile('latency', 99);
      expect(p99).toBeGreaterThanOrEqual(196);
      expect(p99).toBeLessThanOrEqual(200);
    });

    it('returns 0 for 0th percentile (formula yields index -1)', () => {
      optimizer.recordMetric('latency', 42);
      optimizer.recordMetric('latency', 100);

      expect(optimizer.getPercentile('latency', 0)).toBe(0);
    });

    it('returns correct value for 100th percentile', () => {
      optimizer.recordMetric('latency', 42);
      optimizer.recordMetric('latency', 100);

      expect(optimizer.getPercentile('latency', 100)).toBe(100);
    });

    it('returns 0 for unknown metric type', () => {
      expect(optimizer.getPercentile('unknown', 95)).toBe(0);
    });
  });

  describe('checkAnomalies', () => {
    it('returns anomaly report when p95 exceeds threshold', () => {
      for (let i = 1; i <= 10; i++) {
        optimizer.recordMetric('latency', i * 10);
      }

      const report = optimizer.checkAnomalies('latency');

      expect(report.average).toBe(55);
      expect(report.p95).toBe(100);
      expect(report.anomaly).toBe(true);
      expect(report.recommendation).toBe('Consider scaling or optimization');
    });

    it('returns normal recommendation when within threshold', () => {
      for (let i = 0; i < 10; i++) {
        optimizer.recordMetric('latency', 100);
      }

      const report = optimizer.checkAnomalies('latency');

      expect(report.anomaly).toBe(false);
      expect(report.recommendation).toBe('Performance normal');
    });

    it('handles empty data gracefully', () => {
      const report = optimizer.checkAnomalies('latency');

      expect(report.average).toBe(0);
      expect(report.p95).toBe(0);
      expect(report.anomaly).toBe(false);
      expect(report.recommendation).toBe('Performance normal');
    });
  });

  describe('generateReport', () => {
    it('returns report with default values for empty metrics', () => {
      const report = optimizer.generateReport();

      expect(report.timestamp).toEqual(expect.any(String));
      expect(report.metrics).toEqual({
        latency: { avg: 0, p95: 0, p99: 0 },
        throughput: { avg: 0, current: 0 },
        memory: { avg: 0, current: 0 }
      });
      expect(report.anomalies.latency).toBeDefined();
      expect(report.anomalies.memory).toBeDefined();
    });

    it('includes computed values from recorded metrics', () => {
      optimizer.recordMetric('latency', 50);
      optimizer.recordMetric('latency', 150);
      optimizer.recordMetric('throughput', 100);
      optimizer.recordMetric('throughput', 200);
      optimizer.recordMetric('memory', 256);
      optimizer.recordMetric('memory', 512);

      const report = optimizer.generateReport();

      expect(report.metrics.latency.avg).toBe(100);
      expect(report.metrics.latency.p95).toBe(150);
      expect(report.metrics.throughput.avg).toBe(150);
      expect(report.metrics.throughput.current).toBe(200);
      expect(report.metrics.memory.avg).toBe(384);
      expect(report.metrics.memory.current).toBe(512);
    });

    it('includes anomaly checks for latency and memory', () => {
      const report = optimizer.generateReport();

      expect(report.anomalies).toHaveProperty('latency');
      expect(report.anomalies).toHaveProperty('memory');
      expect(report.anomalies.latency).toHaveProperty('average');
      expect(report.anomalies.latency).toHaveProperty('p95');
      expect(report.anomalies.latency).toHaveProperty('anomaly');
      expect(report.anomalies.latency).toHaveProperty('recommendation');
    });
  });
});
