const { AdaptiveOptimizer } = require('../../src/skills/optimization/AdaptiveOptimizer');
const fs = require('fs');

jest.mock('fs');

describe('AdaptiveOptimizer', () => {
  let optimizer;
  let mockMonitor;
  let mockReviewWorkflow;
  let mockRewardSystem;
  let mockTrustScore;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    jest.clearAllMocks();

    fs.existsSync.mockReturnValue(false);

    mockMonitor = {
      getExecutionStats: jest.fn(),
      getDownloadStats: jest.fn(),
      getErrorStats: jest.fn()
    };

    mockReviewWorkflow = {
      getStats: jest.fn(),
      getConfig: jest.fn().mockReturnValue({ reviewCriteria: {} }),
      updateConfig: jest.fn()
    };

    mockRewardSystem = {
      getStats: jest.fn()
    };

    mockTrustScore = {
      getStats: jest.fn()
    };

    optimizer = new AdaptiveOptimizer({
      monitor: mockMonitor,
      reviewWorkflow: mockReviewWorkflow,
      rewardSystem: mockRewardSystem,
      trustScore: mockTrustScore
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('stores dependency references', () => {
      expect(optimizer.monitor).toBe(mockMonitor);
      expect(optimizer.reviewWorkflow).toBe(mockReviewWorkflow);
      expect(optimizer.rewardSystem).toBe(mockRewardSystem);
      expect(optimizer.trustScore).toBe(mockTrustScore);
    });

    it('sets default config values', () => {
      expect(optimizer.config.enabled).toBe(true);
      expect(optimizer.config.analysisInterval).toBe(24 * 60 * 60 * 1000);
      expect(optimizer.config.minDataPoints).toBe(100);
      expect(optimizer.config.confidenceLevel).toBe(0.8);
      expect(optimizer.config.maxAdjustmentPercent).toBe(20);
      expect(optimizer.config.cooldownPeriod).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('initializes rules with defaults', () => {
      expect(optimizer.rules.reviewThresholds.codeQuality.current).toBe(70);
      expect(optimizer.rules.reviewThresholds.security.current).toBe(80);
      expect(optimizer.rules.rewardMultipliers.skillPublished.current).toBe(1.0);
      expect(optimizer.rules.rewardMultipliers.skillDownloaded.current).toBe(1.0);
      expect(optimizer.rules.trustScoreWeights.codeQuality.current).toBe(0.30);
      expect(optimizer.rules.autoApproval.trustScoreThreshold.current).toBe(90);
      expect(optimizer.rules.autoApproval.minReviewsRequired.current).toBe(2);
    });

    it('uses custom dataDir', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(false);
      const opt = new AdaptiveOptimizer({ dataDir: '/custom/optimizer' });
      expect(opt.dataDir).toBe('/custom/optimizer');
    });

    it('loads saved config from disk when files exist', () => {
      jest.clearAllMocks();
      fs.existsSync.mockImplementation((p) =>
        p.includes('optimizer-config.json')
      );
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('optimizer-config.json')) {
          return JSON.stringify({ enabled: false, minDataPoints: 50 });
        }
        return '{}';
      });

      const opt = new AdaptiveOptimizer({
        monitor: mockMonitor,
        reviewWorkflow: mockReviewWorkflow,
        rewardSystem: mockRewardSystem,
        trustScore: mockTrustScore
      });

      expect(opt.config.enabled).toBe(false);
      expect(opt.config.minDataPoints).toBe(50);
    });

    it('loads rules from disk when rules file exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockImplementation((p) =>
        p.includes('adaptive-rules.json')
      );
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('adaptive-rules.json')) {
          return JSON.stringify({
            reviewThresholds: { codeQuality: { min: 50, max: 90, current: 80 } }
          });
        }
        return '{}';
      });

      const opt = new AdaptiveOptimizer({
        monitor: mockMonitor,
        reviewWorkflow: mockReviewWorkflow,
        rewardSystem: mockRewardSystem,
        trustScore: mockTrustScore
      });

      expect(opt.rules.reviewThresholds.codeQuality.current).toBe(80);
    });

    it('creates data directory when it does not exist', () => {
      expect(fs.existsSync).toHaveBeenCalledWith(optimizer.dataDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(optimizer.dataDir, { recursive: true });
    });
  });

  describe('_ensureDataDir', () => {
    it('does not create directory if it already exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      optimizer._ensureDataDir();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_loadData', () => {
    it('handles JSON parse errors gracefully', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');
      expect(() => { optimizer._loadData(); }).not.toThrow();
    });

    it('loads history from disk when history file exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('optimization-history.json')) {
          return JSON.stringify({
            optimizations: [{ timestamp: '2026-06-01T00:00:00Z', adjustments: [] }],
            lastOptimization: '2026-06-01T00:00:00Z'
          });
        }
        return '{}';
      });

      optimizer._loadData();
      expect(optimizer.history).toHaveLength(1);
      expect(optimizer.history[0].timestamp).toBe('2026-06-01T00:00:00Z');
      expect(optimizer.lastOptimization).toBe('2026-06-01T00:00:00Z');
    });

    it('handles history file without optimizations key', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('optimization-history.json')) {
          return JSON.stringify({ lastOptimization: '2026-06-01T00:00:00Z' });
        }
        return '{}';
      });

      optimizer._loadData();
      expect(optimizer.history).toEqual([]);
    });
  });

  describe('_saveData', () => {
    it('writes config, rules, and history files', () => {
      optimizer.history.push({ timestamp: '2026-06-15T12:00:00Z', adjustments: [] });
      optimizer._saveData();

      const writeCalls = fs.writeFileSync.mock.calls;
      expect(writeCalls.length).toBe(3);

      const configCall = writeCalls.find(c => c[0].includes('optimizer-config.json'));
      expect(configCall).toBeDefined();
      const parsed = JSON.parse(configCall[1]);
      expect(parsed.enabled).toBe(true);

      const historyCall = writeCalls.find(c => c[0].includes('optimization-history.json'));
      expect(historyCall).toBeDefined();
      const history = JSON.parse(historyCall[1]);
      expect(history.optimizations).toHaveLength(1);
      expect(history.lastUpdated).toBeDefined();
    });

    it('limits history to 100 entries', () => {
      for (let i = 0; i < 150; i++) {
        optimizer.history.push({ timestamp: `2026-${String(i).padStart(3, '0')}`, adjustments: [] });
      }
      optimizer._saveData();
      const historyCall = fs.writeFileSync.mock.calls.find(
        c => c[0].includes('optimization-history.json')
      );
      const history = JSON.parse(historyCall[1]);
      expect(history.optimizations).toHaveLength(100);
    });

    it('handles write errors gracefully', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('Disk full'); });
      expect(() => { optimizer._saveData(); }).not.toThrow();
    });
  });

  describe('getCurrentConfig', () => {
    it('returns flattened current values from all rule categories', () => {
      const config = optimizer.getCurrentConfig();
      expect(config.reviewThresholds.codeQuality).toBe(70);
      expect(config.reviewThresholds.security).toBe(80);
      expect(config.reviewThresholds.documentation).toBe(60);
      expect(config.rewardMultipliers.skillPublished).toBe(1.0);
      expect(config.rewardMultipliers.skillDownloaded).toBe(1.0);
      expect(config.trustScoreWeights.codeQuality).toBe(0.30);
      expect(config.autoApproval.trustScoreThreshold).toBe(90);
      expect(config.autoApproval.minReviewsRequired).toBe(2);
    });
  });

  describe('setConfig', () => {
    it('sets review threshold clamped within [min, max]', () => {
      const result = optimizer.setConfig('reviewThresholds', 'codeQuality', 75);
      expect(optimizer.rules.reviewThresholds.codeQuality.current).toBe(75);
      expect(result.reviewThresholds.codeQuality).toBe(75);
    });

    it('clamps review threshold to min when below range', () => {
      optimizer.setConfig('reviewThresholds', 'codeQuality', 40);
      expect(optimizer.rules.reviewThresholds.codeQuality.current).toBe(60);
    });

    it('clamps review threshold to max when above range', () => {
      optimizer.setConfig('reviewThresholds', 'codeQuality', 100);
      expect(optimizer.rules.reviewThresholds.codeQuality.current).toBe(85);
    });

    it('sets reward multiplier clamped within [min, max]', () => {
      optimizer.setConfig('rewardMultipliers', 'skillDownloaded', 1.5);
      expect(optimizer.rules.rewardMultipliers.skillDownloaded.current).toBe(1.5);
    });

    it('clamps reward multiplier to max', () => {
      optimizer.setConfig('rewardMultipliers', 'skillDownloaded', 5.0);
      expect(optimizer.rules.rewardMultipliers.skillDownloaded.current).toBe(3.0);
    });

    it('sets trust score weight and normalizes', () => {
      optimizer.setConfig('trustScoreWeights', 'codeQuality', 0.35);
      const total = Object.values(optimizer.rules.trustScoreWeights)
        .reduce((sum, w) => sum + w.current, 0);
      expect(Math.abs(total - 1.0)).toBeLessThan(0.02);
    });

    it('throws for invalid category', () => {
      expect(() => optimizer.setConfig('invalid', 'key', 1)).toThrow('Invalid configuration');
    });

    it('throws for invalid key', () => {
      expect(() => optimizer.setConfig('reviewThresholds', 'badKey', 1)).toThrow('Invalid configuration');
    });
  });

  describe('_startAutoOptimization', () => {
    it('starts interval and runs optimization on tick', () => {
      jest.spyOn(optimizer, 'runOptimizationCycle').mockResolvedValue({});
      optimizer._startAutoOptimization();
      jest.advanceTimersByTime(optimizer.config.analysisInterval);
      expect(optimizer.runOptimizationCycle).toHaveBeenCalled();
    });

    it('does nothing when disabled', () => {
      jest.clearAllTimers();
      optimizer.config.enabled = false;
      const spy = jest.spyOn(optimizer, 'runOptimizationCycle');
      optimizer._startAutoOptimization();
      jest.advanceTimersByTime(optimizer.config.analysisInterval * 2);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('returns empty array when no history', () => {
      expect(optimizer.getHistory()).toEqual([]);
    });

    it('returns last n entries in reverse order', () => {
      optimizer.history.push(
        { timestamp: '2026-06-01', adjustments: [1] },
        { timestamp: '2026-06-02', adjustments: [2] },
        { timestamp: '2026-06-03', adjustments: [3] }
      );
      const result = optimizer.getHistory(2);
      expect(result).toHaveLength(2);
      expect(result[0].timestamp).toBe('2026-06-03');
      expect(result[1].timestamp).toBe('2026-06-02');
    });
  });

  describe('getStats', () => {
    it('returns stats with config and current rules', () => {
      const stats = optimizer.getStats();
      expect(stats.totalOptimizations).toBe(0);
      expect(stats.lastOptimization).toBeNull();
      expect(stats.config).toBe(optimizer.config);
      expect(stats.currentRules).toEqual(optimizer.getCurrentConfig());
    });
  });

  describe('generateReport', () => {
    it('returns empty summary when no history', () => {
      const report = optimizer.generateReport();
      expect(report.summary.totalOptimizations).toBe(0);
      expect(report.summary.totalAdjustments).toBe(0);
      expect(report.summary.adjustmentsByType).toEqual({});
      expect(report.recentOptimizations).toEqual([]);
    });

    it('aggregates adjustments by type', () => {
      optimizer.history.push(
        {
          timestamp: '2026-06-14',
          adjustments: [{ type: 'review_threshold' }],
          recommendations: []
        },
        {
          timestamp: '2026-06-15',
          adjustments: [{ type: 'review_threshold' }, { type: 'reward_multiplier' }],
          recommendations: [{}]
        }
      );
      optimizer.lastOptimization = '2026-06-15T12:00:00Z';

      const report = optimizer.generateReport();
      expect(report.summary.totalOptimizations).toBe(2);
      expect(report.summary.totalAdjustments).toBe(3);
      expect(report.summary.adjustmentsByType.review_threshold).toBe(2);
      expect(report.summary.adjustmentsByType.reward_multiplier).toBe(1);
      expect(report.summary.lastOptimization).toBe('2026-06-15T12:00:00Z');
      expect(report.recentOptimizations).toHaveLength(2);
    });

    it('handles history entries missing adjustments and recommendations', () => {
      optimizer.history.push({ timestamp: '2026-06-16T00:00:00Z' });
      const report = optimizer.generateReport();
      expect(report.summary.totalAdjustments).toBe(0);
      expect(report.recentOptimizations[0].adjustments).toBe(0);
      expect(report.recentOptimizations[0].recommendations).toBe(0);
    });
  });

  describe('_normalizeTrustWeights', () => {
    it('normalizes weights to sum to 1.0', () => {
      optimizer.rules.trustScoreWeights.codeQuality.current = 0.50;
      optimizer._normalizeTrustWeights();
      const total = Object.values(optimizer.rules.trustScoreWeights)
        .reduce((sum, w) => sum + w.current, 0);
      expect(Math.abs(total - 1.0)).toBeLessThan(0.02);
    });

    it('does nothing if already close to 1.0', () => {
      const before = optimizer.rules.trustScoreWeights.codeQuality.current;
      optimizer._normalizeTrustWeights();
      expect(optimizer.rules.trustScoreWeights.codeQuality.current).toBe(before);
    });
  });

  describe('_collectMonitorData', () => {
    beforeEach(() => {
      mockMonitor.getExecutionStats.mockReturnValue({
        total: 1000, successful: 900, failed: 100, avgDuration: 500
      });
      mockMonitor.getDownloadStats.mockReturnValue({
        total: 300, topSkills: ['skill-a', 'skill-b']
      });
      mockMonitor.getErrorStats.mockReturnValue({
        total: 50, byType: { timeout: 30, crash: 20 }
      });
      mockReviewWorkflow.getStats.mockReturnValue({
        pending: 20, approved: 100, rejected: 30, avgScore: 75
      });
      mockTrustScore.getStats.mockReturnValue({
        distribution: { poor: 5, below: 10, good: 50, excellent: 20 },
        averageScore: 72
      });
      mockRewardSystem.getStats.mockReturnValue({
        totalPointsAwarded: 5000,
        totalBadgesAwarded: 25
      });
    });

    it('collects execution stats from monitor', () => {
      const data = optimizer._collectMonitorData();
      expect(data.executions).toEqual({ total: 1000, successful: 900, failed: 100, avgDuration: 500 });
    });

    it('collects download stats from monitor', () => {
      const data = optimizer._collectMonitorData();
      expect(data.downloads).toEqual({ total: 300, topSkills: ['skill-a', 'skill-b'] });
    });

    it('collects error stats from monitor', () => {
      const data = optimizer._collectMonitorData();
      expect(data.errors).toEqual({ total: 50, byType: { timeout: 30, crash: 20 } });
    });

    it('collects review stats from reviewWorkflow', () => {
      const data = optimizer._collectMonitorData();
      expect(data.reviews).toEqual({ pending: 20, approved: 100, rejected: 30, avgScore: 75 });
    });

    it('collects trust score stats', () => {
      const data = optimizer._collectMonitorData();
      expect(data.trustScores.avgScore).toBe(72);
      expect(data.trustScores.distribution.excellent).toBe(20);
    });

    it('collects reward stats', () => {
      const data = optimizer._collectMonitorData();
      expect(data.rewards).toEqual({ totalPoints: 5000, badgesAwarded: 25 });
    });

    it('returns defaults when no dependencies exist', () => {
      const opt = new AdaptiveOptimizer();
      const data = opt._collectMonitorData();
      expect(data.executions.total).toBe(0);
      expect(data.reviews.pending).toBe(0);
      expect(data.trustScores.avgScore).toBe(0);
      expect(data.rewards.totalPoints).toBe(0);
    });

    it('handles monitor error gracefully', () => {
      mockMonitor.getExecutionStats.mockImplementation(() => { throw new Error('fail'); });
      mockMonitor.getDownloadStats.mockImplementation(() => { throw new Error('fail'); });
      mockMonitor.getErrorStats.mockImplementation(() => { throw new Error('fail'); });
      const data = optimizer._collectMonitorData();
      expect(data.executions.total).toBe(0);
    });

    it('handles reviewWorkflow error gracefully', () => {
      mockReviewWorkflow.getStats.mockImplementation(() => { throw new Error('fail'); });
      const data = optimizer._collectMonitorData();
      expect(data.reviews.pending).toBe(0);
    });

    it('handles trustScore error gracefully', () => {
      mockTrustScore.getStats.mockImplementation(() => { throw new Error('fail'); });
      const data = optimizer._collectMonitorData();
      expect(data.trustScores.avgScore).toBe(0);
    });

    it('handles rewardSystem error gracefully', () => {
      mockRewardSystem.getStats.mockImplementation(() => { throw new Error('fail'); });
      const data = optimizer._collectMonitorData();
      expect(data.rewards.totalPoints).toBe(0);
    });

    it('defaults review avgScore to 0 when missing', () => {
      mockReviewWorkflow.getStats.mockReturnValue({
        pending: 10, approved: 100, rejected: 30
      });
      const data = optimizer._collectMonitorData();
      expect(data.reviews.avgScore).toBe(0);
    });
  });

  describe('_analyzeAndAdjustReviewThresholds', () => {
    it('returns empty when data points are below minDataPoints', () => {
      const data = { reviews: { approved: 5, rejected: 3 } };
      const result = optimizer._analyzeAndAdjustReviewThresholds(data);
      expect(result).toEqual([]);
    });

    it('increases all thresholds when approval rate > 90%', () => {
      const data = { reviews: { approved: 100, rejected: 5 } };
      const result = optimizer._analyzeAndAdjustReviewThresholds(data);
      expect(result.length).toBe(5);
      expect(result[0].type).toBe('review_threshold');
      expect(result[0].reason).toContain('Approval rate too high');
      result.forEach((adj) => {
        expect(adj.newValue).toBeGreaterThan(adj.oldValue);
      });
    });

    it('decreases all thresholds when approval rate < 50%', () => {
      const data = { reviews: { approved: 50, rejected: 200 } };
      const result = optimizer._analyzeAndAdjustReviewThresholds(data);
      expect(result.length).toBe(5);
      expect(result[0].reason).toContain('Approval rate too low');
      result.forEach((adj) => {
        expect(adj.newValue).toBeLessThan(adj.oldValue);
      });
    });

    it('returns empty for normal approval rate (50-90%)', () => {
      const data = { reviews: { approved: 70, rejected: 30 } };
      const result = optimizer._analyzeAndAdjustReviewThresholds(data);
      expect(result).toEqual([]);
    });
  });

  describe('_analyzeAndAdjustRewardRules', () => {
    it('increases download reward when downloads < 10% of executions', () => {
      const data = {
        executions: { total: 2000 },
        downloads: { total: 50 },
        errors: { total: 100 },
        reviews: { approved: 30, rejected: 10 }
      };
      const result = optimizer._analyzeAndAdjustRewardRules(data);
      const adj = result.find((r) => r.rule === 'skillDownloaded');
      expect(adj).toBeDefined();
      expect(adj.reason).toContain('Download rate low');
    });

    it('increases review reward when review participation < 5% of executions', () => {
      const data = {
        executions: { total: 2000 },
        downloads: { total: 500 },
        errors: { total: 100 },
        reviews: { approved: 10, rejected: 5 }
      };
      const result = optimizer._analyzeAndAdjustRewardRules(data);
      const adj = result.find((r) => r.rule === 'reviewWritten');
      expect(adj).toBeDefined();
      expect(adj.reason).toContain('Review participation low');
    });

    it('increases security scan reward when error rate > 10%', () => {
      const data = {
        executions: { total: 1000 },
        downloads: { total: 500 },
        errors: { total: 200 },
        reviews: { approved: 30, rejected: 10 }
      };
      const result = optimizer._analyzeAndAdjustRewardRules(data);
      const adj = result.find((r) => r.rule === 'securityScanPassed');
      expect(adj).toBeDefined();
      expect(adj.reason).toContain('Error rate high');
    });

    it('returns empty when no conditions trigger', () => {
      const data = {
        executions: { total: 100 },
        downloads: { total: 50 },
        errors: { total: 5 },
        reviews: { approved: 30, rejected: 10 }
      };
      const result = optimizer._analyzeAndAdjustRewardRules(data);
      expect(result).toEqual([]);
    });
  });

  describe('_analyzeAndAdjustTrustWeights', () => {
    it('returns empty when avgScore is 0', () => {
      const data = {
        trustScores: { distribution: {}, avgScore: 0 },
        downloads: { total: 0 }
      };
      const result = optimizer._analyzeAndAdjustTrustWeights(data);
      expect(result).toEqual([]);
    });

    it('increases code quality weight when avg trust score < 60', () => {
      const data = {
        trustScores: {
          distribution: { poor: 10, below: 20, good: 30, excellent: 5 },
          avgScore: 50
        },
        downloads: { total: 100 }
      };
      const result = optimizer._analyzeAndAdjustTrustWeights(data);
      const adj = result.find((r) => r.weight === 'codeQuality');
      expect(adj).toBeDefined();
      expect(adj.reason).toContain('Average trust score low');
      expect(adj.newValue).toBeGreaterThan(adj.oldValue);
    });

    it('returns empty when conditions do not trigger', () => {
      const data = {
        trustScores: {
          distribution: { poor: 1, below: 2, good: 50, excellent: 30 },
          avgScore: 85
        },
        downloads: { total: 2000 }
      };
      const result = optimizer._analyzeAndAdjustTrustWeights(data);
      expect(result).toEqual([]);
    });
  });

  describe('_applyReviewThresholdAdjustments', () => {
    it('updates rule values from adjustments', () => {
      optimizer._applyReviewThresholdAdjustments([{
        type: 'review_threshold', criterion: 'codeQuality',
        oldValue: 70, newValue: 75, reason: 'test'
      }]);
      expect(optimizer.rules.reviewThresholds.codeQuality.current).toBe(75);
    });

    it('calls reviewWorkflow.updateConfig with new thresholds', () => {
      mockReviewWorkflow.getConfig.mockReturnValue({
        reviewCriteria: {}
      });
      optimizer._applyReviewThresholdAdjustments([{
        type: 'review_threshold', criterion: 'codeQuality',
        oldValue: 70, newValue: 75, reason: 'test'
      }]);
      expect(mockReviewWorkflow.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ reviewCriteria: expect.any(Object) })
      );
    });

    it('skips updateConfig when no adjustments given', () => {
      optimizer._applyReviewThresholdAdjustments([]);
      expect(mockReviewWorkflow.updateConfig).not.toHaveBeenCalled();
    });

    it('handles missing reviewWorkflow gracefully', () => {
      const opt = new AdaptiveOptimizer();
      expect(() => {
        opt._applyReviewThresholdAdjustments([{
          type: 'review_threshold', criterion: 'codeQuality',
          oldValue: 70, newValue: 75, reason: 'test'
        }]);
      }).not.toThrow();
    });

    it('warns when updateConfig fails', () => {
      mockReviewWorkflow.updateConfig.mockImplementation(() => {
        throw new Error('config error');
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      optimizer._applyReviewThresholdAdjustments([{
        type: 'review_threshold', criterion: 'codeQuality',
        oldValue: 70, newValue: 75, reason: 'test'
      }]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to update review workflow config'), expect.any(String));
      warnSpy.mockRestore();
    });
  });

  describe('_applyRewardAdjustments', () => {
    it('updates reward multiplier values', () => {
      optimizer._applyRewardAdjustments([{
        type: 'reward_multiplier', rule: 'skillDownloaded',
        oldValue: 1.0, newValue: 1.2, reason: 'test'
      }]);
      expect(optimizer.rules.rewardMultipliers.skillDownloaded.current).toBe(1.2);
    });

    it('ignores unknown rule keys', () => {
      optimizer._applyRewardAdjustments([{
        type: 'reward_multiplier', rule: 'unknown',
        oldValue: 1.0, newValue: 2.0, reason: 'test'
      }]);
      expect(optimizer.rules.rewardMultipliers.skillPublished.current).toBe(1.0);
    });
  });

  describe('_applyTrustWeightAdjustments', () => {
    it('updates trust weight values and normalizes', () => {
      optimizer._applyTrustWeightAdjustments([{
        type: 'trust_weight', weight: 'codeQuality',
        oldValue: 0.30, newValue: 0.35, reason: 'test'
      }]);
      const total = Object.values(optimizer.rules.trustScoreWeights)
        .reduce((sum, w) => sum + w.current, 0);
      expect(Math.abs(total - 1.0)).toBeLessThan(0.02);
    });
  });

  describe('_generateRecommendations', () => {
    it('recommends more reviewers when pending > 50', () => {
      const recs = optimizer._generateRecommendations({
        reviews: { pending: 100, approved: 10, rejected: 5 },
        executions: { total: 100, avgDuration: 1000 },
        errors: { total: 5 },
        rewards: { totalPoints: 1000, badgesAwarded: 10 },
        trustScores: { distribution: { poor: 2, below: 3 } }
      });
      expect(recs.find((r) => r.category === 'review_efficiency')).toBeDefined();
    });

    it('recommends stricter review when error rate > 15%', () => {
      const recs = optimizer._generateRecommendations({
        reviews: { pending: 10, approved: 10, rejected: 5 },
        executions: { total: 100, successful: 80, avgDuration: 1000 },
        errors: { total: 20 },
        rewards: { totalPoints: 1000, badgesAwarded: 10 },
        trustScores: { distribution: { poor: 2, below: 3 } }
      });
      expect(recs.find((r) => r.category === 'quality')).toBeDefined();
    });

    it('recommends badge adjustment when badge rate is low', () => {
      const recs = optimizer._generateRecommendations({
        reviews: { pending: 10, approved: 10, rejected: 5 },
        executions: { total: 100, avgDuration: 1000 },
        errors: { total: 5 },
        rewards: { totalPoints: 1000, badgesAwarded: 1 },
        trustScores: { distribution: { poor: 2, below: 3 } }
      });
      expect(recs.find((r) => r.category === 'community')).toBeDefined();
    });

    it('recommends improvement guide when low trust scores exceed 10', () => {
      const recs = optimizer._generateRecommendations({
        trustScores: { distribution: { poor: 8, below: 5 } },
        reviews: { pending: 10, approved: 10, rejected: 5 },
        executions: { total: 100, avgDuration: 1000 },
        errors: { total: 5 },
        rewards: { totalPoints: 1000, badgesAwarded: 10 }
      });
      expect(recs.find((r) => r.category === 'trust')).toBeDefined();
    });

    it('recommends performance optimization when avgDuration > 5000ms', () => {
      const recs = optimizer._generateRecommendations({
        trustScores: { distribution: { poor: 2, below: 3 } },
        reviews: { pending: 10, approved: 10, rejected: 5 },
        executions: { total: 100, avgDuration: 6000 },
        errors: { total: 5 },
        rewards: { totalPoints: 1000, badgesAwarded: 10 }
      });
      expect(recs.find((r) => r.category === 'performance')).toBeDefined();
    });

    it('returns empty array when no conditions trigger', () => {
      const recs = optimizer._generateRecommendations({
        trustScores: { distribution: { poor: 0, below: 0 } },
        reviews: { pending: 5 },
        executions: { total: 100, avgDuration: 1000 },
        errors: { total: 5 },
        rewards: { totalPoints: 1000, badgesAwarded: 20 }
      });
      expect(recs).toEqual([]);
    });
  });

  describe('runOptimizationCycle', () => {
    beforeEach(() => {
      mockMonitor.getExecutionStats.mockReturnValue({
        total: 1000, successful: 900, failed: 100, avgDuration: 500
      });
      mockMonitor.getDownloadStats.mockReturnValue({
        total: 300, topSkills: ['skill-a']
      });
      mockMonitor.getErrorStats.mockReturnValue({
        total: 50, byType: { timeout: 30, crash: 20 }
      });
      mockReviewWorkflow.getStats.mockReturnValue({
        pending: 10, approved: 100, rejected: 30, avgScore: 75
      });
      mockTrustScore.getStats.mockReturnValue({
        distribution: { poor: 5, good: 50, excellent: 20 },
        averageScore: 72
      });
      mockRewardSystem.getStats.mockReturnValue({
        totalPointsAwarded: 5000,
        totalBadgesAwarded: 25
      });
    });

    it('executes a full optimization cycle', async () => {
      const result = await optimizer.runOptimizationCycle();
      expect(result.timestamp).toBeDefined();
      expect(Array.isArray(result.adjustments)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(optimizer.history).toHaveLength(1);
      expect(optimizer.lastOptimization).toBeDefined();
    });

    it('skips optimization during cooldown period', async () => {
      optimizer.lastOptimization = new Date(Date.now() - 86400000).toISOString();
      const result = await optimizer.runOptimizationCycle();
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('cooldown');
    });

    it('runs optimization after cooldown expires', async () => {
      optimizer.lastOptimization = new Date(Date.now() - 14 * 86400000).toISOString();
      const result = await optimizer.runOptimizationCycle();
      expect(result.skipped).toBeUndefined();
      expect(optimizer.history).toHaveLength(1);
    });

    it('calls all dependency methods', async () => {
      await optimizer.runOptimizationCycle();
      expect(mockMonitor.getExecutionStats).toHaveBeenCalled();
      expect(mockMonitor.getDownloadStats).toHaveBeenCalled();
      expect(mockMonitor.getErrorStats).toHaveBeenCalled();
      expect(mockReviewWorkflow.getStats).toHaveBeenCalled();
      expect(mockTrustScore.getStats).toHaveBeenCalled();
      expect(mockRewardSystem.getStats).toHaveBeenCalled();
    });

    it('persists data after successful cycle', async () => {
      await optimizer.runOptimizationCycle();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('completes gracefully when dependencies throw errors', async () => {
      mockMonitor.getExecutionStats.mockImplementation(() => {
        throw new Error('fail');
      });
      mockMonitor.getDownloadStats.mockImplementation(() => {
        throw new Error('fail');
      });
      mockMonitor.getErrorStats.mockImplementation(() => {
        throw new Error('fail');
      });
      const result = await optimizer.runOptimizationCycle();
      expect(result.timestamp).toBeDefined();
      expect(Array.isArray(result.adjustments)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('applies review and reward adjustments when detected', async () => {
      mockReviewWorkflow.getStats.mockReturnValue({
        pending: 10, approved: 190, rejected: 10, avgScore: 75
      });
      mockMonitor.getExecutionStats.mockReturnValue({
        total: 5000, successful: 4900, failed: 100, avgDuration: 500
      });
      mockMonitor.getDownloadStats.mockReturnValue({
        total: 100, topSkills: ['skill-a']
      });
      mockMonitor.getErrorStats.mockReturnValue({
        total: 600, byType: { timeout: 300, crash: 300 }
      });
      const result = await optimizer.runOptimizationCycle();
      expect(result.adjustments.some((a) => a.type === 'review_threshold')).toBe(true);
      expect(result.adjustments.some((a) => a.type === 'reward_multiplier')).toBe(true);
    });

    it('records error when monitor collection throws', async () => {
      jest.spyOn(optimizer, '_collectMonitorData').mockImplementation(() => {
        throw new Error('monitor broken');
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = await optimizer.runOptimizationCycle();
      expect(result.error).toBe('monitor broken');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('优化失败'), expect.any(String));
      errorSpy.mockRestore();
    });
  });
});
