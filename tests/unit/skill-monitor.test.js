const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('path');

const { SkillMonitor } = require('../../src/skills/monitoring/SkillMonitor');

const NOW = 1_000_000_000_000;

describe('SkillMonitor', () => {
  let monitor;

  beforeAll(() => {
    jest.useFakeTimers();

    path.join.mockImplementation((...args) => args.join('/'));
    path.resolve.mockImplementation((...args) => args.join('/'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.setSystemTime(NOW);
    jest.spyOn(SkillMonitor.prototype, '_startAutoCleanup').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    monitor = new SkillMonitor({ dataDir: '/tmp/monitor' });
    jest.spyOn(monitor, '_saveData').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  function addMinute(n = 1) {
    jest.advanceTimersByTime(n * 60 * 1000);
  }

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const s = new SkillMonitor();
      expect(s.dataDir).toBeTruthy();
      expect(s.metrics).toEqual({
        executions: [],
        downloads: [],
        views: [],
        errors: [],
        performance: []
      });
      expect(s.config.retentionDays).toBe(90);
      expect(s.config.cleanupInterval).toBe(24 * 60 * 60 * 1000);
      expect(s.config.versionRetention.keepLastVersions).toBe(5);
      expect(s.config.versionRetention.keepMajorVersions).toBe(true);
      expect(s.config.versionRetention.minDaysToKeep).toBe(30);
      expect(s.config.alerts.errorRateThreshold).toBe(0.05);
      expect(s.config.alerts.responseTimeThreshold).toBe(5000);
      expect(s.config.alerts.cacheHitRateThreshold).toBe(0.7);
    });

    it('should accept custom dataDir and merge config', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((file) => {
        if (file.endsWith('config.json')) {
          return JSON.stringify({ retentionDays: 30, alerts: { errorRateThreshold: 0.1 } });
        }
        return '{}';
      });
      const s = new SkillMonitor({ dataDir: '/custom/path' });
      expect(s.dataDir).toBe('/custom/path');
      expect(s.config.retentionDays).toBe(30);
      expect(s.config.alerts.errorRateThreshold).toBe(0.1);
    });

    it('should call _ensureDataDir and _loadData', () => {
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/monitor', { recursive: true });
    });

    it('should start auto cleanup interval', () => {
      const mockSetInterval = jest.spyOn(global, 'setInterval');
      SkillMonitor.prototype._startAutoCleanup.mockRestore();

      const s = new SkillMonitor({ dataDir: '/tmp/m2' });

      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), s.config.cleanupInterval);
    });
  });

  describe('_ensureDataDir', () => {
    it('should create directory if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      monitor._ensureDataDir();
      expect(fs.mkdirSync).toHaveBeenCalledWith(monitor.dataDir, { recursive: true });
    });

    it('should not create directory if it exists', () => {
      fs.mkdirSync.mockClear();
      fs.existsSync.mockReturnValue(true);
      monitor._ensureDataDir();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_loadData', () => {
    it('should load config and metrics from files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((file) => {
        if (file.endsWith('config.json')) {
          return JSON.stringify({ retentionDays: 10 });
        }
        if (file.endsWith('metrics.json')) {
          return JSON.stringify({ executions: [{ id: 1 }] });
        }
        return '{}';
      });

      const s = new SkillMonitor({ dataDir: '/tmp/loadtest' });

      expect(s.config.retentionDays).toBe(10);
      expect(s.metrics.executions).toEqual([{ id: 1 }]);
    });

    it('should handle missing files gracefully', () => {
      fs.existsSync.mockReturnValue(false);

      const s = new SkillMonitor({ dataDir: '/tmp/nofiles' });

      expect(s.metrics.executions).toEqual([]);
    });

    it('should handle corrupt JSON gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('not json');

      const s = new SkillMonitor({ dataDir: '/tmp/badjson' });

      expect(s.metrics.executions).toEqual([]);
    });
  });

  describe('_saveData', () => {
    it('should write config and metrics to files', () => {
      monitor._saveData.mockRestore();
      monitor._saveData();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/monitor/config.json',
        expect.any(String)
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/monitor/metrics.json',
        expect.any(String)
      );
    });

    it('should handle write errors gracefully', () => {
      monitor._saveData.mockRestore();
      fs.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });

      monitor._saveData();

      expect(console.warn).toHaveBeenCalledWith('Failed to save monitoring data:', 'disk full');
    });
  });

  describe('_startAutoCleanup', () => {
    it('should periodically call _cleanupOldMetrics', () => {
      const cleanupSpy = jest.spyOn(monitor, '_cleanupOldMetrics').mockImplementation(() => {});
      const interval = 1000;
      monitor.config.cleanupInterval = interval;

      SkillMonitor.prototype._startAutoCleanup.mockRestore();
      monitor._startAutoCleanup();

      jest.advanceTimersByTime(interval);
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('[SkillMonitor] 清理过期指标数据完成');

      jest.advanceTimersByTime(interval);
      expect(cleanupSpy).toHaveBeenCalledTimes(2);

      cleanupSpy.mockRestore();
    });
  });

  describe('_cleanupOldMetrics', () => {
    it('should remove metrics older than retentionDays', () => {
      const old = { timestamp: new Date(NOW - 200 * 24 * 60 * 60 * 1000).toISOString() };
      const recent = { timestamp: new Date(NOW).toISOString() };

      monitor.metrics.executions = [old, recent];
      monitor._cleanupOldMetrics();

      expect(monitor.metrics.executions).toEqual([recent]);
    });

    it('should call _saveData after cleanup', () => {
      monitor._cleanupOldMetrics();
      expect(monitor._saveData).toHaveBeenCalled();
    });
  });

  describe('recordExecution', () => {
    it('should record an execution metric', () => {
      const data = { skillId: 'skill-1', success: true, duration: 150 };

      monitor.recordExecution(data);

      expect(monitor.metrics.executions).toHaveLength(1);
      const rec = monitor.metrics.executions[0];
      expect(rec.skillId).toBe('skill-1');
      expect(rec.success).toBe(true);
      expect(rec.duration).toBe(150);
      expect(rec.timestamp).toBeTruthy();
    });

    it('should cap executions at 10000 and slice to 5000', () => {
      for (let i = 0; i < 10001; i++) {
        monitor.recordExecution({ skillId: 's', success: true, duration: 1 });
      }
      expect(monitor.metrics.executions.length).toBe(5000);
    });

    it('should call _saveData', () => {
      monitor.recordExecution({ skillId: 's', success: true, duration: 1 });
      expect(monitor._saveData).toHaveBeenCalled();
    });
  });

  describe('recordDownload', () => {
    it('should record a download metric', () => {
      monitor.recordDownload({ skillId: 's1', userId: 'u1' });

      expect(monitor.metrics.downloads).toHaveLength(1);
      expect(monitor.metrics.downloads[0].skillId).toBe('s1');
      expect(monitor.metrics.downloads[0].userId).toBe('u1');
    });

    it('should call _saveData', () => {
      monitor.recordDownload({ skillId: 's', userId: 'u' });
      expect(monitor._saveData).toHaveBeenCalled();
    });
  });

  describe('recordView', () => {
    it('should record a view metric', () => {
      monitor.recordView({ skillId: 's1', userId: 'u1' });

      expect(monitor.metrics.views).toHaveLength(1);
      expect(monitor.metrics.views[0].skillId).toBe('s1');
    });

    it('should cap views at 10000 and slice to 5000', () => {
      for (let i = 0; i < 10001; i++) {
        monitor.recordView({ skillId: 's', userId: 'u' });
      }
      expect(monitor.metrics.views.length).toBe(5000);
    });
  });

  describe('recordError', () => {
    it('should record an error metric', () => {
      monitor.recordError({ skillId: 's1', errorType: 'timeout', errorMessage: 'timed out' });

      expect(monitor.metrics.errors).toHaveLength(1);
      expect(monitor.metrics.errors[0].errorType).toBe('timeout');
      expect(monitor.metrics.errors[0].errorMessage).toBe('timed out');
    });

    it('should cap errors at 5000 and slice to 2500', () => {
      for (let i = 0; i < 5001; i++) {
        monitor.recordError({ skillId: 's', errorType: 'err', errorMessage: 'err' });
      }
      expect(monitor.metrics.errors.length).toBe(2500);
    });
  });

  describe('recordPerformance', () => {
    it('should record a performance metric', () => {
      monitor.recordPerformance({
        cacheHits: 100,
        cacheMisses: 20,
        avgResponseTime: 200,
        memoryUsage: 512,
        cpuUsage: 45
      });

      expect(monitor.metrics.performance).toHaveLength(1);
      const rec = monitor.metrics.performance[0];
      expect(rec.cacheHits).toBe(100);
      expect(rec.avgResponseTime).toBe(200);
    });

    it('should use defaults for missing fields', () => {
      monitor.recordPerformance({});
      const rec = monitor.metrics.performance[0];
      expect(rec.cacheHits).toBe(0);
      expect(rec.avgResponseTime).toBe(0);
    });

    it('should cap performance at 1000 and slice to 500', () => {
      for (let i = 0; i < 1001; i++) {
        monitor.recordPerformance({});
      }
      expect(monitor.metrics.performance.length).toBe(500);
    });
  });

  describe('_getCutoffTime', () => {
    it('should return correct cutoff for known ranges', () => {
      const oneHourAgo = monitor._getCutoffTime('1h');
      expect(oneHourAgo.getTime()).toBe(NOW - 60 * 60 * 1000);

      const sixHours = monitor._getCutoffTime('6h');
      expect(sixHours.getTime()).toBe(NOW - 6 * 60 * 60 * 1000);

      const oneDay = monitor._getCutoffTime('24h');
      expect(oneDay.getTime()).toBe(NOW - 24 * 60 * 60 * 1000);

      const week = monitor._getCutoffTime('7d');
      expect(week.getTime()).toBe(NOW - 7 * 24 * 60 * 60 * 1000);

      const month = monitor._getCutoffTime('30d');
      expect(month.getTime()).toBe(NOW - 30 * 24 * 60 * 60 * 1000);
    });

    it('should default to 24h for unknown ranges', () => {
      const cutoff = monitor._getCutoffTime('unknown');
      expect(cutoff.getTime()).toBe(NOW - 24 * 60 * 60 * 1000);
    });
  });

  describe('getExecutionStats', () => {
    beforeEach(() => {
      addMinute();
      monitor.recordExecution({ skillId: 's1', success: true, duration: 100 });
      monitor.recordExecution({ skillId: 's1', success: false, duration: 200, error: 'fail' });
      monitor.recordExecution({ skillId: 's2', success: true, duration: 50 });
    });

    it('should return stats for all skills within time range', () => {
      const stats = monitor.getExecutionStats({ timeRange: '24h' });
      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe('66.67%');
      expect(stats.avgDuration).toBe(117);
    });

    it('should filter by skillId', () => {
      const stats = monitor.getExecutionStats({ timeRange: '24h', skillId: 's1' });
      expect(stats.total).toBe(2);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it('should return zero stats when no data', () => {
      addMinute(61);

      const emptyStats = monitor.getExecutionStats({ timeRange: '1h' });
      expect(emptyStats.total).toBe(0);
      expect(emptyStats.successful).toBe(0);
      expect(emptyStats.failed).toBe(0);
      expect(emptyStats.successRate).toBe('0%');
      expect(emptyStats.avgDuration).toBe(0);
    });
  });

  describe('getDownloadStats', () => {
    beforeEach(() => {
      addMinute();
      monitor.recordDownload({ skillId: 's1', userId: 'u1' });
      monitor.recordDownload({ skillId: 's1', userId: 'u2' });
      monitor.recordDownload({ skillId: 's2', userId: 'u1' });
    });

    it('should return total and breakdown by skill', () => {
      const stats = monitor.getDownloadStats({ timeRange: '24h' });
      expect(stats.total).toBe(3);
      expect(stats.bySkill).toEqual({ s1: 2, s2: 1 });
    });

    it('should return top 10 skills sorted by count', () => {
      const stats = monitor.getDownloadStats({ timeRange: '24h' });
      expect(stats.topSkills).toHaveLength(2);
      expect(stats.topSkills[0]).toEqual({ skillId: 's1', count: 2 });
      expect(stats.topSkills[1]).toEqual({ skillId: 's2', count: 1 });
    });

    it('should filter by skillId', () => {
      const stats = monitor.getDownloadStats({ timeRange: '24h', skillId: 's1' });
      expect(stats.total).toBe(2);
    });

    it('should return empty stats when no data', () => {
      addMinute(61);
      const stats = monitor.getDownloadStats({ timeRange: '1h' });
      expect(stats.total).toBe(0);
      expect(stats.bySkill).toEqual({});
      expect(stats.topSkills).toEqual([]);
    });
  });

  describe('getErrorStats', () => {
    beforeEach(() => {
      addMinute();
      monitor.recordError({ skillId: 's1', errorType: 'timeout', errorMessage: 'timeout' });
      monitor.recordError({ skillId: 's1', errorType: 'timeout', errorMessage: 'timeout2' });
      monitor.recordError({ skillId: 's2', errorType: 'crash', errorMessage: 'crash' });
    });

    it('should return total and breakdowns', () => {
      const stats = monitor.getErrorStats({ timeRange: '24h' });
      expect(stats.total).toBe(3);
      expect(stats.byType).toEqual({ timeout: 2, crash: 1 });
      expect(stats.bySkill).toEqual({ s1: 2, s2: 1 });
    });

    it('should filter by skillId', () => {
      const stats = monitor.getErrorStats({ timeRange: '24h', skillId: 's1' });
      expect(stats.total).toBe(2);
      expect(stats.byType).toEqual({ timeout: 2 });
    });

    it('should handle errors without errorType', () => {
      monitor.recordError({ skillId: 's3', errorType: undefined, errorMessage: 'unknown' });

      const stats = monitor.getErrorStats({ timeRange: '24h', skillId: 's3' });
      expect(stats.byType).toEqual({ unknown: 1 });
    });
  });

  describe('getPerformanceStats', () => {
    beforeEach(() => {
      addMinute();
      monitor.recordPerformance({ cacheHits: 80, cacheMisses: 20, avgResponseTime: 200, memoryUsage: 512, cpuUsage: 45 });
      monitor.recordPerformance({ cacheHits: 90, cacheMisses: 10, avgResponseTime: 300, memoryUsage: 1024, cpuUsage: 55 });
    });

    it('should compute averages and cache hit rate', () => {
      const stats = monitor.getPerformanceStats({ timeRange: '24h' });
      expect(stats.avgResponseTime).toBe(250);
      expect(stats.avgMemoryUsage).toBe(768);
      expect(stats.avgCpuUsage).toBe('50.00%');
      expect(stats.dataPoints).toBe(2);
    });

    it('should compute cache hit rate correctly', () => {
      const stats = monitor.getPerformanceStats({ timeRange: '24h' });
      const hitRate = parseFloat(stats.cacheHitRate);
      expect(hitRate).toBeCloseTo(85.0, 1);
    });

    it('should return zeros when no data', () => {
      addMinute(61);
      const stats = monitor.getPerformanceStats({ timeRange: '1h' });
      expect(stats.avgResponseTime).toBe(0);
      expect(stats.cacheHitRate).toBe('0%');
      expect(stats.avgMemoryUsage).toBe(0);
      expect(stats.avgCpuUsage).toBe(0);
      expect(stats.dataPoints).toBe(0);
    });

    it('should handle empty cache metrics', () => {
      const s = new SkillMonitor({ dataDir: '/tmp/p' });
      s.recordPerformance({});
      const stats = s.getPerformanceStats({ timeRange: '24h' });
      expect(stats.cacheHitRate).toBe('0.00%');
      expect(stats.avgResponseTime).toBe(0);
      expect(stats.dataPoints).toBe(1);
    });
  });

  describe('getAlerts', () => {
    it('should generate error rate alert when threshold exceeded', () => {
      addMinute();
      monitor.recordExecution({ skillId: 's1', success: false, duration: 100 });
      monitor.recordExecution({ skillId: 's1', success: false, duration: 100 });

      const alerts = monitor.getAlerts();
      expect(alerts.some(a => a.type === 'error_rate' && a.severity === 'high')).toBe(true);
    });

    it('should generate response time alert when threshold exceeded', () => {
      addMinute();
      monitor.recordPerformance({ avgResponseTime: 6000 });

      const alerts = monitor.getAlerts();
      expect(alerts.some(a => a.type === 'response_time' && a.severity === 'medium')).toBe(true);
    });

    it('should generate cache hit rate alert when below threshold', () => {
      addMinute();
      monitor.recordPerformance({ cacheHits: 10, cacheMisses: 90 });

      const alerts = monitor.getAlerts();
      expect(alerts.some(a => a.type === 'cache_hit_rate' && a.severity === 'low')).toBe(true);
    });

    it('should not generate cache alert when no data points', () => {
      const alerts = monitor.getAlerts();
      expect(alerts.some(a => a.type === 'cache_hit_rate')).toBe(false);
    });

    it('should return empty array when no thresholds exceeded', () => {
      addMinute();
      monitor.recordExecution({ skillId: 's1', success: true, duration: 10 });
      monitor.recordPerformance({ cacheHits: 90, cacheMisses: 10, avgResponseTime: 100 });

      const alerts = monitor.getAlerts();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('cleanupOldVersions', () => {
    const makeVersion = (skillName, version, daysAgo) => ({
      skillName,
      version,
      createdAt: new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString()
    });

    it('should keep recent versions and archive old ones', async () => {
      const versionManager = {
        getAllVersions: jest.fn().mockReturnValue([
          makeVersion('skill-a', '1.0.0', 100),
          makeVersion('skill-a', '1.1.0', 80),
          makeVersion('skill-a', '1.2.0', 60),
          makeVersion('skill-a', '1.3.0', 40),
          makeVersion('skill-a', '1.4.0', 10),
          makeVersion('skill-a', '1.5.0', 5)
        ]),
        _compareVersions: jest.fn((a, b) => {
          const pa = a.split('.').map(Number);
          const pb = b.split('.').map(Number);
          for (let i = 0; i < 3; i++) {
            if (pa[i] !== pb[i]) return pa[i] - pb[i];
          }
          return 0;
        }),
        updateVersionStatus: jest.fn().mockResolvedValue(true)
      };

      const result = await monitor.cleanupOldVersions(versionManager);

      expect(result.checked).toBe(6);
      expect(result.kept).toBe(5);
      expect(versionManager.updateVersionStatus).toHaveBeenCalledTimes(1);
      expect(versionManager.updateVersionStatus).toHaveBeenCalledWith('skill-a', '1.0.0', 'archived', 'Auto-archived by retention policy');
    });

    it('should not modify anything in dryRun mode', async () => {
      const versionManager = {
        getAllVersions: jest.fn().mockReturnValue([
          makeVersion('skill-a', '1.0.0', 100),
          makeVersion('skill-a', '1.1.0', 80),
          makeVersion('skill-a', '1.2.0', 60),
          makeVersion('skill-a', '1.3.0', 40),
          makeVersion('skill-a', '1.4.0', 10),
          makeVersion('skill-a', '1.5.0', 5)
        ]),
        _compareVersions: jest.fn((a, b) => {
          const pa = a.split('.').map(Number);
          const pb = b.split('.').map(Number);
          for (let i = 0; i < 3; i++) {
            if (pa[i] !== pb[i]) return pa[i] - pb[i];
          }
          return 0;
        }),
        updateVersionStatus: jest.fn()
      };

      const result = await monitor.cleanupOldVersions(versionManager, { dryRun: true });

      expect(result.details.filter(d => d.action === 'would_archive')).toHaveLength(1);
      expect(versionManager.updateVersionStatus).not.toHaveBeenCalled();
    });

    it('should handle versionManager errors gracefully', async () => {
      const versionManager = {
        getAllVersions: jest.fn().mockImplementation(() => { throw new Error('fail'); }),
        _compareVersions: jest.fn()
      };

      const result = await monitor.cleanupOldVersions(versionManager);

      expect(result.error).toBe('fail');
    });
  });

  describe('generatePrometheusMetrics', () => {
    it('should return Prometheus-formatted string', () => {
      addMinute();
      monitor.recordExecution({ skillId: 's1', success: true, duration: 100 });
      monitor.recordDownload({ skillId: 's1', userId: 'u1' });
      monitor.recordPerformance({ cacheHits: 80, cacheMisses: 20, avgResponseTime: 150, memoryUsage: 256, cpuUsage: 30 });

      const output = monitor.generatePrometheusMetrics();

      expect(output).toContain('# HELP skill_executions_total');
      expect(output).toContain('skill_executions_total');
      expect(output).toContain('# HELP skill_downloads_total');
      expect(output).toContain('skill_downloads_total');
      expect(output).toContain('# HELP skill_cache_hit_rate');
      expect(output).toContain('skill_cache_hit_rate');
      expect(output).toContain('# HELP skill_avg_response_time_ms');
      expect(output).toContain('skill_avg_response_time_ms');
      expect(output).toContain('# HELP skill_errors_total');
      expect(output).toContain('skill_errors_total');
      expect(output).toContain('# HELP skill_alerts_active');
      expect(output).toContain('skill_alerts_active');
    });
  });

  describe('getDashboardData', () => {
    it('should return aggregated dashboard data', () => {
      addMinute();
      monitor.recordExecution({ skillId: 's1', success: true, duration: 100 });

      const dashboard = monitor.getDashboardData();

      expect(dashboard.summary).toBeDefined();
      expect(dashboard.summary.executions).toBeDefined();
      expect(dashboard.summary.downloads).toBeDefined();
      expect(dashboard.summary.errors).toBeDefined();
      expect(dashboard.summary.performance).toBeDefined();
      expect(dashboard.alerts).toBeInstanceOf(Array);
      expect(dashboard.timestamp).toBeTruthy();
    });
  });
});
