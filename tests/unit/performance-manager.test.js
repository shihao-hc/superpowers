const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

jest.mock('fs');
jest.mock('js-yaml', () => ({
  load: jest.fn(() => ({})),
  dump: jest.fn(() => 'yaml-string')
}));

const { PerformanceManager, DEFAULT_CONFIG } = require('../../src/performance/PerformanceManager');

describe('PerformanceManager', () => {
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    fs.existsSync.mockReturnValue(false);
    manager = new PerformanceManager();
  });

  afterEach(() => {
    if (manager) manager.destroy();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('uses default config path when none provided', () => {
      expect(manager.configPath).toBe(path.join(process.cwd(), 'config', 'performance.yaml'));
    });

    test('uses custom config path', () => {
      const m = new PerformanceManager('/custom/path.yaml');
      expect(m.configPath).toBe('/custom/path.yaml');
      m.destroy();
    });

    test('initializes config with defaults', () => {
      expect(manager.config.workflow.maxConcurrent).toBe(10);
      expect(manager.config.mcp.connectionPoolSize).toBe(2);
      expect(manager.config.monitoring.alerts.workflowP95Latency).toBe(5000);
    });

    test('starts watching interval when hotReload enabled', () => {
      expect(manager.watchInterval).not.toBeNull();
    });

    test('does not start watching when hotReload disabled', () => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        'hotReload:\n  enabled: false\n  checkInterval: 30000\n  excludePatterns:\n    - hotReload\n    - monitoring.alerts'
      );
      yaml.load.mockReturnValue({
        hotReload: { enabled: false, checkInterval: 30000, excludePatterns: ['hotReload', 'monitoring.alerts'] }
      });
      fs.statSync.mockReturnValue({ mtime: new Date() });

      const m = new PerformanceManager();
      expect(m.watchInterval).toBeNull();
      m.destroy();
    });
  });

  describe('_buildSchema', () => {
    test('returns complete schema with all sections', () => {
      const schema = manager._buildSchema();
      expect(schema).toHaveProperty('workflow');
      expect(schema).toHaveProperty('mcp');
      expect(schema).toHaveProperty('agent');
      expect(schema).toHaveProperty('dataStorage');
      expect(schema.workflow.maxConcurrent).toEqual({ type: 'number', min: 1, max: 100 });
    });
  });

  describe('_validateValue', () => {
    test('returns true for valid boolean', () => {
      expect(manager._validateValue(true, { type: 'boolean' }, 'test')).toBe(true);
    });

    test('returns false for non-boolean', () => {
      expect(manager._validateValue('yes', { type: 'boolean' }, 'test')).toBe(false);
    });

    test('returns true for valid number within range', () => {
      expect(manager._validateValue(50, { type: 'number', min: 1, max: 100 }, 'test')).toBe(true);
    });

    test('returns false for number below minimum', () => {
      expect(manager._validateValue(0, { type: 'number', min: 1 }, 'test')).toBe(false);
    });

    test('returns false for number above maximum', () => {
      expect(manager._validateValue(200, { type: 'number', max: 100 }, 'test')).toBe(false);
    });

    test('returns false for NaN', () => {
      expect(manager._validateValue(NaN, { type: 'number' }, 'test')).toBe(false);
    });

    test('returns false for non-number type when number expected', () => {
      expect(manager._validateValue('abc', { type: 'number' }, 'test')).toBe(false);
    });
  });

  describe('_validateConfig', () => {
    test('validates flat config values without error', () => {
      const schema = { maxConcurrent: { type: 'number', min: 1 } };
      expect(() => manager._validateConfig({ maxConcurrent: 5 }, schema)).not.toThrow();
    });

    test('validates nested object config', () => {
      const schema = { workflow: { maxConcurrent: { type: 'number', min: 1 } } };
      expect(() => manager._validateConfig({ workflow: { maxConcurrent: 5 } }, schema)).not.toThrow();
    });

    test('warns when nested key value is not an object', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const schema = { workflow: { maxConcurrent: { type: 'number' } } };
      manager._validateConfig({ workflow: 'string' }, schema);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('expected object'));
      warnSpy.mockRestore();
    });

    test('skips undefined values silently', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      manager._validateConfig({}, { optional: { type: 'number' } });
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('_deepMerge', () => {
    test('merges simple values with source overriding target', () => {
      expect(manager._deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('deeply merges nested objects', () => {
      const result = manager._deepMerge({ outer: { inner: 1, other: 2 } }, { outer: { inner: 10 } });
      expect(result).toEqual({ outer: { inner: 10, other: 2 } });
    });

    test('returns target copy when source is empty', () => {
      const target = { a: 1 };
      const result = manager._deepMerge(target, {});
      expect(result).toEqual({ a: 1 });
      expect(result).not.toBe(target);
    });

    test('handles null or undefined source', () => {
      expect(manager._deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
      expect(manager._deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
    });
  });

  describe('_loadConfig', () => {
    test('loads and merges config from file', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('workflow:\n  maxConcurrent: 25');
      yaml.load.mockReturnValue({ workflow: { maxConcurrent: 25 } });
      const mtime = new Date('2024-06-01');
      fs.statSync.mockReturnValue({ mtime });

      const m = new PerformanceManager();
      expect(m.config.workflow.maxConcurrent).toBe(25);
      expect(m.config.workflow.cacheTTL).toBe(60);
      expect(m.lastModified).toBe(mtime.getTime());
      m.destroy();
    });

    test('uses defaults when file does not exist', () => {
      expect(manager.config.workflow.maxConcurrent).toBe(10);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('handles invalid YAML gracefully and falls back to defaults', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid: yaml');
      yaml.load.mockImplementation(() => { throw new Error('bad yaml'); });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const m = new PerformanceManager();
      expect(m.config.workflow.maxConcurrent).toBe(10);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load config'), expect.any(String));
      warnSpy.mockRestore();
      m.destroy();
    });

    test('handles readFileSync error gracefully', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('permission denied'); });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const m = new PerformanceManager();
      expect(m.config.workflow.maxConcurrent).toBe(10);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
      m.destroy();
    });
  });

  describe('_startWatching / _checkAndReload', () => {
    test('sets up watch interval with configured interval', () => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        'hotReload:\n  enabled: true\n  checkInterval: 5000\n  excludePatterns:\n    - hotReload\n    - monitoring.alerts'
      );
      yaml.load.mockReturnValue({
        hotReload: { enabled: true, checkInterval: 5000, excludePatterns: ['hotReload', 'monitoring.alerts'] }
      });
      fs.statSync.mockReturnValue({ mtime: new Date() });

      const m = new PerformanceManager();
      expect(m.watchInterval).not.toBeNull();
      m.destroy();
    });

    test('reloads config and notifies on file change', () => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('workflow:\n  maxConcurrent: 10');
      yaml.load.mockReturnValue({ workflow: { maxConcurrent: 10 } });
      fs.statSync.mockReturnValue({ mtime: new Date('2024-01-01') });

      const m = new PerformanceManager();
      const listener = jest.fn();
      m.on('configChanged', listener);

      fs.readFileSync.mockReturnValue('workflow:\n  maxConcurrent: 50');
      yaml.load.mockReturnValue({ workflow: { maxConcurrent: 50 } });
      fs.statSync.mockReturnValue({ mtime: new Date('2024-06-01') });

      m._checkAndReload();

      expect(listener).toHaveBeenCalledWith({
        changes: [{ key: 'workflow.maxConcurrent', oldValue: 10, newValue: 50 }],
        newConfig: expect.objectContaining({ workflow: expect.objectContaining({ maxConcurrent: 50 }) })
      });
      m.destroy();
    });

    test('does not notify when file unchanged', () => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      fs.existsSync.mockReturnValue(true);
      const mtime = new Date('2024-01-01');
      fs.readFileSync.mockReturnValue('workflow:\n  maxConcurrent: 10');
      yaml.load.mockReturnValue({ workflow: { maxConcurrent: 10 } });
      fs.statSync.mockReturnValue({ mtime });

      const m = new PerformanceManager();
      const listener = jest.fn();
      m.on('configChanged', listener);

      m._checkAndReload();

      expect(listener).not.toHaveBeenCalled();
      m.destroy();
    });

    test('does nothing when config file deleted', () => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('workflow:\n  maxConcurrent: 10');
      yaml.load.mockReturnValue({ workflow: { maxConcurrent: 10 } });
      fs.statSync.mockReturnValue({ mtime: new Date() });

      const m = new PerformanceManager();
      const listener = jest.fn();
      m.on('configChanged', listener);

      fs.existsSync.mockReturnValue(false);
      m._checkAndReload();

      expect(listener).not.toHaveBeenCalled();
      m.destroy();
    });

    test('handles errors during check gracefully', () => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('workflow:\n  maxConcurrent: 10');
      yaml.load.mockReturnValue({ workflow: { maxConcurrent: 10 } });
      fs.statSync.mockReturnValue({ mtime: new Date() });

      const m = new PerformanceManager();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const listener = jest.fn();
      m.on('configChanged', listener);

      fs.statSync.mockImplementation(() => { throw new Error('stat failed'); });
      m._checkAndReload();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Config check failed'), expect.any(String));
      expect(listener).not.toHaveBeenCalled();
      warnSpy.mockRestore();
      m.destroy();
    });
  });

  describe('_detectChanges', () => {
    test('detects changed values', () => {
      const changes = manager._detectChanges(
        { workflow: { maxConcurrent: 10 } },
        { workflow: { maxConcurrent: 20 } }
      );
      expect(changes).toEqual([{ key: 'workflow.maxConcurrent', oldValue: 10, newValue: 20 }]);
    });

    test('skips keys matching exclude patterns', () => {
      const changes = manager._detectChanges(
        { hotReload: { enabled: true } },
        { hotReload: { enabled: false } }
      );
      expect(changes).toEqual([]);
    });

    test('detects deeply nested changes', () => {
      const changes = manager._detectChanges(
        { a: { b: { c: 1 } } },
        { a: { b: { c: 2 } } }
      );
      expect(changes).toEqual([{ key: 'a.b.c', oldValue: 1, newValue: 2 }]);
    });

    test('returns empty array for identical configs', () => {
      expect(manager._detectChanges({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toEqual([]);
    });
  });

  describe('_notifyListeners', () => {
    test('notifies all handlers for event', () => {
      const h1 = jest.fn();
      const h2 = jest.fn();
      manager.on('e', h1);
      manager.on('e', h2);
      manager._notifyListeners('e', { data: 1 });
      expect(h1).toHaveBeenCalledWith({ data: 1 });
      expect(h2).toHaveBeenCalledWith({ data: 1 });
    });

    test('continues notifying remaining handlers when one throws', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const h1 = jest.fn(() => { throw new Error('oops'); });
      const h2 = jest.fn();
      manager.on('e', h1);
      manager.on('e', h2);
      manager._notifyListeners('e', {});
      expect(h2).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Listener error'), expect.any(String));
      errorSpy.mockRestore();
    });

    test('does nothing when no handlers registered', () => {
      expect(() => manager._notifyListeners('nonexistent', {})).not.toThrow();
    });
  });

  describe('get', () => {
    test('returns entire config when path is null or undefined', () => {
      expect(manager.get()).toEqual(manager.config);
      expect(manager.get(null)).toEqual(manager.config);
      expect(manager.get(undefined)).toEqual(manager.config);
    });

    test('returns top-level section', () => {
      expect(manager.get('workflow')).toEqual(manager.config.workflow);
    });

    test('returns nested value by dot-notation', () => {
      expect(manager.get('workflow.maxConcurrent')).toBe(10);
      expect(manager.get('monitoring.alerts.workflowP95Latency')).toBe(5000);
    });

    test('returns undefined for non-existent path', () => {
      expect(manager.get('nonexistent')).toBeUndefined();
      expect(manager.get('workflow.nonexistent.deep')).toBeUndefined();
    });
  });

  describe('set', () => {
    test('sets a value and returns old value', () => {
      const old = manager.set('workflow.maxConcurrent', 50);
      expect(old).toBe(10);
      expect(manager.config.workflow.maxConcurrent).toBe(50);
    });

    test('creates intermediate objects for new paths', () => {
      manager.set('new.deep.key', 42);
      expect(manager.config.new.deep.key).toBe(42);
    });

    test('notifies valueChanged listeners', () => {
      const listener = jest.fn();
      manager.on('valueChanged', listener);
      manager.set('workflow.maxConcurrent', 99);
      expect(listener).toHaveBeenCalledWith({
        path: 'workflow.maxConcurrent',
        oldValue: 10,
        newValue: 99
      });
    });

    test('sets value under existing nested key', () => {
      manager.set('monitoring.alerts.workflowP95Latency', 9999);
      expect(manager.config.monitoring.alerts.workflowP95Latency).toBe(9999);
    });
  });

  describe('on / off', () => {
    test('registers event listener', () => {
      const handler = jest.fn();
      manager.on('test', handler);
      expect(manager.listeners.get('test')).toContain(handler);
    });

    test('returns unsubscribe function that removes listener', () => {
      const handler = jest.fn();
      const unsubscribe = manager.on('test', handler);
      unsubscribe();
      expect(manager.listeners.get('test')).not.toContain(handler);
    });

    test('supports multiple listeners per event', () => {
      const h1 = jest.fn();
      const h2 = jest.fn();
      manager.on('e', h1);
      manager.on('e', h2);
      manager._notifyListeners('e', {});
      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });

    test('off removes only specified handler', () => {
      const h1 = jest.fn();
      const h2 = jest.fn();
      manager.on('e', h1);
      manager.on('e', h2);
      manager.off('e', h1);
      manager._notifyListeners('e', {});
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });

    test('off does nothing for non-existent event', () => {
      expect(() => manager.off('nonexistent', jest.fn())).not.toThrow();
    });
  });

  describe('config accessors', () => {
    test('getWorkflowConfig returns copy', () => {
      const c = manager.getWorkflowConfig();
      expect(c).toEqual(manager.config.workflow);
      c.maxConcurrent = 999;
      expect(manager.config.workflow.maxConcurrent).toBe(10);
    });

    test('getMCPConfig returns copy', () => {
      expect(manager.getMCPConfig()).toEqual(manager.config.mcp);
    });

    test('getAgentConfig returns copy', () => {
      expect(manager.getAgentConfig()).toEqual(manager.config.agent);
    });

    test('getStorageConfig returns copy', () => {
      expect(manager.getStorageConfig()).toEqual(manager.config.dataStorage);
    });

    test('getMonitoringConfig returns copy', () => {
      expect(manager.getMonitoringConfig()).toEqual(manager.config.monitoring);
    });

    test('getAlertThresholds returns copy of alerts', () => {
      expect(manager.getAlertThresholds()).toEqual(manager.config.monitoring.alerts);
    });
  });

  describe('checkAlerts', () => {
    test('detects high workflow latency', () => {
      const alerts = manager.checkAlerts({ workflowP95Latency: 6000 });
      expect(alerts).toEqual([expect.objectContaining({ type: 'WORKFLOW_SLOW', severity: 'warning' })]);
    });

    test('detects low MCP success rate', () => {
      const alerts = manager.checkAlerts({ mcpSuccessRate: 0.85 });
      expect(alerts).toEqual([expect.objectContaining({ type: 'MCP_LOW_SUCCESS_RATE', severity: 'critical' })]);
    });

    test('detects low cache hit rate', () => {
      const alerts = manager.checkAlerts({ cacheHitRate: 0.3 });
      expect(alerts).toEqual([expect.objectContaining({ type: 'LOW_CACHE_HIT_RATE', severity: 'warning' })]);
    });

    test('detects long queue', () => {
      const alerts = manager.checkAlerts({ nodeQueueLength: 150 });
      expect(alerts).toEqual([expect.objectContaining({ type: 'QUEUE_OVERFLOW', severity: 'warning' })]);
    });

    test('returns multiple alerts when multiple thresholds breached', () => {
      const alerts = manager.checkAlerts({
        workflowP95Latency: 6000,
        mcpSuccessRate: 0.8,
        cacheHitRate: 0.3,
        nodeQueueLength: 200
      });
      expect(alerts).toHaveLength(4);
    });

    test('returns empty array when no thresholds breached', () => {
      const alerts = manager.checkAlerts({
        workflowP95Latency: 1000,
        mcpSuccessRate: 0.995,
        cacheHitRate: 0.8,
        nodeQueueLength: 10
      });
      expect(alerts).toEqual([]);
    });

    test('ignores cacheHitRate when undefined', () => {
      expect(manager.checkAlerts({ workflowP95Latency: 1000, mcpSuccessRate: 0.995, nodeQueueLength: 10 })).toEqual([]);
    });

    test('handles empty metrics object', () => {
      expect(manager.checkAlerts({})).toEqual([]);
    });
  });

  describe('destroy', () => {
    test('clears watch interval', () => {
      expect(manager.watchInterval).not.toBeNull();
      manager.destroy();
      expect(manager.watchInterval).toBeNull();
    });

    test('clears all listeners', () => {
      manager.on('e', jest.fn());
      manager.destroy();
      expect(manager.listeners.size).toBe(0);
    });

    test('is safe to call multiple times', () => {
      manager.destroy();
      expect(() => manager.destroy()).not.toThrow();
    });

    test('does nothing when watchInterval is null', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('hotReload:\n  enabled: false\n  checkInterval: 30000\n  excludePatterns:\n    - hotReload\n    - monitoring.alerts');
      yaml.load.mockReturnValue({
        hotReload: { enabled: false, checkInterval: 30000, excludePatterns: ['hotReload', 'monitoring.alerts'] }
      });
      fs.statSync.mockReturnValue({ mtime: new Date() });
      const m = new PerformanceManager();
      expect(() => m.destroy()).not.toThrow();
    });
  });

  describe('static getDefaultConfig', () => {
    test('returns deep clone of DEFAULT_CONFIG', () => {
      const config = PerformanceManager.getDefaultConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
      expect(config).not.toBe(DEFAULT_CONFIG);
      expect(config.workflow).not.toBe(DEFAULT_CONFIG.workflow);
    });

    test('modifying returned config does not affect original', () => {
      const config = PerformanceManager.getDefaultConfig();
      config.workflow.maxConcurrent = 999;
      expect(DEFAULT_CONFIG.workflow.maxConcurrent).toBe(10);
    });
  });

  describe('exportConfig', () => {
    test('returns a copy of current config', () => {
      const exported = manager.exportConfig();
      expect(exported).toEqual(manager.config);
      expect(exported).not.toBe(manager.config);
    });

    test('modifying return value does not affect internal config', () => {
      const exported = manager.exportConfig();
      exported.workflow.maxConcurrent = 999;
      expect(manager.config.workflow.maxConcurrent).toBe(10);
    });
  });
});
