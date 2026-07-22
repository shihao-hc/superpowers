const { TradingDecisionMaker, StockAnalysisDecisionMaker, BacktestDecisionMaker } = require('../../src/agent/BrainDecisionMaker');

let mockBrain;

jest.mock('../../src/agent/BrainAgent', () => jest.fn(() => mockBrain));

function resetMocks() {
  mockBrain = {
    thinkComplete: jest.fn().mockReturnValue({}),
    learnFromResult: jest.fn(),
    reverseThink: jest.fn().mockReturnValue({}),
    analyze: jest.fn().mockReturnValue({}),
    getStatus: jest.fn().mockReturnValue({ status: 'ready' }),
    getLessonSuggestions: jest.fn().mockReturnValue([]),
    brain: {
      reverseThinking: {
        premortem: jest.fn().mockReturnValue({}),
        fiveWhys: jest.fn().mockReturnValue({})
      }
    }
  };
}

function makeAnalysis(overrides) {
  return {
    perspectives: {
      technical: '技术面分析显示强势',
      risk: '低风险',
      fundamental: '基本面良好'
    },
    metaQuestions: {
      questions: {
        questions: []
      }
    },
    lessons: [],
    conclusion: '',
    ...overrides
  };
}

const highRiskAnalysis = makeAnalysis({
  perspectives: { risk: '高风险' }
});

const lossAnalysis = makeAnalysis({
  perspectives: { risk: '亏损' }
});

const noRiskAnalysis = makeAnalysis({
  perspectives: { risk: '无风险' }
});

describe('TradingDecisionMaker', () => {
  let maker;

  beforeEach(() => {
    resetMocks();
    maker = new TradingDecisionMaker();
  });

  describe('constructor', () => {
    test('should create BrainAgent when not provided', () => {
      expect(maker.brain).toBe(mockBrain);
      expect(maker.decisions).toEqual([]);
      expect(maker.version).toBe('1.0.0');
    });

    test('should use provided brain', () => {
      const customBrain = { thinkComplete: jest.fn(), learnFromResult: jest.fn() };
      const custom = new TradingDecisionMaker(customBrain);
      expect(custom.brain).toBe(customBrain);
    });
  });

  describe('shouldBuy', () => {
    test('should process buy decision with high confidence', async () => {
      mockBrain.thinkComplete.mockReturnValue(noRiskAnalysis);
      const result = await maker.shouldBuy('AAPL', 'golden_cross', 0.8);

      expect(mockBrain.thinkComplete).toHaveBeenCalledWith('股票 AAPL 出现买入信号，置信度 0.8');
      expect(result.action).toBe('buy');
      expect(result.ticker).toBe('AAPL');
      expect(result.signal).toBe('golden_cross');
      expect(result.confidence).toBe(0.8);
      expect(result.decision.recommendation).toBe('建议执行');
      expect(result.decision.approved).toBe(true);
      expect(result).toHaveProperty('timestamp');
      expect(mockBrain.learnFromResult).toHaveBeenCalledWith(
        '股票 AAPL 出现买入信号，置信度 0.8',
        'shouldBuy',
        '建议执行',
        true
      );
      expect(maker.decisions).toHaveLength(1);
    });

    test('should process buy decision with low confidence', async () => {
      mockBrain.thinkComplete.mockReturnValue(noRiskAnalysis);
      const result = await maker.shouldBuy('MSFT', 'rsi_oversold', 0.5);

      expect(result.decision.recommendation).toBe('谨慎执行');
      expect(result.decision.approved).toBe(false);
      expect(maker.decisions).toHaveLength(1);
    });

    test('should process buy decision with high risk', async () => {
      mockBrain.thinkComplete.mockReturnValue(highRiskAnalysis);
      const result = await maker.shouldBuy('TSLA', 'momentum', 0.9);

      expect(result.decision.recommendation).toBe('观望');
      expect(result.decision.approved).toBe(false);
    });
  });

  describe('shouldSell', () => {
    test('should process sell decision', async () => {
      mockBrain.thinkComplete.mockReturnValue(noRiskAnalysis);
      const result = await maker.shouldSell('AAPL', '100股', '止盈');

      expect(mockBrain.thinkComplete).toHaveBeenCalledWith('股票 AAPL 持仓 100股 需要考虑卖出，原因: 止盈');
      expect(result.action).toBe('sell');
      expect(result.ticker).toBe('AAPL');
      expect(result.position).toBe('100股');
      expect(result.reason).toBe('止盈');
      expect(result.decision.recommendation).toBe('谨慎执行');
      expect(mockBrain.learnFromResult).toHaveBeenCalled();
      expect(maker.decisions).toHaveLength(1);
    });

    test('should use confidence 0.5 for sell decisions', async () => {
      mockBrain.thinkComplete.mockReturnValue(noRiskAnalysis);
      const result = await maker.shouldSell('GOOGL', '50股', '止损');

      expect(result.decision.confidence).toBe(0.5);
    });
  });

  describe('assessRisk', () => {
    test('should return risk assessment with brain analysis', async () => {
      const analysis = makeAnalysis({
        perspectives: { risk: '高风险,需要密切关注市场变化', technical: '技术面分析显示强势突破信号', fundamental: '基本面良好,估值合理' }
      });
      mockBrain.thinkComplete.mockReturnValue(analysis);
      mockBrain.reverseThink.mockReturnValue({ potentialRisks: ['市场下跌'] });

      const portfolio = { dailyLoss: 0.04, maxExposure: 0.6 };
      const result = await maker.assessRisk(portfolio, '牛市');

      expect(mockBrain.thinkComplete).toHaveBeenCalledWith('投资组合面临风险: [object Object], 市场状态: 牛市');
      expect(mockBrain.reverseThink).toHaveBeenCalledWith('投资组合面临风险: [object Object], 市场状态: 牛市');
      expect(result.riskLevel).toBe('high');
      expect(result.brainAnalysis).toBe(analysis);
      expect(result.reverseAnalysis).toEqual({ potentialRisks: ['市场下跌'] });
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    test('should return unknown risk level for null portfolio', async () => {
      const result = await maker.assessRisk(null, '熊市');
      expect(result.riskLevel).toBe('unknown');
    });
  });

  describe('makeDecision', () => {
    test('should return 观望 for high risk analysis', () => {
      const result = maker.makeDecision(highRiskAnalysis, 0.9);
      expect(result.recommendation).toBe('观望');
      expect(result.approved).toBe(false);
      expect(result.confidence).toBe(0.9);
    });

    test('should return 观望 for loss-related analysis', () => {
      const result = maker.makeDecision(lossAnalysis, 0.9);
      expect(result.recommendation).toBe('观望');
      expect(result.approved).toBe(false);
    });

    test('should return 建议执行 when confident and no warnings', () => {
      const analysis = makeAnalysis({ perspectives: { risk: '低风险' } });
      const result = maker.makeDecision(analysis, 0.8);
      expect(result.recommendation).toBe('建议执行');
      expect(result.approved).toBe(true);
    });

    test('should return 谨慎执行 with moderate confidence', () => {
      const analysis = makeAnalysis({ perspectives: { risk: '低风险' } });
      const result = maker.makeDecision(analysis, 0.65);
      expect(result.recommendation).toBe('谨慎执行');
      expect(result.approved).toBe(true);
    });

    test('should return 谨慎执行 with low confidence', () => {
      const analysis = makeAnalysis({ perspectives: { risk: '低风险' } });
      const result = maker.makeDecision(analysis, 0.4);
      expect(result.recommendation).toBe('谨慎执行');
      expect(result.approved).toBe(false);
    });

    test('should not approve when confidence exactly 0.6', () => {
      const analysis = makeAnalysis({ perspectives: { risk: '低风险' } });
      const result = maker.makeDecision(analysis, 0.6);
      expect(result.recommendation).toBe('谨慎执行');
      expect(result.approved).toBe(false);
    });

    test('should not approve with 2 or more warnings', () => {
      const analysis = makeAnalysis({
        perspectives: { risk: '低风险' },
        metaQuestions: { questions: { questions: ['盲区', '证据不足'] } }
      });
      const result = maker.makeDecision(analysis, 0.8);
      expect(result.recommendation).toBe('建议执行');
      expect(result.approved).toBe(false);
      expect(result.warnings).toBe(2);
    });

    test('should track single warning', () => {
      const analysis = makeAnalysis({
        metaQuestions: { questions: { questions: ['盲区'] } }
      });
      const result = maker.makeDecision(analysis, 0.8);
      expect(result.approved).toBe(true);
      expect(result.warnings).toBe(1);
    });

    test('should handle null analysis', () => {
      const result = maker.makeDecision(null, 0.8);
      expect(result.recommendation).toBe('建议执行');
      expect(result.approved).toBe(true);
    });

    test('should handle missing perspectives', () => {
      const result = maker.makeDecision({}, 0.8);
      expect(result.recommendation).toBe('建议执行');
    });

    test('should handle string-type risk view', () => {
      const analysis = makeAnalysis({ perspectives: { risk: 12345 } });
      const result = maker.makeDecision(analysis, 0.8);
      expect(result.recommendation).toBe('建议执行');
    });

    test('should handle non-array metaQuestions', () => {
      const analysis = makeAnalysis({
        metaQuestions: { questions: { questions: null } }
      });
      const result = maker.makeDecision(analysis, 0.8);
      expect(result.recommendation).toBe('建议执行');
    });

    test('should include reasoning in result', () => {
      const analysis = makeAnalysis({
        perspectives: { risk: '低风险', technical: '技术面' }
      });
      const result = maker.makeDecision(analysis, 0.8);
      expect(result.reasoning).toBeTruthy();
    });

    test('should identify 盲区 in meta questions', () => {
      const analysis = makeAnalysis({
        metaQuestions: { questions: { questions: ['是否存在盲区', '其他问题'] } }
      });
      const result = maker.makeDecision(analysis, 0.8);
      expect(result.warnings).toBe(1);
    });

    test('should identify 证据 in meta questions', () => {
      const analysis = makeAnalysis({
        metaQuestions: { questions: { questions: ['其他问题', '有足够证据吗'] } }
      });
      const result = maker.makeDecision(analysis, 0.8);
      expect(result.warnings).toBe(1);
    });
  });

  describe('calculateRiskLevel', () => {
    test('should return unknown for null portfolio', () => {
      expect(maker.calculateRiskLevel(null)).toBe('unknown');
    });

    test('should return unknown for undefined portfolio', () => {
      expect(maker.calculateRiskLevel(undefined)).toBe('unknown');
    });

    test('should return low for minimal risk', () => {
      expect(maker.calculateRiskLevel({ dailyLoss: 0.005, maxExposure: 0.3 })).toBe('low');
    });

    test('should return low for empty portfolio', () => {
      expect(maker.calculateRiskLevel({})).toBe('low');
    });

    test('should return medium for loss > 0.01', () => {
      expect(maker.calculateRiskLevel({ dailyLoss: 0.02 })).toBe('medium');
    });

    test('should return medium for exposure > 0.5', () => {
      expect(maker.calculateRiskLevel({ maxExposure: 0.6 })).toBe('medium');
    });

    test('should return high for loss > 0.03', () => {
      expect(maker.calculateRiskLevel({ dailyLoss: 0.04 })).toBe('high');
    });

    test('should return high for exposure > 0.7', () => {
      expect(maker.calculateRiskLevel({ maxExposure: 0.8 })).toBe('high');
    });

    test('should return critical for loss > 0.05', () => {
      expect(maker.calculateRiskLevel({ dailyLoss: 0.06 })).toBe('critical');
    });

    test('should return critical for exposure > 0.9', () => {
      expect(maker.calculateRiskLevel({ maxExposure: 0.95 })).toBe('critical');
    });

    test('should prefer critical when both conditions overlap', () => {
      expect(maker.calculateRiskLevel({ dailyLoss: 0.06, maxExposure: 0.5 })).toBe('critical');
    });

    test('should handle exactly at threshold boundaries', () => {
      expect(maker.calculateRiskLevel({ dailyLoss: 0.05 })).toBe('high');
      expect(maker.calculateRiskLevel({ maxExposure: 0.9 })).toBe('high');
    });
  });

  describe('extractRecommendations', () => {
    test('should extract from long perspectives', () => {
      const analysis = makeAnalysis({
        perspectives: { technical: 'A'.repeat(20), risk: 'short' }
      });
      const recs = maker.extractRecommendations(analysis);
      expect(recs.length).toBe(1);
      expect(recs[0].source).toBe('technical');
    });

    test('should skip short perspectives', () => {
      const analysis = makeAnalysis({
        perspectives: { technical: 'short', risk: 'tiny' }
      });
      const recs = maker.extractRecommendations(analysis);
      const fromPerspectives = recs.filter(function(r) { return r.source !== 'lesson'; });
      expect(fromPerspectives).toHaveLength(0);
    });

    test('should extract from lessons', () => {
      const analysis = makeAnalysis({
        lessons: [{ lesson: '分散投资降低风险' }, { lesson: '止损设置' }]
      });
      const recs = maker.extractRecommendations(analysis);
      const fromLessons = recs.filter(function(r) { return r.source === 'lesson'; });
      expect(fromLessons.length).toBe(2);
      expect(fromLessons[0].recommendation).toBe('分散投资降低风险');
    });

    test('should use problem field if lesson field missing', () => {
      const analysis = makeAnalysis({
        lessons: [{ problem: '缺乏风险控制' }]
      });
      const recs = maker.extractRecommendations(analysis);
      expect(recs[0].recommendation).toBe('缺乏风险控制');
    });

    test('should limit to 2 lessons', () => {
      const analysis = makeAnalysis({
        lessons: [
          { lesson: 'L1' }, { lesson: 'L2' }, { lesson: 'L3' }
        ]
      });
      const recs = maker.extractRecommendations(analysis);
      const fromLessons = recs.filter(function(r) { return r.source === 'lesson'; });
      expect(fromLessons).toHaveLength(2);
    });

    test('should return empty array for empty analysis', () => {
      expect(maker.extractRecommendations({})).toEqual([]);
    });

    test('should handle null analysis', () => {
      expect(maker.extractRecommendations(null)).toEqual([]);
    });
  });

  describe('generateReasoning', () => {
    test('should include technical perspective', () => {
      const analysis = makeAnalysis({ perspectives: { technical: 'yes' } });
      expect(maker.generateReasoning(analysis)).toContain('技术视角支持此决策');
    });

    test('should include risk perspective', () => {
      const analysis = makeAnalysis({ perspectives: { risk: 'yes' } });
      expect(maker.generateReasoning(analysis)).toContain('风险需关注');
    });

    test('should include both perspectives', () => {
      const analysis = makeAnalysis({
        perspectives: { technical: 'yes', risk: 'yes' }
      });
      const reasoning = maker.generateReasoning(analysis);
      expect(reasoning).toContain('技术视角支持此决策');
      expect(reasoning).toContain('风险需关注');
    });

    test('should return fallback when no perspectives', () => {
      expect(maker.generateReasoning({})).toBe('基于综合分析');
    });

    test('should return fallback for null analysis', () => {
      expect(maker.generateReasoning(null)).toBe('基于综合分析');
    });

    test('should handle missing perspectives object', () => {
      const analysis = {};
      expect(maker.generateReasoning(analysis)).toBe('基于综合分析');
    });
  });

  describe('getHistory', () => {
    test('should return decisions array', () => {
      maker.decisions.push({ action: 'buy' });
      expect(maker.getHistory()).toHaveLength(1);
      expect(maker.getHistory()).toBe(maker.decisions);
    });
  });

  describe('getBrainStatus', () => {
    test('should return brain status', () => {
      mockBrain.getStatus.mockReturnValue({ status: 'active', lessons: 5 });
      expect(maker.getBrainStatus()).toEqual({ status: 'active', lessons: 5 });
    });
  });
});

describe('StockAnalysisDecisionMaker', () => {
  let maker;

  beforeEach(() => {
    resetMocks();
    maker = new StockAnalysisDecisionMaker();
  });

  describe('constructor', () => {
    test('should create BrainAgent when not provided', () => {
      expect(maker.brain).toBe(mockBrain);
    });

    test('should use provided brain', () => {
      const customBrain = { analyze: jest.fn() };
      const custom = new StockAnalysisDecisionMaker(customBrain);
      expect(custom.brain).toBe(customBrain);
    });
  });

  describe('analyzeStockSelection', () => {
    test('should analyze up to 5 candidates', async () => {
      mockBrain.thinkComplete.mockReturnValue({});
      mockBrain.analyze.mockReturnValue({ conclusion: '正向' });
      mockBrain.reverseThink.mockReturnValue({});
      mockBrain.getStatus.mockReturnValue({ status: 'ready' });

      const candidates = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META'];
      const result = await maker.analyzeStockSelection(candidates, '增长率');

      expect(mockBrain.thinkComplete).toHaveBeenCalledWith('从 6 只候选股票中选择最佳标的，标准: 增长率');
      expect(mockBrain.analyze).toHaveBeenCalledTimes(5);
      expect(mockBrain.reverseThink).toHaveBeenCalledTimes(3);
      expect(result.recommendation.best).toBeDefined();
      expect(result.brainStats).toEqual({ status: 'ready' });
    });

    test('should handle fewer than 5 candidates', async () => {
      mockBrain.thinkComplete.mockReturnValue({});
      mockBrain.analyze.mockReturnValue({});
      mockBrain.reverseThink.mockReturnValue({});

      const result = await maker.analyzeStockSelection(['AAPL', 'GOOGL'], '价值投资');
      expect(mockBrain.analyze).toHaveBeenCalledTimes(2);
      expect(mockBrain.reverseThink).toHaveBeenCalledTimes(2);
      expect(result.stockAnalysis).toBeDefined();
    });
  });

  describe('selectBest', () => {
    test('should sort and return best stock', () => {
      const stockAnalysis = {
        AAPL: { conclusion: '正向' },
        MSFT: { conclusion: '风险' },
        GOOGL: { conclusion: '普通' }
      };
      const result = maker.selectBest(stockAnalysis, 'growth');

      expect(result.best).toBe('AAPL');
      expect(result.alternatives).toHaveLength(2);
      expect(result.ranking).toHaveLength(3);
      expect(result.ranking[0].ticker).toBe('AAPL');
    });

    test('should handle empty stock analysis', () => {
      const result = maker.selectBest({}, 'growth');
      expect(result.best).toBeUndefined();
      expect(result.alternatives).toEqual([]);
      expect(result.ranking).toEqual([]);
    });

    test('should handle single candidate', () => {
      const stockAnalysis = { AAPL: { conclusion: '正向' } };
      const result = maker.selectBest(stockAnalysis, 'growth');
      expect(result.best).toBe('AAPL');
      expect(result.alternatives).toEqual([]);
      expect(result.ranking).toHaveLength(1);
    });

    test('should limit alternatives to 3', () => {
      const stockAnalysis = {
        A: { conclusion: '正向' },
        B: { conclusion: '正向' },
        C: { conclusion: '正向' },
        D: { conclusion: '正向' },
        E: { conclusion: '正向' }
      };
      const result = maker.selectBest(stockAnalysis, 'growth');
      expect(result.alternatives).toHaveLength(3);
    });
  });

  describe('calculateScore', () => {
    test('should return base 0.5 for neutral analysis', () => {
      expect(maker.calculateScore({})).toBe(0.5);
    });

    test('should add 0.2 for positive conclusion', () => {
      expect(maker.calculateScore({ conclusion: '正向' })).toBe(0.7);
    });

    test('should subtract 0.1 for risk conclusion', () => {
      expect(maker.calculateScore({ conclusion: '风险' })).toBe(0.4);
    });

    test('should apply both adjustments', () => {
      expect(maker.calculateScore({ conclusion: '正向风险' })).toBe(0.6);
    });

    test('should clamp to min 0 when score goes negative', () => {
      expect(maker.calculateScore({ conclusion: '风险' })).toBe(0.4);
    });

    test('should handle null analysis', () => {
      expect(maker.calculateScore(null)).toBe(0.5);
    });

    test('should not exceed base plus max adjustments', () => {
      expect(maker.calculateScore({ conclusion: '正向' })).toBe(0.7);
    });

    test('should handle missing conclusion', () => {
      expect(maker.calculateScore({})).toBe(0.5);
    });
  });
});

describe('BacktestDecisionMaker', () => {
  let maker;

  beforeEach(() => {
    resetMocks();
    maker = new BacktestDecisionMaker();
  });

  describe('constructor', () => {
    test('should create BrainAgent when not provided', () => {
      expect(maker.brain).toBe(mockBrain);
    });
  });

  describe('analyzeBacktestResult', () => {
    test('should perform full backtest analysis', async () => {
      const analysis = makeAnalysis({ perspectives: { risk: '中等' } });
      mockBrain.thinkComplete.mockReturnValue(analysis);

      const result = { return: 0.3, maxDrawdown: 0.12 };
      const output = await maker.analyzeBacktestResult(result, '趋势跟踪');

      expect(mockBrain.thinkComplete).toHaveBeenCalledWith('策略 趋势跟踪 回测结果: 收益 0.3%, 最大回撤 0.12%');
      expect(mockBrain.brain.reverseThinking.premortem).toHaveBeenCalled();
      expect(mockBrain.brain.reverseThinking.fiveWhys).toHaveBeenCalled();
      expect(output.result).toBe(result);
      expect(output.strategy).toBe('趋势跟踪');
      expect(output.analysis).toBe(analysis);
      expect(output.recommendations).toBeDefined();
      expect(output.decision).toBeDefined();
      expect(output).toHaveProperty('timestamp');
    });
  });

  describe('generateRecommendations', () => {
    test('should add positive rec for positive return', () => {
      const result = { return: 0.1, maxDrawdown: 0.05 };
      const recs = maker.generateRecommendations(result, {});
      expect(recs[0]).toEqual({ type: 'positive', text: '策略收益为正，具备盈利潜力' });
    });

    test('should add negative rec for negative return', () => {
      const result = { return: -0.05, maxDrawdown: 0.05 };
      const recs = maker.generateRecommendations(result, {});
      expect(recs[0]).toEqual({ type: 'negative', text: '策略亏损，需要调整参数或逻辑' });
    });

    test('should add zero return as negative', () => {
      const result = { return: 0, maxDrawdown: 0.05 };
      const recs = maker.generateRecommendations(result, {});
      expect(recs[0].type).toBe('negative');
    });

    test('should add risk rec for high drawdown', () => {
      const result = { return: 0.1, maxDrawdown: 0.25 };
      const recs = maker.generateRecommendations(result, {});
      const riskRecs = recs.filter(function(r) { return r.type === 'risk'; });
      expect(riskRecs).toHaveLength(1);
      expect(riskRecs[0].text).toBe('最大回撤超过20%，风险较高');
    });

    test('should not add risk rec for low drawdown', () => {
      const result = { return: 0.1, maxDrawdown: 0.15 };
      const recs = maker.generateRecommendations(result, {});
      const riskRecs = recs.filter(function(r) { return r.type === 'risk'; });
      expect(riskRecs).toHaveLength(0);
    });

    test('should add lesson rec when lessons exist', () => {
      mockBrain.getLessonSuggestions.mockReturnValue([
        { lesson: '严格止损', problem: '止损不严' }
      ]);
      const result = { return: 0.1, maxDrawdown: 0.05 };
      const recs = maker.generateRecommendations(result, {});
      const lessonRecs = recs.filter(function(r) { return r.type === 'lesson'; });
      expect(lessonRecs).toHaveLength(1);
      expect(lessonRecs[0].text).toBe('严格止损');
    });

    test('should use problem field when lesson field missing', () => {
      mockBrain.getLessonSuggestions.mockReturnValue([
        { problem: '回撤控制不足' }
      ]);
      const result = { return: 0.1, maxDrawdown: 0.05 };
      const recs = maker.generateRecommendations(result, {});
      const lessonRecs = recs.filter(function(r) { return r.type === 'lesson'; });
      expect(lessonRecs[0].text).toBe('回撤控制不足');
    });

    test('should skip lesson rec when no lessons', () => {
      mockBrain.getLessonSuggestions.mockReturnValue([]);
      const result = { return: 0.1, maxDrawdown: 0.05 };
      const recs = maker.generateRecommendations(result, {});
      const lessonRecs = recs.filter(function(r) { return r.type === 'lesson'; });
      expect(lessonRecs).toHaveLength(0);
    });

    test('should combine positive, risk and lesson recommendations', () => {
      mockBrain.getLessonSuggestions.mockReturnValue([
        { lesson: '分散投资' }
      ]);
      const result = { return: 0.2, maxDrawdown: 0.25 };
      const recs = maker.generateRecommendations(result, {});
      expect(recs).toHaveLength(3);
      expect(recs.map(function(r) { return r.type; })).toEqual(['positive', 'risk', 'lesson']);
    });
  });

  describe('makeDeploymentDecision', () => {
    test('should return deploy when risk-reward is good', () => {
      const result = { return: 0.5, maxDrawdown: 0.1 };
      const decision = maker.makeDeploymentDecision(result, {});
      expect(decision.decision).toBe('deploy');
      expect(decision.reason).toContain('可以小资金试运行');
      expect(decision.scores.totalScore).toBeGreaterThan(0.3);
    });

    test('should return deploy at boundary conditions', () => {
      const result = { return: 0.5, maxDrawdown: 0.14 };
      const decision = maker.makeDeploymentDecision(result, {});
      expect(decision.decision).toBe('deploy');
    });

    test('should return reject when totalScore is very negative', () => {
      const result = { return: -0.2, maxDrawdown: 0.1 };
      const decision = maker.makeDeploymentDecision(result, {});
      expect(decision.decision).toBe('reject');
      expect(decision.reason).toContain('暂不推荐');
    });

    test('should return reject when drawdown exceeds 0.3', () => {
      const result = { return: 0.4, maxDrawdown: 0.35 };
      const decision = maker.makeDeploymentDecision(result, {});
      expect(decision.decision).toBe('reject');
    });

    test('should return review when deploy criteria not met but not rejected', () => {
      const result = { return: 0.2, maxDrawdown: 0.2 };
      const decision = maker.makeDeploymentDecision(result, {});
      expect(decision.decision).toBe('review');
      expect(decision.reason).toBe('需要更多分析');
    });

    test('should return review when totalScore > 0.3 but drawdown too high', () => {
      const result = { return: 0.5, maxDrawdown: 0.2 };
      const decision = maker.makeDeploymentDecision(result, {});
      expect(decision.decision).toBe('review');
    });

    test('should return review for neutral performance', () => {
      const result = { return: 0.1, maxDrawdown: 0.18 };
      const decision = maker.makeDeploymentDecision(result, {});
      expect(decision.decision).toBe('review');
    });

    test('should reject when drawdown exactly 0.3', () => {
      const result = { return: 0, maxDrawdown: 0.3 };
      const decision = maker.makeDeploymentDecision(result, {});
      expect(decision.decision).toBe('reject');
    });

    test('should include score breakdown', () => {
      const result = { return: 0.5, maxDrawdown: 0.1 };
      const decision = maker.makeDeploymentDecision(result, {});
      expect(decision.scores).toEqual({
        riskScore: expect.any(Number),
        returnScore: expect.any(Number),
        totalScore: expect.any(Number)
      });
    });
  });
});
