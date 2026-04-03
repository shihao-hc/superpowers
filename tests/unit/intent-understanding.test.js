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
  });
});
