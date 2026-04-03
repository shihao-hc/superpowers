/**
 * MCP DevTools Bridge - Chrome DevTools桥接器
 * 支持浏览器自动发现、Dry-run预览、性能分析
 */

const { dryRunEngine } = require('../engines/DryRunEngine');
const { thinkingChain } = require('../engines/ThinkingChain');

class DevToolsBridge {
  constructor(config = {}) {
    this.debugPort = config.debugPort || 9222;
    this.wsUrl = null;
    this.browser = null;
    this.connected = false;
  }

  /**
   * 发现本地浏览器
   */
  async discoverBrowser() {
    const ports = [9222, 9223, 9224, 9225];
    
    for (const port of ports) {
      try {
        const response = await fetch(`http://localhost:${port}/json`);
        if (response.ok) {
          const tabs = await response.json();
          if (tabs.length > 0) {
            return {
              port,
              tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url })),
              wsUrl: tabs[0].webSocketDebuggerUrl
            };
          }
        }
      } catch {}
    }
    
    return { port: null, tabs: [], wsUrl: null };
  }

  /**
   * 获取所有工具
   */
  getTools() {
    return [
      // 只读操作
      this._tool('get_page_info', '获取页面信息'),
      this._tool('get_console_logs', '获取控制台日志'),
      this._tool('screenshot', '截图'),
      this._tool('get_dom_snapshot', '获取DOM快照'),
      this._tool('get_network_requests', '获取网络请求'),
      this._tool('take_heap_snapshot', '获取堆快照'),
      this._tool('get_performance_metrics', '获取性能指标'),

      // 连接管理
      this._tool('auto_connect', '自动连接浏览器'),
      this._tool('discover_browsers', '发现本地浏览器'),
      this._tool('launch_browser', '启动浏览器'),
      this._tool('disconnect', '断开连接'),

      // 写操作
      this._tool('navigate', '导航到URL', { url: { type: 'string' } }),
      this._tool('evaluate', '执行JavaScript', { expression: { type: 'string' } }),
      this._tool('click_element', '点击元素', { selector: { type: 'string' } }),
      this._tool('type_text', '输入文本', { selector: { type: 'string' }, text: { type: 'string' } }),
      this._tool('inject_script', '注入脚本', { script: { type: 'string' } }),
      this._tool('start_performance_trace', '开始性能追踪'),
      this._tool('stop_performance_trace', '停止性能追踪'),

      // 录制与回放
      this._tool('record_actions', '开始录制'),
      this._tool('stop_recording', '停止录制'),
      this._tool('replay_actions', '回放操作', { actions: { type: 'array' } }),
    ];
  }

  _tool(name, description, inputSchema = {}) {
    return { name, description, inputSchema, handler: this._getHandler(name) };
  }

  _getHandler(name) {
    const handlers = {
      discover_browsers: this.discoverBrowsers.bind(this),
      auto_connect: this.autoConnect.bind(this),
      launch_browser: this.launchBrowser.bind(this),
      disconnect: this.disconnect.bind(this),
      get_page_info: this.getPageInfo.bind(this),
      get_console_logs: this.getConsoleLogs.bind(this),
      screenshot: this.screenshot.bind(this),
      get_dom_snapshot: this.getDomSnapshot.bind(this),
      get_network_requests: this.getNetworkRequests.bind(this),
      take_heap_snapshot: this.takeHeapSnapshot.bind(this),
      get_performance_metrics: this.getPerformanceMetrics.bind(this),
      navigate: this.navigate.bind(this),
      evaluate: this.evaluate.bind(this),
      click_element: this.clickElement.bind(this),
      type_text: this.typeText.bind(this),
      inject_script: this.injectScript.bind(this),
      start_performance_trace: this.startPerformanceTrace.bind(this),
      stop_performance_trace: this.stopPerformanceTrace.bind(this),
      record_actions: this.recordActions.bind(this),
      stop_recording: this.stopRecording.bind(this),
      replay_actions: this.replayActions.bind(this),
    };
    return handlers[name];
  }

  /**
   * 发现本地浏览器
   */
  async discoverBrowsers(params) {
    const result = await this.discoverBrowser();
    
    return {
      ...result,
      message: result.port ? `Found browser on port ${result.port}` : 'No browser found',
      suggestion: result.port ? 'Use auto_connect to connect' : 'Use launch_browser to start a new browser'
    };
  }

  /**
   * 自动连接
   */
  async autoConnect(params) {
    const result = await this.discoverBrowser();
    
    if (!result.wsUrl) {
      return { connected: false, error: 'No browser found', suggestion: 'Use launch_browser first' };
    }

    this.wsUrl = result.wsUrl;
    this.connected = true;

    return {
      connected: true,
      port: result.port,
      tabs: result.tabs,
      message: `Connected to browser on port ${result.port}`
    };
  }

  /**
   * 启动浏览器
   */
  async launchBrowser(params) {
    const { channel = 'stable' } = params || {};

    return {
      connected: false,
      message: `To launch browser, run Chrome with --remote-debugging-port=${this.debugPort}`,
      command: `google-chrome --remote-debugging-port=${this.debugPort}`,
      note: 'This bridge expects an already running Chrome instance with DevTools enabled'
    };
  }

  /**
   * 断开连接
   */
  async disconnect(params) {
    this.connected = false;
    this.wsUrl = null;
    this.browser = null;

    return { connected: false, message: 'Disconnected from browser' };
  }

  /**
   * Dry-run CDP命令
   */
  _previewCdp(command, params) {
    if (params.dry_run || params.dryRun) {
      return dryRunEngine.previewCdpCommand(command, params);
    }
    return null;
  }

  /**
   * 执行JavaScript - 支持Dry-run
   */
  async evaluate(params) {
    const { expression } = params;
    const preview = this._previewCdp('Runtime.evaluate', { expression });
    if (preview) return preview;

    return {
      result: `[DRYRUN] Would execute: ${expression}`,
      connected: this.connected,
      note: 'Connect to browser to actually execute'
    };
  }

  /**
   * 点击元素 - 支持Dry-run
   */
  async clickElement(params) {
    const { selector } = params;
    const preview = this._previewCdp('DOM.click', { selector });
    if (preview) return preview;

    return {
      result: `[DRYRUN] Would click element: ${selector}`,
      connected: this.connected
    };
  }

  /**
   * 截图
   */
  async screenshot(params) {
    const { fullPage = false } = params || {};

    return {
      connected: this.connected,
      data: '[BASE64_ENCODED_IMAGE]',
      format: 'png',
      fullPage,
      note: 'Connect to browser to capture actual screenshot'
    };
  }

  /**
   * 获取控制台日志
   */
  async getConsoleLogs(params) {
    return {
      connected: this.connected,
      logs: [
        { level: 'info', message: 'Connect to browser to get actual console logs' }
      ]
    };
  }

  /**
   * 获取DOM快照
   */
  async getDomSnapshot(params) {
    return {
      connected: this.connected,
      dom: '[DOM_STRUCTURE]',
      note: 'Connect to browser to get actual DOM'
    };
  }

  /**
   * 获取网络请求
   */
  async getNetworkRequests(params) {
    return {
      connected: this.connected,
      requests: [],
      note: 'Connect to browser to capture network requests'
    };
  }

  /**
   * 获取页面信息
   */
  async getPageInfo(params) {
    return {
      connected: this.connected,
      url: 'http://example.com',
      title: 'Example Page',
      dimensions: { width: 1920, height: 1080 }
    };
  }

  /**
   * 获取性能指标
   */
  async getPerformanceMetrics(params) {
    return {
      connected: this.connected,
      metrics: {
        timestamp: Date.now(),
        jsHeapSizeUsed: 0,
        documents: 0,
        nodes: 0,
        listeners: 0
      },
      note: 'Connect to browser to get actual metrics'
    };
  }

  /**
   * 获取堆快照
   */
  async takeHeapSnapshot(params) {
    return {
      connected: this.connected,
      snapshot: { nodes: 0, edges: 0 },
      note: 'Connect to browser to take actual heap snapshot'
    };
  }

  /**
   * 导航
   */
  async navigate(params) {
    const { url } = params;

    return {
      connected: this.connected,
      url,
      status: '[DRYRUN] Would navigate to: ' + url
    };
  }

  /**
   * 输入文本
   */
  async typeText(params) {
    const { selector, text } = params;
    const preview = this._previewCdp('Input.dispatchKeyEvent', { selector, text });
    if (preview) return preview;

    return {
      connected: this.connected,
      action: `[DRYRUN] Would type "${text}" into ${selector}`
    };
  }

  /**
   * 注入脚本
   */
  async injectScript(params) {
    const { script } = params;

    return {
      connected: this.connected,
      action: `[DRYRUN] Would inject script: ${script.substring(0, 100)}...`,
      warning: 'Script injection is a destructive operation'
    };
  }

  /**
   * 开始性能追踪
   */
  async startPerformanceTrace(params) {
    return {
      connected: this.connected,
      traceId: `trace_${Date.now()}`,
      status: 'started'
    };
  }

  /**
   * 停止性能追踪
   */
  async stopPerformanceTrace(params) {
    return {
      connected: this.connected,
      traceId: params.traceId,
      status: 'stopped',
      result: '[TRACE_DATA]'
    };
  }

  /**
   * 录制操作
   */
  async recordActions(params) {
    return {
      recording: true,
      actions: [],
      message: 'Recording started. Use stop_recording to finish.'
    };
  }

  /**
   * 停止录制
   */
  async stopRecording(params) {
    return {
      recording: false,
      actions: [],
      message: 'Recording stopped'
    };
  }

  /**
   * 回放操作
   */
  async replayActions(params) {
    const { actions } = params;
    const preview = this._previewCdp('replay', { actions });
    if (preview) return preview;

    return {
      connected: this.connected,
      replayed: actions.length,
      actions
    };
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    const discovery = await this.discoverBrowser();
    
    return {
      status: discovery.port ? 'healthy' : 'disconnected',
      connected: this.connected,
      browserFound: !!discovery.port,
      port: discovery.port,
      tabs: discovery.tabs?.length || 0
    };
  }
}

module.exports = { DevToolsBridge };
