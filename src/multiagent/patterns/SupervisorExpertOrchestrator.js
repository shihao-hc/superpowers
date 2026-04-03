/**
 * SupervisorExpertOrchestrator - 主管-专家模式
 * 
 * 参考 TradingAgents-CN 的多智能体并发分析架构
 * 
 * 核心思想:
 * 1. Supervisor 协调多个 Expert 并发工作
 * 2. 收集所有 Expert 的结果
 * 3. 聚合结果生成最终输出
 * 
 * 使用场景:
 * - 多角度分析 (市场/基本面/新闻/情绪)
 * - 多维度评估 (安全/性能/代码质量)
 * - 并行数据获取
 */

const EventEmitter = require('events');
const { AgentState } = require('./AgentState');

class Expert {
  constructor(config) {
    this.id = config.id || this._generateId();
    this.name = config.name;
    this.role = config.role;
    this.description = config.description || '';
    this.capabilities = config.capabilities || [];
    this.enabled = config.enabled !== false;
  }
  
  _generateId() {
    return `expert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  async analyze(context, state) {
    throw new Error('Expert.analyze() must be implemented');
  }
  
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      description: this.description,
      capabilities: this.capabilities,
      enabled: this.enabled
    };
  }
}

class Supervisor {
  constructor(config = {}) {
    this.id = config.id || `supervisor_${Date.now()}`;
    this.name = config.name || 'Supervisor';
    this.role = config.role || 'coordinator';
    this.experts = new Map();
    this.maxParallelism = config.maxParallelism || 5;
    this.timeout = config.timeout || 120000;
    this.retries = config.retries || 2;
  }
  
  _generateId() {
    return `expert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  registerExpert(expert) {
    if (!(expert instanceof Expert)) {
      throw new Error('Must register an Expert instance');
    }
    
    if (!expert.enabled) {
      return this;
    }
    
    this.experts.set(expert.id, expert);
    return this;
  }
  
  unregisterExpert(expertId) {
    this.experts.delete(expertId);
    return this;
  }
  
  getExperts() {
    return Array.from(this.experts.values()).map(e => e.getInfo());
  }
  
  async analyze(context, options = {}) {
    const state = new AgentState({
      id: this.id,
      context,
      status: 'running'
    });
    
    state.addMessage('system', `Supervisor ${this.name} started analysis`);
    
    const expertResults = await this._runExpertsConcurrently(context, state, options);
    
    const aggregatedResult = await this._aggregateResults(expertResults, context, state);
    
    state.set({ status: 'completed' });
    state.addMessage('system', `Supervisor ${this.name} completed analysis`);
    
    return {
      success: true,
      results: expertResults,
      aggregated: aggregatedResult,
      state: state.getState(),
      metadata: {
        expertCount: expertResults.length,
        duration: new Date() - new Date(state.get('createdAt')),
        timestamp: new Date().toISOString()
      }
    };
  }
  
  async _runExpertsConcurrently(context, state, options = {}) {
    const enabledExperts = Array.from(this.experts.values()).filter(e => e.enabled);
    
    const tasks = enabledExperts.map(async (expert) => {
      const startTime = Date.now();
      
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          state.addMessage('system', `Expert ${expert.name} started (attempt ${attempt + 1})`);
          
          const result = await this._withTimeout(
            expert.analyze(context, state),
            this.timeout,
            `Expert ${expert.name} timed out`
          );
          
          const duration = Date.now() - startTime;
          
          state.addExpertReport(expert.id, result, {
            expert: expert.name,
            role: expert.role,
            duration,
            attempt
          });
          
          state.addMessage('system', `Expert ${expert.name} completed in ${duration}ms`);
          
          return {
            expertId: expert.id,
            expertName: expert.name,
            role: expert.role,
            success: true,
            result,
            duration,
            attempts: attempt + 1
          };
          
        } catch (error) {
          const isLastAttempt = attempt === this.retries;
          
          state.addError(error, { expert: expert.name, attempt });
          state.addMessage('system', 
            `Expert ${expert.name} failed (attempt ${attempt + 1}): ${error.message}`
          );
          
          if (isLastAttempt) {
            return {
              expertId: expert.id,
              expertName: expert.name,
              role: expert.role,
              success: false,
              error: error.message,
              attempts: attempt + 1
            };
          }
          
          await this._delay(1000 * Math.pow(2, attempt));
        }
      }
    });
    
    return Promise.all(tasks);
  }
  
  async _aggregateResults(results, context, state) {
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    
    const aggregated = {
      summary: this._generateSummary(successfulResults, failedResults),
      perspectives: successfulResults.map(r => ({
        expert: r.expertName,
        role: r.role,
        findings: r.result
      })),
      consensus: this._findConsensus(successfulResults),
      conflicts: this._identifyConflicts(successfulResults),
      failedExperts: failedResults.map(r => ({
        expert: r.expertName,
        error: r.error
      })),
      recommendations: this._generateRecommendations(successfulResults, context)
    };
    
    return aggregated;
  }
  
  _generateSummary(successful, failed) {
    return {
      totalExperts: successful.length + failed.length,
      successful: successful.length,
      failed: failed.length,
      successRate: (successful.length / (successful.length + failed.length) * 100).toFixed(1) + '%',
      timestamp: new Date().toISOString()
    };
  }
  
  _findConsensus(results) {
    if (results.length < 2) return null;
    
    const sentiments = results
      .filter(r => r.result?.sentiment)
      .map(r => r.result.sentiment);
    
    if (sentiments.length < 2) return null;
    
    const counts = {};
    sentiments.forEach(s => counts[s] = (counts[s] || 0) + 1);
    
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    
    if (sorted[0][1] / sentiments.length >= 0.6) {
      return {
        point: sorted[0][0],
        confidence: (sorted[0][1] / sentiments.length * 100).toFixed(1) + '%'
      };
    }
    
    return null;
  }
  
  _identifyConflicts(results) {
    const conflicts = [];
    
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const r1 = results[i];
        const r2 = results[j];
        
        if (r1.result?.sentiment && r2.result?.sentiment) {
          if (r1.result.sentiment !== r2.result.sentiment) {
            conflicts.push({
              experts: [r1.expertName, r2.expertName],
              issue: 'Sentiment mismatch',
              positions: [r1.result.sentiment, r2.result.sentiment]
            });
          }
        }
        
        if (r1.result?.recommendation && r2.result?.recommendation) {
          if (r1.result.recommendation !== r2.result.recommendation) {
            conflicts.push({
              experts: [r1.expertName, r2.expertName],
              issue: 'Recommendation mismatch',
              positions: [r1.result.recommendation, r2.result.recommendation]
            });
          }
        }
      }
    }
    
    return conflicts;
  }
  
  _generateRecommendations(results, context) {
    const recommendations = [];
    
    const sentiments = results
      .filter(r => r.result?.recommendation)
      .map(r => r.result.recommendation);
    
    if (sentiments.length > 0) {
      const recommendation = this._mostCommon(sentiments);
      if (recommendation) {
        recommendations.push({
          type: 'primary',
          recommendation,
          confidence: (sentiments.filter(s => s === recommendation).length / sentiments.length * 100).toFixed(0) + '%'
        });
      }
    }
    
    const risks = results
      .filter(r => r.result?.risks)
      .flat()
      .map(r => r.description || r);
    
    if (risks.length > 0) {
      recommendations.push({
        type: 'risk',
        items: [...new Set(risks)].slice(0, 5)
      });
    }
    
    return recommendations;
  }
  
  _mostCommon(arr) {
    if (arr.length === 0) return null;
    const counts = {};
    arr.forEach(item => counts[item] = (counts[item] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
  
  async _withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(message)), ms)
      )
    ]);
  }
  
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

function createSupervisor(config) {
  return new Supervisor(config);
}

function createExpert(config) {
  return new Expert(config);
}

module.exports = {
  Supervisor,
  Expert,
  createSupervisor,
  createExpert
};
