const mockRootsManager = {
  getRoots: jest.fn().mockReturnValue([]),
  isReadable: jest.fn(),
  isWritable: jest.fn()
};

const mockThinkingChain = {
  listChains: jest.fn().mockReturnValue([]),
  getStorageStats: jest.fn()
};

jest.mock('../../src/mcp/engines/RootsManager', () => ({
  rootsManager: mockRootsManager
}));

jest.mock('../../src/mcp/engines/ThinkingChain', () => ({
  thinkingChain: mockThinkingChain
}));

jest.mock('../../src/mcp/engines/ThinkingChainStorage', () => ({}));

const mockDryRunStats = { total: 0, previewOnly: 0, executed: 0, success: 0, failed: 0 };

jest.mock('../../src/mcp/engines/DryRunHistory', () => ({
  DryRunHistory: jest.fn(() => ({
    getStats: jest.fn(() => mockDryRunStats)
  })),
  __mockStats: mockDryRunStats
}));

const { BridgeHealthMonitor, healthMonitor } = require('../../src/mcp/BridgeHealthMonitor');

class MockBridge {
  constructor(name, status) {
    this.name = name;
    this._status = status;
  }
  async healthCheck() {
    return { status: this._status };
  }
}

class MockBrokenBridge {
  async healthCheck() {
    throw new Error('Bridge down');
  }
}

describe('BridgeHealthMonitor', () => {
  let monitor;

  beforeEach(() => {
    jest.clearAllMocks();
    monitor = new BridgeHealthMonitor();
  });

  describe('constructor', () => {
    it('initializes empty state', () => {
      expect(monitor.bridges).toBeInstanceOf(Map);
      expect(monitor.bridges.size).toBe(0);
      expect(monitor.metrics.calls).toBeInstanceOf(Map);
      expect(monitor.metrics.errors).toBeInstanceOf(Map);
      expect(monitor.metrics.latency).toBeInstanceOf(Map);
      expect(monitor.startTime).toBeGreaterThan(0);
    });
  });

  describe('registerBridge', () => {
    it('registers a bridge', () => {
      const bridge = { name: 'test' };
      monitor.registerBridge('test-bridge', bridge);
      expect(monitor.bridges.get('test-bridge')).toBe(bridge);
    });
  });

  describe('recordCall', () => {
    it('records a successful call', () => {
      monitor.recordCall('bridge1', 'tool1', 100, true);
      const key = 'bridge1:tool1';
      const calls = monitor.metrics.calls.get(key);
      expect(calls).toEqual({ total: 1, success: 1, errors: 0 });
      expect(monitor.metrics.latency.get(key)).toEqual([100]);
    });

    it('records a failed call', () => {
      monitor.recordCall('bridge1', 'tool1', 50, false);
      const key = 'bridge1:tool1';
      const calls = monitor.metrics.calls.get(key);
      expect(calls).toEqual({ total: 1, success: 0, errors: 1 });
    });

    it('accumulates multiple calls', () => {
      monitor.recordCall('b1', 't1', 10, true);
      monitor.recordCall('b1', 't1', 20, true);
      monitor.recordCall('b1', 't1', 30, false);
      const key = 'b1:t1';
      const calls = monitor.metrics.calls.get(key);
      expect(calls).toEqual({ total: 3, success: 2, errors: 1 });
      expect(monitor.metrics.latency.get(key)).toEqual([10, 20, 30]);
    });

    it('separates metrics by bridge and tool', () => {
      monitor.recordCall('b1', 't1', 10, true);
      monitor.recordCall('b1', 't2', 20, true);
      monitor.recordCall('b2', 't1', 30, true);
      expect(monitor.metrics.calls.size).toBe(3);
    });

    it('defaults success to true when not provided', () => {
      monitor.recordCall('b', 't', 100);
      expect(monitor.metrics.calls.get('b:t')).toEqual({ total: 1, success: 1, errors: 0 });
    });
  });

  describe('healthCheck', () => {
    it('returns healthy with no bridges', async () => {
      const result = await monitor.healthCheck();
      expect(result.overall).toBe('healthy');
      expect(result.bridges).toEqual({});
      expect(result.timestamp).toBeTruthy();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('reports healthy bridges', async () => {
      monitor.registerBridge('file', new MockBridge('file', 'healthy'));
      monitor.registerBridge('git', new MockBridge('git', 'healthy'));
      const result = await monitor.healthCheck();
      expect(result.overall).toBe('healthy');
      expect(result.bridges.file.status).toBe('healthy');
      expect(result.bridges.git.status).toBe('healthy');
    });

    it('reports degraded when some bridges fail', async () => {
      monitor.registerBridge('good', new MockBridge('good', 'healthy'));
      monitor.registerBridge('bad', new MockBridge('bad', 'unhealthy'));
      const result = await monitor.healthCheck();
      expect(result.overall).toBe('degraded');
    });

    it('reports unhealthy when all bridges fail', async () => {
      monitor.registerBridge('b1', new MockBridge('b1', 'unhealthy'));
      monitor.registerBridge('b2', new MockBridge('b2', 'unhealthy'));
      const result = await monitor.healthCheck();
      expect(result.overall).toBe('unhealthy');
    });

    it('handles bridge that throws error', async () => {
      monitor.registerBridge('broken', new MockBrokenBridge());
      const result = await monitor.healthCheck();
      expect(result.bridges.broken.status).toBe('error');
      expect(result.bridges.broken.error).toBe('Bridge down');
      expect(result.overall).toBe('unhealthy');
    });

    it('handles bridge without healthCheck method', async () => {
      monitor.registerBridge('basic', {});
      const result = await monitor.healthCheck();
      expect(result.bridges.basic.status).toBe('unknown');
    });

    it('checks system components', async () => {
      mockRootsManager.getRoots.mockReturnValue(['/path1']);
      mockRootsManager.isReadable.mockReturnValue(true);
      mockRootsManager.isWritable.mockReturnValue(false);
      mockThinkingChain.listChains.mockReturnValue([
        { status: 'in_progress' },
        { status: 'completed' }
      ]);
      mockThinkingChain.getStorageStats.mockReturnValue({ total: 2 });
      const result = await monitor.healthCheck();
      expect(result.system.roots.configured).toBe(1);
      expect(result.system.roots.roots[0].readable).toBe(true);
      expect(result.system.roots.roots[0].writable).toBe(false);
      expect(result.system.thinking.activeChains).toBe(1);
      expect(result.system.thinking.totalChains).toBe(2);
      expect(result.system.thinking.storage).toEqual({ total: 2 });
    });
  });

  describe('checkRoots', () => {
    it('returns roots with permissions', async () => {
      mockRootsManager.getRoots.mockReturnValue(['/a', '/b']);
      mockRootsManager.isReadable.mockReturnValue(true);
      mockRootsManager.isWritable.mockReturnValue(false);
      const result = await monitor.checkRoots();
      expect(result.configured).toBe(2);
      expect(result.roots[0].path).toBe('/a');
      expect(result.roots[0].readable).toBe(true);
      expect(result.roots[0].writable).toBe(false);
    });
  });

  describe('checkThinking', () => {
    it('returns thinking chain stats', async () => {
      mockThinkingChain.listChains.mockReturnValue([
        { status: 'in_progress' },
        { status: 'in_progress' },
        { status: 'completed' }
      ]);
      mockThinkingChain.getStorageStats.mockReturnValue({ chains: 3 });
      const result = await monitor.checkThinking();
      expect(result.activeChains).toBe(2);
      expect(result.totalChains).toBe(3);
      expect(result.storage).toEqual({ chains: 3 });
    });

    it('handles missing getStorageStats', async () => {
      mockThinkingChain.listChains.mockReturnValue([]);
      delete mockThinkingChain.getStorageStats;
      const result = await monitor.checkThinking();
      expect(result.activeChains).toBe(0);
      expect(result.totalChains).toBe(0);
      expect(result.storage).toEqual({});
    });
  });

  describe('checkMemory', () => {
    it('returns memory usage in MB', () => {
      const result = monitor.checkMemory();
      expect(result.heapUsed).toMatch(/^\d+ MB$/);
      expect(result.heapTotal).toMatch(/^\d+ MB$/);
      expect(result.external).toMatch(/^\d+ MB$/);
      expect(result.rss).toMatch(/^\d+ MB$/);
    });
  });

  describe('getMetrics', () => {
    it('returns empty metrics when no calls recorded', () => {
      const metrics = monitor.getMetrics();
      expect(metrics.calls).toEqual({});
      expect(metrics.latency).toEqual({});
      expect(metrics.errorRate).toEqual({});
    });

    it('returns call stats and error rate', () => {
      monitor.recordCall('b1', 't1', 100, true);
      monitor.recordCall('b1', 't1', 100, false);
      const metrics = monitor.getMetrics();
      expect(metrics.calls['b1:t1']).toEqual({ total: 2, success: 1, errors: 1 });
      expect(metrics.errorRate['b1:t1']).toBe('50.0%');
    });

    it('returns latency percentiles for single value', () => {
      monitor.recordCall('b1', 't1', 100, true);
      const metrics = monitor.getMetrics();
      expect(metrics.latency['b1:t1'].count).toBe(1);
      expect(metrics.latency['b1:t1'].avg).toBe(100);
      expect(metrics.latency['b1:t1'].p50).toBe(100);
      expect(metrics.latency['b1:t1'].p95).toBe(100);
      expect(metrics.latency['b1:t1'].p99).toBe(100);
    });

    it('returns latency percentiles for multiple values', () => {
      monitor.recordCall('b1', 't1', 10, true);
      monitor.recordCall('b1', 't1', 20, true);
      monitor.recordCall('b1', 't1', 30, true);
      monitor.recordCall('b1', 't1', 100, true);
      const metrics = monitor.getMetrics();
      const lat = metrics.latency['b1:t1'];
      expect(lat.count).toBe(4);
      expect(lat.avg).toBe(40);
      expect(lat.p50).toBe(30);
      expect(lat.p95).toBe(100);
      expect(lat.p99).toBe(100);
    });

    it('returns 0% error rate when no errors', () => {
      monitor.recordCall('b1', 't1', 50, true);
      const metrics = monitor.getMetrics();
      expect(metrics.errorRate['b1:t1']).toBe('0.0%');
    });

    it('handles stale calls entry with zero total', () => {
      monitor.metrics.calls.set('stale:k', { total: 0, success: 0, errors: 0 });
      const metrics = monitor.getMetrics();
      expect(metrics.errorRate['stale:k']).toBe('0%');
    });

    it('handles empty latency array entry', () => {
      monitor.metrics.latency.set('stale:k', []);
      const metrics = monitor.getMetrics();
      expect(metrics.latency).toEqual({});
    });
  });

  describe('getDryRunStats', () => {
    it('returns dry run stats', () => {
      const stats = monitor.getDryRunStats();
      expect(stats).toBeDefined();
    });

    it('computes ratio when preview and execution both exist', () => {
      const { DryRunHistory } = require('../../src/mcp/engines/DryRunHistory');
      DryRunHistory.mockReturnValueOnce({
        getStats: jest.fn().mockReturnValueOnce({
          total: 20, previewOnly: 10, executed: 5, success: 3, failed: 2
        })
      });
      const stats = monitor.getDryRunStats();
      expect(stats.previewVsExecution).toBe('2.00:1');
    });

    it('returns N/A when only previewOnly is positive', () => {
      const { DryRunHistory } = require('../../src/mcp/engines/DryRunHistory');
      DryRunHistory.mockReturnValueOnce({
        getStats: jest.fn().mockReturnValueOnce({
          total: 10, previewOnly: 5, executed: 0, success: 0, failed: 0
        })
      });
      const stats = monitor.getDryRunStats();
      expect(stats.previewVsExecution).toBe('N/A');
    });
  });

  describe('getFullReport', () => {
    it('returns combined health, metrics and dry run stats', async () => {
      monitor.registerBridge('test', new MockBridge('test', 'healthy'));
      monitor.recordCall('b1', 't1', 50, true);
      const report = await monitor.getFullReport();
      expect(report.timestamp).toBeTruthy();
      expect(report.overall).toBe('healthy');
      expect(report.metrics).toBeDefined();
      expect(report.metrics.calls).toBeDefined();
      expect(report.dryRun).toBeDefined();
    });
  });

  describe('log', () => {
    it('creates a log entry with sanitized params', () => {
      const entry = monitor.log(
        'req-1',
        'chain-1',
        'read_file',
        { path: '/safe', token: 'secret123' },
        { error: null },
        100
      );
      expect(entry.requestId).toBe('req-1');
      expect(entry.chainId).toBe('chain-1');
      expect(entry.toolName).toBe('read_file');
      expect(entry.params.path).toBe('/safe');
      expect(entry.params.token).toBe('[REDACTED]');
      expect(entry.success).toBe(true);
      expect(entry.duration).toBe(100);
      expect(entry.resultSummary).toBe('ok');
    });

    it('marks failure and includes error message', () => {
      const entry = monitor.log('r1', 'c1', 'tool', {}, { error: 'Something broke' }, 50);
      expect(entry.success).toBe(false);
      expect(entry.resultSummary).toBe('Something broke');
    });
  });

  describe('sanitizeParams', () => {
    it('redacts sensitive fields', () => {
      const result = monitor.sanitizeParams({
        path: '/safe',
        apiKey: 'sk-123',
        password: 'p@ss',
        secret: 'my-secret',
        authorization: 'Bearer token',
        normal: 'visible'
      });
      expect(result.path).toBe('/safe');
      expect(result.password).toBe('[REDACTED]');
      expect(result.secret).toBe('[REDACTED]');
      expect(result.authorization).toBe('[REDACTED]');
      expect(result.normal).toBe('visible');
    });

    it('redacts token key', () => {
      const result = monitor.sanitizeParams({ TOKEN: 'secret' });
      expect(result.TOKEN).toBe('[REDACTED]');
    });

    it('returns empty object for empty params', () => {
      expect(monitor.sanitizeParams({})).toEqual({});
    });
  });

  describe('resetMetrics', () => {
    it('clears all metrics', () => {
      monitor.recordCall('b1', 't1', 100, true);
      monitor.recordCall('b2', 't2', 200, false);
      const result = monitor.resetMetrics();
      expect(result).toEqual({ success: true });
      expect(monitor.metrics.calls.size).toBe(0);
      expect(monitor.metrics.errors.size).toBe(0);
      expect(monitor.metrics.latency.size).toBe(0);
    });
  });

  describe('singleton', () => {
    it('exports a singleton instance', () => {
      expect(healthMonitor).toBeInstanceOf(BridgeHealthMonitor);
    });
  });
});
