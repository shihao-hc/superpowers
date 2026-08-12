jest.mock('discord.js', () => {
  class MockClient {
    constructor() {
      this._handlers = {};
      this.user = { tag: 'TestBot#0000' };
      this.guilds = { cache: new Map() };
      this.channels = { cache: new Map(), fetch: jest.fn() };
      this.users = { cache: new Map(), fetch: jest.fn() };
      this.on = jest.fn((event, handler) => {
        this._handlers[event] = handler;
        return this;
      });
      this.login = jest.fn().mockResolvedValue('token');
      this.destroy = jest.fn();
    }
    _emit(event, ...args) {
      if (this._handlers[event]) return this._handlers[event](...args);
    }
  }
  class MockEmbedBuilder {
    constructor() { this.data = {}; }
    setTitle(t) { this.data.title = t; return this; }
    setDescription(d) { this.data.description = d; return this; }
    setColor(c) { this.data.color = c; return this; }
    addFields(f) { this.data.fields = f; return this; }
    setFooter(f) { this.data.footer = f; return this; }
    setThumbnail(t) { this.data.thumbnail = t; return this; }
    setImage(i) { this.data.image = i; return this; }
  }
  return {
    Client: MockClient,
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4, DirectMessages: 8 },
    EmbedBuilder: MockEmbedBuilder
  };
}, { virtual: true });

const { DiscordIntegration, TelegramIntegration, SocialPlatformManager } = require('../../src/social/SocialPlatformIntegration');

describe('DiscordIntegration', () => {
  let discord;
  const TEST_TOKEN = 'discord-test-token';

  beforeEach(() => {
    jest.clearAllMocks();
    discord = new DiscordIntegration({ token: TEST_TOKEN });
  });

  describe('constructor', () => {
    it('sets token from options', () => {
      expect(discord.token).toBe(TEST_TOKEN);
    });

    it('falls back to env when no token option', () => {
      process.env.DISCORD_BOT_TOKEN = 'env-token';
      const d = new DiscordIntegration({});
      expect(d.token).toBe('env-token');
      delete process.env.DISCORD_BOT_TOKEN;
    });

    it('leaves token undefined when none provided', () => {
      delete process.env.DISCORD_BOT_TOKEN;
      const d = new DiscordIntegration({});
      expect(d.token).toBeUndefined();
    });

    it('initializes defaults', () => {
      expect(discord.client).toBeNull();
      expect(discord.isConnected).toBe(false);
      expect(discord.messageHandlers).toEqual([]);
      expect(discord.commands).toBeInstanceOf(Map);
      expect(discord.DISCORD_AVAILABLE).toBe(false);
    });

    it('constructs with default options', () => {
      const d = new DiscordIntegration();
      expect(d.token).toBeUndefined();
      expect(d.messageHandlers).toEqual([]);
    });
  });

  describe('init', () => {
    it('creates discord.js client and sets available flag', async () => {
      await discord.init();
      expect(discord.client).toBeTruthy();
      expect(discord.DISCORD_AVAILABLE).toBe(true);
    });

    it('sets up event handlers on client', async () => {
      await discord.init();
      expect(discord.client.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(discord.client.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
      expect(discord.client.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('ready handler sets connected flag', async () => {
      await discord.init();
      discord.client._emit('ready');
      expect(discord.isConnected).toBe(true);
    });

    it('error handler logs without throwing', async () => {
      await discord.init();
      expect(() => {
        discord.client._emit('error', new Error('test error'));
      }).not.toThrow();
    });
  });

  describe('setupEventHandlers', () => {
    it('returns early when no client', () => {
      discord.client = null;
      expect(() => discord.setupEventHandlers()).not.toThrow();
    });

    it('messageCreate handler ignores bot messages', async () => {
      await discord.init();
      const handler = discord.client._handlers.messageCreate;
      const botMessage = {
        author: { bot: true },
        content: 'hello',
        channel: { id: 'c1' },
        guild: null
      };
      await handler(botMessage);
      expect(discord.messageHandlers.length).toBe(0);
    });

    it('messageCreate handler routes command messages', async () => {
      await discord.init();
      const handleSpy = jest.spyOn(discord, 'handleCommand').mockResolvedValue();
      const handler = discord.client._handlers.messageCreate;
      const cmdMessage = {
        author: { bot: false, id: 'u1', username: 'test' },
        content: '!ping',
        channel: { id: 'c1' },
        guild: null
      };
      await handler(cmdMessage);
      expect(handleSpy).toHaveBeenCalledWith(cmdMessage, expect.objectContaining({ platform: 'discord' }));
      handleSpy.mockRestore();
    });

    it('messageCreate handler forwards to registered handlers', async () => {
      await discord.init();
      const handler = jest.fn();
      discord.onMessage(handler);
      const msgHandler = discord.client._handlers.messageCreate;
      const message = {
        author: { bot: false, id: 'u1', username: 'test' },
        content: 'plain message',
        channel: { id: 'c1' },
        guild: { id: 'g1' }
      };
      await msgHandler(message);
      expect(handler).toHaveBeenCalledWith('plain message', expect.objectContaining({ isDM: false }));
    });
  });

  describe('connect', () => {
    it('logs in with token and returns true on success', async () => {
      await discord.init();
      const result = await discord.connect();
      expect(result).toBe(true);
      expect(discord.client.login).toHaveBeenCalledWith(TEST_TOKEN);
    });

    it('returns false when token is missing', async () => {
      const d = new DiscordIntegration({});
      const result = await d.connect();
      expect(result).toBe(false);
    });

    it('returns false when discord unavailable', async () => {
      const d = new DiscordIntegration({ token: TEST_TOKEN });
      const result = await d.connect();
      expect(result).toBe(false);
    });

    it('returns false on login failure', async () => {
      await discord.init();
      discord.client.login.mockRejectedValue(new Error('login failed'));
      const result = await discord.connect();
      expect(result).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('destroys client and resets connected flag', async () => {
      await discord.init();
      discord.client._emit('ready');
      expect(discord.isConnected).toBe(true);
      discord.disconnect();
      expect(discord.client.destroy).toHaveBeenCalled();
      expect(discord.isConnected).toBe(false);
    });

    it('handles null client gracefully', () => {
      expect(() => discord.disconnect()).not.toThrow();
    });
  });

  describe('onMessage', () => {
    it('registers a message handler', () => {
      const handler = jest.fn();
      discord.onMessage(handler);
      expect(discord.messageHandlers).toContain(handler);
    });

    it('supports multiple handlers', () => {
      const h1 = jest.fn();
      const h2 = jest.fn();
      discord.onMessage(h1);
      discord.onMessage(h2);
      expect(discord.messageHandlers).toHaveLength(2);
    });
  });

  describe('registerCommand', () => {
    it('stores command in map (lowercased)', () => {
      const handler = jest.fn();
      discord.registerCommand('TestCmd', handler, 'A test command');
      expect(discord.commands.get('testcmd').handler).toBe(handler);
      expect(discord.commands.get('TestCmd')).toBeUndefined();
    });
  });

  describe('handleCommand', () => {
    it('calls registered command handler with args', async () => {
      const handler = jest.fn();
      discord.registerCommand('greet', handler);
      const message = { content: '!greet Alice Bob', author: { bot: false } };
      const context = { platform: 'discord' };
      await discord.handleCommand(message, context);
      expect(handler).toHaveBeenCalledWith(['Alice', 'Bob'], message, context);
    });

    it('does nothing for unregistered commands', async () => {
      const message = { content: '!unknown arg1', author: { bot: false } };
      await discord.handleCommand(message, {});
    });
  });

  describe('sendMessage', () => {
    it('sends content to channel', async () => {
      await discord.init();
      const mockSend = jest.fn().mockResolvedValue({ id: 'msg1' });
      discord.client.channels.fetch.mockResolvedValue({ send: mockSend });
      const result = await discord.sendMessage('ch123', 'Hello!');
      expect(discord.client.channels.fetch).toHaveBeenCalledWith('ch123');
      expect(mockSend).toHaveBeenCalledWith({ content: 'Hello!' });
      expect(result).toEqual({ id: 'msg1' });
    });

    it('returns null when channel not found', async () => {
      await discord.init();
      discord.client.channels.fetch.mockResolvedValue(null);
      const result = await discord.sendMessage('ch999', 'Hi');
      expect(result).toBeNull();
    });

    it('returns null when no client', async () => {
      const result = await discord.sendMessage('ch123', 'Hi');
      expect(result).toBeNull();
    });

    it('sends with embeds option', async () => {
      await discord.init();
      const mockSend = jest.fn().mockResolvedValue({});
      discord.client.channels.fetch.mockResolvedValue({ send: mockSend });
      const embed = { title: 'Test' };
      await discord.sendMessage('ch123', 'Content', { embeds: [embed] });
      expect(mockSend).toHaveBeenCalledWith({ content: 'Content', embeds: [embed] });
    });

    it('sends with components option', async () => {
      await discord.init();
      const mockSend = jest.fn().mockResolvedValue({});
      discord.client.channels.fetch.mockResolvedValue({ send: mockSend });
      const components = [{ type: 1 }];
      await discord.sendMessage('ch123', 'Content', { components });
      expect(mockSend).toHaveBeenCalledWith({ content: 'Content', components });
    });

    it('returns null on send error', async () => {
      await discord.init();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      discord.client.channels.fetch.mockRejectedValue(new Error('fetch failed'));
      const result = await discord.sendMessage('ch123', 'Hi');
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('sendDM', () => {
    it('sends DM to user', async () => {
      await discord.init();
      const mockUserSend = jest.fn().mockResolvedValue({ id: 'dm1' });
      discord.client.users.fetch.mockResolvedValue({ send: mockUserSend });
      const result = await discord.sendDM('user456', 'Secret msg');
      expect(discord.client.users.fetch).toHaveBeenCalledWith('user456');
      expect(mockUserSend).toHaveBeenCalledWith('Secret msg');
      expect(result).toEqual({ id: 'dm1' });
    });

    it('returns null when user not found', async () => {
      await discord.init();
      discord.client.users.fetch.mockResolvedValue(null);
      const result = await discord.sendDM('nobody', 'Hi');
      expect(result).toBeNull();
    });

    it('returns null when no client', async () => {
      const result = await discord.sendDM('u1', 'Hi');
      expect(result).toBeNull();
    });

    it('returns null on DM error', async () => {
      await discord.init();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      discord.client.users.fetch.mockRejectedValue(new Error('user fetch failed'));
      const result = await discord.sendDM('u1', 'Hi');
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('sendTypingIndicator', () => {
    it('calls sendTyping on channel', async () => {
      await discord.init();
      const mockTyping = jest.fn().mockResolvedValue();
      discord.client.channels.fetch.mockResolvedValue({ sendTyping: mockTyping });
      await discord.sendTypingIndicator('ch123');
      expect(mockTyping).toHaveBeenCalled();
    });

    it('handles missing sendTyping method', async () => {
      await discord.init();
      discord.client.channels.fetch.mockResolvedValue({});
      await expect(discord.sendTypingIndicator('ch123')).resolves.not.toThrow();
    });

    it('returns early when no client', async () => {
      await expect(discord.sendTypingIndicator('ch123')).resolves.not.toThrow();
    });

    it('logs error on typing failure', async () => {
      await discord.init();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      discord.client.channels.fetch.mockRejectedValue(new Error('typing failed'));
      await discord.sendTypingIndicator('ch123');
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('createEmbed', () => {
    it('builds embed with all fields', async () => {
      await discord.init();
      const embed = discord.createEmbed({
        title: 'Hello',
        description: 'World',
        color: 0x00FF00,
        fields: [{ name: 'F1', value: 'V1' }],
        footer: { text: 'Footer' },
        thumbnail: 'https://example.com/thumb.png',
        image: 'https://example.com/img.png'
      });
      expect(embed.data.title).toBe('Hello');
      expect(embed.data.description).toBe('World');
      expect(embed.data.color).toBe(0x00FF00);
      expect(embed.data.fields).toEqual([{ name: 'F1', value: 'V1' }]);
      expect(embed.data.footer).toEqual({ text: 'Footer' });
      expect(embed.data.thumbnail).toBe('https://example.com/thumb.png');
      expect(embed.data.image).toBe('https://example.com/img.png');
    });

    it('builds embed with partial data', async () => {
      await discord.init();
      const embed = discord.createEmbed({ title: 'Only Title' });
      expect(embed.data.title).toBe('Only Title');
    });

    it('builds embed without title', async () => {
      await discord.init();
      const embed = discord.createEmbed({ description: 'No title' });
      expect(embed.data.description).toBe('No title');
      expect(embed.data.title).toBeUndefined();
    });

    it('returns null when no client', () => {
      const embed = discord.createEmbed({ title: 'Test' });
      expect(embed).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('returns initial disconnected state', () => {
      const status = discord.getStatus();
      expect(status.connected).toBe(false);
      expect(status.available).toBe(false);
      expect(status.guilds).toBe(0);
    });

    it('returns connected state after ready', async () => {
      await discord.init();
      discord.client._emit('ready');
      const status = discord.getStatus();
      expect(status.connected).toBe(true);
      expect(status.available).toBe(true);
    });

    it('reports guild count from client cache', async () => {
      await discord.init();
      discord.client.guilds.cache.set('g1', { name: 'Test' });
      const status = discord.getStatus();
      expect(status.guilds).toBe(1);
    });
  });
});

describe('TelegramIntegration', () => {
  let telegram;
  const TEST_TOKEN = 'tg-test-token';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    telegram = new TelegramIntegration({ token: TEST_TOKEN });
    jest.spyOn(telegram, 'startPolling').mockImplementation(jest.fn());
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('constructor', () => {
    it('sets token from options', () => {
      expect(telegram.token).toBe(TEST_TOKEN);
    });

    it('falls back to env when no token option', () => {
      process.env.TELEGRAM_BOT_TOKEN = 'env-tg-token';
      const t = new TelegramIntegration({});
      expect(t.token).toBe('env-tg-token');
      delete process.env.TELEGRAM_BOT_TOKEN;
    });

    it('sets default polling interval', () => {
      expect(telegram.pollingInterval).toBe(1000);
    });

    it('sets webhook URL when provided', () => {
      const t = new TelegramIntegration({ token: TEST_TOKEN, webhookUrl: 'https://hook.example.com' });
      expect(t.webhookUrl).toBe('https://hook.example.com');
    });

    it('constructs with default options', () => {
      const t = new TelegramIntegration();
      expect(t.pollingInterval).toBe(1000);
      expect(t.webhookUrl).toBeUndefined();
    });
  });

  describe('init', () => {
    it('registers default commands when token present', async () => {
      await telegram.init();
      expect(telegram.commands.has('start')).toBe(true);
      expect(telegram.commands.has('help')).toBe(true);
    });

    it('returns early when no token', async () => {
      const t = new TelegramIntegration({});
      await t.init();
      expect(t.commands.size).toBe(0);
    });
  });

  describe('setupDefaultCommands', () => {
    it('registers start and help commands', () => {
      telegram.setupDefaultCommands();
      expect(telegram.commands.get('start')).toBeDefined();
      expect(telegram.commands.get('help')).toBeDefined();
    });

    it('start command sends welcome message', async () => {
      telegram.setupDefaultCommands();
      const handler = telegram.commands.get('start');
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await handler([], 'chat1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          body: expect.stringContaining('chat1')
        })
      );
    });

    it('help command sends help text', async () => {
      telegram.setupDefaultCommands();
      const handler = telegram.commands.get('help');
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await handler([], 'chat2');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          body: expect.stringContaining('可用命令')
        })
      );
    });
  });

  describe('connect', () => {
    it('returns true on successful API call', async () => {
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { username: 'TestBot' } })
      });
      const result = await telegram.connect();
      expect(result).toBe(true);
      expect(telegram.isConnected).toBe(true);
      expect(telegram.bot.username).toBe('TestBot');
    });

    it('returns false without token', async () => {
      const t = new TelegramIntegration({});
      const result = await t.connect();
      expect(result).toBe(false);
    });

    it('returns false on API failure', async () => {
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: false })
      });
      const result = await telegram.connect();
      expect(result).toBe(false);
    });

    it('starts polling when no webhook URL', async () => {
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { username: 'Bot' } })
      });
      await telegram.connect();
      expect(telegram.startPolling).toHaveBeenCalled();
    });

    it('sets up webhook when webhookUrl is provided', async () => {
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { username: 'Bot' } })
      });
      const t = new TelegramIntegration({ token: TEST_TOKEN, webhookUrl: 'https://hook.example.com' });
      const webhookSpy = jest.spyOn(t, 'setupWebhook').mockImplementation(jest.fn());
      const pollSpy = jest.spyOn(t, 'startPolling').mockImplementation(jest.fn());
      await t.connect();
      expect(webhookSpy).toHaveBeenCalled();
      expect(pollSpy).not.toHaveBeenCalled();
    });

    it('returns false on fetch error', async () => {
      global.fetch.mockRejectedValue(new Error('network error'));
      const result = await telegram.connect();
      expect(result).toBe(false);
    });
  });

  describe('callAPI', () => {
    it('sends POST request to correct URL with params', async () => {
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: true })
      });
      await telegram.callAPI('getMe', { foo: 'bar' });
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_TOKEN}/getMe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ foo: 'bar' })
        }
      );
    });
  });

  describe('setupWebhook', () => {
    it('calls setWebhook API with webhookUrl', async () => {
      const t = new TelegramIntegration({ token: TEST_TOKEN, webhookUrl: 'https://hook.example.com' });
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: true })
      });
      await t.setupWebhook();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/setWebhook'),
        expect.objectContaining({
          body: expect.stringContaining('https://hook.example.com')
        })
      );
    });

    it('logs error when webhook setup fails', async () => {
      const t = new TelegramIntegration({ token: TEST_TOKEN, webhookUrl: 'https://hook.example.com' });
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: false, description: 'bad' })
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await t.setupWebhook();
      expect(errorSpy).toHaveBeenCalledWith('Failed to set webhook:', expect.anything());
      errorSpy.mockRestore();
    });
  });

  describe('startPolling (real)', () => {
    it('returns early when not connected', async () => {
      jest.useFakeTimers();
      const t = new TelegramIntegration({ token: TEST_TOKEN, pollingInterval: 1000 });
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy;
      t.startPolling();
      await jest.advanceTimersByTimeAsync(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('polls updates and processes messages', async () => {
      jest.useFakeTimers();
      const t = new TelegramIntegration({ token: TEST_TOKEN, pollingInterval: 1000 });
      t.isConnected = true;
      const handleSpy = jest.spyOn(t, 'handleUpdate').mockResolvedValue();
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({
        ok: true,
        result: [{ update_id: 1, message: { text: 'hi' } }]
      }) });

      t.startPolling();
      await jest.advanceTimersByTimeAsync(0);
      expect(handleSpy).toHaveBeenCalledWith(expect.objectContaining({ update_id: 1 }));

      jest.useRealTimers();
      handleSpy.mockRestore();
    });

    it('logs polling errors', async () => {
      jest.useFakeTimers();
      const t = new TelegramIntegration({ token: TEST_TOKEN, pollingInterval: 1000 });
      t.isConnected = true;
      global.fetch.mockRejectedValue(new Error('network down'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      t.startPolling();
      await jest.advanceTimersByTimeAsync(0);
      expect(errorSpy).toHaveBeenCalledWith('Polling error:', expect.anything());
      jest.useRealTimers();
      errorSpy.mockRestore();
    });

    it('skips processing when response has no result', async () => {
      jest.useFakeTimers();
      const t = new TelegramIntegration({ token: TEST_TOKEN, pollingInterval: 1000 });
      t.isConnected = true;
      const handleSpy = jest.spyOn(t, 'handleUpdate').mockResolvedValue();
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true, result: null }) });
      t.startPolling();
      await jest.advanceTimersByTimeAsync(0);
      expect(handleSpy).not.toHaveBeenCalled();
      jest.useRealTimers();
      handleSpy.mockRestore();
    });
  });

  describe('handleUpdate', () => {
    it('processes text message through handlers', async () => {
      const handler = jest.fn();
      telegram.onMessage(handler);
      const update = {
        message: {
          text: 'Hello',
          from: { id: 100, username: 'testuser' },
          chat: { id: 200, type: 'private' }
        }
      };
      await telegram.handleUpdate(update);
      expect(handler).toHaveBeenCalledWith('Hello', expect.objectContaining({
        platform: 'telegram',
        userId: '100',
        chatId: '200'
      }));
    });

    it('ignores update without message', async () => {
      const handler = jest.fn();
      telegram.onMessage(handler);
      await telegram.handleUpdate({});
      expect(handler).not.toHaveBeenCalled();
    });

    it('passes empty text when message has no text', async () => {
      const handler = jest.fn();
      telegram.onMessage(handler);
      const update = {
        message: {
          from: { id: 100, username: 'testuser' },
          chat: { id: 200, type: 'private' }
        }
      };
      await telegram.handleUpdate(update);
      expect(handler).toHaveBeenCalledWith('', expect.objectContaining({ platform: 'telegram' }));
    });

    it('routes command messages to handleCommand', async () => {
      const cmdHandler = jest.fn();
      telegram.registerCommand('test', cmdHandler);
      const update = {
        message: {
          text: '/test arg1 arg2',
          from: { id: 1, username: 'u' },
          chat: { id: 10, type: 'group' }
        }
      };
      await telegram.handleUpdate(update);
      expect(cmdHandler).toHaveBeenCalledWith(
        ['arg1', 'arg2'], '10', expect.objectContaining({ chatId: '10' })
      );
    });

    it('handles missing username gracefully', async () => {
      const handler = jest.fn();
      telegram.onMessage(handler);
      const update = {
        message: {
          text: 'Hi',
          from: { id: 5 },
          chat: { id: 20, type: 'private' }
        }
      };
      await telegram.handleUpdate(update);
      expect(handler).toHaveBeenCalledWith('Hi', expect.objectContaining({
        username: undefined
      }));
    });
  });

  describe('handleCommand', () => {
    it('calls registered command handler', async () => {
      const handler = jest.fn();
      telegram.registerCommand('ping', handler);
      await telegram.handleCommand('ping', [], { chatId: '100' });
      expect(handler).toHaveBeenCalledWith([], '100', { chatId: '100' });
    });

    it('sends unknown command message for unregistered command', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.handleCommand('unknown', [], { chatId: '100' });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          body: expect.stringContaining('未知命令: /unknown')
        })
      );
    });
  });

  describe('onMessage', () => {
    it('registers a handler', () => {
      const handler = jest.fn();
      telegram.onMessage(handler);
      expect(telegram.messageHandlers).toContain(handler);
    });
  });

  describe('registerCommand', () => {
    it('stores command handler', () => {
      const handler = jest.fn();
      telegram.registerCommand('mycmd', handler, 'description');
      expect(telegram.commands.get('mycmd')).toBe(handler);
    });
  });

  describe('sendMessage', () => {
    it('calls sendMessage API with correct params', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.sendMessage('chat1', 'Hello!');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          body: expect.stringContaining('"chat_id":"chat1"')
        })
      );
    });

    it('includes replyTo and keyboard options', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.sendMessage('chat1', 'Hi', {
        replyTo: 42,
        keyboard: [['Btn1'], ['Btn2']]
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          body: expect.stringMatching(/"reply_to_message_id":42/)
        })
      );
    });

    it('uses HTML parse mode by default', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.sendMessage('chat1', '<b>bold</b>');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          body: expect.stringContaining('"parse_mode":"HTML"')
        })
      );
    });
  });

describe('sendPhoto', () => {
    it('calls sendPhoto API', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.sendPhoto('chat1', 'https://example.com/photo.jpg', 'Caption');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendPhoto'),
        expect.objectContaining({
          body: expect.stringContaining('Caption')
        })
      );
    });

    it('uses empty caption by default', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.sendPhoto('chat1', 'https://example.com/photo.jpg');
      const call = global.fetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.caption).toBe('');
    });
  });

  describe('sendSticker', () => {
    it('calls sendSticker API', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.sendSticker('chat1', 'CA123');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendSticker'),
        expect.objectContaining({
          body: expect.stringContaining('"sticker":"CA123"')
        })
      );
    });
  });

  describe('sendTypingAction', () => {
    it('calls sendChatAction API', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.sendTypingAction('chat1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendChatAction'),
        expect.objectContaining({
          body: expect.stringContaining('"action":"typing"')
        })
      );
    });
  });

  describe('editMessage', () => {
    it('calls editMessageText API', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.editMessage('chat1', 123, 'New text');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/editMessageText'),
        expect.objectContaining({
          body: expect.stringContaining('"message_id":123')
        })
      );
    });
  });

  describe('deleteMessage', () => {
    it('calls deleteMessage API', async () => {
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      await telegram.deleteMessage('chat1', 456);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/deleteMessage'),
        expect.objectContaining({
          body: expect.stringContaining('"message_id":456')
        })
      );
    });
  });

  describe('createKeyboard', () => {
    it('builds keyboard button rows', () => {
      const kb = telegram.createKeyboard([['A', 'B'], ['C']]);
      expect(kb).toEqual([
        [{ text: 'A' }, { text: 'B' }],
        [{ text: 'C' }]
      ]);
    });
  });

  describe('createInlineKeyboard', () => {
    it('builds inline keyboard with callback data', () => {
      const kb = telegram.createInlineKeyboard([
        [{ text: 'Yes', data: 'yes' }],
        [{ text: 'No' }]
      ]);
      expect(kb).toEqual({
        inline_keyboard: [
          [{ text: 'Yes', callback_data: 'yes' }],
          [{ text: 'No', callback_data: 'No' }]
        ]
      });
    });
  });

  describe('disconnect', () => {
    it('sets isConnected to false', () => {
      telegram.isConnected = true;
      telegram.disconnect();
      expect(telegram.isConnected).toBe(false);
    });

    it('deletes webhook when webhookUrl is set', async () => {
      const t = new TelegramIntegration({ token: TEST_TOKEN, webhookUrl: 'https://hook.example.com' });
      global.fetch.mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });
      t.disconnect();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/deleteWebhook'),
        expect.any(Object)
      );
    });

    it('does not call API when no webhookUrl', () => {
      global.fetch = jest.fn();
      telegram.disconnect();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns initial disconnected state', () => {
      const status = telegram.getStatus();
      expect(status.connected).toBe(false);
      expect(status.bot).toBeUndefined();
      expect(status.webhook).toBe(false);
    });

    it('returns bot info when connected', async () => {
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { username: 'MyBot' } })
      });
      await telegram.connect();
      const status = telegram.getStatus();
      expect(status.connected).toBe(true);
      expect(status.bot).toBe('MyBot');
    });
  });
});

describe('SocialPlatformManager', () => {
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    manager = new SocialPlatformManager({
      discord: { token: 'discord-token' },
      telegram: { token: 'tg-token' },
      syncEnabled: true
    });
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('constructor', () => {
    it('creates DiscordIntegration and TelegramIntegration', () => {
      expect(manager.discord).toBeInstanceOf(DiscordIntegration);
      expect(manager.telegram).toBeInstanceOf(TelegramIntegration);
      expect(manager.discord.token).toBe('discord-token');
      expect(manager.telegram.token).toBe('tg-token');
    });

    it('syncEnabled defaults to true', () => {
      const m = new SocialPlatformManager({ discord: {}, telegram: {} });
      expect(m.syncEnabled).toBe(true);
    });

    it('constructs with default options', () => {
      const m = new SocialPlatformManager();
      expect(m.syncEnabled).toBe(true);
      expect(m.discord).toBeInstanceOf(DiscordIntegration);
      expect(m.telegram).toBeInstanceOf(TelegramIntegration);
    });

    it('syncEnabled can be disabled', () => {
      const m = new SocialPlatformManager({ discord: {}, telegram: {}, syncEnabled: false });
      expect(m.syncEnabled).toBe(false);
    });
  });

  describe('init', () => {
    it('initializes both platforms', async () => {
      const discordInitSpy = jest.spyOn(manager.discord, 'init').mockResolvedValue();
      const telegramInitSpy = jest.spyOn(manager.telegram, 'init').mockResolvedValue();
      await manager.init();
      expect(discordInitSpy).toHaveBeenCalled();
      expect(telegramInitSpy).toHaveBeenCalled();
    });

    it('registers platforms in the platforms map', async () => {
      jest.spyOn(manager.discord, 'init').mockResolvedValue();
      jest.spyOn(manager.telegram, 'init').mockResolvedValue();
      await manager.init();
      expect(manager.platforms.get('discord')).toBe(manager.discord);
      expect(manager.platforms.get('telegram')).toBe(manager.telegram);
    });

    it('sets up unified message handlers', async () => {
      jest.spyOn(manager.discord, 'init').mockResolvedValue();
      jest.spyOn(manager.telegram, 'init').mockResolvedValue();
      const discordOnMsgSpy = jest.spyOn(manager.discord, 'onMessage');
      const telegramOnMsgSpy = jest.spyOn(manager.telegram, 'onMessage');
      await manager.init();
      expect(discordOnMsgSpy).toHaveBeenCalled();
      expect(telegramOnMsgSpy).toHaveBeenCalled();
    });
  });

  describe('setupUnifiedHandlers', () => {
    it('wires handler that forwards to registered handlers with platform context', async () => {
      const unifiedHandler = jest.fn();
      manager.onMessage(unifiedHandler);
      manager.setupUnifiedHandlers();
      const discordHandler = manager.discord.messageHandlers[0];
      const telegramHandler = manager.telegram.messageHandlers[0];
      await discordHandler('Hello', { userId: '1' });
      expect(unifiedHandler).toHaveBeenCalledWith('Hello', { userId: '1', platform: 'discord' });
      await telegramHandler('World', { userId: '2' });
      expect(unifiedHandler).toHaveBeenCalledWith('World', { userId: '2', platform: 'telegram' });
    });
  });

  describe('connectAll', () => {
    it('connects both platforms and returns results', async () => {
      jest.spyOn(manager.discord, 'connect').mockResolvedValue(true);
      jest.spyOn(manager.telegram, 'connect').mockResolvedValue(true);
      const results = await manager.connectAll();
      expect(results).toEqual({ discord: true, telegram: true });
    });

    it('reports partial connection failures', async () => {
      jest.spyOn(manager.discord, 'connect').mockResolvedValue(true);
      jest.spyOn(manager.telegram, 'connect').mockResolvedValue(false);
      const results = await manager.connectAll();
      expect(results).toEqual({ discord: true, telegram: false });
    });
  });

  describe('disconnectAll', () => {
    it('disconnects both platforms', () => {
      jest.spyOn(manager.discord, 'disconnect').mockImplementation(jest.fn());
      jest.spyOn(manager.telegram, 'disconnect').mockImplementation(jest.fn());
      manager.disconnectAll();
      expect(manager.discord.disconnect).toHaveBeenCalled();
      expect(manager.telegram.disconnect).toHaveBeenCalled();
    });
  });

  describe('onMessage', () => {
    it('registers a unified message handler', () => {
      const handler = jest.fn();
      manager.onMessage(handler);
      expect(manager.messageHandlers).toContain(handler);
    });
  });

  describe('broadcast', () => {
    it('sends to Discord when discord option provided', async () => {
      jest.spyOn(manager.discord, 'sendMessage').mockResolvedValue({ id: 'discord-msg' });
      const results = await manager.broadcast('Hello all', {
        discord: { channelId: 'ch1' }
      });
      expect(manager.discord.sendMessage).toHaveBeenCalledWith('ch1', 'Hello all', { channelId: 'ch1' });
      expect(results.discord).toEqual({ id: 'discord-msg' });
    });

    it('sends to Telegram when telegram option provided', async () => {
      jest.spyOn(manager.telegram, 'sendMessage').mockResolvedValue({ ok: true });
      const results = await manager.broadcast('Hello all', {
        telegram: { chatId: 'chat1' }
      });
      expect(manager.telegram.sendMessage).toHaveBeenCalledWith('chat1', 'Hello all', { chatId: 'chat1' });
      expect(results.telegram).toEqual({ ok: true });
    });

    it('broadcasts to all connected platforms with all flag', async () => {
      manager.discord.isConnected = true;
      manager.telegram.isConnected = true;
      manager.platforms.set('discord', manager.discord);
      manager.platforms.set('telegram', manager.telegram);
      const results = await manager.broadcast('Test', { all: true });
      expect(results.discord).toEqual({ broadcast: true });
      expect(results.telegram).toEqual({ broadcast: true });
    });

    it('skips disconnected platforms with all flag', async () => {
      manager.discord.isConnected = true;
      manager.telegram.isConnected = false;
      manager.platforms.set('discord', manager.discord);
      manager.platforms.set('telegram', manager.telegram);
      const results = await manager.broadcast('Test', { all: true });
      expect(results.discord).toEqual({ broadcast: true });
      expect(results.telegram).toBeUndefined();
    });

    it('returns empty results with no options', async () => {
      const results = await manager.broadcast('Hello');
      expect(results).toEqual({});
    });

    it('supports sending to both platforms simultaneously', async () => {
      jest.spyOn(manager.discord, 'sendMessage').mockResolvedValue({ id: 'm1' });
      jest.spyOn(manager.telegram, 'sendMessage').mockResolvedValue({ ok: true });
      const results = await manager.broadcast('Hi', {
        discord: { channelId: 'ch1' },
        telegram: { chatId: 'chat1' }
      });
      expect(results.discord).toEqual({ id: 'm1' });
      expect(results.telegram).toEqual({ ok: true });
    });
  });

  describe('broadcastToUser', () => {
    it('sends DM via discord when connected', async () => {
      manager.discord.isConnected = true;
      jest.spyOn(manager.discord, 'sendDM').mockResolvedValue({ id: 'dm1' });
      const results = await manager.broadcastToUser('user123', 'Personal msg');
      expect(manager.discord.sendDM).toHaveBeenCalledWith('user123', 'Personal msg');
      expect(results.discord).toEqual({ id: 'dm1' });
    });

    it('sends via telegram when discord not connected', async () => {
      manager.discord.isConnected = false;
      manager.telegram.isConnected = true;
      jest.spyOn(manager.telegram, 'sendMessage').mockResolvedValue({ ok: true });
      const results = await manager.broadcastToUser('user123', 'Personal msg');
      expect(manager.telegram.sendMessage).toHaveBeenCalledWith('user123', 'Personal msg');
      expect(results.telegram).toEqual({ ok: true });
    });

    it('returns empty results when neither is connected', async () => {
      const results = await manager.broadcastToUser('user123', 'Msg');
      expect(results).toEqual({});
    });
  });

  describe('getStatus', () => {
    it('returns combined status from both platforms', () => {
      manager.discord.isConnected = true;
      manager.telegram.isConnected = false;
      const status = manager.getStatus();
      expect(status.discord.connected).toBe(true);
      expect(status.telegram.connected).toBe(false);
      expect(status.totalConnected).toBe(1);
    });

    it('returns zero connected when both disconnected', () => {
      const status = manager.getStatus();
      expect(status.totalConnected).toBe(0);
    });
  });

  describe('getPlatform', () => {
    it('returns discord integration', async () => {
      await manager.init();
      expect(manager.getPlatform('discord')).toBe(manager.discord);
    });

    it('returns telegram integration', async () => {
      await manager.init();
      expect(manager.getPlatform('telegram')).toBe(manager.telegram);
    });

    it('returns undefined for unknown platform', () => {
      expect(manager.getPlatform('unknown')).toBeUndefined();
    });
  });

  describe('isAnyConnected', () => {
    it('returns true when discord is connected', () => {
      manager.discord.isConnected = true;
      expect(manager.isAnyConnected()).toBe(true);
    });

    it('returns true when telegram is connected', () => {
      manager.telegram.isConnected = true;
      expect(manager.isAnyConnected()).toBe(true);
    });

    it('returns false when none connected', () => {
      expect(manager.isAnyConnected()).toBe(false);
    });
  });
});
