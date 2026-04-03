/**
 * MCP WebSocket Handler
 * 提供实时日志流和事件推送
 */

const { EventEmitter } = require('events');

class MCPWebSocketHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.clients = new Map();
    this.maxClients = options.maxClients || 100;
    this.bufferSize = options.bufferSize || 100;
    this.logBuffer = [];
    this.filters = new Map();
    
    this._startCleanup();
  }

  _startCleanup() {
    this._cleanupInterval = setInterval(() => {
      this._cleanupInactiveClients();
    }, 60000);
  }

  _cleanupInactiveClients() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000;

    for (const [clientId, client] of this.clients) {
      if (now - client.lastActivity > timeout) {
        this.clients.delete(clientId);
        this.emit('client-disconnected', { clientId, reason: 'timeout' });
      }
    }
  }

  addClient(clientId, ws, options = {}) {
    if (this.clients.size >= this.maxClients) {
      return { error: 'Max clients reached' };
    }

    const clientInfo = {
      id: clientId,
      ws,
      subscribedEvents: options.events || ['mcp-call', 'mcp-error', 'mcp-alert'],
      filters: options.filters || {},
      bufferSize: options.bufferSize || this.bufferSize,
      clientBuffer: [],
      lastActivity: Date.now()
    };

    this.clients.set(clientId, clientInfo);
    this.emit('client-connected', { clientId });

    for (const event of this.logBuffer.slice(-clientInfo.bufferSize)) {
      if (this._matchFilters(event, clientInfo.filters)) {
        this._sendToClient(clientId, event);
      }
    }

    return { success: true, clientId };
  }

  removeClient(clientId) {
    if (this.clients.delete(clientId)) {
      this.emit('client-disconnected', { clientId, reason: 'manual' });
      return { success: true };
    }
    return { error: 'Client not found' };
  }

  updateClientFilters(clientId, filters) {
    const client = this.clients.get(clientId);
    if (!client) return { error: 'Client not found' };
    
    client.filters = filters;
    client.lastActivity = Date.now();
    return { success: true };
  }

  subscribeToEvents(clientId, events) {
    const client = this.clients.get(clientId);
    if (!client) return { error: 'Client not found' };
    
    client.subscribedEvents = [...new Set([...client.subscribedEvents, ...events])];
    return { success: true, events: client.subscribedEvents };
  }

  unsubscribeFromEvents(clientId, events) {
    const client = this.clients.get(clientId);
    if (!client) return { error: 'Client not found' };
    
    client.subscribedEvents = client.subscribedEvents.filter(e => !events.includes(e));
    return { success: true, events: client.subscribedEvents };
  }

  _matchFilters(event, filters) {
    if (!filters || Object.keys(filters).length === 0) return true;

    if (filters.role && event.user?.role !== filters.role) return false;
    if (filters.server && event.server !== filters.server) return false;
    if (filters.success !== undefined && event.result?.success !== filters.success) return false;
    if (filters.minSeverity && this._getSeverityLevel(event.severity) < this._getSeverityLevel(filters.minSeverity)) return false;
    if (filters.toolPattern && !new RegExp(filters.toolPattern).test(event.toolFullName || '')) return false;

    return true;
  }

  _getSeverityLevel(severity) {
    const levels = { debug: 0, info: 1, warning: 2, error: 3, critical: 4 };
    return levels[severity] || 0;
  }

  broadcast(event) {
    this.logBuffer.push(event);
    if (this.logBuffer.length > this.bufferSize * 2) {
      this.logBuffer = this.logBuffer.slice(-this.bufferSize);
    }

    const eventType = event.type || 'mcp-call';
    
    for (const [clientId, client] of this.clients) {
      if (!client.subscribedEvents.includes(eventType)) continue;
      if (!this._matchFilters(event, client.filters)) continue;
      
      this._sendToClient(clientId, event);
    }
  }

  _sendToClient(clientId, event) {
    const client = this.clients.get(clientId);
    if (!client || !client.ws || client.ws.readyState !== 1) {
      this.clients.delete(clientId);
      return false;
    }

    try {
      client.ws.send(JSON.stringify(event));
      client.lastActivity = Date.now();
      return true;
    } catch (error) {
      this.emit('send-error', { clientId, error: error.message });
      this.clients.delete(clientId);
      return false;
    }
  }

  sendToClient(clientId, event) {
    return this._sendToClient(clientId, event);
  }

  notifyCall(callData) {
    this.broadcast({
      type: callData.success ? 'mcp-call' : 'mcp-error',
      timestamp: Date.now(),
      ...callData
    });
  }

  notifyAlert(alertData) {
    this.broadcast({
      type: 'mcp-alert',
      timestamp: Date.now(),
      ...alertData
    });
  }

  notifyServerEvent(event) {
    this.broadcast({
      type: 'mcp-server-event',
      timestamp: Date.now(),
      ...event
    });
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      maxClients: this.maxClients,
      bufferSize: this.logBuffer.length,
      clients: Array.from(this.clients.values()).map(c => ({
        id: c.id,
        subscribedEvents: c.subscribedEvents,
        lastActivity: c.lastActivity
      }))
    };
  }

  getRecentLogs(options = {}) {
    const limit = options.limit || 50;
    const filter = options.filter || {};
    
    let logs = this.logBuffer.slice(-limit * 2);
    
    if (filter.server) {
      logs = logs.filter(l => l.server === filter.server);
    }
    if (filter.role) {
      logs = logs.filter(l => l.user?.role === filter.role);
    }
    if (filter.success !== undefined) {
      logs = logs.filter(l => l.result?.success === filter.success);
    }
    
    return logs.slice(-limit);
  }

  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
    }
    
    for (const [clientId, client] of this.clients) {
      try {
        if (client.ws && client.ws.close) {
          client.ws.close(1000, 'Server shutdown');
        }
      } catch (e) {}
    }
    
    this.clients.clear();
    this.logBuffer = [];
  }
}

let globalWSHandler = null;

function getMCPWebSocketHandler() {
  if (!globalWSHandler) {
    globalWSHandler = new MCPWebSocketHandler();
  }
  return globalWSHandler;
}

function setupMCPWebSocket(ws, req) {
  const WebSocket = require('ws');
  
  if (!(ws instanceof WebSocket)) {
    ws = new WebSocket(req);
  }
  
  const clientId = `mcp_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  const handler = getMCPWebSocketHandler();
  
  ws.on('open', () => {
    handler.addClient(clientId, ws);
    ws.send(JSON.stringify({ type: 'connected', clientId }));
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      switch (msg.action) {
        case 'subscribe':
          handler.subscribeToEvents(clientId, msg.events);
          break;
        case 'unsubscribe':
          handler.unsubscribeFromEvents(clientId, msg.events);
          break;
        case 'filter':
          handler.updateClientFilters(clientId, msg.filters);
          break;
        case 'get-logs':
          const logs = handler.getRecentLogs(msg.options);
          ws.send(JSON.stringify({ type: 'logs', logs }));
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
  
  ws.on('close', () => {
    handler.removeClient(clientId);
  });
  
  ws.on('error', (error) => {
    handler.removeClient(clientId);
  });
  
  return { clientId, handler };
}

module.exports = {
  MCPWebSocketHandler,
  getMCPWebSocketHandler,
  setupMCPWebSocket
};
