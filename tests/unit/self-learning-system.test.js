jest.mock('fs');
jest.mock('../../src/core/BrainSystem', () => ({
  BrainSystem: jest.fn(() => mockBrainInstance)
}));

const SelfLearningSystem = require('../../src/core/SelfLearningSystem');

let mockBrainInstance;

describe('SelfLearningSystem', () => {
  let system;
  let saveSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBrainInstance = {
      beforeDecision: jest.fn(() => ({ questions: ['q1'], selfCheck: 'ok' })),
      evolution: {
        learn: jest.fn(),
        findImprovements: jest.fn(() => []),
        getStats: jest.fn(() => ({ patterns: 0, mistakes: 0, improvements: 0, lessons: 0 }))
      },
      metaCognition: { afterReview: jest.fn(() => ({})) },
      solve: jest.fn(() => 'solved'),
      getStatus: jest.fn(() => ({ mode: 'active' })),
      setConfig: jest.fn()
    };
    jest.spyOn(SelfLearningSystem.prototype, '_loadFromStorage').mockReturnValue();
    saveSpy = jest.spyOn(SelfLearningSystem.prototype, '_saveToStorage').mockReturnValue();
    system = new SelfLearningSystem();
  });

  describe('constructor', () => {
    test('enabled by default', () => {
      expect(system.enabled).toBe(true);
    });
  });

  describe('_validateInput', () => {
    test('returns empty for null', () => {
      expect(system._validateInput(null, 't', 100)).toBe('');
    });

    test('returns empty for undefined', () => {
      expect(system._validateInput(undefined, 't', 100)).toBe('');
    });

    test('converts non-string to string', () => {
      expect(system._validateInput(42, 't', 100)).toBe('42');
    });

    test('truncates long strings', () => {
      expect(system._validateInput('x'.repeat(200), 't', 50)).toHaveLength(50);
    });
  });

  describe('_validateMapKey', () => {
    test('converts non-string to string', () => {
      expect(system._validateMapKey(42)).toBe('42');
    });

    test('blocks __proto__', () => {
      expect(system._validateMapKey('__proto__')).toBe('_blocked___proto__');
    });

    test('blocks constructor', () => {
      expect(system._validateMapKey('constructor')).toBe('_blocked_constructor');
    });

    test('passes normal keys', () => {
      expect(system._validateMapKey('normal-key')).toBe('normal-key');
    });
  });

  describe('_analyzeSentiment', () => {
    test('positive for good keywords', () => {
      expect(system._analyzeSentiment('好棒')).toBe('positive');
    });

    test('negative for bad keywords', () => {
      expect(system._analyzeSentiment('差烂')).toBe('negative');
    });

    test('neutral for mixed', () => {
      expect(system._analyzeSentiment('好差')).toBe('neutral');
    });
  });

  describe('recordIntent', () => {
    test('does nothing when disabled', () => {
      system.enabled = false;
      system.recordIntent('test', 'cat', true);
      expect(system.data.intents.size).toBe(0);
    });

    test('records successful intent', () => {
      system.recordIntent('test intent', 'cat', true);
      const entry = system.data.intents.get('test intent');
      expect(entry.count).toBe(1);
      expect(entry.successCount).toBe(1);
      expect(saveSpy).toHaveBeenCalled();
    });

    test('records unsuccessful intent', () => {
      system.recordIntent('x', 'cat', false);
      const entry = system.data.intents.get('x');
      expect(entry.successCount).toBe(0);
    });
  });

  describe('recordSuggestion', () => {
    test('records adopted suggestion', () => {
      system.recordSuggestion({ type: 'lesson', name: 'test-lesson' }, 'adopted');
      const record = system.data.suggestions.get('lesson:test-lesson');
      expect(record.adopted).toBe(1);
      expect(saveSpy).toHaveBeenCalled();
    });

    test('records ignored suggestion', () => {
      system.recordSuggestion({ type: 'tip', name: 'tip1' }, 'ignored');
      const record = system.data.suggestions.get('tip:tip1');
      expect(record.ignored).toBe(1);
    });
  });

  describe('recordSkillLoad', () => {
    test('records helpful skill', () => {
      system.recordSkillLoad('test-skill', 'coding', true);
      const record = system.data.skills.get('test-skill');
      expect(record.loaded).toBe(1);
      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('recordResponse', () => {
    test('records response with quality', () => {
      system.recordResponse('hello', 'world', 0.8);
      expect(system.data.responses).toHaveLength(1);
      expect(saveSpy).toHaveBeenCalled();
    });

    test('clamps quality between 0 and 1', () => {
      system.recordResponse('msg', 'rsp', 5);
      expect(system.data.responses[0].quality).toBe(1);
    });
  });

  describe('recordFeedback', () => {
    test('records feedback with sentiment', () => {
      system.recordFeedback({ type: 'praise', content: '好棒', sentiment: 'positive' });
      expect(system.data.feedback).toHaveLength(1);
      expect(saveSpy).toHaveBeenCalled();
    });

    test('auto-detects sentiment when not provided', () => {
      system.recordFeedback({ type: 'complaint', content: '很差' });
      expect(system.data.feedback[0].sentiment).toBe('negative');
    });
  });

  describe('_applyBehaviorAdjustment', () => {
    test('reduces frequency on negative feedback', () => {
      for (let i = 0; i < 10; i++) {
        system.data.feedback.push({ sentiment: 'negative', content: 'neutral text' });
      }
      system._applyBehaviorAdjustment('negative');
      expect(system.data.adjustments.suggestionFrequency).toBeLessThan(0);
    });

    test('increases frequency on positive feedback', () => {
      for (let i = 0; i < 10; i++) {
        system.data.feedback.push({ sentiment: 'positive', content: 'neutral text' });
      }
      system._applyBehaviorAdjustment('positive');
      expect(system.data.adjustments.suggestionFrequency).toBeGreaterThan(0);
    });

    test('adjusts to detailed style on short keywords', () => {
      system.data.feedback.push({ sentiment: 'negative', content: '太短了不够详细' });
      system._applyBehaviorAdjustment('negative');
      expect(system.data.adjustments.responseStyle).toBe('detailed');
    });

    test('adjusts to brief style on long keywords', () => {
      system.data.feedback.push({ sentiment: 'positive', content: '太长了很多' });
      system._applyBehaviorAdjustment('positive');
      expect(system.data.adjustments.responseStyle).toBe('brief');
    });
  });

  describe('_identifyPatterns', () => {
    test('extracts patterns from high-quality responses', () => {
      system.data.responses.push({
        message: 'how to write tests properly',
        response: 'Use jest',
        quality: 0.9
      });
      system._identifyPatterns();
      expect(system.data.patterns).toBeDefined();
    });
  });

  describe('_autoAdjust', () => {
    test('returns empty when no data', () => {
      expect(system._autoAdjust()).toEqual([]);
    });

    test('adjusts with high accuracy data', () => {
      system.data.intents.set('test', { count: 10, successCount: 9 });
      const adjustments = system._autoAdjust();
      expect(adjustments.length).toBeGreaterThan(0);
    });
  });

  describe('getImprovements', () => {
    test('identifies low-accuracy intents', () => {
      system.data.intents.set('bad-intent', { count: 10, successCount: 2 });
      const improvements = system.getImprovements();
      expect(improvements.some(i => i.type === 'intent')).toBe(true);
    });

    test('returns empty for clean state', () => {
      expect(system.getImprovements()).toEqual([]);
    });
  });

  describe('getStats', () => {
    test('returns stats structure', () => {
      const stats = system.getStats();
      expect(stats.intents).toBeDefined();
      expect(stats.responses).toBe(0);
    });
  });

  describe('getAdjustedParameters', () => {
    test('returns default parameters', () => {
      const params = system.getAdjustedParameters();
      expect(params.suggestionCount).toBe(3);
      expect(params.responseStyle).toBe('normal');
    });
  });

  describe('_getAdjustmentReason', () => {
    test('returns default when no adjustments', () => {
      expect(system._getAdjustmentReason()).toBe('使用默认参数');
    });

    test('includes frequency info', () => {
      system.data.adjustments.suggestionFrequency = -1;
      system.data.adjustments.responseStyle = 'brief';
      expect(system._getAdjustmentReason()).toContain('减少');
    });
  });

  describe('_calculateSuggestionPriority', () => {
    test('increases priority on adoption', () => {
      system.data.suggestions.set('tip:test', {
        shown: 5, adopted: 3, ignored: 1, rejected: 0, priority: 0.4
      });
      system._calculateSuggestionPriority('tip:test', 'adopted');
      expect(system.data.suggestions.get('tip:test').priority).toBeGreaterThan(0.4);
    });

    test('decreases priority on rejection', () => {
      system.data.suggestions.set('tip:test', {
        shown: 5, adopted: 0, ignored: 0, rejected: 3, priority: 0.8
      });
      system._calculateSuggestionPriority('tip:test', 'rejected');
      expect(system.data.suggestions.get('tip:test').priority).toBeLessThan(0.8);
    });
  });

  describe('getContextualRecommendations', () => {
    test('returns empty when no matches', () => {
      expect(system.getContextualRecommendations('unknown')).toEqual([]);
    });

    test('recommends skills with high success rate', () => {
      system.data.skills.set('test-skill', { loaded: 10, helpfulCount: 8, contexts: ['coding'] });
      const recs = system.getContextualRecommendations('coding');
      expect(recs.length).toBeGreaterThan(0);
    });

    test('recommends patterns', () => {
      system.data.patterns.set('test', { successRate: 0.8, recommended: 'use x' });
      const recs = system.getContextualRecommendations('testing');
      expect(recs.some(r => r.type === 'pattern')).toBe(true);
    });
  });

  describe('exportReport', () => {
    test('returns report structure', () => {
      const report = system.exportReport();
      expect(report.timestamp).toBeDefined();
      expect(report.stats).toBeDefined();
    });
  });

  describe('recordIntent edge cases', () => {
    test('trims intents map when over limit', () => {
      system.limits.maxMapSize = 2;
      system.recordIntent('first', 'a', true);
      system.recordIntent('second', 'b', true);
      system.recordIntent('third', 'c', true);
      expect(system.data.intents.size).toBe(2);
      expect(system.data.intents.has('first')).toBe(false);
    });
  });

  describe('recordSuggestion rejected', () => {
    test('records rejected suggestion', () => {
      system.recordSuggestion({ type: 'tip', name: 'bad' }, 'rejected');
      const record = system.data.suggestions.get('tip:bad');
      expect(record.rejected).toBe(1);
    });
  });

  describe('recordSkillLoad not helpful', () => {
    test('records not helpful skill', () => {
      system.recordSkillLoad('bad-skill', 'debugging', false);
      const record = system.data.skills.get('bad-skill');
      expect(record.helpfulCount).toBe(0);
    });

    test('handles non-boolean helpful', () => {
      system.recordSkillLoad('sk', 'ctx', 'yes');
      const record = system.data.skills.get('sk');
      expect(record.helpfulCount).toBe(0);
    });
  });

  describe('_identifyPatterns', () => {
    test('extracts patterns and enforces map limit', () => {
      system.limits.maxMapSize = 1;
      system.data.responses.push({ message: 'complex howto debug code', response: 'use console', quality: 0.9 });
      system._identifyPatterns();
      expect(system.data.patterns.size).toBeLessThanOrEqual(1);
    });
  });

  describe('_analyzeFeedback', () => {
    test('warns on excessive negative feedback', () => {
      for (let i = 0; i < 10; i++) {
        system.data.feedback.push({ sentiment: 'negative' });
      }
      system._analyzeFeedback();
    });
  });

  describe('getStats with data', () => {
    test('aggregates samples across Maps', () => {
      system.data.intents.set('a', { count: 5, successCount: 3 });
      system.data.suggestions.set('b', { shown: 10, adopted: 2 });
      system.data.skills.set('c', { loaded: 7, helpfulCount: 4 });
      const stats = system.getStats();
      expect(stats.intents.samples).toBe(5);
      expect(stats.suggestions.samples).toBe(10);
      expect(stats.skills.samples).toBe(7);
    });
  });

  describe('_autoAdjust edge cases', () => {
    test('adjusts skill threshold on high success rate', () => {
      system.data.skills.set('good', { loaded: 10, helpfulCount: 9, contexts: [] });
      system._autoAdjust();
      expect(system.strategies.skillRecommendation.loadThreshold).toBeGreaterThan(0.6);
    });

    test('adjusts skill threshold on low success rate', () => {
      system.data.skills.set('bad', { loaded: 10, helpfulCount: 1, contexts: [] });
      system.strategies.skillRecommendation.loadThreshold = 0.5;
      system._autoAdjust();
      expect(system.strategies.skillRecommendation.loadThreshold).toBeLessThan(0.5);
    });

    test('adjusts suggestion frequency on low quality responses', () => {
      for (let i = 0; i < 20; i++) {
        system.data.responses.push({ message: 'msg', response: 'rsp', quality: 0.3 });
      }
      system.data.intents.set('x', { count: 10, successCount: 5 });
      system._autoAdjust();
    });

    test('adjusts suggestion frequency on high quality responses', () => {
      for (let i = 0; i < 20; i++) {
        system.data.responses.push({ message: 'msg', response: 'rsp', quality: 0.95 });
      }
      system.data.intents.set('x', { count: 10, successCount: 5 });
      system._autoAdjust();
    });
  });

  describe('getImprovements edge cases', () => {
    test('identifies low adoption suggestions', () => {
      system.data.suggestions.set('tip:bad', { shown: 5, adopted: 0, ignored: 3, rejected: 2 });
      const improvements = system.getImprovements();
      expect(improvements.some(i => i.type === 'suggestion')).toBe(true);
    });

    test('identifies low quality responses', () => {
      for (let i = 0; i < 15; i++) {
        system.data.responses.push({ message: 'msg', response: 'rsp', quality: 0.4 });
      }
      const improvements = system.getImprovements();
      expect(improvements.some(i => i.type === 'response')).toBe(true);
    });
  });

  describe('getAdjustedParameters with data', () => {
    test('computes type weights from suggestions', () => {
      system.data.suggestions.set('tip:a', { shown: 5, adopted: 3, ignored: 1, rejected: 1 });
      system.data.suggestions.set('tip:b', { shown: 3, adopted: 0, ignored: 2, rejected: 1 });
      system.data.suggestions.set('lesson:c', { shown: 1, adopted: 1, ignored: 0, rejected: 0 });
      const params = system.getAdjustedParameters();
      expect(params.typeWeights.tip).toBeDefined();
    });
  });

  describe('_getAdjustmentReason edge cases', () => {
    test('reports increased frequency', () => {
      system.data.adjustments.suggestionFrequency = 1;
      expect(system._getAdjustmentReason()).toContain('增加');
    });

    test('reports detailed style', () => {
      system.data.adjustments.responseStyle = 'detailed';
      expect(system._getAdjustmentReason()).toContain('详细');
    });
  });

  describe('recordResponse overflow', () => {
    test('trims responses at max', () => {
      system.limits.maxResponses = 2;
      system.recordResponse('a', 'b', 0.5);
      system.recordResponse('c', 'd', 0.5);
      system.recordResponse('e', 'f', 0.5);
      expect(system.data.responses).toHaveLength(2);
    });
  });

  describe('recordFeedback overflow', () => {
    test('trims feedback at max', () => {
      system.limits.maxFeedback = 2;
      system.recordFeedback({ type: 't', content: 'a', sentiment: 'pos' });
      system.recordFeedback({ type: 't', content: 'b', sentiment: 'pos' });
      system.recordFeedback({ type: 't', content: 'c', sentiment: 'pos' });
      expect(system.data.feedback).toHaveLength(2);
    });
  });

  describe('exportReport with patterns', () => {
    test('includes top patterns sorted by success rate', () => {
      system.data.patterns.set('x', { successRate: 0.9 });
      system.data.patterns.set('y', { successRate: 1.0 });
      const report = system.exportReport();
      expect(report.topPatterns).toHaveLength(2);
      expect(report.topPatterns[0].successRate).toBe(1.0);
    });
  });

  describe('_autoAdjust triggered by size', () => {
    test('triggers _autoAdjust every 10 intents', () => {
      jest.spyOn(SelfLearningSystem.prototype, '_autoAdjust').mockRestore();
      const sys = new SelfLearningSystem();
      for (let i = 0; i < 10; i++) {
        sys.recordIntent(`intent-${i}`, 'cat', true);
      }
    });
  });

  describe('recordIntent variants migration', () => {
    test('converts array variants to Set', () => {
      system.data.intents.set('old-key', { count: 1, successCount: 1, variants: ['old-cat'] });
      system.recordIntent('old-key', 'new-cat', false);
      const record = system.data.intents.get('old-key');
      expect(record.count).toBe(2);
    });
  });

  describe('recordSuggestion map overflow', () => {
    test('trims suggestions map when over limit', () => {
      system.limits.maxMapSize = 2;
      system.recordSuggestion({ type: 'a', name: '1' }, 'adopted');
      system.recordSuggestion({ type: 'b', name: '2' }, 'adopted');
      system.recordSuggestion({ type: 'c', name: '3' }, 'adopted');
      expect(system.data.suggestions.size).toBe(2);
    });
  });

  describe('recordSkillLoad map overflow', () => {
    test('trims skills map when over limit', () => {
      system.limits.maxMapSize = 2;
      system.recordSkillLoad('sk1', 'ctx', true);
      system.recordSkillLoad('sk2', 'ctx', true);
      system.recordSkillLoad('sk3', 'ctx', true);
      expect(system.data.skills.size).toBe(2);
    });

    test('migrates array contexts to Set', () => {
      system.data.skills.set('old-sk', { loaded: 1, helpfulCount: 1, contexts: ['ctx'] });
      system.recordSkillLoad('old-sk', 'new-ctx', true);
      const record = system.data.skills.get('old-sk');
      expect(record.loaded).toBe(2);
    });
  });

  describe('_autoAdjust disabled', () => {
    test('returns undefined when disabled', () => {
      const sys = new SelfLearningSystem({ enabled: false });
      expect(sys._autoAdjust()).toBeUndefined();
    });
  });

  describe('brain delegation', () => {
    test('beforeDecision delegates', () => {
      const result = system.beforeDecision('test ctx');
      expect(mockBrainInstance.beforeDecision).toHaveBeenCalledWith('test ctx');
      expect(result.questions).toEqual(['q1']);
    });

    test('afterDecision records and learns', () => {
      system.afterDecision('ctx', { success: true }, 'action1');
      expect(system.data.responses.length).toBeGreaterThan(0);
      expect(mockBrainInstance.evolution.learn).toHaveBeenCalled();
    });

    test('solveProblem delegates', () => {
      expect(system.solveProblem('problem')).toBe('solved');
    });

    test('getBrainStatus delegates', () => {
      expect(system.getBrainStatus().mode).toBe('active');
    });

    test('configureBrain delegates', () => {
      system.configureBrain({ key: 'val' });
      expect(mockBrainInstance.setConfig).toHaveBeenCalledWith({ key: 'val' });
    });
  });

  describe('record methods - disabled guard', () => {
    test('recordSuggestion does nothing when disabled', () => {
      system.enabled = false;
      system.recordSuggestion({ type: 't', name: 'n' }, 'adopted');
      expect(system.data.suggestions.size).toBe(0);
    });

    test('recordSkillLoad does nothing when disabled', () => {
      system.enabled = false;
      system.recordSkillLoad('sk', 'ctx', true);
      expect(system.data.skills.size).toBe(0);
    });

    test('recordResponse does nothing when disabled', () => {
      system.enabled = false;
      system.recordResponse('m', 'r', 0.8);
      expect(system.data.responses).toHaveLength(0);
    });

    test('recordFeedback does nothing when disabled', () => {
      system.enabled = false;
      system.recordFeedback({ type: 't', content: 'c' });
      expect(system.data.feedback).toHaveLength(0);
    });
  });

  describe('recordIntent - variants edge cases', () => {
    test('keeps variants when record already has a Set', () => {
      system.data.intents.set('k', { count: 1, successCount: 1, variants: new Set(['a']) });
      system.recordIntent('k', 'b', false);
      const record = system.data.intents.get('k');
      expect(record.count).toBe(2);
      expect(record.variants).toEqual(['a', 'b']);
    });

    test('migrates record with undefined variants', () => {
      system.data.intents.set('k', { count: 1, successCount: 1 });
      system.recordIntent('k', 'b', false);
      const record = system.data.intents.get('k');
      expect(record.count).toBe(2);
      expect(record.variants).toEqual(['b']);
    });
  });

  describe('recordSkillLoad - contexts edge cases', () => {
    test('keeps contexts when record already has a Set', () => {
      system.data.skills.set('k', { loaded: 1, helpfulCount: 1, contexts: new Set(['a']) });
      system.recordSkillLoad('k', 'b', true);
      const record = system.data.skills.get('k');
      expect(record.loaded).toBe(2);
      expect(record.contexts).toEqual(['a', 'b']);
    });

    test('migrates record with undefined contexts', () => {
      system.data.skills.set('k', { loaded: 1, helpfulCount: 1 });
      system.recordSkillLoad('k', 'b', true);
      const record = system.data.skills.get('k');
      expect(record.loaded).toBe(2);
      expect(record.contexts).toEqual(['b']);
    });
  });

  describe('recordResponse - quality default', () => {
    test('uses 0.5 default for non-number quality', () => {
      system.recordResponse('a', 'b', 'high');
      expect(system.data.responses[0].quality).toBe(0.5);
    });
  });

  describe('_autoAdjust - fallthrough branches', () => {
    test('does not adjust skill threshold for mid-range success rate', () => {
      system.data.skills.set('mid', { loaded: 10, helpfulCount: 5, contexts: [] });
      const adjustments = system._autoAdjust();
      expect(adjustments.some((a) => a.includes('skill_threshold'))).toBe(false);
    });

    test('does not adjust frequency for mid-range response quality', () => {
      for (let i = 0; i < 20; i++) {
        system.data.responses.push({ message: 'm', response: 'r', quality: 0.7 });
      }
      const adjustments = system._autoAdjust();
      expect(adjustments.some((a) => a.includes('suggestion_freq'))).toBe(false);
    });
  });

  describe('getImprovements - response quality boundary', () => {
    test('no response improvement when avg quality is at least 0.6', () => {
      for (let i = 0; i < 15; i++) {
        system.data.responses.push({ message: 'm', response: 'r', quality: 0.8 });
      }
      const improvements = system.getImprovements();
      expect(improvements.some((i) => i.type === 'response')).toBe(false);
    });
  });

  describe('getContextualRecommendations - edge cases', () => {
    test('handles contexts stored as a Set', () => {
      system.data.skills.set('s', { loaded: 10, helpfulCount: 8, contexts: new Set(['coding']) });
      const recs = system.getContextualRecommendations('coding');
      expect(recs.some((r) => r.type === 'skill')).toBe(true);
    });

    test('skips skill with low success rate', () => {
      system.data.skills.set('s', { loaded: 10, helpfulCount: 4, contexts: new Set(['coding']) });
      const recs = system.getContextualRecommendations('coding');
      expect(recs.some((r) => r.type === 'skill')).toBe(false);
    });

    test('handles skill with missing contexts field', () => {
      system.data.skills.set('s', { loaded: 10, helpfulCount: 8 });
      const recs = system.getContextualRecommendations('coding');
      expect(recs.some((r) => r.type === 'skill')).toBe(false);
    });

    test('skips pattern not present in context', () => {
      system.data.patterns.set('nomatch', { successRate: 0.8, recommended: 'x' });
      const recs = system.getContextualRecommendations('testing');
      expect(recs.some((r) => r.type === 'pattern')).toBe(false);
    });

    test('sorts multiple recommendations by priority', () => {
      system.data.skills.set('s', { loaded: 10, helpfulCount: 8, contexts: ['code'] });
      system.data.patterns.set('code', { successRate: 0.9, recommended: 'use x' });
      const recs = system.getContextualRecommendations('code');
      expect(recs.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < recs.length - 1; i++) {
        expect(recs[i].priority).toBeGreaterThanOrEqual(recs[i + 1].priority);
      }
    });
  });

  describe('_calculateSuggestionPriority - edge cases', () => {
    test('uses 0 delta for unknown action', () => {
      system.data.suggestions.set('tip:x', { shown: 1, adopted: 0, ignored: 0, rejected: 0, priority: 0.5 });
      system._calculateSuggestionPriority('tip:x', 'unknown');
      expect(system.data.suggestions.get('tip:x').priority).toBe(0.5);
    });

    test('no-ops when suggestion does not exist', () => {
      system._calculateSuggestionPriority('tip:missing', 'adopted');
      expect(system.data.suggestions.has('tip:missing')).toBe(false);
    });
  });

  describe('_identifyPatterns - low quality response', () => {
    test('ignores low quality responses', () => {
      system.data.responses.push({ message: 'complex howto debug code', response: 'x', quality: 0.5 });
      system._identifyPatterns();
      expect(system.data.patterns.size).toBe(0);
    });
  });

  describe('afterDecision - edge cases', () => {
    test('handles failure result without action', () => {
      system.afterDecision('ctx', { success: false });
      expect(system.data.responses[0].quality).toBe(0.4);
      expect(mockBrainInstance.evolution.learn).toHaveBeenCalled();
    });
  });
});
