/**
 * UltraWork AI 聊天服务
 */

const { EventEmitter } = require('events');
const config = require('../config');

// 集成 Claude Code 风格的上下文压缩服务
const { ContextCompactService } = require('../../src/agent/ContextCompactService');

class ChatService extends EventEmitter {
  constructor() {
    super();
    this.conversations = new Map();
    this.messageQueue = [];
    this.stats = {
      totalMessages: 0,
      totalLatency: 0,
      errors: 0
    };
    
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
    // 这里可以集成Ollama、OpenAI等AI服务
    // 目前使用简单的回复逻辑

    const personality = conversation.personality || 'default';
    const context = conversation.context || {};

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
      confidence: 0.8 + Math.random() * 0.2
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