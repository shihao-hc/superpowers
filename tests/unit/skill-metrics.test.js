jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

describe('SkillMetrics', () => {
  let SkillMetrics, fs, path, metrics;
  const DATA_DIR = '/mock/data/metrics';
  const METRICS_FILE = '/mock/data/metrics/skill-metrics.json';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    fs = require('fs');
    path = require('path');
    path.join.mockImplementation((...args) => args.join('/'));

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('{}');

    ({ SkillMetrics } = require('../../src/skills/SkillMetrics'));
    metrics = new SkillMetrics({ dataDir: DATA_DIR });
  });

  describe('constructor', () => {
    test('should use default dataDir when no options provided', () => {
      new SkillMetrics();
      expect(path.join).toHaveBeenCalledWith(process.cwd(), 'data', 'metrics');
    });

    test('should use custom dataDir when provided', () => {
      expect(metrics.dataDir).toBe(DATA_DIR);
      expect(metrics.metricsFile).toBe(METRICS_FILE);
    });

    test('should create data directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      new SkillMetrics({ dataDir: DATA_DIR });
      expect(fs.mkdirSync).toHaveBeenCalledWith(DATA_DIR, { recursive: true });
    });

    test('should not create data directory if it exists', () => {
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    test('should load existing metrics from file', () => {
      expect(fs.readFileSync).toHaveBeenCalledWith(METRICS_FILE, 'utf8');
    });

    test('should handle missing metrics file gracefully', () => {
      fs.existsSync.mockReturnValue(false);
      expect(() => new SkillMetrics({ dataDir: DATA_DIR })).not.toThrow();
    });

    test('should handle corrupt metrics file gracefully', () => {
      fs.readFileSync.mockReturnValue('not valid json');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        new SkillMetrics({ dataDir: DATA_DIR });
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    test('should handle read failure gracefully', () => {
      fs.readFileSync.mockImplementation(() => { throw new Error('permission denied'); });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        new SkillMetrics({ dataDir: DATA_DIR });
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    test('should restore Maps from saved JSON', () => {
      const savedData = {
        executions: { bySkill: { test: 5 }, byType: { python: 3 }, total: 10, successful: 7, failed: 3, averageExecutionTime: 100 },
        downloads: { bySkill: { test: 2 }, byUser: { alice: 1 }, total: 2 },
        views: { bySkill: { test: 8 }, uniqueVisitors: { 'test:alice': 3 }, total: 8 },
        errors: { byType: { RuntimeError: 1 }, bySkill: { test: 1 }, total: 1 },
        performance: { cacheHits: 5, cacheMisses: 2, dockerExecutions: 1, localExecutions: 3 }
      };
      fs.readFileSync.mockReturnValue(JSON.stringify(savedData));
      const m = new SkillMetrics({ dataDir: DATA_DIR });

      expect(m.metrics.executions.bySkill.get('test')).toBe(5);
      expect(m.metrics.executions.byType.get('python')).toBe(3);
      expect(m.metrics.executions.total).toBe(10);
      expect(m.metrics.executions.successful).toBe(7);
      expect(m.metrics.executions.failed).toBe(3);
      expect(m.metrics.executions.averageExecutionTime).toBe(100);

      expect(m.metrics.downloads.bySkill.get('test')).toBe(2);
      expect(m.metrics.downloads.byUser.get('alice')).toBe(1);
      expect(m.metrics.downloads.total).toBe(2);

      expect(m.metrics.views.bySkill.get('test')).toBe(8);
      expect(m.metrics.views.uniqueVisitors.get('test:alice')).toBe(3);
      expect(m.metrics.views.total).toBe(8);

      expect(m.metrics.errors.byType.get('RuntimeError')).toBe(1);
      expect(m.metrics.errors.bySkill.get('test')).toBe(1);
      expect(m.metrics.errors.total).toBe(1);

      expect(m.metrics.performance.cacheHits).toBe(5);
      expect(m.metrics.performance.cacheMisses).toBe(2);
      expect(m.metrics.performance.dockerExecutions).toBe(1);
      expect(m.metrics.performance.localExecutions).toBe(3);
    });

    test('should handle partial data gracefully', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({ executions: { total: 5 } }));
      const m = new SkillMetrics({ dataDir: DATA_DIR });
      expect(m.metrics.executions.total).toBe(5);
      expect(m.metrics.executions.bySkill.size).toBe(0);
    });
  });

  describe('recordExecution', () => {
    test('should increment total and successful counts on success', () => {
      metrics.recordExecution('test-skill');
      expect(metrics.metrics.executions.total).toBe(1);
      expect(metrics.metrics.executions.successful).toBe(1);
      expect(metrics.metrics.executions.failed).toBe(0);
    });

    test('should increment failed count when success is false', () => {
      metrics.recordExecution('test', { success: false });
      expect(metrics.metrics.executions.total).toBe(1);
      expect(metrics.metrics.executions.successful).toBe(0);
      expect(metrics.metrics.executions.failed).toBe(1);
    });

    test('should track by skill name', () => {
      metrics.recordExecution('skill-a');
      metrics.recordExecution('skill-b');
      metrics.recordExecution('skill-a');
      expect(metrics.metrics.executions.bySkill.get('skill-a')).toBe(2);
      expect(metrics.metrics.executions.bySkill.get('skill-b')).toBe(1);
    });

    test('should track by type', () => {
      metrics.recordExecution('skill-a', { type: 'python' });
      metrics.recordExecution('skill-b', { type: 'javascript' });
      metrics.recordExecution('skill-a', { type: 'python' });
      expect(metrics.metrics.executions.byType.get('python')).toBe(2);
      expect(metrics.metrics.executions.byType.get('javascript')).toBe(1);
    });

    test('should use unknown as default type', () => {
      metrics.recordExecution('test');
      expect(metrics.metrics.executions.byType.get('unknown')).toBe(1);
    });

    test('should calculate average execution time with duration > 0', () => {
      metrics.recordExecution('test', { duration: 100 });
      expect(metrics.metrics.executions.averageExecutionTime).toBe(100);
      expect(metrics.executionTimes).toHaveLength(1);
    });

    test('should not add to executionTimes when duration is 0', () => {
      metrics.recordExecution('test', { duration: 0 });
      expect(metrics.executionTimes).toHaveLength(0);
    });

    test('should not add to executionTimes when duration is not provided', () => {
      metrics.recordExecution('test');
      expect(metrics.executionTimes).toHaveLength(0);
    });

    test('should update average with multiple durations', () => {
      metrics.recordExecution('test', { duration: 100 });
      metrics.recordExecution('test', { duration: 200 });
      expect(metrics.metrics.executions.averageExecutionTime).toBe(150);
      expect(metrics.executionTimes).toHaveLength(2);
    });

    test('should round average execution time', () => {
      metrics.recordExecution('test', { duration: 100 });
      metrics.recordExecution('test', { duration: 101 });
      expect(metrics.metrics.executions.averageExecutionTime).toBe(101);
    });

    test('should record error when error option is provided', () => {
      metrics.recordExecution('test', { success: false, error: 'TimeoutError' });
      expect(metrics.metrics.errors.total).toBe(1);
      expect(metrics.metrics.errors.byType.get('TimeoutError')).toBe(1);
      expect(metrics.metrics.errors.bySkill.get('test')).toBe(1);
    });

    test('should handle write failure gracefully', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        expect(() => metrics.recordExecution('test')).not.toThrow();
        expect(warnSpy).toHaveBeenCalledWith('Failed to save skill metrics:', 'disk full');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('recordDownload', () => {
    test('should increment total and track by skill/user', () => {
      metrics.recordDownload('test-skill', 'user1');
      expect(metrics.metrics.downloads.total).toBe(1);
      expect(metrics.metrics.downloads.bySkill.get('test-skill')).toBe(1);
      expect(metrics.metrics.downloads.byUser.get('user1')).toBe(1);
    });

    test('should use anonymous as default userId', () => {
      metrics.recordDownload('test-skill');
      expect(metrics.metrics.downloads.byUser.get('anonymous')).toBe(1);
    });

    test('should accumulate counts', () => {
      metrics.recordDownload('skill-a', 'user1');
      metrics.recordDownload('skill-a', 'user1');
      expect(metrics.metrics.downloads.bySkill.get('skill-a')).toBe(2);
      expect(metrics.metrics.downloads.byUser.get('user1')).toBe(2);
      expect(metrics.metrics.downloads.total).toBe(2);
    });
  });

  describe('recordView', () => {
    test('should increment total and track by skill', () => {
      metrics.recordView('test-skill', 'visitor1');
      expect(metrics.metrics.views.total).toBe(1);
      expect(metrics.metrics.views.bySkill.get('test-skill')).toBe(1);
    });

    test('should track unique visitors by composite key', () => {
      metrics.recordView('skill-a', 'visitor1');
      metrics.recordView('skill-a', 'visitor1');
      metrics.recordView('skill-a', 'visitor2');
      metrics.recordView('skill-b', 'visitor1');
      expect(metrics.metrics.views.uniqueVisitors.get('skill-a:visitor1')).toBe(2);
      expect(metrics.metrics.views.uniqueVisitors.get('skill-a:visitor2')).toBe(1);
      expect(metrics.metrics.views.uniqueVisitors.get('skill-b:visitor1')).toBe(1);
    });

    test('should use anonymous as default visitorId', () => {
      metrics.recordView('test');
      expect(metrics.metrics.views.uniqueVisitors.get('test:anonymous')).toBe(1);
    });
  });

  describe('recordError', () => {
    test('should increment total and track by type/skill', () => {
      metrics.recordError('test-skill', 'TimeoutError');
      expect(metrics.metrics.errors.total).toBe(1);
      expect(metrics.metrics.errors.byType.get('TimeoutError')).toBe(1);
      expect(metrics.metrics.errors.bySkill.get('test-skill')).toBe(1);
    });

    test('should use unknown as default error type', () => {
      metrics.recordError('test');
      expect(metrics.metrics.errors.byType.get('unknown')).toBe(1);
    });

    test('should accumulate error counts', () => {
      metrics.recordError('skill-a', 'TypeError');
      metrics.recordError('skill-a', 'TypeError');
      metrics.recordError('skill-b', 'TimeoutError');
      expect(metrics.metrics.errors.byType.get('TypeError')).toBe(2);
      expect(metrics.metrics.errors.byType.get('TimeoutError')).toBe(1);
      expect(metrics.metrics.errors.bySkill.get('skill-a')).toBe(2);
      expect(metrics.metrics.errors.bySkill.get('skill-b')).toBe(1);
      expect(metrics.metrics.errors.total).toBe(3);
    });
  });

  describe('cache methods', () => {
    test('recordCacheHit should increment cache hits', () => {
      metrics.recordCacheHit();
      expect(metrics.metrics.performance.cacheHits).toBe(1);
    });

    test('recordCacheMiss should increment cache misses', () => {
      metrics.recordCacheMiss();
      expect(metrics.metrics.performance.cacheMisses).toBe(1);
    });
  });

  describe('execution environment methods', () => {
    test('recordDockerExecution should increment docker executions', () => {
      metrics.recordDockerExecution();
      expect(metrics.metrics.performance.dockerExecutions).toBe(1);
    });

    test('recordLocalExecution should increment local executions', () => {
      metrics.recordLocalExecution();
      expect(metrics.metrics.performance.localExecutions).toBe(1);
    });
  });

  describe('getMetricsForPrometheus', () => {
    test('should return a plain object with correct structure', () => {
      metrics.recordExecution('skill-a', { type: 'python', duration: 100 });
      metrics.recordDownload('skill-a');
      metrics.recordView('skill-a');
      metrics.recordCacheHit();

      const result = metrics.getMetricsForPrometheus();

      expect(result).toEqual({
        executions: { total: 1, successful: 1, failed: 0, averageTime: 100, bySkill: { 'skill-a': 1 }, byType: { python: 1 } },
        downloads: { total: 1, bySkill: { 'skill-a': 1 } },
        views: { total: 1, bySkill: { 'skill-a': 1 } },
        errors: { total: 0, byType: {}, bySkill: {} },
        performance: { cacheHits: 1, cacheMisses: 0, dockerExecutions: 0, localExecutions: 0 }
      });
    });

    test('should not contain Map instances (serializable)', () => {
      const result = metrics.getMetricsForPrometheus();
      expect(() => JSON.stringify(result)).not.toThrow();
      const roundTrip = JSON.parse(JSON.stringify(result));
      expect(roundTrip.executions.bySkill).toBeDefined();
    });
  });

  describe('getSummary', () => {
    test('should return zero rates when no data', () => {
      const s = metrics.getSummary();
      expect(s.successRate).toBe(0);
      expect(s.cacheHitRate).toBe(0);
      expect(s.totalExecutions).toBe(0);
      expect(s.totalErrors).toBe(0);
      expect(s.averageExecutionTime).toBe(0);
      expect(s.errorRate).toBe(0);
    });

    test('should calculate success rate correctly', () => {
      metrics.recordExecution('test', { success: true });
      metrics.recordExecution('test', { success: false });
      const s = metrics.getSummary();
      expect(s.successRate).toBe(50);
      expect(s.totalExecutions).toBe(2);
    });

    test('should calculate success rate as 100 when all succeed', () => {
      metrics.recordExecution('test', { success: true });
      const s = metrics.getSummary();
      expect(s.successRate).toBe(100);
    });

    test('should calculate cache hit rate correctly', () => {
      metrics.recordCacheHit();
      metrics.recordCacheHit();
      metrics.recordCacheMiss();
      const s = metrics.getSummary();
      expect(s.cacheHitRate).toBeCloseTo(66.67, 0);
    });

    test('should calculate cache hit rate as 0 when no cache calls', () => {
      const s = metrics.getSummary();
      expect(s.cacheHitRate).toBe(0);
    });

    test('should calculate error rate correctly', () => {
      metrics.recordExecution('test', { success: false, error: 'Err' });
      metrics.recordExecution('test', { success: true });
      const s = metrics.getSummary();
      expect(s.errorRate).toBe('50.00');
      expect(s.totalErrors).toBe(1);
    });

    test('should include total downloads, views, and average time', () => {
      metrics.recordDownload('test');
      metrics.recordView('test');
      metrics.recordExecution('test', { duration: 250 });
      const s = metrics.getSummary();
      expect(s.totalDownloads).toBe(1);
      expect(s.totalViews).toBe(1);
      expect(s.averageExecutionTime).toBe(250);
    });

    test('should include top skills', () => {
      metrics.recordExecution('skill-a');
      metrics.recordDownload('skill-b');
      metrics.recordView('skill-a');
      const s = metrics.getSummary();
      expect(s.topSkills).toEqual([
        { skill: 'skill-a', usage: 2 },
        { skill: 'skill-b', usage: 1 }
      ]);
    });
  });

  describe('_getTopSkills', () => {
    test('should combine counts from executions, downloads, and views', () => {
      metrics.recordExecution('skill-a');
      metrics.recordDownload('skill-a');
      metrics.recordView('skill-a');
      metrics.recordExecution('skill-b');
      const top = metrics._getTopSkills();
      expect(top[0]).toEqual({ skill: 'skill-a', usage: 3 });
      expect(top[1]).toEqual({ skill: 'skill-b', usage: 1 });
    });

    test('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        metrics.recordExecution(`skill-${i}`);
      }
      expect(metrics._getTopSkills(3)).toHaveLength(3);
      expect(metrics._getTopSkills(10)).toHaveLength(5);
    });

    test('should return empty array when no data', () => {
      expect(metrics._getTopSkills()).toEqual([]);
    });

    test('should sort by usage descending', () => {
      metrics.recordExecution('skill-c');
      metrics.recordExecution('skill-c');
      metrics.recordExecution('skill-a');
      metrics.recordExecution('skill-b');
      const top = metrics._getTopSkills();
      expect(top[0].skill).toBe('skill-c');
      expect(top[1].skill).toBe('skill-a');
      expect(top[2].skill).toBe('skill-b');
    });
  });

  describe('reset', () => {
    test('should reset all metrics to initial state', () => {
      metrics.recordExecution('test');
      metrics.recordDownload('test');
      metrics.recordCacheHit();
      expect(metrics.metrics.executions.total).toBe(1);

      metrics.reset();

      expect(metrics.metrics.executions.total).toBe(0);
      expect(metrics.metrics.executions.successful).toBe(0);
      expect(metrics.metrics.executions.failed).toBe(0);
      expect(metrics.metrics.executions.bySkill.size).toBe(0);
      expect(metrics.metrics.executions.byType.size).toBe(0);
      expect(metrics.metrics.executions.averageExecutionTime).toBe(0);
      expect(metrics.metrics.downloads.total).toBe(0);
      expect(metrics.metrics.views.total).toBe(0);
      expect(metrics.metrics.errors.total).toBe(0);
      expect(metrics.metrics.performance.cacheHits).toBe(0);
      expect(metrics.executionTimes).toHaveLength(0);
    });
  });

  describe('getSkillMetrics singleton', () => {
    test('should return the same instance on multiple calls', () => {
      jest.resetModules();
      const fs2 = require('fs');
      const path2 = require('path');
      path2.join.mockImplementation((...args) => args.join('/'));
      fs2.existsSync.mockReturnValue(true);
      fs2.readFileSync.mockReturnValue('{}');

      const { getSkillMetrics: gsm } = require('../../src/skills/SkillMetrics');
      const a = gsm({ dataDir: DATA_DIR });
      const b = gsm({ dataDir: DATA_DIR });
      expect(a).toBe(b);
    });
  });

  describe('persistence', () => {
    test('recordExecution should persist metrics to file', () => {
      metrics.recordExecution('test', { duration: 100 });
      expect(fs.writeFileSync).toHaveBeenCalled();
      const call = fs.writeFileSync.mock.calls[0];
      expect(call[0]).toBe(METRICS_FILE);
      const data = JSON.parse(call[1]);
      expect(data.executions.total).toBe(1);
      expect(data.lastUpdated).toBeDefined();
    });

    test('reset should persist empty metrics to file', () => {
      metrics.reset();
      const call = fs.writeFileSync.mock.calls[0];
      const data = JSON.parse(call[1]);
      expect(data.executions.total).toBe(0);
      expect(data.lastUpdated).toBeDefined();
    });

    test('serialization should handle Map serialization correctly', () => {
      metrics.recordExecution('skill-a', { type: 'python' });
      const call = fs.writeFileSync.mock.calls[0];
      const data = JSON.parse(call[1]);
      expect(data.executions.bySkill).toEqual({ 'skill-a': 1 });
      expect(data.executions.byType).toEqual({ python: 1 });
    });
  });

  describe('executionTimes limit', () => {
    test('should not grow beyond maxExecutionTimes entries', () => {
      for (let i = 0; i < 1001; i++) {
        metrics.recordExecution('test', { duration: 1 });
      }
      expect(metrics.executionTimes).toHaveLength(1000);
    });
  });
});
