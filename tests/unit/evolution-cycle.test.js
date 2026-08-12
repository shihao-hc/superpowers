const EvolutionCycle = require('../../src/utils/EvolutionCycle');

describe('EvolutionCycle (direct singleton)', () => {
  function makeMockBrain() {
    return {
      lessonLibrary: { getStats: jest.fn(() => ({ total: 0, applied: 0 })) },
      state: { decisionCount: 0 },
      evolution: { getStats: jest.fn(() => ({ recentLearnings: [{ id: 1 }] })), learn: jest.fn() },
      _selfMonitor: jest.fn(() => ({ summary: { status: 'ok' } })),
      predictIssues: jest.fn(() => ({ risks: [], opportunities: [] })),
      generateActionPlan: jest.fn(() => ({ actions: [], autoExecuted: [] })),
      evolutionLoop: null,
      _runEvolutionCycle: jest.fn(() => ({}))
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('predictIssues', () => {
    it('returns empty predictions for clean state', () => {
      const bs = makeMockBrain();
      const result = EvolutionCycle.predictIssues(bs);
      expect(result).toEqual({ risks: [], opportunities: [] });
    });

    it('adds low-lesson-usage risk when lesson usage is low', () => {
      const bs = makeMockBrain();
      bs.lessonLibrary.getStats.mockReturnValue({ total: 20, applied: 3 });
      const result = EvolutionCycle.predictIssues(bs);
      expect(result.risks.some((r) => r.type === 'low-lesson-usage')).toBe(true);
    });

    it('adds pattern-extraction opportunity when decisionCount is high', () => {
      const bs = makeMockBrain();
      bs.state.decisionCount = 30;
      const result = EvolutionCycle.predictIssues(bs);
      expect(result.opportunities.some((o) => o.type === 'pattern-extraction')).toBe(true);
    });

    it('adds no-learning risk when recentLearnings is empty', () => {
      const bs = makeMockBrain();
      bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
      const result = EvolutionCycle.predictIssues(bs);
      expect(result.risks.some((r) => r.type === 'no-learning')).toBe(true);
    });
  });

  describe('startEvolutionLoop', () => {
    it('starts the loop and runs an initial cycle', () => {
      jest.useFakeTimers();
      const bs = makeMockBrain();
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      EvolutionCycle.startEvolutionLoop(bs, 5000);
      expect(bs.evolutionLoop).toBeDefined();
      expect(bs._runEvolutionCycle).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('已启动'));

      jest.advanceTimersByTime(5000);
      expect(bs._runEvolutionCycle).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
      clearInterval(bs.evolutionLoop);
      logSpy.mockRestore();
    });

    it('uses default interval when not provided', () => {
      jest.useFakeTimers();
      const bs = makeMockBrain();
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      EvolutionCycle.startEvolutionLoop(bs);
      expect(bs.evolutionLoop).toBeDefined();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('300000'));

      jest.useRealTimers();
      clearInterval(bs.evolutionLoop);
      logSpy.mockRestore();
    });

    it('returns early when loop already running', () => {
      const bs = makeMockBrain();
      bs.evolutionLoop = { id: 'existing' };
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      EvolutionCycle.startEvolutionLoop(bs, 1000);
      expect(logSpy).toHaveBeenCalledWith('[BrainSystem] 进化循环已在运行');
      expect(bs._runEvolutionCycle).not.toHaveBeenCalled();

      logSpy.mockRestore();
    });
  });

  describe('stopEvolutionLoop', () => {
    it('stops and clears the loop when running', () => {
      jest.useFakeTimers();
      const bs = makeMockBrain();
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      EvolutionCycle.startEvolutionLoop(bs, 5000);
      expect(bs.evolutionLoop).toBeDefined();

      EvolutionCycle.stopEvolutionLoop(bs);
      expect(bs.evolutionLoop).toBeNull();
      expect(logSpy).toHaveBeenCalledWith('[BrainSystem] 进化循环已停止');

      jest.useRealTimers();
      logSpy.mockRestore();
    });

    it('does nothing when no loop is running', () => {
      const bs = makeMockBrain();
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      EvolutionCycle.stopEvolutionLoop(bs);
      expect(bs.evolutionLoop).toBeNull();
      expect(logSpy).not.toHaveBeenCalledWith('[BrainSystem] 进化循环已停止');

      logSpy.mockRestore();
    });
  });

  describe('_runEvolutionCycle', () => {
    it('runs a full cycle and records steps', () => {
      const bs = makeMockBrain();
      bs.predictIssues.mockReturnValue({ risks: [{ type: 'x' }], opportunities: [] });
      bs.generateActionPlan.mockReturnValue({
        actions: [{ name: 'a1' }],
        autoExecuted: [{ action: 'a1', result: { success: true } }]
      });
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const cycle = EvolutionCycle._runEvolutionCycle(bs);

      expect(cycle.steps.map((s) => s.step)).toEqual(['monitor', 'predict', 'plan', 'complete']);
      expect(bs._selfMonitor).toHaveBeenCalled();
      expect(bs.predictIssues).toHaveBeenCalled();
      expect(bs.generateActionPlan).toHaveBeenCalled();
      expect(bs.evolution.learn).toHaveBeenCalledWith('evolution-cycle', 'complete', expect.any(Object));
      expect(cycle.duration).toBeGreaterThanOrEqual(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✓ a1: 成功'));

      logSpy.mockRestore();
    });

    it('logs failed auto-executed actions', () => {
      const bs = makeMockBrain();
      bs.generateActionPlan.mockReturnValue({
        actions: [],
        autoExecuted: [{ action: 'a1', result: { success: false } }]
      });
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      EvolutionCycle._runEvolutionCycle(bs);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✓ a1: 失败'));

      logSpy.mockRestore();
    });
  });
});
