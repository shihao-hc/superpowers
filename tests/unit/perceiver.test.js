const Perceiver = require('../../src/core/Perceiver');

describe('Perceiver', () => {
  let perceiver;

  beforeEach(() => {
    perceiver = new Perceiver({
      beforeDecision: jest.fn(),
      getStatus: jest.fn().mockReturnValue({ healthy: true })
    });
  });

  describe('constructor', () => {
    it('has 5 perception channels', () => {
      expect(Object.keys(perceiver.channels)).toEqual([
        'context', 'intent', 'emotion', 'environment', 'relationship'
      ]);
    });
  });

  describe('_perceiveContext', () => {
    it('detects development context', () => {
      const ctx = perceiver._perceiveContext('implement code in .js');
      expect(ctx.type).toBe('development');
    });

    it('detects documentation context', () => {
      const ctx = perceiver._perceiveContext('read the doc');
      expect(ctx.type).toBe('documentation');
    });

    it('detects verification context', () => {
      const ctx = perceiver._perceiveContext('run test verify');
      expect(ctx.type).toBe('verification');
    });

    it('detects exploration context', () => {
      const ctx = perceiver._perceiveContext('搜索方案');
      expect(ctx.type).toBe('exploration');
    });

    it('defaults to general', () => {
      const ctx = perceiver._perceiveContext('hello world');
      expect(ctx.type).toBe('general');
    });

    it('extracts keywords', () => {
      const ctx = perceiver._perceiveContext('implement code with test');
      expect(ctx.keywords).toContain('implement');
      expect(ctx.summary).toContain('development');
    });
  });

  describe('_perceiveIntent', () => {
    it('detects create intent', () => {
      expect(perceiver._perceiveIntent('创建新文件').primary).toBe('create');
    });

    it('detects analyze intent', () => {
      expect(perceiver._perceiveIntent('分析性能').primary).toBe('analyze');
    });

    it('detects execute intent', () => {
      expect(perceiver._perceiveIntent('执行命令').primary).toBe('execute');
    });

    it('detects help intent', () => {
      expect(perceiver._perceiveIntent('帮助我理解').primary).toBe('help');
    });

    it('detects ambiguity with questions', () => {
      const intent = perceiver._perceiveIntent('?');
      expect(intent.ambiguity).toBe(true);
    });

    it('collects secondary intents', () => {
      const intent = perceiver._perceiveIntent('创建并分析');
      expect(intent.secondary).toContain('analyze');
    });

    it('returns unknown for no match', () => {
      expect(perceiver._perceiveIntent('xyzzz').primary).toBe('unknown');
    });
  });

  describe('_perceiveEmotion', () => {
    it('returns neutral state by default', () => {
      const em = perceiver._perceiveEmotion('hello world');
      expect(em.state).toBe('neutral');
      expect(em.cues).toEqual([]);
      expect(em.intensity).toBe(0);
    });

    it('detects positive emotion from keywords', () => {
      const em = perceiver._perceiveEmotion('great excellent perfect');
      expect(em.state).toBe('positive');
      expect(em.cues).toEqual(['positive', 'positive', 'positive']);
      expect(em.intensity).toBeCloseTo(0.6);
    });

    it('detects negative emotion from keywords', () => {
      const em = perceiver._perceiveEmotion('terrible bad worst');
      expect(em.state).toBe('negative');
      expect(em.cues).toEqual(['negative', 'negative', 'negative']);
      expect(em.intensity).toBeCloseTo(0.9);
    });

    it('detects uncertain emotion from keywords', () => {
      const em = perceiver._perceiveEmotion('maybe perhaps');
      expect(em.state).toBe('uncertain');
    });

    it('detects urgent emotion from keywords', () => {
      const em = perceiver._perceiveEmotion('urgent immediately');
      expect(em.cues).toContain('urgent');
    });

    it('caps intensity at 1', () => {
      const em = perceiver._perceiveEmotion('great excellent good perfect terrible bad worst urgent immediately asap');
      expect(em.intensity).toBe(1);
    });

    it('negative takes priority over positive in mixed input', () => {
      const em = perceiver._perceiveEmotion('great terrible');
      expect(em.state).toBe('negative');
      expect(em.cues).toContain('positive');
      expect(em.cues).toContain('negative');
    });
  });

  describe('_perceiveEnvironment', () => {
    it('includes platform info', () => {
      const env = perceiver._perceiveEnvironment('');
      expect(env.platform).toBe(process.platform);
      expect(env.hour).toBeGreaterThanOrEqual(0);
    });

    it('determines period based on hour', () => {
      const env = perceiver._perceiveEnvironment('');
      expect(['morning', 'afternoon', 'evening', 'night']).toContain(env.period);
    });

    it('returns low energy with few recent inputs', () => {
      const env = perceiver._perceiveEnvironment('');
      expect(env.energy).toBe('low');
    });
  });

  describe('_perceiveRelationship', () => {
    it('detects high urgency', () => {
      const rel = perceiver._perceiveRelationship('紧急 immediate urgent');
      expect(rel.urgency).toBe('high');
    });

    it('detects low urgency', () => {
      const rel = perceiver._perceiveRelationship('不急 later');
      expect(rel.urgency).toBe('low');
    });

    it('detects high complexity for long input', () => {
      const rel = perceiver._perceiveRelationship('word '.repeat(101));
      expect(rel.complexity).toBe('high');
    });

    it('detects development domain', () => {
      const rel = perceiver._perceiveRelationship('code programming');
      expect(rel.domain).toBe('development');
    });

    it('detects security domain', () => {
      const rel = perceiver._perceiveRelationship('安全漏洞');
      expect(rel.domain).toBe('security');
    });
  });

  describe('perceive', () => {
    it('runs all channels', () => {
      const result = perceiver.perceive('实现新功能');
      expect(result.channels.context).toBeDefined();
      expect(result.channels.intent).toBeDefined();
      expect(result.channels.emotion).toBeDefined();
      expect(result.channels.environment).toBeDefined();
      expect(result.channels.relationship).toBeDefined();
    });

    it('handles channel errors gracefully', () => {
      const broken = new Perceiver({
        beforeDecision: jest.fn(),
        getStatus: jest.fn().mockReturnValue({ healthy: true })
      });
      broken.channels.relationship = jest.fn(() => { throw new Error('channel fail'); });
      const result = broken.perceive('test');
      expect(result.channels.relationship.error).toBe('channel fail');
    });

    it('updates current state', () => {
      perceiver.perceive('分析代码安全');
      const state = perceiver.getCurrentState();
      expect(state.context).toBe('development');
      expect(state.intent).toBe('analyze');
    });

    it('records to history', () => {
      perceiver.perceive('test');
      expect(perceiver.perceptionHistory).toHaveLength(1);
    });
  });

  describe('respond', () => {
    it('suggests clarify for ambiguous intent', () => {
      const perception = perceiver.perceive('?');
      const response = perceiver.respond(perception);
      expect(response.adjust.clarify).toBeDefined();
    });

    it('suggests empathy for negative emotion', () => {
      const perception = perceiver.perceive('terrible bad worst');
      const response = perceiver.respond(perception);
      expect(response.adjust.empathy).toBeDefined();
    });

    it('adjusts speed for high urgency', () => {
      const perception = perceiver.perceive('紧急 immediately urgent');
      const response = perceiver.respond(perception);
      expect(response.adjust.speed).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('returns zero totals initially', () => {
      const stats = perceiver.getStats();
      expect(stats.total).toBe(0);
    });

    it('aggregates perception data', () => {
      perceiver.perceive('实现代码');
      perceiver.perceive('test');
      const stats = perceiver.getStats();
      expect(stats.total).toBe(2);
      expect(stats.contexts.development).toBe(1);
    });
  });

  describe('_perceiveEnvironment - periods', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('detects morning period', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 0, 1, 8, 0, 0));
      expect(perceiver._perceiveEnvironment('').period).toBe('morning');
    });

    it('detects afternoon period', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 0, 1, 14, 0, 0));
      expect(perceiver._perceiveEnvironment('').period).toBe('afternoon');
    });

    it('detects evening period', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 0, 1, 20, 0, 0));
      expect(perceiver._perceiveEnvironment('').period).toBe('evening');
    });
  });

  describe('_perceiveEnvironment - energy branches', () => {
    it('returns medium energy with 6-20 inputs', () => {
      for (let i = 0; i < 6; i++) {
        perceiver.perceptionHistory.push({});
      }
      expect(perceiver._perceiveEnvironment('').energy).toBe('medium');
    });

    it('returns high energy with >20 inputs', () => {
      for (let i = 0; i < 21; i++) {
        perceiver.perceptionHistory.push({});
      }
      expect(perceiver._perceiveEnvironment('').energy).toBe('high');
    });
  });

  describe('_perceiveRelationship - additional branches', () => {
    it('detects medium complexity', () => {
      const rel = perceiver._perceiveRelationship('word '.repeat(40).trim());
      expect(rel.complexity).toBe('medium');
    });

    it('detects performance domain', () => {
      expect(perceiver._perceiveRelationship('性能优化').domain).toBe('performance');
    });

    it('detects testing domain', () => {
      expect(perceiver._perceiveRelationship('测试验证').domain).toBe('testing');
    });
  });

  describe('respond - low energy branch', () => {
    it('keeps response concise when energy is low', () => {
      perceiver.current.energy = 19;
      const perception = perceiver.perceive('hello');
      expect(perceiver.respond(perception).adjust.energy).toBe('保持简洁');
    });
  });

  describe('_record - history trim', () => {
    it('trims history when exceeding maxHistory', () => {
      perceiver.maxHistory = 2;
      perceiver.perceive('a');
      perceiver.perceive('b');
      perceiver.perceive('c');
      expect(perceiver.perceptionHistory).toHaveLength(2);
    });
  });

  describe('_perceiveEnvironment - brainState fallbacks', () => {
    it('handles null brain', () => {
      const p = new Perceiver(null);
      expect(p._perceiveEnvironment('').brainState).toBe('unknown');
    });

    it('handles null getStatus', () => {
      const p = new Perceiver({
        beforeDecision: jest.fn(),
        getStatus: jest.fn().mockReturnValue(null)
      });
      expect(p._perceiveEnvironment('').brainState).toBe('unknown');
    });

    it('handles falsy healthy', () => {
      const p = new Perceiver({
        beforeDecision: jest.fn(),
        getStatus: jest.fn().mockReturnValue({ healthy: false })
      });
      expect(p._perceiveEnvironment('').brainState).toBe('unknown');
    });
  });

  describe('_updateCurrent - fallback branches', () => {
    it('uses defaults when channels lack fields', () => {
      perceiver._updateCurrent({ channels: {} });
      expect(perceiver.current.context).toBe('unknown');
      expect(perceiver.current.intent).toBe('unknown');
      expect(perceiver.current.emotion).toBe('neutral');
    });
  });

  describe('getStats - sparse history', () => {
    it('handles missing channel fields', () => {
      perceiver.perceptionHistory.push({ channels: {} });
      perceiver.perceptionHistory.push({ channels: { context: {}, intent: {}, emotion: {} } });
      perceiver.perceptionHistory.push({ channels: { context: { type: 'test' }, intent: { primary: 'read' }, emotion: { state: 'positive' } } });
      const stats = perceiver.getStats();
      expect(stats.total).toBe(3);
      expect(stats.contexts.test).toBe(1);
      expect(stats.intents.read).toBe(1);
      expect(stats.emotions.positive).toBe(1);
    });
  });

  describe('perceive - additional branches', () => {
    it('stringifies non-string input', () => {
      const result = perceiver.perceive({ key: 'value' });
      expect(result.input).toBe('{"key":"value"}');
    });

    it('handles missing beforeDecision', () => {
      const p = new Perceiver({ getStatus: jest.fn().mockReturnValue({ healthy: true }) });
      const result = p.perceive('test');
      expect(result.channels.context).toBeDefined();
    });
  });
});
