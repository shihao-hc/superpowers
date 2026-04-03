const RECONNECT_CONFIG = {
  maxAttempts: 10,
  baseDelay: 1000,
  maxDelay: 60000,
  multiplier: 2
};

class GameAgent {
  constructor(options = {}) {
    this.bot = null;
    this.enabled = process.env.ENABLE_GAME === 'true';
    this.host = options.host || process.env.MINECRAFT_SERVER_HOST || 'localhost';
    this.port = options.port || parseInt(process.env.MINECRAFT_SERVER_PORT) || 25565;
    this.username = options.username || process.env.MINECRAFT_BOT_NAME || 'AI_Bot';
    this.version = options.version || process.env.MINECRAFT_VERSION || '1.20.4';
    this.connected = false;
    this.events = {};
    this.taskQueue = [];
    this.isExecutingTask = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.autoReconnect = options.autoReconnect !== false;
    this._onDisconnectCallback = null;

    if (this.enabled) {
      try {
        require('mineflayer');
        console.log(`[GameAgent] Mineflayer loaded, target: ${this.host}:${this.port}`);
      } catch (e) {
        this.enabled = false;
        console.warn('[GameAgent] Mineflayer not installed');
      }
    }
  }

  onDisconnect(callback) {
    this._onDisconnectCallback = callback;
  }

  async connect() {
    if (!this.enabled) {
      throw new Error('Mineflayer not available. Install with: npm install mineflayer');
    }
    
    if (this.bot) {
      await this.disconnect();
    }

    return new Promise((resolve, reject) => {
      try {
        const { createBot } = require('mineflayer');
        this.bot = createBot({
          host: this.host,
          port: this.port,
          username: this.username,
          version: this.version
        });

        this.bot.once('spawn', () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this._setupListeners();
          console.log(`[GameAgent] Bot ${this.username} connected`);
          resolve(true);
        });

        this.bot.once('end', (reason) => {
          this.connected = false;
          console.log(`[GameAgent] Disconnected: ${reason}`);
          this._handleDisconnect();
        });

        this.bot.once('error', (err) => {
          reject(err);
        });

        setTimeout(() => {
          if (!this.connected) reject(new Error('Connection timeout'));
        }, 10000);
      } catch (err) {
        reject(err);
      }
    });
  }

  _handleDisconnect() {
    if (this._onDisconnectCallback) {
      this._onDisconnectCallback();
    }
    
    if (!this.autoReconnect) return;
    if (this.reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
      console.log('[GameAgent] Max reconnection attempts reached, stopping');
      return;
    }

    const delay = Math.min(
      RECONNECT_CONFIG.baseDelay * Math.pow(RECONNECT_CONFIG.multiplier, this.reconnectAttempts),
      RECONNECT_CONFIG.maxDelay
    );
    
    this.reconnectAttempts++;
    console.log(`[GameAgent] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts})...`);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        console.log('[GameAgent] Reconnected successfully');
      } catch (err) {
        console.warn('[GameAgent] Reconnection failed:', err.message);
      }
    }, delay);
  }

  async disconnect() {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.bot) {
      this.bot.quit();
      this.bot = null;
      this.connected = false;
    }
  }

  _setupListeners() {
    if (!this.bot) return;

    this.bot.on('health', () => {
      this._emit('health', { health: this.bot.health, food: this.bot.food });
    });

    this.bot.on('entityHurt', (entity) => {
      if (entity === this.bot.entity) {
        this._emit('hurt', { health: this.bot.health });
      }
    });

    this.bot.on('killed', () => {
      this._emit('died', { position: this.bot.entity.position });
    });

    this.bot.on('whisper', (username, message) => {
      this._emit('whisper', { from: username, message });
    });

    this.bot.on('chat', (username, message) => {
      if (username !== this.username) {
        this._emit('chat', { from: username, message });
      }
    });

    this.bot.on('playerJoined', (player) => {
      this._emit('playerJoined', { player: player.username });
    });

    this.bot.on('playerLeft', (player) => {
      this._emit('playerLeft', { player: player.username });
    });
  }

  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  }

  _emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(cb => cb(data));
    }
  }

  getStatus() {
    if (!this.bot || !this.connected) {
      return { connected: false, enabled: this.enabled };
    }
    return {
      connected: true,
      enabled: this.enabled,
      username: this.username,
      health: Math.round(this.bot.health * 10) / 10,
      food: this.bot.food || 20,
      position: this.bot.entity?.position ? {
        x: Math.round(this.bot.entity.position.x),
        y: Math.round(this.bot.entity.position.y),
        z: Math.round(this.bot.entity.position.z)
      } : null
    };
  }

  async chat(message) {
    if (!this.bot || !this.connected) {
      return { error: 'Bot not connected' };
    }
    this.bot.chat(message);
    return { ok: true, message };
  }

  async whisper(username, message) {
    if (!this.bot || !this.connected) {
      return { error: 'Bot not connected' };
    }
    this.bot.whisper(username, message);
    return { ok: true };
  }

  async moveTo(x, y, z) {
    if (!this.bot || !this.connected) {
      return { error: 'Bot not connected' };
    }
    try {
      this.bot.pathfinder.setGoal(new (require('pathfinding').GoalNear)(x, y, z, 1));
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  handleEvent(event) {
    return {
      status: 'ok',
      event,
      botStatus: this.getStatus()
    };
  }

  queueTask(task) {
    this.taskQueue.push(task);
    if (!this.isExecutingTask) {
      this._executeNextTask();
    }
  }

  async _executeNextTask() {
    if (this.taskQueue.length === 0) {
      this.isExecutingTask = false;
      return;
    }
    this.isExecutingTask = true;
    const task = this.taskQueue.shift();
    try {
      await task.execute(this.bot);
      this._emit('taskComplete', { task: task.name });
    } catch (err) {
      this._emit('taskError', { task: task.name, error: err.message });
    }
    this._executeNextTask();
  }
}

module.exports = GameAgent;
