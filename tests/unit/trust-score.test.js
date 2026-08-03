jest.mock('fs');
const fs = require('fs');
const path = require('path');
const { TrustScore } = require('../../src/skills/security/TrustScore');

const defaultWeights = {
  codeQuality: 0.30,
  communityFeedback: 0.25,
  downloadPopularity: 0.15,
  updateFrequency: 0.10,
  authorReputation: 0.10,
  verificationStatus: 0.10
};

function getDefaultDir() {
  return path.join(process.cwd(), 'data', 'trust');
}

function getDefaultFile() {
  return path.join(getDefaultDir(), 'trust-scores.json');
}

describe('TrustScore', () => {
  let trustScore;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    trustScore = new TrustScore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('creates instance with default options', () => {
      expect(trustScore.dataDir).toBe(getDefaultDir());
      expect(trustScore.dataFile).toBe(getDefaultFile());
      expect(trustScore.weights).toEqual(defaultWeights);
      expect(trustScore.scores).toBeInstanceOf(Map);
      expect(fs.existsSync).toHaveBeenCalledWith(getDefaultDir());
      expect(fs.mkdirSync).toHaveBeenCalledWith(getDefaultDir(), { recursive: true });
    });

    test('creates instance with custom dataDir', () => {
      const customDir = path.join(process.cwd(), 'custom', 'path');
      const custom = new TrustScore({ dataDir: customDir });
      expect(custom.dataDir).toBe(customDir);
      expect(custom.dataFile).toBe(path.join(customDir, 'trust-scores.json'));
    });

    test('loads existing data from file', () => {
      jest.clearAllMocks();
      const existingData = {
        scores: {
          skill1: { skillId: 'skill1', score: 85, trustLevel: 'good' },
          skill2: { skillId: 'skill2', score: 45, trustLevel: 'below' }
        }
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingData));
      const loaded = new TrustScore();
      expect(loaded.scores.get('skill1').score).toBe(85);
      expect(loaded.scores.get('skill2').score).toBe(45);
    });

    test('handles corrupt data gracefully', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json{{{');
      const loaded = new TrustScore();
      expect(loaded.scores.size).toBe(0);
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('_ensureDataDir', () => {
    test('creates directory when it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      trustScore._ensureDataDir();
      expect(fs.mkdirSync).toHaveBeenCalledWith(trustScore.dataDir, { recursive: true });
    });

    test('does not create directory when it exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      trustScore._ensureDataDir();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_loadData', () => {
    test('loads scores from file into Map', () => {
      const data = { scores: { abc: { skillId: 'abc', score: 90 } } };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(data));
      trustScore._loadData();
      expect(trustScore.scores.get('abc').score).toBe(90);
    });

    test('does nothing if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      trustScore._loadData();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('handles JSON parse error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('broken');
      trustScore._loadData();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('_saveData', () => {
    test('writes scores to file', () => {
      trustScore.scores.set('test', { skillId: 'test', score: 75 });
      trustScore._saveData();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        trustScore.dataFile,
        expect.any(String)
      );
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(written.scores.test.score).toBe(75);
      expect(written.lastUpdated).toBeDefined();
    });

    test('handles write error gracefully', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });
      trustScore._saveData();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('calculateScore', () => {
    test('calculates correct score with default metrics', () => {
      const result = trustScore.calculateScore('test-skill', {});
      expect(result.skillId).toBe('test-skill');
      expect(result.score).toBe(38.5);
      expect(result.trustLevel).toBe('poor');
      expect(result.breakdown).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.calculatedAt).toBeDefined();
    });

    test('gives maximum score for perfect metrics', () => {
      const result = trustScore.calculateScore('perfect', {
        codeQualityScore: 100,
        averageRating: 5,
        reviewCount: 1000,
        downloadCount: 1000000,
        lastUpdateDays: 1,
        authorScore: 100,
        isVerified: true,
        isOfficial: true,
        securityScanPassed: true
      });
      expect(result.score).toBe(100);
      expect(result.trustLevel).toBe('excellent');
    });

    test('assigns poor trust level for low scores', () => {
      const result = trustScore.calculateScore('poor-skill', {
        codeQualityScore: 10,
        averageRating: 1,
        reviewCount: 0,
        downloadCount: 0,
        lastUpdateDays: 800,
        authorScore: 10,
        isVerified: false,
        isOfficial: false,
        securityScanPassed: false
      });
      expect(result.trustLevel).toBe('poor');
      expect(result.score).toBeLessThan(20);
    });

    test('varies code quality contribution', () => {
      const low = trustScore.calculateScore('a', { codeQualityScore: 0 });
      const high = trustScore.calculateScore('b', { codeQualityScore: 100 });
      expect(high.score).toBeGreaterThan(low.score);
    });

    test('community feedback scales with rating and review count', () => {
      const noReviews = trustScore.calculateScore('a', { averageRating: 1, reviewCount: 0 });
      const goodReviews = trustScore.calculateScore('b', { averageRating: 5, reviewCount: 50 });
      expect(goodReviews.breakdown.communityFeedback).toBeGreaterThan(
        noReviews.breakdown.communityFeedback
      );
    });

    test('download score uses logarithmic scaling', () => {
      const zero = trustScore.calculateScore('a', { downloadCount: 0 });
      const ten = trustScore.calculateScore('b', { downloadCount: 10 });
      const million = trustScore.calculateScore('c', { downloadCount: 1000000 });
      expect(zero.breakdown.downloadScore).toBe(0);
      expect(ten.breakdown.downloadScore).toBeGreaterThan(0);
      expect(million.breakdown.downloadScore).toBe(100);
    });

    test('update frequency score depends on recency', () => {
      const recent = trustScore.calculateScore('a', { lastUpdateDays: 1 });
      const monthOld = trustScore.calculateScore('b', { lastUpdateDays: 60 });
      const yearOld = trustScore.calculateScore('c', { lastUpdateDays: 365 });
      const ancient = trustScore.calculateScore('d', { lastUpdateDays: 1000 });
      expect(recent.breakdown.updateScore).toBe(100);
      expect(monthOld.breakdown.updateScore).toBe(90);
      expect(yearOld.breakdown.updateScore).toBe(80);
      expect(ancient.breakdown.updateScore).toBeGreaterThan(0);
      expect(ancient.breakdown.updateScore).toBeLessThan(80);
    });

    test('verification score accumulates badges', () => {
      const none = trustScore.calculateScore('a', {});
      const verified = trustScore.calculateScore('b', { isVerified: true });
      const all = trustScore.calculateScore('c', {
        isVerified: true, isOfficial: true, securityScanPassed: true
      });
      expect(none.breakdown.verificationScore).toBe(0);
      expect(verified.breakdown.verificationScore).toBe(50);
      expect(all.breakdown.verificationScore).toBe(100);
    });

    test('trust level boundaries are correct', () => {
      const excellent = trustScore.calculateScore('e', {
        codeQualityScore: 100,
        averageRating: 5,
        reviewCount: 30,
        downloadCount: 100000,
        lastUpdateDays: 1,
        authorScore: 100,
        isVerified: true,
        isOfficial: true,
        securityScanPassed: true
      });
      expect(excellent.trustLevel).toBe('excellent');

      const good = trustScore.calculateScore('g', {
        codeQualityScore: 88,
        averageRating: 4.5,
        reviewCount: 20,
        downloadCount: 5000,
        lastUpdateDays: 30,
        authorScore: 80,
        isVerified: true,
        isOfficial: true
      });
      expect(good.trustLevel).toBe('good');

      const average = trustScore.calculateScore('a', {
        codeQualityScore: 70,
        averageRating: 3.5,
        reviewCount: 10,
        downloadCount: 1000,
        lastUpdateDays: 60,
        authorScore: 60
      });
      expect(average.trustLevel).toBe('average');

      const below = trustScore.calculateScore('b', {
        codeQualityScore: 45,
        averageRating: 2.5,
        reviewCount: 3,
        downloadCount: 50,
        lastUpdateDays: 150,
        authorScore: 40
      });
      expect(below.trustLevel).toBe('below');
    });

    test('saves score to internal map and persists', () => {
      trustScore.calculateScore('persist-test', { codeQualityScore: 80 });
      expect(trustScore.scores.has('persist-test')).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('rounds score to one decimal place', () => {
      const result = trustScore.calculateScore('round', {
        codeQualityScore: 77,
        averageRating: 3.7,
        reviewCount: 3,
        downloadCount: 55,
        lastUpdateDays: 45,
        authorScore: 65,
        isVerified: true
      });
      const decimalPart = result.score.toString().split('.')[1];
      expect(decimalPart).toBeDefined();
      expect(decimalPart.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getScore', () => {
    test('returns score for existing skill', () => {
      trustScore.scores.set('my-skill', { skillId: 'my-skill', score: 88 });
      expect(trustScore.getScore('my-skill').score).toBe(88);
    });

    test('returns null for non-existent skill', () => {
      expect(trustScore.getScore('nope')).toBeNull();
    });
  });

  describe('getTrustLevelDescription', () => {
    test('returns correct description for each level', () => {
      const levels = ['excellent', 'good', 'average', 'below', 'poor'];
      for (const level of levels) {
        const desc = trustScore.getTrustLevelDescription(level);
        expect(desc).toHaveProperty('label');
        expect(desc).toHaveProperty('description');
        expect(desc).toHaveProperty('badge');
        expect(desc).toHaveProperty('color');
      }
    });

    test('returns average description for unknown level', () => {
      const desc = trustScore.getTrustLevelDescription('unknown');
      expect(desc.label).toBe('一般');
    });

    test('excellent level has correct badge and color', () => {
      const desc = trustScore.getTrustLevelDescription('excellent');
      expect(desc.label).toBe('优秀');
      expect(desc.color).toBe('#22c55e');
    });

    test('poor level has correct badge and color', () => {
      const desc = trustScore.getTrustLevelDescription('poor');
      expect(desc.label).toBe('风险');
      expect(desc.color).toBe('#ef4444');
    });
  });

  describe('getAllScores', () => {
    beforeEach(() => {
      trustScore.scores.set('a', { skillId: 'a', score: 50, trustLevel: 'average' });
      trustScore.scores.set('b', { skillId: 'b', score: 80, trustLevel: 'good' });
      trustScore.scores.set('c', { skillId: 'c', score: 30, trustLevel: 'poor' });
    });

    test('returns all scores sorted by score descending by default', () => {
      const result = trustScore.getAllScores();
      expect(result).toHaveLength(3);
      expect(result[0].skillId).toBe('b');
      expect(result[1].skillId).toBe('a');
      expect(result[2].skillId).toBe('c');
    });

    test('respects sortOrder asc', () => {
      const result = trustScore.getAllScores({ sortOrder: 'asc' });
      expect(result[0].skillId).toBe('c');
      expect(result[2].skillId).toBe('b');
    });

    test('respects limit option', () => {
      const result = trustScore.getAllScores({ limit: 2 });
      expect(result).toHaveLength(2);
      expect(result[0].skillId).toBe('b');
    });

    test('returns empty array for no scores', () => {
      trustScore.scores.clear();
      expect(trustScore.getAllScores()).toEqual([]);
    });
  });

  describe('getTrustedSkills', () => {
    beforeEach(() => {
      trustScore.scores.set('a', { skillId: 'a', score: 90, trustLevel: 'excellent' });
      trustScore.scores.set('b', { skillId: 'b', score: 70, trustLevel: 'good' });
      trustScore.scores.set('c', { skillId: 'c', score: 50, trustLevel: 'average' });
    });

    test('returns skills above min score sorted descending', () => {
      const result = trustScore.getTrustedSkills(70);
      expect(result).toHaveLength(2);
      expect(result[0].skillId).toBe('a');
      expect(result[1].skillId).toBe('b');
    });

    test('uses default minScore of 70', () => {
      const result = trustScore.getTrustedSkills();
      expect(result).toHaveLength(2);
    });

    test('returns empty when no skills meet threshold', () => {
      const result = trustScore.getTrustedSkills(95);
      expect(result).toEqual([]);
    });
  });

  describe('getSkillsNeedingAttention', () => {
    beforeEach(() => {
      trustScore.scores.set('a', { skillId: 'a', score: 90, trustLevel: 'excellent' });
      trustScore.scores.set('b', { skillId: 'b', score: 40, trustLevel: 'below' });
      trustScore.scores.set('c', { skillId: 'c', score: 20, trustLevel: 'poor' });
    });

    test('returns skills below max score sorted ascending', () => {
      const result = trustScore.getSkillsNeedingAttention(50);
      expect(result).toHaveLength(2);
      expect(result[0].skillId).toBe('c');
      expect(result[1].skillId).toBe('b');
    });

    test('uses default maxScore of 50', () => {
      const result = trustScore.getSkillsNeedingAttention();
      expect(result).toHaveLength(2);
    });

    test('returns empty when no skills need attention', () => {
      const result = trustScore.getSkillsNeedingAttention(0);
      expect(result).toEqual([]);
    });
  });

  describe('batchUpdateScores', () => {
    test('processes multiple skills and returns results', () => {
      const items = [
        { skillId: 's1', metrics: { codeQualityScore: 90 } },
        { skillId: 's2', metrics: { codeQualityScore: 40 } },
        { skillId: 's3', metrics: { codeQualityScore: 70 } }
      ];
      const results = trustScore.batchUpdateScores(items);
      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(r.success).toBe(true);
        expect(r.score).toBeDefined();
      }
      expect(trustScore.scores.has('s1')).toBe(true);
      expect(trustScore.scores.has('s2')).toBe(true);
      expect(trustScore.scores.has('s3')).toBe(true);
    });

    test('handles errors in individual items', () => {
      const calculateSpy = jest.spyOn(trustScore, 'calculateScore');
      calculateSpy.mockImplementationOnce(() => { throw new Error('bad skill'); });
      calculateSpy.mockImplementationOnce(() => ({ score: 75 }));

      const items = [
        { skillId: 'broken', metrics: {} },
        { skillId: 'ok', metrics: {} }
      ];
      const results = trustScore.batchUpdateScores(items);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('bad skill');
      expect(results[1].success).toBe(true);
    });
  });

  describe('getStats', () => {
    test('returns zeros for empty scores', () => {
      const stats = trustScore.getStats();
      expect(stats.totalSkills).toBe(0);
      expect(stats.averageScore).toBe(0);
      expect(stats.distribution).toEqual({});
    });

    test('calculates stats correctly', () => {
      trustScore.scores.set('a', { score: 95, trustLevel: 'excellent', skillId: 'a' });
      trustScore.scores.set('b', { score: 80, trustLevel: 'good', skillId: 'b' });
      trustScore.scores.set('c', { score: 65, trustLevel: 'average', skillId: 'c' });
      trustScore.scores.set('d', { score: 50, trustLevel: 'below', skillId: 'd' });
      trustScore.scores.set('e', { score: 20, trustLevel: 'poor', skillId: 'e' });

      const stats = trustScore.getStats();
      expect(stats.totalSkills).toBe(5);
      expect(stats.averageScore).toBe(62);
      expect(stats.distribution).toEqual({
        excellent: 1, good: 1, average: 1, below: 1, poor: 1
      });
    });

    test('topSkills returns up to 10 highest', () => {
      for (let i = 1; i <= 15; i++) {
        trustScore.scores.set(`s${i}`, { score: i * 5, trustLevel: 'average', skillId: `s${i}` });
      }
      const stats = trustScore.getStats();
      expect(stats.topSkills).toHaveLength(10);
      expect(stats.topSkills[0].score).toBe(75);
    });
  });

  describe('generateBadge', () => {
    test('returns badge info for valid level', () => {
      const badge = trustScore.generateBadge('excellent');
      expect(badge.badge).toBe('🏆');
      expect(badge.label).toBe('优秀');
      expect(badge.color).toBe('#22c55e');
      expect(badge.description).toBeDefined();
      expect(badge.format).toBe('svg');
    });

    test('returns badge in specified format', () => {
      const badge = trustScore.generateBadge('good', 'json');
      expect(badge.format).toBe('json');
    });

    test('falls back to average for unknown level', () => {
      const badge = trustScore.generateBadge('unknown');
      expect(badge.label).toBe('一般');
      expect(badge.badge).toBe('📊');
    });
  });

  describe('generateReport', () => {
    test('returns report for existing skill', () => {
      trustScore.calculateScore('report-test', { codeQualityScore: 85, averageRating: 4 });
      const report = trustScore.generateReport('report-test');
      expect(report.skillId).toBe('report-test');
      expect(report.summary.score).toBeDefined();
      expect(report.breakdown).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.generatedAt).toBeDefined();
    });

    test('returns error for missing skill', () => {
      const report = trustScore.generateReport('ghost');
      expect(report.error).toBe('Skill not found');
    });

    test('includes recommendations in report', () => {
      trustScore.calculateScore('low-quality', { codeQualityScore: 40, averageRating: 2 });
      const report = trustScore.generateReport('low-quality');
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('_generateRecommendations', () => {
    test('generates high priority for low code quality', () => {
      const score = { breakdown: { codeQuality: 30, communityFeedback: 80, downloadScore: 80, updateScore: 80, verificationScore: 80 } };
      const recs = trustScore._generateRecommendations(score);
      expect(recs.some(r => r.area === 'codeQuality' && r.priority === 'high')).toBe(true);
    });

    test('generates medium priority for low community feedback', () => {
      const score = { breakdown: { codeQuality: 80, communityFeedback: 30, downloadScore: 80, updateScore: 80, verificationScore: 80 } };
      const recs = trustScore._generateRecommendations(score);
      expect(recs.some(r => r.area === 'communityFeedback' && r.priority === 'medium')).toBe(true);
    });

    test('generates low priority for low download score', () => {
      const score = { breakdown: { codeQuality: 80, communityFeedback: 80, downloadScore: 10, updateScore: 80, verificationScore: 80 } };
      const recs = trustScore._generateRecommendations(score);
      expect(recs.some(r => r.area === 'downloadPopularity' && r.priority === 'low')).toBe(true);
    });

    test('generates medium priority for low update frequency', () => {
      const score = { breakdown: { codeQuality: 80, communityFeedback: 80, downloadScore: 80, updateScore: 40, verificationScore: 80 } };
      const recs = trustScore._generateRecommendations(score);
      expect(recs.some(r => r.area === 'updateFrequency' && r.priority === 'medium')).toBe(true);
    });

    test('generates medium priority for low verification score', () => {
      const score = { breakdown: { codeQuality: 80, communityFeedback: 80, downloadScore: 80, updateScore: 80, verificationScore: 20 } };
      const recs = trustScore._generateRecommendations(score);
      expect(recs.some(r => r.area === 'verificationStatus' && r.priority === 'medium')).toBe(true);
    });

    test('returns empty array when all scores are high', () => {
      const score = { breakdown: { codeQuality: 90, communityFeedback: 90, downloadScore: 90, updateScore: 90, verificationScore: 90 } };
      const recs = trustScore._generateRecommendations(score);
      expect(recs).toEqual([]);
    });
  });
});
