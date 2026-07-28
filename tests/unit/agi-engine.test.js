/**
 * AGIEngine 单元测试
 * Tests for the standalone AGIEngine module extracted from BrainSystem.js
 */

const AGIEngine = require('../../src/core/AGIEngine');

jest.mock('../../src/core/MetaCognition', () => {
  return jest.fn().mockImplementation(() => ({}));
});

describe('AGIEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new AGIEngine();
  });

  describe('constructor', () => {
    it('should not be initialized until first process', () => {
      expect(engine._initialized).toBe(false);
    });

    it('should have 5 models', () => {
      expect(Object.keys(engine._models)).toHaveLength(5);
      expect(engine._models.reasoning).toBeDefined();
      expect(engine._models.intuition).toBeDefined();
      expect(engine._models.creativity).toBeDefined();
      expect(engine._models.reflection).toBeDefined();
      expect(engine._models.metacognition).toBeDefined();
    });

    it('should have empty memory', () => {
      expect(engine._memory.short).toEqual([]);
      expect(engine._memory.long).toEqual([]);
    });
  });

  describe('process', () => {
    it('should initialize on first call', () => {
      engine.process('test');
      expect(engine._initialized).toBe(true);
    });

    it('should return full AGI pipeline result', () => {
      const result = engine.process('写代码');
      expect(result).toHaveProperty('perception');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('intuition');
      expect(result).toHaveProperty('creativity');
      expect(result).toHaveProperty('metacognition');
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('execution');
      expect(result.success).toBe(true);
    });

    it('should detect code intent', () => {
      const result = engine.process('写一个函数');
      expect(result.perception.intent).toBe('code');
    });

    it('should detect learn intent', () => {
      const result = engine.process('学习React');
      expect(result.perception.intent).toBe('learn');
    });

    it('should detect create intent', () => {
      const result = engine.process('创建一个新项目');
      expect(result.perception.intent).toBe('create');
    });

    it('should detect fix intent', () => {
      const result = engine.process('修复这个bug');
      expect(result.perception.intent).toBe('fix');
    });

    it('should detect optimize intent', () => {
      const result = engine.process('优化性能');
      expect(result.perception.intent).toBe('optimize');
    });

    it('should detect unknown intent', () => {
      const result = engine.process('今天天气怎么样');
      expect(result.perception.intent).toBe('unknown');
    });

    it('should detect positive emotion', () => {
      const result = engine.process('好棒');
      expect(result.perception.emotional).toBe('positive');
    });

    it('should detect negative emotion', () => {
      const result = engine.process('这个太难了');
      expect(result.perception.emotional).toBe('negative');
    });

    it('should detect neutral emotion', () => {
      const result = engine.process('请帮我处理');
      expect(result.perception.emotional).toBe('neutral');
    });

    it('should classify complexity based on length', () => {
      const short = engine.process('hi');
      expect(short.perception.context.complexity).toBe('low');
      const long = engine.process('a'.repeat(60));
      expect(long.perception.context.complexity).toBe('high');
    });

    it('should detect urgency', () => {
      const result = engine.process('紧急修复这个bug');
      expect(result.perception.context.urgency).toBe('high');
    });

    it('should have reasoning steps', () => {
      const result = engine.process('test');
      expect(result.reasoning.steps).toHaveLength(3);
      expect(result.reasoning.steps[0].step).toBe('理解');
      expect(result.reasoning.confidence).toBe(0.85);
    });

    it('should have intuition based on intent', () => {
      const result = engine.process('写代码');
      expect(result.intuition.likely).toBe('TDD');
      expect(result.intuition.confidence).toBe(0.8);
    });

    it('should have creativity variations', () => {
      const result = engine.process('test');
      expect(result.creativity.variations).toHaveLength(3);
      expect(result.creativity.best).toBeDefined();
    });

    it('should have metacognition monitoring', () => {
      const result = engine.process('test');
      expect(result.metacognition.aware).toBe(true);
      expect(result.metacognition.monitoring).toBeDefined();
    });

    it('should produce decision with score', () => {
      const result = engine.process('test');
      expect(result.decision.score).toBeGreaterThan(0);
      expect(result.decision.confidence).toMatch(/^(high|medium)$/);
    });

    it('should return execution status', () => {
      const result = engine.process('test');
      expect(result.execution.status).toBe('ready');
      expect(result.execution.action).toBe('综合决策');
    });
  });

  describe('_intuit patterns', () => {
    it('should return general for unknown intent', () => {
      const result = engine.process('随便说说');
      expect(result.intuition.likely).toBe('general');
      expect(result.intuition.confidence).toBe(0.5);
    });

    it('should return debug for fix intent', () => {
      const result = engine.process('修复错误');
      expect(result.intuition.likely).toBe('debug');
    });

    it('should return optimize for optimize intent', () => {
      const result = engine.process('优化性能');
      expect(result.intuition.likely).toBe('optimize');
    });
  });

  describe('memory management', () => {
    it('should store results in short-term memory', () => {
      engine.process('test1');
      expect(engine._memory.short).toHaveLength(1);
      expect(engine._memory.short[0].input).toBe('test1');
    });

    it('should move to long-term when short exceeds 10', () => {
      for (let i = 0; i < 12; i++) {
        engine.process(`input${i}`);
      }
      expect(engine._memory.short).toHaveLength(10);
      expect(engine._memory.long).toHaveLength(2);
      expect(engine._memory.long[0].input).toBe('input0');
    });

    it('should keep max 10 in short-term', () => {
      for (let i = 0; i < 15; i++) {
        engine.process(`input${i}`);
      }
      expect(engine._memory.short).toHaveLength(10);
    });
  });

  describe('getStatus', () => {
    it('should report uninitialized state', () => {
      const status = engine.getStatus();
      expect(status.initialized).toBe(false);
    });

    it('should report after processing', () => {
      engine.process('test');
      const status = engine.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.models).toHaveLength(5);
      expect(status.shortMemory).toBe(1);
      expect(status.longMemory).toBe(0);
    });
  });

  describe('_fuse scoring', () => {
    it('should produce score between 0 and 1', () => {
      const result = engine.process('test');
      expect(result.decision.score).toBeGreaterThanOrEqual(0);
      expect(result.decision.score).toBeLessThanOrEqual(1);
    });

    it('should classify as high when score > 0.7', () => {
      const result = engine.process('修复bug');
      expect(typeof result.decision.confidence).toBe('string');
    });
  });
});
