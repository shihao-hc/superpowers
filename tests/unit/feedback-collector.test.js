const { FeedbackCollector } = require('../../src/feedback/FeedbackCollector');

describe('FeedbackCollector', () => {
  let collector;

  beforeEach(() => {
    collector = new FeedbackCollector();
  });

  describe('constructor', () => {
    it('should set default maxFeedback to 1000', () => {
      expect(collector.maxFeedback).toBe(1000);
    });

    it('should initialize with default categories', () => {
      expect(collector.categories).toEqual([
        'performance', 'usability', 'features', 'bug',
        'documentation', 'security', 'other'
      ]);
    });

    it('should initialize empty arrays', () => {
      expect(collector.feedback).toEqual([]);
      expect(collector.suggestions).toEqual([]);
      expect(collector.bugs).toEqual([]);
      expect(collector.ratings).toEqual([]);
      expect(collector.featureRequests).toEqual([]);
    });

    it('should accept custom maxFeedback option', () => {
      const c = new FeedbackCollector({ maxFeedback: 50 });
      expect(c.maxFeedback).toBe(50);
    });
  });

  describe('submitFeedback', () => {
    it('should create feedback with fb_ prefixed ID', () => {
      const fb = collector.submitFeedback({ type: 'general' });
      expect(fb.id).toEqual(expect.stringContaining('fb_'));
    });

    it('should default type to general', () => {
      const fb = collector.submitFeedback({});
      expect(fb.type).toBe('general');
    });

    it('should default category to other for invalid category', () => {
      const fb = collector.submitFeedback({ category: 'invalid' });
      expect(fb.category).toBe('other');
    });

    it('should default userId to anonymous', () => {
      const fb = collector.submitFeedback({});
      expect(fb.userId).toBe('anonymous');
    });

    it('should set rating to null when not provided', () => {
      const fb = collector.submitFeedback({});
      expect(fb.rating).toBeNull();
    });

    it('should set message to empty string when not provided', () => {
      const fb = collector.submitFeedback({});
      expect(fb.message).toBe('');
    });

    it('should route to bugs array for type bug', () => {
      const fb = collector.submitFeedback({ type: 'bug', message: 'something broke' });
      expect(collector.bugs).toContain(fb);
      expect(collector.suggestions).not.toContain(fb);
    });

    it('should route to suggestions array for type suggestion', () => {
      const fb = collector.submitFeedback({ type: 'suggestion', message: 'add feature' });
      expect(collector.suggestions).toContain(fb);
      expect(collector.bugs).not.toContain(fb);
    });

    it('should route to ratings array when rating exists', () => {
      const fb = collector.submitFeedback({ type: 'general', rating: 4 });
      expect(collector.ratings).toContain(fb);
    });

    it('should not route to ratings when rating is null', () => {
      const fb = collector.submitFeedback({ type: 'general' });
      expect(collector.ratings).not.toContain(fb);
    });

    it('should generate tags from message keywords', () => {
      const fb = collector.submitFeedback({ message: 'This is a slow bug and crash error' });
      expect(fb.tags).toEqual(expect.arrayContaining(['slow', 'bug', 'crash', 'error']));
    });

    it('should set context with url and userAgent and timestamp', () => {
      const fb = collector.submitFeedback({
        context: { url: 'https://example.com', userAgent: 'test-agent' }
      });
      expect(fb.context.url).toBe('https://example.com');
      expect(fb.context.userAgent).toBe('test-agent');
      expect(fb.context.timestamp).toEqual(expect.any(Number));
    });

    it('should set status to new', () => {
      const fb = collector.submitFeedback({});
      expect(fb.status).toBe('new');
    });

    it('should set createdAt as ISO string', () => {
      const fb = collector.submitFeedback({});
      expect(fb.createdAt).toEqual(expect.any(String));
      expect(new Date(fb.createdAt).toISOString()).toBe(fb.createdAt);
    });

    it('should initialize empty responses array', () => {
      const fb = collector.submitFeedback({});
      expect(fb.responses).toEqual([]);
    });

    it('should trim feedback when exceeding maxFeedback', () => {
      const c = new FeedbackCollector({ maxFeedback: 1 });
      c.submitFeedback({ type: 'general', message: 'first' });
      c.submitFeedback({ type: 'general', message: 'second' });
      expect(c.feedback).toHaveLength(1);
      expect(c.feedback[0].message).toBe('second');
    });

    it('should add to feedback array', () => {
      const fb = collector.submitFeedback({});
      expect(collector.feedback).toHaveLength(1);
      expect(collector.feedback[0]).toBe(fb);
    });
  });

  describe('submitRating', () => {
    it('should delegate to submitFeedback with type rating', () => {
      const spy = jest.spyOn(collector, 'submitFeedback');
      collector.submitRating('user1', 4);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'rating',
        userId: 'user1',
        rating: 4
      }));
    });

    it('should return feedback with correct rating', () => {
      const fb = collector.submitRating('user1', 5);
      expect(fb.rating).toBe(5);
      expect(fb.type).toBe('rating');
    });

    it('should set default message from rating', () => {
      const fb = collector.submitRating('user1', 3);
      expect(fb.message).toBe('Rating: 3/5');
    });

    it('should use custom message from metadata', () => {
      const fb = collector.submitRating('user1', 4, { message: 'Great app!' });
      expect(fb.message).toBe('Great app!');
    });

    it('should pass context from metadata', () => {
      const fb = collector.submitRating('user1', 5, {
        context: { url: '/page', userAgent: 'Mozilla' }
      });
      expect(fb.context.url).toBe('/page');
      expect(fb.context.userAgent).toBe('Mozilla');
    });
  });

  describe('submitFeatureRequest', () => {
    it('should create feedback with type feature_request', () => {
      const fb = collector.submitFeatureRequest('user1', { title: 'Dark Mode', description: 'Add dark mode' });
      expect(fb.type).toBe('feature_request');
    });

    it('should set category to features', () => {
      const fb = collector.submitFeatureRequest('user1', { title: 'Dark Mode', description: 'Add dark mode' });
      expect(fb.category).toBe('features');
    });

    it('should set feature metadata', () => {
      const req = {
        title: 'Dark Mode',
        description: 'Add dark mode support',
        priority: 'high',
        useCases: ['night use', 'eye strain'],
        impact: 'high',
        effort: 'medium'
      };
      const fb = collector.submitFeatureRequest('user1', req);
      expect(fb.feature).toEqual({
        title: 'Dark Mode',
        description: 'Add dark mode support',
        priority: 'high',
        useCases: ['night use', 'eye strain'],
        impact: 'high',
        effort: 'medium'
      });
    });

    it('should add to featureRequests array', () => {
      const fb = collector.submitFeatureRequest('user1', { title: 'Dark Mode', description: 'Add dark mode' });
      expect(collector.featureRequests).toHaveLength(1);
      expect(collector.featureRequests[0]).toBe(fb);
    });

    it('should use defaults for optional feature fields', () => {
      const fb = collector.submitFeatureRequest('user1', { title: 'X', description: 'desc' });
      expect(fb.feature.priority).toBe('medium');
      expect(fb.feature.useCases).toEqual([]);
      expect(fb.feature.impact).toBe('medium');
      expect(fb.feature.effort).toBe('medium');
    });
  });

  describe('getFeedback', () => {
    beforeEach(() => {
      collector.submitFeedback({ type: 'bug', category: 'bug', message: 'Bug A', userId: 'u1' });
      collector.submitFeedback({ type: 'suggestion', category: 'features', message: 'Suggestion B', userId: 'u2' });
      collector.submitFeedback({ type: 'bug', category: 'bug', message: 'Bug C', userId: 'u1' });
    });

    it('should return all feedback sorted by createdAt descending', () => {
      const result = collector.getFeedback();
      expect(result).toHaveLength(3);
      expect(result[0].createdAt >= result[1].createdAt).toBe(true);
      expect(result[1].createdAt >= result[2].createdAt).toBe(true);
    });

    it('should filter by type', () => {
      const result = collector.getFeedback({ type: 'bug' });
      expect(result).toHaveLength(2);
      result.forEach((f) => expect(f.type).toBe('bug'));
    });

    it('should filter by category', () => {
      const result = collector.getFeedback({ category: 'bug' });
      expect(result).toHaveLength(2);
    });

    it('should filter by status', () => {
      const result = collector.getFeedback({ status: 'new' });
      expect(result).toHaveLength(3);
    });

    it('should filter by priority', () => {
      const result = collector.getFeedback({ priority: 'low' });
      expect(result).toHaveLength(1);
    });

    it('should filter by userId', () => {
      const result = collector.getFeedback({ userId: 'u2' });
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('u2');
    });

    it('should sort by rating descending with null treated as 0', () => {
      collector.submitFeedback({ type: 'general', rating: 5, message: 'high' });
      collector.submitFeedback({ type: 'general', rating: 1, message: 'low' });
      const result = collector.getFeedback({ sortBy: 'rating' });
      for (let i = 1; i < result.length; i++) {
        expect((result[i - 1].rating || 0) >= (result[i].rating || 0)).toBe(true);
      }
    });

    it('should limit results', () => {
      const result = collector.getFeedback({ limit: 2 });
      expect(result).toHaveLength(2);
    });

    it('should combine filters', () => {
      const result = collector.getFeedback({ type: 'bug', userId: 'u1' });
      expect(result).toHaveLength(2);
    });
  });

  describe('getStatistics', () => {
    it('should return correct totals', () => {
      collector.submitFeedback({ type: 'bug', message: 'crash error' });
      collector.submitFeedback({ type: 'suggestion', message: 'feature ui' });
      collector.submitFeedback({ type: 'general', rating: 4 });

      const stats = collector.getStatistics();
      expect(stats.total).toBe(3);
    });

    it('should return byCategory counts', () => {
      collector.submitFeedback({ type: 'bug', category: 'bug' });
      const stats = collector.getStatistics();
      expect(stats.byCategory.bug).toBe(1);
      expect(stats.byCategory.performance).toBe(0);
    });

    it('should return byStatus counts', () => {
      collector.submitFeedback({ type: 'bug', message: 'err' });
      const stats = collector.getStatistics();
      expect(stats.byStatus.new).toBe(1);
    });

    it('should return byType counts', () => {
      collector.submitFeedback({ type: 'bug', message: 'err' });
      const stats = collector.getStatistics();
      expect(stats.byType.bug).toBe(1);
    });

    it('should return byPriority counts', () => {
      collector.submitFeedback({ type: 'bug', message: 'crash error' });
      const stats = collector.getStatistics();
      expect(stats.byPriority.critical).toBe(1);
    });

    it('should calculate average rating', () => {
      collector.submitFeedback({ type: 'general', rating: 4 });
      collector.submitFeedback({ type: 'general', rating: 2 });
      const stats = collector.getStatistics();
      expect(stats.rating.average).toBe(3);
    });

    it('should return 0 average rating when no ratings exist', () => {
      collector.submitFeedback({ type: 'bug', message: 'no rating' });
      const stats = collector.getStatistics();
      expect(stats.rating.average).toBe(0);
    });

    it('should return rating count', () => {
      collector.submitFeedback({ type: 'general', rating: 5 });
      const stats = collector.getStatistics();
      expect(stats.rating.count).toBe(1);
    });

    it('should return rating distribution', () => {
      collector.submitFeedback({ type: 'general', rating: 4 });
      const stats = collector.getStatistics();
      expect(stats.rating.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 });
    });

    it('should return recent feedback', () => {
      for (let i = 0; i < 15; i++) {
        collector.submitFeedback({ type: 'general', message: `msg ${i}` });
      }
      const stats = collector.getStatistics();
      expect(stats.recent).toHaveLength(10);
    });

    it('should return high priority feedback', () => {
      collector.submitFeedback({ type: 'bug', message: 'error in login' });
      const stats = collector.getStatistics();
      expect(stats.highPriority).toHaveLength(1);
    });

    it('should return unresolvedBugs count', () => {
      collector.submitFeedback({ type: 'bug', message: 'crash' });
      const stats = collector.getStatistics();
      expect(stats.unresolvedBugs).toBe(1);
    });

    it('should return top suggestions', () => {
      collector.submitFeedback({ type: 'suggestion', message: 'add feature' });
      const stats = collector.getStatistics();
      expect(stats.topSuggestions).toHaveLength(1);
    });
  });

  describe('getRatingDistribution', () => {
    it('should return zero distribution when no ratings', () => {
      expect(collector.getRatingDistribution()).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    });

    it('should count ratings 1-5 correctly', () => {
      collector.submitFeedback({ rating: 1 });
      collector.submitFeedback({ rating: 3 });
      collector.submitFeedback({ rating: 3 });
      collector.submitFeedback({ rating: 5 });
      const dist = collector.getRatingDistribution();
      expect(dist).toEqual({ 1: 1, 2: 0, 3: 2, 4: 0, 5: 1 });
    });

    it('should only count valid ratings', () => {
      collector.submitFeedback({ rating: 0 });
      collector.submitFeedback({ rating: 6 });
      collector.submitFeedback({ rating: null });
      const dist = collector.getRatingDistribution();
      expect(dist).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    });
  });

  describe('updateStatus', () => {
    it('should update status by ID', () => {
      const fb = collector.submitFeedback({});
      const updated = collector.updateStatus(fb.id, 'resolved');
      expect(updated.status).toBe('resolved');
    });

    it('should push response with timestamp when provided', () => {
      const fb = collector.submitFeedback({});
      collector.updateStatus(fb.id, 'resolved', { text: 'fixed' });
      expect(fb.responses).toHaveLength(1);
      expect(fb.responses[0].text).toBe('fixed');
      expect(fb.responses[0].timestamp).toEqual(expect.any(String));
    });

    it('should not push response when null', () => {
      const fb = collector.submitFeedback({});
      collector.updateStatus(fb.id, 'resolved');
      expect(fb.responses).toHaveLength(0);
    });

    it('should return null if feedback not found', () => {
      const result = collector.updateStatus('nonexistent', 'resolved');
      expect(result).toBeNull();
    });
  });

  describe('getRoadmap', () => {
    it('should filter out closed feature requests', () => {
      collector.submitFeatureRequest('u1', { title: 'A', description: 'desc' });
      collector.submitFeatureRequest('u1', { title: 'B', description: 'desc' });
      collector.updateStatus(collector.featureRequests[0].id, 'closed');
      const roadmap = collector.getRoadmap();
      expect(roadmap.voteCount).toHaveLength(1);
    });

    it('should return planned features (status new)', () => {
      collector.submitFeatureRequest('u1', { title: 'X', description: 'desc' });
      const roadmap = collector.getRoadmap();
      expect(roadmap.planned).toHaveLength(1);
      expect(roadmap.inProgress).toHaveLength(0);
    });

    it('should return inProgress features', () => {
      const fb = collector.submitFeatureRequest('u1', { title: 'X', description: 'desc' });
      collector.updateStatus(fb.id, 'in_progress');
      const roadmap = collector.getRoadmap();
      expect(roadmap.inProgress).toHaveLength(1);
      expect(roadmap.planned).toHaveLength(0);
    });

    it('should return highPriority features', () => {
      collector.submitFeatureRequest('u1', { title: 'X', description: 'desc', impact: 'high' });
      const roadmap = collector.getRoadmap();
      expect(roadmap.highPriority).toHaveLength(1);
    });

    it('should return voteCount from calculateVotes', () => {
      collector.submitFeatureRequest('u1', { title: 'Dark Mode', description: 'desc' });
      collector.submitFeatureRequest('u2', { title: 'Dark Mode', description: 'desc' });
      collector.submitFeatureRequest('u1', { title: 'Export', description: 'desc' });
      const roadmap = collector.getRoadmap();
      expect(roadmap.voteCount).toEqual([
        { name: 'Dark Mode', count: 2 },
        { name: 'Export', count: 1 }
      ]);
    });
  });

  describe('calculateVotes', () => {
    it('should group by feature title and count', () => {
      const features = [
        { id: '1', feature: { title: 'A' } },
        { id: '2', feature: { title: 'A' } },
        { id: '3', feature: { title: 'B' } }
      ];
      const result = collector.calculateVotes(features);
      expect(result).toEqual([
        { name: 'A', count: 2 },
        { name: 'B', count: 1 }
      ]);
    });

    it('should return top 10', () => {
      const features = [];
      for (let i = 1; i <= 15; i++) {
        features.push({ id: String(i), feature: { title: `Feature ${i}` } });
      }
      const result = collector.calculateVotes(features);
      expect(result).toHaveLength(10);
    });

    it('should sort descending by count', () => {
      const features = [
        { id: '1', feature: { title: 'A' } },
        { id: '2', feature: { title: 'B' } },
        { id: '3', feature: { title: 'B' } },
        { id: '4', feature: { title: 'B' } }
      ];
      const result = collector.calculateVotes(features);
      expect(result[0]).toEqual({ name: 'B', count: 3 });
      expect(result[1]).toEqual({ name: 'A', count: 1 });
    });

    it('should fallback to id when feature title missing', () => {
      const features = [
        { id: 'fallback-id', feature: {} }
      ];
      const result = collector.calculateVotes(features);
      expect(result[0].name).toBe('fallback-id');
    });
  });

  describe('validateCategory', () => {
    it('should return category if in allowed list', () => {
      expect(collector.validateCategory('bug')).toBe('bug');
      expect(collector.validateCategory('performance')).toBe('performance');
    });

    it('should return other for invalid category', () => {
      expect(collector.validateCategory('invalid')).toBe('other');
      expect(collector.validateCategory('')).toBe('other');
    });
  });

  describe('validateRating', () => {
    it('should return int for valid rating 1-5', () => {
      expect(collector.validateRating(1)).toBe(1);
      expect(collector.validateRating('3')).toBe(3);
      expect(collector.validateRating(5)).toBe(5);
    });

    it('should return null for out of range', () => {
      expect(collector.validateRating(0)).toBeNull();
      expect(collector.validateRating(6)).toBeNull();
    });

    it('should return null for NaN', () => {
      expect(collector.validateRating('abc')).toBeNull();
      expect(collector.validateRating(null)).toBeNull();
      expect(collector.validateRating(undefined)).toBeNull();
    });
  });

  describe('sanitizeMessage', () => {
    it('should return empty string for null', () => {
      expect(collector.sanitizeMessage(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(collector.sanitizeMessage(undefined)).toBe('');
    });

    it('should strip < and > characters', () => {
      expect(collector.sanitizeMessage('hello <world>')).toBe('hello world');
    });

    it('should truncate to 2000 characters', () => {
      const longMsg = 'a'.repeat(2500);
      expect(collector.sanitizeMessage(longMsg)).toHaveLength(2000);
    });

    it('should trim whitespace', () => {
      expect(collector.sanitizeMessage('  hello world  ')).toBe('hello world');
    });
  });

  describe('calculatePriority', () => {
    it('should return critical for bug with crash', () => {
      expect(collector.calculatePriority({ type: 'bug', message: 'system crash' })).toBe('critical');
    });

    it('should return critical for bug with data loss', () => {
      expect(collector.calculatePriority({ type: 'bug', message: 'data loss occurred' })).toBe('critical');
    });

    it('should return high for bug with error', () => {
      expect(collector.calculatePriority({ type: 'bug', message: 'error occurred' })).toBe('high');
    });

    it('should return medium for bug without keywords', () => {
      expect(collector.calculatePriority({ type: 'bug', message: 'something broke' })).toBe('medium');
    });

    it('should return high for rating 1', () => {
      expect(collector.calculatePriority({ rating: 1 })).toBe('high');
    });

    it('should return medium for rating 2', () => {
      expect(collector.calculatePriority({ rating: 2 })).toBe('medium');
    });

    it('should return low for rating 3+', () => {
      expect(collector.calculatePriority({ rating: 3 })).toBe('low');
      expect(collector.calculatePriority({ rating: 5 })).toBe('low');
    });

    it('should return low for general feedback without rating', () => {
      expect(collector.calculatePriority({ type: 'general' })).toBe('low');
    });
  });

  describe('extractTags', () => {
    it('should return matching keywords from message', () => {
      const tags = collector.extractTags('This is slow and has a bug crash error');
      expect(tags).toEqual(expect.arrayContaining(['slow', 'bug', 'crash', 'error']));
    });

    it('should not return non-matching words', () => {
      const tags = collector.extractTags('hello world');
      expect(tags).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(collector.extractTags(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(collector.extractTags(undefined)).toEqual([]);
    });

    it('should match case-insensitively', () => {
      const tags = collector.extractTags('SLOW Bug CRASH');
      expect(tags).toEqual(['slow', 'bug', 'crash']);
    });
  });

  describe('trimFeedback', () => {
    it('should remove oldest feedback when exceeding maxFeedback', () => {
      const c = new FeedbackCollector({ maxFeedback: 2 });
      const fb1 = c.submitFeedback({ type: 'general', message: 'first' });
      const fb2 = c.submitFeedback({ type: 'general', message: 'second' });
      const fb3 = c.submitFeedback({ type: 'general', message: 'third' });
      expect(c.feedback).toHaveLength(2);
      expect(c.feedback).not.toContain(fb1);
      expect(c.feedback).toContain(fb2);
      expect(c.feedback).toContain(fb3);
    });

    it('should sync bugs array on trim', () => {
      const c = new FeedbackCollector({ maxFeedback: 1 });
      c.submitFeedback({ type: 'bug', message: 'first bug' });
      const fb2 = c.submitFeedback({ type: 'bug', message: 'second bug' });
      expect(c.bugs).toHaveLength(1);
      expect(c.bugs[0]).toBe(fb2);
    });

    it('should sync suggestions array on trim', () => {
      const c = new FeedbackCollector({ maxFeedback: 1 });
      c.submitFeedback({ type: 'suggestion', message: 'first suggestion' });
      const fb2 = c.submitFeedback({ type: 'suggestion', message: 'second suggestion' });
      expect(c.suggestions).toHaveLength(1);
      expect(c.suggestions[0]).toBe(fb2);
    });

    it('should sync ratings array on trim', () => {
      const c = new FeedbackCollector({ maxFeedback: 1 });
      c.submitFeedback({ rating: 3 });
      const fb2 = c.submitFeedback({ rating: 5 });
      expect(c.ratings).toHaveLength(1);
      expect(c.ratings[0]).toBe(fb2);
    });
  });

  describe('exportJSON', () => {
    it('should return exportedAt, feedback, statistics, and roadmap', () => {
      collector.submitFeedback({ type: 'bug', message: 'crash' });
      const exp = collector.exportJSON();
      expect(exp.exportedAt).toEqual(expect.any(String));
      expect(exp.feedback).toHaveLength(1);
      expect(exp.statistics).toBeDefined();
      expect(exp.statistics.total).toBe(1);
      expect(exp.roadmap).toBeDefined();
    });
  });

  describe('importJSON', () => {
    it('should restore feedback from data', () => {
      collector.submitFeedback({ type: 'bug', message: 'bug' });
      const exportData = { feedback: collector.feedback };
      const c2 = new FeedbackCollector();
      c2.importJSON(exportData);
      expect(c2.feedback).toHaveLength(1);
      expect(c2.feedback[0].message).toBe('bug');
    });

    it('should adjust maxFeedback to at least feedback length', () => {
      const feedback = Array.from({ length: 50 }, (_, i) => ({
        id: `fb_${i}`,
        type: 'general'
      }));
      const c2 = new FeedbackCollector();
      c2.importJSON({ feedback });
      expect(c2.maxFeedback).toBe(1000);
    });

    it('should take max of current and feedback length', () => {
      const feedback = Array.from({ length: 2000 }, (_, i) => ({
        id: `fb_${i}`,
        type: 'general'
      }));
      const c2 = new FeedbackCollector({ maxFeedback: 1500 });
      c2.importJSON({ feedback });
      expect(c2.maxFeedback).toBe(2000);
    });

    it('should not modify state if data has no feedback', () => {
      const c2 = new FeedbackCollector();
      c2.importJSON({});
      expect(c2.feedback).toEqual([]);
    });
  });

  describe('integration scenarios', () => {
    it('should handle a complete user feedback lifecycle', () => {
      const bug = collector.submitFeedback({ type: 'bug', message: 'app crash on login', userId: 'alice' });
      expect(bug.priority).toBe('critical');
      expect(bug.status).toBe('new');

      collector.updateStatus(bug.id, 'in_progress', { text: 'investigating' });
      collector.updateStatus(bug.id, 'resolved', { text: 'fixed in v2.1' });
      expect(bug.status).toBe('resolved');
      expect(bug.responses).toHaveLength(2);

      const suggestion = collector.submitFeedback({ type: 'suggestion', message: 'add dark mode feature', userId: 'bob' });
      expect(suggestion.type).toBe('suggestion');
      expect(suggestion.tags).toContain('feature');

      const rating = collector.submitRating('charlie', 4, { message: 'good app' });
      expect(rating.type).toBe('rating');
      expect(rating.rating).toBe(4);

      const featureReq = collector.submitFeatureRequest('alice', {
        title: 'Dark Mode',
        description: 'Add dark mode',
        priority: 'high',
        impact: 'high'
      });
      expect(featureReq.feature.title).toBe('Dark Mode');

      const stats = collector.getStatistics();
      expect(stats.total).toBe(4);
      expect(stats.byType.bug).toBe(1);
      expect(stats.byType.suggestion).toBe(1);
      expect(stats.byType.rating).toBe(1);
      expect(stats.byType.feature_request).toBe(1);
      expect(stats.rating.average).toBe(4);
      expect(stats.rating.count).toBe(1);
      expect(stats.rating.distribution[4]).toBe(1);
      expect(stats.unresolvedBugs).toBe(0);
    });

    it('should handle feedback at capacity correctly', () => {
      const c = new FeedbackCollector({ maxFeedback: 2 });
      const f1 = c.submitFeedback({ type: 'bug', message: 'bug one', userId: 'u1' });
      const f2 = c.submitFeedback({ type: 'suggestion', message: 'suggestion one', userId: 'u2' });
      const f3 = c.submitFeedback({ type: 'general', rating: 3, userId: 'u3' });

      expect(c.feedback).toHaveLength(2);
      expect(c.feedback).not.toContain(f1);
      expect(c.feedback).toContain(f2);
      expect(c.feedback).toContain(f3);

      expect(c.bugs).toHaveLength(0);
      expect(c.suggestions).toContain(f2);
      expect(c.ratings).toContain(f3);
    });

    it('should correctly filter and sort combined', () => {
      collector.submitFeedback({ type: 'bug', message: 'bug A', rating: 3 });
      collector.submitFeedback({ type: 'bug', message: 'bug B', rating: 5 });
      const result = collector.getFeedback({
        type: 'bug',
        sortBy: 'rating',
        limit: 1
      });
      expect(result).toHaveLength(1);
      expect(result[0].rating).toBe(5);
    });

    it('should correctly handle feature without feature object in calculateVotes', () => {
      const features = [
        { id: 'no-feature-obj' },
        { id: 'other-id', feature: { title: 'Real Feature' } }
      ];
      const result = collector.calculateVotes(features);
      const names = result.map((r) => r.name);
      expect(names).toContain('no-feature-obj');
      expect(names).toContain('Real Feature');
    });
  });
});
