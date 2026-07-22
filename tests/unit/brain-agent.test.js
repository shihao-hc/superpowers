'use strict';

jest.mock('../../src/core/SelfLearningSystem');
const SelfLearningSystem = require('../../src/core/SelfLearningSystem');
const BrainAgent = require('../../src/agent/BrainAgent');

function createMockBrain() {
  return {
    beforeDecision: jest.fn().mockReturnValue({ questions: ['q1'], skip: false }),
    afterDecision: jest.fn().mockReturnValue({ improvements: ['imp1'], skip: false }),
    getBrainStatus: jest.fn().mockReturnValue({ enabled: true, lessons: 5, mode: 'active' }),
    brain: {
      thinking: {
        multiAngle: jest.fn().mockReturnValue({ technical: 't', business: 'b', risk: 'r', user: 'u' }),
        question: jest.fn().mockReturnValue({ questions: ['why'], alternatives: ['alt1'] }),
        causalChain: jest.fn().mockReturnValue({ chain: ['cause', 'effect'] }),
        firstPrinciples: jest.fn().mockReturnValue({ principles: ['p1'] }),
        associate: jest.fn().mockReturnValue({ associations: ['a1'] })
      },
      reverseThinking: {
        analyze: jest.fn().mockReturnValue({ risks: ['risk1'] }),
        orangePractice: jest.fn().mockReturnValue({ result: 'orange' })
      },
      tools: {
        suggestTools: jest.fn().mockReturnValue({ tools: ['tool1'] })
      },
      getLessonSuggestions: jest.fn().mockReturnValue([{ lesson: 'lesson1' }]),
      addLesson: jest.fn().mockReturnValue({ added: true }),
      getLessonStats: jest.fn().mockReturnValue({ total: 5, active: 3 }),
      evolution: {
        getStats: jest.fn().mockReturnValue({ cycles: 10, improvements: 3 })
      }
    }
  };
}

describe('BrainAgent', () => {
  let agent;
  let mockBrain;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBrain = createMockBrain();
    SelfLearningSystem.mockImplementation(() => mockBrain);
    agent = new BrainAgent();
  });

  describe('constructor', () => {
    it('should set default config values', () => {
      expect(agent.config.enableMetaCognition).toBe(true);
      expect(agent.config.enableThinking).toBe(true);
      expect(agent.config.enableReverseThinking).toBe(true);
      expect(agent.config.enableEvolution).toBe(true);
      expect(agent.config.enableTools).toBe(true);
      expect(agent.config.maxReflectionDepth).toBe(3);
      expect(agent.config.verbose).toBe(false);
      expect(agent._history).toEqual([]);
      expect(SelfLearningSystem).toHaveBeenCalledWith({ enabled: true });
    });

    it('should accept custom options', () => {
      const custom = new BrainAgent({
        enableMetaCognition: false,
        enableThinking: false,
        enableReverseThinking: false,
        enableEvolution: false,
        enableTools: false,
        maxReflectionDepth: 7,
        verbose: true,
        enabled: false
      });

      expect(custom.config.enableMetaCognition).toBe(false);
      expect(custom.config.enableThinking).toBe(false);
      expect(custom.config.enableReverseThinking).toBe(false);
      expect(custom.config.enableEvolution).toBe(false);
      expect(custom.config.enableTools).toBe(false);
      expect(custom.config.maxReflectionDepth).toBe(7);
      expect(custom.config.verbose).toBe(true);
      expect(SelfLearningSystem).toHaveBeenCalledWith({ enabled: false });
    });

    it('should respect env vars for maxReflectionDepth and verbose', () => {
      process.env.BRAIN_MAX_REFLECTION_DEPTH = '9';
      process.env.BRAIN_VERBOSE = 'true';
      const envAgent = new BrainAgent();
      expect(envAgent.config.maxReflectionDepth).toBe(9);
      expect(envAgent.config.verbose).toBe(true);
      delete process.env.BRAIN_MAX_REFLECTION_DEPTH;
      delete process.env.BRAIN_VERBOSE;
    });

    it('should prefer env var over option for maxReflectionDepth', () => {
      process.env.BRAIN_MAX_REFLECTION_DEPTH = '9';
      const envAgent = new BrainAgent({ maxReflectionDepth: 3 });
      expect(envAgent.config.maxReflectionDepth).toBe(9);
      delete process.env.BRAIN_MAX_REFLECTION_DEPTH;
    });
  });

  describe('beforeDecision', () => {
    it('should call brain.beforeDecision when enabled', () => {
      const result = agent.beforeDecision('test context');
      expect(mockBrain.beforeDecision).toHaveBeenCalledWith('test context');
      expect(result).toEqual({ questions: ['q1'], skip: false });
    });

    it('should skip when metaCognition is disabled', () => {
      const disabled = new BrainAgent({ enableMetaCognition: false });
      const result = disabled.beforeDecision('test');
      expect(result).toEqual({ skip: true, reason: 'MetaCognition disabled' });
      expect(mockBrain.beforeDecision).not.toHaveBeenCalled();
    });

    it('should add to history', () => {
      agent.beforeDecision('ctx');
      expect(agent._history).toHaveLength(1);
      expect(agent._history[0].type).toBe('beforeDecision');
    });
  });

  describe('afterDecision', () => {
    it('should call brain.afterDecision when enabled', () => {
      const result = agent.afterDecision('ctx', { success: true }, 'action');
      expect(mockBrain.afterDecision).toHaveBeenCalledWith('ctx', { success: true }, 'action');
      expect(result).toEqual({ improvements: ['imp1'], skip: false });
    });

    it('should skip when evolution is disabled', () => {
      const disabled = new BrainAgent({ enableEvolution: false });
      const result = disabled.afterDecision('ctx', {}, 'action');
      expect(result).toEqual({ skip: true, reason: 'Evolution disabled' });
    });
  });

  describe('analyze', () => {
    it('should call brain multiAngle when thinking enabled', () => {
      const result = agent.analyze('problem');
      expect(mockBrain.brain.thinking.multiAngle).toHaveBeenCalledWith('problem');
      expect(result).toEqual({ technical: 't', business: 'b', risk: 'r', user: 'u' });
    });

    it('should skip when thinking disabled', () => {
      const disabled = new BrainAgent({ enableThinking: false });
      const result = disabled.analyze('problem');
      expect(result).toEqual({ skip: true, reason: 'Thinking disabled' });
    });
  });

  describe('question', () => {
    it('should call brain.question when thinking enabled', () => {
      const result = agent.question('assumption');
      expect(mockBrain.brain.thinking.question).toHaveBeenCalledWith('assumption');
      expect(result).toEqual({ questions: ['why'], alternatives: ['alt1'] });
    });

    it('should skip when thinking disabled', () => {
      const disabled = new BrainAgent({ enableThinking: false });
      const result = disabled.question('assumption');
      expect(result).toEqual({ skip: true, reason: 'Thinking disabled' });
    });
  });

  describe('reverseThink', () => {
    it('should call brain reverseThink when enabled', () => {
      const result = agent.reverseThink('goal');
      expect(mockBrain.brain.reverseThinking.analyze).toHaveBeenCalledWith({ description: 'goal' });
      expect(result).toEqual({ risks: ['risk1'] });
    });

    it('should skip when reverseThinking disabled', () => {
      const disabled = new BrainAgent({ enableReverseThinking: false });
      const result = disabled.reverseThink('goal');
      expect(result).toEqual({ skip: true, reason: 'ReverseThinking disabled' });
    });
  });

  describe('orangePractice', () => {
    it('should call brain.orangePractice when enabled', () => {
      const result = agent.orangePractice('statement');
      expect(mockBrain.brain.reverseThinking.orangePractice).toHaveBeenCalledWith('statement');
      expect(result).toEqual({ result: 'orange' });
    });

    it('should skip when reverseThinking disabled', () => {
      const disabled = new BrainAgent({ enableReverseThinking: false });
      const result = disabled.orangePractice('statement');
      expect(result).toEqual({ skip: true, reason: 'ReverseThinking disabled' });
    });
  });

  describe('causalChain', () => {
    it('should call brain.causalChain when thinking enabled', () => {
      const result = agent.causalChain('event');
      expect(mockBrain.brain.thinking.causalChain).toHaveBeenCalledWith('event');
      expect(result).toEqual({ chain: ['cause', 'effect'] });
    });

    it('should skip when thinking disabled', () => {
      const disabled = new BrainAgent({ enableThinking: false });
      const result = disabled.causalChain('event');
      expect(result).toEqual({ skip: true, reason: 'Thinking disabled' });
    });
  });

  describe('firstPrinciples', () => {
    it('should call brain.firstPrinciples when thinking enabled', () => {
      const result = agent.firstPrinciples('subject');
      expect(mockBrain.brain.thinking.firstPrinciples).toHaveBeenCalledWith('subject');
      expect(result).toEqual({ principles: ['p1'] });
    });

    it('should skip when thinking disabled', () => {
      const disabled = new BrainAgent({ enableThinking: false });
      const result = disabled.firstPrinciples('subject');
      expect(result).toEqual({ skip: true, reason: 'Thinking disabled' });
    });
  });

  describe('associate', () => {
    it('should call brain.associate when thinking enabled', () => {
      const result = agent.associate('concept');
      expect(mockBrain.brain.thinking.associate).toHaveBeenCalledWith('concept');
      expect(result).toEqual({ associations: ['a1'] });
    });

    it('should skip when thinking disabled', () => {
      const disabled = new BrainAgent({ enableThinking: false });
      const result = disabled.associate('concept');
      expect(result).toEqual({ skip: true, reason: 'Thinking disabled' });
    });
  });

  describe('suggestTools', () => {
    it('should call brain.suggestTools when tools enabled', () => {
      const result = agent.suggestTools('task');
      expect(mockBrain.brain.tools.suggestTools).toHaveBeenCalledWith('task');
      expect(result).toEqual({ tools: ['tool1'] });
    });

    it('should skip when tools disabled', () => {
      const disabled = new BrainAgent({ enableTools: false });
      const result = disabled.suggestTools('task');
      expect(result).toEqual({ skip: true, reason: 'Tools disabled' });
    });
  });

  describe('getLessonSuggestions', () => {
    it('should return lesson suggestions', () => {
      const result = agent.getLessonSuggestions('context');
      expect(mockBrain.brain.getLessonSuggestions).toHaveBeenCalledWith('context');
      expect(result).toEqual([{ lesson: 'lesson1' }]);
    });
  });

  describe('addLesson', () => {
    it('should add a lesson', () => {
      const lesson = { type: 'test', content: 'test lesson' };
      const result = agent.addLesson(lesson);
      expect(mockBrain.brain.addLesson).toHaveBeenCalledWith(lesson);
      expect(result).toEqual({ added: true });
    });
  });

  describe('getStatus', () => {
    it('should return brain status', () => {
      const result = agent.getStatus();
      expect(mockBrain.getBrainStatus).toHaveBeenCalled();
      expect(result).toEqual({ enabled: true, lessons: 5, mode: 'active' });
    });
  });

  describe('getEvolutionStats', () => {
    it('should return evolution stats', () => {
      const result = agent.getEvolutionStats();
      expect(mockBrain.brain.evolution.getStats).toHaveBeenCalled();
      expect(result).toEqual({ cycles: 10, improvements: 3 });
    });
  });

  describe('getLessonStats', () => {
    it('should return lesson stats', () => {
      const result = agent.getLessonStats();
      expect(mockBrain.brain.getLessonStats).toHaveBeenCalled();
      expect(result).toEqual({ total: 5, active: 3 });
    });
  });

  describe('thinkComplete', () => {
    it('should run all thinking stages by default', () => {
      const result = agent.thinkComplete('problem');
      expect(result.metaQuestions).toBeDefined();
      expect(result.perspectives).toBeDefined();
      expect(result.questions).toBeDefined();
      expect(result.reverseAnalysis).toBeDefined();
      expect(result.tools).toBeDefined();
      expect(result.lessons).toBeDefined();
      expect(mockBrain.beforeDecision).toHaveBeenCalled();
      expect(mockBrain.brain.thinking.multiAngle).toHaveBeenCalled();
      expect(mockBrain.brain.thinking.question).toHaveBeenCalled();
      expect(mockBrain.brain.reverseThinking.analyze).toHaveBeenCalled();
      expect(mockBrain.brain.tools.suggestTools).toHaveBeenCalled();
      expect(mockBrain.brain.getLessonSuggestions).toHaveBeenCalled();
    });

    it('should skip stages when options set to false', () => {
      const result = agent.thinkComplete('problem', {
        metaQuestions: false,
        perspectives: false,
        questioning: false,
        reverse: false,
        tools: false,
        lessons: false
      });
      expect(result.metaQuestions).toBeNull();
      expect(result.perspectives).toBeNull();
      expect(result.questions).toBeNull();
      expect(result.reverseAnalysis).toBeNull();
      expect(result.tools).toBeNull();
      expect(result.lessons).toBeNull();
    });
  });

  describe('learnFromResult', () => {
    it('should call afterDecision and add lesson on failure', () => {
      const afterSpy = jest.spyOn(agent, 'afterDecision');
      const addSpy = jest.spyOn(agent, 'addLesson');

      agent.learnFromResult('problem', 'action', 'error result', false);

      expect(afterSpy).toHaveBeenCalledWith('problem', { success: false, result: 'error result' }, 'action');
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'failure',
        problem: 'problem',
        action: 'action',
        improvement: '待分析'
      }));
    });

    it('should not add lesson on success', () => {
      const addSpy = jest.spyOn(agent, 'addLesson');
      agent.learnFromResult('problem', 'action', 'good result', true);
      expect(addSpy).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('should return history array', () => {
      agent.beforeDecision('ctx');
      agent.analyze('problem');
      const history = agent.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('beforeDecision');
      expect(history[1].type).toBe('analyze');
    });
  });

  describe('exportReport', () => {
    it('should return a full report', () => {
      agent.beforeDecision('ctx');
      const report = agent.exportReport();
      expect(report.status).toEqual({ enabled: true, lessons: 5, mode: 'active' });
      expect(report.evolution).toEqual({ cycles: 10, improvements: 3 });
      expect(report.lessons).toEqual({ total: 5, active: 3 });
      expect(report.history).toHaveLength(1);
    });
  });

  describe('verbose logging', () => {
    it('should log to console when verbose is true', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const verbose = new BrainAgent({ verbose: true });
      verbose.beforeDecision('test');
      expect(console.log).toHaveBeenCalledWith(
        '[BrainAgent:beforeDecision]',
        expect.any(Object)
      );
      logSpy.mockRestore();
    });

    it('should handle non-string input in verbose logging', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const verbose = new BrainAgent({ verbose: true });
      verbose.beforeDecision({ complex: true, data: [1, 2, 3] });
      expect(console.log).toHaveBeenCalledWith(
        '[BrainAgent:beforeDecision]',
        expect.objectContaining({
          input: { complex: true, data: [1, 2, 3] }
        })
      );
      logSpy.mockRestore();
    });

    it('should handle non-object output in verbose logging', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const verbose = new BrainAgent({ verbose: true });
      mockBrain.beforeDecision.mockReturnValueOnce('just a string');
      verbose.beforeDecision('test');
      expect(console.log).toHaveBeenCalledWith(
        '[BrainAgent:beforeDecision]',
        expect.objectContaining({
          output: 'just a string'
        })
      );
      logSpy.mockRestore();
    });
  });
});
