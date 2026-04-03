/**
 * AI虚拟人物统一集成系统 - AI Avatar Unified Integration System
 * 
 * 整合所有输入输出模块，统一管理虚拟人物的各个子系统
 */

class AvatarIntegrationHub {
  constructor(options = {}) {
    this.options = {
      engine: options.engine || new EventBus(),
      state: options.state || new StateManager(),
      personality: options.personality || new PersonalitySystem(),
      ...options
    };

    this.subsystems = {
      input: {},
      brain: {},
      output: {},
      platform: {}
    };

    this._init();
  }

  _init() {
    this._registerDefaultSubsystems();
    this._setupCentralEventHandlers();
  }

  /**
   * 注册子系统
   */
  register(type, name, instance) {
    if (!this.subsystems[type]) {
      this.subsystems[type] = {};
    }
    this.subsystems[type][name] = instance;
    this.options.engine.emit(`subsystem:registered`, { type, name });
    return instance;
  }

  /**
   * 获取子系统
   */
  get(type, name) {
    return this.subsystems[type]?.[name];
  }

  /**
   * 获取所有子系统
   */
  getAll(type) {
    return this.subsystems[type] || {};
  }

  /**
   * 注册默认子系统
   */
  _registerDefaultSubsystems() {
    // 输入子系统
    this.register('input', 'voice', new VoiceInputSubsystem(this));
    this.register('input', 'text', new TextInputSubsystem(this));
    this.register('input', 'gesture', new GestureInputSubsystem(this));
    this.register('input', 'vision', new VisionInputSubsystem(this));

    // 大脑子系统
    this.register('brain', 'memory', new MemorySubsystem(this));
    this.register('brain', 'llm', new LLMRouterSubsystem(this));
    this.register('brain', 'action', new ActionPlannerSubsystem(this));

    // 输出子系统
    this.register('output', 'vr', new VRMRenderSubsystem(this));
    this.register('output', 'live2d', new Live2DRenderSubsystem(this));
    this.register('output', 'canvas', new CanvasRenderSubsystem(this));
    this.register('output', 'tts', new TTSSubsystem(this));
    this.register('output', 'animation', new AnimationSubsystem(this));

    // 平台集成子系统
    this.register('platform', 'telegram', new TelegramPlatformSubsystem(this));
    this.register('platform', 'discord', new DiscordPlatformSubsystem(this));
    this.register('platform', 'game', new GamePlatformSubsystem(this));
  }

  _setupCentralEventHandlers() {
    const engine = this.options.engine;

    // 输入事件 -> 处理
    engine.on('input:voice', async (data) => {
      const transcript = await this.get('input', 'voice').transcribe(data.audio);
      engine.emit('text:input', { text: transcript });
    });

    engine.on('input:text', (data) => {
      engine.emit('text:input', data);
    });

    engine.on('input:gesture', (data) => {
      this.options.state.set('avatar.lastGesture', data);
      engine.emit('brain:process', { type: 'gesture', data });
    });

    // 文本输入 -> 大脑处理
    engine.on('text:input', async (data) => {
      const { text } = data;
      this.options.state.set('avatar.isThinking', true);

      try {
        const memory = this.get('brain', 'memory');
        const context = memory ? await memory.getContext(text) : [];

        const response = await this.get('brain', 'llm').generate(text, {
          context,
          personality: this.options.personality.getCurrentConfig(),
          emotion: this.options.personality.getEmotion()
        });

        engine.emit('text:response', { text: response });
      } finally {
        this.options.state.set('avatar.isThinking', false);
      }
    });

    // 文本响应 -> 输出
    engine.on('text:response', (data) => {
      this.get('output', 'tts')?.speak(data.text);
      this.get('brain', 'memory')?.add(data.text, 'conversation');
    });

    // 情绪变化 -> 动画更新
    engine.on('emotion:change', (data) => {
      this.get('output', 'animation')?.setEmotion(data.emotion);
      this.get('output', 'tts')?.updateEmotion(data.emotion);
    });
  }

  /**
   * 启动所有子系统
   */
  async start() {
    const promises = [];

    for (const [type, subsystems] of Object.entries(this.subsystems)) {
      for (const [name, instance] of Object.entries(subsystems)) {
        if (instance.start) {
          promises.push(instance.start());
        }
      }
    }

    await Promise.all(promises);
    this.options.engine.emit('hub:ready');
  }

  /**
   * 停止所有子系统
   */
  async stop() {
    for (const [type, subsystems] of Object.entries(this.subsystems)) {
      for (const [name, instance] of Object.entries(subsystems)) {
        if (instance.stop) {
          await instance.stop();
        }
      }
    }
    this.options.engine.emit('hub:stopped');
  }
}

// ============ 输入子系统 ============

class VoiceInputSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.recognizer = null;
    this.isActive = false;
  }

  async start() {
    const { WebRTCVoiceStream } = await import('./WebRTCVoiceStream.js');
    this.recognizer = new WebRTCVoiceStream({
      onVoiceData: (audio) => {
        this.hub.options.engine.emit('input:voice', { audio });
      }
    });
    this.isActive = true;
  }

  async transcribe(audioData) {
    // 调用语音识别
    return "转录文本";
  }

  stop() {
    if (this.recognizer) {
      this.recognizer.stop();
    }
    this.isActive = false;
  }
}

class TextInputSubsystem {
  constructor(hub) {
    this.hub = hub;
  }

  send(text) {
    this.hub.options.engine.emit('input:text', { text });
  }
}

class GestureInputSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.recognizer = null;
  }

  async start() {
    const { GestureRecognitionSystem } = await import('./GestureRecognitionSystem.js');
    this.recognizer = new GestureRecognitionSystem({
      onGesture: (gesture) => {
        this.hub.options.engine.emit('input:gesture', gesture);
      }
    });
  }

  stop() {
    if (this.recognizer) {
      this.recognizer.stop();
    }
  }
}

class VisionInputSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.visionAgent = null;
  }

  async start() {
    const { MultiModalVision } = await import('./MultiModalVision.js');
    this.visionAgent = new MultiModalVision({
      onSceneDetected: (scene) => {
        this.hub.options.engine.emit('vision:scene', scene);
      }
    });
  }

  analyze(imageData) {
    return this.visionAgent?.analyze(imageData);
  }
}

// ============ 大脑子系统 ============

class MemorySubsystem {
  constructor(hub) {
    this.hub = hub;
    this.shortTerm = [];
    this.longTerm = null;
    this.maxShortTermSize = 20;
  }

  async start() {
    try {
      const { LongTermMemorySystem } = await import('./LongTermMemorySystem.js');
      this.longTerm = new LongTermMemorySystem();
      await this.longTerm.init();
    } catch (e) {
      console.warn('[MemorySubsystem] Long-term memory not available');
    }
  }

  async getContext(query = '') {
    const recent = this.shortTerm.slice(-5);
    let semantic = [];

    if (this.longTerm && query) {
      semantic = await this.longTerm.search(query, 5);
    }

    return { recent, semantic };
  }

  add(content, type = 'conversation') {
    if (type === 'conversation') {
      this.shortTerm.push({
        content,
        timestamp: Date.now()
      });

      if (this.shortTerm.length > this.maxShortTermSize) {
        this.shortTerm.shift();
      }
    }

    if (this.longTerm) {
      this.longTerm.add(content, type);
    }
  }

  clear() {
    this.shortTerm = [];
  }
}

class LLMRouterSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.defaultProvider = 'openai';
    this.providers = {};
  }

  addProvider(name, provider) {
    this.providers[name] = provider;
  }

  async generate(text, options = {}) {
    const provider = this.providers[this.defaultProvider];
    if (provider) {
      return await provider.generate(text, options);
    }
    return `[AI Response to: ${text}]`;
  }
}

class ActionPlannerSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.availableActions = [];
  }

  registerAction(action) {
    this.availableActions.push(action);
  }

  async plan(context) {
    // 根据上下文规划行动
    return null;
  }

  execute(action) {
    this.hub.options.engine.emit('action:execute', action);
  }
}

// ============ 输出子系统 ============

class VRMRenderSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.renderer = null;
  }

  async start() {
    const { VRMComponent } = await import('./VRMComponent.js');
    this.renderer = new VRMComponent('vrm-container');
    await this.renderer.init();
  }

  setEmotion(emotion) {
    this.renderer?.setMood?.(emotion);
  }

  speak() {
    this.renderer?.speak?.();
  }

  stopSpeaking() {
    this.renderer?.stopSpeaking?.();
  }
}

class Live2DRenderSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.renderer = null;
  }

  async start() {
    const { Live2DComponent } = await import('./Live2DComponent.js');
    this.renderer = new Live2DComponent('live2d-container');
    await this.renderer.init();
  }

  setEmotion(emotion) {
    this.renderer?.setMood?.(emotion);
  }
}

class CanvasRenderSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.renderer = null;
  }

  async start() {
    const { VirtualCharacter } = await import('./VirtualCharacter.js');
    this.renderer = new VirtualCharacter('canvas-container');
    this.renderer.init();
  }

  setMood(mood) {
    this.renderer?.setMood?.(mood);
  }

  speak(text) {
    this.renderer?.speak?.(text);
  }
}

class TTSSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.voiceAvatar = null;
  }

  async start() {
    const { VoiceAvatar } = await import('./VoiceAvatar.js');
    const renderSystem = this.hub.get('output', 'canvas') || this.hub.get('output', 'vr');
    this.voiceAvatar = new VoiceAvatar(renderSystem?.renderer);
    this.voiceAvatar.enable();
  }

  speak(text) {
    this.voiceAvatar?.speak(text, {
      mood: this.hub.options.personality.getEmotion().primary
    });
  }

  stop() {
    this.voiceAvatar?.stop();
  }

  updateEmotion(emotion) {
    this.voiceAvatar?.setMood?.(emotion);
  }
}

class AnimationSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.emotionAnimation = null;
  }

  async start() {
    const { EmotionAnimationSystem } = await import('./EmotionAnimationSystem.js');
    this.emotionAnimation = new EmotionAnimationSystem();
  }

  setEmotion(emotion) {
    this.emotionAnimation?.setEmotion?.(emotion);
  }
}

// ============ 平台集成子系统 ============

class TelegramPlatformSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.bot = null;
  }

  async start() {
    // 连接Telegram Bot
    this.hub.options.engine.on('telegram:message', (data) => {
      this.hub.options.engine.emit('text:input', { text: data.text });
    });
  }

  send(text) {
    if (this.bot) {
      this.bot.sendMessage(text);
    }
  }
}

class DiscordPlatformSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.client = null;
  }

  async start() {
    // 连接Discord
    this.hub.options.engine.on('discord:message', (data) => {
      this.hub.options.engine.emit('text:input', { text: data.text });
    });
  }

  send(text) {
    if (this.client) {
      this.client.sendMessage(text);
    }
  }
}

class GamePlatformSubsystem {
  constructor(hub) {
    this.hub = hub;
    this.gameBridge = null;
  }

  async start() {
    const { GameInteractionSystem } = await import('./GameInteractionSystem.js');
    this.gameBridge = new GameInteractionSystem({
      onGameEvent: (event) => {
        this.hub.options.engine.emit('game:event', event);
      }
    });
  }

  sendAction(action) {
    this.gameBridge?.executeAction(action);
  }
}

if (typeof window !== 'undefined') {
  window.AvatarIntegrationHub = AvatarIntegrationHub;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AvatarIntegrationHub };
}
