describe('src/agent/PlatformBridge', () => {
  let PlatformBridge;
  let bridge;
  let onMessage;
  let onError;

  beforeEach(() => {
    PlatformBridge = require('../../src/agent/PlatformBridge').PlatformBridge;
    onMessage = jest.fn();
    onError = jest.fn();
    bridge = new PlatformBridge({ onMessage, onError });
  });

  describe('constructor', () => {
    test('initializes empty state', () => {
      expect(bridge.platforms.size).toBe(0);
      expect(bridge.messageQueue).toEqual([]);
      expect(bridge.maxQueueSize).toBe(1000);
    });

    test('uses custom maxQueueSize', () => {
      const b = new PlatformBridge({ maxQueueSize: 5 });
      expect(b.maxQueueSize).toBe(5);
    });

    test('defaults onError to console.error', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const b = new PlatformBridge();
      b.onError(new Error('boom'));
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('registerPlatform', () => {
    test('registers platform with disconnected defaults', () => {
      const p = bridge.registerPlatform('slack1', { name: 'S', type: 'slack', token: 'x' });
      expect(p.id).toBe('slack1');
      expect(p.name).toBe('S');
      expect(p.type).toBe('slack');
      expect(p.status).toBe('disconnected');
      expect(p.stats).toEqual({ messagesSent: 0, messagesReceived: 0, errors: 0 });
      expect(p.connectedAt).toBeNull();
      expect(bridge.getPlatform('slack1')).toBe(p);
    });
  });

  describe('connect', () => {
    test('throws when platform not found', async () => {
      await expect(bridge.connect('nope')).rejects.toThrow('Platform not found');
    });

    test('connects slack when token present', async () => {
      bridge.registerPlatform('slack1', { name: 'S', type: 'slack', token: 'x', workspace: 'ws' });
      const res = await bridge.connect('slack1');
      expect(res).toEqual({ success: true, platform: 'slack1' });
      expect(bridge.getPlatform('slack1').status).toBe('connected');
      expect(bridge.getPlatform('slack1').connectedAt).not.toBeNull();
    });

    test('connects discord when token present', async () => {
      bridge.registerPlatform('d1', { name: 'D', type: 'discord', token: 'x', guild: 'g' });
      const res = await bridge.connect('d1');
      expect(res.success).toBe(true);
    });

    test('connects wechat_work when corpId and agentId present', async () => {
      bridge.registerPlatform('w1', { name: 'W', type: 'wechat_work', corpId: 'c', agentId: 'a' });
      const res = await bridge.connect('w1');
      expect(res.success).toBe(true);
    });

    test('connects telegram when token present', async () => {
      bridge.registerPlatform('t1', { name: 'T', type: 'telegram', token: 'x' });
      const res = await bridge.connect('t1');
      expect(res.success).toBe(true);
    });

    test('rejects unsupported platform type', async () => {
      bridge.registerPlatform('u1', { name: 'U', type: 'matrix' });
      const res = await bridge.connect('u1');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unsupported platform');
    });

    test('handles slack missing token', async () => {
      bridge.registerPlatform('slack1', { name: 'S', type: 'slack' });
      const res = await bridge.connect('slack1');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Slack token required');
      expect(bridge.getPlatform('slack1').status).toBe('error');
      expect(bridge.getPlatform('slack1').stats.errors).toBe(1);
      expect(onError).toHaveBeenCalled();
    });

    test('handles discord missing token', async () => {
      bridge.registerPlatform('d1', { name: 'D', type: 'discord' });
      const res = await bridge.connect('d1');
      expect(res.error).toBe('Discord token required');
    });

    test('handles telegram missing token', async () => {
      bridge.registerPlatform('t1', { name: 'T', type: 'telegram' });
      const res = await bridge.connect('t1');
      expect(res.error).toBe('Telegram token required');
    });

    test('handles wechat_work missing corpId/agentId', async () => {
      bridge.registerPlatform('w1', { name: 'W', type: 'wechat_work', corpId: 'c' });
      const res = await bridge.connect('w1');
      expect(res.error).toBe('WeChat Work corpId and agentId required');
    });
  });

  describe('disconnect', () => {
    test('returns false for unknown platform', async () => {
      await expect(bridge.disconnect('nope')).resolves.toBe(false);
    });

    test('resets connected platform to disconnected', async () => {
      bridge.registerPlatform('slack1', { name: 'S', type: 'slack', token: 'x' });
      await bridge.connect('slack1');
      await expect(bridge.disconnect('slack1')).resolves.toBe(true);
      const p = bridge.getPlatform('slack1');
      expect(p.status).toBe('disconnected');
      expect(p.connectedAt).toBeNull();
    });
  });

  describe('send', () => {
    async function connectedSlack(id = 'slack1') {
      bridge.registerPlatform(id, { name: 'S', type: 'slack', token: 'x', workspace: 'ws' });
      await bridge.connect(id);
    }

    test('throws when platform not found', async () => {
      await expect(bridge.send('nope', { content: 'hi' })).rejects.toThrow('Platform not found');
    });

    test('throws when platform not connected', async () => {
      bridge.registerPlatform('slack1', { name: 'S', type: 'slack', token: 'x' });
      await expect(bridge.send('slack1', { content: 'hi' })).rejects.toThrow('Platform not connected');
    });

    test('sends text message to slack', async () => {
      await connectedSlack();
      const res = await bridge.send('slack1', { content: 'hello', channel: 'C1' });
      expect(res.success).toBe(true);
      expect(res.messageId).toMatch(/^msg_/);
      expect(res.result.platform).toBe('slack');
      expect(bridge.getPlatform('slack1').stats.messagesSent).toBe(1);
    });

    test('sends message with attachments to discord', async () => {
      bridge.registerPlatform('d1', { name: 'D', type: 'discord', token: 'x', guild: 'g' });
      await bridge.connect('d1');
      const res = await bridge.send('d1', { content: 'hi', attachments: [{ url: 'http://x' }] });
      expect(res.success).toBe(true);
      expect(res.result.platform).toBe('discord');
      expect(res.result.id).toBe(res.messageId);
    });

    test('sends message to wechat_work', async () => {
      bridge.registerPlatform('w1', { name: 'W', type: 'wechat_work', corpId: 'c', agentId: 'a' });
      await bridge.connect('w1');
      const res = await bridge.send('w1', { content: 'hi' });
      expect(res.result.platform).toBe('wechat_work');
      expect(res.result.msgid).toBe(res.messageId);
    });

    test('sends message to telegram', async () => {
      bridge.registerPlatform('t1', { name: 'T', type: 'telegram', token: 'x' });
      await bridge.connect('t1');
      const res = await bridge.send('t1', { content: 'hi' });
      expect(res.result.platform).toBe('telegram');
      expect(res.result.message_id).toEqual(expect.any(Number));
    });

    test('handles unsupported platform on send', async () => {
      bridge.registerPlatform('u1', { name: 'U', type: 'matrix' });
      bridge.getPlatform('u1').status = 'connected';
      const res = await bridge.send('u1', { content: 'hi' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unsupported platform');
      expect(bridge.getPlatform('u1').stats.errors).toBe(1);
      expect(onError).toHaveBeenCalled();
    });

    test('trims messageQueue to maxQueueSize', async () => {
      const b = new PlatformBridge({ onMessage, onError, maxQueueSize: 2 });
      b.registerPlatform('slack1', { name: 'S', type: 'slack', token: 'x' });
      await b.connect('slack1');
      for (let i = 0; i < 5; i++) {
        await b.send('slack1', { content: `m${i}` });
      }
      expect(b.messageQueue.length).toBe(2);
      expect(b.getMessageHistory()).toHaveLength(2);
    });
  });

  describe('broadcast', () => {
    test('only sends to connected platforms, respecting exclusions', async () => {
      bridge.registerPlatform('a', { name: 'A', type: 'slack', token: 'x' });
      bridge.registerPlatform('b', { name: 'B', type: 'discord', token: 'x', guild: 'g' });
      bridge.registerPlatform('c', { name: 'C', type: 'telegram', token: 'x' });
      await bridge.connect('a');
      await bridge.connect('c');

      const results = await bridge.broadcast({ content: 'all' }, ['c']);
      expect(results).toHaveLength(1);
      expect(results[0].platformId).toBe('a');
      expect(results[0].success).toBe(true);
    });

    test('returns empty when nothing connected', async () => {
      const results = await bridge.broadcast({ content: 'hi' });
      expect(results).toEqual([]);
    });
  });

  describe('handleIncoming', () => {
    test('returns null for unknown platform', () => {
      expect(bridge.handleIncoming('nope', {})).toBeNull();
    });

    test('normalizes slack message', () => {
      bridge.registerPlatform('s1', { name: 'S', type: 'slack' });
      const msg = bridge.handleIncoming('s1', { text: 'hi', from: 'u1', channel: 'C1', thread_ts: '1.2' });
      expect(msg.type).toBe('message');
      expect(msg.threadTs).toBe('1.2');
      expect(msg.content).toBe('hi');
      expect(msg.from).toBe('u1');
      expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ platform: 's1', content: 'hi' }));
      expect(bridge.getPlatform('s1').stats.messagesReceived).toBe(1);
    });

    test('normalizes discord message', () => {
      bridge.registerPlatform('d1', { name: 'D', type: 'discord' });
      const msg = bridge.handleIncoming('d1', { message: 'hey', guild_id: 'g1', type: 'MESSAGE_CREATE' });
      expect(msg.type).toBe('MESSAGE_CREATE');
      expect(msg.guild).toBe('g1');
      expect(msg.content).toBe('hey');
    });

    test('normalizes discord message without type', () => {
      bridge.registerPlatform('d1', { name: 'D', type: 'discord' });
      const msg = bridge.handleIncoming('d1', { message: 'hey' });
      expect(msg.type).toBe('DEFAULT');
    });

    test('normalizes wechat_work message', () => {
      bridge.registerPlatform('w1', { name: 'W', type: 'wechat_work' });
      const msg = bridge.handleIncoming('w1', { MsgType: 'text', ToUserName: 'corp' });
      expect(msg.type).toBe('text');
      expect(msg.toUser).toBe('corp');
    });

    test('normalizes wechat_work message without MsgType', () => {
      bridge.registerPlatform('w1', { name: 'W', type: 'wechat_work' });
      const msg = bridge.handleIncoming('w1', { text: 'hi' });
      expect(msg.type).toBe('text');
      expect(msg.content).toBe('hi');
    });

    test('normalizes telegram message', () => {
      bridge.registerPlatform('t1', { name: 'T', type: 'telegram' });
      const msg = bridge.handleIncoming('t1', { text: 'hi', chat: { type: 'group', id: 42 } });
      expect(msg.type).toBe('group');
      expect(msg.chatId).toBe(42);
      expect(msg.content).toBe('hi');
    });

    test('normalizes telegram message without chat type or id', () => {
      bridge.registerPlatform('t1', { name: 'T', type: 'telegram' });
      const msg = bridge.handleIncoming('t1', { text: 'hi', chat: {} });
      expect(msg.type).toBe('private');
      expect(msg.chatId).toBeUndefined();
    });

    test('falls back to base shape for unknown platform', () => {
      bridge.registerPlatform('u1', { name: 'U', type: 'matrix' });
      const msg = bridge.handleIncoming('u1', { content: 'hi' });
      expect(msg.content).toBe('hi');
      expect(msg.from).toBe('unknown');
      expect(msg.channel).toBe('');
      expect(msg).not.toHaveProperty('type');
      expect(msg).not.toHaveProperty('threadTs');
      expect(msg).not.toHaveProperty('guild');
    });

    test('applies default id/from/content/channel', () => {
      bridge.registerPlatform('u1', { name: 'U', type: 'matrix' });
      const msg = bridge.handleIncoming('u1', {});
      expect(msg.from).toBe('unknown');
      expect(msg.content).toBe('');
      expect(msg.id).toMatch(/^recv_/);
      expect(msg.timestamp).toEqual(expect.any(Number));
    });
  });

  describe('queries', () => {
    test('getAllPlatforms returns all', () => {
      bridge.registerPlatform('a', { name: 'A', type: 'slack', token: 'x' });
      bridge.registerPlatform('b', { name: 'B', type: 'telegram', token: 'x' });
      expect(bridge.getAllPlatforms()).toHaveLength(2);
    });

    test('getConnectedPlatforms filters by status', async () => {
      bridge.registerPlatform('a', { name: 'A', type: 'slack', token: 'x' });
      bridge.registerPlatform('b', { name: 'B', type: 'telegram', token: 'x' });
      await bridge.connect('a');
      const connected = bridge.getConnectedPlatforms();
      expect(connected).toHaveLength(1);
      expect(connected[0].id).toBe('a');
    });

    test('getMessageHistory respects limit', async () => {
      const b = new PlatformBridge({ onMessage, onError });
      b.registerPlatform('a', { name: 'A', type: 'slack', token: 'x' });
      await b.connect('a');
      for (let i = 0; i < 5; i++) await b.send('a', { content: `m${i}` });
      expect(b.getMessageHistory(3)).toHaveLength(3);
      expect(b.getMessageHistory()).toHaveLength(5);
    });
  });

  describe('getStats', () => {
    test('aggregates platform and message counts', async () => {
      bridge.registerPlatform('a', { name: 'A', type: 'slack', token: 'x' });
      bridge.registerPlatform('b', { name: 'B', type: 'telegram', token: 'x' });
      bridge.registerPlatform('bad', { name: 'B', type: 'matrix' });
      await bridge.connect('a');
      await bridge.connect('bad');
      await bridge.send('a', { content: 'hi' });
      bridge.handleIncoming('a', { text: 'in' });

      const stats = bridge.getStats();
      expect(stats.platforms).toEqual({ total: 3, connected: 1, disconnected: 1, error: 1 });
      expect(stats.messages.sent).toBe(1);
      expect(stats.messages.received).toBe(1);
      expect(stats.messages.total).toBe(2);
      expect(stats.messages.errors).toBe(1);
    });
  });

  describe('destroy', () => {
    test('disconnects, clears platforms and queue', async () => {
      bridge.registerPlatform('a', { name: 'A', type: 'slack', token: 'x' });
      await bridge.connect('a');
      await bridge.send('a', { content: 'hi' });
      bridge.destroy();
      expect(bridge.platforms.size).toBe(0);
      expect(bridge.messageQueue).toEqual([]);
    });
  });
});
