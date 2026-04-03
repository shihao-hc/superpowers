/**
 * UltraWork WebSocket Service
 * Real-time communication for AI interactions
 */

const { EventEmitter } = require('events');
const { escapeHtml } = require('../utils/logger');
const crypto = require('crypto');

const MESSAGE_TYPES = {
  CHAT: 'chat_message',
  STREAM_START: 'stream_start',
  STREAM_CHUNK: 'stream_chunk',
  STREAM_END: 'stream_end',
  TYPING: 'typing',
  EMOTION_UPDATE: 'emotion_update',
  SKILL_EXECUTE: 'skill_execute',
  SKILL_PROGRESS: 'skill_progress',
  SKILL_RESULT: 'skill_result',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect'
};

const MAX_MESSAGE_LENGTH = 50000;
const HEARTBEAT_INTERVAL = 30000;
const MAX_RECONNECT_ATTEMPTS = 5;

class WebSocketService extends EventEmitter {
  constructor() {
    super();
    
    this.clients = new Map();
    this.sessions = new Map();
    this.rooms = new Map();
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalMessages: 0,
      totalBytes: 0
    };

    this.heartbeatTimers = new Map();
  }

  registerClient(socketId, socket, metadata = {}) {
    const client = {
      id: socketId,
      socket,
      metadata,
      sessions: new Set(),
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      authenticated: false,
      userId: metadata.userId || null
    };

    this.clients.set(socketId, client);
    this.stats.activeConnections++;
    this.stats.totalConnections++;

    this._startHeartbeat(socketId);

    this.emit('client:connected', {
      socketId,
      metadata,
      activeConnections: this.stats.activeConnections
    });

    return client;
  }

  unregisterClient(socketId) {
    const client = this.clients.get(socketId);
    if (!client) return false;

    for (const sessionId of client.sessions) {
      this.leaveRoom(socketId, sessionId);
    }

    this._stopHeartbeat(socketId);
    this.clients.delete(socketId);
    this.stats.activeConnections--;

    this.emit('client:disconnected', {
      socketId,
      connectedDuration: Date.now() - client.connectedAt,
      messageCount: client.messageCount,
      activeConnections: this.stats.activeConnections
    });

    return true;
  }

  getClient(socketId) {
    return this.clients.get(socketId);
  }

  joinRoom(socketId, roomId) {
    const client = this.clients.get(socketId);
    if (!client) return false;

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    this.rooms.get(roomId).add(socketId);
    client.sessions.add(roomId);

    this.emit('room:joined', { socketId, roomId, roomSize: this.rooms.get(roomId).size });

    return true;
  }

  leaveRoom(socketId, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.delete(socketId);
    
    const client = this.clients.get(socketId);
    if (client) {
      client.sessions.delete(roomId);
    }

    if (room.size === 0) {
      this.rooms.delete(roomId);
    }

    this.emit('room:left', { socketId, roomId });

    return true;
  }

  broadcast(roomId, message, excludeSocketId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    let count = 0;
    for (const socketId of room) {
      if (socketId !== excludeSocketId) {
        this.send(socketId, message);
        count++;
      }
    }

    return count;
  }

  send(socketId, message) {
    const client = this.clients.get(socketId);
    if (!client || !client.socket) return false;

    try {
      client.socket.send(JSON.stringify(message));
      client.lastActivity = Date.now();
      return true;
    } catch (error) {
      this.emit('send:error', { socketId, error: error.message });
      return false;
    }
  }

  sendToRoom(roomId, event, data, excludeSocketId = null) {
    const message = { type: event, data, timestamp: Date.now() };
    return this.broadcast(roomId, message, excludeSocketId);
  }

  handleMessage(socketId, rawMessage) {
    const client = this.clients.get(socketId);
    if (!client) return;

    client.lastActivity = Date.now();
    client.messageCount++;
    this.stats.totalMessages++;

    if (typeof rawMessage === 'string') {
      try {
        const message = JSON.parse(rawMessage);
        this._processMessage(socketId, message);
      } catch (error) {
        this.send(socketId, {
          type: MESSAGE_TYPES.ERROR,
          error: 'Invalid JSON format'
        });
      }
    } else {
      this._processMessage(socketId, rawMessage);
    }
  }

  _processMessage(socketId, message) {
    const { type, data, id } = message;

    this.emit('message:received', { socketId, type, data });

    switch (type) {
      case MESSAGE_TYPES.CHAT:
        this._handleChat(socketId, data, id);
        break;

      case MESSAGE_TYPES.EMOTION_UPDATE:
        this._handleEmotionUpdate(socketId, data);
        break;

      case MESSAGE_TYPES.SKILL_EXECUTE:
        this._handleSkillExecute(socketId, data, id);
        break;

      case MESSAGE_TYPES.HEARTBEAT:
        this._handleHeartbeat(socketId, data);
        break;

      case 'join_room':
        this._handleJoinRoom(socketId, data);
        break;

      case 'leave_room':
        this._handleLeaveRoom(socketId, data);
        break;

      case 'authenticate':
        this._handleAuthenticate(socketId, data);
        break;

      default:
        this.emit(`message:${type}`, { socketId, data, id });
    }
  }

  _handleChat(socketId, data, messageId) {
    const { text, roomId, metadata } = data;

    if (!text || typeof text !== 'string') {
      this.send(socketId, {
        type: MESSAGE_TYPES.ERROR,
        error: 'Invalid message',
        originalId: messageId
      });
      return;
    }

    const truncatedText = text.substring(0, MAX_MESSAGE_LENGTH);

    this.emit('chat:message', {
      socketId,
      text: truncatedText,
      roomId,
      metadata,
      messageId
    });

    this.send(socketId, {
      type: MESSAGE_TYPES.ACK,
      originalId: messageId,
      timestamp: Date.now()
    });
  }

  _handleEmotionUpdate(socketId, data) {
    const { mood, intensity, expression } = data;

    this.emit('emotion:update', {
      socketId,
      mood,
      intensity,
      expression
    });

    const roomId = data.roomId;
    if (roomId) {
      this.sendToRoom(roomId, MESSAGE_TYPES.EMOTION_UPDATE, {
        socketId,
        mood,
        intensity,
        expression
      }, socketId);
    }
  }

  _handleSkillExecute(socketId, data, messageId) {
    const { skillName, parameters, roomId } = data;

    if (!skillName) {
      this.send(socketId, {
        type: MESSAGE_TYPES.ERROR,
        error: 'Skill name required',
        originalId: messageId
      });
      return;
    }

    this.emit('skill:execute', {
      socketId,
      skillName,
      parameters,
      roomId,
      messageId
    });

    this.send(socketId, {
      type: 'skill:started',
      skillName,
      originalId: messageId,
      executionId: this._generateExecutionId()
    });
  }

  _handleHeartbeat(socketId, data) {
    this.send(socketId, {
      type: MESSAGE_TYPES.HEARTBEAT,
      timestamp: Date.now(),
      serverTime: Date.now()
    });
  }

  _handleJoinRoom(socketId, data) {
    const { roomId } = data;

    if (!roomId) {
      this.send(socketId, {
        type: MESSAGE_TYPES.ERROR,
        error: 'Room ID required'
      });
      return;
    }

    this.joinRoom(socketId, roomId);

    this.send(socketId, {
      type: 'room:joined',
      roomId,
      roomSize: this.rooms.get(roomId)?.size || 1
    });
  }

  _handleLeaveRoom(socketId, data) {
    const { roomId } = data;

    if (roomId) {
      this.leaveRoom(socketId, roomId);

      this.send(socketId, {
        type: 'room:left',
        roomId
      });
    }
  }

  _handleAuthenticate(socketId, data) {
    const client = this.clients.get(socketId);
    if (!client) return;

    const { token, userId } = data;

    if (token && this._validateToken(token)) {
      client.authenticated = true;
      client.userId = userId;

      this.send(socketId, {
        type: 'auth:success',
        userId
      });
    } else {
      this.send(socketId, {
        type: 'auth:failed',
        error: 'Invalid token'
      });
    }
  }

  _validateToken(token) {
    if (!token || typeof token !== 'string') return false;
    return token.length >= 10;
  }

  _generateExecutionId() {
    return `exec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  _startHeartbeat(socketId) {
    this._stopHeartbeat(socketId);

    const timer = setInterval(() => {
      const client = this.clients.get(socketId);
      if (!client) {
        this._stopHeartbeat(socketId);
        return;
      }

      const now = Date.now();
      const inactiveTime = now - client.lastActivity;

      if (inactiveTime > HEARTBEAT_INTERVAL * 2) {
        this.emit('client:timeout', { socketId, inactiveTime });
        this.unregisterClient(socketId);
        this._stopHeartbeat(socketId);
      }
    }, HEARTBEAT_INTERVAL);

    this.heartbeatTimers.set(socketId, timer);
  }

  _stopHeartbeat(socketId) {
    const timer = this.heartbeatTimers.get(socketId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(socketId);
    }
  }

  streamStart(socketId, streamId, metadata = {}) {
    return this.send(socketId, {
      type: MESSAGE_TYPES.STREAM_START,
      streamId,
      metadata,
      timestamp: Date.now()
    });
  }

  streamChunk(socketId, streamId, chunk, progress = null) {
    return this.send(socketId, {
      type: MESSAGE_TYPES.STREAM_CHUNK,
      streamId,
      chunk,
      progress,
      timestamp: Date.now()
    });
  }

  streamEnd(socketId, streamId, finalContent = '') {
    return this.send(socketId, {
      type: MESSAGE_TYPES.STREAM_END,
      streamId,
      finalContent,
      timestamp: Date.now()
    });
  }

  sendTyping(socketId, isTyping) {
    return this.send(socketId, {
      type: MESSAGE_TYPES.TYPING,
      isTyping,
      timestamp: Date.now()
    });
  }

  sendError(socketId, error, originalId = null) {
    return this.send(socketId, {
      type: MESSAGE_TYPES.ERROR,
      error: escapeHtml(String(error)),
      originalId,
      timestamp: Date.now()
    });
  }

  getStats() {
    return {
      ...this.stats,
      rooms: this.rooms.size,
      roomDistribution: Object.fromEntries(
        [...this.rooms.entries()].map(([id, clients]) => [id, clients.size])
      )
    };
  }

  cleanupInactiveClients(maxInactiveTime = 3600000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [socketId, client] of this.clients) {
      if (now - client.lastActivity > maxInactiveTime) {
        this.unregisterClient(socketId);
        cleaned++;
      }
    }

    return cleaned;
  }

  destroy() {
    for (const socketId of this.heartbeatTimers.keys()) {
      this._stopHeartbeat(socketId);
    }

    for (const socketId of this.clients.keys()) {
      this.unregisterClient(socketId);
    }

    this.clients.clear();
    this.sessions.clear();
    this.rooms.clear();
  }
}

const wsService = new WebSocketService();

module.exports = wsService;
module.exports.WebSocketService = WebSocketService;
module.exports.MESSAGE_TYPES = MESSAGE_TYPES;
