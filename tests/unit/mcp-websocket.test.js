jest.mock('ws', () => {
  const MockWebSocket = function MockWebSocket() {
    this.on = jest.fn();
    this.send = jest.fn();
    this.readyState = 1;
  };
  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;
  return MockWebSocket;
});

const { MCPWebSocketHandler, getMCPWebSocketHandler, setupMCPWebSocket } = require('../../src/mcp/MCPWebSocket');
const MockWebSocket = require('ws');

describe('MCPWebSocketHandler', () => {
  let handler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllTimers();
    handler = new MCPWebSocketHandler();
  });

  afterEach(() => {
    handler.destroy();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes empty state', () => {
      expect(handler.clients).toBeInstanceOf(Map);
      expect(handler.clients.size).toBe(0);
      expect(handler.maxClients).toBe(100);
      expect(handler.bufferSize).toBe(100);
      expect(handler.logBuffer).toEqual([]);
      expect(handler.filters).toBeInstanceOf(Map);
    });

    it('accepts custom options', () => {
      const h = new MCPWebSocketHandler({ maxClients: 10, bufferSize: 20 });
      expect(h.maxClients).toBe(10);
      expect(h.bufferSize).toBe(20);
      h.destroy();
    });
  });

  describe('addClient', () => {
    it('adds a client with default subscriptions', () => {
      const ws = { readyState: 1, send: jest.fn() };
      const result = handler.addClient('client1', ws);
      expect(result.success).toBe(true);
      expect(result.clientId).toBe('client1');
      expect(handler.clients.size).toBe(1);
    });

    it('returns error when max clients reached', () => {
      handler.maxClients = 0;
      const result = handler.addClient('c1', {});
      expect(result.error).toBe('Max clients reached');
    });

    it('sends buffered events to new client matching filters', () => {
      handler.logBuffer.push({ type: 'mcp-call', server: 'fs' });
      handler.logBuffer.push({ type: 'mcp-error', server: 'dev' });
      const ws = { readyState: 1, send: jest.fn() };
      handler.addClient('c1', ws, { filters: { server: 'fs' } });
      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.server).toBe('fs');
    });

    it('accepts custom events and bufferSize', () => {
      const ws = { readyState: 1, send: jest.fn() };
      const result = handler.addClient('c1', ws, { events: ['custom'], bufferSize: 5 });
      expect(result.success).toBe(true);
      expect(handler.clients.get('c1').subscribedEvents).toEqual(['custom']);
      expect(handler.clients.get('c1').bufferSize).toBe(5);
    });
  });

  describe('removeClient', () => {
    it('removes existing client', () => {
      handler.clients.set('c1', { id: 'c1' });
      const result = handler.removeClient('c1');
      expect(result.success).toBe(true);
      expect(handler.clients.size).toBe(0);
    });

    it('returns error for unknown client', () => {
      expect(handler.removeClient('nobody')).toEqual({ error: 'Client not found' });
    });
  });

  describe('updateClientFilters', () => {
    it('updates filters for existing client', () => {
      handler.clients.set('c1', { id: 'c1', filters: {}, lastActivity: 0 });
      const result = handler.updateClientFilters('c1', { server: 'fs' });
      expect(result.success).toBe(true);
      expect(handler.clients.get('c1').filters).toEqual({ server: 'fs' });
    });

    it('returns error for unknown client', () => {
      expect(handler.updateClientFilters('nobody', {})).toEqual({ error: 'Client not found' });
    });
  });

  describe('subscribeToEvents', () => {
    it('adds events to subscription list', () => {
      handler.clients.set('c1', { id: 'c1', subscribedEvents: ['a'] });
      const result = handler.subscribeToEvents('c1', ['b', 'c']);
      expect(result.events).toEqual(['a', 'b', 'c']);
    });

    it('deduplicates events', () => {
      handler.clients.set('c1', { id: 'c1', subscribedEvents: ['a'] });
      const result = handler.subscribeToEvents('c1', ['a', 'b']);
      expect(result.events).toEqual(['a', 'b']);
    });

    it('returns error for unknown client', () => {
      expect(handler.subscribeToEvents('nobody', [])).toEqual({ error: 'Client not found' });
    });
  });

  describe('unsubscribeFromEvents', () => {
    it('removes events from subscription list', () => {
      handler.clients.set('c1', { id: 'c1', subscribedEvents: ['a', 'b', 'c'] });
      const result = handler.unsubscribeFromEvents('c1', ['a', 'c']);
      expect(result.events).toEqual(['b']);
    });

    it('returns error for unknown client', () => {
      expect(handler.unsubscribeFromEvents('nobody', [])).toEqual({ error: 'Client not found' });
    });
  });

  describe('_matchFilters', () => {
    it('returns true when filters object is empty', () => {
      expect(handler._matchFilters({}, {})).toBe(true);
    });

    it('returns true when filters is null', () => {
      expect(handler._matchFilters({}, null)).toBe(true);
    });

    it('filters by role', () => {
      const event = { user: { role: 'admin' } };
      expect(handler._matchFilters(event, { role: 'admin' })).toBe(true);
      expect(handler._matchFilters(event, { role: 'user' })).toBe(false);
    });

    it('filters by server', () => {
      expect(handler._matchFilters({ server: 'fs' }, { server: 'fs' })).toBe(true);
      expect(handler._matchFilters({ server: 'fs' }, { server: 'git' })).toBe(false);
    });

    it('filters by success', () => {
      expect(handler._matchFilters({ result: { success: true } }, { success: true })).toBe(true);
      expect(handler._matchFilters({ result: { success: true } }, { success: false })).toBe(false);
    });

    it('filters by minSeverity', () => {
      expect(handler._matchFilters({ severity: 'error' }, { minSeverity: 'warning' })).toBe(true);
      expect(handler._matchFilters({ severity: 'debug' }, { minSeverity: 'warning' })).toBe(false);
    });

    it('filters by toolPattern regex', () => {
      const e = { toolFullName: 'read_file' };
      expect(handler._matchFilters(e, { toolPattern: 'read' })).toBe(true);
      expect(handler._matchFilters(e, { toolPattern: 'write' })).toBe(false);
    });

    it('handles undefined toolFullName', () => {
      expect(handler._matchFilters({}, { toolPattern: 'read' })).toBe(false);
    });

    it('returns false for invalid regex pattern', () => {
      const e = { toolFullName: 'test' };
      expect(handler._matchFilters(e, { toolPattern: '[invalid' })).toBe(false);
    });

    it('returns true when pattern is too long', () => {
      const e = { toolFullName: 'test' };
      const longPattern = 'a'.repeat(201);
      expect(handler._matchFilters(e, { toolPattern: longPattern })).toBe(true);
    });

    it('skips filter for ReDoS pattern (returns true)', () => {
      const e = { toolFullName: 'test' };
      expect(handler._matchFilters(e, { toolPattern: '(a+)+b' })).toBe(true);
    });
  });

  describe('_hasReDoSPattern', () => {
    it('returns true for long patterns', () => {
      expect(handler._hasReDoSPattern('x'.repeat(201))).toBe(true);
    });

    it('returns true for ReDoS-like patterns', () => {
      expect(handler._hasReDoSPattern('(a+)+b')).toBe(true);
      expect(handler._hasReDoSPattern('(a*)*b')).toBe(true);
    });

    it('returns false for safe patterns', () => {
      expect(handler._hasReDoSPattern('simple')).toBe(false);
      expect(handler._hasReDoSPattern('[a-z]+')).toBe(false);
    });
  });

  describe('_getSeverityLevel', () => {
    it('maps valid severities', () => {
      expect(handler._getSeverityLevel('debug')).toBe(0);
      expect(handler._getSeverityLevel('info')).toBe(1);
      expect(handler._getSeverityLevel('warning')).toBe(2);
      expect(handler._getSeverityLevel('error')).toBe(3);
      expect(handler._getSeverityLevel('critical')).toBe(4);
    });

    it('returns 0 for unknown severity', () => {
      expect(handler._getSeverityLevel('unknown')).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('adds event to logBuffer', () => {
      handler.broadcast({ type: 'test' });
      expect(handler.logBuffer).toHaveLength(1);
    });

    it('trims logBuffer when it exceeds bufferSize * 2', () => {
      handler.bufferSize = 3;
      for (let i = 0; i < 10; i++) {
        handler.broadcast({ type: 't' });
      }
      expect(handler.logBuffer.length).toBeLessThanOrEqual(6);
    });

    it('sends to subscribed clients matching filters', () => {
      const ws = { readyState: 1, send: jest.fn() };
      handler.clients.set('c1', { subscribedEvents: ['mcp-call'], filters: {}, lastActivity: 0, ws });
      handler.broadcast({ type: 'mcp-call' });
      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('skips clients not subscribed to event type', () => {
      const ws = { readyState: 1, send: jest.fn() };
      handler.clients.set('c1', { subscribedEvents: ['other'], filters: {}, lastActivity: 0, ws });
      handler.broadcast({ type: 'mcp-call' });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('skips client when filters do not match in broadcast', () => {
      const ws = { readyState: 1, send: jest.fn() };
      handler.clients.set('c1', { subscribedEvents: ['mcp-call'], filters: { server: 'git' }, lastActivity: 0, ws });
      handler.broadcast({ type: 'mcp-call', server: 'fs' });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('uses "mcp-call" as default event type', () => {
      const ws = { readyState: 1, send: jest.fn() };
      handler.clients.set('c1', { subscribedEvents: ['mcp-call'], filters: {}, lastActivity: 0, ws });
      handler.broadcast({});
      expect(ws.send).toHaveBeenCalled();
    });
  });

  describe('_sendToClient', () => {
    it('sends JSON stringified event to client', () => {
      const ws = { readyState: 1, send: jest.fn() };
      handler.clients.set('c1', { ws, lastActivity: 0 });
      const result = handler._sendToClient('c1', { msg: 'hello' });
      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledWith('{"msg":"hello"}');
    });

    it('returns false and removes client when ws is not open', () => {
      const ws = { readyState: 3, send: jest.fn() };
      handler.clients.set('c1', { ws, lastActivity: 0 });
      expect(handler._sendToClient('c1', {})).toBe(false);
      expect(handler.clients.has('c1')).toBe(false);
    });

    it('returns false and removes client when ws.send throws', () => {
      const ws = { readyState: 1, send: jest.fn().mockImplementation(() => { throw new Error('conn lost'); }) };
      handler.clients.set('c1', { ws, lastActivity: 0 });
      expect(handler._sendToClient('c1', {})).toBe(false);
      expect(handler.clients.has('c1')).toBe(false);
    });

    it('returns false when client not found', () => {
      expect(handler._sendToClient('nobody', {})).toBe(false);
    });
  });

  describe('sendToClient', () => {
    it('delegates to _sendToClient', () => {
      const mock = jest.spyOn(handler, '_sendToClient').mockReturnValue(true);
      handler.sendToClient('c1', {});
      expect(mock).toHaveBeenCalledWith('c1', {});
      mock.mockRestore();
    });
  });

  describe('notifyCall', () => {
    it('broadcasts mcp-call for success', () => {
      const spy = jest.spyOn(handler, 'broadcast');
      handler.notifyCall({ success: true, tool: 'read' });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mcp-call', tool: 'read' }));
      spy.mockRestore();
    });

    it('broadcasts mcp-error for failure', () => {
      const spy = jest.spyOn(handler, 'broadcast');
      handler.notifyCall({ success: false, tool: 'write' });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mcp-error', tool: 'write' }));
      spy.mockRestore();
    });
  });

  describe('notifyAlert', () => {
    it('broadcasts mcp-alert', () => {
      const spy = jest.spyOn(handler, 'broadcast');
      handler.notifyAlert({ level: 'high' });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mcp-alert', level: 'high' }));
      spy.mockRestore();
    });
  });

  describe('notifyServerEvent', () => {
    it('broadcasts mcp-server-event', () => {
      const spy = jest.spyOn(handler, 'broadcast');
      handler.notifyServerEvent({ status: 'ok' });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'mcp-server-event', status: 'ok' }));
      spy.mockRestore();
    });
  });

  describe('getStats', () => {
    it('returns stats with client info', () => {
      const ws = { readyState: 1, send: jest.fn() };
      handler.clients.set('c1', { id: 'c1', subscribedEvents: ['a'], lastActivity: 123, filters: {}, ws });
      const stats = handler.getStats();
      expect(stats.totalClients).toBe(1);
      expect(stats.maxClients).toBe(100);
      expect(stats.clients[0].id).toBe('c1');
    });
  });

  describe('getRecentLogs', () => {
    it('returns last N logs', () => {
      for (let i = 0; i < 10; i++) handler.logBuffer.push({ idx: i });
      const logs = handler.getRecentLogs({ limit: 3 });
      expect(logs).toHaveLength(3);
      expect(logs[0].idx).toBe(7);
    });

    it('returns all logs when logBuffer smaller than limit', () => {
      handler.logBuffer.push({ a: 1 });
      expect(handler.getRecentLogs({ limit: 10 })).toHaveLength(1);
    });

    it('uses defaults when no arguments passed', () => {
      handler.logBuffer.push({ a: 1 });
      expect(handler.getRecentLogs()).toHaveLength(1);
    });

    it('filters by server', () => {
      handler.logBuffer.push({ server: 'fs' }, { server: 'git' }, { server: 'fs' });
      const logs = handler.getRecentLogs({ filter: { server: 'fs' } });
      expect(logs).toHaveLength(2);
    });

    it('filters by role', () => {
      handler.logBuffer.push({ user: { role: 'admin' } }, { user: { role: 'user' } });
      const logs = handler.getRecentLogs({ filter: { role: 'admin' } });
      expect(logs).toHaveLength(1);
    });

    it('filters by success', () => {
      handler.logBuffer.push({ result: { success: true } }, { result: { success: false } });
      const logs = handler.getRecentLogs({ filter: { success: true } });
      expect(logs).toHaveLength(1);
    });
  });

  describe('_cleanupInactiveClients', () => {
    it('removes clients inactive for >5 minutes', () => {
      handler.clients.set('old', { lastActivity: Date.now() - 6 * 60 * 1000 });
      handler.clients.set('new', { lastActivity: Date.now() });
      handler._cleanupInactiveClients();
      expect(handler.clients.has('old')).toBe(false);
      expect(handler.clients.has('new')).toBe(true);
    });
  });

  describe('_startCleanup', () => {
    it('triggers cleanup on interval', () => {
      const spy = jest.spyOn(handler, '_cleanupInactiveClients');
      jest.advanceTimersByTime(60000);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('destroy', () => {
    it('clears interval, clients, and buffer', () => {
      handler.clients.set('c1', { ws: { close: jest.fn(), readyState: 1 } });
      handler.logBuffer.push({ x: 1 });
      handler.destroy();
      expect(handler.clients.size).toBe(0);
      expect(handler.logBuffer).toEqual([]);
    });

    it('handles ws.close throwing', () => {
      handler.clients.set('c1', { ws: { close: jest.fn().mockImplementation(() => { throw new Error('err'); }) } });
      expect(() => handler.destroy()).not.toThrow();
    });

    it('handles destroy without cleanup interval', () => {
      handler._cleanupInterval = null;
      expect(() => handler.destroy()).not.toThrow();
    });
  });
});

describe('getMCPWebSocketHandler', () => {
  it('returns singleton instance', () => {
    const a = getMCPWebSocketHandler();
    const b = getMCPWebSocketHandler();
    expect(a).toBe(b);
    a.destroy();
  });
});

describe('setupMCPWebSocket', () => {
  function makeMockWS() {
    const ws = new MockWebSocket();
    ws.on = jest.fn();
    ws.send = jest.fn();
    ws.readyState = 1;
    return ws;
  }

  it('sets up event handlers on ws object', () => {
    const ws = makeMockWS();
    const result = setupMCPWebSocket(ws);
    expect(result).toHaveProperty('clientId');
    expect(result).toHaveProperty('handler');
    expect(ws.on).toHaveBeenCalledWith('open', expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith('message', expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('skips New WebSocket when already an instance', () => {
    const ws = makeMockWS();
    const result = setupMCPWebSocket(ws);
    expect(result.clientId).toMatch(/^mcp_/);
  });

  it('handles message actions', () => {
    const ws = makeMockWS();
    const _handler = setupMCPWebSocket(ws).handler;

    const msgCb = ws.on.mock.calls.find(c => c[0] === 'message')[1];
    ws.send.mockClear();
    msgCb(JSON.stringify({ action: 'ping' }));
    const pongMsg = JSON.parse(ws.send.mock.calls[ws.send.mock.calls.length - 1][0]);
    expect(pongMsg.type).toBe('pong');
  });

  it('handles invalid message format', () => {
    const ws = makeMockWS();
    setupMCPWebSocket(ws);
    const msgCb = ws.on.mock.calls.find(c => c[0] === 'message')[1];
    ws.send.mockClear();
    msgCb('not json');
    const errMsg = JSON.parse(ws.send.mock.calls[ws.send.mock.calls.length - 1][0]);
    expect(errMsg.type).toBe('error');
  });

  it('removes client on close', () => {
    const ws = makeMockWS();
    const spy = jest.spyOn(MCPWebSocketHandler.prototype, 'removeClient');
    const { handler: _handler } = setupMCPWebSocket(ws);
    const closeCb = ws.on.mock.calls.find(c => c[0] === 'close')[1];
    closeCb();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('removes client on error', () => {
    const ws = makeMockWS();
    const spy = jest.spyOn(MCPWebSocketHandler.prototype, 'removeClient');
    setupMCPWebSocket(ws);
    const errCb = ws.on.mock.calls.find(c => c[0] === 'error')[1];
    errCb(new Error('test'));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('handles message subscribe action', () => {
    const ws = makeMockWS();
    const { handler } = setupMCPWebSocket(ws);
    const spy = jest.spyOn(handler, 'subscribeToEvents');
    const msgCb = ws.on.mock.calls.find(c => c[0] === 'message')[1];
    msgCb(JSON.stringify({ action: 'subscribe', events: ['x'] }));
    expect(spy).toHaveBeenCalledWith(expect.any(String), ['x']);
    spy.mockRestore();
  });

  it('handles message unsubscribe action', () => {
    const ws = makeMockWS();
    const { handler } = setupMCPWebSocket(ws);
    const spy = jest.spyOn(handler, 'unsubscribeFromEvents');
    const msgCb = ws.on.mock.calls.find(c => c[0] === 'message')[1];
    msgCb(JSON.stringify({ action: 'unsubscribe', events: ['x'] }));
    expect(spy).toHaveBeenCalledWith(expect.any(String), ['x']);
    spy.mockRestore();
  });

  it('handles message filter action', () => {
    const ws = makeMockWS();
    const { handler } = setupMCPWebSocket(ws);
    const spy = jest.spyOn(handler, 'updateClientFilters');
    const msgCb = ws.on.mock.calls.find(c => c[0] === 'message')[1];
    msgCb(JSON.stringify({ action: 'filter', filters: { server: 'fs' } }));
    expect(spy).toHaveBeenCalledWith(expect.any(String), { server: 'fs' });
    spy.mockRestore();
  });

  it('handles message get-logs action', () => {
    const ws = makeMockWS();
    const { handler } = setupMCPWebSocket(ws);
    handler.logBuffer.push({ type: 'test' });
    const msgCb = ws.on.mock.calls.find(c => c[0] === 'message')[1];
    ws.send.mockClear();
    msgCb(JSON.stringify({ action: 'get-logs', options: { limit: 10 } }));
    const logMsg = JSON.parse(ws.send.mock.calls[ws.send.mock.calls.length - 1][0]);
    expect(logMsg.type).toBe('logs');
    expect(logMsg.logs).toHaveLength(1);
  });

  it('sends connected message on open', () => {
    const ws = makeMockWS();
    setupMCPWebSocket(ws);
    const openCb = ws.on.mock.calls.find(c => c[0] === 'open')[1];
    ws.send.mockClear();
    openCb();
    const calls = ws.send.mock.calls.map(c => JSON.parse(c[0]));
    const connectedMsg = calls.find(c => c.type === 'connected');
    expect(connectedMsg).toBeDefined();
    expect(connectedMsg).toHaveProperty('clientId');
  });

  it('creates new WebSocket when arg is not an instance', () => {
    const plainObj = { on: jest.fn(), send: jest.fn(), readyState: 1 };
    const result = setupMCPWebSocket(plainObj);
    expect(result).toHaveProperty('clientId');
    expect(result).toHaveProperty('handler');
  });
});
