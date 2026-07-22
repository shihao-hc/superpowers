/**
 * Platform Bridge
 * 跨平台集成桥接器
 * 支持 Slack, Discord, Teams, WeChat 等
 */

const { EventEmitter } = require('events');

class PlatformBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;

    this.platforms = new Map();
    this.adapters = new Map();
    this.middleware = [];
  }

  /**
   * 注册平台适配器
   */
  register(platformName, adapter) {
    this.adapters.set(platformName, adapter);

    adapter.on('message', (message) => this.handleIncoming(platformName, message));
    adapter.on('event', (event) => this.emit('platform:event', { platform: platformName, event }));

    return this;
  }

  /**
   * 发送消息到平台
   */
  async send(platformName, target, message) {
    const adapter = this.adapters.get(platformName);
    if (!adapter) {
      throw new Error(`Platform ${platformName} not registered`);
    }

    // 应用中间件
    let processedMessage = message;
    for (const mw of this.middleware) {
      if (mw.outgoing) {
        processedMessage = await mw.outgoing(platformName, target, processedMessage);
      }
    }

    return adapter.send(target, processedMessage);
  }

  /**
   * 广播消息到所有平台
   */
  async broadcast(message) {
    const results = [];

    for (const [name] of this.adapters) {
      try {
        const result = await this.send(name, 'all', message);
        results.push({ platform: name, success: true, result });
      } catch (error) {
        results.push({ platform: name, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * 处理收到的消息
   */
  async handleIncoming(platformName, rawMessage) {
    let message = { ...rawMessage, platform: platformName };

    // 应用中间件
    for (const mw of this.middleware) {
      if (mw.incoming) {
        message = await mw.incoming(platformName, message);
      }
    }

    this.emit('message', message);
    return message;
  }

  /**
   * 添加中间件
   */
  use(middleware) {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * 断开所有平台
   */
  async disconnect() {
    for (const adapter of this.adapters.values()) {
      if (adapter.disconnect) {
        await adapter.disconnect();
      }
    }
  }
}

// Slack 适配器
class SlackAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.botToken = options.botToken;
    this.webClient = null;
  }

  async connect() {
    // 简化实现
    this.webClient = { token: this.botToken };
    this.emit('connected');
  }

  async send(target, message) {
    // 发送消息逻辑
    return { success: true, target, message };
  }

  disconnect() {
    this.webClient = null;
    this.emit('disconnected');
  }
}

// Discord 适配器
class DiscordAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.client = null;
  }

  async connect() {
    // Discord 客户端连接
    this.emit('connected');
  }

  async send(target, message) {
    // 发送消息逻辑
    return { success: true, target, message };
  }

  disconnect() {
    this.client?.destroy();
    this.emit('disconnected');
  }
}

// WeChat 企业微信适配器
class WeChatAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.corpId = options.corpId;
    this.corpSecret = options.corpSecret;
    this.agentId = options.agentId;
    this.accessToken = null;
  }

  async connect() {
    // 获取 access token
    this.accessToken = await this.getAccessToken();
    this.emit('connected');
  }

  async getAccessToken() {
    // 实际应该调用微信 API
    return 'mock_access_token';
  }

  async send(target, message) {
    if (!this.accessToken) {
      await this.connect();
    }

    // 发送消息逻辑
    return { success: true, target, message };
  }

  disconnect() {
    this.accessToken = null;
    this.emit('disconnected');
  }
}

module.exports = {
  PlatformBridge,
  SlackAdapter,
  DiscordAdapter,
  WeChatAdapter
};
