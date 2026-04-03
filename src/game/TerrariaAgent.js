const net = require('net');

class TerrariaAgent {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 7777;
    this.password = options.password || '';
    this.name = options.name || 'TerrariaBot';
    this.connected = false;
    this.socket = null;
    this.playerData = null;
    this.worldData = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      
      const connectOptions = { host: this.host, port: this.port };
      
      this.socket.connect(connectOptions, () => {
        console.log('[Terraria] Connected to server');
        
        if (this.password) {
          this.socket.write(`${this.password}\n`);
        }
        
        this.socket.write(`login ${this.name}\n`);
        this.connected = true;
        resolve({ ok: true });
      });

      this.socket.on('data', (data) => {
        this._handleData(data.toString());
      });

      this.socket.on('close', () => {
        this.connected = false;
        console.log('[Terraria] Disconnected');
      });

      this.socket.on('error', (err) => {
        console.error('[Terraria] Error:', err.message);
        reject(err);
      });
      
      this.socket.setTimeout(10000, () => {
        this.socket.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }

  _handleData(data) {
    const lines = data.split('\n');
    
    for (const line of lines) {
      if (line.includes('Player has joined')) {
        this._handlePlayerJoin(line);
      } else if (line.includes('Player has left')) {
        this._handlePlayerLeave(line);
      } else if (line.startsWith('{' )) {
        try {
          const parsed = JSON.parse(line);
          this._handleJSON(parsed);
        } catch (e) {
          console.warn('[Terraria] JSON parse error:', e.message);
        }
      }
    }
  }

  _handlePlayerJoin(data) {
    const match = data.match(/(\w+)\s+has joined/);
    if (match) {
      console.log(`[Terraria] Player joined: ${match[1]}`);
    }
  }

  _handlePlayerLeave(data) {
    const match = data.match(/(\w+)\s+has left/);
    if (match) {
      console.log(`[Terraria] Player left: ${match[1]}`);
    }
  }

  _handleJSON(data) {
    if (data.type === 'player_list') {
      this.playerData = data.players;
    } else if (data.type === 'world_info') {
      this.worldData = data;
    }
  }

  _validateCommand(command) {
    if (!command || typeof command !== 'string') return false;
    if (command.length > 200) return false;
    
    const allowedCommands = ['players', 'world', 'list', 'version', 'status'];
    
    const trimmed = command.trim().toLowerCase();
    for (const allowed of allowedCommands) {
      if (trimmed === allowed || trimmed.startsWith(allowed + ' ')) {
        return true;
      }
    }
    
    if (/^(tp|teleport)\s+[\w.]+\s+[\d.-]+\s+[\d.-]+$/i.test(trimmed)) return true;
    if (/^give\s+\w+\s+\w+\s*\d*$/i.test(trimmed)) return true;
    if (/^(kick|mute|ban)\s+\w+/i.test(trimmed)) return true;
    
    const dangerous = [';', '&&', '||', '|', '`', '$(', '\n', '\r', '\0', '>', '<'];
    for (const char of dangerous) {
      if (command.includes(char)) return false;
    }
    
    return true;
  }

  sendCommand(command) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected'));
    }
    
    if (!this._validateCommand(command)) {
      return Promise.reject(new Error('Command not allowed'));
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command timeout'));
      }, 5000);
      
      const handler = (data) => {
        clearTimeout(timeout);
        this.socket.removeListener('data', handler);
        resolve(data.toString());
      };
      
      this.socket.on('data', handler);
      this.socket.write(`${command}\n`);
    });
  }

  async getPlayers() {
    try {
      const result = await this.sendCommand('players');
      return { ok: true, players: result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async getWorld() {
    try {
      const result = await this.sendCommand('world');
      return { ok: true, world: result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async teleport(x, y) {
    const cmd = `tp ${this._sanitizeName(this.name)} ${Math.max(-10000, Math.min(10000, Number(x))) || 0} ${Math.max(-20000, Math.min(20000, Number(y))) || 0}`;
    return this.sendCommand(cmd);
  }

  async give(item, count = 1) {
    const safeItem = item.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
    const safeCount = Math.max(1, Math.min(10000, Number(count) || 1));
    return this.sendCommand(`give ${this._sanitizeName(this.name)} ${safeItem} ${safeCount}`);
  }

  async kill() {
    return this.sendCommand(`kill ${this._sanitizeName(this.name)}`);
  }

  async mute(player) {
    return this.sendCommand(`mute ${this._sanitizeName(player)}`);
  }

  async kick(player, reason = '') {
    const safeReason = reason.replace(/[^a-zA-Z0-9\s.,!?-]/g, '').substring(0, 100);
    return this.sendCommand(`kick ${this._sanitizeName(player)} ${safeReason}`);
  }

  _sanitizeName(name) {
    if (!name || typeof name !== 'string') return 'Unknown';
    return name.replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 30);
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.connected = false;
    }
  }

  getStatus() {
    return {
      connected: this.connected,
      name: this.name,
      game: 'terraria',
      host: this.host,
      port: this.port,
      players: this.playerData?.length || 0,
      world: this.worldData?.name || 'Unknown'
    };
  }
}

class TerrariaWorld {
  constructor(agent) {
    this.agent = agent;
    this.tiles = new Map();
    this.npcs = [];
    this.chests = [];
  }

  async scanArea(x, y, radius = 50) {
    const tiles = [];
    for (let dx = -radius; dx <= radius; dx += 5) {
      for (let dy = -radius; dy <= radius; dy += 5) {
        tiles.push({ x: x + dx, y: y + dy });
      }
    }
    return tiles;
  }

  async findChest(x, y, radius = 100) {
    return [];
  }

  async findNPC(name) {
    return null;
  }
}

module.exports = { TerrariaAgent, TerrariaWorld };
