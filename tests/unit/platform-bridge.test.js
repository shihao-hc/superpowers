const { PlatformBridge, SlackAdapter, DiscordAdapter, WeChatAdapter } = require('../../src/integration/PlatformBridge');
const { EventEmitter } = require('events');

describe('PlatformBridge', () => {
  let bridge;

  beforeEach(() => {
    bridge = new PlatformBridge();
  });

  test('constructor sets empty collections', () => {
    expect(bridge.platforms).toBeDefined();
    expect(bridge.adapters.size).toBe(0);
    expect(bridge.middleware).toEqual([]);
  });

  test('register stores adapter and wires events', () => {
    const adapter = new EventEmitter();
    adapter.send = jest.fn();
    adapter.on = jest.fn();

    bridge.register('slack', adapter);
    expect(bridge.adapters.get('slack')).toBe(adapter);
    expect(adapter.on).toHaveBeenCalledWith('message', expect.any(Function));
    expect(adapter.on).toHaveBeenCalledWith('event', expect.any(Function));
  });

  test('register returns this for chaining', () => {
    const adapter = new EventEmitter();
    adapter.send = jest.fn();
    adapter.on = jest.fn();

    const result = bridge.register('slack', adapter);
    expect(result).toBe(bridge);
  });

  test('send throws for unknown platform', async () => {
    await expect(bridge.send('unknown', 'target', 'msg')).rejects.toThrow('Platform unknown not registered');
  });

  test('send calls adapter.send', async () => {
    const adapter = new EventEmitter();
    adapter.send = jest.fn().mockResolvedValue({ success: true });
    adapter.on = jest.fn();
    bridge.register('slack', adapter);

    const result = await bridge.send('slack', 'general', 'hello');
    expect(adapter.send).toHaveBeenCalledWith('general', 'hello');
    expect(result).toEqual({ success: true });
  });

  test('send applies outgoing middleware', async () => {
    const adapter = new EventEmitter();
    adapter.send = jest.fn().mockResolvedValue({ success: true });
    adapter.on = jest.fn();
    bridge.register('slack', adapter);

    bridge.use({
      outgoing: async (platform, target, msg) => `modified:${msg}`
    });

    await bridge.send('slack', 'general', 'hello');
    expect(adapter.send).toHaveBeenCalledWith('general', 'modified:hello');
  });

  test('broadcast sends to all platforms', async () => {
    const adapter1 = new EventEmitter();
    adapter1.send = jest.fn().mockResolvedValue({ success: true });
    adapter1.on = jest.fn();
    bridge.register('slack', adapter1);

    const adapter2 = new EventEmitter();
    adapter2.send = jest.fn().mockResolvedValue({ success: true });
    adapter2.on = jest.fn();
    bridge.register('discord', adapter2);

    const results = await bridge.broadcast('hello all');
    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  test('broadcast handles failures gracefully', async () => {
    const adapter = new EventEmitter();
    adapter.send = jest.fn().mockRejectedValue(new Error('offline'));
    adapter.on = jest.fn();
    bridge.register('slack', adapter);

    const results = await bridge.broadcast('test');
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('offline');
  });

  test('send skips middleware without outgoing', async () => {
    const adapter = new EventEmitter();
    adapter.send = jest.fn().mockResolvedValue({ success: true });
    adapter.on = jest.fn();
    bridge.register('slack', adapter);

    bridge.use({ incoming: async () => {} });

    await bridge.send('slack', 'general', 'hello');
    expect(adapter.send).toHaveBeenCalledWith('general', 'hello');
  });

  test('handleIncoming processes message through middleware', async () => {
    bridge.use({
      incoming: async (platform, msg) => ({ ...msg, processed: true })
    });

    const spy = jest.fn();
    bridge.on('message', spy);

    const result = await bridge.handleIncoming('slack', { text: 'hi' });
    expect(result.processed).toBe(true);
    expect(result.platform).toBe('slack');
    expect(spy).toHaveBeenCalledWith(result);
  });

  test('handleIncoming skips middleware without incoming', async () => {
    bridge.use({ outgoing: async () => {} });

    const spy = jest.fn();
    bridge.on('message', spy);

    const result = await bridge.handleIncoming('discord', { text: 'hello' });
    expect(result.platform).toBe('discord');
    expect(spy).toHaveBeenCalledWith(result);
  });

  test('use adds middleware and returns this', () => {
    const mw = { incoming: async () => {} };
    const result = bridge.use(mw);
    expect(bridge.middleware).toContain(mw);
    expect(result).toBe(bridge);
  });

  test('disconnect calls disconnect on all adapters', async () => {
    const adapter = new EventEmitter();
    adapter.disconnect = jest.fn();
    adapter.on = jest.fn();
    bridge.register('slack', adapter);

    await bridge.disconnect();
    expect(adapter.disconnect).toHaveBeenCalled();
  });

  test('disconnect handles adapter without disconnect', async () => {
    const adapter = new EventEmitter();
    adapter.on = jest.fn();
    bridge.register('slack', adapter);

    await expect(bridge.disconnect()).resolves.not.toThrow();
  });

  test('handleIncoming emits platform event through adapter event wiring', () => {
    const adapter = new EventEmitter();
    adapter.send = jest.fn();
    bridge.register('slack', adapter);
    // Simulate the adapter emitting a 'message' event
    const spy = jest.fn();
    bridge.on('message', spy);
    // The adapter.on('message') calls bridge.handleIncoming
    // We can test handleIncoming directly
    bridge.handleIncoming('slack', { text: 'test' });
    expect(spy).toHaveBeenCalled();
  });
});

describe('SlackAdapter', () => {
  test('constructor sets options', () => {
    const adapter = new SlackAdapter({ botToken: 'xoxb-test' });
    expect(adapter.options.botToken).toBe('xoxb-test');
    expect(adapter.webClient).toBeNull();
  });

  test('connect initializes webClient', () => {
    const adapter = new SlackAdapter({ botToken: 'xoxb-test' });
    adapter.connect();
    expect(adapter.webClient).toEqual({ token: 'xoxb-test' });
  });

  test('send returns success', async () => {
    const adapter = new SlackAdapter();
    const result = await adapter.send('general', 'hello');
    expect(result.success).toBe(true);
    expect(result.target).toBe('general');
  });

  test('disconnect clears webClient', () => {
    const adapter = new SlackAdapter();
    adapter.connect();
    adapter.disconnect();
    expect(adapter.webClient).toBeNull();
  });
});

describe('DiscordAdapter', () => {
  test('constructor sets client to null', () => {
    const adapter = new DiscordAdapter();
    expect(adapter.client).toBeNull();
  });

  test('connect emits connected', () => {
    const adapter = new DiscordAdapter();
    const spy = jest.fn();
    adapter.on('connected', spy);
    adapter.connect();
    expect(spy).toHaveBeenCalled();
  });

  test('send returns success', async () => {
    const adapter = new DiscordAdapter();
    const result = await adapter.send('channel', 'hello');
    expect(result.success).toBe(true);
  });

  test('disconnect calls client.destroy if set', () => {
    const adapter = new DiscordAdapter();
    adapter.client = { destroy: jest.fn() };
    adapter.disconnect();
    expect(adapter.client.destroy).toHaveBeenCalled();
  });

  test('disconnect handles null client', () => {
    const adapter = new DiscordAdapter();
    expect(() => adapter.disconnect()).not.toThrow();
  });
});

describe('WeChatAdapter', () => {
  test('constructor works without options', () => {
    const adapter = new WeChatAdapter();
    expect(adapter.corpId).toBeUndefined();
    expect(adapter.accessToken).toBeNull();
  });

  test('constructor sets options', () => {
    const adapter = new WeChatAdapter({ corpId: 'id1', corpSecret: 'secret', agentId: 'agent1' });
    expect(adapter.corpId).toBe('id1');
    expect(adapter.corpSecret).toBe('secret');
    expect(adapter.agentId).toBe('agent1');
    expect(adapter.accessToken).toBeNull();
  });

  test('connect sets accessToken', async () => {
    const adapter = new WeChatAdapter({});
    await adapter.connect();
    expect(adapter.accessToken).toBe('mock_access_token');
  });

  test('send auto-connects if no accessToken', async () => {
    const adapter = new WeChatAdapter({});
    const result = await adapter.send('user', 'hello');
    expect(adapter.accessToken).toBe('mock_access_token');
    expect(result.success).toBe(true);
  });

  test('send uses existing accessToken', async () => {
    const adapter = new WeChatAdapter({});
    adapter.accessToken = 'existing_token';
    const result = await adapter.send('user', 'hello');
    expect(adapter.accessToken).toBe('existing_token');
    expect(result.success).toBe(true);
  });

  test('disconnect clears accessToken', () => {
    const adapter = new WeChatAdapter({});
    adapter.accessToken = 'token';
    adapter.disconnect();
    expect(adapter.accessToken).toBeNull();
  });

  test('getAccessToken returns mock token', async () => {
    const adapter = new WeChatAdapter({});
    const token = await adapter.getAccessToken();
    expect(token).toBe('mock_access_token');
  });
});
