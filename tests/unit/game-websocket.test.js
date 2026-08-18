const EventEmitter = require('events');

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid'),
  randomBytes: jest.fn(() => Buffer.from([0])),
  timingSafeEqual: jest.fn((a, b) => a.equals(b)),
  createHash: jest.fn(() => ({ update: jest.fn(() => ({ digest: jest.fn(() => 'mock-hash') })) }))
}));

const GameWebSocket = require('../../src/game/GameWebSocket');

function makeMockSocket() {
  const socket = new EventEmitter();
  socket.writable = true;
  socket.write = jest.fn();
  socket.destroy = jest.fn();
  return socket;
}

function makeMockServer() {
  const server = new EventEmitter();
  return server;
}

function makeMockGameManager() {
  return {
    getStatus: jest.fn(() => ({
      connected: true,
      username: 'TestBot',
      health: 20,
      food: 20,
      position: { x: 10, y: 64, z: -5 },
      currentTask: 'mining'
    })),
    handleMessage: jest.fn(),
    game: {
      getStatus: jest.fn(() => ({
        username: 'GameBot',
        health: 18,
        food: 15,
        position: { x: 5, y: 64, z: 0 }
      }))
    },
    eventHandler: {
      getEventHistory: jest.fn(() => [
        { type: 'block_broken', block: 'stone', time: 1000 },
        { type: 'mob_killed', mob: 'zombie', time: 2000 }
      ])
    }
  };
}

function makeMockPersonalityManager() {
  return {
    getMood: jest.fn(() => 'happy')
  };
}

describe('GameWebSocket', () => {
  let server;
  let gameManager;
  let personalityManager;
  let ws;

  beforeEach(() => {
    jest.clearAllMocks();
    server = makeMockServer();
    gameManager = makeMockGameManager();
    personalityManager = makeMockPersonalityManager();
    delete process.env.API_KEY;
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    if (ws) {
      ws.destroy();
      ws = null;
    }
  });

  describe('constructor', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sets default properties', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.server).toBe(server);
      expect(ws.game).toBe(gameManager);
      expect(ws.pm).toBe(personalityManager);
      expect(ws.clients).toBeInstanceOf(Set);
      expect(ws.clients.size).toBe(0);
      expect(ws.broadcastInterval).not.toBeNull();
      expect(ws.reconnectAttempts).toBe(0);
      expect(ws.maxReconnectAttempts).toBe(5);
      expect(ws.apiKey).toBeNull();
      expect(ws.allowedOrigins).toEqual(['http://localhost:3000']);
      expect(ws.maxMessageSize).toBe(10240);
    });

    it('calls setup and startStatusBroadcast', () => {
      const setupSpy = jest.spyOn(GameWebSocket.prototype, 'setup');
      const broadcastSpy = jest.spyOn(GameWebSocket.prototype, 'startStatusBroadcast');
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(setupSpy).toHaveBeenCalled();
      expect(broadcastSpy).toHaveBeenCalled();
      setupSpy.mockRestore();
      broadcastSpy.mockRestore();
    });

    it('reads API_KEY and ALLOWED_ORIGINS from env', () => {
      process.env.API_KEY = 'test-key-123';
      process.env.ALLOWED_ORIGINS = 'http://app.com,https://game.com';
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.apiKey).toBe('test-key-123');
      expect(ws.allowedOrigins).toEqual(['http://app.com', 'https://game.com']);
    });
  });

  describe('validateAuth', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns true when no apiKey set and not production', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateAuth({ headers: {} })).toBe(true);
    });

    it('returns false when no apiKey set and in production', () => {
      process.env.NODE_ENV = 'production';
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateAuth({ headers: {} })).toBe(false);
    });

    it('validates x-api-key header', () => {
      process.env.API_KEY = 'secret-key';
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateAuth({ headers: { 'x-api-key': 'secret-key' } })).toBe(true);
    });

    it('validates authorization Bearer header', () => {
      process.env.API_KEY = 'bearer-key';
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateAuth({ headers: { authorization: 'Bearer bearer-key' } })).toBe(true);
    });

    it('validates api_key query parameter', () => {
      process.env.API_KEY = 'query-key';
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const req = { headers: {}, url: '/ws/game?api_key=query-key' };
      expect(ws.validateAuth(req)).toBe(true);
    });

    it('returns false for wrong api key', () => {
      process.env.API_KEY = 'real-key';
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateAuth({ headers: { 'x-api-key': 'wrong-key' } })).toBe(false);
    });

    it('returns false when no auth header present and key is set', () => {
      process.env.API_KEY = 'some-key';
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateAuth({ headers: {} })).toBe(false);
    });
  });

  describe('validateOrigin', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('accepts origin from allowed list', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateOrigin({ headers: { origin: 'http://localhost:3000' } })).toBe(true);
    });

    it('accepts referer starting with allowed origin', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateOrigin({ headers: { referer: 'http://localhost:3000/game' } })).toBe(true);
    });

    it('rejects unknown origin (returns undefined due to falsy fallback)', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateOrigin({ headers: { origin: 'http://evil.com' } })).toBeUndefined();
    });

    it('rejects when no origin or referer', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateOrigin({ headers: {} })).toBeUndefined();
    });
  });

  describe('validateMessage', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('accepts valid message object', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateMessage({ type: 'ping' })).toBe(true);
    });

    it('accepts message with command', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateMessage({ command: 'go forward' })).toBe(true);
    });

    it('rejects null', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateMessage(null)).toBe(false);
    });

    it('rejects non-object', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateMessage('string')).toBe(false);
    });

    it('rejects message with non-string type', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateMessage({ type: 123 })).toBe(false);
    });

    it('rejects message with non-string command', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateMessage({ command: 456 })).toBe(false);
    });

    it('rejects command exceeding max length', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateMessage({ command: 'x'.repeat(501) })).toBe(false);
    });
  });

  describe('setup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('registers upgrade handler', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(server.listenerCount('upgrade')).toBe(1);
    });

    it('rejects connection with invalid origin', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const socket = makeMockSocket();
      const req = { url: '/ws/game', headers: { origin: 'http://evil.com' } };
      server.emit('upgrade', req, socket, Buffer.alloc(0));
      expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 403 Forbidden\r\n\r\n');
      expect(socket.destroy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('rejects connection with invalid auth', () => {
      process.env.API_KEY = 'secret';
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const socket = makeMockSocket();
      const req = { url: '/ws/game', headers: { origin: 'http://localhost:3000', 'x-api-key': 'wrong' } };
      server.emit('upgrade', req, socket, Buffer.alloc(0));
      expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 401 Unauthorized\r\n\r\n');
      expect(socket.destroy).toHaveBeenCalled();
    });

    it('accepts valid connection via handleConnection', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const handledSpy = jest.spyOn(ws, 'handleConnection');
      const socket = makeMockSocket();
      const req = { url: '/ws/game', headers: { origin: 'http://localhost:3000' } };
      server.emit('upgrade', req, socket, Buffer.alloc(0));
      expect(handledSpy).toHaveBeenCalledWith(req, socket, Buffer.alloc(0));
      handledSpy.mockRestore();
    });

    it('ignores non-game upgrade requests', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const handledSpy = jest.spyOn(ws, 'handleConnection');
      const socket = makeMockSocket();
      const req = { url: '/other', headers: { origin: 'http://localhost:3000' } };
      server.emit('upgrade', req, socket, Buffer.alloc(0));
      expect(handledSpy).not.toHaveBeenCalled();
      handledSpy.mockRestore();
    });
  });

  describe('handleConnection', () => {
    let socket;
    let req;

    beforeEach(() => {
      jest.useFakeTimers();
      ws = new GameWebSocket(server, gameManager, personalityManager);
      socket = makeMockSocket();
      req = { url: '/ws/game', headers: { origin: 'http://localhost:3000' } };
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('writes 101 switching protocols', () => {
      ws.handleConnection(req, socket, Buffer.alloc(0));
      expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 101 Switching Protocols\r\n\r\n');
    });

    it('adds client to set', () => {
      ws.handleConnection(req, socket, Buffer.alloc(0));
      expect(ws.clients.size).toBe(1);
    });

    it('creates client with send method', () => {
      ws.handleConnection(req, socket, Buffer.alloc(0));
      const [client] = [...ws.clients];
      expect(client.id).toBeGreaterThan(0);
      expect(client.lastPing).toBeGreaterThan(0);
      expect(typeof client.send).toBe('function');
    });

    it('client.send writes JSON to socket', () => {
      ws.handleConnection(req, socket, Buffer.alloc(0));
      const [client] = [...ws.clients];
      client.send({ hello: 'world' });
      expect(socket.write).toHaveBeenCalledWith('{"hello":"world"}\n');
    });

    it('client.send does not write payload when socket not writable', () => {
      ws.handleConnection(req, socket, Buffer.alloc(0));
      socket.write.mockClear();
      socket.writable = false;
      const [client] = [...ws.clients];
      client.send({ hello: 'world' });
      expect(socket.write).not.toHaveBeenCalled();
    });

    it('sends connected message to client', () => {
      ws.handleConnection(req, socket, Buffer.alloc(0));
      const jsonCalls = socket.write.mock.calls.map((c) => c[0]);
      expect(jsonCalls.some((c) => c.includes('"type":"connected"'))).toBe(true);
    });

    it('broadcasts status on connect', () => {
      const broadcastSpy = jest.spyOn(ws, 'broadcastStatus');
      ws.handleConnection(req, socket, Buffer.alloc(0));
      expect(broadcastSpy).toHaveBeenCalled();
      broadcastSpy.mockRestore();
    });

    it('handles incoming data messages', () => {
      ws.handleConnection(req, socket, Buffer.alloc(0));
      const msgHandler = jest.spyOn(ws, 'handleMessage');
      socket.emit('data', Buffer.from(JSON.stringify({ type: 'ping' })));
      expect(msgHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(Number) }),
        { type: 'ping' }
      );
      msgHandler.mockRestore();
    });

    it('rejects oversized messages', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      ws.handleConnection(req, socket, Buffer.alloc(0));
      const msgHandler = jest.spyOn(ws, 'handleMessage');
      const big = Buffer.alloc(ws.maxMessageSize + 1);
      socket.emit('data', big);
      expect(msgHandler).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith('[WS] Message too large:', big.length);
      warnSpy.mockRestore();
      msgHandler.mockRestore();
    });

    it('handles JSON parse errors gracefully', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      ws.handleConnection(req, socket, Buffer.alloc(0));
      socket.emit('data', Buffer.from('not json'));
      expect(errSpy).toHaveBeenCalledWith('[WS] Parse error:', expect.any(String));
      errSpy.mockRestore();
    });

    it('removes client on socket end', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      ws.handleConnection(req, socket, Buffer.alloc(0));
      expect(ws.clients.size).toBe(1);
      socket.emit('end');
      expect(ws.clients.size).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Client disconnected'));
      logSpy.mockRestore();
    });

    it('removes client on socket error', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      ws.handleConnection(req, socket, Buffer.alloc(0));
      expect(ws.clients.size).toBe(1);
      socket.emit('error', new Error('socket crash'));
      expect(ws.clients.size).toBe(0);
      expect(errSpy).toHaveBeenCalledWith('[WS] Error:', 'socket crash');
      errSpy.mockRestore();
    });
  });

  describe('handleMessage', () => {
    let client;

    beforeEach(() => {
      jest.useFakeTimers();
      ws = new GameWebSocket(server, gameManager, personalityManager);
      client = { id: 1, socket: makeMockSocket(), send: jest.fn() };
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('handles ping type', () => {
      ws.handleMessage(client, { type: 'ping' });
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'pong' }));
    });

    it('handles game_status type', () => {
      ws.handleMessage(client, { type: 'game_status' });
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'game_status' }));
    });

    it('handles mood type with personality manager', () => {
      ws.handleMessage(client, { type: 'mood' });
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'mood', data: 'happy' }));
    });

    it('handles mood type without personality manager', () => {
      const wsNoPm = new GameWebSocket(server, gameManager, null);
      wsNoPm.handleMessage(client, { type: 'mood' });
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'mood', data: 'neutral' }));
      wsNoPm.destroy();
    });

    it('handles events type', () => {
      ws.handleMessage(client, { type: 'events' });
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'events' }));
    });

    it('handles events type when eventHandler is absent', () => {
      delete gameManager.eventHandler;
      ws = new GameWebSocket(server, gameManager, personalityManager);
      ws.handleMessage(client, { type: 'events' });
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'events', data: [] }));
    });

    it('handles game_command type', () => {
      const cmdSpy = jest.spyOn(ws, 'handleGameCommand');
      ws.handleMessage(client, { type: 'game_command', command: 'dig' });
      expect(cmdSpy).toHaveBeenCalledWith(client, 'dig');
      cmdSpy.mockRestore();
    });

    it('logs unknown message type', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      ws.handleMessage(client, { type: 'unknown_type' });
      expect(logSpy).toHaveBeenCalledWith('[WS] Unknown message type:', 'unknown_type');
      logSpy.mockRestore();
    });

    it('warns on invalid message structure', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      ws.handleMessage(client, null);
      expect(warnSpy).toHaveBeenCalledWith('[WS] Invalid message structure');
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
      warnSpy.mockRestore();
    });
  });

  describe('getGameStatus', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns disabled status when no game manager', () => {
      ws = new GameWebSocket(server, null, personalityManager);
      expect(ws.getGameStatus()).toEqual({ enabled: false, connected: false });
    });

    it('returns full status from game manager merging game and game.game', () => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const status = ws.getGameStatus();
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.bot).toEqual({
        username: 'GameBot',
        health: 18,
        food: 15,
        position: { x: 5, y: 64, z: 0 },
        isAlive: true
      });
      expect(status.task).toBe('mining');
      expect(status.recentEvents).toHaveLength(2);
    });

    it('uses game.getStatus fields when game.game.getStatus is absent', () => {
      delete gameManager.game;
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const status = ws.getGameStatus();
      expect(status.bot.username).toBe('TestBot');
      expect(status.bot.health).toBe(20);
    });

    it('falls back to defaults when status fields are empty', () => {
      gameManager.getStatus.mockReturnValue({});
      gameManager.game.getStatus.mockReturnValue({});
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const status = ws.getGameStatus();
      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(false);
      expect(status.bot.username).toBe('Bot');
      expect(status.bot.health).toBe(0);
      expect(status.bot.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(status.bot.isAlive).toBe(true);
      expect(status.task).toBeNull();
      expect(status.recentEvents).toHaveLength(2);
    });

    it('handles game without getStatus method', () => {
      delete gameManager.getStatus;
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const status = ws.getGameStatus();
      expect(status.enabled).toBe(true);
      expect(status.bot.username).toBe('GameBot');
    });

    it('returns empty recentEvents when eventHandler lacks getEventHistory', () => {
      gameManager.eventHandler = {};
      ws = new GameWebSocket(server, gameManager, personalityManager);
      const status = ws.getGameStatus();
      expect(status.recentEvents).toEqual([]);
    });
  });

  describe('handleGameCommand', () => {
    let client;

    beforeEach(() => {
      jest.useFakeTimers();
      ws = new GameWebSocket(server, gameManager, personalityManager);
      client = { id: 1, send: jest.fn() };
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sends error when no game manager', async () => {
      const wsNoGame = new GameWebSocket(server, null, personalityManager);
      await wsNoGame.handleGameCommand(client, 'dig');
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'Game not enabled' }));
      wsNoGame.destroy();
    });

    it('sends progress updates and result on success', async () => {
      gameManager.handleMessage.mockResolvedValue({ ok: true, data: 'done' });
      await ws.handleGameCommand(client, 'dig');
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'command_progress', progress: 10 }));
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'command_progress', progress: 50 }));
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'command_result', command: 'dig' }));
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'command_progress', progress: 100 }));
    });

    it('skips complete progress when result not ok', async () => {
      gameManager.handleMessage.mockResolvedValue({ ok: false });
      await ws.handleGameCommand(client, 'dig');
      const calls = client.send.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c.type === 'command_result')).toBe(true);
      expect(calls.some((c) => c.type === 'command_progress' && c.progress === 100)).toBe(false);
    });

    it('sends error message on exception', async () => {
      gameManager.handleMessage.mockRejectedValue(new Error('command failed'));
      await ws.handleGameCommand(client, 'dig');
      expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'command failed' }));
    });

    it('broadcasts status after command', async () => {
      const broadcastSpy = jest.spyOn(ws, 'broadcastStatus');
      gameManager.handleMessage.mockResolvedValue({ ok: true });
      await ws.handleGameCommand(client, 'dig');
      expect(broadcastSpy).toHaveBeenCalled();
      broadcastSpy.mockRestore();
    });
  });

  describe('sendToClient', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      ws = new GameWebSocket(server, gameManager, personalityManager);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls client.send with data', () => {
      const client = { send: jest.fn() };
      ws.sendToClient(client, { msg: 'hello' });
      expect(client.send).toHaveBeenCalledWith({ msg: 'hello' });
    });

    it('handles send error', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const client = { send: jest.fn(() => { throw new Error('send fail'); }) };
      ws.sendToClient(client, { msg: 'hello' });
      expect(errSpy).toHaveBeenCalledWith('[WS] Send error:', 'send fail');
      errSpy.mockRestore();
    });
  });

  describe('broadcast', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      ws = new GameWebSocket(server, gameManager, personalityManager);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sends data to all clients', () => {
      const c1 = { send: jest.fn() };
      const c2 = { send: jest.fn() };
      ws.clients.add(c1);
      ws.clients.add(c2);
      ws.broadcast({ msg: 'hello' });
      expect(c1.send).toHaveBeenCalledWith({ msg: 'hello' });
      expect(c2.send).toHaveBeenCalledWith({ msg: 'hello' });
    });

    it('removes clients whose send throws', () => {
      const c1 = { send: jest.fn() };
      const c2 = { send: jest.fn(() => { throw new Error('gone'); }) };
      const c3 = { send: jest.fn() };
      ws.clients.add(c1);
      ws.clients.add(c2);
      ws.clients.add(c3);
      ws.broadcast({ msg: 'hello' });
      expect(ws.clients.has(c2)).toBe(false);
      expect(ws.clients.has(c1)).toBe(true);
      expect(ws.clients.has(c3)).toBe(true);
    });
  });

  describe('broadcast helpers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      ws = new GameWebSocket(server, gameManager, personalityManager);
      ws.clients.add({ send: jest.fn() });
      ws.clients.add({ send: jest.fn() });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('broadcastMoodChange', () => {
      const broadcastSpy = jest.spyOn(ws, 'broadcast');
      ws.broadcastMoodChange('sad');
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mood_change', mood: 'sad' }));
      broadcastSpy.mockRestore();
    });

    it('broadcastGameEvent', () => {
      const broadcastSpy = jest.spyOn(ws, 'broadcast');
      const event = { type: 'explosion' };
      ws.broadcastGameEvent(event);
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'game_event', event }));
      broadcastSpy.mockRestore();
    });

    it('broadcastStatus', () => {
      const broadcastSpy = jest.spyOn(ws, 'broadcast');
      ws.broadcastStatus();
      expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'status_update' }));
      broadcastSpy.mockRestore();
    });

    it('broadcastChat', () => {
      const broadcastSpy = jest.spyOn(ws, 'broadcast');
      ws.broadcastChat('hello', 'Player1');
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'chat', message: 'hello', sender: 'Player1' })
      );
      broadcastSpy.mockRestore();
    });

    it('broadcastProgress', () => {
      const broadcastSpy = jest.spyOn(ws, 'broadcast');
      ws.broadcastProgress('loading', 50);
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'command_progress', message: 'loading', progress: 50 })
      );
      broadcastSpy.mockRestore();
    });
  });

  describe('getClientCount', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      ws = new GameWebSocket(server, gameManager, personalityManager);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns 0 when no clients', () => {
      expect(ws.getClientCount()).toBe(0);
    });

    it('returns number of clients', () => {
      ws.clients.add({ id: 1 });
      ws.clients.add({ id: 2 });
      expect(ws.getClientCount()).toBe(2);
    });
  });

  describe('status broadcast interval', () => {
    beforeEach(() => {
      ws = new GameWebSocket(server, gameManager, personalityManager);
    });

    it('sets an interval during construction', () => {
      expect(ws.broadcastInterval).not.toBeNull();
    });

    it('does not broadcast when no clients (no crash)', () => {
      expect(() => ws.broadcastStatus()).not.toThrow();
    });

    it('startStatusBroadcast creates a new interval replacing the old one', () => {
      const prev = ws.broadcastInterval;
      ws.startStatusBroadcast();
      expect(ws.broadcastInterval).not.toBeNull();
      expect(ws.broadcastInterval).not.toBe(prev);
    });

    it('broadcasts status when clients exist', () => {
      jest.useFakeTimers();
      const spy = jest.spyOn(ws, 'broadcastStatus').mockImplementation(() => {});
      ws.clients.add({ id: 1, socket: {} });
      ws.startStatusBroadcast();
      jest.advanceTimersByTime(2000);
      expect(spy).toHaveBeenCalled();
      jest.useRealTimers();
      ws.stopStatusBroadcast();
    });

    it('does not broadcast status when no clients', () => {
      jest.useFakeTimers();
      const spy = jest.spyOn(ws, 'broadcastStatus').mockImplementation(() => {});
      ws.clients.clear();
      ws.startStatusBroadcast();
      jest.advanceTimersByTime(2000);
      expect(spy).not.toHaveBeenCalled();
      jest.useRealTimers();
      ws.stopStatusBroadcast();
    });

    it('stopStatusBroadcast clears the interval', () => {
      ws.stopStatusBroadcast();
      expect(ws.broadcastInterval).toBeNull();
    });
  });

  describe('stopStatusBroadcast', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      ws = new GameWebSocket(server, gameManager, personalityManager);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('clears the broadcast interval', () => {
      expect(ws.broadcastInterval).not.toBeNull();
      ws.stopStatusBroadcast();
      expect(ws.broadcastInterval).toBeNull();
    });

    it('does nothing if no interval', () => {
      ws.broadcastInterval = null;
      expect(() => ws.stopStatusBroadcast()).not.toThrow();
    });
  });

  describe('destroy', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      ws = new GameWebSocket(server, gameManager, personalityManager);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('stops broadcast, destroys sockets, clears clients', () => {
      const stopSpy = jest.spyOn(ws, 'stopStatusBroadcast');
      const socket1 = makeMockSocket();
      const socket2 = makeMockSocket();
      ws.clients.add({ socket: socket1 });
      ws.clients.add({ socket: socket2 });
      ws.destroy();
      expect(stopSpy).toHaveBeenCalled();
      expect(socket1.destroy).toHaveBeenCalled();
      expect(socket2.destroy).toHaveBeenCalled();
      expect(ws.clients.size).toBe(0);
      stopSpy.mockRestore();
    });
  });

  describe('timingSafeEqual (via validateAuth)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns false for non-string auth argument', () => {
      process.env.API_KEY = 'key';
      ws = new GameWebSocket(server, gameManager, personalityManager);
      expect(ws.validateAuth({ headers: { 'x-api-key': 123 } })).toBe(false);
    });
  });
});
