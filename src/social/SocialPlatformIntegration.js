/**
 * SocialPlatformIntegration - 社交平台集成
 * 
 * 功能:
 * - Discord Bot 集成
 * - Telegram Bot 集成
 * - WebSocket 实时通信
 * - 消息同步
 * - 多平台状态同步
 */

class DiscordIntegration {
  constructor(options = {}) {
    this.token = options.token || process.env.DISCORD_BOT_TOKEN;
    this.client = null;
    this.isConnected = false;
    this.messageHandlers = [];
    this.commands = new Map();
    
    // Discord.js is loaded server-side
    this.DISCORD_AVAILABLE = false;
  }

  async init() {
    try {
      // Try to load discord.js (server-side only)
      if (typeof window === 'undefined') {
        const Discord = require('discord.js');
        this.client = new Discord.Client({
          intents: [
            Discord.GatewayIntentBits.Guilds,
            Discord.GatewayIntentBits.GuildMessages,
            Discord.GatewayIntentBits.MessageContent,
            Discord.GatewayIntentBits.DirectMessages
          ]
        });
        this.DISCORD_AVAILABLE = true;
        
        this.setupEventHandlers();
        console.log('Discord client initialized');
      }
    } catch (error) {
      console.warn('Discord.js not available:', error.message);
    }
  }

  setupEventHandlers() {
    if (!this.client) return;

    this.client.on('ready', () => {
      console.log(`Discord bot logged in as ${this.client.user.tag}`);
      this.isConnected = true;
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      const context = {
        platform: 'discord',
        userId: message.author.id,
        username: message.author.username,
        channelId: message.channel.id,
        guildId: message.guild?.id,
        isDM: !message.guild,
        timestamp: Date.now()
      };

      // Check for commands
      if (message.content.startsWith('!')) {
        await this.handleCommand(message, context);
        return;
      }

      // Pass to handlers
      for (const handler of this.messageHandlers) {
        await handler(message.content, context);
      }
    });

    this.client.on('error', (error) => {
      console.error('Discord error:', error);
    });
  }

  async connect() {
    if (!this.DISCORD_AVAILABLE || !this.token) {
      console.warn('Discord not configured');
      return false;
    }

    try {
      await this.client.login(this.token);
      return true;
    } catch (error) {
      console.error('Failed to connect to Discord:', error);
      return false;
    }
  }

  disconnect() {
    if (this.client) {
      this.client.destroy();
      this.isConnected = false;
    }
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  registerCommand(name, handler, description = '') {
    this.commands.set(name.toLowerCase(), { handler, description });
  }

  async handleCommand(message, context) {
    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    const command = this.commands.get(commandName);
    if (command) {
      await command.handler(args, message, context);
    }
  }

  async sendMessage(channelId, content, options = {}) {
    if (!this.client) return null;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) return null;

      const messageOptions = {
        content: content
      };

      if (options.embeds) {
        messageOptions.embeds = options.embeds;
      }
      if (options.components) {
        messageOptions.components = options.components;
      }

      return await channel.send(messageOptions);
    } catch (error) {
      console.error('Failed to send Discord message:', error);
      return null;
    }
  }

  async sendDM(userId, content) {
    if (!this.client) return null;

    try {
      const user = await this.client.users.fetch(userId);
      if (!user) return null;
      return await user.send(content);
    } catch (error) {
      console.error('Failed to send DM:', error);
      return null;
    }
  }

  async sendTypingIndicator(channelId) {
    if (!this.client) return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.sendTyping) {
        await channel.sendTyping();
      }
    } catch (error) {
      console.error('Failed to send typing indicator:', error);
    }
  }

  createEmbed(data) {
    if (!this.client) return null;
    
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder();
    
    if (data.title) embed.setTitle(data.title);
    if (data.description) embed.setDescription(data.description);
    if (data.color) embed.setColor(data.color);
    if (data.fields) embed.addFields(data.fields);
    if (data.footer) embed.setFooter(data.footer);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.image) embed.setImage(data.image);
    
    return embed;
  }

  getStatus() {
    return {
      connected: this.isConnected,
      available: this.DISCORD_AVAILABLE,
      guilds: this.client?.guilds.cache.size || 0
    };
  }
}

class TelegramIntegration {
  constructor(options = {}) {
    this.token = options.token || process.env.TELEGRAM_BOT_TOKEN;
    this.bot = null;
    this.isConnected = false;
    this.messageHandlers = [];
    this.commands = new Map();
    this.webhookUrl = options.webhookUrl;
    this.pollingInterval = options.pollingInterval || 1000;
    
    // Telegram Bot API
    this.API_BASE = 'https://api.telegram.org/bot';
  }

  async init() {
    if (!this.token) {
      console.warn('Telegram bot token not configured');
      return;
    }

    // Set up command handlers
    this.setupDefaultCommands();
    console.log('Telegram bot initialized');
  }

  setupDefaultCommands() {
    this.registerCommand('start', async (args, chatId) => {
      await this.sendMessage(chatId, '你好！我是你的AI助手~');
    }, '开始对话');

    this.registerCommand('help', async (args, chatId) => {
      const helpText = `
可用命令:
/start - 开始对话
/help - 显示帮助
/personality - 查看当前人格
/mood - 查看当前心情
/game - 开始游戏解说
      `;
      await this.sendMessage(chatId, helpText);
    }, '显示帮助');
  }

  async connect() {
    if (!this.token) return false;

    try {
      // Test connection
      const response = await this.callAPI('getMe');
      if (response.ok) {
        this.bot = response.result;
        console.log(`Telegram bot connected: ${this.bot.username}`);
        this.isConnected = true;
        
        // Start polling or webhook
        if (this.webhookUrl) {
          await this.setupWebhook();
        } else {
          this.startPolling();
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to connect to Telegram:', error);
      return false;
    }
  }

  async callAPI(method, params = {}) {
    const url = `${this.API_BASE}${this.token}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return await response.json();
  }

  startPolling() {
    let offset = 0;
    
    const poll = async () => {
      if (!this.isConnected) return;

      try {
        const response = await this.callAPI('getUpdates', {
          offset,
          timeout: 30,
          allowed_updates: ['message']
        });

        if (response.ok && response.result) {
          for (const update of response.result) {
            offset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }

      setTimeout(poll, this.pollingInterval);
    };

    poll();
  }

  async setupWebhook() {
    const response = await this.callAPI('setWebhook', {
      url: this.webhookUrl
    });
    
    if (response.ok) {
      console.log('Webhook set up successfully');
    } else {
      console.error('Failed to set webhook:', response);
    }
  }

  async handleUpdate(update) {
    if (!update.message) return;

    const message = update.message;
    const context = {
      platform: 'telegram',
      userId: message.from.id.toString(),
      username: message.from.username || message.from.first_name,
      chatId: message.chat.id.toString(),
      chatType: message.chat.type,
      timestamp: Date.now() * 1000
    };

    // Check for commands
    if (message.text?.startsWith('/')) {
      const [command, ...args] = message.text.slice(1).split(' ');
      await this.handleCommand(command.toLowerCase(), args, context);
      return;
    }

    // Pass to handlers
    for (const handler of this.messageHandlers) {
      await handler(message.text || '', context);
    }
  }

  async handleCommand(command, args, context) {
    const handler = this.commands.get(command);
    if (handler) {
      await handler(args, context.chatId, context);
    } else {
      await this.sendMessage(context.chatId, `未知命令: /${command}`);
    }
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  registerCommand(name, handler, description = '') {
    this.commands.set(name.toLowerCase(), handler);
  }

  async sendMessage(chatId, content, options = {}) {
    const params = {
      chat_id: chatId,
      text: content,
      parse_mode: options.parseMode || 'HTML'
    };

    if (options.replyTo) {
      params.reply_to_message_id = options.replyTo;
    }

    if (options.keyboard) {
      params.reply_markup = {
        keyboard: options.keyboard,
        resize_keyboard: true
      };
    }

    return await this.callAPI('sendMessage', params);
  }

  async sendPhoto(chatId, photo, caption = '') {
    return await this.callAPI('sendPhoto', {
      chat_id: chatId,
      photo,
      caption,
      parse_mode: 'HTML'
    });
  }

  async sendSticker(chatId, sticker) {
    return await this.callAPI('sendSticker', {
      chat_id: chatId,
      sticker
    });
  }

  async sendTypingAction(chatId) {
    return await this.callAPI('sendChatAction', {
      chat_id: chatId,
      action: 'typing'
    });
  }

  async editMessage(chatId, messageId, newText) {
    return await this.callAPI('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: 'HTML'
    });
  }

  async deleteMessage(chatId, messageId) {
    return await this.callAPI('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  createKeyboard(buttons) {
    return buttons.map(row => 
      row.map(btn => ({ text: btn }))
    );
  }

  createInlineKeyboard(buttons) {
    return {
      inline_keyboard: buttons.map(row =>
        row.map(btn => ({
          text: btn.text,
          callback_data: btn.data || btn.text
        }))
      )
    };
  }

  disconnect() {
    this.isConnected = false;
    if (this.webhookUrl) {
      this.callAPI('deleteWebhook');
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      bot: this.bot?.username,
      webhook: !!this.webhookUrl
    };
  }
}

class SocialPlatformManager {
  constructor(options = {}) {
    this.discord = new DiscordIntegration(options.discord);
    this.telegram = new TelegramIntegration(options.telegram);
    this.messageHandlers = [];
    this.platforms = new Map();
    this.syncEnabled = options.syncEnabled !== false;
  }

  async init() {
    await Promise.all([
      this.discord.init(),
      this.telegram.init()
    ]);

    // Register platforms
    this.platforms.set('discord', this.discord);
    this.platforms.set('telegram', this.telegram);

    // Set up unified message handling
    this.setupUnifiedHandlers();
  }

  setupUnifiedHandlers() {
    const unifiedHandler = (platform) => async (content, context) => {
      const unifiedContext = {
        ...context,
        platform
      };

      for (const handler of this.messageHandlers) {
        await handler(content, unifiedContext);
      }
    };

    this.discord.onMessage(unifiedHandler('discord'));
    this.telegram.onMessage(unifiedHandler('telegram'));
  }

  async connectAll() {
    const results = {
      discord: await this.discord.connect(),
      telegram: await this.telegram.connect()
    };
    return results;
  }

  disconnectAll() {
    this.discord.disconnect();
    this.telegram.disconnect();
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  async broadcast(message, options = {}) {
    const results = {};

    if (options.discord) {
      results.discord = await this.discord.sendMessage(
        options.discord.channelId,
        message,
        options.discord
      );
    }

    if (options.telegram) {
      results.telegram = await this.telegram.sendMessage(
        options.telegram.chatId,
        message,
        options.telegram
      );
    }

    if (options.all) {
      // Broadcast to all connected platforms
      for (const [name, platform] of this.platforms) {
        if (platform.isConnected) {
          results[name] = { broadcast: true };
        }
      }
    }

    return results;
  }

  async broadcastToUser(userId, message) {
    const results = {};

    // Try Discord DM
    if (this.discord.isConnected) {
      results.discord = await this.discord.sendDM(userId, message);
    }

    // Try Telegram DM
    if (this.telegram.isConnected) {
      results.telegram = await this.telegram.sendMessage(userId, message);
    }

    return results;
  }

  getStatus() {
    return {
      discord: this.discord.getStatus(),
      telegram: this.telegram.getStatus(),
      totalConnected: [
        this.discord.isConnected,
        this.telegram.isConnected
      ].filter(Boolean).length
    };
  }

  getPlatform(name) {
    return this.platforms.get(name);
  }

  isAnyConnected() {
    return this.discord.isConnected || this.telegram.isConnected;
  }
}

// Export
if (typeof window !== 'undefined') {
  window.DiscordIntegration = DiscordIntegration;
  window.TelegramIntegration = TelegramIntegration;
  window.SocialPlatformManager = SocialPlatformManager;
}

if (typeof module !== 'undefined') {
  module.exports = {
    DiscordIntegration,
    TelegramIntegration,
    SocialPlatformManager
  };
}
