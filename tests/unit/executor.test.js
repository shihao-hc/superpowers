const Executor = require('../../src/core/Executor');

function createMockBrain() {
  return {
    metaCognition: {
      check: jest.fn().mockReturnValue({ confidence: 0.8, warning: null })
    },
    searchLessons: jest.fn().mockReturnValue([]),
    thinking: {
      multiAngle: jest.fn().mockReturnValue({ technical: {}, business: {} })
    },
    afterDecision: jest.fn(),
    addLesson: jest.fn()
  };
}

describe('Executor', () => {
  let executor;

  beforeEach(() => {
    executor = new Executor(createMockBrain());
  });

  describe('constructor', () => {
    it('initializes with 5 strategies', () => {
      expect(Object.keys(executor.strategies)).toEqual([
        'explore', 'analyze', 'implement', 'test', 'review'
      ]);
    });
  });

  describe('_extractKeywords', () => {
    it('extracts words longer than 3 chars', () => {
      expect(executor._extractKeywords('fix the bug')).toEqual([]);
      expect(executor._extractKeywords('implement new feature test')).toEqual(['implement', 'feature', 'test']);
    });

    it('returns at most 5 keywords', () => {
      const text = 'a b c d e f g h i j k l m n o p q r s t u v w x y z';
      expect(executor._extractKeywords(text).length).toBeLessThanOrEqual(5);
    });
  });

  describe('_perceive', () => {
    it('falls back to task object when description is missing', async () => {
      await expect(executor._perceive({})).rejects.toThrow();
    });
  });

  describe('_classifyTask', () => {
    it('classifies exploration tasks', () => {
      expect(executor._classifyTask('搜索资料')).toBe('exploration');
      expect(executor._classifyTask('find solution')).toBe('exploration');
    });

    it('classifies implementation tasks', () => {
      expect(executor._classifyTask('实现功能')).toBe('implementation');
      expect(executor._classifyTask('build feature')).toBe('implementation');
    });

    it('classifies analysis tasks', () => {
      expect(executor._classifyTask('分析问题')).toBe('analysis');
      expect(executor._classifyTask('test module')).toBe('analysis');
    });

    it('classifies problem solving tasks', () => {
      expect(executor._classifyTask('修复bug')).toBe('problem-solving');
    });

    it('defaults to general', () => {
      expect(executor._classifyTask('hello')).toBe('general');
    });
  });

  describe('_estimateComplexity', () => {
    it('returns simple for short text', () => {
      expect(executor._estimateComplexity('hi')).toBe('simple');
    });

    it('returns medium for moderate text', () => {
      const text = 'medium complexity task '.repeat(6);
      expect(executor._estimateComplexity(text)).toBe('medium');
    });

    it('returns complex for long text', () => {
      const text = 'complex task for testing purposes '.repeat(10);
      expect(executor._estimateComplexity(text)).toBe('complex');
    });
  });

  describe('strategies', () => {
    it('explore strategy returns complete on conclude', async () => {
      const result = await executor._exploreStrategy('conclude');
      expect(result.complete).toBe(true);
    });

    it('analyze strategy returns complete on deduce', async () => {
      const result = await executor._analyzeStrategy('deduce');
      expect(result.complete).toBe(true);
    });

    it('implement strategy returns complete on verify', async () => {
      const result = await executor._implementStrategy('verify');
      expect(result.complete).toBe(true);
    });

    it('review strategy always completes', async () => {
      const result = await executor._reviewStrategy('anything');
      expect(result.complete).toBe(true);
    });
  });

  describe('_record', () => {
    it('records execution and caps at maxHistory', () => {
      executor.maxHistory = 2;
      for (let i = 0; i < 5; i++) executor._record({ id: `e${i}` });
      expect(executor.executionHistory).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('returns zero stats initially', () => {
      const stats = executor.getStats();
      expect(stats.total).toBe(0);
      expect(stats.success).toBe(0);
    });

    it('calculates success rate', () => {
      executor.executionHistory.push({ success: true, duration: 100 });
      executor.executionHistory.push({ success: false, duration: 200 });
      const stats = executor.getStats();
      expect(stats.total).toBe(2);
      expect(stats.success).toBe(1);
      expect(stats.successRate).toBe('50%');
    });
  });

  describe('execute', () => {
    it('completes a full execution cycle', async () => {
      const result = await executor.execute('分析问题');
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(4);
      expect(result.steps[0].step).toBe('perception');
      expect(result.steps[1].step).toBe('thinking');
      expect(result.steps[2].step).toBe('action');
      expect(result.steps[3].step).toBe('feedback');
    });

    it('handles string input', async () => {
      const result = await executor.execute('实现功能');
      expect(result.success).toBe(true);
    });

    it('records to execution history', async () => {
      await executor.execute('test');
      expect(executor.executionHistory).toHaveLength(1);
    });

    it('handles object task with description', async () => {
      const result = await executor.execute({ description: '分析问题' });
      expect(result.task).toBe('分析问题');
      expect(result.success).toBe(true);
    });
  });

  describe('execute error handling', () => {
    it('captures errors during execution', async () => {
      const brain = createMockBrain();
      brain.afterDecision = jest.fn().mockImplementation(() => { throw new Error('feedback failed'); });
      const exec = new Executor(brain);
      const result = await exec.execute('测试');
      expect(result.success).toBe(false);
      expect(result.error).toBe('feedback failed');
    });
  });

  describe('_think', () => {
    it('selects explore strategy for exploration tasks', async () => {
      const result = await executor.execute('搜索新框架');
      expect(result.success).toBe(true);
    });

    it('falls to default strategy for unrecognized types', async () => {
      const result = await executor.execute('修复bug');
      expect(result.success).toBe(true);
    });

    it('works without brain.thinking', async () => {
      const brain = createMockBrain();
      delete brain.thinking;
      const exec = new Executor(brain);
      const result = await exec.execute('分析问题');
      expect(result.success).toBe(true);
    });
  });

  describe('_act', () => {
    it('handles strategy execution errors', async () => {
      executor.strategies.analyze = jest.fn().mockRejectedValue(new Error('strategy failed'));
      const result = await executor.execute('分析问题');
      expect(result.success).toBe(false);
      const actionStep = result.steps[2];
      expect(actionStep.executedSteps[0].success).toBe(false);
      expect(actionStep.executedSteps[0].error).toBe('strategy failed');
    });

    it('falls back to analyze strategy for unknown strategy', async () => {
      const result = await executor._act({ strategy: 'unknown', steps: ['test'] }, {});
      expect(result.executedSteps).toHaveLength(1);
      expect(result.executedSteps[0].result.result).toBe('分析完成: test');
    });
  });

  describe('_feedback', () => {
    it('handles zero executed steps', async () => {
      const result = await executor._feedback({ executedSteps: [], duration: 0 });
      expect(result.success).toBe(false);
      expect(result.stepsCompleted).toBe(0);
    });

    it('works without brain.afterDecision', async () => {
      const brain = createMockBrain();
      delete brain.afterDecision;
      const exec = new Executor(brain);
      const result = await exec._feedback({ executedSteps: [{ step: 'test', result: 'done', success: true }], duration: 100 });
      expect(result.success).toBe(true);
    });
  });

  describe('_improve', () => {
    it('creates lessons from successful feedback', async () => {
      const result = await executor._improve({
        task: 'test task',
        steps: [
          { step: 'perception', confidence: 0.8 },
          { step: 'thinking', strategy: 'analyze' },
          { step: 'action', executedSteps: [] },
          { step: 'feedback', result: { success: true, stepsCompleted: 3, duration: 100 } }
        ]
      });
      expect(result.lessonsAdded).toBe(1);
      expect(executor.brain.addLesson).toHaveBeenCalledTimes(1);
    });
  });

  describe('strategies', () => {
    it('test strategy returns complete on verify', async () => {
      expect((await executor._testStrategy('verify')).complete).toBe(true);
      expect((await executor._testStrategy('anything')).complete).toBe(false);
    });
  });

  describe('getStats', () => {
    it('handles entries without duration', () => {
      executor.executionHistory.push({ success: true });
      executor.executionHistory.push({ success: false });
      const stats = executor.getStats();
      expect(stats.avgDuration).toBe('0ms');
    });
  });
});
