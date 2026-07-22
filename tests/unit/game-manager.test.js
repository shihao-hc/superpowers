'use strict';

const EventEmitter = require('events');

const mockGameAgent = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  moveTo: jest.fn(),
  getStatus: jest.fn(),
  chat: jest.fn(),
  connected: false
};

const mockTaskPlannerInstance = {
  planTask: jest.fn(),
  executePlan: jest.fn(),
  cancelTask: jest.fn(),
  getStatus: jest.fn()
};

const mockEventHandlerInstance = Object.assign(new EventEmitter(), {
  setWebSocket: jest.fn(),
  setupListeners: jest.fn(),
  handleUserCommand: jest.fn(),
  getGameStatus: jest.fn(),
  getEventHistory: jest.fn()
});

jest.mock('../../src/agents/GameAgent', () => {
  return jest.fn().mockImplementation(() => mockGameAgent);
});

jest.mock('../../src/game/TaskPlanner', () => {
  return jest.fn().mockImplementation(() => mockTaskPlannerInstance);
});

jest.mock('../../src/game/GameEventHandler', () => {
  return jest.fn().mockImplementation(() => mockEventHandlerInstance);
});

const GameManager = require('../../src/game/GameManager');

describe('GameManager', () => {
  let pm, chat, memory, manager;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_GAME;
    pm = { name: 'PersonalityManager' };
    chat = { name: 'ChatAgent' };
    memory = { remember: jest.fn() };
    mockGameAgent.connected = false;
    mockGameAgent.connect.mockReset();
    mockGameAgent.disconnect.mockReset();
    mockGameAgent.moveTo.mockReset();
    mockGameAgent.getStatus.mockReset();
    mockGameAgent.chat.mockReset();
    mockTaskPlannerInstance.planTask.mockReset();
    mockTaskPlannerInstance.executePlan.mockReset();
    mockTaskPlannerInstance.cancelTask.mockReset();
    mockTaskPlannerInstance.getStatus.mockReset();
    mockEventHandlerInstance.setWebSocket.mockReset();
    mockEventHandlerInstance.setupListeners.mockReset();
    mockEventHandlerInstance.handleUserCommand.mockReset();
    mockEventHandlerInstance.getGameStatus.mockReset();
    mockEventHandlerInstance.getEventHistory.mockReset();
    mockEventHandlerInstance.removeAllListeners();
  });

  describe('constructor', () => {
    it('stores personalityManager, chatAgent, memoryAgent', () => {
      manager = new GameManager(pm, chat, memory);
      expect(manager.pm).toBe(pm);
      expect(manager.chat).toBe(chat);
      expect(manager.memory).toBe(memory);
    });

    it('creates GameAgent, TaskPlanner, GameEventHandler', () => {
      manager = new GameManager(pm, chat, memory);
      expect(manager.game).toBe(mockGameAgent);
      expect(manager.taskPlanner).toBe(mockTaskPlannerInstance);
      expect(manager.eventHandler).toBe(mockEventHandlerInstance);
    });

    it('reads ENABLE_GAME from env', () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      expect(manager.enabled).toBe(true);
    });

    it('defaults to disabled when env not set', () => {
      manager = new GameManager(pm, chat, memory);
      expect(manager.enabled).toBe(false);
    });

    it('initializes ws as null', () => {
      manager = new GameManager(pm, chat, memory);
      expect(manager.ws).toBeNull();
    });
  });

  describe('setWebSocket', () => {
    it('sets ws on manager and eventHandler', () => {
      manager = new GameManager(pm, chat, memory);
      const ws = { broadcast: jest.fn() };
      manager.setWebSocket(ws);
      expect(manager.ws).toBe(ws);
      expect(mockEventHandlerInstance.setWebSocket).toHaveBeenCalledWith(ws);
    });
  });

  describe('initialize', () => {
    it('returns false if disabled', async () => {
      manager = new GameManager(pm, chat, memory);
      const result = await manager.initialize();
      expect(result).toBe(false);
      expect(mockGameAgent.connect).not.toHaveBeenCalled();
    });

    it('connects game and returns true when enabled', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connect.mockResolvedValue(undefined);

      const result = await manager.initialize();

      expect(result).toBe(true);
      expect(mockGameAgent.connect).toHaveBeenCalled();
      expect(mockEventHandlerInstance.setupListeners).toHaveBeenCalled();
      expect(mockEventHandlerInstance.listenerCount('taskComplete')).toBe(1);
      expect(mockEventHandlerInstance.listenerCount('taskError')).toBe(1);
    });

    it('creates fresh TaskPlanner and GameEventHandler on initialize', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connect.mockResolvedValue(undefined);

      await manager.initialize();

      expect(require('../../src/game/TaskPlanner')).toHaveBeenCalledWith(
        mockGameAgent, chat, memory
      );
      expect(require('../../src/game/GameEventHandler')).toHaveBeenCalledWith(
        mockGameAgent, pm, chat
      );
    });

    it('passes ws to eventHandler if ws is set', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      const ws = { broadcast: jest.fn() };
      manager.setWebSocket(ws);
      mockGameAgent.connect.mockResolvedValue(undefined);

      await manager.initialize();

      expect(mockEventHandlerInstance.setWebSocket).toHaveBeenCalledWith(ws);
    });

    it('broadcasts taskComplete via ws when ws exists', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      const ws = { broadcast: jest.fn() };
      manager.setWebSocket(ws);
      mockGameAgent.connect.mockResolvedValue(undefined);
      memory.remember.mockResolvedValue(undefined);

      await manager.initialize();

      mockEventHandlerInstance.emit('taskComplete', { task: 'build', result: 'ok' });

      expect(ws.broadcast).toHaveBeenCalledWith({
        type: 'task_complete',
        data: { task: 'build', result: 'ok' }
      });
    });

    it('handles taskComplete without ws (no broadcast)', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connect.mockResolvedValue(undefined);
      memory.remember.mockResolvedValue(undefined);

      await manager.initialize();

      mockEventHandlerInstance.emit('taskComplete', { task: 'mine', result: 'done' });

      expect(memory.remember).toHaveBeenCalled();
    });

    it('calls game.chat on taskError', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connect.mockResolvedValue(undefined);

      await manager.initialize();

      mockEventHandlerInstance.emit('taskError', { error: 'Build failed' });

      expect(mockGameAgent.chat).toHaveBeenCalledWith('任务执行出错: Build failed');
    });

    it('returns false if connection fails', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connect.mockRejectedValue(new Error('Connection refused'));

      const result = await manager.initialize();

      expect(result).toBe(false);
    });
  });

  describe('handleMessage', () => {
    it('returns null if disabled', async () => {
      process.env.ENABLE_GAME = 'false';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;

      const result = await manager.handleMessage('hello');

      expect(result).toBeNull();
    });

    it('returns null if game not connected', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = false;

      const result = await manager.handleMessage('hello');

      expect(result).toBeNull();
    });

    it('handles / commands via eventHandler', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;
      mockEventHandlerInstance.handleUserCommand.mockResolvedValue('command result');

      const result = await manager.handleMessage('/help');

      expect(result).toBe('command result');
      expect(mockEventHandlerInstance.handleUserCommand).toHaveBeenCalledWith('/help');
    });

    it('handles building keywords via taskPlanner', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;
      mockTaskPlannerInstance.planTask.mockResolvedValue('build plan');

      const result = await manager.handleMessage('建造一个房子');

      expect(result).toBe('build plan');
      expect(mockTaskPlannerInstance.planTask).toHaveBeenCalledWith('建造一个房子');
    });

    it('handles 建筑 keyword', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;
      mockTaskPlannerInstance.planTask.mockResolvedValue('build plan');

      await manager.handleMessage('我要建筑城堡');
      expect(mockTaskPlannerInstance.planTask).toHaveBeenCalled();
    });

    it('handles movement commands with coordinates', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;
      mockGameAgent.moveTo.mockResolvedValue('moved');

      const result = await manager.handleMessage('去 10 20 30');

      expect(result).toBe('moved');
      expect(mockGameAgent.moveTo).toHaveBeenCalledWith(10, 20, 30);
    });

    it('handles 移动 keyword', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;
      mockGameAgent.moveTo.mockResolvedValue('moved');

      await manager.handleMessage('移动到 100 200 300');
      expect(mockGameAgent.moveTo).toHaveBeenCalledWith(100, 200, 300);
    });

    it('handles 走到 keyword', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;
      mockGameAgent.moveTo.mockResolvedValue('moved');

      await manager.handleMessage('走到 1 2 3');
      expect(mockGameAgent.moveTo).toHaveBeenCalledWith(1, 2, 3);
    });

    it('does not call moveTo if fewer than 3 coordinates', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;

      const result = await manager.handleMessage('去 10 20');

      expect(result).toBeNull();
      expect(mockGameAgent.moveTo).not.toHaveBeenCalled();
    });

    it('handles status check', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;
      mockEventHandlerInstance.getGameStatus.mockReturnValue({ status: 'active' });

      const result = await manager.handleMessage('状态');
      expect(result).toEqual({ status: 'active' });
    });

    it('handles english status check', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;
      mockEventHandlerInstance.getGameStatus.mockReturnValue({ status: 'active' });

      const result = await manager.handleMessage('status');
      expect(result).toEqual({ status: 'active' });
    });

    it('returns null for unrecognized messages', async () => {
      process.env.ENABLE_GAME = 'true';
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;

      const result = await manager.handleMessage('hello world');

      expect(result).toBeNull();
    });
  });

  describe('planAndExecute', () => {
    it('plans and executes a task', async () => {
      manager = new GameManager(pm, chat, memory);
      mockTaskPlannerInstance.planTask.mockResolvedValue({
        ok: true,
        steps: ['step1', 'step2']
      });
      mockTaskPlannerInstance.executePlan.mockResolvedValue('executed');

      const result = await manager.planAndExecute('build a house');

      expect(mockTaskPlannerInstance.planTask).toHaveBeenCalledWith('build a house');
      expect(mockTaskPlannerInstance.executePlan).toHaveBeenCalledWith(['step1', 'step2']);
      expect(result).toBe('executed');
    });

    it('returns plan directly if planning fails', async () => {
      manager = new GameManager(pm, chat, memory);
      mockTaskPlannerInstance.planTask.mockResolvedValue({
        ok: false,
        error: 'Cannot plan'
      });

      const result = await manager.planAndExecute('impossible task');

      expect(result).toEqual({ ok: false, error: 'Cannot plan' });
      expect(mockTaskPlannerInstance.executePlan).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('disconnects game and cancels tasks', async () => {
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.disconnect.mockResolvedValue(undefined);

      await manager.disconnect();

      expect(mockGameAgent.disconnect).toHaveBeenCalled();
      expect(mockTaskPlannerInstance.cancelTask).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns status object with all fields', () => {
      manager = new GameManager(pm, chat, memory);
      mockGameAgent.connected = true;
      mockGameAgent.getStatus.mockReturnValue({ health: 100 });
      mockTaskPlannerInstance.getStatus.mockReturnValue({ active: false });
      mockEventHandlerInstance.getEventHistory.mockReturnValue([
        { event: 'login' },
        { event: 'build' },
        { event: 'fight' },
        { event: 'collect' },
        { event: 'craft' },
        { event: 'trade' },
        { event: 'explore' },
        { event: 'levelup' },
        { event: 'heal' },
        { event: 'quest' },
        { event: 'extra1' },
        { event: 'extra2' }
      ]);

      const status = manager.getStatus();

      expect(status).toEqual({
        enabled: false,
        connected: true,
        bot: { health: 100 },
        taskPlanner: { active: false },
        recentEvents: [
          { event: 'fight' },
          { event: 'collect' },
          { event: 'craft' },
          { event: 'trade' },
          { event: 'explore' },
          { event: 'levelup' },
          { event: 'heal' },
          { event: 'quest' },
          { event: 'extra1' },
          { event: 'extra2' }
        ]
      });
    });
  });

  describe('_saveGameMemory', () => {
    it('saves memory if memory agent exists', () => {
      manager = new GameManager(pm, chat, memory);
      const data = { task: 'build', result: 'ok' };
      manager._saveGameMemory('task_complete', data);

      expect(memory.remember).toHaveBeenCalled();
      const callArg = memory.remember.mock.calls[0][0];
      expect(callArg).toMatch(/^game_task_complete_\d+$/);
      expect(memory.remember.mock.calls[0][1]).toMatchObject({
        task: 'build',
        result: 'ok',
        timestamp: expect.any(String)
      });
    });

    it('does nothing if memory agent is null', () => {
      manager = new GameManager(pm, chat, null);
      manager._saveGameMemory('test', { key: 'val' });

      expect(memory.remember).not.toHaveBeenCalled();
    });
  });
});
