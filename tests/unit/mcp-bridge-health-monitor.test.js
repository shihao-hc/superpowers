const { BridgeHealthMonitor, healthMonitor } = require('../../src/mcp/BridgeHealthMonitor');
const { rootsManager } = require('../../src/mcp/engines/RootsManager');
const { thinkingChain } = require('../../src/mcp/engines/ThinkingChain');

jest.mock('../../src/mcp/engines/RootsManager');
jest.mock('../../src/mcp/engines/ThinkingChain');
jest.mock('../../src/mcp/engines/ThinkingChainStorage');
jest.mock('../../src/mcp/engines/DryRunHistory', () => ({
  DryRunHistory: jest.fn(() => ({
    getStats: jest.fn()
  }))
}));

describe('BridgeHealthMonitor', () => {
  let monitor;
  let mockDryRunStats;
  const mockBridge = {
    healthCheck: jest.fn()
  };

  beforeEach(() => {
    const DryRunMock = require('../../src/mcp/engines/DryRunHistory').DryRunHistory;
    monitor = new BridgeHealthMonitor();
    rootsManager.getRoots.mockReturnValue([]);
    rootsManager.isReadable.mockReturnValue(true);
    rootsManager.isWritable.mockReturnValue(true);
    thinkingChain.listChains.mockReturnValue([]);
    thinkingChain.getStorageStats = jest.fn().mockReturnValue({ total: 0 });

    mockDryRunStats = { previewOnly: 0, executed: 0 };
    DryRunMock.mockClear();
    DryRunMock.mockReturnValue({
      getStats: jest.fn().mockReturnValue(mockDryRunStats)
    });
  });

  describe('constructor', () => {
    it('should initialize empty bridges and metrics maps', () => {
      expect(monitor.bridges.size).toBe(0);
      expect(monitor.metrics.calls.size).toBe(0);
      expect(monitor.metrics.errors.size).toBe(0);
      expect(monitor.metrics.latency.size).toBe(0);
      expect(monitor.startTime).toBeGreaterThan(0);
    });
  });

  describe('registerBridge', () => {
    it('should store bridge by name', () => {
      monitor.registerBridge('fs', mockBridge);
      expect(monitor.bridges.get('fs')).toBe(mockBridge);
    });
  });

  describe('recordCall', () => {
    it('should track successful calls', () => {
      monitor.recordCall('fs', 'read_file', 100, true);
      const key = 'fs:read_file';
      const stats = monitor.metrics.calls.get(key);
      expect(stats.total).toBe(1);
      expect(stats.success).toBe(1);
      expect(stats.errors).toBe(0);
    });

    it('should track failed calls', () => {
      monitor.recordCall('fs', 'write_file', 200, false);
      const key = 'fs:write_file';
      const stats = monitor.metrics.calls.get(key);
      expect(stats.total).toBe(1);
      expect(stats.success).toBe(0);
      expect(stats.errors).toBe(1);
    });

    it('should record latency', () => {
      monitor.recordCall('fs', 'read', 50);
      monitor.recordCall('fs', 'read', 150);
      const latencies = monitor.metrics.latency.get('fs:read');
      expect(latencies).toEqual([50, 150]);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when no bridges registered', async () => {
      const result = await monitor.healthCheck();
      expect(result.overall).toBe('healthy');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.system).toBeDefined();
    });

    it('should include bridge health status', async () => {
      monitor.registerBridge('fs', mockBridge);
      mockBridge.healthCheck.mockResolvedValue({ status: 'healthy' });
      const result = await monitor.healthCheck();
      expect(result.bridges.fs.status).toBe('healthy');
      expect(result.overall).toBe('healthy');
    });

    it('should detect unhealthy bridge', async () => {
      monitor.registerBridge('fs', mockBridge);
      mockBridge.healthCheck.mockResolvedValue({ status: 'error', error: 'OOM' });
      const result = await monitor.healthCheck();
      expect(result.overall).toBe('unhealthy');
    });

    it('should mark overall degraded when some bridges fail', async () => {
      monitor.registerBridge('fs', mockBridge);
      monitor.registerBridge('gh', { healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }) });
      mockBridge.healthCheck.mockResolvedValue({ status: 'error' });
      const result = await monitor.healthCheck();
      expect(result.overall).toBe('degraded');
    });

    it('should handle bridge healthCheck throwing', async () => {
      monitor.registerBridge('fs', mockBridge);
      mockBridge.healthCheck.mockRejectedValue(new Error('crash'));
      const result = await monitor.healthCheck();
      expect(result.bridges.fs.status).toBe('error');
      expect(result.bridges.fs.error).toBe('crash');
    });

    it('should handle bridge without healthCheck method', async () => {
      monitor.registerBridge('basic', {});
      const result = await monitor.healthCheck();
      expect(result.bridges.basic.status).toBe('unknown');
    });
  });

  describe('checkRoots', () => {
    it('should return roots with readability info', async () => {
      rootsManager.getRoots.mockReturnValue(['/data', '/tmp']);
      const result = await monitor.checkRoots();
      expect(result.configured).toBe(2);
      expect(result.roots[0].path).toBe('/data');
      expect(result.roots[0].readable).toBe(true);
    });

    it('should handle empty roots', async () => {
      const result = await monitor.checkRoots();
      expect(result.configured).toBe(0);
      expect(result.roots).toEqual([]);
    });
  });

  describe('checkThinking', () => {
    it('should return chain stats', async () => {
      thinkingChain.listChains.mockReturnValue([
        { id: 'c1', status: 'in_progress' },
        { id: 'c2', status: 'completed' }
      ]);
      const result = await monitor.checkThinking();
      expect(result.activeChains).toBe(1);
      expect(result.totalChains).toBe(2);
      expect(result.storage).toEqual({ total: 0 });
    });

    it('should handle missing getStorageStats', async () => {
      delete thinkingChain.getStorageStats;
      const result = await monitor.checkThinking();
      expect(result.storage).toEqual({});
    });
  });

  describe('checkMemory', () => {
    it('should return memory usage strings', () => {
      const result = monitor.checkMemory();
      expect(result.heapUsed).toMatch(/MB/);
      expect(result.heapTotal).toMatch(/MB/);
      expect(result.rss).toMatch(/MB/);
    });
  });

  describe('getMetrics', () => {
    it('should return empty metrics when no calls recorded', () => {
      const result = monitor.getMetrics();
      expect(result.calls).toEqual({});
      expect(result.latency).toEqual({});
    });

    it('should compute latency percentiles', () => {
      monitor.recordCall('fs', 'read', 10);
      monitor.recordCall('fs', 'read', 20);
      monitor.recordCall('fs', 'read', 30);
      const result = monitor.getMetrics();
      expect(result.latency['fs:read'].count).toBe(3);
      expect(result.latency['fs:read'].p50).toBe(20);
      expect(result.latency['fs:read'].avg).toBe(20);
    });

    it('should compute error rate', () => {
      monitor.recordCall('fs', 'write', 100, false);
      monitor.recordCall('fs', 'write', 100, true);
      const result = monitor.getMetrics();
      expect(result.errorRate['fs:write']).toBe('50.0%');
    });

    it('should skip latency metrics with empty values', () => {
      monitor.metrics.latency.set('empty:tool', []);
      const result = monitor.getMetrics();
      expect(result.latency).toEqual({});
    });

    it('should show 0% error rate for zero total', () => {
      monitor.metrics.calls.set('test:noop', { total: 0, success: 0, errors: 0 });
      const result = monitor.getMetrics();
      expect(result.errorRate['test:noop']).toBe('0%');
    });
  });

  describe('getDryRunStats', () => {
    it('should return N/A when no previews or executions', () => {
      const result = monitor.getDryRunStats();
      expect(result.previewVsExecution).toBe('N/A');
    });

    it('should compute ratio when previews and executions exist', () => {
      mockDryRunStats.previewOnly = 5;
      mockDryRunStats.executed = 2;
      const result = monitor.getDryRunStats();
      expect(result.previewVsExecution).toBe('2.50:1');
    });
  });

  describe('getFullReport', () => {
    it('should combine health, metrics and dryRun', async () => {
      const result = await monitor.getFullReport();
      expect(result.overall).toBe('healthy');
      expect(result.metrics).toBeDefined();
      expect(result.dryRun).toBeDefined();
    });
  });

  describe('log', () => {
    it('should structure a log entry', () => {
      const entry = monitor.log('req-1', 'chain-1', 'read_file', { path: '/f' }, {}, 50);
      expect(entry.requestId).toBe('req-1');
      expect(entry.chainId).toBe('chain-1');
      expect(entry.toolName).toBe('read_file');
      expect(entry.success).toBe(true);
      expect(entry.duration).toBe(50);
    });

    it('should mark failed calls', () => {
      const entry = monitor.log('r1', null, 'write', {}, { error: 'denied' }, 10);
      expect(entry.success).toBe(false);
      expect(entry.resultSummary).toBe('denied');
    });
  });

  describe('sanitizeParams', () => {
    it('should redact sensitive keys', () => {
      const result = monitor.sanitizeParams({ apiKey: 'secret123', path: '/f' });
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.path).toBe('/f');
    });

    it('should handle empty params', () => {
      expect(monitor.sanitizeParams({})).toEqual({});
    });

    it('should redact case-insensitively', () => {
      const result = monitor.sanitizeParams({ Authorization: 'Bearer x', Token: 'abc' });
      expect(result.Authorization).toBe('[REDACTED]');
      expect(result.Token).toBe('[REDACTED]');
    });
  });

  describe('resetMetrics', () => {
    it('should clear all metric maps', () => {
      monitor.recordCall('fs', 'read', 10);
      monitor.resetMetrics();
      expect(monitor.metrics.calls.size).toBe(0);
      expect(monitor.metrics.errors.size).toBe(0);
      expect(monitor.metrics.latency.size).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should export a pre-created instance', () => {
      expect(healthMonitor).toBeInstanceOf(BridgeHealthMonitor);
    });
  });
});
