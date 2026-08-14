jest.mock('discord.js', () => {
  class MockEmbedBuilder {
    constructor() { this.data = {}; }
    setTitle(t) { this.data.title = t; return this; }
    setDescription(d) { this.data.description = d; return this; }
    setColor(c) { this.data.color = c; return this; }
    setTimestamp() { this.data.timestamp = true; return this; }
    addFields(f) { this.data.fields = f; return this; }
    setImage(i) { this.data.image = i; return this; }
    setThumbnail(t) { this.data.thumbnail = t; return this; }
    setFooter(f) { this.data.footer = f; return this; }
    setURL(u) { this.data.url = u; return this; }
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

    it('reports memory not configured for recall', async () => {
      const b = new DiscordBot({ agents: {} });
      await b.handleCommand(mockMessage, 'recall', ['k']);
      expect(mockMessage.reply).toHaveBeenCalledWith('记忆系统未配置');
    });

    it('reports memory not configured for forget', async () => {
      const b = new DiscordBot({ agents: {} });
      await b.handleCommand(mockMessage, 'forget', ['k']);
      expect(mockMessage.reply).toHaveBeenCalledWith('记忆系统未配置');
    });

    it('reports memory not configured for memories', async () => {
      const b = new DiscordBot({ agents: {} });
      await b.handleCommand(mockMessage, 'memories', []);
      expect(mockMessage.reply).toHaveBeenCalledWith('记忆系统未配置');
    });

    it('requires key for !forget', async () => {
      await bot.handleCommand(mockMessage, 'forget', []);
      expect(mockMessage.reply).toHaveBeenCalledWith('用法: !forget <key>');
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

    it('processes !memories with user keys', async () => {
      bot.agents.memory.dump.mockReturnValue({ 'discord_user1_k1': 'v1', 'other': 'x' });
      await bot.handleCommand(mockMessage, 'memories', []);
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('你的记忆: 1'));
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

    it('resets rate window when time advances', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000000);
      bot.MEMORY_RATE_WINDOW = 5000;
      bot.userMemoryCounts.set('user1', { count: 5, windowStart: 1000000 });
      await bot.handleChat(mockMessage, 'first');
      nowSpy.mockReturnValue(2000000);
      await bot.handleChat(mockMessage, 'second');
      expect(bot.agents.memory.remember).toHaveBeenCalledTimes(2);
      nowSpy.mockRestore();
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

    it('fires notifyGameEvent on game events', async () => {
      const handlers = {};
      const on = jest.fn((event, handler) => { handlers[event] = handler; });
      const gameAgent = { on };
      bot.setupGameNotifications(gameAgent);
      const spy = jest.spyOn(bot, 'notifyGameEvent').mockResolvedValue(undefined);
      handlers.hurt({ hp: 50 });
      handlers.died({ cause: 'boss' });
      handlers.playerJoined({ name: 'p1' });
      handlers.playerLeft({ name: 'p1' });
      handlers.connected();
      handlers.disconnected();
      expect(spy).toHaveBeenCalledWith('hurt', expect.any(Object));
      expect(spy).toHaveBeenCalledWith('died', expect.any(Object));
      expect(spy).toHaveBeenCalledWith('playerJoined', expect.any(Object));
      expect(spy).toHaveBeenCalledWith('playerLeft', expect.any(Object));
      expect(spy).toHaveBeenCalledWith('connected');
      expect(spy).toHaveBeenCalledWith('disconnected');
      spy.mockRestore();
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

    it('returns true when no admin roles configured', () => {
      delete process.env.DISCORD_ADMIN_ROLES;
      const ctx = { member: { permissions: { has: () => false }, roles: { cache: [] } } };
      expect(bot.isAdmin(ctx)).toBe(true);
    });

    it('returns true when member has admin role', () => {
      process.env.DISCORD_ADMIN_ROLES = 'role123,role456';
      const ctx = { member: { permissions: { has: () => false }, roles: { cache: [{ id: 'role456' }] } } };
      expect(bot.isAdmin(ctx)).toBe(true);
    });
  });

  describe('registerSlashCommands', () => {
    it('returns early without clientId', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const b = new DiscordBot({ token: 't' });
      await b.registerSlashCommands();
      expect(log).toHaveBeenCalledWith('[DiscordBot] No client ID for slash commands');
      log.mockRestore();
    });

    it('registers commands via REST', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      await bot.registerSlashCommands();
      expect(bot.slashCommands.length).toBeGreaterThan(0);
      expect(log).toHaveBeenCalledWith('[DiscordBot] Slash commands registered');
      log.mockRestore();
    });

    it('logs error when REST put fails', async () => {
      const { REST } = require('discord.js');
      REST.mockImplementationOnce(() => ({ setToken: jest.fn(() => ({ put: jest.fn().mockRejectedValue(new Error('boom')) })) }));
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      await bot.registerSlashCommands();
      expect(err).toHaveBeenCalledWith('[DiscordBot] Failed to register slash commands:', 'boom');
      err.mockRestore();
    });
  });

  describe('handleSlashCommand', () => {
    function makeInteraction(commandName, opts = {}) {
      const values = opts.values || {};
      const getString = jest.fn((name) => (values[name] !== undefined ? values[name] : null));
      const getUser = jest.fn((name) => (values[name] !== undefined ? values[name] : null));
      const interaction = {
        commandName,
        options: { getString, getUser },
        reply: jest.fn().mockResolvedValue(undefined),
        deferReply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined),
        createdTimestamp: Date.now(),
        user: { id: 'u1', tag: 'U#1', username: 'u1', displayAvatarURL: jest.fn(() => 'url') },
        member: { permissions: { has: jest.fn(() => true) } },
        guild: null,
        customId: '',
        values: []
      };
      return interaction;
    }

    it('help with command found', async () => {
      const i = makeInteraction('help', { values: { command: 'ping' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('help with command not found', async () => {
      const i = makeInteraction('help', { values: { command: 'zzz' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('help general menu', async () => {
      const i = makeInteraction('help');
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: [expect.any(Object)] }));
    });

    it('ping', async () => {
      bot.client = new (require('discord.js').Client)();
      const i = makeInteraction('ping');
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('status with agents', async () => {
      bot.client = new (require('discord.js').Client)();
      const i = makeInteraction('status');
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('status without pm', async () => {
      bot.client = new (require('discord.js').Client)();
      bot.agents = { router: {} };
      const i = makeInteraction('status');
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('chat success', async () => {
      const i = makeInteraction('chat', { values: { message: 'hello' } });
      await bot.handleSlashCommand(i);
      expect(i.deferReply).toHaveBeenCalled();
      expect(i.editReply).toHaveBeenCalledWith(expect.objectContaining({ embeds: [expect.any(Object)] }));
    });

    it('chat without router', async () => {
      const b = new DiscordBot({ token: 't', agents: {} });
      const i = makeInteraction('chat', { values: { message: 'hello' } });
      await b.handleSlashCommand(i);
      expect(i.editReply).toHaveBeenCalled();
    });

    it('chat router error', async () => {
      bot.agents.router.routeMessage.mockRejectedValue(new Error('fail'));
      const i = makeInteraction('chat', { values: { message: 'hello' } });
      await bot.handleSlashCommand(i);
      expect(i.editReply).toHaveBeenCalled();
    });

    it('personality list', async () => {
      const i = makeInteraction('personality', { values: { action: 'list' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: [expect.any(Object)] }));
    });

    it('personality switch denied for non-admin', async () => {
      process.env.DISCORD_ADMIN_ROLES = 'role123';
      const i = makeInteraction('personality', { values: { action: 'switch', name: 'sad' } });
      i.member.permissions.has.mockReturnValue(false);
      i.member.roles = { cache: [] };
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
      delete process.env.DISCORD_ADMIN_ROLES;
    });

    it('personality switch without name', async () => {
      const i = makeInteraction('personality', { values: { action: 'switch' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('personality switch success', async () => {
      bot.agents.pm.setActive.mockReturnValue(true);
      const i = makeInteraction('personality', { values: { action: 'switch', name: 'sad' } });
      await bot.handleSlashCommand(i);
      expect(bot.agents.pm.setActive).toHaveBeenCalledWith('sad');
      expect(i.reply).toHaveBeenCalled();
    });

    it('personality switch fail', async () => {
      bot.agents.pm.setActive.mockReturnValue(false);
      const i = makeInteraction('personality', { values: { action: 'switch', name: 'nope' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('personality current', async () => {
      const i = makeInteraction('personality', { values: { action: 'current' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('personality without pm', async () => {
      const b = new DiscordBot({ token: 't', agents: {} });
      const i = makeInteraction('personality', { values: { action: 'list' } });
      await b.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('game connect denied for non-admin', async () => {
      process.env.DISCORD_ADMIN_ROLES = 'role123';
      const i = makeInteraction('game', { values: { action: 'connect' } });
      i.member.permissions.has.mockReturnValue(false);
      i.member.roles = { cache: [] };
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
      delete process.env.DISCORD_ADMIN_ROLES;
    });

    it('memory remember success', async () => {
      const i = makeInteraction('memory', { values: { action: 'remember', key: 'k', value: 'v' } });
      await bot.handleSlashCommand(i);
      expect(bot.agents.memory.remember).toHaveBeenCalledWith('discord_u1_k', expect.any(Object));
    });

    it('memory remember without key', async () => {
      const i = makeInteraction('memory', { values: { action: 'remember' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('memory recall success', async () => {
      bot.agents.memory.retrieve.mockReturnValue('stored');
      const i = makeInteraction('memory', { values: { action: 'recall', key: 'k' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('memory recall admin fallback to global', async () => {
      bot.agents.memory.retrieve.mockReturnValueOnce(null).mockReturnValue('global');
      const i = makeInteraction('memory', { values: { action: 'recall', key: 'k' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('memory recall not found', async () => {
      bot.agents.memory.retrieve.mockReturnValue(null);
      const i = makeInteraction('memory', { values: { action: 'recall', key: 'k' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('memory recall without key', async () => {
      const i = makeInteraction('memory', { values: { action: 'recall' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('memory list', async () => {
      const i = makeInteraction('memory', { values: { action: 'list' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('memory search without query', async () => {
      const i = makeInteraction('memory', { values: { action: 'search' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('memory search with results', async () => {
      bot.agents.memory.list = jest.fn(() => ({ entries: [['key1', 'v1'], ['key2', 'v2']] }));
      const i = makeInteraction('memory', { values: { action: 'search', query: 'x' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('memory search empty results', async () => {
      bot.agents.memory.list = jest.fn(() => ({ entries: [] }));
      const i = makeInteraction('memory', { values: { action: 'search', query: 'x' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('memory stats', async () => {
      const i = makeInteraction('memory', { values: { action: 'stats' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('memory clear denied for non-admin', async () => {
      process.env.DISCORD_ADMIN_ROLES = 'role123';
      const i = makeInteraction('memory', { values: { action: 'clear' } });
      i.member.permissions.has.mockReturnValue(false);
      i.member.roles = { cache: [] };
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
      delete process.env.DISCORD_ADMIN_ROLES;
    });

    it('memory list with user keys', async () => {
      bot.agents.memory.dump.mockReturnValue({ 'discord_u1_k1': 'v1', 'discord_u1_k2': 'v2', 'other': 'x' });
      const i = makeInteraction('memory', { values: { action: 'list' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: [expect.any(Object)] }));
    });

    it('memory clear as admin', async () => {
      const i = makeInteraction('memory', { values: { action: 'clear' } });
      await bot.handleSlashCommand(i);
      expect(bot.agents.memory.remember).toHaveBeenCalled();
    });

    it('memory without memory system', async () => {
      const b = new DiscordBot({ token: 't', agents: {} });
      const i = makeInteraction('memory', { values: { action: 'list' } });
      await b.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('game status with game', async () => {
      bot.agents.game = { getStatus: jest.fn(() => ({ connected: true, health: 12 })) };
      const i = makeInteraction('game', { values: { action: 'status' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('game status without game', async () => {
      const i = makeInteraction('game', { values: { action: 'status' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('game command without command', async () => {
      const i = makeInteraction('game', { values: { action: 'command' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('game command with command', async () => {
      const i = makeInteraction('game', { values: { action: 'command', command: 'say hi' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('game default help', async () => {
      const i = makeInteraction('game', { values: { action: 'other' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('roll with dice', async () => {
      const i = makeInteraction('roll', { values: { dice: '2d6' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('roll with large count truncates list', async () => {
      const i = makeInteraction('roll', { values: { dice: '15d6' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('roll with invalid format falls back', async () => {
      const i = makeInteraction('roll', { values: { dice: 'abc' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('roll default dice', async () => {
      const i = makeInteraction('roll');
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('8ball', async () => {
      const i = makeInteraction('8ball', { values: { question: 'yes?' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('avatar', async () => {
      const i = makeInteraction('avatar');
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('userinfo with member', async () => {
      const member = {
        joinedTimestamp: Date.now(),
        nickname: 'Nick',
        roles: { cache: new Map([['@everyone', { name: '@everyone' }], ['r1', { name: 'role1' }]]) }
      };
      member.roles.cache.map = function (fn) { return Array.from(this.values()).map(fn); };
      const i = makeInteraction('userinfo');
      i.guild = { members: { fetch: jest.fn().mockResolvedValue(member) } };
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('userinfo without member', async () => {
      const i = makeInteraction('userinfo');
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('serverinfo without guild', async () => {
      const i = makeInteraction('serverinfo');
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('serverinfo with guild', async () => {
      const i = makeInteraction('serverinfo');
      i.guild = {
        name: 'G',
        memberCount: 3,
        createdTimestamp: Date.now(),
        channels: { cache: new Map() },
        roles: { cache: new Map() },
        emojis: { cache: new Map() },
        iconURL: jest.fn(() => 'icon')
      };
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalled();
    });

    it('poll with fewer than 2 options', async () => {
      const i = makeInteraction('poll', { values: { question: 'Q', options: 'only' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    });

    it('poll with options', async () => {
      const i = makeInteraction('poll', { values: { question: 'Q', options: 'a,b,c' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ components: [expect.any(Object)] }));
    });

    it('poll with many options renders second row', async () => {
      const i = makeInteraction('poll', { values: { question: 'Q', options: 'a,b,c,d,e,f,g,h' } });
      await bot.handleSlashCommand(i);
      expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ components: [expect.any(Object)] }));
    });

    it('catches command errors', async () => {
      bot.client = new (require('discord.js').Client)();
      const i = makeInteraction('ping');
      i.reply.mockRejectedValueOnce(new Error('boom'));
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      await bot.handleSlashCommand(i);
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it('ignores unknown command name', async () => {
      const i = makeInteraction('unknown');
      await bot.handleSlashCommand(i);
      expect(i.reply).not.toHaveBeenCalled();
    });
  });

  describe('start event wiring', () => {
    async function setupStartedBot() {
      jest.useFakeTimers();
      const startPromise = bot.start();
      const handlers = {};
      bot.client.on.mock.calls.forEach(([event, handler]) => { handlers[event] = handler; });
      return { startPromise, handlers };
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    it('wires ready, interaction, message and reaction handlers', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      expect(handlers.ready).toBeDefined();
      expect(handlers.interactionCreate).toBeDefined();
      expect(handlers.messageCreate).toBeDefined();
      expect(handlers.messageReactionAdd).toBeDefined();
      expect(handlers.messageReactionRemove).toBeDefined();
      expect(handlers.error).toBeDefined();
      await startPromise;
    });

    it('ready handler enables bot and registers commands', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      bot.registerSlashCommands = jest.fn().mockResolvedValue(undefined);
      await handlers.ready();
      expect(bot.enabled).toBe(true);
      expect(bot.registerSlashCommands).toHaveBeenCalled();
      await startPromise;
    });

    it('messageCreate skips bot authors', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      const msg = { author: { bot: true }, content: '!ping' };
      await handlers.messageCreate(msg);
      expect(bot.enabled).toBe(false);
      await startPromise;
    });

    it('messageCreate replies when typing in progress', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      bot.typingUsers.set('u1', { expiresAt: Date.now() + 30000 });
      const msg = { author: { bot: false, id: 'u1' }, content: '!ping', channel: { send: jest.fn().mockResolvedValue({ delete: jest.fn().mockResolvedValue(undefined) }) } };
      await handlers.messageCreate(msg);
      expect(msg.channel.send).toHaveBeenCalledWith(expect.objectContaining({ embeds: [expect.any(Object)] }));
      jest.advanceTimersByTime(3000);
      await startPromise;
    });

    it('messageCreate ignores non-prefix messages', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      const msg = { author: { bot: false, id: 'u1' }, content: 'plain text', reply: jest.fn() };
      await handlers.messageCreate(msg);
      expect(msg.reply).not.toHaveBeenCalled();
      await startPromise;
    });

    it('messageCreate handles prefixed command', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      const msg = { author: { bot: false, id: 'u1' }, content: '!hello world', guild: { name: 'TestGuild' }, channel: { name: 'general' }, reply: jest.fn().mockResolvedValue(undefined) };
      await handlers.messageCreate(msg);
      expect(msg.reply).toHaveBeenCalledWith('Hello!');
      expect(bot.typingUsers.has('u1')).toBe(false);
      await startPromise;
    });

    it('interactionCreate dispatches chat commands', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      bot.handleSlashCommand = jest.fn().mockResolvedValue(undefined);
      const i = { isChatInputCommand: () => true, isButton: () => false, isSelectMenu: () => false };
      await handlers.interactionCreate(i);
      expect(bot.handleSlashCommand).toHaveBeenCalledWith(i);
      await startPromise;
    });

    it('interactionCreate dispatches buttons', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      bot.handleButton = jest.fn().mockResolvedValue(undefined);
      const i = { isChatInputCommand: () => false, isButton: () => true, isSelectMenu: () => false };
      await handlers.interactionCreate(i);
      expect(bot.handleButton).toHaveBeenCalledWith(i);
      await startPromise;
    });

    it('interactionCreate dispatches select menus', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      bot.handleSelectMenu = jest.fn().mockResolvedValue(undefined);
      const i = { isChatInputCommand: () => false, isButton: () => false, isSelectMenu: () => true };
      await handlers.interactionCreate(i);
      expect(bot.handleSelectMenu).toHaveBeenCalledWith(i);
      await startPromise;
    });

    it('messageReactionAdd skips bots and handles reactions', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      await handlers.messageReactionAdd({}, { bot: true }, {});
      bot.handleReaction = jest.fn().mockResolvedValue(undefined);
      await handlers.messageReactionAdd({}, { bot: false }, {});
      expect(bot.handleReaction).toHaveBeenCalledWith({}, { bot: false }, 'add');
      await startPromise;
    });

    it('messageReactionRemove handles reactions', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      bot.handleReaction = jest.fn().mockResolvedValue(undefined);
      await handlers.messageReactionRemove({}, { bot: false }, {});
      expect(bot.handleReaction).toHaveBeenCalledWith({}, { bot: false }, 'remove');
      await startPromise;
    });

    it('messageReactionRemove skips bots', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      bot.handleReaction = jest.fn().mockResolvedValue(undefined);
      await handlers.messageReactionRemove({}, { bot: true }, {});
      expect(bot.handleReaction).not.toHaveBeenCalled();
      await startPromise;
    });

    it('error handler logs', async () => {
      const { startPromise, handlers } = await setupStartedBot();
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      handlers.error(new Error('net'));
      expect(err).toHaveBeenCalledWith('[DiscordBot] Error:', 'net');
      err.mockRestore();
      await startPromise;
    });

    it('cleanup interval removes expired typing records', async () => {
      const { startPromise } = await setupStartedBot();
      bot.typingUsers.set('u1', { expiresAt: Date.now() - 1000 });
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.advanceTimersByTime(60000);
      expect(bot.typingUsers.has('u1')).toBe(false);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Cleaned up 1 typing records'));
      log.mockRestore();
      await startPromise;
    });
  });

  describe('sendDM edge cases', () => {
    it('does nothing when user fetch returns null', async () => {
      bot.client = { users: { fetch: jest.fn().mockResolvedValue(null) } };
      await bot.sendDM('u', 'msg');
    });

    it('logs DM error on fetch failure', async () => {
      bot.client = { users: { fetch: jest.fn().mockRejectedValue(new Error('fail')) } };
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      await bot.sendDM('u', 'msg');
      expect(err).toHaveBeenCalledWith('[DiscordBot] DM error:', 'fail');
      err.mockRestore();
    });
  });

  describe('broadcast edge cases', () => {
    it('does nothing when channel fetch returns null', async () => {
      bot.client = { channels: { fetch: jest.fn().mockResolvedValue(null) } };
      await bot.broadcast('Hello!', 'ch');
    });

    it('logs broadcast error', async () => {
      bot.client = { channels: { fetch: jest.fn().mockRejectedValue(new Error('fail')) } };
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      await bot.broadcast('Hello!', 'ch');
      expect(err).toHaveBeenCalledWith('[DiscordBot] Broadcast error:', 'fail');
      err.mockRestore();
    });

    it('returns early when no client', async () => {
      bot.client = null;
      await bot.broadcast('Hello!', 'ch');
    });

    it('broadcasts to all guild system channels', async () => {
      const sysSend = jest.fn().mockResolvedValue();
      bot.client = {
        guilds: { cache: new Map([['g1', { systemChannel: { send: sysSend } }]]) }
      };
      await bot.broadcast('Hi all');
      expect(sysSend).toHaveBeenCalledWith('Hi all');
    });
  });

  describe('sendToChannel edge cases', () => {
    it('does nothing when channel missing', async () => {
      bot.client = { channels: { fetch: jest.fn().mockResolvedValue(null) } };
      await bot.sendToChannel('ch', 'text');
    });

    it('logs send error', async () => {
      bot.client = { channels: { fetch: jest.fn().mockRejectedValue(new Error('fail')) } };
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      await bot.sendToChannel('ch', 'text');
      expect(err).toHaveBeenCalledWith('[DiscordBot] Send error:', 'fail');
      err.mockRestore();
    });

    it('returns early when no client', async () => {
      bot.client = null;
      await bot.sendToChannel('ch', 'text');
    });
  });

  describe('notifyGameEvent edge cases', () => {
    beforeEach(() => { delete process.env.DISCORD_GAME_CHANNEL; });

    it('does nothing without game channel', () => {
      bot.sendToChannel = jest.fn();
      bot.notifyGameEvent('hurt', { health: 10 });
      expect(bot.sendToChannel).not.toHaveBeenCalled();
    });

    it('uses danger color for died events', () => {
      process.env.DISCORD_GAME_CHANNEL = 'ch';
      bot.sendToChannel = jest.fn();
      bot.notifyGameEvent('died', {});
      const embed = bot.sendToChannel.mock.calls[0][1];
      expect(embed.data.color).toBe(0xED4245);
    });

    it('uses success color for connected events', () => {
      process.env.DISCORD_GAME_CHANNEL = 'ch';
      bot.sendToChannel = jest.fn();
      bot.notifyGameEvent('connected', {});
      const embed = bot.sendToChannel.mock.calls[0][1];
      expect(embed.data.color).toBe(0x57F287);
    });
  });

  describe('handleCommand extended', () => {
    it('setglobal requires admin', async () => {
      await bot.handleCommand(mockMessage, 'setglobal', ['k', 'v']);
      expect(mockMessage.reply).toHaveBeenCalledWith('Hello!');
    });

    it('setglobal with admin and args', async () => {
      mockMessage.member = { permissions: { has: () => true } };
      await bot.handleCommand(mockMessage, 'setglobal', ['k', 'v']);
      expect(bot.agents.memory.remember).toHaveBeenCalledWith('discord_all_k', expect.any(Object));
      expect(mockMessage.reply).toHaveBeenCalledWith('✅ 已设置全局记忆: k');
    });

    it('setglobal with admin missing args', async () => {
      mockMessage.member = { permissions: { has: () => true } };
      await bot.handleCommand(mockMessage, 'setglobal', ['k']);
      expect(mockMessage.reply).toHaveBeenCalledWith('用法: !setglobal <key> <value>');
    });

    it('personality without pm configured', async () => {
      const b = new DiscordBot({ agents: {} });
      await b.handleCommand(mockMessage, 'personality', ['list']);
      expect(mockMessage.reply).toHaveBeenCalledWith('人格系统未配置');
    });

    it('personality switch fail', async () => {
      bot.agents.pm.setActive.mockReturnValue(false);
      await bot.handleCommand(mockMessage, 'personality', ['switch', 'nope']);
      expect(mockMessage.reply).toHaveBeenCalledWith('❌ 未找到人格: nope');
    });

    it('personality switch without name', async () => {
      await bot.handleCommand(mockMessage, 'personality', ['switch']);
      expect(mockMessage.reply).toHaveBeenCalledWith('用法: !personality switch <name>');
    });

    it('personality unknown subcommand', async () => {
      await bot.handleCommand(mockMessage, 'personality', ['bogus']);
      expect(mockMessage.reply).toHaveBeenCalledWith(expect.stringContaining('用法:'));
    });

    it('custom command execute error is caught', async () => {
      bot.registerCommand('bad', { execute: jest.fn().mockRejectedValue(new Error('x')) });
      const err = jest.spyOn(console, 'error').mockImplementation(() => {});
      await bot.handleCommand(mockMessage, 'bad', []);
      expect(mockMessage.reply).toHaveBeenCalledWith('执行命令时出错');
      err.mockRestore();
    });
  });

  describe('handleChat extended', () => {
    it('rejects whitespace-only input', async () => {
      await bot.handleChat(mockMessage, '   ');
      expect(mockMessage.reply).toHaveBeenCalledWith('输入无效');
    });

    it('memory remember path without guild', async () => {
      mockMessage.guild = null;
      await bot.handleChat(mockMessage, 'hi');
      expect(bot.agents.memory.remember).toHaveBeenCalled();
    });
  });

  describe('handleButton edge case', () => {
    it('ignores non-poll buttons', async () => {
      const interaction = { customId: 'other_1', reply: jest.fn() };
      await bot.handleButton(interaction);
      expect(interaction.reply).not.toHaveBeenCalled();
    });
  });

  describe('setupGameNotifications edge case', () => {
    it('handles undefined gameAgent', () => {
      expect(() => bot.setupGameNotifications(undefined)).not.toThrow();
    });
  });

  describe('getStatus connected', () => {
    it('reports connected when client ready', () => {
      bot.client = new (require('discord.js').Client)();
      bot.enabled = true;
      const status = bot.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.guilds).toBe(0);
      expect(status.commands).toBe(0);
    });
  });
});
