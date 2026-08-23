const fs = require('fs');

jest.mock('fs');

const { OptimizationDashboard } = require('../../src/skills/optimization/OptimizationDashboard');

describe('OptimizationDashboard', () => {
  let mockMonitor;
  let mockOptimizer;
  let mockStaticAnalyzer;
  let mockTrustScore;
  let mockRewardSystem;
  let mockReviewWorkflow;
  let dashboard;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: 1710000000000 });
    jest.spyOn(Date, 'now').mockReturnValue(1710000000000);

    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockReturnValue(undefined);

    mockMonitor = {
      getPerformanceStats: jest.fn(),
      getErrorStats: jest.fn(),
      getExecutionStats: jest.fn(),
      getDownloadStats: jest.fn(),
      getAlerts: jest.fn()
    };

    mockOptimizer = {
      getStats: jest.fn(),
      getCurrentConfig: jest.fn(),
      getHistory: jest.fn(),
      runOptimizationCycle: jest.fn()
    };

    mockStaticAnalyzer = {};

    mockTrustScore = {
      getStats: jest.fn()
    };

    mockRewardSystem = {
      getStats: jest.fn()
    };

    mockReviewWorkflow = {
      getStats: jest.fn()
    };

    dashboard = new OptimizationDashboard({
      monitor: mockMonitor,
      optimizer: mockOptimizer,
      staticAnalyzer: mockStaticAnalyzer,
      trustScore: mockTrustScore,
      rewardSystem: mockRewardSystem,
      reviewWorkflow: mockReviewWorkflow
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with all services', () => {
      expect(dashboard.optimizer).toBe(mockOptimizer);
      expect(dashboard.monitor).toBe(mockMonitor);
      expect(dashboard.staticAnalyzer).toBe(mockStaticAnalyzer);
      expect(dashboard.trustScore).toBe(mockTrustScore);
      expect(dashboard.rewardSystem).toBe(mockRewardSystem);
      expect(dashboard.reviewWorkflow).toBe(mockReviewWorkflow);
    });

    it('should set default dataDir and ensure it exists', () => {
      expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('data'));
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('data'), { recursive: true });
    });

    it('should not create dir if it already exists', () => {
      fs.mkdirSync.mockClear();
      fs.existsSync.mockReturnValue(true);
      const _d2 = new OptimizationDashboard({});
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle missing services gracefully', () => {
      const d2 = new OptimizationDashboard({});
      expect(d2.optimizer).toBeUndefined();
    });
  });

  describe('getSystemHealth', () => {
    it('should return healthy when all components operational', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500, avgResponseTime: 42 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date(Date.now() - 86400000).toISOString() });
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 10, approved: 40, rejected: 5 });

      const health = await dashboard.getSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.components.monitoring.status).toBe('operational');
      expect(health.components.optimizer.status).toBe('operational');
      expect(health.components.trustScore.status).toBe('operational');
      expect(health.components.reviewWorkflow.status).toBe('operational');
      expect(health.issues).toHaveLength(0);
    });

    it('should flag medium issue when errors exceed 100', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 150 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const health = await dashboard.getSystemHealth();

      expect(health.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ component: 'monitoring', severity: 'medium' })])
      );
    });

    it('should flag low issue when optimizer not run for 7+ days', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date(Date.now() - 10 * 86400000).toISOString() });
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const health = await dashboard.getSystemHealth();

      expect(health.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ component: 'optimizer', severity: 'low' })])
      );
    });

    it('should flag high issue and set critical when trust score below 60', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 45 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const health = await dashboard.getSystemHealth();

      expect(health.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ component: 'trustScore', severity: 'high' })])
      );
      expect(health.status).toBe('critical');
    });

    it('should flag medium issue when pending reviews exceed 50', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 60, approved: 40, rejected: 5 });

      const health = await dashboard.getSystemHealth();

      expect(health.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ component: 'reviewWorkflow', severity: 'medium' })])
      );
      expect(health.status).toBe('degraded');
    });

    it('should handle monitor error gracefully', async () => {
      mockMonitor.getPerformanceStats.mockImplementation(() => { throw new Error('Monitor down'); });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });

      const health = await dashboard.getSystemHealth();

      expect(health.components.monitoring.status).toBe('error');
      expect(health.components.monitoring.error).toBe('Monitor down');
      expect(health.status).toBe('degraded');
    });

    it('should handle optimizer error gracefully', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockOptimizer.getStats.mockImplementation(() => { throw new Error('Optimizer fail'); });

      const health = await dashboard.getSystemHealth();

      expect(health.components.optimizer.status).toBe('error');
      expect(health.components.optimizer.error).toBe('Optimizer fail');
    });

    it('should handle trustScore error gracefully', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockTrustScore.getStats.mockImplementation(() => { throw new Error('Trust fail'); });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const health = await dashboard.getSystemHealth();

      expect(health.components.trustScore.status).toBe('error');
      expect(health.status).toBe('healthy');
    });

    it('should handle reviewWorkflow error gracefully', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockReviewWorkflow.getStats.mockImplementation(() => { throw new Error('Review fail'); });

      const health = await dashboard.getSystemHealth();

      expect(health.components.reviewWorkflow.status).toBe('error');
    });

    it('should handle missing components', async () => {
      const d2 = new OptimizationDashboard({});
      const health = await d2.getSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.components).toEqual({});
    });

    it('should set degraded when medium severity issues present', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 150 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });

      const health = await dashboard.getSystemHealth();

      expect(health.status).toBe('degraded');
    });

    it('should skip optimizer age check when lastOptimization is absent', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10 });
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const health = await dashboard.getSystemHealth();

      expect(health.issues).toEqual([]);
      expect(health.status).toBe('healthy');
    });

    it('should handle zero approved/rejected in approvalRate', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 0, rejected: 0 });

      const health = await dashboard.getSystemHealth();

      expect(health.components.reviewWorkflow.status).toBe('operational');
    });
  });

  describe('generateOptimizationReport', () => {
    it('should return full report with all sections', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500, avgResponseTime: 42 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockMonitor.getExecutionStats.mockReturnValue({ total: 100 });
      mockMonitor.getDownloadStats.mockReturnValue({ total: 200 });
      mockMonitor.getAlerts.mockReturnValue([]);
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockOptimizer.getCurrentConfig.mockReturnValue({ reviewThresholds: { quality: 70 }, rewardMultipliers: { bonus: 1.2 } });
      mockOptimizer.getHistory.mockReturnValue([]);
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockRewardSystem.getStats.mockReturnValue({ totalRewards: 50 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const report = await dashboard.generateOptimizationReport();

      expect(report.sections.health).toBeDefined();
      expect(report.sections.monitoring).toBeDefined();
      expect(report.sections.optimization).toBeDefined();
      expect(report.sections.codeQuality).toBeDefined();
      expect(report.sections.community).toBeDefined();
    });

    it('should handle monitoring section error', async () => {
      mockMonitor.getExecutionStats.mockImplementation(() => { throw new Error('Stats fail'); });

      const report = await dashboard.generateOptimizationReport();

      expect(report.sections.monitoring.error).toBe('Stats fail');
    });

    it('should handle missing services', async () => {
      const d2 = new OptimizationDashboard({});
      const report = await d2.generateOptimizationReport();

      expect(report.sections.health).toBeDefined();
      expect(report.sections.monitoring).toBeUndefined();
      expect(report.sections.optimization).toBeUndefined();
      expect(report.sections.codeQuality).toBeUndefined();
      expect(report.sections.community).toBeUndefined();
    });

    it('should handle optimization section error', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockOptimizer.getStats.mockImplementation(() => { throw new Error('Opt fail'); });

      const report = await dashboard.generateOptimizationReport();

      expect(report.sections.optimization.error).toBe('Opt fail');
    });

    it('should handle codeQuality section error', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockOptimizer.getCurrentConfig.mockReturnValue({});
      mockOptimizer.getHistory.mockReturnValue([]);
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockRewardSystem.getStats.mockReturnValue({ totalRewards: 50 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });
      dashboard._countSecurityPatterns = jest.fn(() => { throw new Error('Pattern fail'); });

      const report = await dashboard.generateOptimizationReport();

      expect(report.sections.codeQuality.error).toBe('Pattern fail');
    });

    it('should handle community section error', async () => {
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500 });
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockOptimizer.getCurrentConfig.mockReturnValue({});
      mockOptimizer.getHistory.mockReturnValue([]);
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockRewardSystem.getStats.mockImplementation(() => { throw new Error('Reward fail'); });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const report = await dashboard.generateOptimizationReport();

      expect(report.sections.community.error).toBe('Reward fail');
    });
  });

  describe('getDashboardData', () => {
    it('should return dashboard data with all components', async () => {
      mockMonitor.getExecutionStats.mockReturnValue({ total: 100 });
      mockMonitor.getPerformanceStats.mockReturnValue({ avgResponseTime: 42 });
      mockMonitor.getAlerts.mockReturnValue([]);
      mockOptimizer.getStats.mockReturnValue({ lastOptimization: '2024-01-01' });
      mockOptimizer.getCurrentConfig.mockReturnValue({});

      const data = await dashboard.getDashboardData('24h');

      expect(data.timeRange).toBe('24h');
      expect(data.monitoring).toBeDefined();
      expect(data.optimization).toBeDefined();
    });

    it('should handle missing monitor', async () => {
      const d2 = new OptimizationDashboard({ optimizer: mockOptimizer });
      mockOptimizer.getStats.mockReturnValue({ lastOptimization: '2024-01-01' });
      mockOptimizer.getCurrentConfig.mockReturnValue({});

      const data = await d2.getDashboardData();

      expect(data.monitoring).toBeUndefined();
      expect(data.optimization).toBeDefined();
    });

    it('should handle missing optimizer', async () => {
      const d2 = new OptimizationDashboard({ monitor: mockMonitor });
      mockMonitor.getExecutionStats.mockReturnValue({ total: 100 });
      mockMonitor.getPerformanceStats.mockReturnValue({});
      mockMonitor.getAlerts.mockReturnValue([]);

      const data = await d2.getDashboardData();

      expect(data.monitoring).toBeDefined();
      expect(data.optimization).toBeUndefined();
    });
  });

  describe('getTrendData', () => {
    it('should return trend data for given metric', async () => {
      jest.useRealTimers();
      const trends = await dashboard.getTrendData('execution_time', 7);

      expect(trends.metric).toBe('execution_time');
      expect(trends.period).toBe('7 days');
      expect(trends.data.length).toBe(8);
      expect(trends.summary).toBeDefined();
      expect(trends.summary.startValue).toBeDefined();
      expect(trends.summary.endValue).toBeDefined();
      expect(typeof trends.summary.change).toBe('string');
      expect(['up', 'down', 'stable']).toContain(trends.summary.trend);
    });

    it('should include summary with trend direction', async () => {
      jest.useRealTimers();
      const trends = await dashboard.getTrendData('error_rate', 1);

      expect(trends.data.length).toBe(2);
    });

    it('should return stable trend when no change', async () => {
      jest.useRealTimers();
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const trends = await dashboard.getTrendData('metric', 0);

      expect(trends.data.length).toBe(1);
    });

    it('should report downward trend when value decreases', async () => {
      jest.useRealTimers();
      const randomSpy = jest.spyOn(Math, 'random');
      randomSpy.mockReturnValueOnce(0.9).mockReturnValue(0.1);

      const trends = await dashboard.getTrendData('metric', 1);

      expect(trends.summary.trend).toBe('down');
    });

    it('should report upward trend when value increases', async () => {
      jest.useRealTimers();
      const randomSpy = jest.spyOn(Math, 'random');
      randomSpy.mockReturnValueOnce(0.1).mockReturnValue(0.9);

      const trends = await dashboard.getTrendData('metric', 1);

      expect(trends.summary.trend).toBe('up');
    });
  });

  describe('runOptimizationAndReport', () => {
    it('should run optimization cycle and save report', async () => {
      mockOptimizer.runOptimizationCycle.mockResolvedValue({ success: true });
      fs.existsSync.mockReturnValue(false);
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500, avgResponseTime: 42 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockMonitor.getExecutionStats.mockReturnValue({ total: 100 });
      mockMonitor.getDownloadStats.mockReturnValue({ total: 200 });
      mockMonitor.getAlerts.mockReturnValue([]);
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockOptimizer.getCurrentConfig.mockReturnValue({ reviewThresholds: { quality: 70 }, rewardMultipliers: { bonus: 1.2 } });
      mockOptimizer.getHistory.mockReturnValue([]);
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockRewardSystem.getStats.mockReturnValue({ totalRewards: 50 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const result = await dashboard.runOptimizationAndReport();

      expect(result.id).toContain('report-');
      expect(result.optimizationResult).toEqual({ success: true });
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const writeArg = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(writeArg.reports).toHaveLength(1);
    });

    it('should handle missing optimizer', async () => {
      const d2 = new OptimizationDashboard({ monitor: mockMonitor });
      fs.existsSync.mockReturnValue(false);
      mockMonitor.getExecutionStats.mockReturnValue({ total: 100 });
      mockMonitor.getPerformanceStats.mockReturnValue({});
      mockMonitor.getAlerts.mockReturnValue([]);

      const result = await d2.runOptimizationAndReport();

      expect(result.optimizationResult).toBeNull();
    });

    it('should cap reports at 50 by dropping oldest', async () => {
      mockOptimizer.runOptimizationCycle.mockResolvedValue({ success: true });
      const existingReports = { reports: Array.from({ length: 50 }, (_, i) => ({ id: `old-${i}` })) };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingReports));
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500, avgResponseTime: 42 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockMonitor.getExecutionStats.mockReturnValue({ total: 100 });
      mockMonitor.getDownloadStats.mockReturnValue({ total: 200 });
      mockMonitor.getAlerts.mockReturnValue([]);
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockOptimizer.getCurrentConfig.mockReturnValue({ reviewThresholds: { quality: 70 }, rewardMultipliers: { bonus: 1.2 } });
      mockOptimizer.getHistory.mockReturnValue([]);
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockRewardSystem.getStats.mockReturnValue({ totalRewards: 50 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const _result = await dashboard.runOptimizationAndReport();

      const writeArg = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(writeArg.reports).toHaveLength(50);
    });

    it('should handle corrupt existing report data', async () => {
      mockOptimizer.runOptimizationCycle.mockResolvedValue({ success: true });
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('corrupt json');
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500, avgResponseTime: 42 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockMonitor.getExecutionStats.mockReturnValue({ total: 100 });
      mockMonitor.getDownloadStats.mockReturnValue({ total: 200 });
      mockMonitor.getAlerts.mockReturnValue([]);
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockOptimizer.getCurrentConfig.mockReturnValue({ reviewThresholds: { quality: 70 }, rewardMultipliers: { bonus: 1.2 } });
      mockOptimizer.getHistory.mockReturnValue([]);
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockRewardSystem.getStats.mockReturnValue({ totalRewards: 50 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const _result = await dashboard.runOptimizationAndReport();

      const writeArg = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(writeArg.reports).toHaveLength(1);
    });

    it('should handle existing data without reports field', async () => {
      mockOptimizer.runOptimizationCycle.mockResolvedValue({ success: true });
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ other: 'x' }));
      mockMonitor.getPerformanceStats.mockReturnValue({ dataPoints: 500, avgResponseTime: 42 });
      mockMonitor.getErrorStats.mockReturnValue({ total: 5 });
      mockMonitor.getExecutionStats.mockReturnValue({ total: 100 });
      mockMonitor.getDownloadStats.mockReturnValue({ total: 200 });
      mockMonitor.getAlerts.mockReturnValue([]);
      mockOptimizer.getStats.mockReturnValue({ totalOptimizations: 10, lastOptimization: new Date().toISOString() });
      mockOptimizer.getCurrentConfig.mockReturnValue({ reviewThresholds: { quality: 70 }, rewardMultipliers: { bonus: 1.2 } });
      mockOptimizer.getHistory.mockReturnValue([]);
      mockTrustScore.getStats.mockReturnValue({ totalSkills: 20, averageScore: 85 });
      mockRewardSystem.getStats.mockReturnValue({ totalRewards: 50 });
      mockReviewWorkflow.getStats.mockReturnValue({ pending: 5, approved: 40, rejected: 5 });

      const _result = await dashboard.runOptimizationAndReport();

      const writeArg = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(writeArg.reports).toHaveLength(1);
    });
  });

  describe('getReportHistory', () => {
    it('should return empty array when no reports file', () => {
      fs.existsSync.mockReturnValue(false);
      const history = dashboard.getReportHistory();

      expect(history).toEqual([]);
    });

    it('should return recent reports in reverse order', () => {
      const reports = [
        { id: 'report-1', timestamp: '2024-01-01' },
        { id: 'report-2', timestamp: '2024-01-02' },
        { id: 'report-3', timestamp: '2024-01-03' }
      ];
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ reports }));

      const history = dashboard.getReportHistory(2);

      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('report-3');
      expect(history[1].id).toBe('report-2');
    });

    it('should handle corrupt data gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{{{');

      const history = dashboard.getReportHistory();

      expect(history).toEqual([]);
    });

    it('should return empty when data lacks reports field', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ other: 'x' }));

      const history = dashboard.getReportHistory();

      expect(history).toEqual([]);
    });
  });

  describe('getConfigurationSuggestions', () => {
    it('should return suggestions for low review thresholds', () => {
      mockOptimizer.getCurrentConfig.mockReturnValue({
        reviewThresholds: { quality: 50, security: 55 },
        rewardMultipliers: { bonus: 1.2 }
      });

      const suggestions = dashboard.getConfigurationSuggestions();

      expect(suggestions.length).toBe(2);
      suggestions.forEach((s) => {
        expect(s.type).toBe('review_threshold');
        expect(s.priority).toBe('medium');
      });
    });

    it('should return suggestions for high reward multipliers', () => {
      mockOptimizer.getCurrentConfig.mockReturnValue({
        reviewThresholds: { quality: 80 },
        rewardMultipliers: { bonus: 2.0, contribution: 1.8 }
      });

      const suggestions = dashboard.getConfigurationSuggestions();

      expect(suggestions.length).toBe(2);
      suggestions.forEach((s) => {
        expect(s.type).toBe('reward_multiplier');
        expect(s.priority).toBe('low');
      });
    });

    it('should return mixed suggestions', () => {
      mockOptimizer.getCurrentConfig.mockReturnValue({
        reviewThresholds: { quality: 50 },
        rewardMultipliers: { contribution: 2.0 }
      });

      const suggestions = dashboard.getConfigurationSuggestions();

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].type).toBe('review_threshold');
      expect(suggestions[1].type).toBe('reward_multiplier');
    });

    it('should return empty when all values are within range', () => {
      mockOptimizer.getCurrentConfig.mockReturnValue({
        reviewThresholds: { quality: 80, security: 75 },
        rewardMultipliers: { bonus: 1.2, contribution: 1.0 }
      });

      const suggestions = dashboard.getConfigurationSuggestions();

      expect(suggestions).toHaveLength(0);
    });

    it('should return empty when optimizer is missing', () => {
      const d2 = new OptimizationDashboard({});
      const suggestions = d2.getConfigurationSuggestions();
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should return system metrics with memory and uptime', () => {
      mockMonitor.getPerformanceStats.mockReturnValue({
        avgResponseTime: 100,
        cacheHitRate: 0.8,
        dataPoints: 300
      });
      const metrics = dashboard.getPerformanceMetrics();

      expect(metrics.system.memoryUsage).toBeDefined();
      expect(metrics.system.uptime).toBeDefined();
      expect(metrics.application).toBeDefined();
    });

    it('should include application metrics when monitor is present', () => {
      mockMonitor.getPerformanceStats.mockReturnValue({
        avgResponseTime: 120,
        cacheHitRate: 0.85,
        dataPoints: 500
      });

      const metrics = dashboard.getPerformanceMetrics();

      expect(metrics.application).toBeDefined();
      expect(metrics.application.avgResponseTime).toBe(120);
      expect(metrics.application.cacheHitRate).toBe(0.85);
    });

    it('should omit application metrics when monitor is missing', () => {
      const d2 = new OptimizationDashboard({});
      const metrics = d2.getPerformanceMetrics();

      expect(metrics.application).toBeUndefined();
    });
  });

  describe('generateSummaryReport', () => {
    it('should return summary with enabled flags', () => {
      mockOptimizer.getCurrentConfig.mockReturnValue({
        reviewThresholds: { quality: 80 },
        rewardMultipliers: { bonus: 1.2 }
      });

      const summary = dashboard.generateSummaryReport();

      expect(summary.summary.monitoringEnabled).toBe(true);
      expect(summary.summary.optimizerEnabled).toBe(true);
      expect(summary.summary.staticAnalyzerEnabled).toBe(true);
      expect(summary.capabilities.staticAnalysisLanguages).toContain('JavaScript');
      expect(summary.capabilities.communityFeatures).toBe(true);
    });

    it('should reflect disabled services', () => {
      const d2 = new OptimizationDashboard({});
      const summary = d2.generateSummaryReport();

      expect(summary.summary.monitoringEnabled).toBe(false);
      expect(summary.summary.optimizerEnabled).toBe(false);
      expect(summary.capabilities.communityFeatures).toBe(false);
    });
  });
});
