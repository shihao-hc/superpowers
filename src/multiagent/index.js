/**
 * UltraWork Multi-Agent Patterns
 * 可复用的多智能体协作设计模式
 * 
 * 基于 TradingAgents-CN 项目提炼的通用模式:
 * 1. Supervisor-Expert (主管-专家模式)
 * 2. Debate-Decision (辩论-决策模式)
 * 3. LLM Unified Adapter (LLM统一适配器)
 * 4. Multi-level Cache (多级缓存策略)
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

module.exports = {
  SupervisorExpertOrchestrator: require('./patterns/SupervisorExpertOrchestrator'),
  DebateDecisionManager: require('./patterns/DebateDecisionManager'),
  BaseLLMAdapter: require('./patterns/BaseLLMAdapter'),
  MultiLevelCache: require('./patterns/MultiLevelCache'),
  AgentState: require('./patterns/AgentState'),
};
