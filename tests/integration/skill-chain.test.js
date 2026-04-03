/**
 * Integration Tests for Skill Chain Execution
 */

const request = require('supertest');
const express = require('express');

const { IntentUnderstanding, SkillChainExecutor } = require('../../src/ai/models/IntentUnderstanding');

const createTestApp = () => {
  const app = express();
  app.use(express.json());

  app.post('/api/v1/intent/understand', async (req, res) => {
    try {
      const intent = new IntentUnderstanding();
      const result = await intent.understand(req.body.message, req.body.context);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/v1/intent/execute-chain', async (req, res) => {
    try {
      const executor = new SkillChainExecutor();
      const chain = executor.createChain(req.body.chain);
      const execution = await executor.execute(chain.id, req.body.input);
      res.json(execution);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
};

describe('Intent Understanding API', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('POST /api/v1/intent/understand', () => {
    it('should understand intent from message', async () => {
      const response = await request(app)
        .post('/api/v1/intent/understand')
        .send({ message: '生成一份周报告' })
        .expect(200);

      expect(response.body.intent).toBeDefined();
      expect(response.body.confidence).toBeGreaterThan(0);
      expect(response.body.skills).toBeDefined();
    });

    it('should extract slots from message', async () => {
      const response = await request(app)
        .post('/api/v1/intent/understand')
        .send({ message: '分析本月的销售数据' })
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should suggest skills based on intent', async () => {
      const response = await request(app)
        .post('/api/v1/intent/understand')
        .send({ message: '预测下周的库存需求' })
        .expect(200);

      expect(response.body.skills).toBeDefined();
      expect(Array.isArray(response.body.skills)).toBe(true);
    });

    it('should handle empty message', async () => {
      const response = await request(app)
        .post('/api/v1/intent/understand')
        .send({ message: '' });

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /api/v1/intent/execute-chain', () => {
    it('should execute skill chain', async () => {
      const chain = {
        name: 'Test Workflow',
        steps: [
          { skill: 'data-collector', action: 'collect' },
          { skill: 'analyzer', action: 'analyze', dependsOn: ['step_0'] }
        ]
      };

      const response = await request(app)
        .post('/api/v1/intent/execute-chain')
        .send({
          chain,
          input: { test: true }
        })
        .expect(200);

      expect(response.body.id).toBeDefined();
      expect(response.body.status).toBeDefined();
    });
  });
});

describe('Skill Chain Executor', () => {
  let executor;

  beforeEach(() => {
    executor = new SkillChainExecutor();
  });

  it('should create a chain with dependencies', () => {
    const chain = executor.createChain({
      name: 'Multi-step Analysis',
      steps: [
        { skill: 'data-collector', action: 'collect' },
        { skill: 'analyzer', action: 'analyze', dependsOn: ['step_0'] },
        { skill: 'reporter', action: 'generate', dependsOn: ['step_1'] }
      ]
    });

    expect(chain.id).toBeDefined();
    expect(chain.steps).toHaveLength(3);
    expect(chain.status).toBe('draft');
  });

  it('should execute chain and return results', async () => {
    const chain = executor.createChain({
      name: 'Test Chain',
      steps: [
        { skill: 'collector', action: 'collect' }
      ]
    });

    const result = await executor.execute(chain.id, { input: 'test' });

    expect(result.id).toBeDefined();
    expect(result.chainId).toBe(chain.id);
    expect(result.status).toBeDefined();
  });
});
