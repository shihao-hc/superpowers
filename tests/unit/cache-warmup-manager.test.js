const { CacheWarmupManager, defaultWarmupConfig } = require('../../src/performance/CacheWarmupManager');

describe('CacheWarmupManager', () => {
  let manager;

  beforeEach(() => {
    manager = new CacheWarmupManager();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(manager.options.enabled).toBe(true);
      expect(manager.options.parallelLimit).toBe(3);
      expect(manager.options.warmupDelay).toBe(2000);
      expect(manager.options.retryAttempts).toBe(2);
      expect(manager.warmupTasks).toBeInstanceOf(Map);
      expect(manager._isWarming).toBe(false);
    });

    it('should accept custom options', () => {
      const m = new CacheWarmupManager({ enabled: false, parallelLimit: 5 });
      expect(m.options.enabled).toBe(false);
      expect(m.options.parallelLimit).toBe(5);
    });
  });

  describe('register', () => {
    it('should register a warmup task', () => {
      const handler = jest.fn();
      manager.register('test-task', handler, { priority: 1 });
      const task = manager.warmupTasks.get('test-task');
      expect(task.name).toBe('test-task');
      expect(task.handler).toBe(handler);
      expect(task.priority).toBe(1);
      expect(task.dependencies).toEqual([]);
      expect(task.timeout).toBe(30000);
      expect(task.enabled).toBe(true);
    });

    it('should return this for chaining', () => {
      const result = manager.register('test', jest.fn());
      expect(result).toBe(manager);
    });
  });

  describe('registerBatch', () => {
    it('should register multiple tasks', () => {
      manager.registerBatch([
        { name: 'task1', handler: jest.fn(), options: { priority: 1 } },
        { name: 'task2', handler: jest.fn(), options: { priority: 2 } }
      ]);
      expect(manager.warmupTasks.size).toBe(2);
    });

    it('should return this for chaining', () => {
      const result = manager.registerBatch([]);
      expect(result).toBe(manager);
    });
  });

  describe('warmup', () => {
    it('should return stats if disabled', async () => {
      const m = new CacheWarmupManager({ enabled: false });
      const stats = await m.warmup({}, {});
      expect(stats.totalTasks).toBe(0);
    });

    it('should return stats if already warming', async () => {
      manager._isWarming = true;
      const stats = await manager.warmup({}, {});
      expect(stats.totalTasks).toBe(0);
    });

    it('should execute registered tasks', async () => {
      const handler = jest.fn().mockResolvedValue('ok');
      manager.register('task1', handler);

      const cacheService = {};
      const skillManager = {};
      const stats = await manager.warmup(cacheService, skillManager);
      expect(handler).toHaveBeenCalledWith(cacheService, skillManager);
      expect(stats.completed).toBe(1);
      expect(stats.totalTasks).toBe(1);
    });

    it('should skip disabled tasks', async () => {
      const handler = jest.fn();
      manager.register('enabled', handler, { enabled: true });
      manager.register('disabled', handler, { enabled: false });

      await manager.warmup({}, {});
      expect(handler).toHaveBeenCalledTimes(1);
      expect(manager.stats.completed).toBe(1);
    });

    it('should sort tasks by priority', async () => {
      const execOrder = [];
      manager.register('low', jest.fn().mockImplementation(async () => { execOrder.push('low'); }), { priority: 10 });
      manager.register('high', jest.fn().mockImplementation(async () => { execOrder.push('high'); }), { priority: 1 });

      await manager.warmup({}, {});
      expect(execOrder[0]).toBe('high');
    });

    it('should handle task failures gracefully', async () => {
      manager.register('failing', jest.fn().mockRejectedValue(new Error('Failed')));

      const stats = await manager.warmup({}, {});
      expect(stats.failed).toBe(1);
      expect(stats.completed).toBe(0);
    });

    it('should emit warmup-complete event', async () => {
      const handler = jest.fn();
      manager.on('warmup-complete', handler);
      manager.register('task1', jest.fn().mockResolvedValue());

      await manager.warmup({}, {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should emit task-complete event on success', async () => {
      const handler = jest.fn();
      manager.on('task-complete', handler);
      manager.register('task1', jest.fn().mockResolvedValue('ok'));

      await manager.warmup({}, {});
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        name: 'task1',
        result: 'ok'
      }));
    });

    it('should emit task-failed event on failure', async () => {
      const handler = jest.fn();
      manager.on('task-failed', handler);
      manager.register('failing', jest.fn().mockRejectedValue(new Error('Failed')));

      await manager.warmup({}, {});
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        name: 'failing',
        error: 'Failed'
      }));
    });

    it('should handle dependency check failure', async () => {
      manager.register('dependent', jest.fn(), { dependencies: ['missing-dep'] });

      await manager.warmup({}, {});
      expect(manager.stats.failed).toBe(1);
    });

    it('should respect parallel limit', async () => {
      const handler = jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
      const m = new CacheWarmupManager({ parallelLimit: 2 });
      m.register('task1', handler);
      m.register('task2', handler);
      m.register('task3', handler);

      await m.warmup({}, {});
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe('warmupSkillMetadata', () => {
    it('should cache skill metadata', async () => {
      const cacheService = { set: jest.fn().mockResolvedValue() };
      const skillManager = {
        getAllSkills: () => [
          { id: '1', name: 'Skill1', category: 'dev', tags: ['js'] },
          { id: '2', name: 'Skill2', category: 'ops', tags: ['docker'] }
        ]
      };
      const metadata = await manager.warmupSkillMetadata(cacheService, skillManager);
      expect(metadata).toHaveLength(2);
      expect(cacheService.set).toHaveBeenCalledWith('skills:metadata', metadata, 3600);
    });

    it('should not set cache if no skills', async () => {
      const cacheService = { set: jest.fn() };
      const skillManager = { getAllSkills: () => [] };
      await manager.warmupSkillMetadata(cacheService, skillManager);
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should return undefined if skillManager is missing', async () => {
      const result = await manager.warmupSkillMetadata({ set: jest.fn() }, null);
      expect(result).toBeUndefined();
    });
  });

  describe('warmupUserPermissions', () => {
    it('should cache role permissions', async () => {
      const cacheService = { set: jest.fn().mockResolvedValue() };
      const permissions = await manager.warmupUserPermissions(cacheService);
      expect(permissions.admin).toEqual(['*']);
      expect(permissions.user).toEqual(['read', 'execute']);
      expect(permissions.guest).toEqual(['read']);
      expect(cacheService.set).toHaveBeenCalledWith('permissions:roles', permissions, 7200);
    });
  });

  describe('warmupIndustrySolutions', () => {
    it('should cache industry solutions when module exists', async () => {
      const cacheService = { set: jest.fn() };
      const result = await manager.warmupIndustrySolutions(cacheService);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('warmupToolAnnotations', () => {
    it('should handle missing dependency gracefully', async () => {
      const cacheService = { set: jest.fn() };
      const result = await manager.warmupToolAnnotations(cacheService);
      expect(result).toEqual({});
    });
  });

  describe('getStats', () => {
    it('should return current stats', () => {
      const stats = manager.getStats();
      expect(stats.totalTasks).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.isWarming).toBe(false);
      expect(stats.duration).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all tasks and reset stats', () => {
      manager.register('task1', jest.fn());
      manager.register('task2', jest.fn());
      expect(manager.warmupTasks.size).toBe(2);

      manager.clear();
      expect(manager.warmupTasks.size).toBe(0);
      expect(manager.stats.totalTasks).toBe(0);
      expect(manager.stats.completed).toBe(0);
    });
  });

  describe('defaultWarmupConfig', () => {
    it('should export a config with 4 tasks', () => {
      expect(defaultWarmupConfig).toHaveLength(4);
      expect(defaultWarmupConfig[0].name).toBe('skill-metadata');
      expect(defaultWarmupConfig[1].name).toBe('user-permissions');
      expect(defaultWarmupConfig[2].name).toBe('industry-solutions');
      expect(defaultWarmupConfig[3].name).toBe('tool-annotations');
    });

    it('should have handlers that are functions', () => {
      for (const task of defaultWarmupConfig) {
        expect(typeof task.handler).toBe('function');
        expect(typeof task.options).toBe('object');
      }
    });
  });

  describe('register edge cases', () => {
    it('should default to priority 5 when priority is 0', () => {
      manager.register('test', jest.fn(), { priority: 0 });
      expect(manager.warmupTasks.get('test').priority).toBe(5);
    });

    it('should default to timeout 30000 when timeout is 0', () => {
      manager.register('test', jest.fn(), { timeout: 0 });
      expect(manager.warmupTasks.get('test').timeout).toBe(30000);
    });
  });

  describe('dependency check', () => {
    it('should succeed when dependencies are satisfied', async () => {
      manager.register('dep', jest.fn().mockResolvedValue('ok'));
      manager.register('dependent', jest.fn().mockResolvedValue('ok'), { dependencies: ['dep'] });
      const stats = await manager.warmup({}, {});
      expect(stats.completed).toBe(2);
    });
  });

  describe('timeout', () => {
    it('should handle task timeout', async () => {
      manager.register('slow', jest.fn().mockImplementation(() => new Promise(() => {})), { timeout: 50 });
      const stats = await manager.warmup({}, {});
      expect(stats.failed).toBe(1);
    });
  });

  describe('warmupSkillMetadata without getAllSkills', () => {
    it('should handle missing getAllSkills method', async () => {
      const cacheService = { set: jest.fn() };
      const metadata = await manager.warmupSkillMetadata(cacheService, {});
      expect(metadata).toEqual([]);
      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('getStats after warmup', () => {
    it('should show duration after warmup completes', async () => {
      manager.register('test', jest.fn().mockResolvedValue('ok'));
      await manager.warmup({}, {});
      const stats = manager.getStats();
      expect(stats.duration).toBeGreaterThanOrEqual(0);
      expect(stats.isWarming).toBe(false);
      expect(stats.completed).toBe(1);
    });
  });

  describe('defaultWarmupConfig handler execution', () => {
    it('should execute skill-metadata handler', async () => {
      const cacheService = { set: jest.fn().mockResolvedValue() };
      const skillManager = {
        getAllSkills: () => [{ id: '1', name: 'test', category: 'dev', tags: ['js'] }]
      };
      const result = await defaultWarmupConfig[0].handler(cacheService, skillManager);
      expect(cacheService.set).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should execute user-permissions handler', async () => {
      const cacheService = { set: jest.fn().mockResolvedValue() };
      const permissions = await defaultWarmupConfig[1].handler(cacheService);
      expect(permissions.admin).toEqual(['*']);
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should execute industry-solutions handler', async () => {
      const cacheService = { set: jest.fn() };
      const result = await defaultWarmupConfig[2].handler(cacheService);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should execute tool-annotations handler', async () => {
      const cacheService = { set: jest.fn() };
      const result = await defaultWarmupConfig[3].handler(cacheService);
      expect(result).toEqual({});
    });
  });

  describe('module dependency mocking', () => {
    afterAll(() => {
      jest.resetModules();
      jest.unmock('../../src/skills/solutions/IndustrySolutions');
      jest.unmock('../../src/mcp/engines/ToolAnnotations');
    });

    it('should return empty array when industry solutions module throws', async () => {
      jest.resetModules();
      jest.doMock('../../src/skills/solutions/IndustrySolutions', () => {
        throw new Error('Module error');
      });

      const { CacheWarmupManager: CWM } = require('../../src/performance/CacheWarmupManager');
      const m = new CWM();
      const cacheService = { set: jest.fn() };
      const result = await m.warmupIndustrySolutions(cacheService);
      expect(result).toEqual([]);
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should handle empty industry solutions list', async () => {
      jest.resetModules();
      jest.doMock('../../src/skills/solutions/IndustrySolutions', () => ({
        IndustrySolutions: class {
          getAllSolutions() { return []; }
        }
      }));

      const { CacheWarmupManager: CWM } = require('../../src/performance/CacheWarmupManager');
      const m = new CWM();
      const cacheService = { set: jest.fn() };
      const result = await m.warmupIndustrySolutions(cacheService);
      expect(result).toEqual([]);
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should cache tool annotations when module loads', async () => {
      jest.resetModules();
      jest.doMock('../../src/mcp/engines/ToolAnnotations', () => ({
        ToolAnnotations: {
          getAllAnnotations: () => ({ tool1: { name: 'Tool 1' }, tool2: { name: 'Tool 2' } })
        }
      }));

      const { CacheWarmupManager: CWM } = require('../../src/performance/CacheWarmupManager');
      const m = new CWM();
      const cacheService = { set: jest.fn().mockResolvedValue() };
      const result = await m.warmupToolAnnotations(cacheService);
      expect(Object.keys(result)).toHaveLength(2);
      expect(cacheService.set).toHaveBeenCalledWith('annotations:tools', result, 3600);
    });

    it('should not cache empty tool annotations', async () => {
      jest.resetModules();
      jest.doMock('../../src/mcp/engines/ToolAnnotations', () => ({
        ToolAnnotations: {
          getAllAnnotations: () => ({})
        }
      }));

      const { CacheWarmupManager: CWM } = require('../../src/performance/CacheWarmupManager');
      const m = new CWM();
      const cacheService = { set: jest.fn() };
      const result = await m.warmupToolAnnotations(cacheService);
      expect(result).toEqual({});
      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });
});
