describe('ThinkingEngine', () => {
  let ThinkingEngine;
  let engine;
  let bs;

  beforeAll(() => {
    ThinkingEngine = require('../../src/utils/ThinkingEngine');
  });

  beforeEach(() => {
    bs = {
      config: { enableReverseThinking: true, enableAutoEvolution: true },
      metaCognition: {
        check: jest.fn().mockReturnValue({ status: 'ok', confidence: 0.8 })
      },
      thinking: {
        multiAngle: jest.fn().mockReturnValue({ normal: 'analysis' })
      },
      reverseThinking: {
        analyze: jest.fn().mockReturnValue({ reverse: 'analysis' })
      },
      evolution: { recordProblemSolution: jest.fn() },
      selfLearning: {}
    };
    engine = new ThinkingEngine(bs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('solve', () => {
    it('returns solution for string problem', () => {
      const result = engine.solve('how to fix bug');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('executionTime');
      expect(result.perspectives).toContain('normal');
    });

    it('includes reverse perspective when enabled', () => {
      const result = engine.solve('how to fix bug');
      expect(result.perspectives).toContain('reverse');
    });

    it('skips reverse perspective when disabled', () => {
      bs.config.enableReverseThinking = false;
      const result = engine.solve('how to fix bug');
      expect(result.perspectives).not.toContain('reverse');
    });

    it('calls metaCognition.check', () => {
      engine.solve('problem');
      expect(bs.metaCognition.check).toHaveBeenCalledWith('problem');
    });

    it('calls evolution.recordProblemSolution when enabled', () => {
      engine.solve({ description: 'complex problem' });
      expect(bs.evolution.recordProblemSolution).toHaveBeenCalled();
    });

    it('skips evolution when selfLearning is null', () => {
      bs.selfLearning = null;
      engine.solve('problem');
      expect(bs.evolution.recordProblemSolution).not.toHaveBeenCalled();
    });
  });
});
