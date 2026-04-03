/**
 * AgentState - 多智能体状态管理
 * 参考 TradingAgents-CN 的状态管理模式
 */

class AgentState {
  constructor(initialState = {}) {
    this.state = {
      id: initialState.id || this._generateId(),
      createdAt: initialState.createdAt || new Date().toISOString(),
      updatedAt: initialState.updatedAt || new Date().toISOString(),
      status: initialState.status || 'initialized',
      
      // 消息历史
      messages: initialState.messages || [],
      
      // 专家报告
      expertReports: initialState.expertReports || {},
      
      // 辩论状态
      debateState: initialState.debateState || {
        bullPosition: '',
        bearPosition: '',
        judgeDecision: '',
        round: 0,
        maxRounds: 3
      },
      
      // 决策结果
      decision: initialState.decision || null,
      
      // 错误记录
      errors: initialState.errors || [],
      
      // 自定义状态
      ...initialState.customState
    };
    
    this.listeners = new Map();
    this.history = [this._cloneState()];
  }
  
  _generateId() {
    return `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  _cloneState() {
    return JSON.parse(JSON.stringify(this.state));
  }
  
  // 获取当前状态
  getState() {
    return { ...this.state };
  }
  
  // 获取特定字段
  get(field) {
    return this.state[field];
  }
  
  // 更新状态
  set(updates, source = 'unknown') {
    const previousState = this._cloneState();
    
    this.state = {
      ...this.state,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this.history.push(this._cloneState());
    
    this._notifyListeners('update', {
      previousState,
      currentState: this.state,
      source,
      timestamp: this.state.updatedAt
    });
    
    return this;
  }
  
  // 添加消息
  addMessage(role, content, metadata = {}) {
    const message = {
      id: this._generateId(),
      role,
      content,
      metadata,
      timestamp: new Date().toISOString()
    };
    
    this.state.messages.push(message);
    this.state.updatedAt = message.timestamp;
    
    this._notifyListeners('message', message);
    
    return message;
  }
  
  // 添加专家报告
  addExpertReport(expertId, report, metadata = {}) {
    this.state.expertReports[expertId] = {
      report,
      metadata,
      timestamp: new Date().toISOString()
    };
    
    this._notifyListeners('expertReport', {
      expertId,
      report,
      metadata
    });
    
    return this;
  }
  
  // 获取所有专家报告
  getExpertReports() {
    return { ...this.state.expertReports };
  }
  
  // 更新辩论状态
  updateDebateState(updates) {
    this.state.debateState = {
      ...this.state.debateState,
      ...updates
    };
    
    this._notifyListeners('debateUpdate', this.state.debateState);
    
    return this;
  }
  
  // 增加辩论轮次
  incrementDebateRound() {
    this.state.debateState.round++;
    this._notifyListeners('roundIncrement', this.state.debateState.round);
    return this;
  }
  
  // 设置决策
  setDecision(decision, metadata = {}) {
    this.state.decision = {
      ...decision,
      metadata,
      decidedAt: new Date().toISOString()
    };
    this.state.status = 'decided';
    
    this._notifyListeners('decision', this.state.decision);
    
    return this;
  }
  
  // 添加错误
  addError(error, context = {}) {
    const errorRecord = {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      context,
      timestamp: new Date().toISOString()
    };
    
    this.state.errors.push(errorRecord);
    this._notifyListeners('error', errorRecord);
    
    return this;
  }
  
  // 状态转换验证
  canTransitionTo(newStatus) {
    const validTransitions = {
      initialized: ['running', 'cancelled'],
      running: ['decided', 'failed', 'cancelled'],
      decided: ['finalized'],
      failed: ['retrying'],
      retrying: ['running', 'failed'],
      cancelled: []
    };
    
    return validTransitions[this.state.status]?.includes(newStatus) || false;
  }
  
  // 执行状态转换
  transitionTo(newStatus, metadata = {}) {
    if (!this.canTransitionTo(newStatus)) {
      const error = new Error(
        `Invalid state transition: ${this.state.status} -> ${newStatus}`
      );
      this.addError(error, { attemptedTransition: newStatus });
      throw error;
    }
    
    this.set({ status: newStatus, ...metadata });
    return this;
  }
  
  // 获取状态快照
  snapshot() {
    return this._cloneState();
  }
  
  // 恢复到指定快照
  restore(snapshot) {
    this.state = typeof snapshot === 'string' 
      ? JSON.parse(snapshot) 
      : snapshot;
    this._notifyListeners('restore', this.state);
    return this;
  }
  
  // 获取历史
  getHistory() {
    return [...this.history];
  }
  
  // 订阅状态变化
  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }
  
  // 通知监听器
  _notifyListeners(event, data) {
    const eventListeners = this.listeners.get(event);
    const allListeners = this.listeners.get('*');
    
    [...(eventListeners || []), ...(allListeners || [])].forEach(callback => {
      try {
        callback(event, data, this.state);
      } catch (err) {
        console.error('[AgentState] Listener error:', err);
      }
    });
  }
  
  // 清理资源
  destroy() {
    this.listeners.clear();
    this.history = [];
  }
  
  // 序列化
  toJSON() {
    return this.getState();
  }
  
  // 反序列化
  static fromJSON(json) {
    return new AgentState(json);
  }
}

/**
 * 创建多专家状态管理器
 */
class MultiExpertState extends AgentState {
  constructor(experts = [], options = {}) {
    super();
    
    this.state.experts = experts.map(e => ({
      id: e.id || this._generateId(),
      name: e.name,
      role: e.role,
      status: 'idle',
      result: null,
      startedAt: null,
      completedAt: null,
      error: null
    }));
    
    this.state.maxParallelism = options.maxParallelism || 4;
    this.state.requiredExperts = options.requiredExperts || [];
    this.state.optionalExperts = options.optionalExperts || [];
  }
  
  // 获取专家状态
  getExpertStatus(expertId) {
    return this.state.experts.find(e => e.id === expertId);
  }
  
  // 开始专家工作
  startExpert(expertId) {
    const expert = this.getExpertStatus(expertId);
    if (!expert) return false;
    
    expert.status = 'running';
    expert.startedAt = new Date().toISOString();
    expert.error = null;
    
    this._notifyListeners('expertStart', expert);
    return true;
  }
  
  // 完成专家工作
  completeExpert(expertId, result) {
    const expert = this.getExpertStatus(expertId);
    if (!expert) return false;
    
    expert.status = 'completed';
    expert.result = result;
    expert.completedAt = new Date().toISOString();
    
    this.addExpertReport(expertId, result, { expert });
    this._notifyListeners('expertComplete', expert);
    
    return true;
  }
  
  // 标记专家失败
  failExpert(expertId, error) {
    const expert = this.getExpertStatus(expertId);
    if (!expert) return false;
    
    expert.status = 'failed';
    expert.error = error instanceof Error ? error.message : String(error);
    expert.completedAt = new Date().toISOString();
    
    this.addError(error, { expertId });
    this._notifyListeners('expertFail', expert);
    
    return true;
  }
  
  // 检查是否所有必需专家都完成
  isComplete() {
    const requiredCompleted = this.state.requiredExperts.every(id => {
      const expert = this.getExpertStatus(id);
      return expert?.status === 'completed';
    });
    
    return requiredCompleted;
  }
  
  // 获取完成统计
  getCompletionStats() {
    const stats = {
      total: this.state.experts.length,
      completed: 0,
      running: 0,
      failed: 0,
      idle: 0
    };
    
    for (const expert of this.state.experts) {
      stats[expert.status]++;
    }
    
    stats.requiredTotal = this.state.requiredExperts.length;
    stats.requiredCompleted = this.state.requiredExperts.filter(id => {
      const expert = this.getExpertStatus(id);
      return expert?.status === 'completed';
    }).length;
    
    return stats;
  }
}

module.exports = { AgentState, MultiExpertState };
