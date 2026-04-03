const net = require('net');

class FactorioRCON {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 27015;
    this.password = options.password || '';
    this.connected = false;
    this.socket = null;
    this.requestId = 0;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      
      this.socket.connect(this.port, this.host, () => {
        this.connected = true;
        console.log('[Factorio] Connected to RCON');
        
        this.sendRaw(3, this.password).catch(console.error);
        resolve();
      });

      this.socket.on('data', (data) => {
        this._handlePacket(data);
      });

      this.socket.on('close', () => {
        this.connected = false;
        console.log('[Factorio] RCON disconnected');
      });

      this.socket.on('error', (err) => {
        console.error('[Factorio] RCON error:', err.message);
        reject(err);
      });
    });
  }

  _handlePacket(data) {
    let offset = 0;
    
    while (offset + 4 <= data.length) {
      const size = data.readInt32LE(offset);
      
      if (size <= 0 || size > 32768) {
        console.warn('[Factorio] Invalid packet size:', size);
        break;
      }
      
      if (offset + 4 + size > data.length) {
        console.warn('[Factorio] Incomplete packet, waiting for more data');
        break;
      }
      
      const packetEnd = offset + 4 + size;
      if (packetEnd - (offset + 4) < 12) {
        offset = packetEnd;
        continue;
      }
      
      const packetData = data.slice(offset + 4, packetEnd);
      const requestId = packetData.readInt32LE(0);
      const type = packetData.readInt32LE(4);
      const payload = packetData.slice(8, packetData.length - 2).toString('utf8');
      
      if (this.pending.has(requestId)) {
        const { resolve, reject } = this.pending.get(requestId);
        this.pending.delete(requestId);
        
        if (type === 0 || type === 2) {
          resolve(payload);
        }
      }
      
      offset = packetEnd;
    }
  }

  async sendRaw(type, payload) {
    const requestId = ++this.requestId;
    const buffer = Buffer.alloc(4 + 4 + Buffer.byteLength(payload) + 2 + 2);
    
    let offset = 0;
    buffer.writeInt32LE(buffer.length - 4, offset);
    offset += 4;
    buffer.writeInt32LE(requestId, offset);
    offset += 4;
    buffer.writeInt32LE(type, offset);
    offset += 4;
    buffer.write(payload, offset, 'utf8');
    offset += Buffer.byteLength(payload);
    buffer.writeInt16LE(0, offset);
    
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected'));
        return;
      }
      
      this.pending.set(requestId, { resolve, reject });
      this.socket.write(buffer);
      
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error('RCON timeout'));
        }
      }, 5000);
    });
  }

  async sendCommand(command) {
    if (!this._validateCommand(command)) {
      throw new Error('Command not allowed');
    }
    try {
      return await this.sendRaw(2, command);
    } catch (err) {
      console.error('[Factorio] Command failed:', err.message);
      throw err;
    }
  }

  _validateCommand(command) {
    if (!command || typeof command !== 'string') return false;
    if (command.length > 500) return false;
    
    const allowedCommands = [
      '/players', '/command', '/help', '/server-save',
      'players', 'server-save',
      'script-output'
    ];
    
    const trimmed = command.trim().toLowerCase();
    
    for (const allowed of allowedCommands) {
      if (trimmed.startsWith(allowed) || trimmed === allowed) {
        return true;
      }
    }
    
    if (/^[a-z][a-z0-9_-]*$/i.test(command.trim())) {
      return true;
    }
    
    const safePattern = /^[\w\s\/=._-]+$/;
    if (!safePattern.test(command)) {
      return false;
    }
    
    const dangerous = [';', '&&', '||', '|', '`', '$(', '\n', '\r', '\0'];
    for (const char of dangerous) {
      if (command.includes(char)) {
        return false;
      }
    }
    
    return true;
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.connected = false;
    }
  }
}

class FactorioAgent {
  constructor(options = {}) {
    this.rcon = new FactorioRCON({
      host: options.host || 'localhost',
      port: options.port || 27015,
      password: options.password || ''
    });
    this.connected = false;
    this.name = options.name || 'FactorioBot';
  }

  async connect() {
    await this.rcon.connect();
    this.connected = true;
    return { ok: true };
  }

  disconnect() {
    this.rcon.disconnect();
    this.connected = false;
  }

  getStatus() {
    return {
      connected: this.connected,
      name: this.name,
      game: 'factorio'
    };
  }

  async sendCommand(command) {
    if (!this.connected) {
      return { ok: false, error: 'Not connected' };
    }
    
    try {
      const result = await this.rcon.sendCommand(command);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async getSurface() {
    return this.sendCommand('/players');
  }

  async getInventory() {
    return this.sendCommand('/players[1].color');
  }
}

module.exports = { FactorioAgent, FactorioRCON };
