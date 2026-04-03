/**
 * AI虚拟人物核心引擎 - AI Virtual Character Engine
 * 
 * 架构设计:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    AvatarEngine                             │
 * ├─────────────────────────────────────────────────────────────┤
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
 * │  │ EventBus    │  │ StateManager│  │ PersonalitySystem   │ │
 * │  │ (事件总线)   │  │ (状态管理)   │  │ (人格系统)          │ │
 * │  └─────────────┘  └─────────────┘  └─────────────────────┘ │
 * ├─────────────────────────────────────────────────────────────┤
 * │                     输入层 (Input)                          │
 * │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐ │
 * │  │ Voice  │ │ Text   │ │Gesture │ │Vision  │ │GameState  │ │
 * │  │ Input  │ │ Input  │ │Input   │ │Input   │ │Input      │ │
 * │  └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘ │
 * ├─────────────────────────────────────────────────────────────┤
 * │                     大脑层 (Brain)                         │
 * │  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐  │
 * │  │ MemorySystem│  │ LLMRouter   │  │ ActionPlanner      │  │
 * │  │ (记忆系统)   │  │ (LLM路由)   │  │ (行为规划)         │  │
 * │  └─────────────┘  └─────────────┘  └────────────────────┘  │
 * ├─────────────────────────────────────────────────────────────┤
 * │                     输出层 (Output)                         │
 * │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │
 * │  │ VRM/   │ │ TTS    │ │Animati-│ │Gesture │ │GameActi- │ │
 * │  │Live2D  │ │ Engine │ │onCtrl  │ │Output  │ │onOutput  │ │
 * │  └────────┘ └────────┘ └────────┘ └────────┘ └──────────┘ │
 * └─────────────────────────────────────────────────────────────┘
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
    this.onceListeners = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * 订阅事件
   */
  on(event, callback, context = null) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    const listener = { callback, context, id: this._generateId() };
    this.listeners.get(event).push(listener);
    return listener.id;
  }

  /**
   * 订阅一次性事件
   */
  once(event, callback, context = null) {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, []);
    }
    const listener = { callback, context, id: this._generateId() };
    this.onceListeners.get(event).push(listener);
    return listener.id;
  }

  /**
   * 取消订阅
   */
  off(event, listenerId) {
    if (this.listeners.has(event)) {
      const listeners = this.listeners.get(event).filter(l => l.id !== listenerId);
      this.listeners.set(event, listeners);
    }
    if (this.onceListeners.has(event)) {
      const listeners = this.onceListeners.get(event).filter(l => l.id !== listenerId);
      this.onceListeners.set(event, listeners);
    }
  }

  /**
   * 发射事件
   */
  emit(event, data = {}) {
    const eventObj = {
      type: event,
      data,
      timestamp: Date.now()
    };

    this.eventHistory.push(eventObj);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const results = [];

    if (this.listeners.has(event)) {
      for (const listener of this.listeners.get(event)) {
        try {
          const result = listener.callback.call(listener.context, data);
          results.push(result);
        } catch (e) {
          console.error(`[EventBus] Error in listener for ${event}:`, e);
        }
      }
    }

    if (this.onceListeners.has(event)) {
      for (const listener of this.onceListeners.get(event)) {
        try {
          const result = listener.callback.call(listener.context, data);
          results.push(result);
        } catch (e) {
          console.error(`[EventBus] Error in once listener for ${event}:`, e);
        }
      }
      this.onceListeners.delete(event);
    }

    return results;
  }

  /**
   * 订阅命名空间事件 (如 'voice.*')
   */
  onNamespace(namespace, callback, context = null) {
    // 转义特殊字符，只保留*作为通配符
    const escaped = namespace.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const pattern = new RegExp(`^${escaped}$`);
    return this.on('_namespace', (data) => {
      if (pattern.test(data.type)) {
        callback(data);
      }
    }, context);
  }

  /**
   * 获取事件历史
   */
  getHistory(eventType = null) {
    if (eventType) {
      return this.eventHistory.filter(e => e.type === eventType);
    }
    return [...this.eventHistory];
  }

  /**
   * 清除所有监听器
   */
  clear() {
    this.listeners.clear();
    this.onceListeners.clear();
  }

  _generateId() {
    return Math.random().toString(36).substring(2, 9);
  }
}

class StateManager {
  constructor(initialState = {}) {
    this.state = { ...initialState };
    this.listeners = new Map();
    this.history = [];
    this.maxHistorySize = 50;
    this.isBatching = false;
    this.pendingUpdates = [];
  }

  /**
   * 获取状态
   */
  get(path = null) {
    if (!path) return { ...this.state };
    
    const keys = path.split('.');
    let value = this.state;
    
    for (const key of keys) {
      if (value === null || value === undefined) return undefined;
      value = value[key];
    }
    
    return value;
  }

  /**
   * 设置状态
   */
  set(path, value) {
    if (this.isBatching) {
      this.pendingUpdates.push({ path, value });
      return;
    }

    const oldValue = this.get(path);
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    let obj = this.state;
    for (const key of keys) {
      if (typeof obj[key] !== 'object' || obj[key] === null) {
        obj[key] = {};
      }
      obj = obj[key];
    }
    
    obj[lastKey] = value;
    
    this._emitChange(path, oldValue, value);
    
    this.history.push({ path, oldValue, newValue: value, timestamp: Date.now() });
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * 批量更新
   */
  batch(updateFn) {
    this.isBatching = true;
    updateFn();
    this.isBatching = false;
    
    for (const update of this.pendingUpdates) {
      this.set(update.path, update.value);
    }
    this.pendingUpdates = [];
  }

  /**
   * 订阅状态变化
   */
  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, []);
    }
    const id = this._generateId();
    this.listeners.get(path).push({ id, callback });
    return id;
  }

  /**
   * 取消订阅
   */
  unsubscribe(path, listenerId) {
    if (this.listeners.has(path)) {
      const listeners = this.listeners.get(path).filter(l => l.id !== listenerId);
      this.listeners.set(path, listeners);
    }
  }

  /**
   * 合并状态
   */
  merge(updates) {
    this.batch(() => {
      for (const [path, value] of Object.entries(updates)) {
        this.set(path, value);
      }
    });
  }

  /**
   * 重置状态
   */
  reset(newState = {}) {
    const oldState = { ...this.state };
    this.state = { ...newState };
    this._emitChange('*', oldState, this.state);
    this.history = [];
  }

  _emitChange(path, oldValue, newValue) {
    const listeners = this.listeners.get(path) || [];
    for (const listener of listeners) {
      try {
        listener.callback(newValue, oldValue);
      } catch (e) {
        console.error(`[StateManager] Error in subscriber for ${path}:`, e);
      }
    }
    
    const wildcardListeners = this.listeners.get('*') || [];
    for (const listener of wildcardListeners) {
      listener.callback(path, newValue, oldValue);
    }
  }

  _generateId() {
    return Math.random().toString(36).substring(2, 9);
  }
}

class PersonalitySystem {
  constructor() {
    this.currentPersonality = null;
    this.personalities = new Map();
    this.emotionState = {
      primary: 'neutral',
      intensity: 0.5,
      duration: 0,
      triggers: []
    };
    this.defaultPersonalities = {
      cheerful: {
        name: 'Cheerful',
        traits: {
          openness: 0.8,
          conscientiousness: 0.6,
          extraversion: 0.9,
          agreeableness: 0.8,
          neuroticism: 0.3
        },
        speechPatterns: {
          exclamationChance: 0.4,
          emojiUsage: 0.6,
          questionFrequency: 0.3,
          humorLevel: 0.8
        },
        ttsConfig: {
          rate: 1.1,
          pitch: 1.05,
          volume: 1.0
        }
      },
      calm: {
        name: 'Calm',
        traits: {
          openness: 0.7,
          conscientiousness: 0.8,
          extraversion: 0.4,
          agreeableness: 0.7,
          neuroticism: 0.2
        },
        speechPatterns: {
          exclamationChance: 0.05,
          emojiUsage: 0.1,
          questionFrequency: 0.4,
          humorLevel: 0.2
        },
        ttsConfig: {
          rate: 0.9,
          pitch: 0.95,
          volume: 0.9
        }
      },
      playful: {
        name: 'Playful',
        traits: {
          openness: 0.9,
          conscientiousness: 0.4,
          extraversion: 0.85,
          agreeableness: 0.9,
          neuroticism: 0.4
        },
        speechPatterns: {
          exclamationChance: 0.5,
          emojiUsage: 0.8,
          questionFrequency: 0.5,
          humorLevel: 0.95
        },
        ttsConfig: {
          rate: 1.15,
          pitch: 1.1,
          volume: 1.0
        }
      }
    };
  }

  /**
   * 添加人格
   */
  addPersonality(id, personality) {
    this.personalities.set(id, personality);
  }

  /**
   * 设置当前人格
   */
  setPersonality(id) {
    if (this.personalities.has(id)) {
      this.currentPersonality = id;
    } else if (this.defaultPersonalities[id]) {
      this.currentPersonality = id;
    }
  }

  /**
   * 获取当前人格配置
   */
  getCurrentConfig() {
    if (this.personalities.has(this.currentPersonality)) {
      return this.personalities.get(this.currentPersonality);
    }
    return this.defaultPersonalities[this.currentPersonality] || this.defaultPersonalities.calm;
  }

  /**
   * 设置情绪
   */
  setEmotion(emotion, intensity = 0.5, duration = 5000) {
    this.emotionState = {
      primary: emotion,
      intensity: Math.max(0, Math.min(1, intensity)),
      duration,
      startTime: Date.now(),
      triggers: []
    };
  }

  /**
   * 获取当前情绪
   */
  getEmotion() {
    return { ...this.emotionState };
  }

  /**
   * 更新情绪强度
   */
  updateEmotion(delta) {
    const elapsed = Date.now() - this.emotionState.startTime;
    if (elapsed > this.emotionState.duration && this.emotionState.duration > 0) {
      this.emotionState.primary = 'neutral';
      this.emotionState.intensity = 0.3;
    }
    return this.getEmotion();
  }

  /**
   * 获取TTS配置
   */
  getTTSConfig() {
    const config = this.getCurrentConfig();
    return config.ttsConfig || this.defaultPersonalities.calm.ttsConfig;
  }

  /**
   * 生成回复风格
   */
  generateResponseStyle(text) {
    const config = this.getCurrentConfig();
    const patterns = config.speechPatterns;
    
    let styledText = text;
    
    if (Math.random() < patterns.exclamationChance && !styledText.endsWith('!')) {
      styledText += '!';
    }
    
    if (Math.random() < patterns.questionFrequency && !styledText.includes('?')) {
      styledText += '?';
    }
    
    return styledText;
  }
}

class AvatarEngine {
  constructor(options = {}) {
    this.options = {
      containerId: options.containerId || 'avatar-container',
      renderMode: options.renderMode || 'canvas2d',
      personality: options.personality || 'calm',
      language: options.language || 'zh-CN',
      enableVoice: options.enableVoice !== false,
      enableGesture: options.enableGesture !== false,
      enableMemory: options.enableMemory !== false,
      ...options
    };

    // 核心系统
    this.eventBus = new EventBus();
    this.state = new StateManager({
      avatar: {
        mood: 'neutral',
        expression: 'neutral',
        isSpeaking: false,
        isListening: false,
        currentAction: null
      },
      voice: {
        isActive: false,
        volume: 1.0,
        isMuted: false
      },
      memory: {
        shortTerm: [],
        longTerm: [],
        context: []
      },
      system: {
        isReady: false,
        isLoading: false,
        error: null
      }
    });
    this.personality = new PersonalitySystem();
    this.personality.setPersonality(this.options.personality);

    // 子系统
    this.renderSystem = null;
    this.voiceSystem = null;
    this.gestureSystem = null;
    this.memorySystem = null;
    this.llmRouter = null;
    
    // 新增: 本地数据库和AI推理
    this.localDatabase = null;
    this.inferenceEngine = null;
    this.llmEngine = null;

    // 初始化
    this._init();
  }

  async _init() {
    this.state.set('system.isLoading', true);
    
    try {
      await this._initRenderSystem();
      await this._initVoiceSystem();
      await this._initGestureSystem();
      await this._initMemorySystem();
      
      // 新增: 初始化本地数据库
      await this._initLocalDatabase();
      
      // 新增: 初始化本地AI推理
      await this._initLocalInference();
      
      this._setupEventHandlers();
      
      this.state.set('system.isReady', true);
      this.state.set('system.isLoading', false);
      
      this.eventBus.emit('engine:ready');
    } catch (error) {
      this.state.set('system.error', error.message);
      this.state.set('system.isLoading', false);
      this.eventBus.emit('engine:error', { error });
    }
  }

  async _initRenderSystem() {
    if (this.options.renderMode === 'vr') {
      const { VRMComponent } = await import('./VRMComponent.js');
      this.renderSystem = new VRMComponent(this.options.containerId);
    } else if (this.options.renderMode === 'live2d') {
      const { Live2DComponent } = await import('./Live2DComponent.js');
      this.renderSystem = new Live2DComponent(this.options.containerId);
    } else {
      const { VirtualCharacter } = await import('./VirtualCharacter.js');
      this.renderSystem = new VirtualCharacter(this.options.containerId);
    }
    
    await this.renderSystem.init();
    this.eventBus.emit('render:ready');
  }

  async _initVoiceSystem() {
    if (!this.options.enableVoice) return;
    
    const { VoiceAvatar } = await import('./VoiceAvatar.js');
    this.voiceSystem = new VoiceAvatar(this.renderSystem, {
      moodLipSync: true
    });
    
    this.voiceSystem.enable();
    this.eventBus.emit('voice:ready');
  }

  async _initGestureSystem() {
    if (!this.options.enableGesture) return;
    
    const { GestureRecognitionSystem } = await import('./GestureRecognitionSystem.js');
    this.gestureSystem = new GestureRecognitionSystem({
      onGesture: (gesture) => {
        this.eventBus.emit('gesture:detected', gesture);
      }
    });
    
    this.eventBus.emit('gesture:ready');
  }

  async _initMemorySystem() {
    if (!this.options.enableMemory) return;
    
    const { LongTermMemorySystem } = await import('./LongTermMemorySystem.js');
    this.memorySystem = new LongTermMemorySystem();
    
    await this.memorySystem.init();
    this.eventBus.emit('memory:ready');
  }

  /**
   * 初始化本地数据库 (DuckDB WASM)
   */
  async _initLocalDatabase() {
    try {
      const { createDuckDBWASM } = await import('./DuckDBWASM.js');
      this.localDatabase = await createDuckDBWASM({
        enablePersistence: true,
        dataDir: 'avatar_memory',
        onReady: () => {
          this.eventBus.emit('database:ready');
        },
        onError: (error) => {
          console.warn('[AvatarEngine] Local database error:', error);
        }
      });
    } catch (error) {
      console.warn('[AvatarEngine] Local database not available:', error);
    }
  }

  /**
   * 初始化本地AI推理 (WebGPU)
   */
  async _initLocalInference() {
    try {
      const { WebGPUInferenceEngine } = await import('./WebGPUInferenceEngine.js');
      this.inferenceEngine = new WebGPUInferenceEngine({
        device: 'auto',
        dtype: 'q8',
        onReady: () => {
          this.eventBus.emit('inference:ready');
        },
        onProgress: (progress) => {
          this.eventBus.emit('inference:progress', progress);
        }
      });
      await this.inferenceEngine.init();
      
      // 加载情感分析模型
      await this.inferenceEngine.loadPipeline(
        'sentiment-analysis',
        'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
      );
      
      // 可选: 加载嵌入模型
      this._embeddingPipeline = null;
    } catch (error) {
      console.warn('[AvatarEngine] Local inference not available:', error);
    }
  }

  /**
   * 初始化本地大语言模型 (WebLLM)
   */
  async _initLocalLLM(modelName = 'Llama-3.2-1B-Instruct-q4f16_1-MLC') {
    try {
      const { WebLLMEngine } = await import('./WebGPUInferenceEngine.js');
      this.llmEngine = new WebLLMEngine({
        model: modelName,
        onReady: () => {
          this.eventBus.emit('llm:ready');
        },
        onProgress: (progress) => {
          this.eventBus.emit('llm:progress', progress);
        }
      });
      await this.llmEngine.init();
    } catch (error) {
      console.warn('[AvatarEngine] Local LLM not available:', error);
    }
  }

  _setupEventHandlers() {
    this.eventBus.on('text:input', async (data) => {
      const { text } = data;
      this.state.set('avatar.currentAction', 'thinking');
      
      const context = this.memorySystem ? await this.memorySystem.getContext() : [];
      const response = await this._processText(text, context);
      
      this.eventBus.emit('text:response', { text: response });
      this.speak(response);
    });

    this.eventBus.on('voice:input', async (data) => {
      const { transcript } = data;
      this.eventBus.emit('text:input', { text: transcript });
    });

    this.eventBus.on('gesture:detected', (data) => {
      this.state.set('avatar.currentAction', `gesture_${data.name}`);
    });

    this.state.subscribe('avatar.mood', (mood) => {
      if (this.renderSystem) {
        this.renderSystem.setMood(mood);
      }
    });
  }

  async _processText(text, context) {
    const personality = this.personality.getCurrentConfig();
    const emotion = this.personality.getEmotion();
    
    const prompt = this._buildPrompt(text, personality, emotion, context);
    
    if (this.llmRouter) {
      return await this.llmRouter.generate(prompt);
    }
    
    return `[${personality.name}] ${text}`;
  }

  _buildPrompt(text, personality, emotion, context) {
    return `You are a ${personality.name} AI assistant.
Current emotion: ${emotion.primary} (${emotion.intensity})
Context: ${JSON.stringify(context.slice(-5))}
User said: ${text}`;
  }

  speak(text) {
    if (!this.voiceSystem) return;
    
    const config = this.personality.getTTSConfig();
    this.state.set('avatar.isSpeaking', true);
    
    this.voiceSystem.speak(text, {
      mood: this.personality.getEmotion().primary,
      rateVariants: { happy: 1.1, calm: 0.9, excited: 1.2 },
      pitchVariants: { happy: 1.05, calm: 0.95, excited: 1.1 }
    });

    this.voiceSystem.tts.onEnd = () => {
      this.state.set('avatar.isSpeaking', false);
    };
  }

  setMood(mood) {
    this.personality.setEmotion(mood);
    this.state.set('avatar.mood', mood);
  }

  setPersonality(personalityId) {
    this.personality.setPersonality(personalityId);
    this.eventBus.emit('personality:changed', { personality: personalityId });
  }

  async addMemory(content, type = 'shortTerm') {
    if (!this.memorySystem) return;
    await this.memorySystem.add(content, type);
  }

  /**
   * 使用本地数据库存储记忆
   */
  async saveToLocalDatabase(table, data) {
    if (!this.localDatabase) return null;
    
    try {
      if (table === 'conversation') {
        return await this.localDatabase.addConversation(data.role, data.content, data.metadata);
      } else if (table === 'memory') {
        return await this.localDatabase.addMemory(data.content, data.type, data.importance);
      } else if (table === 'emotion') {
        return await this.localDatabase.addEmotion(data.emotion, data.intensity, data.trigger, data.context);
      }
    } catch (error) {
      console.error('[AvatarEngine] Local database save error:', error);
    }
    return null;
  }

  /**
   * 从本地数据库查询记忆
   */
  async queryFromLocalDatabase(table, query, limit = 10) {
    if (!this.localDatabase) return [];
    
    try {
      if (table === 'conversation') {
        return await this.localDatabase.getConversationHistory(limit);
      } else if (table === 'memory') {
        return await this.localDatabase.semanticSearchMemories(query, limit);
      } else if (table === 'emotion') {
        return await this.localDatabase.getEmotionTrend(24);
      }
    } catch (error) {
      console.error('[AvatarEngine] Local database query error:', error);
    }
    return [];
  }

  /**
   * 本地情感分析
   */
  async analyzeSentiment(text) {
    if (!this.inferenceEngine) return null;
    
    try {
      const result = await this.inferenceEngine.infer(text);
      if (result.success) {
        return result.result;
      }
    } catch (error) {
      console.error('[AvatarEngine] Sentiment analysis error:', error);
    }
    return null;
  }

  /**
   * 本地生成嵌入
   */
  async generateEmbedding(text) {
    if (!this.inferenceEngine) return null;
    
    try {
      return await this.inferenceEngine.getEmbedding(text);
    } catch (error) {
      console.error('[AvatarEngine] Embedding generation error:', error);
    }
    return null;
  }

  /**
   * 使用本地LLM生成回复
   */
  async generateWithLocalLLM(messages) {
    if (!this.llmEngine) return null;
    
    try {
      const result = await this.llmEngine.chat(messages, { stream: false });
      return result;
    } catch (error) {
      console.error('[AvatarEngine] Local LLM error:', error);
      return null;
    }
  }

  /**
   * 获取设备能力
   */
  async getDeviceCapabilities() {
    if (!this.inferenceEngine) return null;
    return this.inferenceEngine.getCapabilities();
  }

  /**
   * 获取数据库统计
   */
  getDatabaseStats() {
    if (!this.localDatabase) return null;
    return this.localDatabase.getStats();
  }

  on(event, callback, context = null) {
    return this.eventBus.on(event, callback, context);
  }

  off(event, listenerId) {
    this.eventBus.off(event, listenerId);
  }

  getState(path = null) {
    return this.state.get(path);
  }

  destroy() {
    if (this.renderSystem) this.renderSystem.destroy();
    if (this.gestureSystem) this.gestureSystem.stop();
    if (this.voiceSystem) this.voiceSystem.disable();
    if (this.memorySystem) this.memorySystem.destroy();
    if (this.localDatabase) this.localDatabase.close();
    if (this.inferenceEngine) this.inferenceEngine.terminate();
    if (this.llmEngine) this.llmEngine.terminate();
    this.eventBus.clear();
  }
}

if (typeof window !== 'undefined') {
  window.AvatarEngine = AvatarEngine;
  window.EventBus = EventBus;
  window.StateManager = StateManager;
  window.PersonalitySystem = PersonalitySystem;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AvatarEngine, EventBus, StateManager, PersonalitySystem };
}
