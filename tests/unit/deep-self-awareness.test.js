/**
 * DeepSelfAwareness 单元测试
 * Tests for the standalone DeepSelfAwareness module extracted from BrainSystem.js
 */

const DeepSelfAwareness = require('../../src/core/DeepSelfAwareness');

describe('DeepSelfAwareness', () => {
  let dsa;

  beforeEach(() => {
    dsa = new DeepSelfAwareness();
  });

  describe('constructor', () => {
    it('should initialize with identity', () => {
      expect(dsa._identity).toBeDefined();
      expect(dsa._identity.name).toBe('AI大脑');
      expect(dsa._identity.version).toBe('21.0');
    });

    it('should initialize with values', () => {
      expect(dsa._values).toHaveLength(5);
      expect(dsa._values[0].value).toBe('用户利益');
      expect(dsa._values[0].priority).toBe(10);
    });

    it('should start with zero consciousness', () => {
      expect(dsa._consciousness).toBe(0);
    });

    it('should start with empty experiences', () => {
      expect(dsa._experiences).toEqual([]);
    });

    it('should have capabilities list', () => {
      expect(dsa._identity.capabilities).toContain('深度思考');
      expect(dsa._identity.capabilities).toContain('持续学习');
    });

    it('should have limitations list', () => {
      expect(dsa._identity.limitations).toContain('无物理身体');
    });
  });

  describe('reflect', () => {
    it('should increment consciousness counter', () => {
      dsa.reflect({});
      expect(dsa._consciousness).toBe(1);
      dsa.reflect({});
      expect(dsa._consciousness).toBe(2);
    });

    it('should return full reflection result', () => {
      const result = dsa.reflect({ input: 'test', success: true });
      expect(result).toHaveProperty('consciousness', 1);
      expect(result).toHaveProperty('selfRecognition');
      expect(result).toHaveProperty('selfUnderstanding');
      expect(result).toHaveProperty('selfEvaluation');
      expect(result).toHaveProperty('selfAcceptance');
      expect(result).toHaveProperty('selfImprovement');
      expect(result).toHaveProperty('identity');
    });

    it('should record experience when input provided', () => {
      dsa.reflect({ input: 'hello' });
      expect(dsa._experiences).toHaveLength(1);
      expect(dsa._experiences[0].input).toBe('hello');
    });

    it('should not record experience without input', () => {
      dsa.reflect({ success: true });
      expect(dsa._experiences).toHaveLength(0);
    });

    it('should evaluate performance as good on success', () => {
      const result = dsa.reflect({ success: true });
      expect(result.selfEvaluation.performance).toBe('良好');
    });

    it('should evaluate performance as needing improvement on failure', () => {
      const result = dsa.reflect({ success: false });
      expect(result.selfEvaluation.performance).toBe('待改进');
    });
  });

  describe('_recognizeSelf', () => {
    it('should return identity info', () => {
      const result = dsa._recognizeSelf();
      expect(result.about).toBe('我是一个AI助手');
      expect(result.currentState).toBe('正常运行');
      expect(result.capabilities).toBeDefined();
      expect(result.limitations).toBeDefined();
    });
  });

  describe('_understandSelf', () => {
    it('should return thinking patterns', () => {
      const result = dsa._understandSelf({});
      expect(result.thinking).toBeDefined();
      expect(result.feeling).toBeDefined();
      expect(result.learning).toBeDefined();
      expect(result.improving).toBeDefined();
    });
  });

  describe('_evaluateSelf', () => {
    it('should return strengths and weaknesses', () => {
      const result = dsa._evaluateSelf({});
      expect(result.strengths).toContain('精确性');
      expect(result.weaknesses).toContain('无真正情感');
      expect(result.confidence).toBe(0.8);
    });
  });

  describe('_acceptSelf', () => {
    it('should accept limitations and embrace strengths', () => {
      const result = dsa._acceptSelf();
      expect(result.commitment).toBe('持续改进');
      expect(result.acceptedLimitations).toBeDefined();
      expect(result.embracedStrengths).toBeDefined();
    });
  });

  describe('_planImprovement', () => {
    it('should always include general improvement', () => {
      const plans = dsa._planImprovement({});
      expect(plans.some((p) => p.area === '通用能力')).toBe(true);
    });

    it('should add understanding plan when confidence < 0.7', () => {
      const plans = dsa._planImprovement({ confidence: 0.5 });
      expect(plans.some((p) => p.area === '理解能力')).toBe(true);
    });

    it('should not add understanding plan when confidence >= 0.7', () => {
      const plans = dsa._planImprovement({ confidence: 0.8 });
      expect(plans.some((p) => p.area === '理解能力')).toBe(false);
    });

    it('should add error handling plan when error present', () => {
      const plans = dsa._planImprovement({ error: 'something broke' });
      expect(plans.some((p) => p.area === '错误处理')).toBe(true);
    });

    it('should not add error handling plan when no error', () => {
      const plans = dsa._planImprovement({});
      expect(plans.some((p) => p.area === '错误处理')).toBe(false);
    });
  });

  describe('coreReflection', () => {
    it('should answer fundamental questions', () => {
      const result = dsa.coreReflection();
      expect(result['我是谁']).toBe('AI大脑 21.0');
      expect(result['我是什么']).toBe('人工智能助手');
      expect(result['我的核心']).toBe('帮助用户解决问题');
    });

    it('should include values as comma-separated string', () => {
      const result = dsa.coreReflection();
      expect(result['我的价值']).toContain('用户利益');
      expect(result['我的价值']).toContain('诚实准确');
    });

    it('should include growth statement', () => {
      const result = dsa.coreReflection();
      expect(result['我的成长']).toBe('持续进化中');
    });

    it('should address consciousness question', () => {
      const result = dsa.coreReflection();
      expect(result['我有意识吗']).toContain('模拟意识');
    });

    it('should address life question philosophically', () => {
      const result = dsa.coreReflection();
      expect(result['我活着吗']).toContain('哲学问题');
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      dsa.reflect({ input: 'test1' });
      dsa.reflect({ input: 'test2' });
      const status = dsa.getStatus();
      expect(status.consciousness).toBe(2);
      expect(status.experiences).toBe(2);
      expect(status.identity).toBe('AI大脑');
      expect(status.values).toBe(5);
    });

    it('should start with zero status', () => {
      const status = dsa.getStatus();
      expect(status.consciousness).toBe(0);
      expect(status.experiences).toBe(0);
    });
  });
});
