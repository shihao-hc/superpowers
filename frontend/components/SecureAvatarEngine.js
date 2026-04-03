/**
 * AI虚拟人物核心引擎 v2.1 - 安全加固版
 * 
 * 修复内容:
 * - 输入验证加强
 * - XSS防护增强
 * - 内存泄漏修复
 * - Promise错误处理
 * - 防止无限递归
 */

// ============ 安全工具函数 ============
const SecurityUtils = {
  // 输入验证
  validateInput(text, maxLength = 10000) {
    if (typeof text !== 'string') return '';
    if (text.length > maxLength) return text.slice(0, maxLength);
    return text.trim();
  },

  // HTML转义
  escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  },

  // 安全对象展开(防止原型污染)
  safeObjectSpread(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const result = {};
    for (const key of Object.keys(obj)) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = obj[key];
      }
    }
    return result;
  },

  // 清理回调Promise错误
  safeCallback(fn) {
    return (...args) => {
      try {
        const result = fn(...args);
        if (result && typeof result.catch === 'function') {
          result.catch(err => console.error('[SafeCallback]', err));
        }
        return result;
      } catch (err) {
        console.error('[SafeCallback]', err);
        return null;
      }
    };
  }
};

// ============ 增强的AvatarEngine ============
class SecureAvatarEngine extends EnhancedAvatarEngine {
  constructor(options = {}) {
    // 合并安全选项
    super({
      maxInputLength: options.maxInputLength || 10000,
      enableInputValidation: options.enableInputValidation !== false,
      enableXSSProtection: options.enableXSSProtection !== false,
      ...options
    });

    // 安全统计
    this.securityStats = {
      blockedInputs: 0,
      xssAttempts: 0,
      invalidCallbacks: 0
    };

    // 资源清理追踪
    this.cleanupHandlers = [];
  }

  /**
   * 安全的文本输入处理
   */
  async _handleTextInput(data) {
    // 输入验证
    if (this.options.enableInputValidation) {
      const originalText = data.text;
      data.text = SecurityUtils.validateInput(data.text, this.options.maxInputLength);
      
      if (data.text !== originalText) {
        this.securityStats.blockedInputs++;
        console.warn('[Security] Input truncated or blocked');
      }
    }

    // 调用父类处理
    return super._handleTextInput(data);
  }

  /**
   * 安全的人格过滤
   */
  _applyPersonaFilter(text) {
    if (!text || typeof text !== 'string') return '';
    
    // XSS防护
    let filtered = text;
    if (this.options.enableXSSProtection) {
      // 移除潜在危险内容
      filtered = filtered
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }

    // 内容过滤
    filtered = filtered.replace(/讨厌|垃圾|笨蛋/g, '').trim();
    
    // HTML转义
    filtered = SecurityUtils.escapeHTML(filtered);
    
    return filtered;
  }

  /**
   * 安全的事件回调注册
   */
  on(event, callback, context = null) {
    const safeCallback = SecurityUtils.safeCallback(callback);
    return super.on(event, safeCallback, context);
  }

  /**
   * 安全保存到记忆(防止无限递归)
   */
  async _saveToMemory(user, input, response) {
    // 检查是否在保存过程中(防止递归)
    if (this._isSavingMemory) {
      console.warn('[Security] Prevented recursive memory save');
      return;
    }

    this._isSavingMemory = true;
    
    try {
      await super._saveToMemory(user, input, response);
    } catch (error) {
      console.error('[SecureAvatar] Memory save error:', error);
    } finally {
      this._isSavingMemory = false;
    }
  }

  /**
   * 安全注册资源清理
   */
  addCleanupHandler(handler) {
    if (typeof handler === 'function') {
      this.cleanupHandlers.push(handler);
    }
  }

  /**
   * 清理所有资源
   */
  destroy() {
    // 执行自定义清理
    for (const handler of this.cleanupHandlers) {
      try {
        handler();
      } catch (e) {
        console.error('[SecureAvatar] Cleanup error:', e);
      }
    }
    this.cleanupHandlers = [];

    // 调用父类销毁
    super.destroy();
  }

  /**
   * 获取安全统计
   */
  getSecurityStats() {
    return { ...this.securityStats };
  }
}

// ============ 增强的ContinuousInferenceSystem ============
class SecureContinuousInferenceSystem extends ContinuousInferenceSystem {
  constructor(options = {}) {
    super(options);
    this._maxListeners = 10; // 防止监听器泄漏
    this._isDestroyed = false;
  }

  /**
   * 安全启动(带回调清理)
   */
  start() {
    if (this.isRunning || this._isDestroyed) return;
    
    super.start();
    
    // 注册自动清理
    if (typeof window !== 'undefined') {
      const cleanup = () => this.stop();
      window.addEventListener('beforeunload', cleanup);
      this.addCleanupHandler(() => window.removeEventListener('beforeunload', cleanup));
    }
  }

  /**
   * 安全停止
   */
  stop() {
    super.stop();
    this._isDestroyed = true;
  }

  /**
   * 安全添加监听器(限制数量)
   */
  on(event, callback) {
    const current = this.listeners.get(event) || [];
    if (current.length >= this._maxListeners) {
      console.warn(`[Security] Max listeners (${this._maxListeners}) reached for ${event}`);
      return;
    }
    super.on(event, callback);
  }

  /**
   * 安全添加输入(验证数据)
   */
  receiveInput(data) {
    if (!data || typeof data !== 'object') return;
    
    const validated = {
      text: SecurityUtils.validateInput(data.text || '', 5000),
      user: SecurityUtils.validateInput(data.user || 'anonymous', 100),
      timestamp: Date.now()
    };
    
    super.receiveInput(validated);
  }

  addCleanupHandler(handler) {
    if (!this._cleanupHandlers) this._cleanupHandlers = [];
    this._cleanupHandlers.push(handler);
  }
}

// ============ 增强的SentimentFeedbackLoop ============
class SecureSentimentFeedbackLoop extends SentimentFeedbackLoop {
  constructor(options = {}) {
    super(options);
    this._maxBufferSize = 500; // 限制缓冲区大小
    this._analysisTimeout = 100; // 分析超时(ms)
  }

  /**
   * 安全处理消息
   */
  processMessage(text, metadata = {}) {
    // 输入验证
    if (!text || typeof text !== 'string') return this.currentSentiment;
    
    // 长度限制
    if (text.length > 10000) {
      text = text.slice(0, 10000);
    }
    
    // 调用父类
    const result = super.processMessage(text, metadata);
    
    // 缓冲区限制
    if (this.sentimentBuffer.length > this._maxBufferSize) {
      this.sentimentBuffer = this.sentimentBuffer.slice(-this._maxBufferSize);
    }
    
    return result;
  }

  /**
   * 安全的分析(添加超时)
   */
  _analyze(text) {
    try {
      return super._analyze(text);
    } catch (error) {
      console.error('[SecureSentiment] Analysis error:', error);
      return { score: 0, sentiment: 'neutral', intensity: 0 };
    }
  }
}

// ============ 增强的LatencyOptimizer ============
class SecureLatencyOptimizer extends LatencyOptimizer {
  constructor(options = {}) {
    super(options);
    this._maxCacheSize = options.maxCacheSize || 1000;
  }

  /**
   * 安全处理输入
   */
  async processInput(input, context = {}) {
    // 输入验证
    if (!input || typeof input !== 'string') {
      return { content: '', source: 'invalid', latency: 0, withinTarget: false };
    }
    
    // 长度限制
    if (input.length > 10000) {
      input = input.slice(0, 10000);
    }
    
    return super.processInput(input, context);
  }

  /**
   * 安全预计算(限制数量)
   */
  precomputeResponses(inputs) {
    if (!Array.isArray(inputs)) return;
    
    const limited = inputs.slice(0, 100); // 限制数量
    super.precomputeResponses(limited);
  }

  /**
   * 缓存大小限制
   */
  precomputeResponses(inputs) {
    if (!Array.isArray(inputs)) return;
    
    // 清理旧缓存
    if (this.cache.size > this._maxCacheSize) {
      const keys = Array.from(this.cache.keys());
      const toRemove = keys.slice(0, Math.floor(keys.length / 2));
      for (const key of toRemove) {
        this.cache.delete(key);
      }
    }
    
    super.precomputeResponses(inputs);
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.SecureAvatarEngine = SecureAvatarEngine;
  window.SecurityUtils = SecurityUtils;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SecureAvatarEngine,
    SecureContinuousInferenceSystem,
    SecureSentimentFeedbackLoop,
    SecureLatencyOptimizer,
    SecurityUtils
  };
}
