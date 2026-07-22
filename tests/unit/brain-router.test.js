const mockBrainInstance = {
  beforeDecision: jest.fn(),
  analyze: jest.fn(),
  question: jest.fn(),
  suggestTools: jest.fn(),
  reverseThink: jest.fn(),
  learnFromResult: jest.fn(),
  getLessonSuggestions: jest.fn(),
  thinkComplete: jest.fn(),
  exportReport: jest.fn()
};

jest.mock('../../src/agent/BrainAgent', () => jest.fn(() => mockBrainInstance));

const BrainRouter = require('../../src/agents/BrainRouter');

describe('BrainRouter', () => {
  let router;
  let mockRouterAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterAgent = {
      routeMessage: jest.fn().mockResolvedValue({ routing: {} })
    };
    router = new BrainRouter(mockRouterAgent);
  });

  describe('constructor', () => {
    it('initializes with router agent and default stats', () => {
      expect(router.router).toBe(mockRouterAgent);
      expect(router.brain).toBeDefined();
      expect(router._stats).toEqual({
        totalDecisions: 0,
        brainActivations: 0,
        reverseThinkCount: 0
      });
    });

    it('logs when brain is initialized', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      new BrainRouter(mockRouterAgent);
      expect(logSpy).toHaveBeenCalledWith('[BrainRouter] AI大脑已初始化');
      logSpy.mockRestore();
    });

    it('sets brain to null when BrainAgent construction fails', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const BrainAgent = require('../../src/agent/BrainAgent');
      BrainAgent.mockImplementationOnce(() => { throw new Error('Init failed'); });

      const router = new BrainRouter(mockRouterAgent);

      expect(warnSpy).toHaveBeenCalledWith('[BrainRouter] BrainAgent 加载失败:', 'Init failed');
      expect(router.brain).toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('routeMessage', () => {
    it('performs brain analysis and returns enhanced result', async () => {
      mockBrainInstance.beforeDecision.mockReturnValue({
        questions: { questions: ['Why this route?', 'Any alternative?'] }
      });
      mockBrainInstance.analyze.mockReturnValue({ technical: 'feasible' });
      mockBrainInstance.question.mockReturnValue('Is this the correct handler?');
      mockBrainInstance.suggestTools.mockReturnValue(['search', 'memory']);

      const result = await router.routeMessage('test message', ['ctx']);

      expect(router._stats.totalDecisions).toBe(1);
      expect(router._stats.brainActivations).toBe(1);
      expect(mockRouterAgent.routeMessage).toHaveBeenCalledWith('test message', ['ctx']);
      expect(mockBrainInstance.beforeDecision).toHaveBeenCalledWith('test message');
      expect(mockBrainInstance.analyze).toHaveBeenCalledWith('test message');
      expect(result.brain).toEqual({
        metaQuestions: ['Why this route?', 'Any alternative?'],
        perspectives: { technical: 'feasible' },
        questioning: 'Is this the correct handler?',
        tools: ['search', 'memory'],
        timestamp: expect.any(Number)
      });
      expect(result.routing.brainEnhanced).toBe(true);
    });

    it('skips brain analysis when brain is null', async () => {
      router.brain = null;
      mockRouterAgent.routeMessage.mockResolvedValue({ routing: { destination: 'default' } });

      const result = await router.routeMessage('test');

      expect(router._stats.totalDecisions).toBe(1);
      expect(router._stats.brainActivations).toBe(0);
      expect(result.brain).toBeUndefined();
      expect(result.routing.brainEnhanced).toBeUndefined();
    });

    it('handles null from beforeDecision (optional chaining fallback)', async () => {
      mockBrainInstance.beforeDecision.mockReturnValue(null);
      mockBrainInstance.analyze.mockReturnValue({ technical: 'feasible' });
      mockBrainInstance.question.mockReturnValue('test');
      mockBrainInstance.suggestTools.mockReturnValue([]);
      mockRouterAgent.routeMessage.mockResolvedValue({ routing: {} });

      const result = await router.routeMessage('test');

      expect(result.brain.metaQuestions).toEqual([]);
      expect(result.brain.perspectives).toEqual({ technical: 'feasible' });
    });

    it('handles pre-route analysis errors gracefully', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockBrainInstance.beforeDecision.mockImplementation(() => {
        throw new Error('Analysis crashed');
      });
      mockRouterAgent.routeMessage.mockResolvedValue({ routing: {} });

      const result = await router.routeMessage('trigger-error');

      expect(result.brain).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        '[BrainRouter] Pre-route analysis error:', 'Analysis crashed'
      );
      warnSpy.mockRestore();
    });

    it('increments totalDecisions on each call', async () => {
      await router.routeMessage('a');
      await router.routeMessage('b');
      await router.routeMessage('c');
      expect(router._stats.totalDecisions).toBe(3);
    });
  });

  describe('reverseThinkRouting', () => {
    it('returns reverse analysis when brain is available', async () => {
      mockBrainInstance.reverseThink.mockReturnValue({
        reversePerspective: 'should search instead of direct access',
        confidence: 0.8
      });

      const result = await router.reverseThinkRouting('search', 'Find docs');

      expect(result).toEqual({
        currentRoute: 'search',
        reverseAnalysis: {
          reversePerspective: 'should search instead of direct access',
          confidence: 0.8
        },
        alternativeRoutes: ['search']
      });
      expect(router._stats.reverseThinkCount).toBe(1);
    });

    it('returns error when brain is disabled', async () => {
      router.brain = null;
      const result = await router.reverseThinkRouting('memory', 'Recall');

      expect(result).toEqual({ error: 'Brain not enabled' });
      expect(router._stats.reverseThinkCount).toBe(0);
    });
  });

  describe('_suggestAlternatives', () => {
    it('returns search when reversePerspective mentions search', () => {
      const result = router._suggestAlternatives({
        reversePerspective: 'using search would be better'
      });
      expect(result).toEqual(['search']);
    });

    it('returns memory when reversePerspective mentions memory', () => {
      const result = router._suggestAlternatives({
        reversePerspective: 'check memory first'
      });
      expect(result).toEqual(['memory']);
    });

    it('returns both search and memory', () => {
      const result = router._suggestAlternatives({
        reversePerspective: 'search memory for pattern'
      });
      expect(result).toEqual(['search', 'memory']);
    });

    it('returns empty array when no keywords match', () => {
      const result = router._suggestAlternatives({
        reversePerspective: 'just log it'
      });
      expect(result).toEqual([]);
    });

    it('returns empty array for null analysis', () => {
      expect(router._suggestAlternatives(null)).toEqual([]);
    });

    it('returns empty array when reversePerspective is missing', () => {
      expect(router._suggestAlternatives({})).toEqual([]);
    });
  });

  describe('learnFromResult', () => {
    it('delegates to brain when available', () => {
      router.learnFromResult('message', 'search', true, 'response data');

      expect(mockBrainInstance.learnFromResult).toHaveBeenCalledWith(
        'message', 'route:search', 'response data', true
      );
    });

    it('does nothing when brain is null', () => {
      router.brain = null;
      router.learnFromResult('message', 'search', true, 'response');
      expect(mockBrainInstance.learnFromResult).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('returns stats with brain enabled flag', () => {
      router._stats.totalDecisions = 5;
      router._stats.brainActivations = 3;

      const stats = router.getStats();
      expect(stats).toEqual({
        totalDecisions: 5,
        brainActivations: 3,
        reverseThinkCount: 0,
        brainEnabled: true
      });
    });
  });

  describe('getLessonSuggestions', () => {
    it('returns brain suggestions when brain is available', () => {
      mockBrainInstance.getLessonSuggestions.mockReturnValue(['lesson1', 'lesson2']);

      const result = router.getLessonSuggestions({ task: 'route' });

      expect(result).toEqual(['lesson1', 'lesson2']);
      expect(mockBrainInstance.getLessonSuggestions).toHaveBeenCalledWith({ task: 'route' });
    });

    it('returns empty array when brain is null', () => {
      router.brain = null;
      expect(router.getLessonSuggestions({})).toEqual([]);
    });
  });

  describe('thinkComplete', () => {
    it('delegates to brain when available', async () => {
      mockBrainInstance.thinkComplete.mockResolvedValue({ conclusion: 'use search' });

      const result = await router.thinkComplete('Which route for document query?');

      expect(result).toEqual({ conclusion: 'use search' });
      expect(mockBrainInstance.thinkComplete).toHaveBeenCalledWith(
        'Which route for document query?'
      );
    });

    it('returns error when brain is null', async () => {
      router.brain = null;
      const result = await router.thinkComplete('any problem');

      expect(result).toEqual({ error: 'Brain not enabled' });
    });
  });

  describe('getReport', () => {
    it('returns stats and brain report when brain is available', () => {
      mockBrainInstance.exportReport.mockReturnValue({ lessons: ['l1'] });

      const report = router.getReport();

      expect(report.stats).toBeDefined();
      expect(report.stats.brainEnabled).toBe(true);
      expect(report.brain).toEqual({ lessons: ['l1'] });
    });

    it('returns only stats when brain is null', () => {
      router.brain = null;
      const report = router.getReport();

      expect(report.stats.brainEnabled).toBe(false);
      expect(report.brain).toBeUndefined();
    });
  });
});
