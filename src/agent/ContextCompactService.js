/**
 * ShiHao Context Compact Service
 * 基于 Claude Code 上下文压缩系统架构
 * 
 * Claude Code 特性:
 * - 自动压缩: 当上下文接近 token 上限时自动触发
 * - 微压缩: 轻量级压缩，用于轻微超出限制
 * - 部分压缩: 只压缩消息的一部分
 * - Token 预算管理: 预留输出 token
 */

const EventEmitter = require('events');

class ContextCompactService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Token 配置
    this.maxTokens = options.maxTokens || 100000;
    this.bufferTokens = options.bufferTokens || 13000;
    this.warningThreshold = options.warningThreshold || 20000;
    this.preserveRecentMessages = options.preserveRecentMessages || 10;
    this.maxSummaryTokens = options.maxSummaryTokens || 5000;
    
    // 自动压缩配置
    this.autoCompactEnabled = options.autoCompactEnabled !== false;
    this.consecutiveFailureLimit = options.consecutiveFailureLimit || 3;
    
    // 状态
    this.messages = [];
    this.tokenCount = 0;
    this.compactionHistory = [];
    this.consecutiveFailures = 0;
    this.lastCompactTime = null;
    this.turnCounter = 0;
    
    // Token 估算函数
    this.tokenEstimator = options.tokenEstimator || this._defaultTokenEstimator;
  }
  
  // 默认 token 估算 (约 4 字符 = 1 token)
  _defaultTokenEstimator(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
  
  // 添加消息
  addMessage(message) {
    this.messages.push({
      ...message,
      timestamp: message.timestamp || Date.now(),
      uuid: message.uuid || this._generateUUID()
    });
    this._updateTokenCount();
    this.turnCounter++;
  }
  
  // 获取消息
  getMessages() {
    return [...this.messages];
  }
  
  // 更新 token 计数
  _updateTokenCount() {
    this.tokenCount = this._calculateTotalTokens();
  }
  
  // 计算总 token 数
  _calculateTotalTokens() {
    let total = 0;
    
    for (const msg of this.messages) {
      if (msg.content) {
        if (typeof msg.content === 'string') {
          total += this.tokenEstimator(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.text) {
              total += this.tokenEstimator(block.text);
            }
          }
        }
      }
    }
    
    return total;
  }
  
  // 获取当前 token 状态
  getTokenState() {
    const effectiveMax = this.maxTokens - this.bufferTokens;
    const percentLeft = ((this.maxTokens - this.tokenCount) / this.maxTokens) * 100;
    const isAboveWarning = this.tokenCount > (this.maxTokens - this.warningThreshold);
    const isAboveAutoCompact = this.tokenCount > effectiveMax;
    
    return {
      current: this.tokenCount,
      max: this.maxTokens,
      available: this.maxTokens - this.tokenCount,
      percentLeft: Math.max(0, percentLeft),
      isAboveWarning,
      isAboveAutoCompact,
      effectiveThreshold: effectiveMax
    };
  }
  
  // 检查是否需要压缩
  shouldCompact() {
    const state = this.getTokenState();
    return state.isAboveAutoCompact;
  }
  
  // 检查是否显示警告
  shouldWarn() {
    const state = this.getTokenState();
    return state.isAboveWarning;
  }
  
  // 执行压缩
  async compact(context = {}) {
    const preTokens = this.tokenCount;
    const startTime = Date.now();
    
    try {
      // 生成摘要
      const summary = await this._generateSummary(context);
      
      // 保留最近消息
      const kept = this.messages.slice(-this.preserveRecentMessages);
      
      // 构建压缩后的消息
      const boundaryMessage = {
        type: 'system',
        role: 'system',
        content: `[Earlier conversation summarized. ${preTokens} → ${summary.tokens} tokens]`,
        isCompactBoundary: true,
        timestamp: Date.now(),
        uuid: this._generateUUID()
      };
      
      this.messages = [
        boundaryMessage,
        summary.message,
        ...kept
      ];
      
      this._updateTokenCount();
      this.consecutiveFailures = 0;
      this.lastCompactTime = Date.now();
      
      const result = {
        success: true,
        preTokens,
        postTokens: this.tokenCount,
        tokensSaved: preTokens - this.tokenCount,
        duration: Date.now() - startTime,
        boundary: boundaryMessage,
        summary: summary.text
      };
      
      this.compactionHistory.push(result);
      this.emit('compact', result);
      
      return result;
      
    } catch (error) {
      this.consecutiveFailures++;
      
      const result = {
        success: false,
        error: error.message,
        preTokens,
        duration: Date.now() - startTime,
        consecutiveFailures: this.consecutiveFailures
      };
      
      this.emit('compactError', result);
      
      // 如果连续失败太多，停止自动压缩
      if (this.consecutiveFailures >= this.consecutiveFailureLimit) {
        this.autoCompactEnabled = false;
        this.emit('autoCompactDisabled', { 
          reason: 'consecutive_failures',
          failures: this.consecutiveFailures 
        });
      }
      
      throw error;
    }
  }
  
  // 生成摘要
  async _generateSummary(context) {
    const llm = context.llm || this._defaultSummarizer;
    
    // 获取待压缩的消息
    const messagesToSummarize = this.messages.slice(
      0, 
      -(this.preserveRecentMessages)
    );
    
    if (messagesToSummarize.length === 0) {
      return {
        text: '',
        tokens: 0,
        message: null
      };
    }
    
    // 提取文本内容
    const text = messagesToSummarize
      .map(m => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content.map(b => b.text || '').join('\n');
        }
        return '';
      })
      .join('\n\n');
    
    // 使用 LLM 生成摘要
    let summaryText = text;
    let summaryTokens = this.tokenEstimator(text);
    
    if (llm && context.summarizePrompt) {
      try {
        const response = await llm.complete({
          prompt: context.summarizePrompt.replace('{content}', text),
          max_tokens: this.maxSummaryTokens
        });
        
        summaryText = response.text || text;
        summaryTokens = this.tokenEstimator(summaryText);
      } catch (error) {
        console.warn('[Compact] LLM summary failed, using truncated text:', error.message);
        // 截断文本作为后备
        summaryText = text.slice(0, this.maxSummaryTokens * 4);
        summaryTokens = this.maxSummaryTokens;
      }
    }
    
    return {
      text: summaryText,
      tokens: summaryTokens,
      message: {
        type: 'user',
        role: 'user',
        content: `Summary of previous conversation:\n\n${summaryText}`,
        isSummary: true,
        uuid: this._generateUUID(),
        timestamp: Date.now()
      }
    };
  }
  
  // 默认摘要器 (简单截断)
  _defaultSummarizer = {
    complete: async ({ prompt, max_tokens }) => {
      // 简单返回截断的文本
      return { text: prompt.slice(0, max_tokens * 4) };
    }
  };
  
  // 执行微压缩
  async microCompact(context = {}) {
    const startTime = Date.now();
    
    // 移除过长的工具结果
    const truncated = this.messages.map(msg => {
      if (msg.type === 'tool_result' && msg.content) {
        const content = typeof msg.content === 'string' 
          ? msg.content 
          : msg.content.map(b => b.text || '').join('');
        
        if (content.length > 5000) {
          return {
            ...msg,
            content: content.slice(0, 5000) + '\n...[truncated]'
          };
        }
      }
      return msg;
    });
    
    const preTokens = this.tokenCount;
    this.messages = truncated;
    this._updateTokenCount();
    
    const result = {
      success: true,
      preTokens,
      postTokens: this.tokenCount,
      tokensSaved: preTokens - this.tokenCount,
      duration: Date.now() - startTime,
      type: 'micro'
    };
    
    this.emit('microCompact', result);
    return result;
  }
  
  // 自动压缩检查
  async autoCompactIfNeeded(context = {}) {
    if (!this.autoCompactEnabled) {
      return { shouldCompact: false, reason: 'disabled' };
    }
    
    if (this.consecutiveFailures >= this.consecutiveFailureLimit) {
      return { shouldCompact: false, reason: 'circuit_breaker' };
    }
    
    if (!this.shouldCompact()) {
      return { shouldCompact: false, reason: 'under_threshold' };
    }
    
    // 尝试微压缩
    if (this.tokenCount < this.maxTokens - 3000) {
      try {
        const result = await this.microCompact(context);
        return { 
          shouldCompact: true, 
          type: 'micro',
          result 
        };
      } catch {
        // 继续尝试完整压缩
      }
    }
    
    // 执行完整压缩
    try {
      const result = await this.compact(context);
      return { 
        shouldCompact: true, 
        type: 'full',
        result 
      };
    } catch (error) {
      return { 
        shouldCompact: false, 
        reason: 'compact_failed',
        error: error.message 
      };
    }
  }
  
  // 创建压缩边界消息
  createBoundaryMessage(preTokens, postTokens, summaryText) {
    return {
      type: 'system',
      role: 'system',
      content: `[Earlier conversation summarized. ${preTokens} → ${postTokens} tokens]\n\n${summaryText}`,
      isCompactBoundary: true,
      compactMetadata: {
        type: 'compact_boundary',
        preCompactTokenCount: preTokens,
        postCompactTokenCount: postTokens
      },
      uuid: this._generateUUID(),
      timestamp: Date.now()
    };
  }
  
  // 获取压缩边界后的消息
  getMessagesAfterBoundary() {
    const boundaryIndex = this.messages.findIndex(
      m => m.isCompactBoundary || m.type === 'system' && m.content?.includes('summarized')
    );
    
    if (boundaryIndex === -1) return this.messages;
    return this.messages.slice(boundaryIndex + 1);
  }
  
  // 获取统计信息
  getStats() {
    return {
      currentTokens: this.tokenCount,
      maxTokens: this.maxTokens,
      messageCount: this.messages.length,
      compactionCount: this.compactionHistory.length,
      consecutiveFailures: this.consecutiveFailures,
      autoCompactEnabled: this.autoCompactEnabled,
      lastCompactTime: this.lastCompactTime,
      history: this.compactionHistory.slice(-10)
    };
  }
  
  // 重置
  reset() {
    this.messages = [];
    this.tokenCount = 0;
    this.compactionHistory = [];
    this.consecutiveFailures = 0;
    this.lastCompactTime = null;
    this.turnCounter = 0;
    this.emit('reset');
  }
  
  // 生成 UUID
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

module.exports = { ContextCompactService };
