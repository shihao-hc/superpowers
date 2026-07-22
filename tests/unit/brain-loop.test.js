const AgentLoop = require('../../src/agent/AgentLoop');
const BrainAgent = require('../../src/agent/BrainAgent');

jest.mock('../../src/agent/AgentLoop', () => {
  const mock = jest.fn().mockImplementation(function MockAgentLoop() {
    this._llmContext = '';
  });
  mock.prototype.run = jest.fn().mockResolvedValue({
    success: true,
    result: 'done',
    error: null
  });
  mock.prototype.getStats = jest.fn().mockReturnValue({
    loops: 2,
    tasks: 3
  });
  mock.prototype.cleanup = jest.fn().mockResolvedValue(undefined);
  return mock;
});

jest.mock('../../src/agent/BrainAgent');

const BrainLoop = require('../../src/agent/BrainLoop');

describe('BrainLoop', () => {
  let brainLoop;
  let mockBrainInstance;

  function createMockBrain() {
    const instance = new BrainAgent();
    instance.thinkComplete = jest.fn().mockReturnValue({
      metaQuestions: { questions: { questions: [{ question: 'What is the goal?' }] } },
      perspectives: { technical: 'Needs optimization' },
      questions: { questions: ['Is this correct?'] },
      lessons: [{ lesson: 'Remember X', problem: 'X issue' }]
    });
    instance.getStatus = jest.fn().mockReturnValue({ active: true, mode: 'thinking' });
    instance.learnFromResult = jest.fn();
    instance.getEvolutionStats = jest.fn().mockReturnValue({ evolved: false });
    instance.getLessonStats = jest.fn().mockReturnValue({ total: 5 });
    instance.exportReport = jest.fn().mockReturnValue({ report: 'brain report' });
    instance.reverseThink = jest.fn().mockResolvedValue({ reversed: true });
    instance.getLessonSuggestions = jest.fn().mockResolvedValue(['lesson1', 'lesson2']);
    return instance;
  }

  beforeEach(() => {
    BrainAgent.mockClear();
    AgentLoop.mockClear();

    mockBrainInstance = createMockBrain();
    BrainAgent.mockImplementation(() => mockBrainInstance);

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    brainLoop = new BrainLoop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default brain config and create BrainAgent', () => {
      expect(brainLoop.brainConfig.enabled).toBe(true);
      expect(brainLoop.brainConfig.verbose).toBe(false);
      expect(brainLoop.brainConfig.autoThink).toBe(true);
      expect(brainLoop.brainConfig.autoReview).toBe(true);
      expect(brainLoop.brain).toBeDefined();
      expect(brainLoop._brainHistory).toEqual([]);
      expect(brainLoop.version).toBe('1.0.0');
      expect(brainLoop._isShuttingDown).toBe(false);
      expect(BrainAgent).toHaveBeenCalledWith(expect.objectContaining({
        enabled: true,
        verbose: false
      }));
    });

    it('should not create BrainAgent when brain is disabled', () => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      BrainAgent.mockClear();
      const disabled = new BrainLoop({ brainEnabled: false });

      expect(disabled.brainConfig.enabled).toBe(false);
      expect(disabled.brain).toBeUndefined();
      expect(BrainAgent).not.toHaveBeenCalled();
    });

    it('should pass custom options to BrainAgent', () => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      BrainAgent.mockClear();
      new BrainLoop({
        brainVerbose: true,
        enableMetaCognition: false,
        enableThinking: true,
        enableReverseThinking: false,
        enableEvolution: false,
        enableTools: true,
        maxReflectionDepth: 5
      });

      expect(BrainAgent).toHaveBeenCalledWith(expect.objectContaining({
        verbose: true,
        enableMetaCognition: false,
        enableThinking: true,
        enableReverseThinking: false,
        enableEvolution: false,
        enableTools: true,
        maxReflectionDepth: 5
      }));
    });
  });

  describe('shutdown', () => {
    it('should save brain state and clear history', async () => {
      await brainLoop.shutdown();

      expect(mockBrainInstance.exportReport).toHaveBeenCalled();
      expect(brainLoop._brainHistory).toEqual([]);
      expect(brainLoop._isShuttingDown).toBe(true);
    });

    it('should handle missing brain gracefully', async () => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const disabled = new BrainLoop({ brainEnabled: false });
      await disabled.shutdown();

      expect(disabled._isShuttingDown).toBe(true);
    });

    it('should not shutdown twice', async () => {
      await brainLoop.shutdown();
      brainLoop.shutdown();
      expect(mockBrainInstance.exportReport).toHaveBeenCalledTimes(1);
    });

    it('should call cleanup when available', async () => {
      brainLoop.cleanup = jest.fn().mockResolvedValue();
      await brainLoop.shutdown();
      expect(brainLoop.cleanup).toHaveBeenCalled();
    });

    it('should handle errors during shutdown gracefully', async () => {
      brainLoop.cleanup = jest.fn().mockRejectedValue(new Error('cleanup failed'));
      await expect(brainLoop.shutdown()).resolves.not.toThrow();
    });
  });

  describe('run', () => {
    it('should delegate to super.run when brain disabled', async () => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const disabled = new BrainLoop({ brainEnabled: false });
      const result = await disabled.run('test goal', { key: 'val' });

      expect(result.success).toBe(true);
    });

    it('should perform pre-decision, run, and post-decision when brain enabled', async () => {
      brainLoop.llmAdapter = {};
      const result = await brainLoop.run('test goal', { key: 'val' });

      expect(result.brain).toBeDefined();
      expect(result.brain.preDecision).toBeDefined();
      expect(result.brain.postDecision).toBeDefined();
      expect(result.brain.duration).toBeGreaterThanOrEqual(0);
      expect(result.brain.status).toEqual({ active: true, mode: 'thinking' });
      expect(result.success).toBe(true);
    });

    it('should attach brain analysis to result', async () => {
      const result = await brainLoop.run('goal');

      expect(result.brain.preDecision).toEqual(
        mockBrainInstance.thinkComplete('goal', expect.any(Object))
      );
      expect(result.brain.postDecision.success).toBe(true);
    });
  });

  describe('_preDecision', () => {
    it('should return null when brain is disabled', () => {
      const bl = new BrainLoop({ brainEnabled: false });
      expect(bl._preDecision('goal')).toBeNull();
    });

    it('should call thinkComplete on brain', () => {
      brainLoop._preDecision('test goal');

      expect(mockBrainInstance.thinkComplete).toHaveBeenCalledWith('test goal', {
        metaQuestions: true,
        perspectives: true,
        questioning: true,
        reverse: true,
        tools: true,
        lessons: true
      });
    });

    it('should record pre-decision in history', () => {
      brainLoop._preDecision('goal');

      expect(brainLoop._brainHistory.length).toBe(1);
      expect(brainLoop._brainHistory[0].type).toBe('pre');
      expect(brainLoop._brainHistory[0].goal).toBe('goal');
      expect(brainLoop._brainHistory[0].metaQuestions).toBeDefined();
    });

    it('should inject brain context when autoThink and llmAdapter are set', () => {
      const injectSpy = jest.spyOn(brainLoop, '_injectBrainContext');
      brainLoop.llmAdapter = {};
      brainLoop._preDecision('goal');

      expect(injectSpy).toHaveBeenCalled();
    });

    it('should not inject context when autoThink is false', () => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const bl = new BrainLoop({ brainAutoThink: false });
      bl.llmAdapter = {};
      const injectSpy = jest.spyOn(bl, '_injectBrainContext');

      bl._preDecision('goal');
      expect(injectSpy).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and return null', () => {
      mockBrainInstance.thinkComplete = jest.fn(() => {
        throw new Error('brain error');
      });

      const result = brainLoop._preDecision('goal');
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        '[BrainLoop] Pre-decision brain error:', 'brain error'
      );
    });
  });

  describe('_postDecision', () => {
    it('should return null when brain is disabled', () => {
      const bl = new BrainLoop({ brainEnabled: false });
      expect(bl._postDecision('goal', { success: true })).toBeNull();
    });

    it('should call learnFromResult with success', () => {
      const result = { success: true, result: 'ok' };
      brainLoop._postDecision('goal', result);

      expect(mockBrainInstance.learnFromResult).toHaveBeenCalledWith(
        'goal', 'AgentLoop.run', 'ok', true
      );
    });

    it('should call learnFromResult with error on failure', () => {
      const result = { success: false, error: 'fail' };
      brainLoop._postDecision('goal', result);

      expect(mockBrainInstance.learnFromResult).toHaveBeenCalledWith(
        'goal', 'AgentLoop.run', 'fail', false
      );
    });

    it('should record post-decision in history', () => {
      brainLoop._postDecision('goal', { success: true });

      expect(brainLoop._brainHistory.length).toBe(1);
      expect(brainLoop._brainHistory[0].type).toBe('post');
      expect(brainLoop._brainHistory[0].success).toBe(true);
    });

    it('should handle errors gracefully and return null', () => {
      mockBrainInstance.learnFromResult = jest.fn(() => {
        throw new Error('post error');
      });

      const result = brainLoop._postDecision('goal', { success: true });
      expect(result).toBeNull();
    });
  });

  describe('_injectBrainContext', () => {
    it('should initialize _llmContext if not set', () => {
      brainLoop._llmContext = undefined;
      brainLoop._injectBrainContext({
        metaQuestions: { questions: { questions: [{ question: 'What?' }] } },
        perspectives: { tech: 'view' },
        questions: { questions: ['Q1', 'Q2', 'Q3'] },
        lessons: [{ lesson: 'Lesson A' }]
      });

      expect(brainLoop._llmContext).toContain('AI大脑分析');
      expect(brainLoop._llmContext).toContain('What?');
      expect(brainLoop._llmContext).toContain('tech');
      expect(brainLoop._llmContext).toContain('Q1');
      expect(brainLoop._llmContext).toContain('Lesson A');
    });

    it('should replace _llmContext with brain analysis', () => {
      brainLoop._llmContext = 'existing';
      brainLoop._injectBrainContext({
        lessons: [{ lesson: 'Remember Y' }]
      });

      expect(brainLoop._llmContext).not.toContain('existing');
      expect(brainLoop._llmContext).toContain('Remember Y');
      expect(brainLoop._llmContext).toContain('AI大脑分析');
    });

    it('should handle empty brain result gracefully', () => {
      brainLoop._llmContext = '';
      brainLoop._injectBrainContext({});

      expect(brainLoop._llmContext).toBe('');
    });

    it('should handle sections with empty arrays by including headers', () => {
      brainLoop._llmContext = '';
      brainLoop._injectBrainContext({
        metaQuestions: { questions: { questions: [] } },
        perspectives: {},
        lessons: []
      });

      expect(brainLoop._llmContext).toContain('AI大脑分析');
      expect(brainLoop._llmContext).toContain('决策前自问');
      expect(brainLoop._llmContext).toContain('多角度思考');
    });
  });

  describe('query methods', () => {
    it('getBrainHistory should return history array', () => {
      brainLoop._brainHistory.push('entry');
      expect(brainLoop.getBrainHistory()).toEqual(['entry']);
    });

    it('getReport should include brain, history and stats', () => {
      const report = brainLoop.getReport();
      expect(report.brain).toEqual({ report: 'brain report' });
      expect(report.brainHistory).toEqual([]);
      expect(report.loopStats).toEqual({ loops: 2, tasks: 3 });
    });
  });

  describe('analyze', () => {
    it('should call brain.thinkComplete', async () => {
      const result = await brainLoop.analyze('problem');
      expect(mockBrainInstance.thinkComplete).toHaveBeenCalledWith('problem');
      expect(result).toBeDefined();
    });

    it('should return error when brain disabled', async () => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const disabled = new BrainLoop({ brainEnabled: false });
      const result = await disabled.analyze('problem');
      expect(result).toEqual({ error: 'Brain not enabled' });
    });
  });

  describe('reverseThink', () => {
    it('should call brain.reverseThink', async () => {
      const result = await brainLoop.reverseThink('goal');
      expect(mockBrainInstance.reverseThink).toHaveBeenCalledWith('goal');
      expect(result).toEqual({ reversed: true });
    });

    it('should return error when brain disabled', async () => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const disabled = new BrainLoop({ brainEnabled: false });
      const result = await disabled.reverseThink('goal');
      expect(result).toEqual({ error: 'Brain not enabled' });
    });
  });

  describe('getLessons', () => {
    it('should call brain.getLessonSuggestions', async () => {
      const result = await brainLoop.getLessons('ctx');
      expect(mockBrainInstance.getLessonSuggestions).toHaveBeenCalledWith('ctx');
      expect(result).toEqual(['lesson1', 'lesson2']);
    });

    it('should return empty array when brain disabled', async () => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const disabled = new BrainLoop({ brainEnabled: false });
      const result = await disabled.getLessons('ctx');
      expect(result).toEqual([]);
    });
  });

  describe('run verbose', () => {
    it('should log verbose brain analysis when brainVerbose is true', async () => {
      console.log.mockClear();
      const verbose = new BrainLoop({ brainVerbose: true });
      verbose.llmAdapter = {};
      await verbose.run('test goal');
      expect(console.log).toHaveBeenCalledWith(
        '[BrainLoop] 决策前大脑分析:',
        expect.objectContaining({
          questionsCount: expect.any(Number),
          perspectives: expect.any(Number)
        })
      );
    });

    it('should use fallback values when preDecision returns null in verbose mode', async () => {
      jest.restoreAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const verbose = new BrainLoop({ brainVerbose: true });
      jest.spyOn(verbose, '_preDecision').mockReturnValue(null);
      verbose.llmAdapter = {};
      await verbose.run('test goal');
      expect(console.log).toHaveBeenCalledWith(
        '[BrainLoop] 决策前大脑分析:',
        { questionsCount: 0, perspectives: 0 }
      );
    });
  });

  describe('shutdown edge cases', () => {
    it('should handle missing cleanup method', async () => {
      brainLoop.cleanup = undefined;
      await brainLoop.shutdown();
      expect(brainLoop._isShuttingDown).toBe(true);
    });
  });

  describe('_injectBrainContext edge cases', () => {
    it('should use problem field when lesson field is missing', () => {
      brainLoop._llmContext = '';
      brainLoop._injectBrainContext({
        lessons: [{ problem: 'some problem' }]
      });
      expect(brainLoop._llmContext).toContain('some problem');
    });

    it('should not add lessons section when lessons is empty array', () => {
      brainLoop._llmContext = '';
      brainLoop._injectBrainContext({ lessons: [] });
      expect(brainLoop._llmContext).toBe('');
    });
  });
});
