const Evolution = require('../../src/core/Evolution');

jest.mock('../../src/agent/ComprehensiveChecker', () => ({
  ComprehensiveChecker: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue({ stats: { failed: 0, passed: 56, warnings: 0 } })
  }))
}));

describe('Evolution', () => {
  let evolution;

  beforeEach(() => {
    const { ComprehensiveChecker } = require('../../src/agent/ComprehensiveChecker');
    ComprehensiveChecker.mockClear();
    ComprehensiveChecker.mockImplementation(() => ({
      run: jest.fn().mockResolvedValue({ stats: { failed: 0, passed: 56, warnings: 0 } })
    }));
    evolution = new Evolution();
  });

  describe('constructor', () => {
    test('initializes empty data containers', () => {
      expect(evolution.data.patterns).toEqual([]);
      expect(evolution.data.mistakes).toEqual([]);
      expect(evolution.data.improvements).toEqual([]);
      expect(evolution.data.lessons).toEqual([]);
    });

    test('sets default config', () => {
      expect(evolution.config.maxPatterns).toBe(100);
      expect(evolution.config.maxMistakes).toBe(50);
    });

    test('initializes strategies', () => {
      expect(evolution.strategies.fromSuccess).toBe('从成功中提取模式');
    });
  });

  describe('_generateId', () => {
    test('prefixed with evo-', () => {
      expect(evolution._generateId()).toMatch(/^evo-/);
    });
  });

  describe('_truncate', () => {
    test('keeps short text', () => {
      expect(evolution._truncate('short', 200)).toBe('short');
    });

    test('truncates long text with ellipsis', () => {
      const result = evolution._truncate('x'.repeat(300), 200);
      expect(result).toHaveLength(203);
      expect(result).toMatch(/\.\.\.$/);
    });

    test('returns empty for falsy input', () => {
      expect(evolution._truncate(null, 200)).toBe('');
    });
  });

  describe('_extractLesson', () => {
    test('creates pattern-type lesson', () => {
      const lesson = evolution._extractLesson(
        { id: 'p1', context: 'fixing bug', action: 'restart', error: null },
        'pattern'
      );
      expect(lesson.type).toBe('pattern');
      expect(lesson.lesson).toContain('restart');
    });

    test('creates mistake-type lesson', () => {
      const lesson = evolution._extractLesson(
        { id: 'm1', context: 'deploy', error: 'timeout', action: 'deploy' },
        'mistake'
      );
      expect(lesson.type).toBe('mistake');
      expect(lesson.lesson).toContain('timeout');
    });

    test('deduplicates by lesson text', () => {
      evolution._extractLesson({ id: 'p1', context: 'ctx', action: 'restart' }, 'pattern');
      evolution._extractLesson({ id: 'p2', context: 'ctx', action: 'restart' }, 'pattern');
      expect(evolution.data.lessons).toHaveLength(1);
    });

    test('pattern lesson with falsy action uses default', () => {
      const lesson = evolution._extractLesson({ id: 'p1', context: 'ctx', action: '' }, 'pattern');
      expect(lesson.lesson).toBe('成功模式: 未知动作');
    });

    test('mistake lesson with falsy error uses default', () => {
      const lesson = evolution._extractLesson({ id: 'm1', context: 'ctx', error: '' }, 'mistake');
      expect(lesson.lesson).toBe('错误教训: 未知错误');
    });
  });

  describe('recordPattern', () => {
    test('adds pattern to data', () => {
      const p = evolution.recordPattern('context', 'action', { success: true });
      expect(p.success).toBe(true);
      expect(evolution.data.patterns).toHaveLength(1);
    });

    test('limits to maxPatterns', () => {
      for (let i = 0; i < 101; i++) {
        evolution.data.patterns.push({ id: `old-${i}` });
      }
      evolution.recordPattern('new', 'action', { success: true });
      expect(evolution.data.patterns.length).toBeLessThanOrEqual(100);
    });

    test('extracts lesson when confidence >= minConfidence', () => {
      const spy = jest.spyOn(evolution, '_extractLesson');
      evolution.recordPattern('ctx', 'act', { success: true, confidence: 0.8 });
      expect(spy).toHaveBeenCalled();
    });

    test('skips lesson when confidence < minConfidence', () => {
      const spy = jest.spyOn(evolution, '_extractLesson');
      evolution.recordPattern('ctx', 'act', { success: true, confidence: 0.3 });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('recordMistake', () => {
    test('records mistake with error info', () => {
      const m = evolution.recordMistake('deploy', 'deploy', { error: 'timeout', severity: 'high' });
      expect(m.error).toBe('timeout');
      expect(m.severity).toBe('high');
      expect(evolution.data.mistakes).toHaveLength(1);
    });

    test('handles result as plain string', () => {
      const m = evolution.recordMistake('ctx', 'act', 'plain error');
      expect(m.error).toBe('plain error');
    });

    test('limits to maxMistakes', () => {
      for (let i = 0; i < 60; i++) {
        evolution.data.mistakes.push({ id: `old-${i}` });
      }
      evolution.recordMistake('new', 'act', { error: 'fail' });
      expect(evolution.data.mistakes.length).toBeLessThanOrEqual(50);
    });
  });

  describe('fromLesson', () => {
    test('returns formatted lesson object', () => {
      const result = evolution.fromLesson({ lesson: 'test', problem: 'prob', improvement: 'imp' });
      expect(result.principle).toBe('test');
      expect(result.trigger).toBe('prob');
      expect(result.integration.integrated).toBe(true);
    });
  });

  describe('_integrateLesson', () => {
    test('returns integration action', () => {
      expect(evolution._integrateLesson({ lesson: 'test' }).integrated).toBe(true);
    });

    test('calls selfLearning when available', () => {
      const mock = { recordSuggestion: jest.fn() };
      const evo = new Evolution(mock);
      evo._integrateLesson({ lesson: 'test', source: 'src' });
      expect(mock.recordSuggestion).toHaveBeenCalled();
    });
  });

  describe('getLessons', () => {
    test('returns lessons array', () => {
      evolution.data.lessons.push({ lesson: 'test' });
      expect(evolution.getLessons()).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    test('zeros for empty state', () => {
      expect(evolution.getStats()).toEqual({ patterns: 0, mistakes: 0, improvements: 0, lessons: 0, recentLesson: null });
    });

    test('counts with data', () => {
      evolution.data.patterns.push({});
      evolution.data.mistakes.push({});
      evolution.data.lessons.push({ id: 'l1' });
      const stats = evolution.getStats();
      expect(stats.patterns).toBe(1);
      expect(stats.mistakes).toBe(1);
      expect(stats.lessons).toBe(1);
      expect(stats.recentLesson.id).toBe('l1');
    });
  });

  describe('learn', () => {
    test('records pattern on success', () => {
      const spy = jest.spyOn(evolution, 'recordPattern');
      evolution.learn('ctx', 'act', { success: true });
      expect(spy).toHaveBeenCalledWith('ctx', 'act', { success: true });
    });

    test('records mistake on failure', () => {
      const spy = jest.spyOn(evolution, 'recordMistake');
      evolution.learn('ctx', 'act', { success: false, error: 'fail' });
      expect(spy).toHaveBeenCalled();
    });

    test('noop when result is null', () => {
      const spy = jest.spyOn(evolution, 'recordPattern');
      evolution.learn('ctx', 'act', null);
      expect(spy).not.toHaveBeenCalled();
    });

    test('calls findImprovements with selfLearning', () => {
      const mock = { getStats: () => ({ suggestions: 0, responses: 0 }), recordSuggestion: () => {} };
      const evo = new Evolution(mock);
      const spy = jest.spyOn(evo, 'findImprovements');
      evo.learn('ctx', 'act', { success: true });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('findImprovements', () => {
    test('empty without selfLearning', () => {
      expect(evolution.findImprovements()).toEqual([]);
    });

    test('discovers improvements from selfLearning', () => {
      const mock = {
        getStats: () => ({ suggestions: 5, responses: 20 }),
        data: {
          suggestions: new Map([['tip', { shown: 10, adopted: 1 }]]),
          responses: Array.from({ length: 20 }, () => ({ quality: 0.3 }))
        },
        recordSuggestion: () => {}
      };
      const evo = new Evolution(mock);
      expect(evo.findImprovements().length).toBeGreaterThan(0);
    });
  });

  describe('_getFrequentErrors', () => {
    test('empty when no mistakes', () => {
      expect(evolution._getFrequentErrors()).toEqual([]);
    });

    test('returns errors repeated 2+ times', () => {
      for (let i = 0; i < 3; i++) {
        evolution.data.mistakes.push({ error: 'timeout' });
      }
      evolution.data.mistakes.push({ error: 'unique' });
      const result = evolution._getFrequentErrors();
      expect(result).toHaveLength(1);
      expect(result[0].error).toBe('timeout');
    });

    test('uses unknown for mistake without error property', () => {
      evolution.data.mistakes.push({});
      evolution.data.mistakes.push({});
      const result = evolution._getFrequentErrors();
      expect(result.some(r => r.error === 'unknown')).toBe(true);
    });
  });

  describe('_getLowAdoptionSuggestions', () => {
    test('empty without selfLearning', () => {
      expect(evolution._getLowAdoptionSuggestions()).toEqual([]);
    });

    test('finds suggestions with < 30% adoption', () => {
      const suggestions = new Map([
        ['low', { shown: 10, adopted: 1 }],
        ['high', { shown: 10, adopted: 9 }]
      ]);
      const evo = new Evolution({ data: { suggestions }, getStats: () => ({}) });
      const result = evo._getLowAdoptionSuggestions();
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('low');
    });

    test('skips suggestions shown less than 3 times', () => {
      const suggestions = new Map([['new', { shown: 1, adopted: 0 }]]);
      const evo = new Evolution({ data: { suggestions }, getStats: () => ({}) });
      expect(evo._getLowAdoptionSuggestions()).toEqual([]);
    });
  });

  describe('_getLowQualityResponses', () => {
    test('null without selfLearning', () => {
      expect(evolution._getLowQualityResponses()).toBeNull();
    });

    test('null with < 10 responses', () => {
      const evo = new Evolution({ data: { responses: [{ quality: 0.3 }] }, getStats: () => ({}) });
      expect(evo._getLowQualityResponses()).toBeNull();
    });

    test('returns low quality data when avg < 0.5', () => {
      const evo = new Evolution({
        data: { responses: Array.from({ length: 20 }, () => ({ quality: 0.3 })) },
        getStats: () => ({})
      });
      expect(evo._getLowQualityResponses().avgQuality).toBeLessThan(0.5);
    });

    test('null when quality is fine', () => {
      const evo = new Evolution({
        data: { responses: Array.from({ length: 20 }, () => ({ quality: 0.8 })) },
        getStats: () => ({})
      });
      expect(evo._getLowQualityResponses()).toBeNull();
    });

    test('handles falsy quality values in reduce', () => {
      const evo = new Evolution({
        data: { responses: Array.from({ length: 20 }, () => ({})) },
        getStats: () => ({})
      });
      const result = evo._getLowQualityResponses();
      expect(result.avgQuality).toBe(0);
    });
  });

  describe('suggestEvolution', () => {
    test('empty for clean state', () => {
      expect(evolution.suggestEvolution()).toEqual([]);
    });

    test('suggests pattern review when mistakes > 5', () => {
      for (let i = 0; i < 6; i++) evolution.data.mistakes.push({ id: `m${i}` });
      expect(evolution.suggestEvolution().some(s => s.type === 'pattern')).toBe(true);
    });

    test('suggests integration when > 3 unused lessons', () => {
      for (let i = 0; i < 4; i++) evolution.data.lessons.push({ id: `l${i}`, lesson: `l${i}` });
      expect(evolution.suggestEvolution().some(s => s.type === 'integration')).toBe(true);
    });

    test('no integration suggestion when lessons are used', () => {
      evolution.data.lessons.push({ id: 'l1', lesson: 'a' });
      evolution.data.patterns.push({ source: 'l1' });
      expect(evolution.suggestEvolution().some(s => s.type === 'integration')).toBe(false);
    });
  });

  describe('recordProblemSolution', () => {
    test('adds pattern when confidence >= minConfidence', () => {
      evolution.recordProblemSolution({ issue: 'bug' }, { description: 'fix', confidence: 0.8 });
      expect(evolution.data.patterns).toHaveLength(1);
    });

    test('skips pattern when confidence too low', () => {
      evolution.recordProblemSolution({ issue: 'bug' }, { description: 'fix', confidence: 0.3 });
      expect(evolution.data.patterns).toHaveLength(0);
    });
  });

  describe('postTaskCheck', () => {
    test('handles check gracefully', async () => {
      const result = await evolution.postTaskCheck('test', { success: true });
      expect(result.success).toBe(true);
    });

    test('records pattern on success', async () => {
      const spy = jest.spyOn(evolution, 'recordPattern');
      await evolution.postTaskCheck('test', { success: true });
      expect(spy).toHaveBeenCalled();
    });

    test('skips pattern when taskResult.success is false', async () => {
      const spy = jest.spyOn(evolution, 'recordPattern');
      await evolution.postTaskCheck('test', { success: false });
      expect(spy).not.toHaveBeenCalled();
    });

    test('reports checker failures', async () => {
      const { ComprehensiveChecker } = require('../../src/agent/ComprehensiveChecker');
      ComprehensiveChecker.mockImplementation(() => ({
        run: jest.fn().mockResolvedValue({ stats: { failed: 3, passed: 53, warnings: 0 } })
      }));
      const evo = new Evolution();
      const spy = jest.spyOn(evo, 'recordMistake');
      const result = await evo.postTaskCheck('test', { success: true });
      expect(spy).toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    test('handles checker run rejection', async () => {
      const { ComprehensiveChecker } = require('../../src/agent/ComprehensiveChecker');
      ComprehensiveChecker.mockImplementation(() => ({
        run: jest.fn().mockRejectedValue(new Error('checker crashed'))
      }));
      const evo = new Evolution();
      const spy = jest.spyOn(evo, 'recordPattern');
      const result = await evo.postTaskCheck('test', { success: true });
      expect(spy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    test('handles checker constructor throwing', async () => {
      const { ComprehensiveChecker } = require('../../src/agent/ComprehensiveChecker');
      ComprehensiveChecker.mockImplementation(() => { throw new Error('ctor fail'); });
      const evo = new Evolution();
      const spy = jest.spyOn(evo, 'recordPattern');
      const result = await evo.postTaskCheck('test', { success: true });
      expect(spy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    test('catches recordPattern throwing in outer catch', async () => {
      jest.spyOn(evolution, 'recordPattern').mockImplementation(() => { throw new Error('pattern fail'); });
      const spy = jest.spyOn(evolution, 'recordMistake');
      const result = await evolution.postTaskCheck('test', { success: true });
      expect(spy).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('pattern fail');
    });
  });

  describe('learn with improvements', () => {
    test('pushes improvements when findImprovements returns results', () => {
      const mockSL = {
        getStats: () => ({ suggestions: 5, responses: 0 }),
        data: {
          suggestions: new Map([['tip', { shown: 10, adopted: 1 }]])
        },
        recordSuggestion: () => {}
      };
      const evo = new Evolution(mockSL);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      evo.learn('ctx', 'act', { success: true });
      expect(evo.data.improvements.length).toBeGreaterThan(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('改进点'));
      logSpy.mockRestore();
    });
  });

  describe('findImprovements edge cases', () => {
    test('returns empty when getStats throws', () => {
      const mockSL = {
        getStats: () => { throw new Error('stats fail'); },
        recordSuggestion: () => {}
      };
      const evo = new Evolution(mockSL);
      expect(evo.findImprovements()).toEqual([]);
    });

    test('discovers error improvements from frequent mistakes', () => {
      const mockSL = {
        getStats: () => ({ suggestions: 0, responses: 0 }),
        data: {},
        recordSuggestion: () => {}
      };
      const evo = new Evolution(mockSL);
      for (let i = 0; i < 3; i++) {
        evo.data.mistakes.push({ error: 'timeout', context: 'test', action: 'test' });
      }
      const results = evo.findImprovements();
      expect(results.some(r => r.type === 'error')).toBe(true);
    });

    test('skips adoption improvement when no low adoption suggestions', () => {
      const mockSL = {
        getStats: () => ({ suggestions: 5, responses: 0 }),
        data: { suggestions: new Map([['good', { shown: 10, adopted: 9 }]]) },
        recordSuggestion: () => {}
      };
      const evo = new Evolution(mockSL);
      const results = evo.findImprovements();
      expect(results.some(r => r.type === 'adoption')).toBe(false);
    });

    test('skips quality improvement when quality is fine', () => {
      const mockSL = {
        getStats: () => ({ suggestions: 0, responses: 20 }),
        data: { responses: Array.from({ length: 20 }, () => ({ quality: 0.8 })) },
        recordSuggestion: () => {}
      };
      const evo = new Evolution(mockSL);
      const results = evo.findImprovements();
      expect(results.some(r => r.type === 'quality')).toBe(false);
    });

    test('skips error improvement when no frequent errors', () => {
      const mockSL = {
        getStats: () => ({ suggestions: 0, responses: 0 }),
        data: {},
        recordSuggestion: () => {}
      };
      const evo = new Evolution(mockSL);
      evo.data.mistakes.push({ error: 'unique' });
      const results = evo.findImprovements();
      expect(results.some(r => r.type === 'error')).toBe(false);
    });
  });

  describe('_getFrequentErrors', () => {
    test('sorts by descending count', () => {
      for (let i = 0; i < 3; i++) evolution.data.mistakes.push({ error: 'timeout' });
      for (let i = 0; i < 2; i++) evolution.data.mistakes.push({ error: 'network' });
      evolution.data.mistakes.push({ error: 'unique' });
      const result = evolution._getFrequentErrors();
      expect(result).toHaveLength(2);
      expect(result[0].count).toBe(3);
      expect(result[1].count).toBe(2);
    });
  });

  describe('postTaskCheck require.resolve falsy path', () => {
    test('skips checker when require.resolve returns falsy', async () => {
      const Module = require('module');
      const origResolve = Module._resolveFilename;
      Module._resolveFilename = () => null;
      jest.resetModules();
      const Evo = require('../../src/core/Evolution');
      const evo = new Evo();
      const spy = jest.spyOn(evo, 'recordPattern');
      const result = await evo.postTaskCheck('test', { success: true });
      expect(spy).toHaveBeenCalled();
      expect(result.success).toBe(true);
      Module._resolveFilename = origResolve;
    });
  });
});
