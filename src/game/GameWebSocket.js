const crypto = require('crypto');

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    crypto.randomBytes(1);
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

class GameWebSocket {
  constructor(server, gameManager, personalityManager) {
    this.server = server;
    this.game = gameManager;
    this.pm = personalityManager;
    this.clients = new Set();
    this.broadcastInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.apiKey = process.env.API_KEY || null;
    const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(o => o);
    this.allowedOrigins = origins.length > 0 ? origins : ['http://localhost:3000'];
    this.maxMessageSize = 10240;
    this.setup();
    this.startStatusBroadcast();
  }

  validateAuth(request) {
    if (!this.apiKey) {
      if (process.env.NODE_ENV === 'production') {
        return false;
      }
      return true;
    }
    
    const authHeader = request.headers['x-api-key'] || 
                       request.headers['authorization']?.replace('Bearer ', '') ||
                       request.url?.split('?')[1]?.match(/api_key=([^&]+)/)?.[1];
    
    if (!authHeader) return false;
    return timingSafeEqual(authHeader, this.apiKey);
  }

  validateOrigin(request) {
    const origin = request.headers['origin'];
    const referer = request.headers['referer'];
    return (
      (origin && this.allowedOrigins.includes(origin)) ||
      (referer && this.allowedOrigins.some(o => referer.startsWith(o)))
    );
  }

  validateMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type && typeof msg.type !== 'string') return false;
    if (msg.command && typeof msg.command !== 'string') return false;
    if (msg.command && msg.command.length > 500) return false;
    return true;
  }

  setup() {
    this.server.on('upgrade', (request, socket, head) => {
      if (request.url?.startsWith('/ws/game')) {
        if (!this.validateOrigin(request)) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          console.warn('[WS] Rejected connection: invalid origin');
          return;
        }
        if (!this.validateAuth(request)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        this.handleConnection(request, socket, head);
      }
    });
  }

  startStatusBroadcast() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
    
    this.broadcastInterval = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcastStatus();
      }
    }, 2000);
  }

  stopStatusBroadcast() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  handleConnection(request, socket, head) {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n');
    
    const client = {
      id: Date.now(),
      socket,
      lastPing: Date.now(),
      send: (data) => {
        if (socket.writable) {
          socket.write(JSON.stringify(data) + '\n');
        }
      }
    };

    const handleData = (data) => {
      try {
        if (data.length > this.maxMessageSize) {
          console.warn('[WS] Message too large:', data.length);
          return;
        }
        const msg = JSON.parse(data.toString());
        client.lastPing = Date.now();
        this.handleMessage(client, msg);
      } catch (e) {
        console.error('[WS] Parse error:', e.message);
      }
    };

    const handleEnd = () => {
      this.clients.delete(client);
      socket.removeListener('data', handleData);
      socket.removeListener('end', handleEnd);
      socket.removeListener('error', handleError);
      console.log(`[WS] Client disconnected: ${client.id}`);
    };

    const handleError = (err) => {
      this.clients.delete(client);
      socket.removeListener('data', handleData);
      socket.removeListener('end', handleEnd);
      socket.removeListener('error', handleError);
      console.error('[WS] Error:', err.message);
    };

    this.clients.add(client);
    socket.on('data', handleData);
    socket.on('end', handleEnd);
    socket.on('error', handleError);
    console.log(`[WS] Client connected: ${client.id}`);

    this.sendToClient(client, { type: 'connected', clientId: client.id });
    this.broadcastStatus();
  }

  handleMessage(client, msg) {
    if (!this.validateMessage(msg)) {
      console.warn('[WS] Invalid message structure');
      this.sendToClient(client, { type: 'error', message: 'Invalid message format' });
      return;
    }

    switch (msg.type) {
      case 'ping':
        this.sendToClient(client, { type: 'pong', timestamp: Date.now() });
        break;

      case 'game_status':
        this.sendToClient(client, { type: 'game_status', data: this.getGameStatus() });
        break;

      case 'mood':
        this.sendToClient(client, { type: 'mood', data: this.pm?.getMood() || 'neutral' });
        break;

      case 'events':
        this.sendToClient(client, { 
          type: 'events', 
          data: this.game?.eventHandler?.getEventHistory().slice(-20) || [] 
        });
        break;

      case 'game_command':
        this.handleGameCommand(client, msg.command);
        break;

      default:
        console.log('[WS] Unknown message type:', msg.type);
    }
  }

  getGameStatus() {
    if (!this.game) {
      return { enabled: false, connected: false };
    }
    
    const gameStatus = this.game.getStatus?.() || {};
    const botStatus = this.game.game?.getStatus?.() || {};
    
    return {
      enabled: true,
      connected: gameStatus.connected || false,
      bot: {
        username: botStatus.username || gameStatus.username || 'Bot',
        health: botStatus.health || gameStatus.health || 0,
        food: botStatus.food || gameStatus.food || 0,
        position: botStatus.position || gameStatus.position || { x: 0, y: 0, z: 0 },
        isAlive: (botStatus.health || gameStatus.health || 20) > 0
      },
      task: gameStatus.currentTask || null,
      recentEvents: this.game.eventHandler?.getEventHistory?.()?.slice(-10) || []
    };
  }

  async handleGameCommand(client, command) {
    if (!this.game) {
      this.sendToClient(client, { type: 'error', message: 'Game not enabled' });
      return;
    }

    this.sendToClient(client, { type: 'command_progress', message: '正在处理命令...', progress: 10 });

    try {
      const result = await this.game.handleMessage(command);
      this.sendToClient(client, { type: 'command_progress', message: '命令执行中...', progress: 50 });
      
      this.sendToClient(client, { type: 'command_result', command, result });
      
      if (result && result.ok) {
        this.sendToClient(client, { type: 'command_progress', message: '命令完成', progress: 100 });
      }
      
      this.broadcastStatus();
    } catch (err) {
      this.sendToClient(client, { type: 'error', message: err.message });
    }
  }

  sendToClient(client, data) {
    try {
      client.send(data);
    } catch (e) {
      console.error('[WS] Send error:', e.message);
    }
  }

  broadcast(data) {
    const disconnected = [];
    for (const client of this.clients) {
      try {
        client.send(data);
      } catch (e) {
        disconnected.push(client);
      }
    }
    
    for (const client of disconnected) {
      this.clients.delete(client);
    }
  }

  broadcastMoodChange(mood) {
    this.broadcast({ type: 'mood_change', mood, timestamp: Date.now() });
  }

  broadcastGameEvent(event) {
    this.broadcast({ type: 'game_event', event, timestamp: Date.now() });
  }

  broadcastStatus() {
    const status = this.getGameStatus();
    this.broadcast({ type: 'status_update', status, timestamp: Date.now() });
  }

  broadcastChat(message, sender) {
    this.broadcast({ type: 'chat', message, sender, timestamp: Date.now() });
  }

  broadcastProgress(message, progress) {
    this.broadcast({ type: 'command_progress', message, progress, timestamp: Date.now() });
  }

  getClientCount() {
    return this.clients.size;
  }

  destroy() {
    this.stopStatusBroadcast();
    for (const client of this.clients) {
      try {
        client.socket.destroy();
      } catch (e) {}
    }
    this.clients.clear();
  }
}

module.exports = GameWebSocket;
