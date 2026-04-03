class GameEventHandler {
  constructor(gameAgent, personalityManager, chatAgent) {
    this.game = gameAgent;
    this.pm = personalityManager;
    this.chat = chatAgent;
    this.ws = null;
    this.eventHandlers = new Map();
    this.moodTriggers = {
      hurt: { mood: 'fearful', weight: 0.8, cooldown: 30000 },
      died: { mood: 'sad', weight: 1.0, cooldown: 60000 },
      attacked_mob: { mood: 'excited', weight: 0.5, cooldown: 10000 },
      found_diamond: { mood: 'excited', weight: 0.9, cooldown: 0 },
      player_gift: { mood: 'happy', weight: 1.0, cooldown: 0 },
      night: { mood: 'curious', weight: 0.3, cooldown: 0 },
      day: { mood: 'happy', weight: 0.3, cooldown: 0 }
    };
    this.lastMoodChange = {};
    this.eventHistory = [];
    
    this.ALLOWED_COMMANDS = ['/status', '/goto', '/inventory', '/inv', '/say', '/whisper', '/follow'];
    this.MAX_COORD = 30000000;
    this.MIN_COORD = -30000000;
    this.MAX_MESSAGE_LENGTH = 500;
    this.FORBIDDEN_PATTERNS = [/^http/i, /^ftp/i, /\x00/, /<script/i, /javascript:/i];
  }

  sanitizeMessage(message) {
    if (!message || typeof message !== 'string') return '';
    let sanitized = message.substring(0, this.MAX_MESSAGE_LENGTH);
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, '█');
      }
    }
    return sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  }

  validateCoordinates(x, y, z) {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      Number.isInteger(z) &&
      x >= this.MIN_COORD &&
      x <= this.MAX_COORD &&
      y >= this.MIN_COORD &&
      y <= this.MAX_COORD &&
      z >= this.MIN_COORD &&
      z <= this.MAX_COORD
    );
  }

  isCommandInjection(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
      lower.startsWith('/') &&
      !this.ALLOWED_COMMANDS.some(cmd => lower.startsWith(cmd))
    );
  }

  setWebSocket(ws) {
    this.ws = ws;
  }

  setupListeners() {
    this.game.on('hurt', (data) => {
      this._handleEvent('hurt', data);
      this._triggerMoodChange('hurt');
      this._broadcastWs({ type: 'hurt', data });
    });

    this.game.on('died', (data) => {
      this._handleEvent('died', data);
      this._triggerMoodChange('died');
      this._broadcast('我死了... 😢');
      this._broadcastWs({ type: 'died', data });
    });

    this.game.on('whisper', (data) => {
      this._handleEvent('whisper', data);
      this._processWhisper(data);
      this._broadcastWs({ type: 'whisper', data });
    });

    this.game.on('chat', (data) => {
      this._handleEvent('chat', data);
      this._broadcastWs({ type: 'chat', data });
    });

    this.game.on('playerJoined', (data) => {
      this._handleEvent('playerJoined', data);
      this._broadcast(`欢迎 ${data.player} 加入服务器！`);
      this._broadcastWs({ type: 'player_joined', data });
    });

    this.game.on('playerLeft', (data) => {
      this._handleEvent('playerLeft', data);
      this._broadcast(`${data.player} 离开了服务器`);
      this._broadcastWs({ type: 'player_left', data });
    });

    this.game.on('health', (data) => {
      if (data.health > 15) {
        this._triggerMoodChange('healthy', 0.1);
      } else if (data.health < 5) {
        this._triggerMoodChange('hurt', 0.6);
      }
      this._broadcastWs({ type: 'health', data });
    });
  }

  _broadcastWs(data) {
    if (this.ws) {
      this.ws.broadcast(data);
    }
  }

  _handleEvent(type, data) {
    this.eventHistory.push({ type, data, time: Date.now() });
    if (this.eventHistory.length > 100) {
      this.eventHistory.shift();
    }

    if (this.eventHandlers.has(type)) {
      for (const cb of this.eventHandlers.get(type)) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[GameEventHandler] Event callback error (${type}):`, err.message);
        }
      }
    }

    return { type, data };
  }

  on(event, callback) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(callback);
  }

  _triggerMoodChange(trigger, customWeight) {
    const config = this.moodTriggers[trigger];
    if (!config) return;

    const weight = customWeight ?? config.weight;
    const now = Date.now();
    const lastChange = this.lastMoodChange[trigger] || 0;

    if (now - lastChange < (config.cooldown || 0)) {
      return;
    }

    if (Math.random() < weight) {
      this.pm.driftMood(1);
      this.lastMoodChange[trigger] = now;
      console.log(`[GameEventHandler] Mood changed to: ${this.pm.getMood()}`);
    }
  }

  async _processWhisper(data) {
    try {
      const sanitizedMessage = this.sanitizeMessage(data.message);
      if (this.isCommandInjection(sanitizedMessage)) {
        console.warn('[GameEventHandler] Blocked command injection via whisper');
        return;
      }
      const result = await this.chat.respond(sanitizedMessage);
      if (result.reply) {
        const safeReply = this.sanitizeMessage(result.reply);
        await this.game.whisper(data.from, safeReply);
      }
    } catch (err) {
      console.error('[GameEventHandler] Whisper error:', err.message);
    }
  }

  async _broadcast(message) {
    try {
      await this.game.chat(message);
    } catch (err) {
      console.error('[GameEventHandler] Broadcast error:', err.message);
    }
  }

  async handleUserCommand(command) {
    if (!command || typeof command !== 'string') {
      return { error: '无效命令' };
    }
    
    const sanitized = this.sanitizeMessage(command);
    const lower = sanitized.toLowerCase();

    if (lower.startsWith('/status')) {
      return this.getGameStatus();
    }

    if (lower.startsWith('/goto')) {
      const coords = sanitized.match(/(-?\d+)/g);
      if (coords && coords.length >= 3) {
        const x = parseInt(coords[0]);
        const y = parseInt(coords[1]);
        const z = parseInt(coords[2]);
        if (this.validateCoordinates(x, y, z)) {
          return await this.game.moveTo(x, y, z);
        }
        return { error: '坐标超出有效范围' };
      }
      return { error: '无效坐标' };
    }

    if (lower.startsWith('/inventory') || lower.startsWith('/inv')) {
      const status = this.game.getStatus();
      return { inventory: status.inventory };
    }

    if (lower.startsWith('/say')) {
      const msg = this.sanitizeMessage(sanitized.substring(5));
      return await this.game.chat(msg);
    }

    if (lower.startsWith('/whisper')) {
      const parts = sanitized.split(' ');
      if (parts.length >= 3) {
        const targetPlayer = this.sanitizeMessage(parts[1]).replace(/[^a-zA-Z0-9_]/g, '');
        const whisperMsg = this.sanitizeMessage(parts.slice(2).join(' '));
        if (targetPlayer && whisperMsg) {
          return await this.game.whisper(targetPlayer, whisperMsg);
        }
        return { error: '用法: /whisper <玩家> <消息>' };
      }
      return { error: '用法: /whisper <玩家> <消息>' };
    }

    if (lower.startsWith('/follow')) {
      return { message: '跟随功能待实现' };
    }

    return { error: '未知命令' };
  }

  getGameStatus() {
    const gameStatus = this.game.getStatus();
    const mood = this.pm.getMood();

    return {
      bot: {
        name: gameStatus.username,
        health: gameStatus.health,
        food: gameStatus.food,
        position: gameStatus.position,
        connected: gameStatus.connected
      },
      mood: mood,
      recentEvents: this.eventHistory.slice(-5).map(e => ({
        type: e.type,
        time: new Date(e.time).toLocaleTimeString()
      }))
    };
  }

  getEventHistory() {
    return this.eventHistory;
  }
}

module.exports = GameEventHandler;
