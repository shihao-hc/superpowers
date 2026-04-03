/**
 * DebateDecisionManager - 辩论-决策模式
 * 
 * 参考 TradingAgents-CN 的研究员辩论架构
 * 
 * 核心思想:
 * 1. Bull (看涨方) 和 Bear (看跌方) 展开辩论
 * 2. 中立的 Judge (裁判) 评估双方观点
 * 3. 综合输出最终决策
 * 
 * 使用场景:
 * - 投资决策 (买入vs卖出)
 * - 代码审查 (接受vs拒绝)
 * - 策略评估 (执行vs放弃)
 */

const EventEmitter = require('events');
const { AgentState } = require('./AgentState');

class Debater {
  constructor(config) {
    this.id = config.id || `debater_${Date.now()}`;
    this.name = config.name;
    this.stance = config.stance;
    this.role = config.role;
    this.prompt = config.prompt || '';
    this.llmAdapter = config.llmAdapter;
  }
  
  async argue(context, debateHistory, state) {
    throw new Error('Debater.argue() must be implemented');
  }
  
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      stance: this.stance,
      role: this.role
    };
  }
}

class BullDebater extends Debater {
  constructor(config = {}) {
    super({
      name: config.name || 'Bull',
      stance: 'bullish',
      role: 'bull',
      ...config
    });
    
    this.defaultPrompt = `
你是一个看涨分析师。请基于以下信息，论证为什么应该采取积极行动：

背景信息:
{context}

历史辩论:
{history}

请提供:
1. 支持积极行动的理由 (至少3点)
2. 预期收益
3. 风险评估 (尽管你是看涨方，也应客观)
4. 最终建议
`.trim();
  }
  
  async argue(context, debateHistory, state) {
    const prompt = this.prompt || this.defaultPrompt;
    const formattedPrompt = prompt
      .replace('{context}', JSON.stringify(context, null, 2))
      .replace('{history}', debateHistory);
    
    if (this.llmAdapter) {
      const response = await this.llmAdapter.generate(formattedPrompt);
      return this._parseResponse(response);
    }
    
    return this._generateFallback(context);
  }
  
  _generateFallback(context) {
    return {
      stance: 'bullish',
      arguments: [
        '市场存在上行潜力',
        '基本面支持看涨观点',
        '技术指标显示积极信号'
      ],
      confidence: 0.7,
      recommendation: 'proceed'
    };
  }
  
  _parseResponse(response) {
    try {
      return {
        stance: 'bullish',
        content: response,
        confidence: this._extractConfidence(response),
        recommendation: 'proceed'
      };
    } catch {
      return this._generateFallback({});
    }
  }
  
  _extractConfidence(text) {
    const match = text.match(/confidence[:\s]*(\d+\.?\d*)/i);
    return match ? parseFloat(match[1]) : 0.7;
  }
}

class BearDebater extends Debater {
  constructor(config = {}) {
    super({
      name: config.name || 'Bear',
      stance: 'bearish',
      role: 'bear',
      ...config
    });
    
    this.defaultPrompt = `
你是一个看跌分析师。请基于以下信息，论证为什么应该谨慎或放弃：

背景信息:
{context}

历史辩论:
{history}

请提供:
1. 反对或谨慎的理由 (至少3点)
2. 潜在风险
3. 下行空间评估
4. 最终建议
`.trim();
  }
  
  async argue(context, debateHistory, state) {
    const prompt = this.prompt || this.defaultPrompt;
    const formattedPrompt = prompt
      .replace('{context}', JSON.stringify(context, null, 2))
      .replace('{history}', debateHistory);
    
    if (this.llmAdapter) {
      const response = await this.llmAdapter.generate(formattedPrompt);
      return this._parseResponse(response);
    }
    
    return this._generateFallback(context);
  }
  
  _generateFallback(context) {
    return {
      stance: 'bearish',
      arguments: [
        '存在下行风险',
        '市场不确定性增加',
        '需要更多验证'
      ],
      confidence: 0.6,
      recommendation: 'caution'
    };
  }
  
  _parseResponse(response) {
    try {
      return {
        stance: 'bearish',
        content: response,
        confidence: this._extractConfidence(response),
        recommendation: 'caution'
      };
    } catch {
      return this._generateFallback({});
    }
  }
  
  _extractConfidence(text) {
    const match = text.match(/confidence[:\s]*(\d+\.?\d*)/i);
    return match ? parseFloat(match[1]) : 0.6;
  }
}

class Judge {
  constructor(config = {}) {
    this.id = config.id || `judge_${Date.now()}`;
    this.name = config.name || 'Judge';
    this.llmAdapter = config.llmAdapter;
    this.bias = config.bias || 0;
  }
  
  async decide(bullArgument, bearArgument, context, state) {
    const prompt = this._buildDecisionPrompt(bullArgument, bearArgument, context);
    
    if (this.llmAdapter) {
      const response = await this.llmAdapter.generate(prompt);
      return this._parseDecision(response, bullArgument, bearArgument);
    }
    
    return this._generateFallbackDecision(bullArgument, bearArgument);
  }
  
  _buildDecisionPrompt(bull, bear, context) {
    return `
作为一个中立的决策者，请评估以下双方观点并做出最终决定：

看涨方观点:
${JSON.stringify(bull, null, 2)}

看跌方观点:
${JSON.stringify(bear, null, 2)}

背景信息:
${JSON.stringify(context, null, 2)}

请提供:
1. 决策结果 (proceed/caution/abort)
2. 决策理由
3. 置信度 (0-1)
4. 附加建议

格式要求:
decision: [proceed|caution|abort]
confidence: [0-1]
reasoning: [你的推理过程]
`.trim();
  }
  
  _parseDecision(text, bull, bear) {
    const decisionMatch = text.match(/decision:\s*(\w+)/i);
    const confidenceMatch = text.match(/confidence:\s*(\d+\.?\d*)/i);
    const reasoningMatch = text.match(/reasoning:\s*([\s\S]+?)(?=\n\n|$)/i);
    
    const bullScore = bull.confidence || 0.5;
    const bearScore = bear.confidence || 0.5;
    const biasAdjusted = this.bias;
    
    return {
      decision: decisionMatch ? decisionMatch[1].toLowerCase() : 
        (bullScore > bearScore + biasAdjusted ? 'proceed' : 'caution'),
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 
        Math.max(bullScore, bearScore),
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : '基于双方论点的评估',
      bullPerspective: bull.stance === 'bullish',
      bearPerspective: bear.stance === 'bearish',
      timestamp: new Date().toISOString()
    };
  }
  
  _generateFallbackDecision(bull, bear) {
    const bullScore = bull.confidence || 0.5;
    const bearScore = bear.confidence || 0.5;
    const biasAdjusted = this.bias;
    
    let decision;
    if (bullScore > bearScore + biasAdjusted + 0.15) {
      decision = 'proceed';
    } else if (bearScore > bullScore + biasAdjusted + 0.15) {
      decision = 'abort';
    } else {
      decision = 'caution';
    }
    
    return {
      decision,
      confidence: Math.max(bullScore, bearScore) * 0.8,
      reasoning: '基于双方置信度的比较分析',
      bullPerspective: bullScore > bearScore,
      bearPerspective: bearScore > bullScore,
      timestamp: new Date().toISOString()
    };
  }
}

class DebateManager {
  constructor(config = {}) {
    this.id = config.id || `debate_${Date.now()}`;
    this.name = config.name || 'DebateManager';
    this.maxRounds = config.maxRounds || 3;
    this.convergenceThreshold = config.convergenceThreshold || 0.8;
    
    this.bull = config.bull || new BullDebater(config.bullConfig);
    this.bear = config.bear || new BearDebater(config.bearConfig);
    this.judge = config.judge || new Judge(config.judgeConfig);
    
    this.state = null;
    this.history = [];
  }
  
  async debate(context, options = {}) {
    const initialState = new AgentState({
      id: this.id,
      context,
      status: 'running',
      round: 0,
      debateState: {
        bullPosition: '',
        bearPosition: '',
        judgeDecision: '',
        history: []
      }
    });
    
    this.state = initialState;
    this.history = [];
    
    initialState.addMessage('system', `辩论开始: ${this.name}`);
    initialState.addMessage('user', JSON.stringify(context));
    
    let finalDecision = null;
    let round = 0;
    let converged = false;
    
    while (round < this.maxRounds && !converged) {
      round++;
      initialState.updateDebateState({ round });
      initialState.addMessage('system', `=== 第 ${round} 轮辩论 ===`);
      
      const [bullArg, bearArg] = await Promise.all([
        this.bull.argue(context, this._formatHistory(), initialState),
        this.bear.argue(context, this._formatHistory(), initialState)
      ]);
      
      initialState.updateDebateState({
        bullPosition: bullArg,
        bearPosition: bearArg
      });
      
      this.history.push({ round, bull: bullArg, bear: bearArg });
      
      initialState.addMessage('bull', JSON.stringify(bullArg));
      initialState.addMessage('bear', JSON.stringify(bearArg));
      
      const decision = await this.judge.decide(bullArg, bearArg, context, initialState);
      
      initialState.updateDebateState({ judgeDecision: decision });
      initialState.addMessage('judge', JSON.stringify(decision));
      
      if (decision.confidence >= this.convergenceThreshold) {
        converged = true;
        finalDecision = decision;
        initialState.addMessage('system', `置信度达到阈值 ${this.convergenceThreshold}，辩论收敛`);
      }
      
      if (round < this.maxRounds && !converged) {
        await this._delay(100);
      }
    }
    
    if (!finalDecision) {
      finalDecision = await this.judge.decide(
        this.history[this.history.length - 1]?.bull || {},
        this.history[this.history.length - 1]?.bear || {},
        context,
        initialState
      );
      initialState.addMessage('system', `达到最大轮次 ${this.maxRounds}，使用最终评估`);
    }
    
    initialState.setDecision(finalDecision);
    initialState.set({ status: 'completed' });
    initialState.addMessage('system', `辩论结束: ${finalDecision.decision}`);
    
    return {
      success: true,
      rounds: this.history.length,
      converged,
      history: this.history,
      decision: finalDecision,
      state: initialState.getState()
    };
  }
  
  _formatHistory() {
    return this.history.map(h => 
      `第${h.round}轮:\n看涨: ${JSON.stringify(h.bull)}\n看跌: ${JSON.stringify(h.bear)}`
    ).join('\n\n');
  }
  
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  getHistory() {
    return [...this.history];
  }
}

function createDebateManager(config) {
  return new DebateManager(config);
}

function createBullDebater(config) {
  return new BullDebater(config);
}

function createBearDebater(config) {
  return new BearDebater(config);
}

function createJudge(config) {
  return new Judge(config);
}

module.exports = {
  DebateManager,
  Debater,
  BullDebater,
  BearDebater,
  Judge,
  createDebateManager,
  createBullDebater,
  createBearDebater,
  createJudge
};
