/**
 * Unit Tests for IntentUnderstanding
 */

const { IntentUnderstanding, SkillChainExecutor } = require('../../src/ai/models/IntentUnderstanding');

describe('IntentUnderstanding', () => {
  let intentEngine;

  beforeEach(() => {
    intentEngine = new IntentUnderstanding();
  });

  describe('understand', () => {
    it('should understand intent from message', async () => {
      const result = await intentEngine.understand('生成一份周报告');
      expect(result.intent).toBeDefined();
      expect(typeof result.intent).toBe('string');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should return confidence score', async () => {
      const result = await intentEngine.understand('分析这张X光片');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return skills array', async () => {
      const result = await intentEngine.understand('创建一个合同文档');
      expect(result.skills).toBeDefined();
      expect(Array.isArray(result.skills)).toBe(true);
    });

    it('should handle empty message', async () => {
      const result = await intentEngine.understand('');
      expect(result).toBeDefined();
    });
  });

  describe('understandMultimodal', () => {
    it('should handle image content', async () => {
      const result = await intentEngine.understandMultimodal({
        type: 'image',
        data: { url: 'test.jpg' }
      });
      expect(result).toBeDefined();
      expect(result.contentType).toBe('image');
    });

    it('should handle document content', async () => {
      const result = await intentEngine.understandMultimodal({
        type: 'document',
        data: { type: 'contract' }
      });
      expect(result).toBeDefined();
      expect(result.contentType).toBe('document');
    });
  });

  describe('skill matching', () => {
    it('should return skills for intent', async () => {
      const result = await intentEngine.understand('分析医疗影像');
      expect(result.skills).toBeDefined();
      expect(Array.isArray(result.skills)).toBe(true);
    });

    it('should handle unknown intent', async () => {
      const result = await intentEngine.understand('xyz unknown intent');
      expect(result).toBeDefined();
    });
  });

  describe('context completion', () => {
    it('should complete from context history', async () => {
      const engine = new IntentUnderstanding();
      await engine.understand('生成报告', { userId: 'user1' });
      const result = await engine.understand('再生成一次', { userId: 'user1' });
      expect(result).toBeDefined();
    });
  });

  describe('slot extraction edge cases', () => {
    it('should detect medical image slot', async () => {
      const result = await intentEngine.understand('分析x光片');
      expect(result.slots.target).toContain('medical_image');
    });

    it('should detect CT slot', async () => {
      const result = await intentEngine.understand('检查ct影像');
      expect(result.slots.target).toContain('medical_image');
    });

    it('should detect MRI slot', async () => {
      const result = await intentEngine.understand('查看mri结果');
      expect(result.slots.target).toContain('medical_image');
    });

    it('should detect contract slot', async () => {
      const result = await intentEngine.understand('审核合同');
      expect(result.slots.content_type).toContain('contract');
    });
  });

  describe('_matchSkills slot-based matching', () => {
    it('should match skills by target slot', async () => {
      const result = await intentEngine.understand('优化投资组合');
      expect(result.skills.length).toBeGreaterThan(0);
    });

    it('should match skills by content_type slot', async () => {
      const result = await intentEngine.understand('生成一份合同文档');
      expect(result.skills.length).toBeGreaterThan(0);
    });
  });

  describe('_matchSkills attachment-based matching', () => {
    it('should match skills by attachment type', async () => {
      const result = await intentEngine.understand('分析附件', {
        attachments: [{ type: 'document' }]
      });
      expect(result.skills.length).toBeGreaterThan(0);
    });
  });

  describe('_generateParameters intent branches', () => {
    it('should generate predict parameters', async () => {
      const result = await intentEngine.understand('预测下季度销售额');
      expect(result.parameters).toBeDefined();
      expect(result.parameters.timeframe).toBeDefined();
    });

    it('should generate report parameters', async () => {
      const result = await intentEngine.understand('生成本周销售报告');
      expect(result.parameters).toBeDefined();
    });
  });

  describe('_saveHistory', () => {
    it('should keep only last 10 entries', () => {
      const engine = new IntentUnderstanding();
      for (let i = 0; i < 12; i++) {
        engine._saveHistory('heavyUser', { intent: 'test', slots: {}, skills: [], message: `msg${i}` });
      }
      const history = engine.conversationHistory.get('heavyUser');
      expect(history.length).toBeLessThanOrEqual(10);
    });
  });

  describe('understandMultimodal additional types', () => {
    it('should handle audio content', async () => {
      const result = await intentEngine.understandMultimodal({
        type: 'audio',
        data: { duration: 30 }
      });
      expect(result.contentType).toBe('audio');
    });

    it('should handle video content', async () => {
      const result = await intentEngine.understandMultimodal({
        type: 'video',
        data: { duration: 60, frames: 15 }
      });
      expect(result.contentType).toBe('video');
    });

    it('should not override with caption when intent is string-type', async () => {
      const result = await intentEngine.understandMultimodal({
        type: 'image',
        data: { url: 'test.jpg' },
        caption: '生成报告'
      });
      expect(result.contentType).toBe('image');
    });
  });

  describe('_planSkillChain', () => {
    it('should create chain for predict intent', async () => {
      const result = await intentEngine.understand('预测下个月指标');
      expect(result.chain).toBeDefined();
    });

    it('should plan chain for report with notification', async () => {
      const result = await intentEngine.understand('生成一份报告并发送通知');
      expect(result.chain).toBeDefined();
    });
  });

  describe('_generateParameters default case', () => {
    it('should handle unknown intent params', async () => {
      const result = await intentEngine.understand('xyz unknown intent');
      expect(result.parameters.rawInput).toBeDefined();
    });
  });

  describe('_completeFromContext slot filling', () => {
    it('should fill period from context history', async () => {
      const engine = new IntentUnderstanding();
      const slots = { period: ['from_q1_to_q2'] };
      engine._saveHistory('userCtx', { intent: 'report', slots, skills: [], message: 'test' });
      const result = await engine.understand('再分析一次', { userId: 'userCtx' });
      expect(result.slots.period).toBeDefined();
    });

    it('should fill format from context history', async () => {
      const engine = new IntentUnderstanding();
      const slots = { format: ['pdf'] };
      engine._saveHistory('userFmt', { intent: 'report', slots, skills: [], message: 'test' });
      const result = await engine.understand('再分析一次', { userId: 'userFmt' });
      expect(result.slots.format).toBeDefined();
    });
  });

  describe('_matchSkills topic slot matching', () => {
    it('should match via topic slot', async () => {
      const result = await intentEngine.understand('做关于stock的预测');
      expect(result.skills.length).toBeGreaterThan(0);
    });
  });

  describe('report chain rule', () => {
    it('should evaluate report chain condition', async () => {
      const result = await intentEngine.understand('总结上周工作');
      expect(result).toBeDefined();
    });
  });

  describe('caption not overriding intent', () => {
    it('should keep image intent when caption has lower confidence', async () => {
      const result = await intentEngine.understandMultimodal({
        type: 'image',
        data: { url: 'test.jpg' },
        caption: 'unknown gibberish xyz'
      });
      expect(result.contentType).toBe('image');
    });
  });

  describe('caption overriding intent', () => {
    it('should override when caption confidence is higher', async () => {
      const result = await intentEngine.understandMultimodal({
        type: 'unknownType',
        data: { text: 'hello' },
        caption: '报告'
      });
      expect(result.intent).toBe('report');
    });
  });

});

describe('SkillChainExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new SkillChainExecutor();
  });

  describe('createChain', () => {
    it('should create a chain with steps', () => {
      const chain = executor.createChain({
        name: 'Test Chain',
        steps: [
          { skill: 'skill1', action: 'execute' },
          { skill: 'skill2', action: 'execute', dependsOn: ['step_0'] }
        ]
      });
      expect(chain.id).toBeDefined();
      expect(chain.steps).toHaveLength(2);
      expect(chain.status).toBe('draft');
    });

    it('should create chain with steps', () => {
      const chain = executor.createChain({
        name: 'Simple Chain',
        steps: [{ skill: 'test', action: 'run' }]
      });
      expect(chain.id).toBeDefined();
      expect(chain.name).toBe('Simple Chain');
      expect(chain.steps).toHaveLength(1);
    });
  });

  describe('execute', () => {
    it('should execute a chain', async () => {
      const chain = executor.createChain({
        name: 'Test Chain',
        steps: [
          { skill: 'data-collector', action: 'collect' },
          { skill: 'analyzer', action: 'analyze', dependsOn: ['step_0'] }
        ]
      });

      const execution = await executor.execute(chain.id, { test: true });
      expect(execution).toBeDefined();
      expect(execution.id).toBeDefined();
      expect(execution.chainId).toBe(chain.id);
    });

    it('should throw for non-existent chain', async () => {
      await expect(executor.execute('non_existent', {})).rejects.toThrow('Chain not found');
    });

    it('should handle parallel execution', async () => {
      const chain = executor.createChain({
        name: 'Parallel Chain',
        parallel: true,
        steps: [
          { skill: 'data-collector', action: 'collect' },
          { skill: 'analyzer', action: 'analyze' }
        ]
      });
      const execution = await executor.execute(chain.id, { test: true });
      expect(execution.status).toBe('completed');
    });

    it('should handle step condition skipping', async () => {
      const chain = executor.createChain({
        name: 'Condition Chain',
        steps: [
          { skill: 'data-collector', action: 'collect', condition: () => false }
        ]
      });
      const execution = await executor.execute(chain.id, { test: true });
      expect(execution.status).toBe('completed');
    });

    it('should handle execution failure', async () => {
      const chain = executor.createChain({
        name: 'Fail Chain',
        steps: [
          { skill: 'fail-skill', action: 'fail', retry: 1 }
        ]
      });
      const orig = executor._executeStep.bind(executor);
      executor._executeStep = jest.fn().mockRejectedValue(new Error('Step failed'));
      const execution = await executor.execute(chain.id, {});
      expect(execution.status).toBe('failed');
      expect(execution.error).toBeDefined();
      executor._executeStep = orig;
    });
  });

  describe('_buildExecutionPlan', () => {
    it('should throw on circular dependency', () => {
      expect(() => executor._buildExecutionPlan([
        { id: 'step_0', dependsOn: ['step_1'] },
        { id: 'step_1', dependsOn: ['step_0'] }
      ])).toThrow('Circular dependency');
    });
  });

  describe('_evaluateCondition', () => {
    it('should evaluate function condition', () => {
      expect(executor._evaluateCondition((d) => d.value > 5, { value: 10 })).toBe(true);
      expect(executor._evaluateCondition((d) => d.value > 5, { value: 1 })).toBe(false);
    });

    it('should evaluate string condition', () => {
      expect(executor._evaluateCondition('value == 10', { value: 10 })).toBe(true);
    });

    it('should return true for non-function non-string condition', () => {
      expect(executor._evaluateCondition(null, {})).toBe(true);
    });

    it('should return false for invalid expression string', () => {
      expect(executor._evaluateCondition('value == 10', {})).toBe(false);
    });

    it('should return false for malformed expression', () => {
      expect(executor._evaluateCondition('value == ', { value: 10 })).toBe(false);
    });
  });

  describe('_safeEvaluate', () => {
    it('should handle various operators', () => {
      expect(executor._safeEvaluate('a === 5', { a: 5 })).toBe(true);
      expect(executor._safeEvaluate('a != 5', { a: 3 })).toBe(true);
      expect(executor._safeEvaluate('a !== 5', { a: 3 })).toBe(true);
      expect(executor._safeEvaluate('a > 3', { a: 5 })).toBe(true);
      expect(executor._safeEvaluate('a >= 5', { a: 5 })).toBe(true);
      expect(executor._safeEvaluate('a < 5', { a: 3 })).toBe(true);
      expect(executor._safeEvaluate('a <= 3', { a: 3 })).toBe(true);
      expect(executor._safeEvaluate('a && b', { a: true, b: true })).toBe(true);
      expect(executor._safeEvaluate('a || b', { a: false, b: true })).toBe(true);
    });

    it('should handle bitwise operators', () => {
      expect(executor._safeEvaluate('a & b', { a: 3, b: 1 })).toBe(true);
      expect(executor._safeEvaluate('a | b', { a: 1, b: 2 })).toBe(true);
    });

    it('should reject disallowed characters', () => {
      expect(executor._safeEvaluate('value; hack()', {})).toBe(false);
    });

    it('should resolve boolean literals', () => {
      expect(executor._safeEvaluate('true', {})).toBe(true);
      expect(executor._safeEvaluate('false', {})).toBe(false);
    });

    it('should resolve null and undefined', () => {
      expect(executor._safeEvaluate('null', {})).toBe(false);
      expect(executor._safeEvaluate('undefined', {})).toBe(false);
    });

    it('should handle unknown operator', () => {
      expect(executor._safeEvaluate('a ?? b', { a: 1, b: 2 })).toBe(false);
    });

    it('should fall through default for unrecognized operator pair', () => {
      expect(executor._safeEvaluate('a |< b', { a: 1, b: 2 })).toBe(true);
    });
  });

  describe('getExecutionHistory', () => {
    it('should return empty array for non-existent chain', () => {
      expect(executor.getExecutionHistory('unknown')).toEqual([]);
    });
  });

  describe('_executeStep retry', () => {
    it('should retry on failure then throw', async () => {
      const chain = executor.createChain({
        name: 'Retry Chain',
        steps: [{ skill: 'fail', action: 'run', retry: 2 }]
      });
      const orig = executor._callSkill.bind(executor);
      executor._callSkill = jest.fn().mockRejectedValue(new Error('Fail'));
      const execution = await executor.execute(chain.id, {});
      expect(execution.status).toBe('failed');
      executor._callSkill = orig;
    });
  });

  describe('_saveExecution', () => {
    it('should keep only last 100 entries', () => {
      const chain = executor.createChain({ name: 'T', steps: [{ skill: 's', action: 'a' }] });
      for (let i = 0; i < 110; i++) {
        executor._saveExecution({ chainId: chain.id });
      }
      const history = executor.getExecutionHistory(chain.id);
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });
});
