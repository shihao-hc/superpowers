const { createMCPMetricsHandler, MCPAuditLogger, getMCPAuditLogger, logMCPCall, getMCPAuditStats, getMCPAuditEntries } = require('../../src/mcp/metrics');

jest.mock('fs');

describe('createMCPMetricsHandler', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {};
    res = { set: jest.fn(), send: jest.fn(), status: jest.fn().mockReturnThis() };
  });

  it('returns 503 when mcpPlugin is null', () => {
    const handler = createMCPMetricsHandler(null);
    handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.send).toHaveBeenCalledWith('# MCP not available\n');
  });

  it('returns 503 when mcpPlugin.bridge is null', () => {
    const handler = createMCPMetricsHandler({ bridge: null });
    handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('generates Prometheus metrics response', () => {
    const mcpPlugin = {
      bridge: {
        getMetrics: () => ({ totalCalls: 10, successfulCalls: 8, failedCalls: 2 })
      },
      getStatus: () => ({ tools: 5, nodes: 3, servers: { s1: { connected: true }, s2: { connected: false } } })
    };
    const handler = createMCPMetricsHandler(mcpPlugin);
    handler(req, res);
    expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
    const body = res.send.mock.calls[0][0];
    expect(body).toContain('mcp_calls_total 10');
    expect(body).toContain('mcp_calls_success_total 8');
    expect(body).toContain('mcp_calls_failed_total 2');
    expect(body).toContain('mcp_servers_connected 1');
    expect(body).toContain('mcp_tools_available 5');
    expect(body).toContain('mcp_workflow_nodes 3');
  });

  it('includes callsByServer in metrics', () => {
    const mcpPlugin = {
      bridge: {
        getMetrics: () => ({ totalCalls: 5, successfulCalls: 3, failedCalls: 2, callsByServer: { s1: { total: 3 }, s2: { total: 2 } } })
      },
      getStatus: () => ({ tools: 0, nodes: 0, servers: {} })
    };
    const handler = createMCPMetricsHandler(mcpPlugin);
    handler(req, res);
    const body = res.send.mock.calls[0][0];
    expect(body).toContain('mcp_calls_total{server="s1"} 3');
    expect(body).toContain('mcp_calls_total{server="s2"} 2');
  });

  it('includes callsByRole and callsByTool in metrics', () => {
    const mcpPlugin = {
      bridge: {
        getMetrics: () => ({ totalCalls: 2, successfulCalls: 2, failedCalls: 0, callsByRole: { admin: 1, user: 1 }, callsByTool: { 'read-file': 1, 'write-file': 1 } })
      },
      getStatus: () => ({ tools: 0, nodes: 0 })
    };
    const handler = createMCPMetricsHandler(mcpPlugin);
    handler(req, res);
    const body = res.send.mock.calls[0][0];
    expect(body).toContain('mcp_calls_by_role{role="admin"} 1');
    expect(body).toContain('mcp_calls_by_role{role="user"} 1');
    expect(body).toContain('mcp_tool_usage_total{tool="read_file"} 1');
    expect(body).toContain('mcp_tool_usage_total{tool="write_file"} 1');
  });

  it('includes cacheStats in metrics', () => {
    const mcpPlugin = {
      bridge: {
        getMetrics: () => ({ totalCalls: 2, successfulCalls: 2, failedCalls: 0, cacheStats: { hits: 5, misses: 3, size: 10 } })
      },
      getStatus: () => ({ tools: 0, nodes: 0 })
    };
    const handler = createMCPMetricsHandler(mcpPlugin);
    handler(req, res);
    const body = res.send.mock.calls[0][0];
    expect(body).toContain('mcp_cache_hits_total 5');
    expect(body).toContain('mcp_cache_misses_total 3');
    expect(body).toContain('mcp_cache_size 10');
  });

  it('handles status with null servers', () => {
    const mcpPlugin = {
      bridge: {
        getMetrics: () => ({ totalCalls: 0, successfulCalls: 0, failedCalls: 0 })
      },
      getStatus: () => ({ tools: null, nodes: null, servers: null })
    };
    const handler = createMCPMetricsHandler(mcpPlugin);
    handler(req, res);
    const body = res.send.mock.calls[0][0];
    expect(body).toContain('mcp_servers_connected 0');
    expect(body).toContain('mcp_tools_available 0');
  });

  it('includes histogram buckets in metrics', () => {
    const mcpPlugin = {
      bridge: {
        getMetrics: () => ({ totalCalls: 0, successfulCalls: 0, failedCalls: 0 })
      },
      getStatus: () => ({ tools: 0, nodes: 0 })
    };
    const handler = createMCPMetricsHandler(mcpPlugin);
    handler(req, res);
    const body = res.send.mock.calls[0][0];
    expect(body).toContain('mcp_call_duration_seconds_bucket{le="0.1"} 0');
    expect(body).toContain('mcp_call_duration_seconds_bucket{le="0.5"} 0');
    expect(body).toContain('mcp_call_duration_seconds_bucket{le="+Inf"} 0');
  });
});

describe('MCPAuditLogger', () => {
  let logger;

  beforeEach(() => {
    logger = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
  });

  describe('constructor', () => {
    it('works with no arguments', () => {
      const l = new MCPAuditLogger();
      expect(l.maxEntries).toBe(10000);
      expect(l.rotationConfig.enabled).toBe(true);
      clearInterval(l._rotationInterval);
    });

    it('sets default values', () => {
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
      expect(l.maxEntries).toBe(10000);
      expect(l.entries).toEqual([]);
      expect(l.enableFileLogging).toBe(false);
      expect(l.logPath).toBe('logs/mcp-audit');
    });

    it('accepts custom options', () => {
      const l = new MCPAuditLogger({ maxEntries: 500, logPath: '/tmp/audit', enableFileLogging: true, rotationEnabled: false });
      expect(l.maxEntries).toBe(500);
      expect(l.logPath).toBe('/tmp/audit');
      expect(l.enableFileLogging).toBe(true);
    });

    it('enables encryption and generates key when missing', () => {
      const l = new MCPAuditLogger({ enableEncryption: true, enableFileLogging: false, rotationEnabled: false });
      expect(l.enableEncryption).toBe(true);
      expect(l.encryptionKey).toBeTruthy();
    });

    it('uses provided encryption key', () => {
      const l = new MCPAuditLogger({ enableEncryption: true, encryptionKey: 'test-key', enableFileLogging: false, rotationEnabled: false });
      expect(l.encryptionKey).toBe('test-key');
    });

    it('starts rotation check when enabled', () => {
      jest.useFakeTimers();
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: true });
      jest.advanceTimersByTime(60000);
      expect(l._rotationInterval).toBeDefined();
      jest.useRealTimers();
      clearInterval(l._rotationInterval);
    });
  });

  describe('_getDateStr', () => {
    it('returns current date as YYYY-MM-DD', () => {
      const dateStr = logger._getDateStr();
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('log', () => {
    it('creates entry with correct structure', () => {
      const entry = logger.log({
        toolFullName: 'server/tool',
        server: 'server',
        tool: 'tool',
        params: { filename: 'test.txt' },
        success: true,
        duration: 100,
        username: 'alice',
        role: 'admin',
        ip: '127.0.0.1',
        source: 'api',
        workflowId: 'wf-1',
        nodeId: 'n-1'
      });

      expect(entry.toolFullName).toBe('server/tool');
      expect(entry.server).toBe('server');
      expect(entry.tool).toBe('tool');
      expect(entry.params).toEqual({ filename: 'test.txt' });
      expect(entry.user.username).toBe('alice');
      expect(entry.user.role).toBe('admin');
      expect(entry.user.ip).toBe('127.0.0.1');
      expect(entry.result.success).toBe(true);
      expect(entry.result.duration).toBe(100);
      expect(entry.result.error).toBeNull();
      expect(entry.result.cached).toBe(false);
      expect(entry.context.source).toBe('api');
      expect(entry.context.workflowId).toBe('wf-1');
      expect(entry.context.nodeId).toBe('n-1');
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.iso).toBeDefined();
      expect(entry.traceId).toBeDefined();
    });

    it('uses defaults when callData fields are missing', () => {
      const entry = logger.log({});
      expect(entry.toolFullName).toBeUndefined();
      expect(entry.server).toBeUndefined();
      expect(entry.user.username).toBe('anonymous');
      expect(entry.user.role).toBe('unknown');
      expect(entry.user.ip).toBe('unknown');
      expect(entry.result.success).toBeUndefined();
      expect(entry.result.error).toBeNull();
      expect(entry.context.source).toBe('api');
    });

    it('generates traceId when not provided', () => {
      const entry = logger.log({});
      expect(entry.traceId).toMatch(/^mcp_/);
    });

    it('uses provided traceId', () => {
      const entry = logger.log({ traceId: 'custom-trace' });
      expect(entry.traceId).toBe('custom-trace');
    });

    it('enforces maxEntries limit', () => {
      const l = new MCPAuditLogger({ maxEntries: 10, enableFileLogging: false, rotationEnabled: false });
      for (let i = 0; i < 20; i++) {
        l.log({ toolFullName: `tool${i}`, server: 's', tool: 't' });
      }
      expect(l.entries.length).toBe(8);
    });

    it('sanitizes sensitive params', () => {
      const entry = logger.log({ params: { password: 'secret123', token: 'abc', name: 'hello' } });
      expect(entry.params.password).toBe('[REDACTED]');
      expect(entry.params.token).toBe('[REDACTED]');
      expect(entry.params.name).toBe('hello');
    });

    it('truncates long string params', () => {
      const longStr = 'a'.repeat(2000);
      const entry = logger.log({ params: { data: longStr } });
      expect(entry.params.data.length).toBe(1000 + '...[truncated]'.length);
      expect(entry.params.data).toMatch(/\.\.\.\[truncated\]$/);
    });

    it('calls _logStructured in dev mode', () => {
      process.env.MCP_DEBUG = '1';
      const spy = jest.spyOn(logger, '_logStructured');
      logger.log({ toolFullName: 'x', success: true });
      expect(spy).toHaveBeenCalled();
      delete process.env.MCP_DEBUG;
    });

    it('returns the entry', () => {
      const entry = logger.log({ toolFullName: 'test', server: 's', tool: 't', params: {} });
      expect(entry.constructor).toBe(Object);
      expect(entry.toolFullName).toBe('test');
    });

    it('writes to file stream when available', () => {
      const writeMock = jest.fn();
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
      l.writeStream = { write: writeMock };
      l.log({ toolFullName: 'test', server: 's', tool: 't', params: {} });
      expect(writeMock).toHaveBeenCalled();
    });

    it('writes encrypted record when encryption enabled', () => {
      const writeMock = jest.fn();
      const l = new MCPAuditLogger({ enableEncryption: true, encryptionKey: 'test-key', enableFileLogging: false, rotationEnabled: false });
      const encryptSpy = jest.spyOn(l, '_encrypt');
      l.writeStream = { write: writeMock };
      l.log({ toolFullName: 'test', server: 's', tool: 't', params: {} });
      expect(encryptSpy).toHaveBeenCalled();
      const writtenLine = writeMock.mock.calls[0][0];
      const parsed = JSON.parse(writtenLine);
      expect(parsed.iv).toBeDefined();
      expect(parsed.data).toBeDefined();
      expect(parsed.tag).toBeDefined();
    });

    it('handles write failure gracefully', () => {
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
      l.writeStream = { write: jest.fn(() => { throw new Error('disk full'); }) };
      expect(() => l.log({})).not.toThrow();
    });
  });

  describe('_sanitizeParams', () => {
    it('returns empty object for null params', () => {
      expect(logger._sanitizeParams(null)).toEqual({});
    });

    it('returns empty object for undefined params', () => {
      expect(logger._sanitizeParams(undefined)).toEqual({});
    });

    it('redacts sensitive keys case-insensitively', () => {
      const result = logger._sanitizeParams({ Password: 'x', TOKEN: 'y', Authorization: 'z', safe: 'ok' });
      expect(result.Password).toBe('[REDACTED]');
      expect(result.TOKEN).toBe('[REDACTED]');
      expect(result.Authorization).toBe('[REDACTED]');
      expect(result.safe).toBe('ok');
    });

    it('passes non-string values through', () => {
      const result = logger._sanitizeParams({ num: 42, flag: true, arr: [1, 2] });
      expect(result.num).toBe(42);
      expect(result.flag).toBe(true);
      expect(result.arr).toEqual([1, 2]);
    });
  });

  describe('_generateTraceId', () => {
    it('returns trace ID starting with mcp_', () => {
      expect(logger._generateTraceId()).toMatch(/^mcp_/);
    });
  });

  describe('getEntries', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(1000);
      logger.log({ toolFullName: 'a', server: 's1', tool: 't1', role: 'admin', username: 'alice', success: true, traceId: 't1' });
      jest.setSystemTime(2000);
      logger.log({ toolFullName: 'b', server: 's2', tool: 't2', role: 'user', username: 'bob', success: false, error: 'fail', traceId: 't2' });
      jest.useRealTimers();
    });

    it('returns all entries by default', () => {
      expect(logger.getEntries().length).toBe(2);
    });

    it('filters by since timestamp', () => {
      expect(logger.getEntries({ since: 1500 }).length).toBe(1);
    });

    it('filters by since date string', () => {
      const entries = logger.getEntries({ since: new Date(1500).toISOString() });
      expect(entries.length).toBe(1);
    });

    it('filters by until timestamp', () => {
      expect(logger.getEntries({ until: 1500 }).length).toBe(1);
    });

    it('filters by until date string', () => {
      const entries = logger.getEntries({ until: new Date(1500).toISOString() });
      expect(entries.length).toBe(1);
    });

    it('filters by toolFullName', () => {
      expect(logger.getEntries({ toolFullName: 'a' }).length).toBe(1);
    });

    it('filters by server', () => {
      expect(logger.getEntries({ server: 's1' }).length).toBe(1);
    });

    it('filters by role', () => {
      expect(logger.getEntries({ role: 'user' }).length).toBe(1);
    });

    it('filters by username', () => {
      expect(logger.getEntries({ username: 'bob' }).length).toBe(1);
    });

    it('filters by success', () => {
      expect(logger.getEntries({ success: true }).length).toBe(1);
      expect(logger.getEntries({ success: false }).length).toBe(1);
    });

    it('filters by traceId', () => {
      expect(logger.getEntries({ traceId: 't1' }).length).toBe(1);
    });

    it('applies limit', () => {
      expect(logger.getEntries({ limit: 1 }).length).toBe(1);
    });

    it('combines multiple filters', () => {
      expect(logger.getEntries({ server: 's1', success: true }).length).toBe(1);
      expect(logger.getEntries({ server: 's1', success: false }).length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns zero stats for empty logger', () => {
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
      const stats = l.getStats();
      expect(stats.total).toBe(0);
      expect(stats.cacheRate).toBe('0%');
      expect(stats.avgDuration).toBe(0);
    });

    it('computes stats from entries', () => {
      logger.log({ toolFullName: 'a', server: 's1', tool: 't1', success: true, duration: 100, role: 'admin' });
      logger.log({ toolFullName: 'b', server: 's2', tool: 't2', success: false, duration: 200, role: 'user', error: 'err' });
      logger.log({ toolFullName: 'c', server: 's1', tool: 't3', success: true, duration: 50, role: 'admin', cached: true });

      const stats = logger.getStats();
      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.cached).toBe(1);
      expect(stats.cacheRate).toBe('33.33%');
      expect(stats.avgDuration).toBe(117);
      expect(stats.byRole.admin).toBe(2);
      expect(stats.byRole.user).toBe(1);
      expect(stats.byTool.a).toBe(1);
      expect(stats.byTool.b).toBe(1);
      expect(stats.byServer.s1).toBe(2);
      expect(stats.byServer.s2).toBe(1);
      expect(stats.byHour).toBeDefined();
      expect(stats.timeRange.from).toBeDefined();
      expect(stats.timeRange.to).toBeDefined();
    });

    it('accepts since option', () => {
      logger.log({ toolFullName: 'old', server: 's', tool: 't', success: true, duration: 1, role: 'admin' });
      const later = Date.now() + 100000;
      jest.spyOn(Date, 'now').mockReturnValueOnce(later);
      logger.log({ toolFullName: 'new', server: 's', tool: 't', success: true, duration: 1, role: 'admin' });
      jest.restoreAllMocks();

      const stats = logger.getStats({ since: later - 10 });
      expect(stats.total).toBe(1);
      expect(stats.byTool.new).toBe(1);
    });
  });

  describe('export', () => {
    beforeEach(() => {
      logger.log({ toolFullName: 'x', server: 's', tool: 't', success: true, duration: 10, params: {} });
    });

    it('exports to JSON by default', () => {
      const result = logger.export();
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
    });

    it('exports to CSV', () => {
      const result = logger.export('csv');
      expect(result).toContain('timestamp,iso');
      expect(result).toContain('true');
      expect(result).toContain('10');
      const lines = result.split('\n');
      expect(lines.length).toBe(2);
    });

    it('passes options to getEntries', () => {
      const spy = jest.spyOn(logger, 'getEntries');
      logger.export('json', { server: 's' });
      expect(spy).toHaveBeenCalledWith({ server: 's' });
    });
  });

  describe('clear', () => {
    it('clears entries and returns success', () => {
      logger.log({ toolFullName: 'x', server: 's', tool: 't' });
      expect(logger.entries.length).toBe(1);
      const result = logger.clear();
      expect(logger.entries.length).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe('destroy', () => {
    it('clears interval, ends writeStream, clears entries', () => {
      const endMock = jest.fn();
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
      l._rotationInterval = 123;
      l.writeStream = { end: endMock };
      l.entries = [{ x: 1 }];
      l.destroy();
      expect(endMock).toHaveBeenCalled();
      expect(l.entries.length).toBe(0);
    });

    it('handles end() throwing', () => {
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
      l.writeStream = { end: jest.fn(() => { throw new Error('fail'); }) };
      expect(() => l.destroy()).not.toThrow();
    });

    it('handles null writeStream', () => {
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
      expect(() => l.destroy()).not.toThrow();
    });
  });

  describe('_logStructured', () => {
    it('logs error level for failure', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation();
      logger._logStructured({ toolFullName: 'x', result: { success: false } });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('logs info level for success', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      logger._logStructured({ toolFullName: 'x', result: { success: true } });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('_encrypt and _decrypt', () => {
    it('round-trips data correctly', () => {
      const l = new MCPAuditLogger({ enableEncryption: true, encryptionKey: 'test-key', enableFileLogging: false, rotationEnabled: false });
      const data = { toolFullName: 'test', user: 'alice' };
      const encrypted = l._encrypt(data);
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.data).toBeDefined();
      expect(encrypted.tag).toBeDefined();
      const decrypted = l._decrypt(encrypted);
      expect(decrypted).toEqual(data);
    });

    it('decrypt returns record when not encrypted', () => {
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
      const record = { id: 1, data: 'hello' };
      expect(l._decrypt(record)).toBe(record);
    });

    it('decrypt returns record on failure', () => {
      const l = new MCPAuditLogger({ enableEncryption: true, encryptionKey: 'key', enableFileLogging: false, rotationEnabled: false });
      const result = l._decrypt({ iv: 'bad', data: 'bad', tag: 'bad' });
      expect(result).toEqual({ iv: 'bad', data: 'bad', tag: 'bad' });
    });

    it('returns data as-is when encryption disabled', () => {
      const l = new MCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
      expect(l._encrypt({ x: 1 })).toEqual({ x: 1 });
    });
  });

  describe('_initFileLogging', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('creates directory and opens log file', () => {
      const fs = require('fs');
      fs.existsSync.mockReturnValue(true);
      fs.createWriteStream.mockReturnValue({ on: jest.fn() });
      const _l = new MCPAuditLogger({ logPath: 'logs/mcp-audit', enableFileLogging: true, rotationEnabled: false });
      expect(fs.createWriteStream).toHaveBeenCalled();
    });

    it('creates directory if missing', () => {
      const fs = require('fs');
      fs.existsSync.mockReturnValue(false);
      fs.createWriteStream.mockReturnValue({ on: jest.fn() });
      const _l = new MCPAuditLogger({ logPath: '/tmp/audit', enableFileLogging: true, rotationEnabled: false });
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('disables file logging on failure', () => {
      const fs = require('fs');
      fs.existsSync.mockImplementation(() => { throw new Error('perm denied'); });
      const l = new MCPAuditLogger({ logPath: '/bad/path', enableFileLogging: true, rotationEnabled: false });
      expect(l.enableFileLogging).toBe(false);
    });
  });

  describe('_openNewLogFile', () => {
    it('opens new log file and sets currentFileSize', () => {
      const fs = require('fs');
      const writeMock = { on: jest.fn() };
      fs.createWriteStream.mockReturnValue(writeMock);
      logger._openNewLogFile();
      expect(fs.createWriteStream).toHaveBeenCalled();
      expect(logger.currentFileSize).toBe(0);
    });

    it('ends existing writeStream before opening new', () => {
      const fs = require('fs');
      const endMock = jest.fn();
      fs.createWriteStream.mockReturnValue({ on: jest.fn() });
      logger.writeStream = { end: endMock };
      logger._openNewLogFile();
      expect(endMock).toHaveBeenCalled();
    });

    it('sets up error handler on write stream', () => {
      const fs = require('fs');
      const onMock = jest.fn();
      fs.createWriteStream.mockReturnValue({ on: onMock });
      logger._openNewLogFile();
      expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('write stream error handler logs error', () => {
      const fs = require('fs');
      const onMock = jest.fn();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      fs.createWriteStream.mockReturnValue({ on: onMock });
      logger._openNewLogFile();
      const errorHandler = onMock.mock.calls.find(c => c[0] === 'error')[1];
      errorHandler(new Error('stream error'));
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles failure gracefully', () => {
      const fs = require('fs');
      fs.createWriteStream.mockImplementation(() => { throw new Error('cannot open'); });
      expect(() => logger._openNewLogFile()).not.toThrow();
    });
  });

  describe('_checkRotation', () => {
    it('opens new file when date changes', () => {
      const spy = jest.spyOn(logger, '_openNewLogFile');
      logger.currentDate = '2000-01-01';
      logger._checkRotation();
      expect(spy).toHaveBeenCalled();
    });

    it('opens new file when file size exceeds max', () => {
      const spy = jest.spyOn(logger, '_openNewLogFile');
      logger.currentDate = logger._getDateStr();
      logger.currentFileSize = logger.rotationConfig.maxSize + 1;
      logger._checkRotation();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('_cleanupOldFiles', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('deletes old files beyond maxFiles', () => {
      const fs = require('fs');
      const now = Date.now();
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['mcp-audit-1.jsonl', 'mcp-audit-2.jsonl', 'mcp-audit-3.jsonl', 'mcp-audit-4.jsonl']);
      fs.statSync.mockImplementation((_p) => ({
        mtime: new Date(now - 100000)
      }));
      fs.unlinkSync = jest.fn();

      const l = new MCPAuditLogger({ logPath: '/tmp/mcp-audit', enableFileLogging: false, rotationEnabled: false, maxFiles: 2 });
      l._cleanupOldFiles();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('deletes expired files beyond maxAge', () => {
      const fs = require('fs');
      const veryOld = Date.now() - 365 * 24 * 60 * 60 * 1000;
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['mcp-audit-old.jsonl', 'mcp-audit-new.jsonl']);
      fs.statSync.mockImplementation((p) => ({
        mtime: p.includes('old') ? new Date(veryOld) : new Date()
      }));
      fs.unlinkSync = jest.fn();

      logger._cleanupOldFiles();
      expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('old'));
    });

    it('returns early if directory does not exist', () => {
      const fs = require('fs');
      fs.existsSync.mockReturnValue(false);
      logger._cleanupOldFiles();
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    it('handles cleanup error gracefully', () => {
      const fs = require('fs');
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockImplementation(() => { throw new Error('read error'); });
      expect(() => logger._cleanupOldFiles()).not.toThrow();
    });
  });
});

describe('getMCPAuditLogger', () => {
  afterEach(() => {
    delete require.cache[require.resolve('../../src/mcp/metrics')];
  });

  it('returns a MCPAuditLogger instance', () => {
    const logger = getMCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
    expect(logger).toBeInstanceOf(MCPAuditLogger);
  });

  it('returns the same instance on subsequent calls', () => {
    const a = getMCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
    const b = getMCPAuditLogger({ enableFileLogging: false, rotationEnabled: false });
    expect(a).toBe(b);
  });
});

describe('logMCPCall', () => {
  it('logs and returns entry', () => {
    const entry = logMCPCall({ toolFullName: 's/t', success: true });
    expect(entry.toolFullName).toBe('s/t');
    expect(entry.result.success).toBe(true);
  });
});

describe('getMCPAuditStats', () => {
  it('delegates to logger', () => {
    const result = getMCPAuditStats();
    expect(result).toBeDefined();
    expect(result.total).toBeDefined();
  });
});

describe('getMCPAuditEntries', () => {
  it('delegates to logger', () => {
    const result = getMCPAuditEntries();
    expect(Array.isArray(result)).toBe(true);
  });
});
