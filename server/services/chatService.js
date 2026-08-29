/**
 * UltraWork AI 聊天服务
 */

const { EventEmitter } = require('events');
const _config = require('../config');

// 集成 Claude Code 风格的上下文压缩服务
const { ContextCompactService } = require('../../src/agent/ContextCompactService');

class ChatService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.conversations = new Map();
    this.messageQueue = [];
    this.stats = {
      totalMessages: 0,
      totalLatency: 0,
      errors: 0,
      llm: { attempts: 0, successes: 0, fallbacks: 0 }
    };

    // LLM 推理（Ollama）— 可注入 mock，默认惰性创建
    this.ollamaBridge = options.ollamaBridge || null;
    this._ollamaTried = false;

    // 初始化上下文压缩服务
    this.contextCompact = new ContextCompactService({
      maxTokens: 100000,
      bufferTokens: 13000,
      warningThreshold: 20000,
      preserveRecentMessages: 10,
      autoCompactEnabled: true
    });
  }

  /**
   * 获取或惰性创建 Ollama bridge
   */
  _getOllamaBridge() {
    if (this.ollamaBridge) {return this.ollamaBridge;}
    // 不在首次失败后永久禁用 — 每次请求重试（Ollama 重启等瞬时故障不应永久降级）
    this._ollamaTried = true;
    try {
      const { OllamaBridge } = require('../../src/localInferencing/OllamaBridge');
      this.ollamaBridge = new OllamaBridge();
      return this.ollamaBridge;
    } catch (e) { /* Ollama 不可用时回退话术 */ }
    return null;
  }

  /**
   * Ollama 调用带重试（瞬时故障自动恢复）
   */
  async _chatWithRetry(bridge, sysPrompt, history) {
    const { RetryHandler } = require('../../src/utils/UltraWorkUtils');
    const messages = [
      { role: 'system', content: sysPrompt },
      ...history
    ];
    const result = await RetryHandler.retry(
      () => bridge.chat(messages, { temperature: 0.7 }),
      { maxAttempts: 3, delay: 500, backoff: 2 }
    );
    return result;
  }

  /**
   * 处理消息
   */
  async processMessage({ text, personality, context, userId }) {
    const startTime = Date.now();

    try {
      // 获取或创建会话
      let conversation = this.conversations.get(userId);
      if (!conversation) {
        conversation = {
          id: userId,
          messages: [],
          personality: personality || 'default',
          context: context || {},
          createdAt: new Date(),
          lastActivity: new Date()
        };
        this.conversations.set(userId, conversation);
      }

      // 更新会话
      conversation.personality = personality || conversation.personality;
      conversation.context = { ...conversation.context, ...context };
      conversation.lastActivity = new Date();

      // 添加用户消息
      const userMessage = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'user',
        content: text,
        timestamp: new Date()
      };

      conversation.messages.push(userMessage);

      // BrainSystem 感知：意图分析 + 记忆存储（非侵入式，失败不影响对话）
      try {
        const { BrainSystem } = require('../../src/core/BrainSystem');
        if (BrainSystem.analyzeIntent) {
          const intent = BrainSystem.analyzeIntent(text);
          conversation.context = { ...conversation.context, lastIntent: intent };
        }
        if (BrainSystem.smartStore && userId && userId !== 'anonymous') {
          BrainSystem.smartStore(`chat_${userId}_${Date.now()}`, { input: text, role: 'user', userId });
        }
        const hooks = require('../../src/hooks');
        if (hooks && hooks.HookEvents && hooks.triggerHook) {
          await hooks.triggerHook(hooks.HookEvents.MESSAGE_RECEIVE, { text, userId, conversation: conversation.id });
        }
      } catch (e) { /* BrainSystem 可选，失败静默 */ }

      // Claude Code 风格的上下文压缩
      this.contextCompact.addMessage(userMessage);

      // 检查是否需要压缩
      if (this.contextCompact.shouldCompact()) {
        const compacted = this.contextCompact.compact();
        if (compacted.messages) {
          conversation.messages = compacted.messages;
        }
        this.emit('context:compacted', { userId, compacted: compacted.stats });
      }

      // 生成回复
      const response = await this.generateResponse(text, conversation);

      // 添加助手回复
      const assistantMessage = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'assistant',
        content: response.text,
        personality: conversation.personality,
        timestamp: new Date(),
        latency: Date.now() - startTime
      };

      conversation.messages.push(assistantMessage);

      // BrainSystem 记忆：存储交互 + 发送钩子（非侵入式）
      try {
        const { BrainSystem } = require('../../src/core/BrainSystem');
        if (BrainSystem.smartStore && userId && userId !== 'anonymous') {
          BrainSystem.smartStore(`chat_reply_${userId}_${Date.now()}`, { input: text, output: response.text, userId });
        }
        const hooks = require('../../src/hooks');
        if (hooks && hooks.HookEvents && hooks.triggerHook) {
          await hooks.triggerHook(hooks.HookEvents.MESSAGE_SEND, { text: response.text, input: text, userId, conversation: conversation.id });
        }
      } catch (e) { /* BrainSystem 可选，失败静默 */ }

      // 限制会话长度
      if (conversation.messages.length > 100) {
        conversation.messages = conversation.messages.slice(-50);
      }

      // 更新统计
      this.stats.totalMessages++;
      this.stats.totalLatency += (Date.now() - startTime);

      // 发出事件
      this.emit('message:processed', {
        userId,
        messageId: assistantMessage.id,
        latency: Date.now() - startTime
      });

      return {
        id: assistantMessage.id,
        text: response.text,
        source: response.source,
        personality: conversation.personality,
        timestamp: assistantMessage.timestamp,
        metadata: {
          latency: Date.now() - startTime,
          conversationLength: conversation.messages.length
        }
      };
    } catch (error) {
      this.stats.errors++;
      this.emit('message:error', { userId, error });
      throw error;
    }
  }

  /**
   * 生成回复
   */
  async generateResponse(text, conversation) {
    // 优先使用 Ollama 真实推理（非侵入式，失败回退话术）
    try {
      const bridge = this._getOllamaBridge();
      if (bridge) {
        const history = (conversation.messages || []).slice(-6).map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }));
        // 动态 system prompt：融入人格 + 意图 + 相关记忆（多轮一致性 + 记忆增强）
        const personality = conversation.personality || 'default';
        const lastIntent = conversation.context && conversation.context.lastIntent;
        let memoryText = '';
        try {
          const { BrainSystem } = require('../../src/core/BrainSystem');
          let mem = [];
          if (BrainSystem.smartSearchSemantic) {
            mem = (await BrainSystem.smartSearchSemantic(text, 3)) || [];
          }
          if (mem.length === 0 && BrainSystem.smartSearch) {
            mem = BrainSystem.smartSearch(text, 3);
          }
          if (mem.length > 0) {
            memoryText = `你记得与该用户相关的信息：${mem.map((m) => typeof m.value === 'string' ? m.value : JSON.stringify(m.value)).join('；')}。`;
          }
        } catch (e) { /* 记忆可选，失败静默 */ }
        // 注入相关经验教训（学习到的知识影响回复）
        let lessonText = '';
        try {
          const LessonLibrary = require('../../src/core/LessonLibrary');
          const lib = new LessonLibrary({ quiet: true });
          const lessons = lib.search ? lib.search(text, { limit: 3 }) : [];
          if (Array.isArray(lessons) && lessons.length > 0) {
            lessonText = `参考经验教训：${lessons.map((l) => (l.lesson || l.problem || '').substring(0, 60)).filter(Boolean).join('；')}。`;
          }
        } catch (e) { /* 教训可选，失败静默 */ }
        // 注入思考前置（BrainSystem 的深层思考驱动更可靠的回答）
        let thinkText = '';
        try {
          const { BrainSystem } = require('../../src/core/BrainSystem');
          if (BrainSystem.forceThink) {
            const thinking = BrainSystem.forceThink(text);
            const qs = (thinking && thinking.metaQuestions) || [];
            if (Array.isArray(qs) && qs.length > 0) {
              const questions = qs.filter((q) => q && q.question).map((q) => q.question);
              if (questions.length > 0) {
                thinkText = `回答前请先思考：${questions.slice(0, 3).join('；')}。`;
              }
            }
          }
        } catch (e) { /* 思考可选，失败静默 */ }
        const sysPrompt = `你是一个乐于助人的中文 AI 助手，回答简洁友好。你当前的人格是「${personality}」。${lastIntent && lastIntent.intent ? `用户最近的意图是「${lastIntent.intent}」。` : ''}${memoryText}${lessonText}${thinkText}`;
        const result = await this._chatWithRetry(bridge, sysPrompt, history);
        this.stats.llm.attempts++;
        if (result && result.ok && result.text) {
          this.stats.llm.successes++;
          return { text: result.text, confidence: 0.9, source: 'ollama' };
        }
      }
    } catch (e) { /* Ollama 不可用，回退话术 */ }
    this.stats.llm.fallbacks++;

    const personality = conversation.personality || 'default';
    const _context = conversation.context || {};

    // 根据人格生成不同的回复风格
    const responses = {
      default: [
        '我理解你的意思。',
        '这是一个有趣的问题。',
        '让我想想...',
        '好的，我明白了。',
        '谢谢你的分享！'
      ],
      playful: [
        '哈哈，这太有趣了！',
        '哇，你真厉害！',
        '我也觉得很好玩呢~',
        '嘻嘻，你想到了什么？',
        '太棒了！继续说~'
      ],
      professional: [
        '我已经收到您的信息。',
        '根据您的描述，我建议...',
        '这个问题需要进一步分析。',
        '我理解您的需求。',
        '让我为您详细说明。'
      ],
      creative: [
        '让我用不同的角度思考...',
        '这让我想到了一个有趣的故事...',
        '也许我们可以这样看...',
        '想象一下...',
        '如果换一种方式呢？'
      ]
    };

    const responseList = responses[personality] || responses.default;
    const randomResponse = responseList[Math.floor(Math.random() * responseList.length)];

    // 模拟AI处理延迟
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    return {
      text: randomResponse,
      confidence: 0.8 + Math.random() * 0.2,
      source: 'fallback'
    };
  }

  /**
   * 流式处理消息
   */
  async processStream({ text, personality, context, userId, onData, onEnd, onError }) {
    try {
      const startTime = Date.now();

      // 获取或创建会话
      let conversation = this.conversations.get(userId);
      if (!conversation) {
        conversation = {
          id: userId,
          messages: [],
          personality: personality || 'default',
          context: context || {},
          createdAt: new Date(),
          lastActivity: new Date()
        };
        this.conversations.set(userId, conversation);
      }

      // 添加用户消息
      conversation.messages.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'user',
        content: text,
        timestamp: new Date()
      });

      // 模拟流式响应
      const fullResponse = `收到你的消息: "${text}"。这是${conversation.personality}人格的回复。`;
      const words = fullResponse.split('');

      let currentText = '';

      for (let i = 0; i < words.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 30));

        currentText += words[i];

        onData({
          type: 'chunk',
          content: words[i],
          fullText: currentText,
          progress: (i + 1) / words.length
        });
      }

      // 添加助手回复
      conversation.messages.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'assistant',
        content: currentText,
        timestamp: new Date(),
        latency: Date.now() - startTime
      });

      onEnd();
    } catch (error) {
      onError(error);
    }
  }

  /**
   * 获取聊天历史
   */
  async getHistory(userId, options = {}) {
    const conversation = this.conversations.get(userId);
    if (!conversation) {
      return { messages: [], total: 0 };
    }

    const { limit = 50, offset = 0 } = options;
    const messages = conversation.messages.slice(offset, offset + limit);

    return {
      messages,
      total: conversation.messages.length,
      offset,
      limit,
      personality: conversation.personality,
      lastActivity: conversation.lastActivity
    };
  }

  /**
   * 清除聊天历史
   */
  async clearHistory(userId) {
    const conversation = this.conversations.get(userId);
    if (conversation) {
      conversation.messages = [];
      conversation.lastActivity = new Date();
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      activeConversations: this.conversations.size,
      averageLatency: this.stats.totalMessages > 0 ?
        this.stats.totalLatency / this.stats.totalMessages : 0
    };
  }

  /**
   * 清理不活跃会话
   */
  cleanupInactiveSessions(maxInactiveTime = 3600000) { // 默认1小时
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, conversation] of this.conversations) {
      if (now - conversation.lastActivity.getTime() > maxInactiveTime) {
        this.conversations.delete(userId);
        cleaned++;
      }
    }

    return cleaned;
  }
}

module.exports = new ChatService();