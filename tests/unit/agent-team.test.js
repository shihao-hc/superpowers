/**
 * AgentTeam 单元测试
 * Tests for the standalone AgentTeam module extracted from BrainSystem.js
 */

const {
  BaseAgent,
  IntentAgent,
  EmotionAgent,
  ContextAgent,
  CodeAgent,
  SearchAgent,
  DebugAgent,
  OptimizeAgent,
  TestAgent,
  QualityAgent,
  SecurityAgent,
  EffectAgent,
  SummaryAgent,
  ImprovementAgent,
  KnowledgeAgent,
  AgentTeamManager,
  _AGENT_TEAMS
} = require('../../src/core/AgentTeam');

describe('AgentTeam', () => {
  describe('BaseAgent', () => {
    it('should catch error in execute and return error object', () => {
      const agent = new BaseAgent('Test', 'test');
      const result = agent.execute('input');
      expect(result.agent).toBe('Test');
      expect(result.error).toContain('子类必须实现_executeSync方法');
    });

    it('should catch errors in execute', () => {
      const agent = new BaseAgent('Test', 'test');
      const result = agent.execute('input');
      expect(result.error).toContain('子类必须实现_executeSync方法');
    });

    it('should accept brainApi via constructor', () => {
      const api = { analyzeIntent: jest.fn() };
      const agent = new BaseAgent('Test', 'test', api);
      expect(agent._brain).toBe(api);
    });
  });

  describe('IntentAgent', () => {
    it('should return intent analysis result', () => {
      const api = { analyzeIntent: jest.fn().mockReturnValue({ intent: 'code', confidence: 0.9 }) };
      const agent = new IntentAgent(api);
      const result = agent.execute('写代码');
      expect(result.agent).toBe('IntentAgent');
      expect(result.team).toBe('analysis');
      expect(result.result).toBe('code');
      expect(result.confidence).toBe(0.9);
    });

    it('should handle missing brainApi gracefully', () => {
      const agent = new IntentAgent({});
      const result = agent.execute('test');
      expect(result.result).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('EmotionAgent', () => {
    it('should return emotion analysis', () => {
      const api = { expressEmotion: jest.fn().mockReturnValue({ detected: 'happy', expression: '😊' }) };
      const agent = new EmotionAgent(api);
      const result = agent.execute('好开心');
      expect(result.emotion).toBe('happy');
      expect(result.expression).toBe('😊');
    });

    it('should handle missing api', () => {
      const agent = new EmotionAgent({});
      const result = agent.execute('test');
      expect(result.emotion).toBeNull();
    });
  });

  describe('ContextAgent', () => {
    it('should return context analysis', () => {
      const api = { agiEngine: jest.fn().mockReturnValue({ perception: { context: { complexity: 'high' }, complexity: 'high' } }) };
      const agent = new ContextAgent(api);
      const result = agent.execute('复杂任务');
      expect(result.complexity).toBe('high');
    });

    it('should handle missing api', () => {
      const agent = new ContextAgent({});
      const result = agent.execute('test');
      expect(result.complexity).toBe('unknown');
    });
  });

  describe('CodeAgent', () => {
    it('should return code generation result', () => {
      const api = {
        analyzeIntent: jest.fn().mockReturnValue({ intent: 'code' }),
        getRelatedLessons: jest.fn().mockReturnValue([{ lesson: 'test' }])
      };
      const agent = new CodeAgent(api);
      const result = agent.execute('写代码');
      expect(result.action).toBe('代码生成');
      expect(result.intent).toBe('code');
      expect(result.lessons).toBe(1);
    });
  });

  describe('SearchAgent', () => {
    it('should return search result', () => {
      const agent = new SearchAgent({});
      const result = agent.execute('search query');
      expect(result.action).toBe('搜索执行');
      expect(result.status).toBe('ready');
    });
  });

  describe('DebugAgent', () => {
    it('should return debug result', () => {
      const agent = new DebugAgent({});
      const result = agent.execute('debug this');
      expect(result.action).toBe('调试执行');
    });
  });

  describe('OptimizeAgent', () => {
    it('should return optimize result', () => {
      const agent = new OptimizeAgent({});
      const result = agent.execute('optimize');
      expect(result.action).toBe('优化执行');
    });
  });

  describe('TestAgent', () => {
    it('should return test result', () => {
      const agent = new TestAgent({});
      const result = agent.execute('run tests');
      expect(result.action).toBe('测试生成');
    });
  });

  describe('QualityAgent', () => {
    it('should return quality review', () => {
      const agent = new QualityAgent({});
      const result = agent.execute('review');
      expect(result.result).toBe('审核通过');
      expect(result.quality).toBe('high');
    });
  });

  describe('SecurityAgent', () => {
    it('should return security review', () => {
      const agent = new SecurityAgent({});
      const result = agent.execute('security check');
      expect(result.result).toBe('安全审核通过');
      expect(result.security).toBe('high');
    });
  });

  describe('EffectAgent', () => {
    it('should return effect review', () => {
      const agent = new EffectAgent({});
      const result = agent.execute('effect check');
      expect(result.result).toBe('效果审核通过');
      expect(result.effectiveness).toBe('high');
    });
  });

  describe('SummaryAgent', () => {
    it('should record experience', () => {
      const api = { recordImprovement: jest.fn() };
      const agent = new SummaryAgent(api);
      const result = agent.execute('test interaction');
      expect(result.result).toBe('经验已记录');
      expect(api.recordImprovement).toHaveBeenCalled();
    });
  });

  describe('ImprovementAgent', () => {
    it('should return improvement count', () => {
      const api = { autonomousLearn: jest.fn().mockReturnValue({ learning: [1, 2] }) };
      const agent = new ImprovementAgent(api);
      const result = agent.execute('improve', { intent: 'code' });
      expect(result.improvements).toBe(2);
    });

    it('should handle missing api', () => {
      const agent = new ImprovementAgent({});
      const result = agent.execute('test');
      expect(result.improvements).toBe(0);
    });
  });

  describe('KnowledgeAgent', () => {
    it('should store knowledge', () => {
      const api = { smartStore: jest.fn() };
      const agent = new KnowledgeAgent(api);
      const result = agent.execute('new knowledge');
      expect(result.result).toBe('知识已存储');
      expect(api.smartStore).toHaveBeenCalled();
    });
  });

  describe('AgentTeamManager', () => {
    let manager;
    let mockBrainApi;

    beforeEach(() => {
      mockBrainApi = {
        analyzeIntent: jest.fn().mockReturnValue({ intent: 'code', confidence: 0.8 }),
        expressEmotion: jest.fn().mockReturnValue({ detected: null }),
        agiEngine: jest.fn().mockReturnValue({ perception: { context: {} } }),
        recordImprovement: jest.fn(),
        autonomousLearn: jest.fn().mockReturnValue({ learning: [] }),
        smartStore: jest.fn(),
        getRelatedLessons: jest.fn().mockReturnValue([])
      };
      manager = new AgentTeamManager(mockBrainApi);
    });

    it('should initialize 14 agents', () => {
      expect(Object.keys(manager._agents)).toHaveLength(14);
    });

    it('should have all agent types', () => {
      expect(manager._agents.IntentAgent).toBeInstanceOf(IntentAgent);
      expect(manager._agents.EmotionAgent).toBeInstanceOf(EmotionAgent);
      expect(manager._agents.ContextAgent).toBeInstanceOf(ContextAgent);
      expect(manager._agents.CodeAgent).toBeInstanceOf(CodeAgent);
      expect(manager._agents.SearchAgent).toBeInstanceOf(SearchAgent);
      expect(manager._agents.DebugAgent).toBeInstanceOf(DebugAgent);
      expect(manager._agents.OptimizeAgent).toBeInstanceOf(OptimizeAgent);
      expect(manager._agents.TestAgent).toBeInstanceOf(TestAgent);
      expect(manager._agents.QualityAgent).toBeInstanceOf(QualityAgent);
      expect(manager._agents.SecurityAgent).toBeInstanceOf(SecurityAgent);
      expect(manager._agents.EffectAgent).toBeInstanceOf(EffectAgent);
      expect(manager._agents.SummaryAgent).toBeInstanceOf(SummaryAgent);
      expect(manager._agents.ImprovementAgent).toBeInstanceOf(ImprovementAgent);
      expect(manager._agents.KnowledgeAgent).toBeInstanceOf(KnowledgeAgent);
    });

    describe('_routeTask', () => {
      it('should return fast for simple tasks', () => {
        expect(manager._routeTask('hi', { confidence: 0.9 })).toBe('fast');
      });

      it('should return full for complex tasks', () => {
        expect(manager._routeTask('implement architecture', { confidence: 0.5 })).toBe('full');
      });

      it('should return full for long input', () => {
        expect(manager._routeTask('a'.repeat(60), { confidence: 0.9 })).toBe('full');
      });

      it('should return full for optimization keywords', () => {
        expect(manager._routeTask('优化性能', { confidence: 0.9 })).toBe('full');
      });
    });

    describe('processTask', () => {
      it('should use fast route for simple tasks', async () => {
        const result = await manager.processTask('hi');
        expect(result.route).toBe('fast');
        expect(result.manager).toBe('v22.1 FastMode');
        expect(result.agentsUsed).toBe(2);
      });

      it('should use full route for complex tasks', async () => {
        const result = await manager.processTask('实现一个新的架构设计');
        expect(result.route).toBe('full');
        expect(result.manager).toBe('v22.1 FullMode');
        expect(result.stages).toBe(4);
        expect(result.agentsUsed).toBe(14);
      });

      it('should track stats', async () => {
        await manager.processTask('hi');
        expect(manager._teamStats.tasks).toBe(1);
        expect(manager._teamStats.completed).toBe(1);
      });

      it('should include time measurement', async () => {
        const result = await manager.processTask('hi');
        expect(result.time).toBeGreaterThanOrEqual(0);
      });

      it('should handle missing brainApi analyzeIntent', async () => {
        const mgr = new AgentTeamManager({});
        const result = await mgr.processTask('hi');
        expect(result.route).toBeDefined();
      });
    });

    describe('cache', () => {
      it('should set and get cache', () => {
        manager._setCache('key1', 'value1');
        expect(manager._getCache('key1')).toEqual({ value: 'value1', timestamp: expect.any(Number) });
      });

      it('should return undefined for missing cache key', () => {
        expect(manager._getCache('missing')).toBeUndefined();
      });

      it('should evict oldest when cache exceeds 100', () => {
        for (let i = 0; i < 105; i++) {
          manager._setCache(`key${i}`, `value${i}`);
        }
        // _setCache evicts when size > 100, so max size is 101
        expect(manager._cache.size).toBeLessThanOrEqual(101);
        expect(manager._getCache('key104')).toBeDefined();
      });
    });
  });

  describe('_AGENT_TEAMS', () => {
    it('should define 4 teams', () => {
      expect(Object.keys(_AGENT_TEAMS)).toHaveLength(4);
    });

    it('should have analysis team with 3 agents', () => {
      expect(_AGENT_TEAMS.analysis).toHaveLength(3);
    });

    it('should have execution team with 5 agents', () => {
      expect(_AGENT_TEAMS.execution).toHaveLength(5);
    });

    it('should have review team with 3 agents', () => {
      expect(_AGENT_TEAMS.review).toHaveLength(3);
    });

    it('should have learning team with 3 agents', () => {
      expect(_AGENT_TEAMS.learning).toHaveLength(3);
    });
  });
});
