jest.mock('../../src/mcp/engines/DryRunEngine', () => ({
  dryRunEngine: {
    previewCdpCommand: jest.fn(() => ({ dryRun: true, preview: 'cdp command' }))
  }
}));

jest.mock('../../src/mcp/engines/ThinkingChain', () => ({
  thinkingChain: {}
}));

const { DevToolsBridge } = require('../../src/mcp/bridges/DevToolsBridge');
const { dryRunEngine: _dryRunEngine } = require('../../src/mcp/engines/DryRunEngine');

describe('DevToolsBridge', () => {
  let bridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new DevToolsBridge({ debugPort: 9222 });
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const b = new DevToolsBridge();
      expect(b.debugPort).toBe(9222);
      expect(b.wsUrl).toBeNull();
      expect(b.browser).toBeNull();
      expect(b.connected).toBe(false);
    });

    it('should accept custom debug port', () => {
      const b = new DevToolsBridge({ debugPort: 9333 });
      expect(b.debugPort).toBe(9333);
    });
  });

  describe('getTools', () => {
    it('should return all tool definitions', () => {
      const tools = bridge.getTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      tools.forEach((tool) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('handler');
      });
    });

    it('should include read-only tools', () => {
      const tools = bridge.getTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('get_page_info');
      expect(names).toContain('get_console_logs');
      expect(names).toContain('screenshot');
    });

    it('should include write operation tools', () => {
      const tools = bridge.getTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('navigate');
      expect(names).toContain('evaluate');
      expect(names).toContain('click_element');
      expect(names).toContain('type_text');
    });

    it('should include record/replay tools', () => {
      const tools = bridge.getTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('record_actions');
      expect(names).toContain('stop_recording');
      expect(names).toContain('replay_actions');
    });
  });

  describe('discoverBrowser', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return browser info when found on a port', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'tab1', title: 'Test', url: 'http://test.com', webSocketDebuggerUrl: 'ws://localhost:9223/tab1' }
        ]
      });

      const result = await bridge.discoverBrowser();
      expect(result.port).toBe(9223);
      expect(result.tabs.length).toBe(1);
      expect(result.wsUrl).toBe('ws://localhost:9223/tab1');
    });

    it('should return empty result when no browser found', async () => {
      global.fetch.mockRejectedValue(new Error('Connection refused'));

      const result = await bridge.discoverBrowser();
      expect(result.port).toBeNull();
      expect(result.tabs).toEqual([]);
      expect(result.wsUrl).toBeNull();
    });
  });

  describe('discoverBrowsers', () => {
    it('should return discovery result with message', async () => {
      jest.spyOn(bridge, 'discoverBrowser').mockResolvedValue({
        port: 9222, tabs: [{ id: '1', title: 'A', url: 'http://a.com' }], wsUrl: 'ws://a'
      });
      const result = await bridge.discoverBrowsers({});
      expect(result.port).toBe(9222);
      expect(result.message).toContain('Found browser');
      expect(result.suggestion).toContain('auto_connect');
    });

    it('should return no browser message', async () => {
      jest.spyOn(bridge, 'discoverBrowser').mockResolvedValue({
        port: null, tabs: [], wsUrl: null
      });
      const result = await bridge.discoverBrowsers({});
      expect(result.port).toBeNull();
      expect(result.message).toContain('No browser found');
      expect(result.suggestion).toContain('launch_browser');
    });
  });

  describe('autoConnect', () => {
    it('should connect successfully when browser found', async () => {
      jest.spyOn(bridge, 'discoverBrowser').mockResolvedValue({
        port: 9222, tabs: [{ id: '1', title: 'Test', url: 'http://test.com' }],
        wsUrl: 'ws://test'
      });
      const result = await bridge.autoConnect({});
      expect(result.connected).toBe(true);
      expect(bridge.connected).toBe(true);
      expect(bridge.wsUrl).toBe('ws://test');
    });

    it('should return error when no browser found', async () => {
      jest.spyOn(bridge, 'discoverBrowser').mockResolvedValue({
        port: null, tabs: [], wsUrl: null
      });
      const result = await bridge.autoConnect({});
      expect(result.connected).toBe(false);
      expect(bridge.connected).toBe(false);
    });
  });

  describe('launchBrowser', () => {
    it('should return launch instruction message', async () => {
      const result = await bridge.launchBrowser({});
      expect(result.connected).toBe(false);
      expect(result.command).toContain('--remote-debugging-port=9222');
    });
  });

  describe('disconnect', () => {
    it('should reset connection state', async () => {
      bridge.connected = true;
      bridge.wsUrl = 'ws://test';
      bridge.browser = {};
      const result = await bridge.disconnect({});
      expect(result.connected).toBe(false);
      expect(bridge.connected).toBe(false);
      expect(bridge.wsUrl).toBeNull();
      expect(bridge.browser).toBeNull();
    });
  });

  describe('evaluate', () => {
    it('should return DRYRUN message when not connected', async () => {
      const result = await bridge.evaluate({ expression: '1+1' });
      expect(result.result).toContain('[DRYRUN] Would execute');
      expect(result.connected).toBe(false);
    });

    it('should include note about connection', async () => {
      const result = await bridge.evaluate({ expression: '1+1' });
      expect(result.note).toContain('Connect to browser');
    });

    it('should return dry-run preview via _previewCdp', () => {
      const result = bridge._previewCdp('Runtime.evaluate', { dry_run: true, expression: '1+1' });
      expect(result).toEqual({ dryRun: true, preview: 'cdp command' });
    });

    it('should return dry-run preview via _previewCdp with dryRun param', () => {
      const result = bridge._previewCdp('Runtime.evaluate', { dryRun: true, expression: '1+1' });
      expect(result).toEqual({ dryRun: true, preview: 'cdp command' });
    });

    it('should return null from _previewCdp without dry_run', () => {
      const result = bridge._previewCdp('Runtime.evaluate', { expression: '1+1' });
      expect(result).toBeNull();
    });
  });

  describe('clickElement', () => {
    it('should return DRYRUN message normally', async () => {
      const result = await bridge.clickElement({ selector: '#btn' });
      expect(result.result).toContain('[DRYRUN] Would click element');
    });

    it('should reflect connection state', async () => {
      bridge.connected = true;
      const result = await bridge.clickElement({ selector: '#btn' });
      expect(result.connected).toBe(true);
    });
  });

  describe('screenshot', () => {
    it('should return default screenshot response', async () => {
      const result = await bridge.screenshot({});
      expect(result.connected).toBe(false);
      expect(result.format).toBe('png');
      expect(result.data).toBeTruthy();
    });

    it('should respect fullPage parameter', async () => {
      const result = await bridge.screenshot({ fullPage: true });
      expect(result.fullPage).toBe(true);
    });
  });

  describe('getConsoleLogs', () => {
    it('should return placeholder logs', async () => {
      const result = await bridge.getConsoleLogs({});
      expect(result.connected).toBe(false);
      expect(result.logs).toBeInstanceOf(Array);
      expect(result.logs.length).toBeGreaterThan(0);
    });
  });

  describe('getDomSnapshot', () => {
    it('should return placeholder DOM', async () => {
      const result = await bridge.getDomSnapshot({});
      expect(result.connected).toBe(false);
      expect(result.dom).toBeTruthy();
    });
  });

  describe('getNetworkRequests', () => {
    it('should return empty requests array', async () => {
      const result = await bridge.getNetworkRequests({});
      expect(result.requests).toEqual([]);
    });
  });

  describe('getPageInfo', () => {
    it('should return placeholder page info', async () => {
      const result = await bridge.getPageInfo({});
      expect(result.connected).toBe(false);
      expect(result.url).toBe('http://example.com');
      expect(result.title).toBe('Example Page');
      expect(result.dimensions).toEqual({ width: 1920, height: 1080 });
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should return placeholder metrics', async () => {
      const result = await bridge.getPerformanceMetrics({});
      expect(result.connected).toBe(false);
      expect(result.metrics).toHaveProperty('jsHeapSizeUsed');
      expect(result.metrics).toHaveProperty('documents');
      expect(result.metrics).toHaveProperty('timestamp');
    });
  });

  describe('takeHeapSnapshot', () => {
    it('should return placeholder snapshot', async () => {
      const result = await bridge.takeHeapSnapshot({});
      expect(result.snapshot).toEqual({ nodes: 0, edges: 0 });
    });
  });

  describe('navigate', () => {
    it('should return navigation status', async () => {
      const result = await bridge.navigate({ url: 'http://example.com/page' });
      expect(result.url).toBe('http://example.com/page');
      expect(result.status).toContain('[DRYRUN] Would navigate to');
    });
  });

  describe('typeText', () => {
    it('should return DRYRUN message normally', async () => {
      const result = await bridge.typeText({ selector: '#input', text: 'hello' });
      expect(result.action).toContain('[DRYRUN] Would type');
    });

    it('should reflect connection state', async () => {
      bridge.connected = true;
      const result = await bridge.typeText({ selector: '#input', text: 'hi' });
      expect(result.connected).toBe(true);
    });
  });

  describe('injectScript', () => {
    it('should return inject warning', async () => {
      const result = await bridge.injectScript({ script: 'alert(1)' });
      expect(result.action).toContain('[DRYRUN] Would inject script');
      expect(result.warning).toContain('destructive');
    });
  });

  describe('startPerformanceTrace / stopPerformanceTrace', () => {
    it('should start performance trace', async () => {
      const result = await bridge.startPerformanceTrace({});
      expect(result.status).toBe('started');
      expect(result.traceId).toMatch(/^trace_/);
    });

    it('should stop performance trace', async () => {
      const result = await bridge.stopPerformanceTrace({ traceId: 'trace_123' });
      expect(result.status).toBe('stopped');
      expect(result.traceId).toBe('trace_123');
    });
  });

  describe('recordActions / stopRecording / replayActions', () => {
    it('should start recording', async () => {
      const result = await bridge.recordActions({});
      expect(result.recording).toBe(true);
    });

    it('should stop recording', async () => {
      const result = await bridge.stopRecording({});
      expect(result.recording).toBe(false);
    });

    it('should replay actions', async () => {
      const result = await bridge.replayActions({ actions: ['click', 'type'] });
      expect(result.replayed).toBe(2);
    });

    it('should return replayed count', async () => {
      const result = await bridge.replayActions({ actions: ['click', 'type', 'navigate'] });
      expect(result.replayed).toBe(3);
    });
  });

  describe('healthCheck', () => {
    it('should report healthy when browser found', async () => {
      jest.spyOn(bridge, 'discoverBrowser').mockResolvedValue({
        port: 9222, tabs: [{ id: '1', title: 'T', url: 'http://t' }], wsUrl: 'ws://t'
      });
      const result = await bridge.healthCheck();
      expect(result.status).toBe('healthy');
      expect(result.tabs).toBe(1);
    });

    it('should report disconnected when no browser', async () => {
      jest.spyOn(bridge, 'discoverBrowser').mockResolvedValue({
        port: null, tabs: [], wsUrl: null
      });
      const result = await bridge.healthCheck();
      expect(result.status).toBe('disconnected');
      expect(result.tabs).toBe(0);
    });
  });

  describe('discoverBrowser - empty tabs', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should skip port when ok but no tabs, try next', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: false });
      const result = await bridge.discoverBrowser();
      expect(result.port).toBeNull();
      expect(result.tabs).toEqual([]);
    });
  });

  describe('launchBrowser - null params', () => {
    it('should handle undefined params with fallback', async () => {
      const result = await bridge.launchBrowser();
      expect(result.connected).toBe(false);
      expect(result.command).toContain('--remote-debugging-port=9222');
    });
  });

  describe('screenshot - null params', () => {
    it('should handle undefined params with fallback', async () => {
      const result = await bridge.screenshot();
      expect(result.format).toBe('png');
      expect(result.fullPage).toBe(false);
    });
  });

  describe('evaluate with _previewCdp returning truthy', () => {
    it('should short-circuit via preview', async () => {
      jest.spyOn(bridge, '_previewCdp').mockReturnValue({ dryRun: true, preview: 'preview-returned' });
      const result = await bridge.evaluate({ expression: '1+1' });
      expect(result).toEqual({ dryRun: true, preview: 'preview-returned' });
    });
  });

  describe('clickElement with _previewCdp returning truthy', () => {
    it('should short-circuit via preview', async () => {
      jest.spyOn(bridge, '_previewCdp').mockReturnValue({ dryRun: true, preview: 'preview-returned' });
      const result = await bridge.clickElement({ selector: '#btn' });
      expect(result).toEqual({ dryRun: true, preview: 'preview-returned' });
    });
  });

  describe('typeText with _previewCdp returning truthy', () => {
    it('should short-circuit via preview', async () => {
      jest.spyOn(bridge, '_previewCdp').mockReturnValue({ dryRun: true, preview: 'preview-returned' });
      const result = await bridge.typeText({ selector: '#input', text: 'hi' });
      expect(result).toEqual({ dryRun: true, preview: 'preview-returned' });
    });
  });

  describe('replayActions with _previewCdp returning truthy', () => {
    it('should short-circuit via preview', async () => {
      jest.spyOn(bridge, '_previewCdp').mockReturnValue({ dryRun: true, preview: 'preview-returned' });
      const result = await bridge.replayActions({ actions: ['click'] });
      expect(result).toEqual({ dryRun: true, preview: 'preview-returned' });
    });
  });
});
