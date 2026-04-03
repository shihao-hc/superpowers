const crypto = require('crypto');

class PlatformBridge {
  constructor(options = {}) {
    this.platforms = new Map();
    this.messageQueue = [];
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.onMessage = options.onMessage || (() => {});
    this.onError = options.onError || ((e) => console.error('[PlatformBridge]', e));
  }

  registerPlatform(platformId, config) {
    const platform = {
      id: platformId,
      name: config.name,
      type: config.type,
      status: 'disconnected',
      config,
      stats: {
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0
      },
      connectedAt: null
    };

    this.platforms.set(platformId, platform);
    return platform;
  }

  async connect(platformId) {
    const platform = this.platforms.get(platformId);
    if (!platform) throw new Error('Platform not found');

    try {
      switch (platform.type) {
        case 'slack':
          await this._connectSlack(platform);
          break;
        case 'discord':
          await this._connectDiscord(platform);
          break;
        case 'wechat_work':
          await this._connectWechatWork(platform);
          break;
        case 'telegram':
          await this._connectTelegram(platform);
          break;
        default:
          throw new Error(`Unsupported platform: ${platform.type}`);
      }

      platform.status = 'connected';
      platform.connectedAt = Date.now();

      return { success: true, platform: platformId };
    } catch (error) {
      platform.status = 'error';
      platform.stats.errors++;
      this.onError(error);
      return { success: false, error: error.message };
    }
  }

  async disconnect(platformId) {
    const platform = this.platforms.get(platformId);
    if (!platform) return false;

    platform.status = 'disconnected';
    platform.connectedAt = null;

    return true;
  }

  async _connectSlack(platform) {
    if (!platform.config.token) {
      throw new Error('Slack token required');
    }
    console.log(`[PlatformBridge] Slack connected: ${platform.config.workspace}`);
  }

  async _connectDiscord(platform) {
    if (!platform.config.token) {
      throw new Error('Discord token required');
    }
    console.log(`[PlatformBridge] Discord connected: ${platform.config.guild}`);
  }

  async _connectWechatWork(platform) {
    if (!platform.config.corpId || !platform.config.agentId) {
      throw new Error('WeChat Work corpId and agentId required');
    }
    console.log(`[PlatformBridge] WeChat Work connected: ${platform.config.corpId}`);
  }

  async _connectTelegram(platform) {
    if (!platform.config.token) {
      throw new Error('Telegram token required');
    }
    console.log(`[PlatformBridge] Telegram connected`);
  }

  async send(platformId, message) {
    const platform = this.platforms.get(platformId);
    if (!platform) throw new Error('Platform not found');
    if (platform.status !== 'connected') throw new Error('Platform not connected');

    const envelope = {
      id: `msg_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      platform: platformId,
      type: message.type || 'text',
      channel: message.channel,
      content: message.content,
      attachments: message.attachments || [],
      timestamp: Date.now()
    };

    try {
      let result;

      switch (platform.type) {
        case 'slack':
          result = await this._sendSlack(platform, envelope);
          break;
        case 'discord':
          result = await this._sendDiscord(platform, envelope);
          break;
        case 'wechat_work':
          result = await this._sendWechatWork(platform, envelope);
          break;
        case 'telegram':
          result = await this._sendTelegram(platform, envelope);
          break;
        default:
          throw new Error(`Unsupported platform: ${platform.type}`);
      }

      platform.stats.messagesSent++;
      this.messageQueue.push(envelope);

      if (this.messageQueue.length > this.maxQueueSize) {
        this.messageQueue = this.messageQueue.slice(-this.maxQueueSize);
      }

      return { success: true, messageId: envelope.id, result };
    } catch (error) {
      platform.stats.errors++;
      this.onError(error);
      return { success: false, error: error.message };
    }
  }

  async _sendSlack(platform, envelope) {
    return {
      platform: 'slack',
      channel: envelope.channel,
      ts: Date.now().toString()
    };
  }

  async _sendDiscord(platform, envelope) {
    return {
      platform: 'discord',
      channel: envelope.channel,
      id: envelope.id
    };
  }

  async _sendWechatWork(platform, envelope) {
    return {
      platform: 'wechat_work',
      msgid: envelope.id
    };
  }

  async _sendTelegram(platform, envelope) {
    return {
      platform: 'telegram',
      message_id: Date.now()
    };
  }

  async broadcast(message, excludePlatforms = []) {
    const results = [];

    for (const [platformId, platform] of this.platforms) {
      if (platform.status !== 'connected') continue;
      if (excludePlatforms.includes(platformId)) continue;

      const result = await this.send(platformId, message);
      results.push({ platformId, ...result });
    }

    return results;
  }

  handleIncoming(platformId, rawMessage) {
    const platform = this.platforms.get(platformId);
    if (!platform) return null;

    platform.stats.messagesReceived++;

    const message = this._normalizeMessage(platform.type, rawMessage);

    this.onMessage({
      platform: platformId,
      ...message
    });

    return message;
  }

  _normalizeMessage(platformType, rawMessage) {
    const base = {
      id: rawMessage.id || `recv_${Date.now().toString(36)}`,
      from: rawMessage.from || rawMessage.user || 'unknown',
      content: rawMessage.content || rawMessage.text || rawMessage.message || '',
      channel: rawMessage.channel || rawMessage.chatId || '',
      timestamp: rawMessage.timestamp || Date.now()
    };

    switch (platformType) {
      case 'slack':
        return {
          ...base,
          type: rawMessage.subtype || 'message',
          threadTs: rawMessage.thread_ts
        };
      case 'discord':
        return {
          ...base,
          type: rawMessage.type || 'DEFAULT',
          guild: rawMessage.guild_id
        };
      case 'wechat_work':
        return {
          ...base,
          type: rawMessage.MsgType || 'text',
          toUser: rawMessage.ToUserName
        };
      case 'telegram':
        return {
          ...base,
          type: rawMessage.chat?.type || 'private',
          chatId: rawMessage.chat?.id
        };
      default:
        return base;
    }
  }

  getPlatform(platformId) {
    return this.platforms.get(platformId);
  }

  getAllPlatforms() {
    return Array.from(this.platforms.values());
  }

  getConnectedPlatforms() {
    return Array.from(this.platforms.values()).filter(p => p.status === 'connected');
  }

  getMessageHistory(limit = 100) {
    return this.messageQueue.slice(-limit);
  }

  getStats() {
    const platforms = Array.from(this.platforms.values());

    return {
      platforms: {
        total: platforms.length,
        connected: platforms.filter(p => p.status === 'connected').length,
        disconnected: platforms.filter(p => p.status === 'disconnected').length,
        error: platforms.filter(p => p.status === 'error').length
      },
      messages: {
        total: platforms.reduce((sum, p) => sum + p.stats.messagesSent + p.stats.messagesReceived, 0),
        sent: platforms.reduce((sum, p) => sum + p.stats.messagesSent, 0),
        received: platforms.reduce((sum, p) => sum + p.stats.messagesReceived, 0),
        errors: platforms.reduce((sum, p) => sum + p.stats.errors, 0)
      }
    };
  }

  destroy() {
    for (const [platformId] of this.platforms) {
      this.disconnect(platformId);
    }
    this.platforms.clear();
    this.messageQueue = [];
  }
}

module.exports = { PlatformBridge };
