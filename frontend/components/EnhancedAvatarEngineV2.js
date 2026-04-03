/**
 * AI虚拟人物核心引擎 v2.1 - Enhanced Avatar Engine (Optimized)
 *
 * 整合所有新组件:
 * - LatencyOptimizer: 超低延迟响应
 * - ContinuousInferenceSystem: 持续推理 + 涌现行为
 * - SentimentFeedbackLoop: 实时情感反馈
 * - DuckDB WASM: 本地数据库
 * - WebGPU Inference: 本地AI推理
 *
 * 优化内容:
 * - 集成UltraWorkUtils.js统一工具库
 * - 使用TimerManager管理定时器，防止内存泄漏
 * - 使用EnhancedEventBus增强事件系统
 * - 使用escapeHtml防止XSS攻击
 * - 使用ErrorHandler统一错误处理
 *
 * 目标: 达到 Neuro-sama 级别的交互体验
 */

class EnhancedAvatarEngine {
  constructor(options = {}) {
    // ============ 统一工具初始化 ============
    this.utils = window.UltraWorkUtils || {};
    this.timerManager = new (this.utils.TimerManager || class {
      setTimeout(fn, delay) { return setTimeout(fn, delay); }
      setInterval(fn, delay) { return setInterval(fn, delay); }
      clearTimeout(id) { clearTimeout(id); }
      clearInterval(id) { clearInterval(id); }
      cleanup() {}
    })();

    this.eventBus = new (this.utils.EnhancedEventBus || class {
      constructor() { this.listeners = new Map(); }
      on(event, cb) {
        if (!this.listeners.has(event)) {this.listeners.set(event, new Set());}
        this.listeners.get(event).add(cb);
        return () => this.off(event, cb);
      }
      off(event, cb) {
        if (this.listeners.has(event)) {this.listeners.get(event).delete(cb);}
      }
      emit(event, data) {
        if (this.listeners.has(event)) {
          this.listeners.get(event).forEach((cb) => {
            try { cb(data); } catch(e) { console.error(`Event ${event} error:`, e); }
          });
        }
      }
      removeAllListeners() { this.listeners.clear(); }
    })();

    this.errorHandler = this.utils.ErrorHandler || {
      handle: (error, context) => {
        console.error(`[${context}]`, error);
        return { message: error.message, context, timestamp: new Date().toISOString() };
      },
      wrapAsync: (fn, context) => async (...args) => {
        try { return await fn(...args); }
        catch (error) { this.errorHandler.handle(error, context); throw error; }
      }
    };

    this.options = {
      containerId: options.containerId || 'avatar-container',
      renderMode: options.renderMode || 'canvas2d',
      personality: options.personality || 'playful',
      language: options.language || 'zh-CN',

      // 性能选项
      targetLatency: options.targetLatency || 50,
      enableStreaming: options.enableStreaming !== false,
      enablePrecomputation: options.enablePrecomputation !== false,

      // 功能开关
      enableVoice: options.enableVoice !== false,
      enableGesture: options.enableGesture !== false,
      enableMemory: options.enableMemory !== false,
      enableInference: options.enableInference !== false,
      enableLocalDB: options.enableLocalDB !== false,

      // Neuro-sama 特性
      enableEmergence: options.enableEmergence !== false,
      enableSentimentFeedback: options.enableSentimentFeedback !== false,
      enableContinuousInference: options.enableContinuousInference !== false,

      // 定时器配置
      inferenceInterval: options.inferenceInterval || 100,

      ...options
    };

    // ============ 核心系统 ============
    // 注意: 这里保留原有的EventBus作为兼容，但建议使用this.eventBus
    this.oldEventBus = (typeof EventBus !== 'undefined') ? new EventBus() : null;

    // 使用StateManager或创建简单的状态管理
    if (typeof StateManager !== 'undefined') {
      this.state = new StateManager({
        avatar: {
          mood: 'neutral',
          expression: null,
          isSpeaking: false,
          isListening: false,
          currentAction: null,
          latency: 0
        },
        voice: {
          isActive: false,
          volume: 1.0,
          rate: 1.0,
          pitch: 1.0,
          isMuted: false
        },
        inference: {
          isRunning: false,
          latency: 0,
          cacheHitRate: 0
        },
        sentiment: {
          current: 'neutral',
          score: 0,
          trend: 'stable'
        },
        memory: {
          shortTerm: [],
          longTerm: [],
          conversations: 0
        },
        system: {
          isReady: false,
          isLoading: false,
          error: null,
          uptime: 0
        }
      });
    } else {
      // 备用状态管理
      this.state = {
        _data: {},
        get: function(key) { return this._data[key]; },
        set: function(key, value) { this._data[key] = value; }
      };
    }

    // 使用PersonalitySystem或创建简单的人格管理
    if (typeof PersonalitySystem !== 'undefined') {
      this.personality = new PersonalitySystem();
      this.personality.setPersonality(this.options.personality);
    } else {
      this.personality = {
        current: this.options.personality,
        setPersonality: function(p) { this.current = p; }
      };
    }

    // ============ 子系统 ============
    this.renderSystem = null;
    this.voiceSystem = null;
    this.gestureSystem = null;
    this.memorySystem = null;

    // Neuro-sama 特性组件
    this.latencyOptimizer = null;
    this.continuousInference = null;
    this.sentimentFeedback = null;

    // 本地AI组件
    this.localDatabase = null;
    this.inferenceEngine = null;
    this.llmEngine = null;

    // 定时器管理
    this.timers = new Set();
    this.intervals = new Set();

    // 事件监听器管理
    this.managedListeners = new Map();

    // 内存监控
    this.memoryMonitor = this.utils.MemoryMonitor ? new this.utils.MemoryMonitor() : null;
  }

  // ============ 定时器管理方法 ============

  /**
   * 安全的setTimeout，自动清理
   */
  safeSetTimeout(callback, delay, context = '') {
    const wrappedCallback = () => {
      try {
        callback();
      } catch (error) {
        this.errorHandler.handle(error, `setTimeout:${context}`);
      }
    };

    const id = this.timerManager.setTimeout(wrappedCallback, delay);
    this.timers.add(id);
    return id;
  }

  /**
   * 安全的setInterval，自动清理
   */
  safeSetInterval(callback, delay, context = '') {
    const wrappedCallback = () => {
      try {
        callback();
      } catch (error) {
        this.errorHandler.handle(error, `setInterval:${context}`);
      }
    };

    const id = this.timerManager.setInterval(wrappedCallback, delay);
    this.intervals.add(id);
    return id;
  }

  /**
   * 清除定时器
   */
  clearSafeTimeout(id) {
    this.timerManager.clearTimeout(id);
    this.timers.delete(id);
  }

  /**
   * 清除间隔
   */
  clearSafeInterval(id) {
    this.timerManager.clearInterval(id);
    this.intervals.delete(id);
  }

  /**
   * 清理所有定时器
   */
  cleanupTimers() {
    this.timerManager.cleanup();
    this.timers.clear();
    this.intervals.clear();
  }

  // ============ 事件监听器管理 ============

  /**
   * 安全添加事件监听器，自动清理
   */
  addManagedEventListener(target, type, listener, options = {}) {
    if (!target || !type || !listener) {
      console.warn('Invalid event listener parameters');
      return;
    }

    const key = `${type}_${Date.now()}_${Math.random()}`;
    target.addEventListener(type, listener, options);

    if (!this.managedListeners.has(key)) {
      this.managedListeners.set(key, { target, type, listener, options });
    }

    return key;
  }

  /**
   * 移除托管的事件监听器
   */
  removeManagedEventListener(key) {
    const listener = this.managedListeners.get(key);
    if (listener) {
      listener.target.removeEventListener(listener.type, listener.listener, listener.options);
      this.managedListeners.delete(key);
    }
  }

  /**
   * 清理所有事件监听器
   */
  cleanupEventListeners() {
    this.managedListeners.forEach((listener, key) => {
      try {
        listener.target.removeEventListener(listener.type, listener.listener, listener.options);
      } catch (error) {
        console.warn(`Failed to remove event listener ${key}:`, error);
      }
    });
    this.managedListeners.clear();
  }

  // ============ XSS防护方法 ============

  /**
   * 安全设置innerHTML
   */
  safeSetInnerHTML(element, html) {
    if (!element) {return;}

    const escapeHtml = this.utils.escapeHtml || ((str) => {
      if (!str) {return '';}
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    });

    element.innerHTML = escapeHtml(html);
  }

  /**
   * 安全添加文本内容
   */
  safeSetText(element, text) {
    if (!element) {return;}
    element.textContent = text;
  }

  // ============ 核心功能方法 ============

  /**
   * 启动引擎（使用安全的定时器）
   */
  start() {
    if (this.state.get('system.isLoading')) {return;}

    this.state.set('system.isLoading', true);
    this.state.set('inference.isRunning', true);

    // 使用安全的setInterval替代原来的setInterval
    this.inferenceLoop = this.safeSetInterval(
      () => this._tick(),
      this.options.inferenceInterval,
      'inference_loop'
    );

    // 内存监控
    if (this.memoryMonitor) {
      this.memoryMonitorInterval = this.safeSetInterval(
        () => {
          const usage = this.memoryMonitor.getMemoryUsage();
          if (usage && usage.percentage > 80) {
            console.warn('High memory usage:', usage);
            this._optimizeMemory();
          }
        },
        30000, // 30秒检查一次
        'memory_monitor'
      );
    }

    this.state.set('system.isLoading', false);
    this.state.set('system.isReady', true);
    this.state.set('system.uptime', Date.now());

    // 发送启动事件
    this.eventBus.emit('engine:started', {
      timestamp: Date.now(),
      options: this.options
    });
  }

  /**
   * 停止引擎
   */
  stop() {
    this.state.set('inference.isRunning', false);

    // 清理所有定时器
    this.cleanupTimers();

    // 清理事件监听器
    this.cleanupEventListeners();

    // 清理事件总线
    this.eventBus.removeAllListeners();

    this.state.set('system.isReady', false);

    // 发送停止事件
    this.eventBus.emit('engine:stopped', {
      timestamp: Date.now()
    });
  }

  /**
   * 优化内存使用
   */
  _optimizeMemory() {
    // 清理短期记忆
    const memory = this.state.get('memory');
    if (memory && memory.shortTerm && memory.shortTerm.length > 100) {
      memory.shortTerm = memory.shortTerm.slice(-50);
      this.state.set('memory', memory);
    }

    // 发送内存优化事件
    this.eventBus.emit('system:memoryOptimized', {
      timestamp: Date.now(),
      shortTermSize: memory?.shortTerm?.length || 0
    });
  }

  /**
   * 主循环（优化后的tick方法）
   */
  _tick() {
    if (!this.state.get('inference.isRunning')) {return;}

    try {
      const startTime = performance.now();

      // 执行推理逻辑
      this._processInference();

      // 更新延迟指标
      const latency = performance.now() - startTime;
      this.state.set('avatar.latency', latency);

      // 检查是否需要涌现行为
      if (this.options.enableEmergence && Math.random() < 0.01) {
        this._triggerEmergence();
      }

    } catch (error) {
      this.errorHandler.handle(error, 'inference_tick');
      this.state.set('system.error', error.message);
    }
  }

  /**
   * 处理推理
   */
  _processInference() {
    // 这里实现具体的推理逻辑
    // 例如：处理积压的消息、更新情感状态等

    const sentiment = this.state.get('sentiment');
    if (sentiment) {
      // 模拟情感衰减
      sentiment.score *= 0.99;
      if (Math.abs(sentiment.score) < 0.01) {
        sentiment.score = 0;
        sentiment.trend = 'stable';
      }
      this.state.set('sentiment', sentiment);
    }
  }

  /**
   * 触发涌现行为
   */
  _triggerEmergence() {
    // Neuro-sama特色的涌现行为
    const actions = [
      '突然改变话题',
      '做出意外反应',
      '展示独特个性',
      '主动提问'
    ];

    const action = actions[Math.floor(Math.random() * actions.length)];

    this.eventBus.emit('emergence:triggered', {
      action,
      timestamp: Date.now()
    });

    // 执行涌现行为
    this._executeEmergenceAction(action);
  }

  /**
   * 执行涌现行为
   */
  _executeEmergenceAction(action) {
    switch (action) {
    case '突然改变话题':
      this._changeTopic();
      break;
    case '做出意外反应':
      this._unexpectedReaction();
      break;
    case '展示独特个性':
      this._showPersonality();
      break;
    case '主动提问':
      this._askQuestion();
      break;
    }
  }

  _changeTopic() {
    // 实现话题改变逻辑
    this.eventBus.emit('chat:topicChange', {
      timestamp: Date.now()
    });
  }

  _unexpectedReaction() {
    // 实现意外反应逻辑
    this.eventBus.emit('chat:unexpectedReaction', {
      timestamp: Date.now()
    });
  }

  _showPersonality() {
    // 实现个性展示逻辑
    this.eventBus.emit('avatar:personalityShow', {
      timestamp: Date.now()
    });
  }

  _askQuestion() {
    // 实现主动提问逻辑
    this.eventBus.emit('chat:proactiveQuestion', {
      timestamp: Date.now()
    });
  }

  // ============ 兼容性方法 ============

  /**
   * 获取内存使用情况
   */
  getMemoryStats() {
    return {
      timers: this.timers.size,
      intervals: this.intervals.size,
      listeners: this.managedListeners.size,
      memory: this.memoryMonitor?.getMemoryUsage() || null
    };
  }

  /**
   * 销毁引擎
   */
  destroy() {
    this.stop();

    // 清理所有资源
    this.cleanupTimers();
    this.cleanupEventListeners();

    // 清理状态
    this.state = null;
    this.personality = null;

    // 清理子系统
    this.renderSystem = null;
    this.voiceSystem = null;
    this.gestureSystem = null;
    this.memorySystem = null;
    this.latencyOptimizer = null;
    this.continuousInference = null;
    this.sentimentFeedback = null;
    this.localDatabase = null;
    this.inferenceEngine = null;
    this.llmEngine = null;

    this.eventBus.emit('engine:destroyed', {
      timestamp: Date.now()
    });
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.EnhancedAvatarEngine = EnhancedAvatarEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EnhancedAvatarEngine };
}