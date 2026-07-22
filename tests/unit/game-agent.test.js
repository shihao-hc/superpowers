let mockBot;

const mockMineflayer = {
  createBot: jest.fn()
};

jest.mock('mineflayer', () => mockMineflayer, { virtual: true });

jest.mock('pathfinding', () => ({
  GoalNear: class GoalNear {
    constructor(x, y, z, range) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.range = range;
    }
  }
}), { virtual: true });

function makeMockBot() {
  const bot = {
    once: jest.fn(),
    on: jest.fn(),
    quit: jest.fn(),
    chat: jest.fn(),
    whisper: jest.fn(),
    health: 20,
    food: 20,
    entity: {
      position: { x: 0, y: 64, z: 0 }
    },
    pathfinder: {
      setGoal: jest.fn()
    }
  };
  return bot;
}

const GameAgent = require('../../src/agents/GameAgent');

describe('GameAgent', () => {
  let agent;

  function flushMicrotasks() {
    return new Promise((r) => setImmediate(r));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockBot = makeMockBot();
    mockMineflayer.createBot.mockReturnValue(mockBot);
    process.env.ENABLE_GAME = 'true';
    delete process.env.MINECRAFT_SERVER_HOST;
    delete process.env.MINECRAFT_SERVER_PORT;
    delete process.env.MINECRAFT_BOT_NAME;
    delete process.env.MINECRAFT_VERSION;
  });

  afterEach(() => {
    if (agent) {
      if (agent.reconnectTimer) {
        clearTimeout(agent.reconnectTimer);
        agent.reconnectTimer = null;
      }
      agent.connected = true;
    }
  });

  describe('constructor', () => {
    it('sets default values', () => {
      const a = new GameAgent();
      expect(a.bot).toBeNull();
      expect(a.host).toBe('localhost');
      expect(a.port).toBe(25565);
      expect(a.username).toBe('AI_Bot');
      expect(a.version).toBe('1.20.4');
      expect(a.connected).toBe(false);
      expect(a.events).toEqual({});
      expect(a.taskQueue).toEqual([]);
      expect(a.isExecutingTask).toBe(false);
      expect(a.reconnectAttempts).toBe(0);
      expect(a.reconnectTimer).toBeNull();
      expect(a.autoReconnect).toBe(true);
    });

    it('accepts custom options', () => {
      const a = new GameAgent({
        host: 'myserver.com',
        port: 12345,
        username: 'MyBot',
        version: '1.21',
        autoReconnect: false
      });
      expect(a.host).toBe('myserver.com');
      expect(a.port).toBe(12345);
      expect(a.username).toBe('MyBot');
      expect(a.version).toBe('1.21');
      expect(a.autoReconnect).toBe(false);
    });

    it('reads from environment variables', () => {
      process.env.MINECRAFT_SERVER_HOST = 'env-host';
      process.env.MINECRAFT_SERVER_PORT = '12345';
      process.env.MINECRAFT_BOT_NAME = 'EnvBot';
      process.env.MINECRAFT_VERSION = '1.21';
      const a = new GameAgent();
      expect(a.host).toBe('env-host');
      expect(a.port).toBe(12345);
      expect(a.username).toBe('EnvBot');
      expect(a.version).toBe('1.21');
    });

    it('disables agent when ENABLE_GAME is not true', () => {
      process.env.ENABLE_GAME = 'false';
      const a = new GameAgent();
      expect(a.enabled).toBe(false);
    });

    it('handles mineflayer not available', () => {
      const _mineflayer = require('mineflayer');
      const a = new GameAgent();
      expect(a.enabled).toBe(true);
    });
  });

  describe('onDisconnect', () => {
    it('registers disconnect callback', () => {
      const cb = jest.fn();
      agent = new GameAgent();
      agent.onDisconnect(cb);
      expect(agent._onDisconnectCallback).toBe(cb);
    });
  });

  describe('connect', () => {
    beforeEach(() => {
      agent = new GameAgent();
    });

    it('throws if not enabled', async () => {
      agent.enabled = false;
      await expect(agent.connect()).rejects.toThrow('Mineflayer not available');
    });

    it('calls disconnect if bot already exists', async () => {
      const quitFn = jest.fn();
      agent.bot = { quit: quitFn };
      agent.connected = true;
      const connectPromise = agent.connect();
      await flushMicrotasks();
      const spawnCallback = mockBot.once.mock.calls.find(c => c[0] === 'spawn')[1];
      spawnCallback();
      const result = await connectPromise;
      expect(result).toBe(true);
      expect(quitFn).toHaveBeenCalled();
    });

    it('creates bot and resolves on spawn', async () => {
      const connectPromise = agent.connect();
      const spawnCallback = mockBot.once.mock.calls.find(c => c[0] === 'spawn')[1];
      spawnCallback();
      const result = await connectPromise;
      expect(result).toBe(true);
      expect(agent.connected).toBe(true);
      expect(agent.reconnectAttempts).toBe(0);
      expect(mockMineflayer.createBot).toHaveBeenCalledWith({
        host: 'localhost',
        port: 25565,
        username: 'AI_Bot',
        version: '1.20.4'
      });
    });

    it('rejects on error event', async () => {
      const connectPromise = agent.connect();
      const errorCallback = mockBot.once.mock.calls.find(c => c[0] === 'error')[1];
      errorCallback(new Error('Connection refused'));
      await expect(connectPromise).rejects.toThrow('Connection refused');
    });

    it('rejects when mineflayer.createBot throws', async () => {
      mockMineflayer.createBot.mockImplementation(() => { throw new Error('createBot failed'); });
      await expect(agent.connect()).rejects.toThrow('createBot failed');
    });

    it('rejects on connection timeout', async () => {
      jest.useFakeTimers();
      agent = new GameAgent();
      const connectPromise = agent.connect();
      jest.advanceTimersByTime(10000);
      await expect(connectPromise).rejects.toThrow('Connection timeout');
      jest.useRealTimers();
    });

    it('sets up end listener for disconnect handling', async () => {
      const connectPromise = agent.connect();
      const spawnCallback = mockBot.once.mock.calls.find(c => c[0] === 'spawn')[1];
      spawnCallback();
      await connectPromise;
      const endCallback = mockBot.once.mock.calls.find(c => c[0] === 'end')[1];
      endCallback('Connection lost');
      expect(agent.connected).toBe(false);
    });
  });

  describe('_handleDisconnect', () => {
    beforeEach(() => {
      agent = new GameAgent();
      agent.connect = jest.fn();
    });

    it('calls _onDisconnectCallback when set', () => {
      const cb = jest.fn();
      agent._onDisconnectCallback = cb;
      agent._handleDisconnect();
      expect(cb).toHaveBeenCalled();
    });

    it('does not reconnect when autoReconnect is false', () => {
      agent.autoReconnect = false;
      agent._handleDisconnect();
      expect(agent.connect).not.toHaveBeenCalled();
    });

    it('stops after max reconnection attempts', () => {
      agent.reconnectAttempts = 10;
      agent._handleDisconnect();
      expect(agent.connect).not.toHaveBeenCalled();
    });

    it('schedules reconnection with setTimeout', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const delay = Math.min(1000 * Math.pow(2, 0), 60000);
      agent._handleDisconnect();
      expect(agent.reconnectAttempts).toBe(1);
      expect(setTimeoutSpy).toHaveBeenCalled();
      const timerDelay = setTimeoutSpy.mock.calls[0][1];
      expect(timerDelay).toBe(delay);
      setTimeoutSpy.mockRestore();
    });

    it('increases delay with each attempt', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const delay = Math.min(1000 * Math.pow(2, 2), 60000);
      agent.reconnectAttempts = 2;
      agent._handleDisconnect();
      expect(agent.reconnectAttempts).toBe(3);
      const timerDelay = setTimeoutSpy.mock.calls[0][1];
      expect(timerDelay).toBe(delay);
      setTimeoutSpy.mockRestore();
    });

    it('caps delay at maxDelay', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      agent.reconnectAttempts = 6;
      agent._handleDisconnect();
      expect(agent.reconnectAttempts).toBe(7);
      const timerDelay = setTimeoutSpy.mock.calls[0][1];
      expect(timerDelay).toBe(60000);
      setTimeoutSpy.mockRestore();
    });

    it('retries reconnection successfully', async () => {
      jest.useFakeTimers();
      agent.connect.mockResolvedValue(true);
      agent._handleDisconnect();
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      agent.reconnectTimer = null;
      jest.useRealTimers();
    });

    it('handles reconnection failure', async () => {
      jest.useFakeTimers();
      agent.connect.mockRejectedValue(new Error('Connection lost'));
      agent._handleDisconnect();
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      agent.reconnectTimer = null;
      jest.useRealTimers();
    });
  });

  describe('disconnect', () => {
    beforeEach(() => {
      agent = new GameAgent();
    });

    it('disconnects the bot and clears state', async () => {
      agent.bot = mockBot;
      agent.connected = true;
      await agent.disconnect();
      expect(agent.autoReconnect).toBe(false);
      expect(mockBot.quit).toHaveBeenCalled();
      expect(agent.bot).toBeNull();
      expect(agent.connected).toBe(false);
    });

    it('clears reconnect timer if set', async () => {
      agent.reconnectTimer = setTimeout(() => {}, 1000);
      await agent.disconnect();
      expect(agent.reconnectTimer).toBeNull();
    });

    it('handles disconnect when bot is null', async () => {
      await agent.disconnect();
      expect(agent.bot).toBeNull();
    });
  });

  describe('_setupListeners', () => {
    beforeEach(() => {
      agent = new GameAgent();
      agent.bot = mockBot;
    });

    it('does nothing if bot is null', () => {
      agent.bot = null;
      agent._setupListeners();
      expect(mockBot.on).not.toHaveBeenCalled();
    });

    it('sets up health listener', () => {
      agent._setupListeners();
      const healthCb = mockBot.on.mock.calls.find(c => c[0] === 'health')[1];
      mockBot.health = 18;
      mockBot.food = 16;
      healthCb();
    });

    it('emits hurt event when own entity is hurt', () => {
      const eventCb = jest.fn();
      agent.on('hurt', eventCb);
      agent._setupListeners();
      const hurtCb = mockBot.on.mock.calls.find(c => c[0] === 'entityHurt')[1];
      hurtCb(mockBot.entity);
      expect(eventCb).toHaveBeenCalledWith({ health: 20 });
    });

    it('does not emit hurt for other entities', () => {
      const eventCb = jest.fn();
      agent.on('hurt', eventCb);
      agent._setupListeners();
      const hurtCb = mockBot.on.mock.calls.find(c => c[0] === 'entityHurt')[1];
      hurtCb({ username: 'other' });
      expect(eventCb).not.toHaveBeenCalled();
    });

    it('emits died event', () => {
      const eventCb = jest.fn();
      agent.on('died', eventCb);
      agent._setupListeners();
      const killedCb = mockBot.on.mock.calls.find(c => c[0] === 'killed')[1];
      killedCb();
      expect(eventCb).toHaveBeenCalledWith({ position: { x: 0, y: 64, z: 0 } });
    });

    it('emits whisper event', () => {
      const eventCb = jest.fn();
      agent.on('whisper', eventCb);
      agent._setupListeners();
      const whisperCb = mockBot.on.mock.calls.find(c => c[0] === 'whisper')[1];
      whisperCb('Player1', 'hello');
      expect(eventCb).toHaveBeenCalledWith({ from: 'Player1', message: 'hello' });
    });

    it('emits chat event from other players', () => {
      const eventCb = jest.fn();
      agent.on('chat', eventCb);
      agent.username = 'AI_Bot';
      agent._setupListeners();
      const chatCb = mockBot.on.mock.calls.find(c => c[0] === 'chat')[1];
      chatCb('Player1', 'hi');
      expect(eventCb).toHaveBeenCalledWith({ from: 'Player1', message: 'hi' });
    });

    it('ignores own chat messages', () => {
      const eventCb = jest.fn();
      agent.on('chat', eventCb);
      agent.username = 'AI_Bot';
      agent._setupListeners();
      const chatCb = mockBot.on.mock.calls.find(c => c[0] === 'chat')[1];
      chatCb('AI_Bot', 'hello world');
      expect(eventCb).not.toHaveBeenCalled();
    });

    it('emits playerJoined event', () => {
      const eventCb = jest.fn();
      agent.on('playerJoined', eventCb);
      agent._setupListeners();
      const joinCb = mockBot.on.mock.calls.find(c => c[0] === 'playerJoined')[1];
      joinCb({ username: 'NewPlayer' });
      expect(eventCb).toHaveBeenCalledWith({ player: 'NewPlayer' });
    });

    it('emits playerLeft event', () => {
      const eventCb = jest.fn();
      agent.on('playerLeft', eventCb);
      agent._setupListeners();
      const leftCb = mockBot.on.mock.calls.find(c => c[0] === 'playerLeft')[1];
      leftCb({ username: 'LeavingPlayer' });
      expect(eventCb).toHaveBeenCalledWith({ player: 'LeavingPlayer' });
    });
  });

  describe('on', () => {
    beforeEach(() => {
      agent = new GameAgent();
    });

    it('registers event handler', () => {
      const cb = jest.fn();
      agent.on('test', cb);
      expect(agent.events.test).toEqual([cb]);
    });

    it('appends multiple handlers for same event', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      agent.on('test', cb1);
      agent.on('test', cb2);
      expect(agent.events.test).toHaveLength(2);
    });
  });

  describe('_emit', () => {
    beforeEach(() => {
      agent = new GameAgent();
    });

    it('calls all registered handlers', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      agent.on('event1', cb1);
      agent.on('event1', cb2);
      agent._emit('event1', { data: 'test' });
      expect(cb1).toHaveBeenCalledWith({ data: 'test' });
      expect(cb2).toHaveBeenCalledWith({ data: 'test' });
    });

    it('does nothing for unregistered event', () => {
      expect(() => agent._emit('unknown', {})).not.toThrow();
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      agent = new GameAgent();
    });

    it('returns disconnected status when not connected', () => {
      const status = agent.getStatus();
      expect(status).toEqual({ connected: false, enabled: true });
    });

    it('returns full status when connected', () => {
      agent.bot = mockBot;
      agent.connected = true;
      const status = agent.getStatus();
      expect(status.connected).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.username).toBe('AI_Bot');
      expect(status.health).toBe(20);
      expect(status.food).toBe(20);
      expect(status.position).toEqual({ x: 0, y: 64, z: 0 });
    });

    it('rounds health to one decimal', () => {
      agent.bot = mockBot;
      agent.bot.health = 17.55;
      agent.connected = true;
      const status = agent.getStatus();
      expect(status.health).toBe(17.6);
    });

    it('defaults food to 20 when bot.food is falsy', () => {
      agent.bot = mockBot;
      agent.bot.food = 0;
      agent.connected = true;
      const status = agent.getStatus();
      expect(status.food).toBe(20);
    });

    it('returns null position when entity is missing', () => {
      agent.bot = mockBot;
      agent.bot.entity = null;
      agent.connected = true;
      const status = agent.getStatus();
      expect(status.position).toBeNull();
    });
  });

  describe('chat', () => {
    beforeEach(() => {
      agent = new GameAgent();
    });

    it('sends chat message when connected', async () => {
      agent.bot = mockBot;
      agent.connected = true;
      const result = await agent.chat('Hello world');
      expect(result).toEqual({ ok: true, message: 'Hello world' });
      expect(mockBot.chat).toHaveBeenCalledWith('Hello world');
    });

    it('returns error when not connected', async () => {
      const result = await agent.chat('Hello');
      expect(result).toEqual({ error: 'Bot not connected' });
    });
  });

  describe('whisper', () => {
    beforeEach(() => {
      agent = new GameAgent();
    });

    it('sends whisper when connected', async () => {
      agent.bot = mockBot;
      agent.connected = true;
      const result = await agent.whisper('Player1', 'secret');
      expect(result).toEqual({ ok: true });
      expect(mockBot.whisper).toHaveBeenCalledWith('Player1', 'secret');
    });

    it('returns error when not connected', async () => {
      const result = await agent.whisper('P1', 'msg');
      expect(result).toEqual({ error: 'Bot not connected' });
    });
  });

  describe('moveTo', () => {
    beforeEach(() => {
      agent = new GameAgent();
    });

    it('sets pathfinding goal when connected', async () => {
      agent.bot = mockBot;
      agent.connected = true;
      const result = await agent.moveTo(100, 64, 200);
      expect(result).toEqual({ ok: true });
      expect(mockBot.pathfinder.setGoal).toHaveBeenCalled();
    });

    it('returns error when not connected', async () => {
      const result = await agent.moveTo(0, 0, 0);
      expect(result).toEqual({ error: 'Bot not connected' });
    });

    it('returns error when pathfinder fails', async () => {
      agent.bot = mockBot;
      agent.connected = true;
      mockBot.pathfinder.setGoal.mockImplementation(() => { throw new Error('Pathfinding error'); });
      const result = await agent.moveTo(100, 64, 200);
      expect(result).toEqual({ error: 'Pathfinding error' });
    });
  });

  describe('handleEvent', () => {
    beforeEach(() => {
      agent = new GameAgent();
    });

    it('returns status with current bot status', () => {
      const result = agent.handleEvent('some_event');
      expect(result.status).toBe('ok');
      expect(result.event).toBe('some_event');
      expect(result.botStatus).toBeDefined();
    });
  });

  describe('queueTask and _executeNextTask', () => {
    beforeEach(() => {
      agent = new GameAgent();
      agent.bot = mockBot;
      agent.connected = true;
    });

    it('queues and executes a task', async () => {
      const task = {
        name: 'test-task',
        execute: jest.fn().mockResolvedValue()
      };
      agent.queueTask(task);
      await flushMicrotasks();
      expect(agent.taskQueue).toHaveLength(0);
      expect(task.execute).toHaveBeenCalledWith(mockBot);
    });

    it('queues multiple tasks and executes sequentially', async () => {
      const t1 = { name: 't1', execute: jest.fn().mockResolvedValue() };
      const t2 = { name: 't2', execute: jest.fn().mockResolvedValue() };
      agent.queueTask(t1);
      agent.queueTask(t2);
      await flushMicrotasks();
      expect(t1.execute).toHaveBeenCalled();
      expect(t2.execute).toHaveBeenCalled();
    });

    it('emits taskComplete on success', async () => {
      const cb = jest.fn();
      agent.on('taskComplete', cb);
      const task = { name: 'good-task', execute: jest.fn().mockResolvedValue() };
      agent.queueTask(task);
      await flushMicrotasks();
      expect(cb).toHaveBeenCalledWith({ task: 'good-task' });
    });

    it('emits taskError on failure', async () => {
      const cb = jest.fn();
      agent.on('taskError', cb);
      const task = { name: 'bad-task', execute: jest.fn().mockRejectedValue(new Error('Failed')) };
      agent.queueTask(task);
      await flushMicrotasks();
      expect(cb).toHaveBeenCalledWith({ task: 'bad-task', error: 'Failed' });
    });

    it('sets isExecutingTask to false when queue is empty', async () => {
      const task = { name: 't1', execute: jest.fn().mockResolvedValue() };
      agent.queueTask(task);
      await flushMicrotasks();
      expect(agent.isExecutingTask).toBe(false);
    });
  });
});
