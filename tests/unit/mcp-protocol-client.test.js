jest.mock('ws', () => {
  const MockWebSocket = jest.fn(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1
  }));
  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;
  return MockWebSocket;
});

jest.mock('../../src/utils/SSRFValidator', () => ({
  validateURL: jest.fn()
}));

jest.mock('http', () => ({ request: jest.fn() }));
jest.mock('https', () => ({ request: jest.fn() }));

const { MCPClient } = require('../../src/mcp/MCPProtocolClient');
const WebSocket = require('ws');
const { validateURL } = require('../../src/utils/SSRFValidator');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MCPClient', () => {
  let client;

  beforeEach(() => {
    client = new MCPClient();
  });

  describe('constructor', () => {
    it('initializes with default options', () => {
      expect(client.options.protocolVersion).toBe('2024-11-05');
      expect(client.options.timeout).toBe(30000);
      expect(client.options.retryAttempts).toBe(3);
      expect(client.options.retryDelay).toBe(1000);
    });

    it('initializes connected state', () => {
      expect(client.connected).toBe(false);
      expect(client.ws).toBeNull();
      expect(client.http).toBeNull();
      expect(client.requestId).toBe(0);
      expect(client.pendingRequests.size).toBe(0);
    });

    it('initializes capability caches', () => {
      expect(client.capabilities).toEqual({});
      expect(client.tools.size).toBe(0);
      expect(client.resources.size).toBe(0);
      expect(client.prompts.size).toBe(0);
    });

    it('accepts custom options', () => {
      const c = new MCPClient({ timeout: 5000, retryAttempts: 1 });
      expect(c.options.timeout).toBe(5000);
      expect(c.options.retryAttempts).toBe(1);
    });

    it('is an EventEmitter', () => {
      expect(client).toHaveProperty('emit');
      expect(client).toHaveProperty('on');
    });
  });

  describe('connect', () => {
    it('throws when SSRF validation blocks', async () => {
      validateURL.mockReturnValue({ allowed: false, reason: 'bad' });
      await expect(client.connect('http://evil.com')).rejects.toThrow('SSRF blocked: bad');
    });

    it('calls connectWebSocket for websocket transport', async () => {
      validateURL.mockReturnValue({ allowed: true });
      jest.spyOn(client, 'connectWebSocket').mockResolvedValue();
      await client.connect('ws://localhost:3100');
      expect(client.connectWebSocket).toHaveBeenCalledWith('ws://localhost:3100');
      expect(client.connected).toBe(true);
    });

    it('calls connectHTTP for http transport', async () => {
      validateURL.mockReturnValue({ allowed: true });
      jest.spyOn(client, 'connectHTTP').mockResolvedValue();
      await client.connect('http://localhost:3100', 'http');
      expect(client.connectHTTP).toHaveBeenCalledWith('http://localhost:3100');
      expect(client.connected).toBe(true);
    });

    it('retries on failure then emits connected', async () => {
      validateURL.mockReturnValue({ allowed: true });
      const wsConnect = jest.spyOn(client, 'connectWebSocket')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue();
      jest.spyOn(client, 'delay').mockResolvedValue();
      await client.connect('ws://localhost:3100');
      expect(wsConnect).toHaveBeenCalledTimes(2);
      expect(client.connected).toBe(true);
    });

    it('throws after exhausting retries', async () => {
      validateURL.mockReturnValue({ allowed: true });
      jest.spyOn(client, 'connectWebSocket').mockRejectedValue(new Error('persistent'));
      jest.spyOn(client, 'delay').mockResolvedValue();
      await expect(client.connect('ws://localhost:3100')).rejects.toThrow('persistent');
      expect(client.connected).toBe(false);
    });

    it('skips URL validation when url is an object', async () => {
      const obj = { host: 'localhost', port: 3100 };
      jest.spyOn(client, 'connectWebSocket').mockResolvedValue();
      await client.connect(obj);
      expect(validateURL).not.toHaveBeenCalled();
    });
  });

  describe('connectWebSocket', () => {
    it('creates WebSocket with URL and headers', () => {
      const promise = client.connectWebSocket('ws://localhost:3100');
      expect(WebSocket).toHaveBeenCalledWith('ws://localhost:3100', {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
      });
      client.ws.on.mock.calls.find(c => c[0] === 'open')[1]();
      return expect(promise).resolves.toBeUndefined();
    });

    it('calls shortcuts.initialize on open', () => {
      const spy = jest.spyOn(client.shortcuts, 'initialize');
      const promise = client.connectWebSocket('ws://localhost:3100');
      client.ws.on.mock.calls.find(c => c[0] === 'open')[1]();
      expect(spy).toHaveBeenCalled();
      return promise;
    });

    it('sets up message handler', () => {
      const spy = jest.spyOn(client, 'handleMessage');
      const promise = client.connectWebSocket('ws://localhost:3100');
      const msgCb = client.ws.on.mock.calls.find(c => c[0] === 'message')[1];
      msgCb(Buffer.from('{"id":1,"result":"ok"}'));
      expect(spy).toHaveBeenCalledWith({ id: 1, result: 'ok' });
      client.ws.on.mock.calls.find(c => c[0] === 'open')[1]();
      return promise;
    });

    it('rejects promise on ws error', async () => {
      const promise = client.connectWebSocket('ws://localhost:3100');
      const errCb = client.ws.on.mock.calls.find(c => c[0] === 'error')[1];
      errCb(new Error('conn err'));
      await expect(promise).rejects.toThrow('conn err');
    });

    it('sets connected false on close and emits disconnected', () => {
      const spy = jest.spyOn(client, 'emit');
      const promise = client.connectWebSocket('ws://localhost:3100');
      client.ws.on.mock.calls.find(c => c[0] === 'open')[1]();
      client.connected = true;
      const closeCb = client.ws.on.mock.calls.find(c => c[0] === 'close')[1];
      closeCb();
      expect(client.connected).toBe(false);
      expect(spy).toHaveBeenCalledWith('disconnected');
      return promise;
    });

    it('rejects on timeout', async () => {
      jest.useFakeTimers();
      const promise = client.connectWebSocket('ws://localhost:3100');
      jest.advanceTimersByTime(30000);
      await expect(promise).rejects.toThrow('Connection timeout');
      jest.useRealTimers();
    });
  });

  describe('connectHTTP', () => {
    let mockReq;
    let mockRes;
    let http;
    let https;
    let savedCb;

    beforeEach(() => {
      http = require('http');
      https = require('https');
      savedCb = null;
      mockRes = { on: jest.fn() };
      mockReq = { on: jest.fn(), end: jest.fn(), destroy: jest.fn() };
      http.request.mockImplementation((_url, _opts, cb) => {
        savedCb = cb;
        return mockReq;
      });
      https.request.mockImplementation((_url, _opts, cb) => {
        savedCb = cb;
        return mockReq;
      });
    });

    function invokeResponse() {
      if (savedCb) savedCb(mockRes);
    }

    it('creates HTTP request with SSE headers', async () => {
      const promise = client.connectHTTP('http://localhost:3100/sse');
      invokeResponse();
      await promise;
      expect(http.request).toHaveBeenCalled();
    });

    it('handles SSE data events', () => {
      client.connectHTTP('http://localhost:3100/sse');
      invokeResponse();
      const spy = jest.spyOn(client, 'handleMessage');
      const dataCb = mockRes.on.mock.calls.find(c => c[0] === 'data')[1];
      dataCb(Buffer.from('data: {"id":1,"result":"ok"}\n'));
      expect(spy).toHaveBeenCalledWith({ id: 1, result: 'ok' });
    });

    it('ignores non-data SSE lines', () => {
      client.connectHTTP('http://localhost:3100/sse');
      invokeResponse();
      const spy = jest.spyOn(client, 'handleMessage');
      const dataCb = mockRes.on.mock.calls.find(c => c[0] === 'data')[1];
      dataCb(Buffer.from('event: msg\ndata: {"x":1}\n'));
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('sets connected false on end', () => {
      const spy = jest.spyOn(client, 'emit');
      client.connectHTTP('http://localhost:3100/sse');
      invokeResponse();
      const endCb = mockRes.on.mock.calls.find(c => c[0] === 'end')[1];
      client.connected = true;
      endCb();
      expect(client.connected).toBe(false);
      expect(spy).toHaveBeenCalledWith('disconnected');
    });

    it('rejects promise on http error', async () => {
      const promise = client.connectHTTP('http://localhost:3100/sse');
      const errCb = mockReq.on.mock.calls.find(c => c[0] === 'error')[1];
      errCb(new Error('http err'));
      await expect(promise).rejects.toThrow('http err');
    });

    it('uses https for https URLs', async () => {
      const promise = client.connectHTTP('https://localhost:3100/sse');
      invokeResponse();
      await promise;
      expect(https.request).toHaveBeenCalled();
    });

    it('rejects on HTTP timeout', async () => {
      jest.useFakeTimers();
      const promise = client.connectHTTP('http://localhost:3100/sse');
      jest.advanceTimersByTime(30000);
      await expect(promise).rejects.toThrow('HTTP connection timeout');
      jest.useRealTimers();
    });
  });

  describe('handleMessage', () => {
    it('resolves pending request with result', () => {
      const resolve = jest.fn();
      client.pendingRequests.set(1, { resolve, reject: jest.fn() });
      client.handleMessage({ id: 1, result: 'done' });
      expect(resolve).toHaveBeenCalledWith('done');
      expect(client.pendingRequests.has(1)).toBe(false);
    });

    it('rejects pending request with error', () => {
      const reject = jest.fn();
      client.pendingRequests.set(2, { resolve: jest.fn(), reject });
      client.handleMessage({ id: 2, error: { message: 'fail' } });
      expect(reject).toHaveBeenCalledWith(new Error('fail'));
    });

    it('ignores unknown id', () => {
      expect(() => client.handleMessage({ id: 99, result: 'x' })).not.toThrow();
    });

    it('calls handleRequest for notification with method', () => {
      const spy = jest.spyOn(client, 'handleRequest');
      client.handleMessage({ method: 'notifications/initialized' });
      expect(spy).toHaveBeenCalledWith('notifications/initialized', undefined);
    });

    it('ignores message with no id and no method', () => {
      expect(() => client.handleMessage({})).not.toThrow();
    });

    it('stores capabilities from result', () => {
      client.handleMessage({ result: { capabilities: { tools: {} } } });
      expect(client.capabilities).toEqual({ tools: {} });
    });
  });

  describe('handleRequest', () => {
    it('emits initialized for notifications/initialized', () => {
      const spy = jest.spyOn(client, 'emit');
      client.handleRequest('notifications/initialized');
      expect(spy).toHaveBeenCalledWith('initialized');
    });

    it('emits toolsChanged for notifications/tools/list_changed', () => {
      const spy = jest.spyOn(client, 'emit');
      client.handleRequest('notifications/tools/list_changed');
      expect(spy).toHaveBeenCalledWith('toolsChanged');
    });

    it('emits resourcesChanged for notifications/resources/list_changed', () => {
      const spy = jest.spyOn(client, 'emit');
      client.handleRequest('notifications/resources/list_changed');
      expect(spy).toHaveBeenCalledWith('resourcesChanged');
    });

    it('calls shortcuts.pong for ping', () => {
      const spy = jest.spyOn(client.shortcuts, 'pong');
      client.handleRequest('ping');
      expect(spy).toHaveBeenCalled();
    });

    it('ignores unknown method', () => {
      expect(() => client.handleRequest('unknown')).not.toThrow();
    });
  });

  describe('sendRequest', () => {
    it('creates a request with incremental id', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.sendRequest('tools/list');
      expect(client.requestId).toBe(1);
      expect(client.pendingRequests.has(1)).toBe(true);
      client.handleMessage({ id: 1, result: { tools: [] } });
      await expect(promise).resolves.toEqual({ tools: [] });
    });

    it('rejects on timeout', async () => {
      jest.useFakeTimers();
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.sendRequest('tools/list', {});
      jest.advanceTimersByTime(30000);
      await expect(promise).rejects.toThrow('Request 1 timed out');
      expect(client.pendingRequests.has(1)).toBe(false);
      jest.useRealTimers();
    });
  });

  describe('send', () => {
    it('sends JSON string via websocket', () => {
      client.ws = { readyState: WebSocket.OPEN, send: jest.fn() };
      client.send('tools/list', { id: 1, method: 'tools/list', params: {} });
      expect(client.ws.send).toHaveBeenCalledWith(
        '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
      );
    });

    it('does nothing when ws is null', () => {
      expect(() => client.send('ping')).not.toThrow();
    });

    it('does nothing when ws is not open', () => {
      client.ws = { readyState: WebSocket.CLOSED, send: jest.fn() };
      client.send('ping');
      expect(client.ws.send).not.toHaveBeenCalled();
    });
  });

  describe('shortcuts', () => {
    it('initialize sends correct payload', () => {
      client.ws = { readyState: WebSocket.OPEN, send: jest.fn() };
      client.shortcuts.initialize();
      const sent = JSON.parse(client.ws.send.mock.calls[0][0]);
      expect(sent.method).toBe('initialize');
      expect(sent.params.protocolVersion).toBe('2024-11-05');
      expect(sent.params.clientInfo.name).toBe('opencode');
    });

    it('initialize uses custom capabilities and clientInfo', () => {
      const c = new MCPClient({
        capabilities: { tools: {} },
        clientInfo: { name: 'custom', version: '2.0' }
      });
      c.ws = { readyState: WebSocket.OPEN, send: jest.fn() };
      c.shortcuts.initialize();
      const sent = JSON.parse(c.ws.send.mock.calls[0][0]);
      expect(sent.params.capabilities).toEqual({ tools: {} });
      expect(sent.params.clientInfo.name).toBe('custom');
    });

    it('ping sends correct payload', () => {
      client.ws = { readyState: WebSocket.OPEN, send: jest.fn() };
      client.shortcuts.ping();
      const sent = JSON.parse(client.ws.send.mock.calls[0][0]);
      expect(sent.method).toBe('ping');
    });

    it('pong sends correct payload', () => {
      client.ws = { readyState: WebSocket.OPEN, send: jest.fn() };
      client.shortcuts.pong();
      const sent = JSON.parse(client.ws.send.mock.calls[0][0]);
      expect(sent.method).toBe('pong');
    });

    it('tools.list sends request', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.shortcuts.tools.list();
      expect(client.pendingRequests.has(1)).toBe(true);
      client.handleMessage({ id: 1, result: { tools: [] } });
      await expect(promise).resolves.toEqual({ tools: [] });
    });

    it('tools.call sends request with args', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.shortcuts.tools.call('read', { path: '/a' });
      client.handleMessage({ id: 1, result: 'ok' });
      await expect(promise).resolves.toBe('ok');
    });

    it('resources.list sends request', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.shortcuts.resources.list();
      client.handleMessage({ id: 1, result: { resources: [] } });
      await expect(promise).resolves.toEqual({ resources: [] });
    });

    it('resources.read sends request with uri', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.shortcuts.resources.read('file:///a');
      client.handleMessage({ id: 1, result: 'content' });
      await expect(promise).resolves.toBe('content');
    });

    it('resources.subscribe sends request with uri', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.shortcuts.resources.subscribe('file:///a');
      client.handleMessage({ id: 1, result: {} });
      await expect(promise).resolves.toEqual({});
    });

    it('resources.unsubscribe sends request with uri', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.shortcuts.resources.unsubscribe('file:///a');
      client.handleMessage({ id: 1, result: {} });
      await expect(promise).resolves.toEqual({});
    });

    it('prompts.get sends request with name and args', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.shortcuts.prompts.get('greet', { name: 'World' });
      client.handleMessage({ id: 1, result: { messages: [] } });
      await expect(promise).resolves.toEqual({ messages: [] });
    });
  });

  describe('listTools', () => {
    it('fetches and caches tools', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.listTools();
      client.handleMessage({ id: 1, result: { tools: [{ name: 'read' }, { name: 'write' }] } });
      const result = await promise;
      expect(client.tools.size).toBe(2);
      expect(client.tools.get('read')).toEqual({ name: 'read' });
      expect(result.tools).toHaveLength(2);
    });

    it('handles missing tools in result', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.listTools();
      client.handleMessage({ id: 1, result: {} });
      const _result = await promise;
      expect(client.tools.size).toBe(0);
    });
  });

  describe('callTool', () => {
    it('calls tools.call via send', () => {
      const _spy = jest.spyOn(client.shortcuts.tools, 'call').mockResolvedValue('ok');
      return expect(client.callTool('read', { path: '/x' })).resolves.toBe('ok');
    });

    it('uses default empty args when not provided', () => {
      const _spy = jest.spyOn(client.shortcuts.tools, 'call').mockResolvedValue('ok');
      return expect(client.callTool('read')).resolves.toBe('ok');
    });
  });

  describe('listResources', () => {
    it('fetches and caches resources', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.listResources();
      client.handleMessage({ id: 1, result: { resources: [{ uri: 'file:///a' }] } });
      const result = await promise;
      expect(client.resources.size).toBe(1);
      expect(result.resources).toHaveLength(1);
    });

    it('handles missing resources in result', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.listResources();
      client.handleMessage({ id: 1, result: {} });
      await expect(promise).resolves.toEqual({});
      expect(client.resources.size).toBe(0);
    });
  });

  describe('readResource', () => {
    it('delegates to shortcuts', () => {
      const _spy = jest.spyOn(client.shortcuts.resources, 'read').mockResolvedValue('ok');
      return expect(client.readResource('file:///a')).resolves.toBe('ok');
    });
  });

  describe('listPrompts', () => {
    it('fetches and caches prompts', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.listPrompts();
      client.handleMessage({ id: 1, result: { prompts: [{ name: 'greet' }] } });
      const result = await promise;
      expect(client.prompts.size).toBe(1);
      expect(result.prompts).toHaveLength(1);
    });

    it('handles missing prompts in result', async () => {
      jest.spyOn(client, 'send').mockImplementation(() => {});
      const promise = client.listPrompts();
      client.handleMessage({ id: 1, result: {} });
      await expect(promise).resolves.toEqual({});
      expect(client.prompts.size).toBe(0);
    });
  });

  describe('getPrompt', () => {
    it('delegates to shortcuts', () => {
      const _spy = jest.spyOn(client.shortcuts.prompts, 'get').mockResolvedValue({ messages: [] });
      return expect(client.getPrompt('greet', { name: 'World' })).resolves.toEqual({ messages: [] });
    });

    it('uses default empty args when not provided', () => {
      const _spy = jest.spyOn(client.shortcuts.prompts, 'get').mockResolvedValue({ messages: [] });
      return expect(client.getPrompt('greet')).resolves.toEqual({ messages: [] });
    });
  });

  describe('delay', () => {
    it('returns a promise that resolves after ms', async () => {
      jest.useFakeTimers();
      const promise = client.delay(100);
      jest.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('disconnect', () => {
    it('closes websocket and sets to null', () => {
      const ws = { close: jest.fn() };
      client.ws = ws;
      client.disconnect();
      expect(ws.close).toHaveBeenCalled();
      expect(client.ws).toBeNull();
    });

    it('destroys http connection and sets to null', () => {
      const httpConn = { destroy: jest.fn() };
      client.http = httpConn;
      client.disconnect();
      expect(httpConn.destroy).toHaveBeenCalled();
      expect(client.http).toBeNull();
    });

    it('sets connected false and clears pending requests', () => {
      client.connected = true;
      client.pendingRequests.set(1, { resolve() {}, reject() {} });
      client.disconnect();
      expect(client.connected).toBe(false);
      expect(client.pendingRequests.size).toBe(0);
    });

    it('emits disconnected', () => {
      const spy = jest.spyOn(client, 'emit');
      client.disconnect();
      expect(spy).toHaveBeenCalledWith('disconnected');
    });

    it('handles disconnect with nothing set', () => {
      expect(() => client.disconnect()).not.toThrow();
    });
  });
});
