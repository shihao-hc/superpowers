jest.mock('discord.js', () => {
  class MockEmbedBuilder {
    constructor() { this.data = {}; }
    setTitle(t) { this.data.title = t; return this; }
    setDescription(d) { this.data.description = d; return this; }
    setColor(c) { this.data.color = c; return this; }
    setTimestamp() { this.data.timestamp = true; return this; }
    addFields(f) { this.data.fields = f; return this; }
  }
  class MockButtonBuilder {
    constructor() { this.data = {}; }
    setCustomId(id) { this.data.customId = id; return this; }
    setLabel(l) { this.data.label = l; return this; }
    setStyle(s) { this.data.style = s; return this; }
    setEmoji(e) { this.data.emoji = e; return this; }
  }
  class MockActionRowBuilder {
    constructor() { this.components = []; }
    addComponents(c) { this.components = this.components.concat(c); return this; }
  }
  const ButtonStyle = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 };
  class MockCollection extends Map {
    constructor() { super(); }
  }
  class MockClient {
    constructor() {
      this.user = { tag: 'TestBot#0000' };
      this.ws = { ping: 42 };
      this.guilds = { cache: new Map() };
      this.channels = { cache: new Map() };
      this.readyAt = new Date();
      this.on = jest.fn();
      this.login = jest.fn().mockResolvedValue('token');
      this.destroy = jest.fn();
    }
  }

  return {
    Client: MockClient,
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4, DirectMessages: 8, GuildMembers: 16, GuildMessageReactions: 32 },
    Collection: MockCollection,
    REST: jest.fn(() => ({ setToken: jest.fn(() => ({ put: jest.fn().mockResolvedValue([]) })) })),
    Routes: { applicationCommands: jest.fn(() => '/commands') },
    EmbedBuilder: MockEmbedBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonBuilder: MockButtonBuilder,
    ButtonStyle
  };
});

const DiscordBot = require('../../src/social/DiscordBot');

describe('DiscordBot', () => {
  let bot;
  let mockMessage;

  beforeEach(() => {
    jest.clearAllMocks();
    bot = new DiscordBot({
      token: 'test-token',
      clientId: 'test-client',
      agents: {
        memory: { remember: jest.fn(), retrieve: jest.fn(), remove: jest.fn(), getStats: jest.fn(() => ({ count: 5 })), dump: jest.fn(() => ({})) },
        router: { routeMessage: jest.fn().mockResolvedValue({ reply: 'Hello!' }) },
        pm: { personalities: { happy: {}, sad: {} }, activeName: 'happy', setActive: jest.fn(), getMood: jest.fn(() => 'joyful') }
      }
    });
    mockMessage = {
      author: { id: 'user1', tag: 'User#1234' },
      guild: { name: 'TestGuild' },
      channel: { name: 'general' },
      reply: jest.fn().mockResolvedValue(undefined)
    };
  });

  describe('constructor', () => {
    it('sets defaults from options and env', () => {
      expect(bot.token).toBe('test-token');
      expect(bot.clientId).toBe('test-client');
      expect(bot.prefix).toBe('!');
      expect(bot.enabled).toBe(false);
      expect(bot.commands).toBeDefined();
    });

    it('falls back to empty agents', () => {
      const b = new DiscordBot({});
      expect(b.agents).toEqual({});
    });
  });

  describe('sanitizeInput', () => {
    it('truncates to maxLength', () => {
      expect(bot.sanitizeInput('hello world', 5)).toBe('hello');
    });

    it('trims whitespace', () => {
      expect(bot.sanitizeInput('  hello  ', 10)).toBe('hello');
    });

    it('returns empty string for falsy input', () => {
      expect(bot.sanitizeInput(null)).toBe('');
      expect(bot.sanitizeInput(undefined)).toBe('');
      expect(bot.sanitizeInput('')).toBe('');
    });

    it('coerces non-string to string', () => {
      expect(bot.sanitizeInput(123, 5)).toBe('123');
    });
  });

  describe('createEmbed', () => {
    it('creates embed with title and description', () => {
      const embed = bot.createEmbed('Title', 'Desc', 'success');
      expect(embed.data.title).toBe('Title');
      expect(embed.data.description).toBe('Desc');
      expect(embed.data.color).toBe(0x57F287);
    });

    it('creates embed with fields', () => {
      const embed = bot.createEmbed('T', 'D', 'primary', [{ name: 'N', value: 'V', inline: true }]);
      expect(embed.data.fields).toHaveLength(1);
      expect(embed.data.fields[0].name).toBe('N');
    });

    it('defaults to primary color for unknown color', () => {
      const embed = bot.createEmbed('T', 'D', 'unknown');
      expect(embed.data.color).toBe(0x5865F2);
    });
  });

  describe('createButton', () => {
    it('creates button with id and label', () => {
      const btn = bot.createButton('btn1', 'Click', 'success');
      expect(btn.data.customId).toBe('btn1');
      expect(btn.data.label).toBe('Click');
      expect(btn.data.style).toBe(3);
    });

    it('adds emoji when provided', () => {
      const btn = bot.createButton('b1', 'Go', 'primary', '👍');
      expect(btn.data.emoji).toBe('👍');
    });
  });

  describe('createActionRow', () => {
    it('creates row with components', () => {
      const btn = bot.createButton('b1', 'Go');
      const row = bot.createActionRow([btn]);
      expect(row.components).toHaveLength(1);
    });
  });

  describe('registerCommand', () => {
    it('stores command in commands collection', () => {
      const cmd = { execute: jest.fn() };
      bot.registerCommand('test', cmd);
      expect(bot.commands.get('test')).toBe(cmd);
    });
  });

  describe('getStatus', () => {
    it('returns disabled status when not connected', () => {
      const b = new DiscordBot({});
      const status = b.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.connected).toBe(false);
    });
  });

  describe('handleCommand', () => {
    it('processes !remember', async () => {
      await bot.handleCommand(mockMessage, 'remember', ['key1', 'some', 'value']);
      expect(bot.agents.memory.remember).toHaveBeenCalledWith(
        'discord_user1_key1',
        expect.objectContaining({ value: 'some value', user: 'User#1234' })
      );
      expect(mockMessage.reply).toHaveBeenCalledWith('✅ 已记住: key1');
    });

    it('processes !r as remember alias', async () => {
      await bot.handleCommand(mockMessage, 'r', ['key1', 'val']);
      expect(bot.agents.memory.remember).toHaveBeenCalled();
    });

    it('reports memory not configured for remember', async () => {
      const b = new DiscordBot({ agents: {} });
      await b.handleCommand(mockMessage, 'remember', ['k', 'v']);
      expect(mockMessage.reply).toHaveBeenCalledWith('记忆系统未配置');
    });

    it('requires key for !remember', async () => {
      await bot.handleCommand(mockMessage, 'remember', []);
      expect(mockMessage.reply).toHaveBeenCalledWith('用法: !remember <key> <value>');
    });

    it('processes !recall', async () => {
      bot.agents.memory.retrieve.mockReturnValue('stored_value');
      await bot.handleCommand(mockMessage, 'recall', ['mykey']);
      expect(bot.agents.memory.retrieve).toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('mykey'));
    });

    it('requires key for !recall', async () => {
      await bot.handleCommand(mockMessage, 'recall', []);
      expect(mockMessage.reply).toHaveBeenCalledWith('用法: !recall <key>');
    });

    it('reports not found for missing memory', async () => {
      bot.agents.memory.retrieve.mockReturnValue(null);
      await bot.handleCommand(mockMessage, 'recall', ['missing']);
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('未找到'));
    });

    it('processes !forget', async () => {
      await bot.handleCommand(mockMessage, 'forget', ['oldkey']);
      expect(bot.agents.memory.remove).toHaveBeenCalledTimes(3);
      expect(mockMessage.reply).toHaveBeenCalledWith('🗑️ 已忘记: oldkey');
    });

    it('processes !memories', async () => {
      await bot.handleCommand(mockMessage, 'memories', []);
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('记忆统计'));
    });

    it('processes !personality list', async () => {
      await bot.handleCommand(mockMessage, 'personality', ['list']);
      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('processes !personality switch', async () => {
      bot.agents.pm.setActive.mockReturnValue(true);
      await bot.handleCommand(mockMessage, 'personality', ['switch', 'sad']);
      expect(bot.agents.pm.setActive).toHaveBeenCalledWith('sad');
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('sad'));
    });

    it('processes !personality current', async () => {
      await bot.handleCommand(mockMessage, 'personality', ['current']);
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('happy'));
    });

    it('delegates to registered command', async () => {
      const cmd = { execute: jest.fn().mockResolvedValue(undefined) };
      bot.registerCommand('mycmd', cmd);
      await bot.handleCommand(mockMessage, 'mycmd', ['arg1']);
      expect(cmd.execute).toHaveBeenCalledWith(mockMessage, ['arg1'], bot.agents);
    });

    it('falls through to handleChat for unknown command', async () => {
      await bot.handleCommand(mockMessage, 'hello', ['world']);
      expect(mockMessage.reply).toHaveBeenCalledWith('Hello!');
    });
  });

  describe('handleChat', () => {
    it('rejects empty text', async () => {
      await bot.handleChat(mockMessage, '');
      expect(mockMessage.reply).toHaveBeenCalledWith('请输入内容');
    });

    it('routes message through router', async () => {
      await bot.handleChat(mockMessage, 'hi there');
      expect(bot.agents.router.routeMessage).toHaveBeenCalledWith('hi there');
      expect(mockMessage.reply).toHaveBeenCalledWith('Hello!');
    });

    it('replies AI not configured when no router', async () => {
      const b = new DiscordBot({ agents: { memory: bot.agents.memory } });
      await b.handleChat(mockMessage, 'hi');
      expect(mockMessage.reply).toHaveBeenCalledWith('AI 未配置');
    });

    it('saves chat to memory with rate limiting', async () => {
      await bot.handleChat(mockMessage, 'hello');
      expect(bot.agents.memory.remember).toHaveBeenCalledWith(
        expect.stringMatching(/^discord_chat_user1_/),
        expect.any(Object)
      );
    });

    it('respects memory rate limit', async () => {
      bot.MEMORY_RATE_LIMIT = 1;
      await bot.handleChat(mockMessage, 'first');
      await bot.handleChat(mockMessage, 'second');
      expect(bot.agents.memory.remember).toHaveBeenCalledTimes(1);
    });

    it('handles error gracefully', async () => {
      bot.agents.router.routeMessage.mockRejectedValue(new Error('fail'));
      await bot.handleChat(mockMessage, 'hi');
      expect(mockMessage.reply).toHaveBeenCalledWith('处理消息时出错');
    });

    it('resets rate window after timeout', async () => {
      bot.MEMORY_RATE_WINDOW = 0;
      await bot.handleChat(mockMessage, 'first');
      await bot.handleChat(mockMessage, 'second');
      expect(bot.agents.memory.remember).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleButton', () => {
    it('replies to poll button', async () => {
      const interaction = { customId: 'poll_2', reply: jest.fn().mockResolvedValue(undefined) };
      await bot.handleButton(interaction);
      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });
  });

  describe('handleSelectMenu', () => {
    it('replies with selected values', async () => {
      const interaction = { values: ['opt1', 'opt2'], reply: jest.fn().mockResolvedValue(undefined) };
      await bot.handleSelectMenu(interaction);
      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: '你选择了: opt1, opt2' }));
    });
  });

  describe('sendDM', () => {
    it('sends DM to user', async () => {
      const user = { send: jest.fn().mockResolvedValue(undefined) };
      bot.client = { users: { fetch: jest.fn().mockResolvedValue(user) } };
      await bot.sendDM('user123', 'Hello!');
      expect(user.send).toHaveBeenCalledWith('Hello!');
    });

    it('handles missing client', async () => {
      await expect(bot.sendDM('u', 'msg')).resolves.toBeUndefined();
    });
  });

  describe('broadcast', () => {
    it('sends to specific channel', async () => {
      const channel = { send: jest.fn().mockResolvedValue(undefined) };
      bot.client = { channels: { fetch: jest.fn().mockResolvedValue(channel) } };
      await bot.broadcast('Hello!', 'ch123');
      expect(channel.send).toHaveBeenCalledWith('Hello!');
    });

    it('sends to all system channels', async () => {
      const guild1 = { systemChannel: { send: jest.fn().mockResolvedValue(undefined) } };
      const guild2 = { systemChannel: { send: jest.fn().mockResolvedValue(undefined) } };
      const cache = new Map();
      cache.set('g1', guild1);
      cache.set('g2', guild2);
      bot.client = { guilds: { cache } };
      await bot.broadcast('Hello!');
      expect(guild1.systemChannel.send).toHaveBeenCalledWith('Hello!');
      expect(guild2.systemChannel.send).toHaveBeenCalledWith('Hello!');
    });
  });

  describe('sendToChannel', () => {
    it('sends string content', async () => {
      const channel = { send: jest.fn().mockResolvedValue(undefined) };
      bot.client = { channels: { fetch: jest.fn().mockResolvedValue(channel) } };
      await bot.sendToChannel('ch123', 'text');
      expect(channel.send).toHaveBeenCalledWith('text');
    });

    it('sends embed object', async () => {
      const channel = { send: jest.fn().mockResolvedValue(undefined) };
      bot.client = { channels: { fetch: jest.fn().mockResolvedValue(channel) } };
      const embed = bot.createEmbed('T', 'D');
      await bot.sendToChannel('ch123', embed);
      expect(channel.send).toHaveBeenCalledWith({ embeds: [embed] });
    });
  });

  describe('notifyGameEvent', () => {
    it('creates embed for game events', () => {
      const originalChannel = process.env.DISCORD_GAME_CHANNEL;
      process.env.DISCORD_GAME_CHANNEL = 'game-ch';
      bot.sendToChannel = jest.fn();
      bot.notifyGameEvent('hurt', { health: 15 });
      expect(bot.sendToChannel).toHaveBeenCalledWith('game-ch', expect.any(Object));
      process.env.DISCORD_GAME_CHANNEL = originalChannel;
    });

    it('ignores unknown event types', () => {
      process.env.DISCORD_GAME_CHANNEL = 'game-ch';
      bot.sendToChannel = jest.fn();
      bot.notifyGameEvent('unknown', {});
      expect(bot.sendToChannel).not.toHaveBeenCalled();
    });
  });

  describe('setupGameNotifications', () => {
    it('registers event handlers on gameAgent', () => {
      const on = jest.fn();
      const gameAgent = { on };
      bot.setupGameNotifications(gameAgent);
      expect(on).toHaveBeenCalledWith('hurt', expect.any(Function));
      expect(on).toHaveBeenCalledWith('died', expect.any(Function));
      expect(on).toHaveBeenCalledWith('playerJoined', expect.any(Function));
      expect(on).toHaveBeenCalledWith('playerLeft', expect.any(Function));
      expect(on).toHaveBeenCalledWith('connected', expect.any(Function));
      expect(on).toHaveBeenCalledWith('disconnected', expect.any(Function));
    });

    it('handles null gameAgent', () => {
      expect(() => bot.setupGameNotifications(null)).not.toThrow();
    });
  });

  describe('stop', () => {
    it('destroys client and disables bot', () => {
      bot.client = { destroy: jest.fn() };
      bot.stop();
      expect(bot.client.destroy).toHaveBeenCalled();
      expect(bot.enabled).toBe(false);
    });

    it('handles stop without client', () => {
      expect(() => bot.stop()).not.toThrow();
    });
  });

  describe('start', () => {
    it('returns early when no token', async () => {
      const b = new DiscordBot({});
      await b.start();
      expect(b.enabled).toBe(false);
    });

    it('creates client and logs in', async () => {
      jest.useFakeTimers();
      const { Client } = require('discord.js');
      const readyHandler = jest.fn();
      bot.client = new Client();
      bot.client.on.mockImplementation((event, handler) => {
        if (event === 'ready') readyHandler.mockImplementation(handler);
        return bot.client;
      });
      const startPromise = bot.start();
      jest.runAllTimers();
      readyHandler();
      await startPromise;
      expect(bot.client.login).toHaveBeenCalledWith('test-token');
      jest.useRealTimers();
    });
  });

  describe('isAdmin', () => {
    beforeEach(() => {
      process.env.DISCORD_ADMIN_ROLES = 'role123,role456';
    });
    afterEach(() => {
      delete process.env.DISCORD_ADMIN_ROLES;
    });

    it('returns false for non-admin member', () => {
      const ctx = { member: { permissions: { has: () => false }, roles: { cache: [] }, cache: { some: () => false } } };
      expect(bot.isAdmin(ctx)).toBe(false);
    });

    it('returns true for admin by permission', () => {
      const ctx = { member: { permissions: { has: () => true } } };
      expect(bot.isAdmin(ctx)).toBe(true);
    });

    it('returns false for missing member', () => {
      expect(bot.isAdmin({})).toBe(false);
    });
  });
});
