const { FeedbackCollectionSystem } = require('../../src/skills/monitoring/FeedbackCollectionSystem');

const now = Date.now();

jest.useFakeTimers();

describe('FeedbackCollectionSystem', () => {
  let system;

  beforeEach(() => {
    jest.setSystemTime(now);
    system = new FeedbackCollectionSystem();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  const createSession = (userId = 'user1', data = {}) => {
    return system.createSession(userId, data);
  };

  const addRatingFeedback = async (sessionId, skillName, rating, opts = {}) => {
    return system.submitFeedback(sessionId, {
      type: 'rating',
      target: skillName,
      rating,
      comment: opts.comment || '',
      ...opts
    });
  };

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(system.feedback).toBeInstanceOf(Map);
      expect(system.sessions).toBeInstanceOf(Map);
      expect(system.recommendationLogs).toEqual([]);
      expect(system.maxFeedbackPerSkill).toBe(1000);
      expect(system.sessionTimeout).toBe(3600000);
      expect(system.storage).toBeNull();
    });

    it('should accept custom options', () => {
      const s = new FeedbackCollectionSystem({ maxFeedbackPerSkill: 500, sessionTimeout: 60000 });
      expect(s.maxFeedbackPerSkill).toBe(500);
      expect(s.sessionTimeout).toBe(60000);
    });

    it('should accept storage with save and load', () => {
      const storage = { save: jest.fn(), load: jest.fn() };
      const s = new FeedbackCollectionSystem({ storage });
      expect(s.storage).toBe(storage);
    });

    it('should load feedback from storage on construction', async () => {
      const storage = {
        load: jest.fn().mockResolvedValue({
          feedback: { fb1: { id: 'fb1', type: 'rating', target: 'skill-a', rating: 5 } },
          recommendationLogs: [{ id: 'log1' }]
        }),
        save: jest.fn()
      };
      const s = new FeedbackCollectionSystem({ storage });
      await Promise.resolve();
      expect(s.feedback.get('fb1')).toEqual(expect.objectContaining({ id: 'fb1', rating: 5 }));
      expect(s.recommendationLogs).toHaveLength(1);
    });

    it('should handle null data from storage load', async () => {
      const storage = { load: jest.fn().mockResolvedValue(null), save: jest.fn() };
      const s = new FeedbackCollectionSystem({ storage });
      await Promise.resolve();
      expect(s.feedback.size).toBe(0);
    });

    it('should handle data without feedback or recommendationLogs', async () => {
      const storage = { load: jest.fn().mockResolvedValue({}), save: jest.fn() };
      const s = new FeedbackCollectionSystem({ storage });
      await Promise.resolve();
      expect(s.feedback.size).toBe(0);
      expect(s.recommendationLogs).toEqual([]);
    });
  });

  describe('createSession', () => {
    it('should create a session with generated id', () => {
      const session = createSession('user1');
      expect(session.id).toEqual(expect.stringContaining('sess_'));
      expect(session.userId).toBe('user1');
      expect(session.startedAt).toBe(now);
      expect(session.lastActivity).toBe(now);
      expect(session.interactions).toEqual([]);
      expect(session.skillUsage).toBeInstanceOf(Map);
      expect(session.feedback).toEqual([]);
      expect(session.context).toEqual({});
      expect(session.metadata).toEqual({ userAgent: undefined, locale: undefined, platform: undefined });
    });

    it('should accept session data with context and metadata', () => {
      const session = createSession('user2', {
        context: { source: 'test' },
        userAgent: 'jest',
        locale: 'en-US',
        platform: 'win32'
      });
      expect(session.context).toEqual({ source: 'test' });
      expect(session.metadata).toEqual({ userAgent: 'jest', locale: 'en-US', platform: 'win32' });
    });

    it('should store session in sessions map', () => {
      const session = createSession('user1');
      expect(system.sessions.get(session.id)).toBe(session);
    });
  });

  describe('getSession', () => {
    it('should return session by id', () => {
      const session = createSession('user1');
      expect(system.getSession(session.id)).toBe(session);
    });

    it('should update lastActivity on get', () => {
      const session = createSession('user1');
      jest.setSystemTime(now + 5000);
      const retrieved = system.getSession(session.id);
      expect(retrieved.lastActivity).toBe(now + 5000);
    });

    it('should return undefined for non-existent session', () => {
      expect(system.getSession('nonexistent')).toBeUndefined();
    });
  });

  describe('trackSkillUsage', () => {
    let sessionId;

    beforeEach(() => {
      sessionId = createSession('user1').id;
    });

    it('should track skill usage with all fields', () => {
      system.trackSkillUsage(sessionId, {
        skillName: 'test-skill',
        action: 'executed',
        parameters: { input: 'test' },
        result: { success: true },
        duration: 150
      });

      const session = system.getSession(sessionId);
      expect(session.interactions).toHaveLength(1);
      expect(session.interactions[0].skillName).toBe('test-skill');
      expect(session.interactions[0].action).toBe('executed');
      expect(session.interactions[0].duration).toBe(150);
      expect(session.interactions[0].success).toBe(true);
      expect(session.interactions[0].id).toEqual(expect.stringContaining('use_'));
    });

    it('should update skillUsage stats', () => {
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'executed', duration: 100 });
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'completed', duration: 200 });
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'failed', duration: 50 });

      const session = system.getSession(sessionId);
      const stats = session.skillUsage.get('skill-a');
      expect(stats.executed).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.totalDuration).toBe(350);
      expect(stats.avgDuration).toBe(350);
    });

    it('should do nothing for non-existent session', () => {
      system.trackSkillUsage('nonexistent', { skillName: 'test', action: 'executed' });
      // Should not throw
    });

    it('should handle result with success false', () => {
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'executed', result: { success: false } });
      const session = system.getSession(sessionId);
      expect(session.interactions[0].success).toBe(false);
    });

    it('should set success to true when result has no success field', () => {
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'executed', result: {} });
      const session = system.getSession(sessionId);
      expect(session.interactions[0].success).toBe(true);
    });

    it('should track discovered and selected actions', () => {
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'discovered' });
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'selected' });

      const session = system.getSession(sessionId);
      const stats = session.skillUsage.get('skill-a');
      expect(stats.discovered).toBe(1);
      expect(stats.selected).toBe(1);
    });

    it('should handle missing duration', () => {
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'completed' });
      const session = system.getSession(sessionId);
      const stats = session.skillUsage.get('skill-a');
      expect(stats.totalDuration).toBe(0);
      expect(stats.avgDuration).toBe(0);
    });
  });

  describe('logRecommendation', () => {
    it('should create recommendation log with all fields', () => {
      const log = system.logRecommendation({
        sessionId: 'sess_abc',
        userInput: 'test input',
        recommendations: [{ name: 'skill-a', category: 'dev', confidence: 0.8 }],
        selectedSkill: 'skill-a',
        wasAccepted: true,
        confidence: 0.8,
        context: { keywords: ['test'] }
      });

      expect(log.id).toEqual(expect.stringContaining('log_'));
      expect(log.userInput).toBe('test input');
      expect(log.recommendations).toHaveLength(1);
      expect(log.selectedSkill).toBe('skill-a');
      expect(log.wasAccepted).toBe(true);
      expect(log.confidence).toBe(0.8);
      expect(log.timestamp).toBe(now);
    });

    it('should add log to recommendationLogs', () => {
      system.logRecommendation({ sessionId: 's1', userInput: 'hi' });
      expect(system.recommendationLogs).toHaveLength(1);
    });

    it('should trim logs when exceeding 10000', () => {
      for (let i = 0; i < 10001; i++) {
        system.logRecommendation({ sessionId: `s${i}`, userInput: `input${i}` });
      }
      expect(system.recommendationLogs.length).toBe(5000);
    });

    it('should default recommendations to empty array', () => {
      const log = system.logRecommendation({ sessionId: 's1', userInput: 'hi' });
      expect(log.recommendations).toEqual([]);
    });

    it('should call _saveLogs which calls _saveFeedback', async () => {
      const storage = { save: jest.fn(), load: jest.fn().mockResolvedValue(null) };
      const s = new FeedbackCollectionSystem({ storage });
      s.logRecommendation({ sessionId: 's1', userInput: 'hi' });
      await Promise.resolve();
      expect(storage.save).toHaveBeenCalled();
    });
  });

  describe('submitFeedback', () => {
    let sessionId;

    beforeEach(() => {
      sessionId = createSession('user1').id;
    });

    it('should create feedback with all fields', async () => {
      const fb = await system.submitFeedback(sessionId, {
        type: 'bug_report',
        target: 'skill-x',
        rating: 3,
        comment: 'not great',
        tags: ['slow'],
        metadata: { browser: 'chrome' }
      });

      expect(fb.id).toEqual(expect.stringContaining('fb_'));
      expect(fb.sessionId).toBe(sessionId);
      expect(fb.userId).toBe('user1');
      expect(fb.type).toBe('bug_report');
      expect(fb.target).toBe('skill-x');
      expect(fb.rating).toBe(3);
      expect(fb.comment).toBe('not great');
      expect(fb.tags).toEqual(['slow']);
      expect(fb.metadata).toEqual({ browser: 'chrome' });
      expect(fb.timestamp).toBe(now);
      expect(fb.status).toBe('new');
    });

    it('should store feedback in session and map', async () => {
      const fb = await system.submitFeedback(sessionId, { type: 'rating', rating: 5 });
      const session = system.getSession(sessionId);
      expect(session.feedback).toContain(fb);
      expect(system.feedback.get(fb.id)).toBe(fb);
    });

    it('should throw for non-existent session', async () => {
      await expect(system.submitFeedback('bad-session', { type: 'rating' }))
        .rejects.toThrow('Session not found');
    });

    it('should tag default to empty array', async () => {
      const fb = await system.submitFeedback(sessionId, { type: 'rating', rating: 4 });
      expect(fb.tags).toEqual([]);
    });

    it('should handle metadata default to empty object', async () => {
      const fb = await system.submitFeedback(sessionId, { type: 'rating', rating: 4 });
      expect(fb.metadata).toEqual({});
    });

    it('should save feedback when storage exists', async () => {
      const storage = { save: jest.fn(), load: jest.fn().mockResolvedValue(null) };
      const s = new FeedbackCollectionSystem({ storage });
      const sid = s.createSession('u1').id;
      await s.submitFeedback(sid, { type: 'rating', rating: 4, target: 'skill-a' });
      expect(storage.save).toHaveBeenCalledWith('feedback', expect.any(Object));
    });

    it('should not call storage.save when storage is null', async () => {
      await system.submitFeedback(sessionId, { type: 'rating', rating: 4 });
    });
  });

  describe('rateSkillExecution', () => {
    let sessionId;

    beforeEach(() => {
      sessionId = createSession('user1').id;
    });

    it('should rate execution by executionId', async () => {
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'executed' });
      const session = system.getSession(sessionId);
      const executionId = session.interactions[0].id;

      const fb = await system.rateSkillExecution(sessionId, 'skill-a', executionId, 4, 'good job');

      expect(session.interactions[0].rating).toBe(4);
      expect(session.interactions[0].comment).toBe('good job');
      expect(session.interactions[0].ratedAt).toBe(now);
      expect(fb.type).toBe('rating');
      expect(fb.rating).toBe(4);
    });

    it('should rate execution by skillName and action fallback', async () => {
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'executed' });

      const _fb = await system.rateSkillExecution(sessionId, 'skill-a', 'wrong-id', 5, 'excellent');

      const session = system.getSession(sessionId);
      expect(session.interactions[0].rating).toBe(5);
    });

    it('should handle execution not found (still creates feedback)', async () => {
      const fb = await system.rateSkillExecution(sessionId, 'skill-a', 'nonexistent', 3, 'ok');
      expect(fb.type).toBe('rating');
      expect(fb.rating).toBe(3);
    });

    it('should rate without comment', async () => {
      system.trackSkillUsage(sessionId, { skillName: 'skill-a', action: 'executed' });
      const session = system.getSession(sessionId);
      const executionId = session.interactions[0].id;

      const _fb = await system.rateSkillExecution(sessionId, 'skill-a', executionId, 2);

      expect(session.interactions[0].rating).toBe(2);
      expect(session.interactions[0].comment).toBeUndefined();
    });

    it('should throw for non-existent session', async () => {
      await expect(system.rateSkillExecution('bad-session', 'skill-a', 'id', 3))
        .rejects.toThrow('Session not found');
    });
  });

  describe('getSkillFeedback', () => {
    let sessionId;

    beforeEach(async () => {
      sessionId = createSession('user1').id;
      await addRatingFeedback(sessionId, 'skill-a', 5, { comment: 'great' });
      await addRatingFeedback(sessionId, 'skill-a', 3, { comment: 'ok' });
      await addRatingFeedback(sessionId, 'skill-b', 4, { comment: 'good' });
      await system.submitFeedback(sessionId, { type: 'bug_report', target: 'skill-a', comment: 'bug' });
    });

    it('should return feedback for specific skill with type rating', () => {
      const result = system.getSkillFeedback('skill-a');
      expect(result.feedback).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should sort feedback by timestamp descending', () => {
      const result = system.getSkillFeedback('skill-a');
      expect(result.feedback[0].timestamp >= result.feedback[1].timestamp).toBe(true);
    });

    it('should calculate average rating', () => {
      const result = system.getSkillFeedback('skill-a');
      expect(result.averageRating).toBe(4);
    });

    it('should return rating distribution', () => {
      const result = system.getSkillFeedback('skill-a');
      expect(result.ratingDistribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 });
    });

    it('should filter by minRating', () => {
      const result = system.getSkillFeedback('skill-a', { minRating: 4 });
      expect(result.feedback).toHaveLength(1);
      expect(result.feedback[0].rating).toBe(5);
    });

    it('should respect limit and offset', () => {
      const result = system.getSkillFeedback('skill-a', { limit: 1, offset: 1 });
      expect(result.feedback).toHaveLength(1);
    });

    it('should return zero average when no feedback', () => {
      const result = system.getSkillFeedback('nonexistent');
      expect(result.total).toBe(0);
      expect(result.averageRating).toBe(0);
      expect(result.ratingDistribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    });

    it('should return empty feedback for skill-b', () => {
      const result = system.getSkillFeedback('skill-b');
      expect(result.feedback).toHaveLength(1);
    });
  });

  describe('getRecommendationAccuracy', () => {
    it('should return zeros when no logs', () => {
      const result = system.getRecommendationAccuracy();
      expect(result).toEqual({ accuracy: 0, total: 0 });
    });

    it('should calculate accuracy from logs', () => {
      system.logRecommendation({ sessionId: 's1', userInput: 'a', wasAccepted: true, confidence: 0.9 });
      system.logRecommendation({ sessionId: 's2', userInput: 'b', wasAccepted: true, confidence: 0.8 });
      system.logRecommendation({ sessionId: 's3', userInput: 'c', wasAccepted: false, confidence: 0.3 });

      const result = system.getRecommendationAccuracy();
      expect(result.total).toBe(3);
      expect(result.accepted).toBe(2);
      expect(result.rejected).toBe(1);
      expect(result.accuracy).toBeCloseTo(2 / 3);
      expect(result.averageConfidence).toBeCloseTo(0.6667, 3);
    });

    it('should calculate high confidence accuracy', () => {
      system.logRecommendation({ sessionId: 's1', userInput: 'a', wasAccepted: true, confidence: 0.9 });
      system.logRecommendation({ sessionId: 's2', userInput: 'b', wasAccepted: false, confidence: 0.95 });

      const result = system.getRecommendationAccuracy();
      expect(result.highConfidenceTotal).toBe(2);
      expect(result.highConfidenceAccuracy).toBe(0.5);
    });

    it('should return zero for highConfidenceAccuracy when no high confidence logs', () => {
      system.logRecommendation({ sessionId: 's1', userInput: 'a', wasAccepted: true, confidence: 0.5 });
      const result = system.getRecommendationAccuracy();
      expect(result.highConfidenceTotal).toBe(0);
      expect(result.highConfidenceAccuracy).toBe(0);
    });

    it('should handle logs without confidence field', () => {
      system.logRecommendation({ sessionId: 's1', userInput: 'a', wasAccepted: true });
      const result = system.getRecommendationAccuracy();
      expect(result.averageConfidence).toBe(0);
    });
  });

  describe('getSkillPerformanceStats', () => {
    it('should return empty array when no sessions', () => {
      expect(system.getSkillPerformanceStats()).toEqual([]);
    });

    it('should aggregate stats across sessions', () => {
      const s1 = createSession('user1').id;
      const s2 = createSession('user2').id;

      system.trackSkillUsage(s1, { skillName: 'skill-a', action: 'discovered' });
      system.trackSkillUsage(s1, { skillName: 'skill-a', action: 'selected' });
      system.trackSkillUsage(s1, { skillName: 'skill-a', action: 'executed', duration: 100 });
      system.trackSkillUsage(s1, { skillName: 'skill-a', action: 'completed', duration: 80 });
      system.trackSkillUsage(s2, { skillName: 'skill-a', action: 'executed', duration: 200 });
      system.trackSkillUsage(s2, { skillName: 'skill-a', action: 'failed' });
      system.trackSkillUsage(s1, { skillName: 'skill-b', action: 'executed', duration: 50 });

      const stats = system.getSkillPerformanceStats();
      expect(stats).toHaveLength(2);
      expect(stats[0].skillName).toBe('skill-a');
      expect(stats[0].totalExecutions).toBe(2);
      expect(stats[0].successfulExecutions).toBe(1);
      expect(stats[0].failedExecutions).toBe(1);
      expect(stats[0].discoveryCount).toBe(1);
      expect(stats[0].totalDuration).toBe(380);
    });

    it('should calculate rates correctly (existing tests)', () => {
      const sid = createSession('u1').id;
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'discovered' });
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'executed' });
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'completed', duration: 200 });

      const stats = system.getSkillPerformanceStats();
      expect(stats[0].selectionRate).toBeCloseTo(1 / 1);
      expect(stats[0].completionRate).toBeCloseTo(1 / 1);
      expect(stats[0].avgDuration).toBe(200);
    });

    it('should not divide by zero when no discovery or executions', () => {
      const sid = createSession('u1').id;
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'completed' });
      // discovered=0, executed=0, but completed=1 — rates should be 0 / 0 = NaN but handled
      const stats = system.getSkillPerformanceStats();
      expect(stats).toHaveLength(1);
    });

    it('should include ratings from feedback', async () => {
      const sid = createSession('u1').id;
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'executed' });
      await addRatingFeedback(sid, 'skill-a', 5);
      await addRatingFeedback(sid, 'skill-a', 3);

      const stats = system.getSkillPerformanceStats();
      expect(stats[0].ratings).toEqual([5, 3]);
      expect(stats[0].averageRating).toBe(4);
    });

    it('should limit recentFeedback to 10 entries', async () => {
      const sid = createSession('u1').id;
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'executed' });
      for (let i = 0; i < 15; i++) {
        await addRatingFeedback(sid, 'skill-a', 4);
      }
      const stats = system.getSkillPerformanceStats();
      expect(stats[0].recentFeedback).toHaveLength(10);
    });

    it('should sort results by totalExecutions descending', () => {
      const sid = createSession('u1').id;
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'executed' });
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'executed' });
      system.trackSkillUsage(sid, { skillName: 'skill-b', action: 'executed' });

      const stats = system.getSkillPerformanceStats();
      expect(stats[0].skillName).toBe('skill-a');
      expect(stats[1].skillName).toBe('skill-b');
    });

    it('should handle feedback without rating', async () => {
      const sid = createSession('u1').id;
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'executed' });
      await system.submitFeedback(sid, { type: 'rating', target: 'skill-a' });
      const stats = system.getSkillPerformanceStats();
      expect(stats).toHaveLength(1);
    });

    it('should handle feedback for untracked skill', async () => {
      const sid = createSession('u1').id;
      await addRatingFeedback(sid, 'untracked', 4);
      const stats = system.getSkillPerformanceStats();
      expect(stats).toHaveLength(0);
    });
  });

  describe('analyzeRecommendationPatterns', () => {
    it('should return empty maps when no logs', () => {
      const result = system.analyzeRecommendationPatterns();
      expect(result.byCategory).toEqual({});
      expect(result.byContext).toEqual({});
      expect(result.topKeywords).toEqual([]);
    });

    it('should group by category', () => {
      system.logRecommendation({
        sessionId: 's1', userInput: 'a', wasAccepted: true, selectedSkill: 'skill-a',
        recommendations: [{ name: 'skill-a', category: 'dev', confidence: 0.9 }]
      });
      system.logRecommendation({
        sessionId: 's2', userInput: 'b', wasAccepted: false, selectedSkill: 'skill-b',
        recommendations: [{ name: 'skill-b', category: 'dev', confidence: 0.5 }]
      });
      system.logRecommendation({
        sessionId: 's3', userInput: 'c', wasAccepted: true, selectedSkill: 'skill-c',
        recommendations: [{ name: 'skill-c', category: 'ops', confidence: 0.8 }]
      });

      const result = system.analyzeRecommendationPatterns();
      expect(result.byCategory.dev.total).toBe(2);
      expect(result.byCategory.dev.accepted).toBe(1);
      expect(result.byCategory.dev.avgConfidence).toBeCloseTo(0.7, 2);
      expect(result.byCategory.dev.acceptanceRate).toBe(0.5);
      expect(result.byCategory.ops.total).toBe(1);
    });

    it('should group by context keywords', () => {
      system.logRecommendation({
        sessionId: 's1', userInput: 'deploy', wasAccepted: true,
        recommendations: [{ name: 'skill-a', category: 'ops' }],
        context: { keywords: ['deploy', 'prod'] }
      });
      system.logRecommendation({
        sessionId: 's2', userInput: 'deploy', wasAccepted: false,
        recommendations: [{ name: 'skill-b', category: 'ops' }],
        context: { keywords: ['deploy'] }
      });

      const result = system.analyzeRecommendationPatterns();
      expect(result.byContext.deploy.total).toBe(2);
      expect(result.byContext.deploy.accepted).toBe(1);
      expect(result.byContext.prod.total).toBe(1);
      expect(result.topKeywords).toHaveLength(2);
      expect(result.topKeywords[0].keyword).toBe('deploy');
    });

    it('should handle missing context keywords', () => {
      system.logRecommendation({
        sessionId: 's1', userInput: 'test', wasAccepted: true,
        recommendations: [{ name: 'skill-a', category: 'dev' }]
      });
      const result = system.analyzeRecommendationPatterns();
      expect(result.byCategory.dev.total).toBe(1);
      expect(result.byContext).toEqual({});
    });

    it('should handle recommendations with missing category', () => {
      system.logRecommendation({
        sessionId: 's1', userInput: 'test', wasAccepted: true,
        recommendations: [{ name: 'skill-a' }]
      });
      const result = system.analyzeRecommendationPatterns();
      expect(result.byCategory.unknown.total).toBe(1);
    });

    it('should handle logs without recommendations', () => {
      system.logRecommendation({ sessionId: 's1', userInput: 'test', wasAccepted: true });
      const result = system.analyzeRecommendationPatterns();
      expect(result.byCategory).toEqual({});
    });
  });

  describe('generateImprovementRecommendations', () => {
    it('should return empty array when no stats', () => {
      expect(system.generateImprovementRecommendations()).toEqual([]);
    });

    it('should recommend skill quality for low completion rate', () => {
      const sid = createSession('u1').id;
      for (let i = 0; i < 5; i++) {
        system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'executed' });
        system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'failed' });
      }
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'completed' });

      const recs = system.generateImprovementRecommendations();
      const quality = recs.filter((r) => r.type === 'skill_quality' && r.skill === 'skill-a');
      expect(quality.length).toBeGreaterThanOrEqual(1);
      expect(quality[0].priority).toBe('high');
      expect(quality[0].issue).toContain('Completion rate');
    });

    it('should recommend skill quality for low ratings', async () => {
      const sid = createSession('u1').id;
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'executed' });
      system.trackSkillUsage(sid, { skillName: 'skill-a', action: 'completed' });
      await addRatingFeedback(sid, 'skill-a', 1);
      await addRatingFeedback(sid, 'skill-a', 2);
      await addRatingFeedback(sid, 'skill-a', 1);

      const recs = system.generateImprovementRecommendations();
      const quality = recs.filter((r) => r.type === 'skill_quality' && r.skill === 'skill-a');
      expect(quality.length).toBeGreaterThanOrEqual(1);
    });

    it('should recommend model improvement for low accuracy', () => {
      for (let i = 0; i < 10; i++) {
        system.logRecommendation({
          sessionId: `s${i}`, userInput: `input${i}`,
          wasAccepted: false, confidence: 0.8
        });
      }
      const recs = system.generateImprovementRecommendations();
      const modelRecs = recs.filter((r) => r.type === 'recommendation_model');
      expect(modelRecs.length).toBeGreaterThanOrEqual(1);
    });

    it('should recommend when high confidence but low acceptance', () => {
      for (let i = 0; i < 3; i++) {
        system.logRecommendation({
          sessionId: `s${i}`, userInput: `input${i}`,
          wasAccepted: false, confidence: 0.9
        });
      }
      const recs = system.generateImprovementRecommendations();
      const highConfRecs = recs.filter((r) => r.issue.includes('High confidence recommendations'));
      expect(highConfRecs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getUserSatisfactionScore', () => {
    it('should return null when user has no feedback', () => {
      expect(system.getUserSatisfactionScore('nonexistent')).toBeNull();
    });

    it('should calculate satisfaction score from feedback', async () => {
      const sid = createSession('user1').id;
      jest.setSystemTime(now);
      await addRatingFeedback(sid, 'skill-a', 5);
      jest.setSystemTime(now + 1000);
      await addRatingFeedback(sid, 'skill-b', 3);
      jest.setSystemTime(now + 2000);
      await addRatingFeedback(sid, 'skill-c', 4);

      const score = system.getUserSatisfactionScore('user1');
      expect(score.averageRating).toBe(4);
      expect(score.totalFeedback).toBe(3);
      expect(score.recentRating).toBe(4);
    });

    it('should calculate trend as stable when equal', async () => {
      const sid = createSession('user1').id;
      for (let i = 0; i < 6; i++) {
        await addRatingFeedback(sid, 'skill-a', 3);
      }
      const score = system.getUserSatisfactionScore('user1');
      expect(score.trend).toBe('stable');
    });

    it('should return improving trend', async () => {
      const sid = createSession('user1').id;
      jest.setSystemTime(now);
      await addRatingFeedback(sid, 'skill-a', 1);
      jest.setSystemTime(now + 1000);
      await addRatingFeedback(sid, 'skill-a', 2);
      jest.setSystemTime(now + 2000);
      await addRatingFeedback(sid, 'skill-a', 3);
      jest.setSystemTime(now + 3000);
      await addRatingFeedback(sid, 'skill-a', 4);
      jest.setSystemTime(now + 4000);
      await addRatingFeedback(sid, 'skill-a', 5);
      jest.setSystemTime(now + 5000);
      await addRatingFeedback(sid, 'skill-a', 5);

      const score = system.getUserSatisfactionScore('user1');
      expect(score.trend).toBe('improving');
    });

    it('should return declining trend', async () => {
      const sid = createSession('user1').id;
      jest.setSystemTime(now);
      await addRatingFeedback(sid, 'skill-a', 5);
      jest.setSystemTime(now + 1000);
      await addRatingFeedback(sid, 'skill-a', 5);
      jest.setSystemTime(now + 2000);
      await addRatingFeedback(sid, 'skill-a', 5);
      jest.setSystemTime(now + 3000);
      await addRatingFeedback(sid, 'skill-a', 4);
      jest.setSystemTime(now + 4000);
      await addRatingFeedback(sid, 'skill-a', 1);
      jest.setSystemTime(now + 5000);
      await addRatingFeedback(sid, 'skill-a', 1);

      const score = system.getUserSatisfactionScore('user1');
      expect(score.trend).toBe('declining');
    });
  });

  describe('cleanup', () => {
    it('should remove sessions past timeout', () => {
      const s1 = createSession('user1');
      const s2 = createSession('user2');

      jest.setSystemTime(now + 3600001);
      const s3 = createSession('user3');

      system.cleanup();

      expect(system.sessions.has(s1.id)).toBe(false);
      expect(system.sessions.has(s2.id)).toBe(false);
      expect(system.sessions.has(s3.id)).toBe(true);
    });

    it('should keep sessions within timeout', () => {
      const s1 = createSession('user1');
      jest.setSystemTime(now + 1800000);
      const s2 = createSession('user2');
      system.cleanup();
      expect(system.sessions.has(s1.id)).toBe(true);
      expect(system.sessions.has(s2.id)).toBe(true);
    });
  });

  describe('_getRatingDistribution', () => {
    it('should count ratings 1-5 correctly', () => {
      const feedback = [
        { rating: 1 }, { rating: 3 }, { rating: 3 }, { rating: 5 }, { rating: 6 }, { rating: null }, {}
      ];
      const dist = system._getRatingDistribution(feedback);
      expect(dist).toEqual({ 1: 1, 2: 0, 3: 2, 4: 0, 5: 1 });
    });
  });

  describe('_updateSkillFeedbackIndex', () => {
    it('should be a no-op stub', () => {
      expect(system._updateSkillFeedbackIndex('skill-a', {})).toBeUndefined();
    });
  });

  describe('ID generation', () => {
    it('should generate unique session IDs', () => {
      const id1 = system._generateSessionId();
      const id2 = system._generateSessionId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^sess_/);
    });

    it('should generate unique feedback IDs', () => {
      const id1 = system._generateFeedbackId();
      expect(id1).toMatch(/^fb_/);
    });

    it('should generate unique usage IDs', () => {
      const id1 = system._generateUsageId();
      expect(id1).toMatch(/^use_/);
    });

    it('should generate unique log IDs', () => {
      const id1 = system._generateLogId();
      expect(id1).toMatch(/^log_/);
    });
  });

  describe('edge cases', () => {
    it('should handle complete lifecycle: session → usage → rating → report', async () => {
      const sid = createSession('alice').id;

      system.trackSkillUsage(sid, { skillName: 'deploy-skill', action: 'discovered' });
      system.trackSkillUsage(sid, { skillName: 'deploy-skill', action: 'selected' });
      system.trackSkillUsage(sid, { skillName: 'deploy-skill', action: 'executed', duration: 500 });
      system.trackSkillUsage(sid, { skillName: 'deploy-skill', action: 'completed', duration: 450 });

      await system.rateSkillExecution(sid, 'deploy-skill', 'fake-id', 4, 'works well');

      system.logRecommendation({
        sessionId: sid, userInput: 'deploy app',
        recommendations: [{ name: 'deploy-skill', category: 'ops', confidence: 0.85 }],
        selectedSkill: 'deploy-skill', wasAccepted: true, confidence: 0.85
      });

      const skillFb = system.getSkillFeedback('deploy-skill');
      expect(skillFb.averageRating).toBe(4);

      const accuracy = system.getRecommendationAccuracy();
      expect(accuracy.accepted).toBe(1);

      const stats = system.getSkillPerformanceStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].totalExecutions).toBe(1);

      const patterns = system.analyzeRecommendationPatterns();
      expect(patterns.byCategory.ops.total).toBe(1);

      const score = system.getUserSatisfactionScore('alice');
      expect(score.averageRating).toBe(4);
    });

    it('should handle storage save and load round-trip', async () => {
      const storage = { save: jest.fn(), load: jest.fn().mockResolvedValue(null) };
      const s1 = new FeedbackCollectionSystem({ storage });
      const sid = s1.createSession('u1').id;
      const fb = await s1.submitFeedback(sid, { type: 'rating', target: 'skill-a', rating: 5 });
      s1.logRecommendation({ sessionId: sid, userInput: 'hi', wasAccepted: true });

      const savedData = storage.save.mock.calls[0][1];
      storage.load.mockResolvedValue(savedData);

      const s2 = new FeedbackCollectionSystem({ storage });
      await Promise.resolve();
      expect(s2.feedback.get(fb.id)).toBeDefined();
      expect(s2.recommendationLogs).toHaveLength(1);
    });
  });
});
