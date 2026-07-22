const { RLSkillRecommender } = require('../../src/skills/recommendation/RLSkillRecommender');

describe('RLSkillRecommender', () => {
  let recommender;
  let mathRandomSpy;

  function createSkill(name, tags) {
    return { name, tags: tags || [] };
  }

  beforeAll(() => {
    mathRandomSpy = jest.spyOn(Math, 'random');
  });

  afterAll(() => {
    mathRandomSpy.mockRestore();
  });

  beforeEach(() => {
    recommender = new RLSkillRecommender();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(recommender.learningRate).toBe(0.1);
      expect(recommender.discountFactor).toBe(0.9);
      expect(recommender.explorationRate).toBe(0.1);
      expect(recommender.explorationDecay).toBe(0.99);
      expect(recommender.minExploration).toBe(0.01);
      expect(recommender.qTable).toBeInstanceOf(Map);
      expect(recommender.userModels).toBeInstanceOf(Map);
      expect(recommender.interactionHistory).toBeInstanceOf(Map);
      expect(recommender.rewardHistory).toEqual([]);
      expect(recommender.contextKeywords.size).toBe(8);
    });

    it('should accept custom options', () => {
      const custom = new RLSkillRecommender({
        learningRate: 0.2,
        discountFactor: 0.8,
        explorationRate: 0.3,
        explorationDecay: 0.95,
        minExploration: 0.05
      });
      expect(custom.learningRate).toBe(0.2);
      expect(custom.discountFactor).toBe(0.8);
      expect(custom.explorationRate).toBe(0.3);
      expect(custom.explorationDecay).toBe(0.95);
      expect(custom.minExploration).toBe(0.05);
    });
  });

  describe('_classifyContext', () => {
    it('should return general for empty/null/undefined input', () => {
      expect(recommender._classifyContext('')).toBe('general');
      expect(recommender._classifyContext(null)).toBe('general');
      expect(recommender._classifyContext(undefined)).toBe('general');
    });

    it('should classify document related text', () => {
      expect(recommender._classifyContext('生成报告文档')).toBe('document');
      expect(recommender._classifyContext('导出pdf文件')).toBe('document');
    });

    it('should classify analysis related text', () => {
      expect(recommender._classifyContext('数据分析统计')).toBe('analysis');
      expect(recommender._classifyContext('趋势图表')).toBe('analysis');
    });

    it('should classify finance related text', () => {
      expect(recommender._classifyContext('股票交易投资')).toBe('finance');
      expect(recommender._classifyContext('风险评估')).toBe('finance');
    });

    it('should classify healthcare related text', () => {
      expect(recommender._classifyContext('医疗健康诊断')).toBe('healthcare');
      expect(recommender._classifyContext('药物患者')).toBe('healthcare');
    });

    it('should classify legal related text', () => {
      expect(recommender._classifyContext('法律合同合规')).toBe('legal');
      expect(recommender._classifyContext('审查诉讼')).toBe('legal');
    });

    it('should classify manufacturing related text', () => {
      expect(recommender._classifyContext('生产质检')).toBe('manufacturing');
      expect(recommender._classifyContext('设备维护库存')).toBe('manufacturing');
    });

    it('should classify education related text', () => {
      expect(recommender._classifyContext('教学学生课程')).toBe('education');
      expect(recommender._classifyContext('作业考试')).toBe('education');
    });

    it('should classify retail related text', () => {
      expect(recommender._classifyContext('客户销售推荐')).toBe('retail');
      expect(recommender._classifyContext('客户销售')).toBe('retail');
    });

    it('should return general for unrelated text', () => {
      expect(recommender._classifyContext('hello world')).toBe('general');
    });
  });

  describe('_getUserLevel', () => {
    it('should return beginner for unknown user', () => {
      expect(recommender._getUserLevel('unknown')).toBe('beginner');
    });

    it('should return expert for high success rate over 50 calls', () => {
      recommender.userModels.set('expert_user', {
        successCount: 48,
        totalCalls: 52
      });
      expect(recommender._getUserLevel('expert_user')).toBe('expert');
    });

    it('should return intermediate for moderate success rate over 20 calls', () => {
      recommender.userModels.set('inter_user', {
        successCount: 18,
        totalCalls: 22
      });
      expect(recommender._getUserLevel('inter_user')).toBe('intermediate');
    });

    it('should return beginner for low success rate', () => {
      recommender.userModels.set('beginner_user', {
        successCount: 3,
        totalCalls: 10
      });
      expect(recommender._getUserLevel('beginner_user')).toBe('beginner');
    });

    it('should handle zero totalCalls gracefully', () => {
      recommender.userModels.set('new_user', {
        successCount: 0,
        totalCalls: 0
      });
      expect(recommender._getUserLevel('new_user')).toBe('beginner');
    });
  });

  describe('_getRecentSkills', () => {
    it('should return empty array for empty history', () => {
      expect(recommender._getRecentSkills([])).toEqual([]);
      expect(recommender._getRecentSkills(null)).toEqual([]);
      expect(recommender._getRecentSkills(undefined)).toEqual([]);
    });

    it('should return last 10 skill names', () => {
      const history = [];
      for (let i = 0; i < 15; i++) {
        history.push({ skill: `skill_${i}` });
      }
      const recent = recommender._getRecentSkills(history);
      expect(recent).toHaveLength(10);
      expect(recent[0]).toBe('skill_5');
      expect(recent[9]).toBe('skill_14');
    });

    it('should filter out entries without skill property', () => {
      const history = [
        { skill: 'a' },
        { note: 'no skill' },
        { skill: 'b' }
      ];
      expect(recommender._getRecentSkills(history)).toEqual(['a', 'b']);
    });
  });

  describe('getStateKey', () => {
    it('should produce consistent state key', () => {
      const key1 = recommender.getStateKey('数据分析', 'user1', [{ skill: 'skill_a' }]);
      const key2 = recommender.getStateKey('数据分析', 'user1', [{ skill: 'skill_a' }]);
      expect(key1).toBe(key2);
    });

    it('should include context type, user level and recent skills', () => {
      const key = recommender.getStateKey('生成报告', 'user1', [{ skill: 'doc_gen' }]);
      expect(key).toContain('document');
      expect(key).toContain('beginner');
      expect(key).toContain('doc_gen');
    });
  });

  describe('getQValue / setQValue', () => {
    it('should return 0 for unknown state-action pair', () => {
      expect(recommender.getQValue('unknown', 'action')).toBe(0);
    });

    it('should store and retrieve Q-values', () => {
      recommender.setQValue('state1', 'action1', 0.75);
      expect(recommender.getQValue('state1', 'action1')).toBe(0.75);
    });

    it('should allow updating existing Q-values', () => {
      recommender.setQValue('state1', 'action1', 0.5);
      recommender.setQValue('state1', 'action1', 0.9);
      expect(recommender.getQValue('state1', 'action1')).toBe(0.9);
    });
  });

  describe('_randomRecommend', () => {
    it('should return topK random skills with confidence 0.5', () => {
      mathRandomSpy.mockReturnValue(0.1);
      const skills = [
        createSkill('a'),
        createSkill('b'),
        createSkill('c'),
        createSkill('d')
      ];
      const result = recommender._randomRecommend(skills, 2);
      expect(result).toHaveLength(2);
      for (const item of result) {
        expect(item.confidence).toBe(0.5);
        expect(item.reason).toBe('探索推荐');
      }
    });

    it('should handle empty skills array', () => {
      const result = recommender._randomRecommend([], 3);
      expect(result).toEqual([]);
    });
  });

  describe('recommendSkills', () => {
    const skills = [
      createSkill('doc_gen', ['文档', '生成']),
      createSkill('data_vis', ['统计', '图表']),
      createSkill('stock_analysis', ['财务', '投资'])
    ];

    it('should use exploration when random < explorationRate', () => {
      mathRandomSpy.mockReturnValue(0.05);
      const result = recommender.recommendSkills('生成报告', 'user1', skills);
      expect(result).toHaveLength(3);
      for (const item of result) {
        expect(item.confidence).toBe(0.5);
        expect(item.reason).toBe('探索推荐');
      }
    });

    it('should use Q-learning when random >= explorationRate', () => {
      mathRandomSpy.mockReturnValue(0.5);
      const result = recommender.recommendSkills('生成报告', 'user1', skills, [], 2);
      expect(result).toHaveLength(2);
      for (const item of result) {
        expect(item.confidence).toBeGreaterThanOrEqual(0);
        expect(item.reason).toBeTruthy();
      }
    });

    it('should return topK results', () => {
      mathRandomSpy.mockReturnValue(0.5);
      expect(recommender.recommendSkills('test', 'user1', skills, [], 1)).toHaveLength(1);
      expect(recommender.recommendSkills('test', 'user1', skills, [], 10)).toHaveLength(3);
    });

    it('should handle empty availableSkills', () => {
      mathRandomSpy.mockReturnValue(0.5);
      const result = recommender.recommendSkills('test', 'user1', [], [], 3);
      expect(result).toEqual([]);
    });
  });

  describe('_calculateContextScore', () => {
    it('should return 0.5 for empty context', () => {
      expect(recommender._calculateContextScore(createSkill('x'), '')).toBe(0.5);
      expect(recommender._calculateContextScore(createSkill('x'), null)).toBe(0.5);
    });

    it('should return higher score for matching tags', () => {
      const skill = createSkill('doc_gen', ['文档', '报告', 'pdf']);
      const score = recommender._calculateContextScore(skill, '生成报告文档');
      expect(score).toBeGreaterThan(0.5);
    });

    it('should return 0 for completely non-matching tags', () => {
      const skill = createSkill('random', ['unrelated']);
      const score = recommender._calculateContextScore(skill, '数据统计');
      expect(score).toBe(0);
    });

    it('should cap score at 1', () => {
      const skill = createSkill('all_match', ['文档', '报告', '生成', 'pdf']);
      const score = recommender._calculateContextScore(skill, '生成报告文档');
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle skill without tags property', () => {
      const skill = { name: 'no_tags' };
      const score = recommender._calculateContextScore(skill, '生成报告文档');
      expect(score).toBe(0);
    });
  });

  describe('_calculateCollaborativeScore', () => {
    it('should return 0.5 for unknown user', () => {
      expect(recommender._calculateCollaborativeScore(createSkill('x'), 'unknown')).toBe(0.5);
    });

    it('should return 0.5 when user model has no skillSuccessRates', () => {
      recommender.userModels.set('user1', { skillSuccessRates: undefined });
      expect(recommender._calculateCollaborativeScore(createSkill('x'), 'user1')).toBe(0.5);
    });

    it('should return stored success rate for known skill', () => {
      const rates = new Map();
      rates.set('doc_gen', 0.85);
      recommender.userModels.set('user1', { skillSuccessRates: rates });

      expect(recommender._calculateCollaborativeScore(createSkill('doc_gen'), 'user1')).toBe(0.85);
    });

    it('should return 0.5 for unknown skill', () => {
      const rates = new Map();
      rates.set('other', 0.9);
      recommender.userModels.set('user1', { skillSuccessRates: rates });

      expect(recommender._calculateCollaborativeScore(createSkill('unknown'), 'user1')).toBe(0.5);
    });
  });

  describe('_explainRecommendation', () => {
    it('should return combined reasons', () => {
      const reason = recommender._explainRecommendation({
        qValue: 0.8,
        contextualScore: 0.7,
        collaborativeScore: 0.9
      }, 'state');
      expect(reason).toContain('使用历史');
      expect(reason).toContain('高度相关');
      expect(reason).toContain('好评率高');
    });

    it('should return default reason when no criteria met', () => {
      const reason = recommender._explainRecommendation({
        qValue: 0,
        contextualScore: 0,
        collaborativeScore: 0
      }, 'state');
      expect(reason).toBe('综合推荐');
    });
  });

  describe('updateQValue', () => {
    it('should update Q-value using Bellman equation', () => {
      recommender.setQValue('state', 'action', 0.5);
      const newQ = recommender.updateQValue('state', 'action', 1, 'next_state');

      const expected = 0.5 + 0.1 * (1 + 0.9 * 0 - 0.5);
      expect(newQ).toBeCloseTo(expected, 10);
    });

    it('should use provided maxNextQ when given', () => {
      recommender.setQValue('s', 'a', 0.5);
      const newQ = recommender.updateQValue('s', 'a', 1, 'ns', 0.8);

      const expected = 0.5 + 0.1 * (1 + 0.9 * 0.8 - 0.5);
      expect(newQ).toBeCloseTo(expected, 10);
    });

    it('should find max Q from existing entries when maxNextQ is null', () => {
      recommender.setQValue('s', 'a1', 0.5);
      recommender.setQValue('next_state', 'action_x', 0.7);
      recommender.setQValue('next_state', 'action_y', 0.3);

      recommender.setQValue('s', 'a', 0.5);
      const newQ = recommender.updateQValue('s', 'a', 1, 'next_state');

      const expected = 0.5 + 0.1 * (1 + 0.9 * 0.7 - 0.5);
      expect(newQ).toBeCloseTo(expected, 10);
    });
  });

  describe('_calculateReward', () => {
    it('should return 0 for no success, no rating, no feedback', () => {
      expect(recommender._calculateReward(false, 0, '')).toBe(0);
    });

    it('should add 1 for success', () => {
      expect(recommender._calculateReward(true, 0, '')).toBe(1);
    });

    it('should add 0.5 for rating >= 4', () => {
      expect(recommender._calculateReward(true, 4, '')).toBe(1.5);
    });

    it('should add additional 0.5 for rating === 5', () => {
      expect(recommender._calculateReward(true, 5, '')).toBe(2);
    });

    it('should add 1 for helpful feedback', () => {
      expect(recommender._calculateReward(true, 0, 'helpful')).toBe(2);
    });

    it('should subtract 1 for not_helpful feedback', () => {
      expect(recommender._calculateReward(false, 0, 'not_helpful')).toBe(-1);
    });

    it('should combine all factors', () => {
      expect(recommender._calculateReward(true, 5, 'helpful')).toBe(3);
    });
  });

  describe('recordInteraction', () => {
    it('should create user model for first interaction', () => {
      const result = recommender.recordInteraction('user1', 'doc_gen', '生成报告', true, 5, 'helpful');

      const model = recommender.userModels.get('user1');
      expect(model.totalCalls).toBe(1);
      expect(model.successCount).toBe(1);
      expect(model.lastInteraction).toBeGreaterThan(0);
      expect(recommender.interactionHistory.get('user1')).toHaveLength(1);
      expect(result.reward).toBe(3);
    });

    it('should update existing user model', () => {
      recommender.recordInteraction('user1', 's1', 'ctx', true, 3, '');
      recommender.recordInteraction('user1', 's2', 'ctx2', false, 1, '');

      const model = recommender.userModels.get('user1');
      expect(model.totalCalls).toBe(2);
      expect(model.successCount).toBe(1);
    });

    it('should update skill success rate with exponential moving average', () => {
      recommender.recordInteraction('user1', 's1', 'ctx', true, 3, '');
      const rate1 = recommender.userModels.get('user1').skillSuccessRates.get('s1');
      expect(rate1).toBeCloseTo(0.5 * 0.9 + 0.1, 5);

      recommender.recordInteraction('user1', 's1', 'ctx', false, 3, '');
      const rate2 = recommender.userModels.get('user1').skillSuccessRates.get('s1');
      expect(rate2).toBeCloseTo(rate1 * 0.9, 5);
    });

    it('should decay exploration rate', () => {
      const initialExploration = recommender.explorationRate;
      recommender.recordInteraction('user1', 's1', 'ctx', true, 3, '');
      expect(recommender.explorationRate).toBe(initialExploration * 0.99);
    });

    it('should not decay below minExploration', () => {
      recommender.explorationRate = 0.011;
      recommender.minExploration = 0.01;

      const _firstDecay = recommender.recordInteraction('user1', 's1', 'ctx', true, 3, '');
      expect(recommender.explorationRate).toBeCloseTo(0.01089, 5);
      expect(recommender.explorationRate).toBeGreaterThan(0.01);

      recommender.explorationRate = 0.0101;
      const _secondDecay = recommender.recordInteraction('user1', 's1', 'ctx', true, 3, '');
      expect(recommender.explorationRate).toBe(recommender.minExploration);
    });

    it('should record reward history', () => {
      recommender.recordInteraction('user1', 's1', 'ctx', true, 5, 'helpful');
      expect(recommender.rewardHistory).toHaveLength(1);
      expect(recommender.rewardHistory[0].userId).toBe('user1');
      expect(recommender.rewardHistory[0].skillName).toBe('s1');
      expect(recommender.rewardHistory[0].reward).toBe(3);
    });

    it('should return new exploration rate', () => {
      const result = recommender.recordInteraction('user1', 's1', 'ctx', true, 3, '');
      expect(result.newExplorationRate).toBe(recommender.explorationRate);
    });
  });

  describe('getProactiveSuggestion', () => {
    it('should return null when no skills available', () => {
      mathRandomSpy.mockReturnValue(0.5);
      const result = recommender.getProactiveSuggestion('test', 'user1', []);
      expect(result).toBeNull();
    });

    it('should return suggestion with template message', () => {
      mathRandomSpy.mockReturnValue(0.5);
      recommender.recommendSkills = jest.fn().mockReturnValue([
        { name: 'doc_gen', confidence: 0.75 }
      ]);
      mathRandomSpy.mockReturnValueOnce(0.5).mockReturnValueOnce(0);

      const result = recommender.getProactiveSuggestion('生成报告', 'user1', []);

      expect(result).not.toBeNull();
      expect(result.skill).toBeDefined();
      expect(result.message).toBeTruthy();
      expect(result.confidence).toBe(0.75);
    });
  });

  describe('exportModel', () => {
    it('should export empty model', () => {
      const exported = recommender.exportModel();
      expect(exported.qTable).toEqual([]);
      expect(exported.userModels).toEqual([]);
      expect(exported.explorationRate).toBe(0.1);
      expect(exported.rewardHistory).toEqual([]);
    });

    it('should export model with data', () => {
      recommender.setQValue('state', 'action', 0.75);
      recommender.recordInteraction('user1', 's1', 'ctx', true, 4, '');

      const exported = recommender.exportModel();
      expect(exported.qTable).toEqual([['state:action', 0.75]]);
      expect(exported.userModels).toHaveLength(1);
      expect(exported.rewardHistory).toHaveLength(1);
    });

    it('should convert Maps to arrays for serialization', () => {
      recommender.userModels.set('user1', {
        totalCalls: 5,
        successCount: 4,
        skillSuccessRates: new Map([['s1', 0.8]]),
        preferences: new Map([['theme', 'dark']]),
        lastInteraction: 1000
      });

      const exported = recommender.exportModel();
      const userEntry = exported.userModels[0];
      expect(Array.isArray(userEntry[1].skillSuccessRates)).toBe(true);
      expect(Array.isArray(userEntry[1].preferences)).toBe(true);
    });

    it('should limit rewardHistory to 1000 entries', () => {
      for (let i = 0; i < 1500; i++) {
        recommender.rewardHistory.push({ reward: i });
      }
      const exported = recommender.exportModel();
      expect(exported.rewardHistory).toHaveLength(1000);
    });
  });

  describe('importModel', () => {
    it('should throw for invalid input', () => {
      expect(() => recommender.importModel(null)).toThrow('Invalid model data');
      expect(() => recommender.importModel(undefined)).toThrow('Invalid model data');
      expect(() => recommender.importModel('string')).toThrow('Invalid model data');
    });

    it('should import qTable with validated entries', () => {
      recommender.importModel({
        qTable: [
          ['state:action1', 0.75],
          ['state:action2', 0.5],
          ['invalid_key', 'not_a_number'],
          ['bad_value', NaN],
          ['inf_value', Infinity]
        ]
      });

      expect(recommender.getQValue('state', 'action1')).toBe(0.75);
      expect(recommender.getQValue('state', 'action2')).toBe(0.5);
      expect(recommender.qTable.size).toBe(2);
    });

    it('should import user models with validated fields', () => {
      recommender.importModel({
        userModels: [
          ['user1', {
            totalCalls: 100,
            successCount: 80,
            skillSuccessRates: [['s1', 0.8], ['s2', 'invalid']],
            preferences: [['theme', 'dark']],
            lastInteraction: 1000
          }],
          ['user2', {
            totalCalls: -5,
            successCount: 999,
            skillSuccessRates: null,
            preferences: null
          }],
          ['user3', {
            totalCalls: 0,
            successCount: 10,
            skillSuccessRates: null,
            preferences: null
          }],
          ['user4', {
            totalCalls: null,
            successCount: Infinity,
            skillSuccessRates: null,
            preferences: null
          }],
          ['invalid_user', null]
        ]
      });

      expect(recommender.userModels.size).toBe(4);

      const m1 = recommender.userModels.get('user1');
      expect(m1.totalCalls).toBe(100);
      expect(m1.successCount).toBe(80);
      expect(m1.skillSuccessRates.get('s1')).toBe(0.8);
      expect(m1.skillSuccessRates.has('s2')).toBe(false);
      expect(m1.preferences.get('theme')).toBe('dark');

      const m2 = recommender.userModels.get('user2');
      expect(m2.totalCalls).toBe(0);
      expect(m2.successCount).toBe(0);

      const m3 = recommender.userModels.get('user3');
      expect(m3.totalCalls).toBe(0);
      expect(m3.successCount).toBe(0);

      const m4 = recommender.userModels.get('user4');
      expect(m4.totalCalls).toBe(0);
      expect(m4.successCount).toBe(0);
    });

    it('should import exploration rate with validation', () => {
      recommender.importModel({ explorationRate: 0.5 });
      expect(recommender.explorationRate).toBe(0.5);

      recommender.importModel({ explorationRate: 2 });
      expect(recommender.explorationRate).toBe(0.5);

      recommender.importModel({ explorationRate: -1 });
      expect(recommender.explorationRate).toBe(0.5);

      recommender.importModel({ explorationRate: 'invalid' });
      expect(recommender.explorationRate).toBe(0.5);
    });

    it('should preserve existing data when import fields are missing', () => {
      recommender.setQValue('existing', 'action', 0.5);
      recommender.importModel({ userModels: [], explorationRate: 0.2 });

      expect(recommender.getQValue('existing', 'action')).toBe(0.5);
      expect(recommender.explorationRate).toBe(0.2);
    });
  });

  describe('getStats', () => {
    it('should return zeros for empty recommender', () => {
      const stats = recommender.getStats();
      expect(stats.qTableSize).toBe(0);
      expect(stats.userModelsCount).toBe(0);
      expect(stats.totalInteractions).toBe(0);
      expect(stats.currentExplorationRate).toBe(0.1);
      expect(stats.averageReward).toBe(0);
    });

    it('should calculate average reward', () => {
      recommender.rewardHistory.push({ reward: 1 }, { reward: 2 }, { reward: 3 });

      const stats = recommender.getStats();
      expect(stats.totalInteractions).toBe(3);
      expect(stats.averageReward).toBe(2);
    });
  });
});
