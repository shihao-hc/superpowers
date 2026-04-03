/**
 * AI虚拟人物核心引擎 v2.0 - Enhanced Avatar Engine
 * 
 * 整合所有新组件:
 * - LatencyOptimizer: 超低延迟响应
 * - ContinuousInferenceSystem: 持续推理 + 涌现行为
 * - SentimentFeedbackLoop: 实时情感反馈
 * - DuckDB WASM: 本地数据库
 * - WebGPU Inference: 本地AI推理
 * 
 * 目标: 达到 Neuro-sama 级别的交互体验
 */

class EnhancedAvatarEngine {
  constructor(options = {}) {
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
      
      ...options
    };

    // ============ 核心系统 ============
    this.eventBus = new EventBus();
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

    this.personality = new PersonalitySystem();
    this.personality.setPersonality(this.options.personality);

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

    // 统计
    this.stats = {
      startTime: Date.now(),
      totalMessages: 0,
      totalResponses: 0,
      avgLatency: 0,
      emergenceTriggers: 0
    };

    // 初始化
    this._init();
  }

  async _init() {
    this.state.set('system.isLoading', true);
    const initStart = performance.now();

    try {
      // 1. 渲染系统 (必须)
      await this._initRenderSystem();
      
      // 2. 核心交互系统
      await Promise.all([
        this._initVoiceSystem(),
        this._initGestureSystem(),
        this._initMemorySystem()
      ]);
      
      // 3. Neuro-sama 特性系统
      await this._initNeuroSystems();
      
      // 4. 本地AI系统 (可选)
      if (this.options.enableLocalDB || this.options.enableInference) {
        await this._initLocalAI();
      }
      
      // 5. 设置事件处理
      this._setupEventHandlers();
      
      // 6. 预计算常见响应
      if (this.options.enablePrecomputation) {
        this._precomputeResponses();
      }
      
      const initTime = performance.now() - initStart;
      console.log(`[EnhancedAvatar] Initialized in ${initTime.toFixed(1)}ms`);
      
      this.state.set('system.isReady', true);
      this.state.set('system.isLoading', false);
      this.state.set('system.uptime', Date.now());
      
      this.eventBus.emit('engine:ready', { initTime });
      
    } catch (error) {
      console.error('[EnhancedAvatar] Init error:', error);
      this.state.set('system.error', error.message);
      this.state.set('system.isLoading', false);
      this.eventBus.emit('engine:error', { error });
    }
  }

  // ============ 初始化方法 ============

  async _initRenderSystem() {
    const renderers = {
      'vr': async () => {
        const { VRMComponent } = await import('./VRMComponent.js');
        return new VRMComponent(this.options.containerId);
      },
      'live2d': async () => {
        const { Live2DComponent } = await import('./Live2DComponent.js');
        return new Live2DComponent(this.options.containerId);
      },
      'canvas2d': async () => {
        const { VirtualCharacter } = await import('./VirtualCharacter.js');
        return new VirtualCharacter(this.options.containerId);
      }
    };

    const rendererFactory = renderers[this.options.renderMode] || renderers.canvas2d;
    this.renderSystem = await rendererFactory();
    await this.renderSystem.init();
    
    this.eventBus.emit('render:ready', { mode: this.options.renderMode });
  }

  async _initVoiceSystem() {
    if (!this.options.enableVoice) return;
    
    try {
      const { VoiceAvatar } = await import('./VoiceAvatar.js');
      this.voiceSystem = new VoiceAvatar(this.renderSystem, {
        moodLipSync: true
      });
      this.voiceSystem.enable();
      this.eventBus.emit('voice:ready');
    } catch (error) {
      console.warn('[EnhancedAvatar] Voice system not available:', error);
    }
  }

  async _initGestureSystem() {
    if (!this.options.enableGesture) return;
    
    try {
      const { GestureRecognitionSystem } = await import('./GestureRecognitionSystem.js');
      this.gestureSystem = new GestureRecognitionSystem({
        onGesture: (gesture) => this._handleGesture(gesture)
      });
      this.eventBus.emit('gesture:ready');
    } catch (error) {
      console.warn('[EnhancedAvatar] Gesture system not available:', error);
    }
  }

  async _initMemorySystem() {
    if (!this.options.enableMemory) return;
    
    try {
      const { LongTermMemorySystem } = await import('./LongTermMemorySystem.js');
      this.memorySystem = new LongTermMemorySystem();
      await this.memorySystem.init();
      this.eventBus.emit('memory:ready');
    } catch (error) {
      console.warn('[EnhancedAvatar] Memory system not available:', error);
    }
  }

  /**
   * 初始化 Neuro-sama 特性系统
   */
  async _initNeuroSystems() {
    // 1. 延迟优化器
    this.latencyOptimizer = new LatencyOptimizer({
      maxLatency: this.options.targetLatency,
      targetLatency: this.options.targetLatency * 0.6,
      enablePrecomputation: this.options.enablePrecomputation,
      enableStreaming: this.options.enableStreaming
    });
    this.eventBus.emit('latency:ready');

    // 2. 情感反馈循环
    if (this.options.enableSentimentFeedback) {
      this.sentimentFeedback = new SentimentFeedbackLoop({
        windowSize: 100,
        onSentimentChange: (change) => this._handleSentimentChange(change),
        onVoiceUpdate: (params) => this._updateVoiceParams(params),
        onExpressionUpdate: (expr) => this._updateExpression(expr)
      });
      this.eventBus.emit('sentiment:ready');
    }

    // 3. 持续推理系统
    if (this.options.enableContinuousInference) {
      this.continuousInference = new ContinuousInferenceSystem({
        inferenceInterval: 100,
        enableEmergence: this.options.enableEmergence,
        personalityConsistency: 0.8
      });
      
      // 监听涌现行为
      this.continuousInference.on('proactive_speech', (data) => {
        this._handleProactiveSpeech(data);
      });
      
      this.eventBus.emit('inference:continuous:ready');
    }
  }

  /**
   * 初始化本地AI系统
   */
  async _initLocalAI() {
    // 1. DuckDB WASM
    if (this.options.enableLocalDB) {
      try {
        const { createDuckDBWASM } = await import('./DuckDBWASM.js');
        this.localDatabase = await createDuckDBWASM({
          enablePersistence: true,
          dataDir: 'avatar_memory'
        });
        this.eventBus.emit('database:ready');
      } catch (error) {
        console.warn('[EnhancedAvatar] Local database not available:', error);
      }
    }

    // 2. WebGPU 推理
    if (this.options.enableInference) {
      try {
        const { WebGPUInferenceEngine } = await import('./WebGPUInferenceEngine.js');
        this.inferenceEngine = new WebGPUInferenceEngine({
          device: 'auto',
          dtype: 'q8'
        });
        await this.inferenceEngine.init();
        this.eventBus.emit('inference:ready');
      } catch (error) {
        console.warn('[EnhancedAvatar] Local inference not available:', error);
      }
    }
  }

  // ============ 事件处理 ============

  _setupEventHandlers() {
    // 文本输入处理
    this.eventBus.on('text:input', async (data) => {
      await this._handleTextInput(data);
    });

    // 语音输入
    this.eventBus.on('voice:input', async (data) => {
      if (data.transcript) {
        this.eventBus.emit('text:input', { text: data.transcript, user: 'user' });
      }
    });

    // 聊天消息 (用于情感分析)
    this.eventBus.on('chat:message', (data) => {
      this._handleChatMessage(data);
    });

    // 状态订阅
    this.state.subscribe('avatar.mood', (mood) => {
      if (this.renderSystem?.setMood) {
        this.renderSystem.setMood(mood);
      }
    });
  }

  /**
   * 处理文本输入 - 使用延迟优化器
   */
  async _handleTextInput(data) {
    const { text, user } = data;
    const startTime = performance.now();
    
    this.stats.totalMessages++;
    this.state.set('avatar.currentAction', 'thinking');

    try {
      // 1. 使用延迟优化器处理
      const optimizedResult = await this.latencyOptimizer.processInput(text, {
        personality: this.personality.getCurrentConfig(),
        emotion: this.personality.getEmotion()
      });

      // 2. 获取上下文
      const context = this.memorySystem ? await this.memorySystem.getContext() : [];

      // 3. 生成响应
      let response = optimizedResult.content;
      
      // 如果缓存命中率低，使用LLM生成
      if (optimizedResult.source !== 'cached') {
        response = await this._generateResponse(text, context);
      }

      // 4. 应用人格风格
      response = this.personality.generateResponseStyle(response);

      // 5. 保存到记忆
      await this._saveToMemory(user, text, response);

      // 6. 更新统计
      const latency = performance.now() - startTime;
      this.stats.totalResponses++;
      this.stats.avgLatency = (this.stats.avgLatency * (this.stats.totalResponses - 1) + latency) / this.stats.totalResponses;
      
      this.state.set('avatar.latency', latency);
      this.state.set('avatar.currentAction', 'speaking');

      // 7. 发送响应
      this.eventBus.emit('text:response', {
        text: response,
        latency,
        optimized: optimizedResult.withinTarget
      });

      // 8. 说话
      this.speak(response);

    } catch (error) {
      console.error('[EnhancedAvatar] Text handling error:', error);
      this.eventBus.emit('text:error', { error: error.message });
    }
  }

  /**
   * 处理聊天消息 - 情感分析
   */
  _handleChatMessage(data) {
    const { text, user } = data;

    // 1. 情感分析
    if (this.sentimentFeedback) {
      this.sentimentFeedback.processMessage(text, { user });
      this._updateSentimentState();
    }

    // 2. 传递给持续推理系统
    if (this.continuousInference) {
      this.continuousInference.receiveInput({ text, user });
    }

    // 3. 保存到本地数据库
    if (this.localDatabase) {
      this.localDatabase.addConversation('user', text, { user }).catch(() => {});
    }

    // 4. 触发主动发言检查
    this._checkProactiveResponse(text);
  }

  /**
   * 处理涌现行为 - 主动发言
   */
  _handleProactiveSpeech(data) {
    if (!data.content) return;
    
    this.stats.emergenceTriggers++;
    
    // 应用人格过滤
    const filteredContent = this._applyPersonaFilter(data.content);
    
    // 更新情绪
    if (data.emotion) {
      this.setMood(data.emotion);
    }
    
    // 主动发言
    this.eventBus.emit('avatar:proactive', {
      text: filteredContent,
      emotion: data.emotion,
      type: data.action
    });
    
    this.speak(filteredContent);
  }

  /**
   * 检查是否需要主动回复
   */
  _checkProactiveResponse(text) {
    // 检测提问
    const questionPatterns = /[?？]|什么|怎么|为什么|如何|请问/;
    if (questionPatterns.test(text) && Math.random() < 0.3) {
      // 30%概率主动回答问题
      setTimeout(() => {
        this.eventBus.emit('chat:question', { text });
      }, 500 + Math.random() * 1000);
    }

    // 检测呼唤
    const callPatterns = /名字|在吗|在不在|听到吗/;
    if (callPatterns.test(text)) {
      this.eventBus.emit('chat:called', { text });
      this.speak('我在呢~');
    }
  }

  // ============ 核心功能 ============

  /**
   * 生成响应
   */
  async _generateResponse(text, context = []) {
    const personality = this.personality.getCurrentConfig();
    const emotion = this.personality.getEmotion();

    // 如果有本地LLM，使用它
    if (this.llmEngine) {
      const messages = [
        { role: 'system', content: `你是${personality.name}，当前情绪: ${emotion.primary}` },
        ...context.slice(-5).map(c => ({ role: 'user', content: c.content || c })),
        { role: 'user', content: text }
      ];
      
      const result = await this.llmEngine.chat(messages);
      if (result.success) return result.content;
    }

    // 否则使用预设回复
    return this._getTemplateResponse(text, personality);
  }

  /**
   * 模板响应 (降级方案)
   */
  _getTemplateResponse(text, personality) {
    const templates = {
      greeting: ['你好呀~', '嗨！', '你好！有什么可以帮忙的吗？'],
      question: ['让我想想...', '这是个好问题！', '嗯...我觉得是这样的'],
      thanks: ['不客气~', '很高兴能帮到你！', '应该的~'],
      default: ['嗯嗯~', '我明白了', '继续说~']
    };

    let category = 'default';
    if (/你好|嗨|哈喽/.test(text)) category = 'greeting';
    else if (/[?？]|什么|怎么/.test(text)) category = 'question';
    else if (/谢谢|感谢/.test(text)) category = 'thanks';

    const list = templates[category];
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * 说话
   */
  speak(text) {
    if (!this.voiceSystem) return;

    const sentiment = this.sentimentFeedback?.getCurrentSentiment();
    const mood = sentiment?.dominantEmotion || this.personality.getEmotion().primary;
    
    this.state.set('avatar.isSpeaking', true);

    // 获取情感驱动的语音参数
    const voiceParams = this.sentimentFeedback?.getVoiceParams() || this.personality.getTTSConfig();

    this.voiceSystem.speak(text, {
      mood,
      rate: voiceParams.rate,
      pitch: voiceParams.pitch,
      volume: voiceParams.volume
    });

    // 监听结束
    if (this.voiceSystem.tts) {
      this.voiceSystem.tts.onEnd = () => {
        this.state.set('avatar.isSpeaking', false);
        this.state.set('avatar.currentAction', 'idle');
      };
    }

    // 保存到数据库
    if (this.localDatabase) {
      this.localDatabase.addConversation('assistant', text, { mood }).catch(() => {});
    }
  }

  /**
   * 设置情绪
   */
  setMood(mood) {
    this.personality.setEmotion(mood);
    this.state.set('avatar.mood', mood);
    
    // 更新情感反馈
    if (this.sentimentFeedback) {
      this.sentimentFeedback.currentSentiment.dominantEmotion = mood;
    }
    
    this.eventBus.emit('mood:changed', { mood });
  }

  /**
   * 处理手势
   */
  _handleGesture(gesture) {
    this.state.set('avatar.currentAction', `gesture:${gesture.name}`);
    
    // 手势映射到情绪
    const gestureEmotionMap = {
      'wave': 'happy',
      'thumbs_up': 'happy',
      'peace': 'happy',
      'heart': 'love',
      'stop': 'calm'
    };

    const emotion = gestureEmotionMap[gesture.name];
    if (emotion) {
      this.setMood(emotion);
    }

    this.eventBus.emit('gesture:processed', gesture);
  }

  /**
   * 情感变化处理
   */
  _handleSentimentChange(change) {
    this.state.set('sentiment.current', change.current);
    this.state.set('sentiment.score', change.score);
    
    // 调整人格参数
    if (change.current === 'positive') {
      this.personality.setEmotion('happy', change.score);
    } else if (change.current === 'negative') {
      this.personality.setEmotion('sad', Math.abs(change.score));
    }

    this.eventBus.emit('sentiment:changed', change);
  }

  /**
   * 更新情感状态
   */
  _updateSentimentState() {
    if (!this.sentimentFeedback) return;
    
    const sentiment = this.sentimentFeedback.getCurrentSentiment();
    const trend = this.sentimentFeedback.getTrend();
    
    this.state.set('sentiment.current', sentiment.dominantEmotion);
    this.state.set('sentiment.score', sentiment.score);
    this.state.set('sentiment.trend', trend.trend);
  }

  /**
   * 更新语音参数
   */
  _updateVoiceParams(params) {
    this.state.set('voice.rate', params.rate);
    this.state.set('voice.pitch', params.pitch);
    this.state.set('voice.volume', params.volume);
  }

  /**
   * 更新表情
   */
  _updateExpression(expr) {
    this.state.set('avatar.expression', expr);
    
    // 应用到渲染系统
    if (this.renderSystem?.setExpression) {
      this.renderSystem.setExpression(expr);
    }
  }

  /**
   * 人格过滤
   */
  _applyPersonaFilter(text) {
    // 移除不适当内容
    const filtered = text
      .replace(/讨厌|垃圾|笨蛋/g, '')
      .trim();
    
    // 添加人格特征
    const config = this.personality.getCurrentConfig();
    if (Math.random() < config.speechPatterns.exclamationChance) {
      return filtered + '！';
    }
    
    return filtered;
  }

  /**
   * 预计算常见响应
   */
  _precomputeResponses() {
    const commonInputs = [
      '你好', '嗨', '哈喽', '在吗',
      '谢谢你', '谢谢', '感谢',
      '再见', '拜拜', '下次见',
      '你是谁', '你叫什么名字',
      '今天怎么样', '心情如何'
    ];
    
    this.latencyOptimizer?.precomputeResponses(commonInputs);
  }

  /**
   * 保存到记忆
   */
  async _saveToMemory(user, input, response) {
    // 长期记忆系统
    if (this.memorySystem) {
      await this.memorySystem.add(`User(${user}): ${input}`, 'user_input');
      await this.memorySystem.add(`Avatar: ${response}`, 'avatar_response');
    }

    // 本地数据库
    if (this.localDatabase) {
      await this.localDatabase.addConversation('user', input, { user });
      await this.localDatabase.addConversation('assistant', response);
    }
  }

  // ============ 公共API ============

  /**
   * 获取引擎状态
   */
  getStatus() {
    return {
      isReady: this.state.get('system.isReady'),
      personality: this.personality.currentPersonality,
      mood: this.state.get('avatar.mood'),
      latency: this.stats.avgLatency,
      messagesProcessed: this.stats.totalMessages,
      emergenceTriggers: this.stats.emergenceTriggers
    };
  }

  /**
   * 获取性能指标
   */
  getMetrics() {
    return {
      latency: this.latencyOptimizer?.getMetrics() || null,
      sentiment: this.sentimentFeedback?.getStats() || null,
      database: this.localDatabase?.getStats() || null,
      inference: this.inferenceEngine?.getStats() || null,
      engine: { ...this.stats }
    };
  }

  /**
   * 获取设备能力
   */
  async getDeviceCapabilities() {
    return this.inferenceEngine?.getCapabilities() || { webgpu: false, webgl: false };
  }

  /**
   * 事件监听
   */
  on(event, callback, context = null) {
    return this.eventBus.on(event, callback, context);
  }

  off(event, listenerId) {
    this.eventBus.off(event, listenerId);
  }

  /**
   * 获取状态
   */
  getState(path = null) {
    return this.state.get(path);
  }

  /**
   * 设置人格
   */
  setPersonality(id) {
    this.personality.setPersonality(id);
    
    // 更新持续推理系统
    if (this.continuousInference) {
      const config = this.personality.getCurrentConfig();
      this.continuousInference.personaLayer.traits = config.traits || {};
    }
    
    this.eventBus.emit('personality:changed', { personality: id });
  }

  /**
   * 启动持续推理
   */
  startInference() {
    if (this.continuousInference) {
      this.continuousInference.start();
      this.state.set('inference.isRunning', true);
    }
  }

  /**
   * 停止持续推理
   */
  stopInference() {
    if (this.continuousInference) {
      this.continuousInference.stop();
      this.state.set('inference.isRunning', false);
    }
  }

  /**
   * 销毁引擎
   */
  destroy() {
    this.stopInference();
    
    if (this.renderSystem) this.renderSystem.destroy?.();
    if (this.gestureSystem) this.gestureSystem.stop?.();
    if (this.voiceSystem) this.voiceSystem.disable?.();
    if (this.memorySystem) this.memorySystem.destroy?.();
    if (this.localDatabase) this.localDatabase.close?.();
    if (this.inferenceEngine) this.inferenceEngine.terminate?.();
    if (this.llmEngine) this.llmEngine.terminate?.();
    
    this.eventBus.clear();
    
    console.log('[EnhancedAvatar] Destroyed');
  }
}

// ============ 辅助类 ============

class LatencyOptimizer {
  constructor(options = {}) {
    this.options = { maxLatency: 50, targetLatency: 30, ...options };
    this.cache = new Map();
    this.stats = { totalRequests: 0, cacheHits: 0 };
  }

  async processInput(input, context = {}) {
    const startTime = performance.now();
    this.stats.totalRequests++;

    // 检查缓存
    const cached = this.cache.get(input);
    if (cached) {
      this.stats.cacheHits++;
      return { content: cached, source: 'cached', latency: 0, withinTarget: true };
    }

    // 快速分类和生成
    const content = this._quickGenerate(input, context);
    const latency = performance.now() - startTime;

    return {
      content,
      source: 'generated',
      latency,
      withinTarget: latency <= this.options.targetLatency
    };
  }

  _quickGenerate(input, context) {
    const patterns = {
      greeting: { test: /你好|嗨|哈喽|hi|hello/i, responses: ['你好呀~', '嗨！', '哈喽！'] },
      thanks: { test: /谢谢|感谢|thanks/i, responses: ['不客气~', '应该的！', '很高兴能帮到你！'] },
      question: { test: /[?？]|什么|怎么|为什么/i, responses: ['嗯...让我想想', '好问题！', '我觉得是这样的...'] }
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test.test(input)) {
        return pattern.responses[Math.floor(Math.random() * pattern.responses.length)];
      }
    }

    return '嗯~';
  }

  precomputeResponses(inputs) {
    for (const input of inputs) {
      this.cache.set(input, this._quickGenerate(input, {}));
    }
  }

  getMetrics() {
    return {
      cacheHitRate: this.stats.cacheHits / Math.max(1, this.stats.totalRequests),
      cacheSize: this.cache.size
    };
  }
}

class SentimentFeedbackLoop {
  constructor(options = {}) {
    this.options = options;
    this.sentimentBuffer = [];
    this.currentSentiment = { dominantEmotion: 'neutral', score: 0 };
  }

  processMessage(text, metadata = {}) {
    const analysis = this._analyze(text);
    this.sentimentBuffer.push({ ...analysis, timestamp: Date.now() });
    if (this.sentimentBuffer.length > 100) this.sentimentBuffer.shift();
    
    const prev = this.currentSentiment.dominantEmotion;
    this.currentSentiment.dominantEmotion = analysis.sentiment;
    this.currentSentiment.score = analysis.score;

    if (prev !== analysis.sentiment && this.options.onSentimentChange) {
      this.options.onSentimentChange({ previous: prev, current: analysis.sentiment, score: analysis.score });
    }

    return this.currentSentiment;
  }

  _analyze(text) {
    const positive = ['好', '棒', '喜欢', '开心', '哈哈', '爱'];
    const negative = ['差', '讨厌', '难过', '垃圾', '烦'];
    
    let score = 0;
    for (const w of positive) if (text.includes(w)) score += 0.3;
    for (const w of negative) if (text.includes(w)) score -= 0.3;
    
    score = Math.max(-1, Math.min(1, score));
    
    return {
      score,
      sentiment: score > 0.2 ? 'happy' : score < -0.2 ? 'sad' : 'neutral',
      intensity: Math.abs(score)
    };
  }

  getCurrentSentiment() {
    return { ...this.currentSentiment };
  }

  getTrend() {
    if (this.sentimentBuffer.length < 10) return { trend: 'stable', change: 0 };
    
    const recent = this.sentimentBuffer.slice(-10);
    const avg = recent.reduce((s, m) => s + m.score, 0) / recent.length;
    
    return {
      trend: avg > 0.1 ? 'positive' : avg < -0.1 ? 'negative' : 'stable',
      change: avg
    };
  }

  getStats() {
    return {
      bufferSize: this.sentimentBuffer.length,
      current: this.currentSentiment
    };
  }

  getVoiceParams() {
    const params = {
      happy: { rate: 1.15, pitch: 1.1, volume: 1.0 },
      sad: { rate: 0.85, pitch: 0.9, volume: 0.8 },
      neutral: { rate: 1.0, pitch: 1.0, volume: 0.95 }
    };
    return params[this.currentSentiment.dominantEmotion] || params.neutral;
  }
}

class ContinuousInferenceSystem {
  constructor(options = {}) {
    this.options = { inferenceInterval: 100, enableEmergence: true, ...options };
    this.isRunning = false;
    this.loop = null;
    this.chatMessages = [];
    this.emotionState = { current: 'neutral', intensity: 0.3 };
    this.listeners = new Map();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loop = setInterval(() => this._tick(), this.options.inferenceInterval);
  }

  stop() {
    this.isRunning = false;
    if (this.loop) clearInterval(this.loop);
  }

  receiveInput(data) {
    this.chatMessages.push({ ...data, timestamp: Date.now() });
    if (this.chatMessages.length > 100) this.chatMessages.shift();
  }

  _tick() {
    // 情感衰减
    this.emotionState.intensity *= 0.98;

    // 检查涌现
    if (this.options.enableEmergence && Math.random() < 0.01 && this.chatMessages.length > 5) {
      this._triggerEmergence();
    }
  }

  _triggerEmergence() {
    const thoughts = [
      { content: '我在想...你们觉得AI会有自己的想法吗？', emotion: 'curious', action: 'existential' },
      { content: '突然想到一个冷笑话...', emotion: 'happy', action: 'joke' },
      { content: '你们今天过得怎么样？', emotion: 'calm', action: 'question' }
    ];

    const thought = thoughts[Math.floor(Math.random() * thoughts.length)];
    this._emit('proactive_speech', thought);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  _emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    for (const cb of callbacks) cb(data);
  }

  get personaLayer() {
    return { traits: {} };
  }
  
  set personaLayer(value) {}
}

// 导出
if (typeof window !== 'undefined') {
  window.EnhancedAvatarEngine = EnhancedAvatarEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EnhancedAvatarEngine };
}
