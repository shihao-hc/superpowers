/**
 * ResilientWebSocket - 带断线重连的WebSocket管理器
 * 
 * 功能:
 * - 自动重连 (指数退避)
 * - 心跳检测
 * - 消息队列
 * - 状态跟踪
 * - URL验证
 */

class ResilientWebSocket {
  constructor(options = {}) {
    this.url = this._validateUrl(options.url || '');
    this.protocols = options.protocols || [];
    this.allowedOrigins = options.allowedOrigins || [window.location.origin];
    
    this.ws = null;
    this.state = 'disconnected';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.baseReconnectDelay = options.reconnectDelay || 1000;
    this.maxReconnectDelay = options.maxReconnectDelay || 30000;
    
    this.heartbeatInterval = options.heartbeatInterval || 25000;
    this.heartbeatTimeout = options.heartbeatTimeout || 10000;
    this.heartbeatTimer = null;
    this.lastHeartbeat = 0;
    
    this.messageQueue = [];
    this.maxQueueSize = options.maxQueueSize || 100;
    
    this.handlers = {
      onOpen: options.onOpen || (() => {}),
      onClose: options.onClose || (() => {}),
      onMessage: options.onMessage || (() => {}),
      onError: options.onError || (() => {}),
      onReconnect: options.onReconnect || (() => {}),
      onStateChange: options.onStateChange || (() => {})
    };
    
    this._setupOnlineListener();
  }

  _setupOnlineListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.state === 'disconnected') {
          console.log('[WS] Network online, attempting reconnect');
          this.connect();
        }
      });
    }
  }

  _validateUrl(url) {
    if (!url) return '';
    
    try {
      const parsed = new URL(url);
      if (!['ws:', 'wss:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
      return parsed.href;
    } catch (e) {
      console.error('[WS] Invalid URL:', url, e.message);
      return '';
    }
  }

  connect() {
    if (!this.url) {
      console.error('[WS] No valid URL configured');
      return;
    }

    if (this.state === 'connecting' || this.state === 'connected') {
      return;
    }

    this._setState('connecting');

    try {
      this.ws = new WebSocket(this.url, this.protocols);
      
      this.ws.onopen = (event) => {
        console.log('[WS] Connected');
        this.reconnectAttempts = 0;
        this._setState('connected');
        this._flushMessageQueue();
        this._startHeartbeat();
        this.handlers.onOpen(event);
      };
      
      this.ws.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason);
        this._stopHeartbeat();
        this._setState('disconnected');
        this.handlers.onClose(event);
        
        if (!event.wasClean && event.code !== 1000) {
          this._scheduleReconnect();
        }
      };
      
      this.ws.onmessage = (event) => {
        this.lastHeartbeat = Date.now();
        
        if (event.data === 'PONG') {
          return;
        }
        
        try {
          const data = JSON.parse(event.data);
          this.handlers.onMessage(data, event);
        } catch {
          this.handlers.onMessage(event.data, event);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this.handlers.onError(error);
      };
    } catch (error) {
      console.error('[WS] Failed to create WebSocket:', error);
      this._setState('disconnected');
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnection attempts reached');
      this._setState('failed');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    const jitter = delay * 0.1 * (Math.random() - 0.5);
    const reconnectDelay = delay + jitter;

    console.log(`[WS] Reconnecting in ${Math.round(reconnectDelay)}ms (attempt ${this.reconnectAttempts + 1})`);
    
    this._setState('reconnecting');
    this.reconnectAttempts++;

    setTimeout(() => {
      this.connect();
      this.handlers.onReconnect(this.reconnectAttempts);
    }, reconnectDelay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'connected') {
        if (Date.now() - this.lastHeartbeat > this.heartbeatTimeout) {
          console.warn('[WS] Heartbeat timeout, closing connection');
          this.ws.close(4000, 'Heartbeat timeout');
          return;
        }
        
        this.send('PING');
      }
    }, this.heartbeatInterval);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(data) {
    const message = typeof data === 'object' ? JSON.stringify(data) : data;
    
    if (this.state === 'connected' && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
      return true;
    } else {
      if (this.messageQueue.length < this.maxQueueSize) {
        this.messageQueue.push(message);
      } else {
        console.warn('[WS] Message queue full, dropping message');
      }
      return false;
    }
  }

  sendAsync(data, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (this.state !== 'connected') {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = Math.random().toString(36).substr(2, 9);
      const message = { id, data };
      
      const timeoutId = setTimeout(() => {
        reject(new Error('Send timeout'));
      }, timeout);

      const handler = (response) => {
        if (response.id === id) {
          clearTimeout(timeoutId);
          this.ws.removeEventListener('message', handler);
          resolve(response);
        }
      };

      this.ws.addEventListener('message', handler);
      this.send(message);
    });
  }

  _flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.state === 'connected') {
      const message = this.messageQueue.shift();
      this.ws.send(message);
    }
  }

  _setState(newState) {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.handlers.onStateChange(newState, oldState);
    }
  }

  disconnect(code = 1000, reason = 'Normal closure') {
    this._stopHeartbeat();
    this.reconnectAttempts = this.maxReconnectAttempts;
    
    if (this.ws) {
      this.ws.close(code, reason);
    }
    
    this._setState('disconnected');
  }

  getState() {
    return {
      state: this.state,
      reconnectAttempts: this.reconnectAttempts,
      queueSize: this.messageQueue.length,
      readyState: this.ws ? this.ws.readyState : WebSocket.CLOSED
    };
  }

  isConnected() {
    return this.state === 'connected' && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  clearQueue() {
    this.messageQueue = [];
  }

  destroy() {
    this.disconnect();
    this.messageQueue = [];
    this.handlers = {};
  }
}

/**
 * SocketIOManager - Socket.IO兼容的重连管理器
 */
class SocketIOManager {
  constructor(options = {}) {
    this.ws = new ResilientWebSocket({
      url: options.url,
      onOpen: () => this._onOpen(),
      onClose: (e) => this._onClose(e),
      onMessage: (data) => this._onMessage(data),
      ...options
    });
    
    this.handlers = new Map();
    this.authToken = null;
  }

  _onOpen() {
    if (this.authToken) {
      this.ws.send({ type: 'auth', token: this.authToken });
    }
    this._emit('connect');
  }

  _onClose(event) {
    this._emit('disconnect', event);
  }

  _onMessage(data) {
    if (data && data.event) {
      this._emit(data.event, data.data);
    }
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  off(event, handler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  _emit(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error('[SocketIO] Handler error:', e);
        }
      });
    }
  }

  emit(event, data) {
    this.ws.send({ event, data });
  }

  authenticate(token) {
    this.authToken = token;
    if (this.ws.isConnected()) {
      this.ws.send({ type: 'auth', token });
    }
  }

  connect() {
    this.ws.connect();
  }

  disconnect() {
    this.ws.disconnect();
  }

  getState() {
    return this.ws.getState();
  }
}

if (typeof window !== 'undefined') {
  window.ResilientWebSocket = ResilientWebSocket;
  window.SocketIOManager = SocketIOManager;
}

if (typeof module !== 'undefined') {
  module.exports = { ResilientWebSocket, SocketIOManager };
}
