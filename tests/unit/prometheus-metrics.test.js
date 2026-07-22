'use strict';

const { PrometheusMetrics } = require('../../src/monitoring/PrometheusMetrics');

describe('PrometheusMetrics', () => {
  let metrics;

  beforeEach(() => {
    metrics = new PrometheusMetrics({ prefix: 'test_' });
  });

  describe('constructor', () => {
    it('should use default prefix', () => {
      const m = new PrometheusMetrics();
      expect(m.prefix).toBe('ultrawork_');
    });

    it('should accept custom prefix', () => {
      expect(metrics.prefix).toBe('test_');
    });

    it('should register all default metrics', () => {
      expect(metrics.metrics.size).toBe(17);
      expect(metrics.metrics.has('http_requests_total')).toBe(true);
      expect(metrics.metrics.has('websocket_connections')).toBe(true);
      expect(metrics.metrics.has('http_request_duration_seconds')).toBe(true);
    });
  });

  describe('counter', () => {
    it('should register a counter metric', () => {
      metrics.counter('my_counter', 'My counter', ['env']);
      const m = metrics.metrics.get('my_counter');
      expect(m.type).toBe('counter');
      expect(m.name).toBe('test_my_counter');
      expect(m.help).toBe('My counter');
      expect(m.labels).toEqual(['env']);
      expect(m.values).toEqual({});
    });

    it('should default labels to empty array', () => {
      metrics.counter('plain', 'Plain');
      expect(metrics.metrics.get('plain').labels).toEqual([]);
    });
  });

  describe('gauge', () => {
    it('should register a gauge metric', () => {
      metrics.gauge('my_gauge', 'My gauge', ['dc']);
      const m = metrics.metrics.get('my_gauge');
      expect(m.type).toBe('gauge');
      expect(m.name).toBe('test_my_gauge');
      expect(m.help).toBe('My gauge');
      expect(m.labels).toEqual(['dc']);
      expect(m.value).toBe(0);
    });
  });

  describe('histogram', () => {
    it('should register a histogram with buckets', () => {
      metrics.histogram('my_hist', 'My hist', ['x'], [0.1, 1, 10]);
      const m = metrics.metrics.get('my_hist');
      expect(m.type).toBe('histogram');
      expect(m.buckets).toEqual([0.1, 1, 10]);
      expect(m.sum).toBe(0);
      expect(m.count).toBe(0);
    });

    it('should default to empty buckets', () => {
      metrics.histogram('empty_buckets', 'No buckets');
      expect(metrics.metrics.get('empty_buckets').buckets).toEqual([]);
    });
  });

  describe('inc', () => {
    it('should increment by 1 by default', () => {
      metrics.inc('http_requests_total', { method: 'GET' });
      const key = 'method="GET"';
      expect(metrics.metrics.get('http_requests_total').values[key]).toBe(1);
    });

    it('should increment by custom value', () => {
      metrics.inc('http_requests_total', {}, 5);
      expect(metrics.metrics.get('http_requests_total').values['']).toBe(5);
    });

    it('should accumulate multiple increments', () => {
      metrics.inc('http_requests_total', { status: '200' }, 2);
      metrics.inc('http_requests_total', { status: '200' }, 3);
      const key = 'status="200"';
      expect(metrics.metrics.get('http_requests_total').values[key]).toBe(5);
    });

    it('should do nothing for unknown metric', () => {
      expect(() => metrics.inc('unknown')).not.toThrow();
    });
  });

  describe('dec', () => {
    it('should decrement a gauge', () => {
      metrics.dec('websocket_connections');
      expect(metrics.metrics.get('websocket_connections').values['']).toBe(-1);
    });

    it('should decrement gauge by custom value', () => {
      metrics.dec('websocket_connections', {}, 3);
      expect(metrics.metrics.get('websocket_connections').values['']).toBe(-3);
    });

    it('should not decrement a counter', () => {
      metrics.inc('http_requests_total', {}, 10);
      metrics.dec('http_requests_total');
      expect(metrics.metrics.get('http_requests_total').values['']).toBe(10);
    });

    it('should not decrement a histogram', () => {
      metrics.dec('http_request_duration_seconds');
      expect(metrics.metrics.get('http_request_duration_seconds').count).toBe(0);
    });

    it('should do nothing for unknown metric', () => {
      expect(() => metrics.dec('unknown')).not.toThrow();
    });
  });

  describe('set', () => {
    it('should set gauge value without labels', () => {
      metrics.set('websocket_connections', 42);
      expect(metrics.metrics.get('websocket_connections').value).toBe(42);
    });

    it('should set gauge labeled value', () => {
      metrics.set('agent_team_size', 5, { team: 'alpha' });
      const key = 'team="alpha"';
      expect(metrics.metrics.get('agent_team_size').values[key]).toBe(5);
    });

    it('should do nothing for unknown metric', () => {
      expect(() => metrics.set('unknown', 1)).not.toThrow();
    });
  });

  describe('observe', () => {
    it('should record a histogram observation', () => {
      metrics.observe('http_request_duration_seconds', 0.5, { method: 'GET' });
      const m = metrics.metrics.get('http_request_duration_seconds');
      expect(m.sum).toBeCloseTo(0.5);
      expect(m.count).toBe(1);
      const key = 'method="GET"';
      expect(m.values[key].sum).toBeCloseTo(0.5);
      expect(m.values[key].count).toBe(1);
    });

    it('should update buckets correctly', () => {
      metrics.observe('http_request_duration_seconds', 0.03, { method: 'GET' });
      const key = 'method="GET"';
      const buckets = metrics.metrics.get('http_request_duration_seconds').values[key].buckets;
      expect(buckets[0.01]).toBe(0);
      expect(buckets[0.05]).toBe(1);
      expect(buckets[0.1]).toBe(1);
    });

    it('should not observe on counter', () => {
      metrics.observe('http_requests_total', 1);
      expect(metrics.metrics.get('http_requests_total').type).toBe('counter');
    });

    it('should do nothing for unknown metric', () => {
      expect(() => metrics.observe('unknown', 1)).not.toThrow();
    });
  });

  describe('startTimer', () => {
    it('should return timer with end method', () => {
      const timer = metrics.startTimer('http_request_duration_seconds');
      expect(timer).toHaveProperty('end');
      expect(typeof timer.end).toBe('function');
    });

    it('should measure and record duration', () => {
      const timer = metrics.startTimer('http_request_duration_seconds', { method: 'POST' });
      const duration = timer.end();
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
      const m = metrics.metrics.get('http_request_duration_seconds');
      expect(m.count).toBe(1);
    });
  });

  describe('_labelKey', () => {
    it('should return empty string for empty labels', () => {
      expect(metrics._labelKey({})).toBe('');
    });

    it('should sort labels alphabetically', () => {
      expect(metrics._labelKey({ z: '1', a: '2' })).toBe('a="2",z="1"');
    });

    it('should format single label', () => {
      expect(metrics._labelKey({ method: 'GET' })).toBe('method="GET"');
    });
  });

  describe('toPrometheusFormat', () => {
    it('should contain HELP and TYPE lines', () => {
      const output = metrics.toPrometheusFormat();
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should output counter values with labels', () => {
      metrics.inc('http_requests_total', { method: 'GET', path: '/', status: '200' });
      const output = metrics.toPrometheusFormat();
      expect(output).toContain('test_http_requests_total');
      expect(output).toContain('method="GET"');
    });

    it('should output gauge default value when no labeled values', () => {
      metrics.set('websocket_connections', 7);
      const output = metrics.toPrometheusFormat();
      expect(output).toContain('test_websocket_connections 7');
    });

    it('should output gauge values with labels', () => {
      metrics.set('agent_team_size', 5, { team: 'alpha' });
      const output = metrics.toPrometheusFormat();
      expect(output).toContain('test_agent_team_size{team="alpha"} 5');
    });

    it('should output histogram buckets sum and count', () => {
      metrics.observe('http_request_duration_seconds', 0.5);
      const output = metrics.toPrometheusFormat();
      expect(output).toContain('_bucket');
      expect(output).toContain('_sum');
      expect(output).toContain('_count');
      expect(output).toContain('le="+Inf"');
    });

    it('should skip unknown metric types in toPrometheusFormat', () => {
      metrics.metrics.set('unknown', { type: 'unknown' });
      expect(() => metrics.toPrometheusFormat()).not.toThrow();
    });
  });

  describe('toJSON', () => {
    it('should return zeros for fresh metrics', () => {
      const json = metrics.toJSON();
      expect(json.http_requests_total).toBe(0);
      expect(json.websocket_connections).toBe(0);
    });

    it('should sum counter values across labels', () => {
      metrics.inc('http_requests_total', { method: 'GET' }, 3);
      metrics.inc('http_requests_total', { method: 'POST' }, 2);
      expect(metrics.toJSON().http_requests_total).toBe(5);
    });

    it('should return gauge value', () => {
      metrics.set('uptime_seconds', 3600);
      expect(metrics.toJSON().uptime_seconds).toBe(3600);
    });

    it('should return labeled gauge values as object', () => {
      metrics.gauge('cpu_usage_percent', 'CPU usage percent', ['core']);
      metrics.set('cpu_usage_percent', 45, { core: '0' });
      const json = metrics.toJSON();
      expect(json.cpu_usage_percent).toEqual({ 'core="0"': 45 });
    });

    it('should return histogram aggregate', () => {
      metrics.observe('http_request_duration_seconds', 1);
      metrics.observe('http_request_duration_seconds', 3);
      const h = metrics.toJSON().http_request_duration_seconds;
      expect(h.count).toBe(2);
      expect(h.sum).toBe(4);
      expect(h.avg).toBe(2);
    });

    it('should skip unknown metric types in toJSON', () => {
      metrics.metrics.set('unknown', { type: 'unknown' });
      expect(() => metrics.toJSON()).not.toThrow();
    });
  });

  describe('reset', () => {
    it('should clear all metric values', () => {
      metrics.inc('http_requests_total', {}, 10);
      metrics.set('websocket_connections', 99);
      metrics.observe('http_request_duration_seconds', 0.5);
      metrics.reset();
      const httpReq = metrics.metrics.get('http_requests_total');
      expect(httpReq.values).toEqual({});
      expect(metrics.metrics.get('websocket_connections').value).toBe(0);
      const hist = metrics.metrics.get('http_request_duration_seconds');
      expect(hist.sum).toBe(0);
      expect(hist.count).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return metric counts by type', () => {
      const stats = metrics.getStats();
      expect(stats.metrics).toBe(17);
      expect(stats.counters).toBe(6);
      expect(stats.gauges).toBe(8);
      expect(stats.histograms).toBe(3);
    });
  });

  describe('histogram edge cases', () => {
    it('should accumulate multiple labeled observations', () => {
      metrics.observe('task_duration_seconds', 0.2, { template: 'default' });
      metrics.observe('task_duration_seconds', 5, { template: 'default' });
      const m = metrics.metrics.get('task_duration_seconds');
      const key = 'template="default"';
      expect(m.values[key].count).toBe(2);
      expect(m.values[key].sum).toBeCloseTo(5.2);
      expect(m.values[key].buckets[0.05]).toBe(0);
      expect(m.values[key].buckets[0.1]).toBe(0);
      expect(m.values[key].buckets[0.5]).toBe(1);
      expect(m.values[key].buckets[5]).toBe(2);
    });

    it('should handle multiple labeled sets independently', () => {
      metrics.observe('task_duration_seconds', 0.05, { template: 'fast' });
      metrics.observe('task_duration_seconds', 10, { template: 'slow' });
      const fastKey = 'template="fast"';
      const slowKey = 'template="slow"';
      const m = metrics.metrics.get('task_duration_seconds');
      expect(m.values[fastKey].count).toBe(1);
      expect(m.values[slowKey].count).toBe(1);
      expect(Object.keys(m.values)).toHaveLength(2);
    });
  });
});
