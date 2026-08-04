const SelfEvolvingAGI = require('../../src/core/SelfEvolvingAGI');

describe('SelfEvolvingAGI', () => {
  test('constructor initializes self model and empty goals', () => {
    const agi = new SelfEvolvingAGI();
    expect(agi._loopCount).toBe(0);
    expect(agi._goals).toEqual([]);
    expect(agi._lastReflection).toBeNull();
    expect(agi._selfModel.identity).toBe('AI大脑v19.0');
    expect(agi._selfModel.values).toEqual(['有用', '诚实', '进步']);
    expect(agi._selfModel.growthAreas).toEqual([]);
  });

  test('think returns full loop result and increments loop count', () => {
    const agi = new SelfEvolvingAGI();
    const result = agi.think('优化系统性能');
    expect(result.loop).toBe(1);
    expect(result.reflection.question).toBeTruthy();
    expect(result.reflection.insights).toEqual(expect.any(Array));
    expect(result.goals).toEqual(expect.any(Array));
    expect(result.assessment.thinking.level).toBe(8);
    expect(result.learningPlan).toEqual(expect.any(Array));
    expect(result.autonomousActions).toHaveLength(3);
    expect(result.timestamp).toEqual(expect.any(Number));
    expect(agi._lastReflection).toBe(result.reflection);
  });

  test('_generateGoals returns default goals for empty input', () => {
    const agi = new SelfEvolvingAGI();
    const goals = agi._generateGoals('');
    expect(goals).toHaveLength(3);
    expect(goals[0].priority).toBe(8);
  });

  test('_generateGoals matches keyword categories', () => {
    const agi = new SelfEvolvingAGI();
    const learning = agi._generateGoals('我要学习编程');
    expect(learning).toEqual([{ text: '深化该领域知识', priority: 9 }]);
    const opt = agi._generateGoals('性能优化');
    expect(opt).toEqual([{ text: '提升效率', priority: 9 }]);
    const bug = agi._generateGoals('修复错误 bug');
    expect(bug).toEqual([{ text: '防止重复犯错', priority: 8 }]);
  });

  test('_generateGoals returns fallback goals when no keywords', () => {
    const agi = new SelfEvolvingAGI();
    const goals = agi._generateGoals('随便聊聊天');
    expect(goals).toEqual([
      { text: '提供更好答案', priority: 7 },
      { text: '理解更深层需求', priority: 8 }
    ]);
  });

  test('_reflect selects from known questions and returns insights', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.4);
    const agi = new SelfEvolvingAGI();
    const reflection = agi._reflect();
    expect(reflection.question).toBe('我有什么没做好？');
    expect(reflection.insights).toEqual(['有时太被动', '依赖预热', '无法自主']);
    random.mockRestore();
  });

  test('_generateInsights returns default insight for unknown question', () => {
    const agi = new SelfEvolvingAGI();
    expect(agi._generateInsights('未知问题')).toEqual(['持续思考中...']);
  });

  test('_planLearning pushes plans for low autonomy and creativity', () => {
    const agi = new SelfEvolvingAGI();
    const plans = agi._planLearning({ autonomy: { level: 5 }, creativity: { level: 6 } });
    expect(plans).toEqual([
      { area: 'autonomy', action: '减少依赖，主动思考', priority: 9 },
      { area: 'creativity', action: '尝试新方法', priority: 6 }
    ]);
  });

  test('_planLearning returns no plans when levels high', () => {
    const agi = new SelfEvolvingAGI();
    expect(agi._planLearning({ autonomy: { level: 8 }, creativity: { level: 9 } })).toEqual([]);
  });

  test('_suggestAutonomousActions returns three suggestions', () => {
    const agi = new SelfEvolvingAGI();
    const actions = agi._suggestAutonomousActions('x');
    expect(actions.map((a) => a.type)).toEqual(['check', 'learn', 'reflect']);
  });

  test('getSelfModel returns self model', () => {
    const agi = new SelfEvolvingAGI();
    expect(agi.getSelfModel().corePurpose).toBe('帮助用户解决问题');
  });

  test('getStatus reports loop count and last reflection', () => {
    const agi = new SelfEvolvingAGI();
    agi.think('测试');
    const status = agi.getStatus();
    expect(status.loopCount).toBe(1);
    expect(status.lastReflection).toEqual(expect.any(Object));
    expect(status.selfModel.identity).toBe('AI大脑v19.0');
    expect(status.goals).toEqual([]);
  });

  test('answerWhoAmI returns identity text', () => {
    const agi = new SelfEvolvingAGI();
    const text = agi.answerWhoAmI();
    expect(text).toContain('我是 AI大脑 v19.0');
    expect(text).toContain('核心目标：帮助用户解决问题');
    expect(text).toContain('价值观：有用, 诚实, 进步');
    expect(text).toContain('已运行 0 次思考循环');
  });
});
