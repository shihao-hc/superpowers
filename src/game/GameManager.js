const GameAgent = require('../agents/GameAgent');
const TaskPlanner = require('./TaskPlanner');
const GameEventHandler = require('./GameEventHandler');

class GameManager {
  constructor(personalityManager, chatAgent, memoryAgent) {
    this.pm = personalityManager;
    this.chat = chatAgent;
    this.memory = memoryAgent;

    this.game = new GameAgent();
    this.taskPlanner = new TaskPlanner(this.game, this.chat, this.memory);
    this.eventHandler = new GameEventHandler(this.game, this.pm, this.chat);
    this.ws = null;

    this.enabled = process.env.ENABLE_GAME === 'true';
  }

  setWebSocket(ws) {
    this.ws = ws;
    this.eventHandler.setWebSocket(ws);
  }

  async initialize() {
    if (!this.enabled) {
      console.log('[GameManager] Game features disabled (set ENABLE_GAME=true to enable)');
      return false;
    }

    try {
      await this.game.connect();
      this.taskPlanner = new TaskPlanner(this.game, this.chat, this.memory);
      this.eventHandler = new GameEventHandler(this.game, this.pm, this.chat);
      if (this.ws) {
        this.eventHandler.setWebSocket(this.ws);
      }
      this.eventHandler.setupListeners();

      this.eventHandler.on('taskComplete', (data) => {
        console.log(`[GameManager] Task complete: ${data.task}`);
        this._saveGameMemory('task_complete', data);
        if (this.ws) {
          this.ws.broadcast({ type: 'task_complete', data });
        }
      });

      this.eventHandler.on('taskError', (data) => {
        console.error(`[GameManager] Task error: ${data.error}`);
        this.game.chat(`任务执行出错: ${data.error}`);
      });

      console.log('[GameManager] Game features initialized');
      return true;
    } catch (err) {
      console.error('[GameManager] Init failed:', err.message);
      return false;
    }
  }

  async handleMessage(message) {
    if (!this.enabled || !this.game.connected) {
      return null;
    }

    const lower = message.toLowerCase();

    if (lower.startsWith('/')) {
      return await this.eventHandler.handleUserCommand(message);
    }

    if (lower.includes('建造') || lower.includes('建筑') || lower.includes('搭')) {
      return await this.taskPlanner.planTask(message);
    }

    if (lower.includes('去') || lower.includes('移动') || lower.includes('走到')) {
      const coords = message.match(/(-?\d+)/g);
      if (coords && coords.length >= 3) {
        return await this.game.moveTo(parseInt(coords[0]), parseInt(coords[1]), parseInt(coords[2]));
      }
    }

    if (lower.includes('状态') || lower.includes('status')) {
      return this.eventHandler.getGameStatus();
    }

    return null;
  }

  async planAndExecute(userRequest) {
    const plan = await this.taskPlanner.planTask(userRequest);
    if (plan.ok) {
      return await this.taskPlanner.executePlan(plan.steps);
    }
    return plan;
  }

  async disconnect() {
    await this.game.disconnect();
    this.taskPlanner.cancelTask();
  }

  getStatus() {
    return {
      enabled: this.enabled,
      connected: this.game.connected,
      bot: this.game.getStatus(),
      taskPlanner: this.taskPlanner.getStatus(),
      recentEvents: this.eventHandler.getEventHistory().slice(-10)
    };
  }

  _saveGameMemory(type, data) {
    if (this.memory) {
      this.memory.remember(`game_${type}_${Date.now()}`, {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = GameManager;
