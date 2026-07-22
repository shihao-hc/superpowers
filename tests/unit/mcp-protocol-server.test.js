jest.mock('ws', () => {
  const MockWebSocket = function MockWebSocket() {};
  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;
  MockWebSocket.Server = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn()
  }));
  return MockWebSocket;
});

const { MCPServer } = require('../../src/mcp/MCPProtocolServer');
const WebSocket = require('ws');

function makeMockWs() {
  return { on: jest.fn(), send: jest.fn(), close: jest.fn(), readyState: WebSocket.OPEN };
}

describe('MCPServer', () => {
  let server;

  beforeEach(() => {
    jest.clearAllMocks();
    server = new MCPServer();
  });

  afterEach(() => {
    server.removeAllListeners();
  });

  describe('constructor', () => {
    it('initializes with default options', () => {
      expect(server.options.port).toBe(3100);
      expect(server.options.host).toBe('localhost');
    });

    it('accepts custom options', () => {
      const s = new MCPServer({ port: 9999, host: '0.0.0.0' });
      expect(s.options.port).toBe(9999);
      expect(s.options.host).toBe('0.0.0.0');
    });

    it('calls setupDefaultHandlers', () => {
      expect(server.requestHandlers.has('initialize')).toBe(true);
      expect(server.requestHandlers.has('tools/list')).toBe(true);
      expect(server.requestHandlers.has('tools/call')).toBe(true);
      expect(server.requestHandlers.has('resources/list')).toBe(true);
      expect(server.requestHandlers.has('resources/read')).toBe(true);
      expect(server.requestHandlers.has('prompts/list')).toBe(true);
      expect(server.requestHandlers.has('prompts/get')).toBe(true);
    });

    it('sets up notification handlers', () => {
      expect(server.notificationHandlers.has('initialized')).toBe(true);
      expect(server.notificationHandlers.has('ping')).toBe(true);
    });

    it('is an EventEmitter', () => {
      expect(server).toHaveProperty('emit');
      expect(server).toHaveProperty('on');
    });

    it('initializes empty capabilities', () => {
      expect(server.capabilities).toEqual({ tools: {}, resources: {}, prompts: {} });
    });
  });

  describe('start', () => {
    it('creates WebSocket.Server with correct options', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      await server.start();
      expect(WebSocket.Server).toHaveBeenCalledWith({ port: 3100, host: 'localhost' });
    });

    it('sets up connection listener', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(server, 'handleConnection').mockImplementation(() => {});
      await server.start();
      const mockWss = WebSocket.Server.mock.results[0].value;
      const connCb = mockWss.on.mock.calls.find(c => c[0] === 'connection')[1];
      connCb({ on: jest.fn() }, {});
      expect(server.handleConnection).toHaveBeenCalled();
    });

    it('sets up error listener', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      await server.start();
      const mockWss = WebSocket.Server.mock.results[0].value;
      expect(mockWss.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('emits error on wss error', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      const spy = jest.spyOn(server, 'emit').mockImplementation(() => {});
      await server.start();
      const mockWss = WebSocket.Server.mock.results[0].value;
      const errCb = mockWss.on.mock.calls.find(c => c[0] === 'error')[1];
      errCb(new Error('boom'));
      expect(spy).toHaveBeenCalledWith('error', new Error('boom'));
    });

    it('returns a promise that resolves', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      await expect(server.start()).resolves.toBeUndefined();
    });
  });

  describe('handleConnection', () => {
    let ws;

    beforeEach(() => {
      ws = makeMockWs();
      jest.spyOn(server, 'emit');
    });

    it('adds client to map', () => {
      server.handleConnection(ws, {});
      expect(server.clients.size).toBe(1);
      const client = Array.from(server.clients.values())[0];
      expect(client.ws).toBe(ws);
      expect(client).toHaveProperty('id');
      expect(client).toHaveProperty('connectedAt');
    });

    it('emits clientConnected', () => {
      server.handleConnection(ws, {});
      expect(server.emit).toHaveBeenCalledWith('clientConnected', expect.objectContaining({ ws }));
    });

    it('sets up ws message handler', () => {
      server.handleConnection(ws, {});
      expect(ws.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('sets up ws close handler', () => {
      server.handleConnection(ws, {});
      expect(ws.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('sets up ws error handler', () => {
      server.handleConnection(ws, {});
      expect(ws.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('removes client on close and emits clientDisconnected', () => {
      server.handleConnection(ws, {});
      const closeCb = ws.on.mock.calls.find(c => c[0] === 'close')[1];
      closeCb();
      expect(server.clients.size).toBe(0);
      expect(server.emit).toHaveBeenCalledWith('clientDisconnected', expect.any(String));
    });

    it('emits clientError on ws error', () => {
      server.handleConnection(ws, {});
      const errCb = ws.on.mock.calls.find(c => c[0] === 'error')[1];
      errCb(new Error('fail'));
      expect(server.emit).toHaveBeenCalledWith('clientError', expect.any(String), new Error('fail'));
    });

    it('parses JSON from ws message event', () => {
      jest.spyOn(server, 'handleMessage').mockResolvedValue();
      server.handleConnection(ws, {});
      const msgCb = ws.on.mock.calls.find(c => c[0] === 'message')[1];
      msgCb(Buffer.from('{"id":1,"method":"initialize"}'));
      expect(server.handleMessage).toHaveBeenCalledWith(
        expect.any(String),
        { id: 1, method: 'initialize' }
      );
    });
  });

  describe('handleMessage', () => {
    let ws;

    beforeEach(() => {
      ws = makeMockWs();
      server.handleConnection(ws, {});
    });

    it('handles a valid request', async () => {
      const spy = jest.spyOn(server, 'sendResponse');
      await server.handleMessage('c1', { id: 1, method: 'initialize', params: {} });
      expect(spy).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 1 }));
    });

    it('sends error for handler that throws', async () => {
      server.requestHandlers.set('tools/call', () => { throw new Error('bad'); });
      const spy = jest.spyOn(server, 'sendResponse');
      await server.handleMessage('c1', { id: 5, method: 'tools/call', params: {} });
      expect(spy).toHaveBeenCalledWith('c1', {
        jsonrpc: '2.0',
        id: 5,
        error: { code: -32603, message: 'bad' }
      });
    });

    it('sends method not found for unknown method', async () => {
      const spy = jest.spyOn(server, 'sendResponse');
      await server.handleMessage('c1', { id: 3, method: 'unknown' });
      expect(spy).toHaveBeenCalledWith('c1', {
        jsonrpc: '2.0',
        id: 3,
        error: { code: -32601, message: 'Method not found' }
      });
    });

    it('handles notification without id', async () => {
      const spy = jest.spyOn(server, 'emit');
      await server.handleMessage('c1', { method: 'initialized' });
      expect(spy).toHaveBeenCalledWith('notification', { method: 'initialized', params: undefined, clientId: 'c1' });
    });

    it('handles ping notification', async () => {
      jest.spyOn(server, 'sendNotification');
      await server.handleMessage('c1', { method: 'ping' });
      expect(server.sendNotification).toHaveBeenCalledWith('pong');
    });

    it('emits notification for notification with params', async () => {
      const spy = jest.spyOn(server, 'emit');
      await server.handleMessage('c1', { method: 'some_event', params: { x: 1 } });
      expect(spy).toHaveBeenCalledWith('notification', { method: 'some_event', params: { x: 1 }, clientId: 'c1' });
    });

    it('handles message with no id and no method gracefully', async () => {
      await expect(server.handleMessage('c1', {})).resolves.toBeUndefined();
    });
  });

  describe('sendResponse', () => {
    it('sends JSON string to client ws', () => {
      const ws = makeMockWs();
      server.clients.set('c1', { ws });
      server.sendResponse('c1', { jsonrpc: '2.0', id: 1, result: 'ok' });
      expect(ws.send).toHaveBeenCalledWith('{"jsonrpc":"2.0","id":1,"result":"ok"}');
    });

    it('does nothing when client not found', () => {
      expect(() => server.sendResponse('nonexistent', {})).not.toThrow();
    });

    it('does nothing when ws is not open', () => {
      const ws = { readyState: WebSocket.CLOSED, send: jest.fn() };
      server.clients.set('c1', { ws });
      server.sendResponse('c1', {});
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('sendNotification', () => {
    it('sends to all open clients', () => {
      const ws1 = { readyState: WebSocket.OPEN, send: jest.fn() };
      const ws2 = { readyState: WebSocket.OPEN, send: jest.fn() };
      server.clients.set('a', { ws: ws1 });
      server.clients.set('b', { ws: ws2 });
      server.sendNotification('test', { x: 1 });
      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    it('skips clients with closed ws', () => {
      const open = { readyState: WebSocket.OPEN, send: jest.fn() };
      const closed = { readyState: WebSocket.CLOSED, send: jest.fn() };
      server.clients.set('a', { ws: open });
      server.clients.set('b', { ws: closed });
      server.sendNotification('test');
      expect(open.send).toHaveBeenCalled();
      expect(closed.send).not.toHaveBeenCalled();
    });

    it('sends no notification when no clients', () => {
      expect(() => server.sendNotification('test')).not.toThrow();
    });

    it('uses empty object as default params', () => {
      const ws = { readyState: WebSocket.OPEN, send: jest.fn() };
      server.clients.set('c', { ws });
      server.sendNotification('ping');
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"params":{}'));
    });
  });

  describe('handleInitialize', () => {
    it('updates client capabilities', async () => {
      const ws = makeMockWs();
      server.handleConnection(ws, {});
      const client = Array.from(server.clients.values())[0];
      await server.handleInitialize({ capabilities: { tools: {} }, clientInfo: { name: 'test' } });
      expect(client.capabilities).toEqual({ tools: {} });
      expect(client.clientInfo).toEqual({ name: 'test' });
    });

    it('returns protocol version and server info', async () => {
      const result = await server.handleInitialize({});
      expect(result).toEqual({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'opencode-mcp-server', version: '1.0.0' }
      });
    });

    it('handles no matching client gracefully', async () => {
      const result = await server.handleInitialize({});
      expect(result.protocolVersion).toBe('2024-11-05');
    });
  });

  describe('handleToolsList', () => {
    it('returns empty list when no tools', async () => {
      const result = await server.handleToolsList();
      expect(result).toEqual({ tools: [] });
    });

    it('returns registered tools', async () => {
      server.registerTool({ name: 'read', description: 'Read', inputSchema: {} });
      server.registerTool({ name: 'write', description: 'Write', inputSchema: { type: 'object' } });
      const result = await server.handleToolsList();
      expect(result.tools).toHaveLength(2);
      expect(result.tools[0].name).toBe('read');
    });
  });

  describe('handleToolsCall', () => {
    it('calls registered tool handler', async () => {
      const handler = jest.fn().mockResolvedValue('done');
      server.registerTool({ name: 'my_tool', handler });
      const result = await server.handleToolsCall({ name: 'my_tool', arguments: { x: 1 } });
      expect(result).toBe('done');
      expect(handler).toHaveBeenCalledWith({ x: 1 });
    });

    it('throws for unknown tool', async () => {
      await expect(server.handleToolsCall({ name: 'nope' })).rejects.toThrow('Unknown tool');
    });

    it('throws for tool with no handler', async () => {
      server.registerTool({ name: 'empty', description: 'no handler' });
      await expect(server.handleToolsCall({ name: 'empty' })).rejects.toThrow('Tool has no handler');
    });
  });

  describe('handleResourcesList', () => {
    it('returns empty list when no resources', async () => {
      const result = await server.handleResourcesList();
      expect(result).toEqual({ resources: [] });
    });

    it('returns registered resources', async () => {
      server.registerResource({ uri: 'file:///a', name: 'A', description: 'File A', mimeType: 'text/plain' });
      const result = await server.handleResourcesList();
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].uri).toBe('file:///a');
    });
  });

  describe('handleResourcesRead', () => {
    it('returns resource contents', async () => {
      server.registerResource({ uri: 'doc://1', contents: [{ text: 'hello' }] });
      const result = await server.handleResourcesRead({ uri: 'doc://1' });
      expect(result).toEqual({ contents: [{ text: 'hello' }] });
    });

    it('calls readHandler when no contents', async () => {
      const readHandler = jest.fn().mockResolvedValue({ contents: [] });
      server.registerResource({ uri: 'doc://2', readHandler });
      const result = await server.handleResourcesRead({ uri: 'doc://2' });
      expect(readHandler).toHaveBeenCalledWith({ uri: 'doc://2' });
      expect(result).toEqual({ contents: [] });
    });

    it('throws for unknown resource', async () => {
      await expect(server.handleResourcesRead({ uri: 'nope' })).rejects.toThrow('Resource not found');
    });

    it('throws when resource has no contents or handler', async () => {
      server.registerResource({ uri: 'doc://3' });
      await expect(server.handleResourcesRead({ uri: 'doc://3' })).rejects.toThrow('Resource has no contents or handler');
    });
  });

  describe('handlePromptsList', () => {
    it('returns empty list when no prompts', async () => {
      const result = await server.handlePromptsList();
      expect(result).toEqual({ prompts: [] });
    });

    it('returns registered prompts', async () => {
      server.registerPrompt({ name: 'greet', description: 'Greeting', arguments: [{ name: 'name' }] });
      const result = await server.handlePromptsList();
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0].name).toBe('greet');
    });
  });

  describe('handlePromptsGet', () => {
    it('calls prompt handler', async () => {
      const handler = jest.fn().mockResolvedValue('hello');
      server.registerPrompt({ name: 'greet', handler });
      const result = await server.handlePromptsGet({ name: 'greet', arguments: { name: 'World' } });
      expect(result).toBe('hello');
      expect(handler).toHaveBeenCalledWith({ name: 'World' });
    });

    it('throws for unknown prompt', async () => {
      await expect(server.handlePromptsGet({ name: 'nope' })).rejects.toThrow('Prompt not found');
    });

    it('throws for prompt with no handler', async () => {
      server.registerPrompt({ name: 'static', description: 'no handler' });
      await expect(server.handlePromptsGet({ name: 'static' })).rejects.toThrow('Prompt has no handler');
    });
  });

  describe('registerTool', () => {
    it('adds tool to capabilities', () => {
      server.registerTool({ name: 'my_tool', handler: () => {} });
      expect(server.capabilities.tools.my_tool).toBeDefined();
    });

    it('sends list_changed notification', () => {
      jest.spyOn(server, 'sendNotification').mockImplementation(() => {});
      server.registerTool({ name: 't1' });
      expect(server.sendNotification).toHaveBeenCalledWith('notifications/tools/list_changed');
    });
  });

  describe('registerResource', () => {
    it('adds resource to capabilities', () => {
      server.registerResource({ uri: 'test://1' });
      expect(server.capabilities.resources['test://1']).toBeDefined();
    });

    it('sends list_changed notification', () => {
      jest.spyOn(server, 'sendNotification').mockImplementation(() => {});
      server.registerResource({ uri: 'test://1' });
      expect(server.sendNotification).toHaveBeenCalledWith('notifications/resources/list_changed');
    });
  });

  describe('registerPrompt', () => {
    it('adds prompt to capabilities', () => {
      server.registerPrompt({ name: 'p1' });
      expect(server.capabilities.prompts.p1).toBeDefined();
    });
  });

  describe('unregisterTool', () => {
    it('removes tool from capabilities', () => {
      server.registerTool({ name: 't1' });
      server.unregisterTool('t1');
      expect(server.capabilities.tools.t1).toBeUndefined();
    });

    it('sends list_changed notification', () => {
      jest.spyOn(server, 'sendNotification').mockImplementation(() => {});
      server.unregisterTool('t1');
      expect(server.sendNotification).toHaveBeenCalledWith('notifications/tools/list_changed');
    });
  });

  describe('generateId', () => {
    it('returns a string starting with client_', () => {
      expect(server.generateId()).toMatch(/^client_/);
    });

    it('returns unique values', () => {
      const a = server.generateId();
      const b = server.generateId();
      expect(a).not.toBe(b);
    });
  });

  describe('stop', () => {
    it('closes all client connections', () => {
      const ws1 = makeMockWs();
      const ws2 = makeMockWs();
      server.clients.set('a', { ws: ws1 });
      server.clients.set('b', { ws: ws2 });
      server.stop();
      expect(ws1.close).toHaveBeenCalled();
      expect(ws2.close).toHaveBeenCalled();
    });

    it('clears clients map', () => {
      server.clients.set('a', { ws: makeMockWs() });
      server.stop();
      expect(server.clients.size).toBe(0);
    });

    it('closes wss when it exists', () => {
      const wss = { close: jest.fn() };
      server.wss = wss;
      server.stop();
      expect(wss.close).toHaveBeenCalled();
      expect(server.wss).toBeNull();
    });

    it('handles stop when wss is null', () => {
      server.wss = null;
      expect(() => server.stop()).not.toThrow();
    });
  });
});
