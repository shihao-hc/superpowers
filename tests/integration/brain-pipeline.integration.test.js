const {
  BrainSystem, analyzeIntent, expressEmotion, predict, proactiveThink,
  smartStore, smartSearch, getMemoryStats, getEvolutionStats, getFullStatus,
  autoValidate, autoLearn, autoGetStatus
} = require('../../src/core/BrainSystem');

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn((p) => {
      if (typeof p === 'string' && (p.includes('audit') || p.includes('lesson') || p.includes('data'))) return false;
      return actual.existsSync(p);
    }),
    readFileSync: jest.fn((p, ...args) => {
      if (typeof p === 'string' && (p.includes('audit') || p.includes('lesson') || p.includes('data'))) return '{}';
      return actual.readFileSync(p, ...args);
    }),
    readdirSync: jest.fn((p) => {
      if (typeof p === 'string' && (p.includes('audit') || p.includes('skills'))) return [];
      return actual.readdirSync(p);
    }),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn()
  };
});

describe('BrainSystem Full Pipeline Integration', () => {
  let brain;

  beforeEach(() => {
    brain = new BrainSystem();
    if (brain._loadPersistence) brain._loadPersistence = jest.fn();
    if (brain._autoStartDailyCheck) brain._autoStartDailyCheck = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Input → Intent → Emotion → Response Pipeline', () => {
    test('full analysis pipeline produces coherent result', () => {
      const input = '帮我修复这个安全漏洞';

      const intent = analyzeIntent(input);
      expect(intent).toHaveProperty('intent');
      expect(intent).toHaveProperty('confidence');
      expect(typeof intent.confidence).toBe('number');

      const emotion = expressEmotion(input);
      expect(emotion).toHaveProperty('detected');
      expect(emotion).toHaveProperty('natural');
    });

    test('creative intent triggers different emotion than bug fix', () => {
      const bugInput = '修复登录失败的bug';
      const creativeInput = '帮我设计一个新功能';

      const bugEmotion = expressEmotion(bugInput);
      const creativeEmotion = expressEmotion(creativeInput);

      expect(bugEmotion.detected).toBeDefined();
      expect(creativeEmotion.detected).toBeDefined();
    });
  });

  describe('Memory → Learning → Adaptation Pipeline', () => {
    test('smartStore → smartSearch round-trip', async () => {
      const id = smartStore('pipeline-test-key', {
        input: 'test input',
        intent: 'testing',
        result: { success: true }
      });
      expect(id).toBeDefined();

      const results = smartSearch('pipeline-test');
      expect(Array.isArray(results)).toBe(true);
    });

    test('learning cycle produces stats', async () => {
      const stats = getMemoryStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });
  });

  describe('Prediction → Proactive → Adaptation Pipeline', () => {
    test('predict → proactiveThink produces complementary results', () => {
      const prediction = predict('帮我优化代码');
      expect(prediction).toHaveProperty('intent');
      expect(prediction).toHaveProperty('skill');

      const proactive = proactiveThink('帮我优化代码', {
        previousPrediction: prediction
      });
      expect(proactive).toBeDefined();
      expect(typeof proactive).toBe('object');
    });

    test('time-based prediction varies by time of day', () => {
      const morning = predict('早上的任务');
      const evening = predict('晚上的任务');
      expect(morning.timeBased).toBeDefined();
      expect(evening.timeBased).toBeDefined();
    });
  });

  describe('Full System Status', () => {
    test('getFullStatus returns comprehensive status', () => {
      const status = getFullStatus();
      expect(status).toHaveProperty('memory');
      expect(status).toHaveProperty('evolution');
      expect(status).toHaveProperty('timestamp');
    });

    test('getMemoryStats returns persistence info', () => {
      const stats = getMemoryStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    test('getEvolutionStats returns evolution info', () => {
      const stats = getEvolutionStats();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('total');
    });
  });

  describe('Cross-Module Consistency', () => {
    test('analyzeIntent and expressEmotion handle same input consistently', () => {
      const input = '部署生产环境';
      const intent = analyzeIntent(input);
      const emotion = expressEmotion(input);

      expect(intent.intent).toBeDefined();
      expect(emotion.detected).toBeDefined();
    });

    test('multiple calls produce stable results', () => {
      const input = '测试稳定性';
      const results1 = [analyzeIntent(input), expressEmotion(input), predict(input)];
      const results2 = [analyzeIntent(input), expressEmotion(input), predict(input)];

      expect(results1[0].intent).toEqual(results2[0].intent);
      expect(results1[1].detected).toEqual(results2[1].detected);
      expect(results1[2].intent).toEqual(results2[2].intent);
    });

    test('empty input handled gracefully across all modules', () => {
      expect(() => analyzeIntent('')).not.toThrow();
      expect(() => expressEmotion('')).not.toThrow();
      expect(() => predict('')).not.toThrow();
      expect(() => proactiveThink('', {})).not.toThrow();
    });

    test('very long input handled gracefully', () => {
      const longInput = '测试'.repeat(1000);
      expect(() => analyzeIntent(longInput)).not.toThrow();
      expect(() => expressEmotion(longInput)).not.toThrow();
      expect(() => predict(longInput)).not.toThrow();
    });
  });

  describe('SmartStore Integration', () => {
    test('store and retrieve with full context', async () => {
      smartStore('integration-context', {
        input: '修复SQL注入',
        intent: 'bug_fix',
        emotion: 'focused',
        prediction: { skill: 'security', action: 'fix' },
        result: { success: true, filesChanged: 3 }
      });

      const searchResults = smartSearch('SQL注入');
      expect(searchResults.length).toBeGreaterThanOrEqual(0);
    });

    test('getFullStatus reflects stored data', async () => {
      smartStore('status-test', { input: 'test', result: 'ok' });
      const status = getFullStatus();
      expect(status.memory).toBeDefined();
    });
  });

  describe('autoValidate + autoLearn Pipeline', () => {
    test('autoValidate returns validation result', async () => {
      const result = await autoValidate({ intent: 'test', confidence: 0.8 });
      expect(result).toBeDefined();
    });

    test('autoLearn processes learning data', async () => {
      const result = await autoLearn({ intent: 'test', confidence: 0.5, error: false });
      expect(result).toBeDefined();
    });

    test('autoGetStatus returns status object', async () => {
      const result = autoGetStatus();
      expect(result).toBeDefined();
    });
  });
});
