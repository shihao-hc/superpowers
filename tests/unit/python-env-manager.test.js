'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const fsOriginals = {
  existsSync: fs.existsSync,
  mkdirSync: fs.mkdirSync,
  rmSync: fs.rmSync,
  copyFileSync: fs.copyFileSync,
  writeFileSync: fs.writeFileSync,
  readFileSync: fs.readFileSync
};

jest.mock('../../src/utils/SafeExec', () => ({
  safeSpawn: jest.fn()
}));

const { safeSpawn } = require('../../src/utils/SafeExec');
const { PythonEnvManager } = require('../../src/performance/PythonEnvManager');

describe('PythonEnvManager', () => {
  let manager;
  const TEST_BASE = path.join(process.cwd(), 'uploads', 'venvs');

  function makeSpawnMock() {
    const handlers = {};
    const child = {
      on: jest.fn((event, cb) => { handlers[event] = cb; }),
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      stdin: { write: jest.fn(), end: jest.fn() },
      kill: jest.fn(),
      pid: 12345
    };
    process.nextTick(() => {
      if (handlers.close) handlers.close(0);
      if (handlers.exit) handlers.exit(0);
    });
    return child;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    safeSpawn.mockImplementation(makeSpawnMock);

    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.mkdirSync = jest.fn();
    fs.rmSync = jest.fn();
    fs.copyFileSync = jest.fn();
    fs.writeFileSync = jest.fn();
    fs.readFileSync = jest.fn().mockReturnValue('# Copy requirements if they exist');

    manager = new PythonEnvManager({ mockMode: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(fsOriginals)) fs[key] = fsOriginals[key];
  });

  describe('constructor', () => {
    it('使用默认选项时设置合理的初始值', () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      expect(m.baseDir).toBe(TEST_BASE);
      expect(m.mockMode).toBe(true);
      expect(m.dockerEnabled).toBe(true);
      expect(m.dockerImage).toBe('skill-python:latest');
      expect(m.dockerTimeout).toBe(30000);
      expect(m.dockerAvailable).toBe(false);
      expect(m.cacheEnabled).toBe(true);
      expect(m.cache).toBeInstanceOf(Map);
      expect(m.cache.size).toBe(0);
      expect(m.cacheStats).toEqual({ hits: 0, misses: 0, evictions: 0, size: 0 });
      expect(m.metrics).toEqual({
        totalExecutions: 0, dockerExecutions: 0, localExecutions: 0,
        cacheHits: 0, cacheMisses: 0, averageExecutionTime: 0
      });
    });

    it('使用自定义选项覆盖默认值', () => {
      const m = new PythonEnvManager({
        mockMode: true,
        baseDir: '/custom/path',
        dockerEnabled: false,
        dockerImage: 'my-image:1.0',
        dockerTimeout: 60000,
        cacheEnabled: false
      });
      expect(m.baseDir).toBe('/custom/path');
      expect(m.dockerEnabled).toBe(false);
      expect(m.dockerImage).toBe('my-image:1.0');
      expect(m.dockerTimeout).toBe(60000);
      expect(m.cacheEnabled).toBe(false);
    });

    it('mockMode 为 false 时设为 false', () => {
      const m = new PythonEnvManager({ mockMode: false });
      expect(m.mockMode).toBe(false);
    });

    it('不传 mockMode 时默认为 false', () => {
      const m = new PythonEnvManager();
      expect(m.mockMode).toBe(false);
    });

    it('dockerEnabled 设为 false 可禁用 Docker', () => {
      const m = new PythonEnvManager({ dockerEnabled: false, mockMode: true });
      expect(m.dockerEnabled).toBe(false);
    });

    it('cacheEnabled 设为 false 可禁用缓存', () => {
      const m = new PythonEnvManager({ cacheEnabled: false, mockMode: true });
      expect(m.cacheEnabled).toBe(false);
    });

    it('baseDir 不存在时创建目录', () => {
      fs.existsSync = jest.fn().mockImplementation((p) => {
        if (p === TEST_BASE) return false;
        return false;
      });
      new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      expect(fs.mkdirSync).toHaveBeenCalledWith(TEST_BASE, { recursive: true });
    });

    it('baseDir 已存在时不创建目录', () => {
      fs.mkdirSync.mockClear();
      fs.existsSync = jest.fn().mockImplementation((p) => {
        if (p === TEST_BASE) return true;
        return false;
      });
      new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('异步检查 Docker 可用性', () => {
      expect(safeSpawn).toHaveBeenCalledWith('docker', ['--version'], { stdio: 'ignore' });
    });
  });

  describe('_envPath', () => {
    it('返回 skill 环境的完整路径', () => {
      const result = manager._envPath('test-skill');
      expect(result).toBe(path.join(TEST_BASE, 'test-skill'));
    });
  });

  describe('hasEnvironment', () => {
    it('环境存在时返回 true', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      expect(manager.hasEnvironment('test-skill')).toBe(true);
    });

    it('环境不存在时返回 false', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      expect(manager.hasEnvironment('test-skill')).toBe(false);
    });
  });

  describe('ensureEnvironment (mockMode)', () => {
    it('在 mockMode 下创建目录并返回 env 路径', async () => {
      const envDir = await manager.ensureEnvironment('test-skill');
      const expectedPath = path.join(TEST_BASE, 'test-skill');
      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
      expect(envDir).toBe(expectedPath);
    });

    it('在 mockMode 下不调用 _run', async () => {
      const _runSpy = jest.spyOn(manager, '_run');
      await manager.ensureEnvironment('test-skill', ['numpy']);
      expect(_runSpy).not.toHaveBeenCalled();
    });

    it('目录已存在时仍返回正确路径', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      const envDir = await manager.ensureEnvironment('existing-skill');
      expect(envDir).toBe(path.join(TEST_BASE, 'existing-skill'));
    });
  });

  describe('cache operations', () => {
    it('_getCacheKey 返回一致的 SHA-256 哈希', () => {
      const key1 = manager._getCacheKey('skill-a', '/path/a.py', { x: 1 });
      const key2 = manager._getCacheKey('skill-a', '/path/a.py', { x: 1 });
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('_getCacheKey 对不同输入返回不同哈希', () => {
      const key1 = manager._getCacheKey('skill-a', '/path/a.py', { x: 1 });
      const key2 = manager._getCacheKey('skill-b', '/path/a.py', { x: 1 });
      expect(key1).not.toBe(key2);
    });

    it('_getCacheKey 使用 SHA-256 算法', () => {
      jest.spyOn(crypto, 'createHash');
      manager._getCacheKey('s', '/p', { d: 1 });
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    });

    it('_getCachedResult 在缓存未命中时返回 null', () => {
      const result = manager._getCachedResult('nonexistent-key');
      expect(result).toBeNull();
      expect(manager.cacheStats.misses).toBe(1);
      expect(manager.metrics.cacheMisses).toBe(1);
    });

    it('_getCachedResult 在缓存命中时返回值', () => {
      const key = manager._getCacheKey('s', '/p', { d: 1 });
      manager._setCachedResult(key, { output: 'test' });
      const result = manager._getCachedResult(key);
      expect(result).toEqual({ output: 'test' });
      expect(manager.cacheStats.hits).toBe(1);
      expect(manager.metrics.cacheHits).toBe(1);
    });

    it('_getCachedResult 在 TTL 过期后返回 null', () => {
      jest.useFakeTimers();
      const key = manager._getCacheKey('s', '/p', { d: 1 });
      const now = Date.now();
      jest.setSystemTime(now);
      manager._setCachedResult(key, { output: 'expirable' });
      jest.setSystemTime(now + 3600001);
      const result = manager._getCachedResult(key);
      expect(result).toBeNull();
      expect(manager.cacheStats.evictions).toBe(1);
      jest.useRealTimers();
    });

    it('_setCachedResult 在 cacheDisabled 时不存储', () => {
      const m = new PythonEnvManager({ cacheEnabled: false, mockMode: true });
      const key = m._getCacheKey('s', '/p', { d: 1 });
      m._setCachedResult(key, { output: 'x' });
      expect(m.cache.size).toBe(0);
    });

    it('_getCachedResult 在 cacheDisabled 时返回 null', () => {
      const m = new PythonEnvManager({ cacheEnabled: false, mockMode: true });
      const key = m._getCacheKey('s', '/p', { d: 1 });
      m.cache.set(key, { result: 'x', timestamp: Date.now() });
      const result = m._getCachedResult(key);
      expect(result).toBeNull();
    });

    it('缓存超过 1000 条时驱逐 20% 最旧条目', () => {
      const entries = Array.from({ length: 1001 }, (_, i) => [`key-${i}`, { result: i, timestamp: i }]);
      manager.cache = new Map(entries);
      manager._setCachedResult('new-key', { output: 'new' });
      expect(manager.cache.size).toBe(802);
      expect(manager.cacheStats.evictions).toBe(200);
    });

    it('缓存 1000 条时不触发驱逐', () => {
      const entries = Array.from({ length: 1000 }, (_, i) => [`key-${i}`, { result: i, timestamp: i }]);
      manager.cache = new Map(entries);
      manager._setCachedResult('new-key', { output: 'new' });
      expect(manager.cache.size).toBe(1001);
      expect(manager.cacheStats.evictions).toBe(0);
    });

    it('clearCache 清空所有缓存和统计', () => {
      manager.cache.set('k1', { result: 1, timestamp: 100 });
      manager.cache.set('k2', { result: 2, timestamp: 200 });
      manager.cacheStats = { hits: 5, misses: 3, evictions: 1, size: 2 };
      manager.clearCache();
      expect(manager.cache.size).toBe(0);
      expect(manager.cacheStats).toEqual({ hits: 0, misses: 0, evictions: 0, size: 0 });
    });

    it('getCacheStats 返回缓存统计和命中率', () => {
      manager.cacheStats = { hits: 8, misses: 2, evictions: 1, size: 5 };
      const stats = manager.getCacheStats();
      expect(stats.hits).toBe(8);
      expect(stats.misses).toBe(2);
      expect(stats.evictions).toBe(1);
      expect(stats.size).toBe(5);
      expect(stats.hitRate).toBe('80.00%');
    });

    it('getCacheStats 在无访问时返回 0% 命中率', () => {
      const stats = manager.getCacheStats();
      expect(stats.hitRate).toBe('0%');
    });
  });

  describe('removeEnvironment', () => {
    it('删除环境目录', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      await manager.removeEnvironment('test-skill');
      const envDir = path.join(TEST_BASE, 'test-skill');
      expect(fs.rmSync).toHaveBeenCalledWith(envDir, { recursive: true, force: true });
    });

    it('环境不存在时跳过目录删除', async () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      await manager.removeEnvironment('test-skill');
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('dockerAvailable 为 true 时尝试删除 Docker 镜像', async () => {
      manager.dockerAvailable = true;
      fs.existsSync = jest.fn().mockReturnValue(false);
      await manager.removeEnvironment('test-skill');
      expect(safeSpawn).toHaveBeenCalledWith('docker', ['rmi', '-f', 'skill-test-skill:latest'], { stdio: 'ignore' });
    });

    it('dockerAvailable 为 false 时不删除 Docker 镜像', async () => {
      manager.dockerAvailable = false;
      safeSpawn.mockClear();
      fs.existsSync = jest.fn().mockReturnValue(false);
      await manager.removeEnvironment('test-skill');
      const dockerCalls = safeSpawn.mock.calls.filter(c => c[0] === 'docker');
      expect(dockerCalls.length).toBe(0);
    });

    it('删除包含 skill 名称的缓存条目', async () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      manager.cache.set('skill-a-key1', { result: 1, timestamp: 100 });
      manager.cache.set('skill-a-key2', { result: 2, timestamp: 200 });
      manager.cache.set('other-key', { result: 3, timestamp: 300 });
      manager.cacheStats.size = manager.cache.size;
      await manager.removeEnvironment('skill-a');
      expect(manager.cache.has('skill-a-key1')).toBe(false);
      expect(manager.cache.has('skill-a-key2')).toBe(false);
      expect(manager.cache.has('other-key')).toBe(true);
    });
  });

  describe('_cleanupTempDir', () => {
    it('目录存在时删除', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      manager._cleanupTempDir('/tmp/test-dir');
      expect(fs.rmSync).toHaveBeenCalledWith('/tmp/test-dir', { recursive: true, force: true });
    });

    it('目录不存在时报错', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      manager._cleanupTempDir('/tmp/nonexistent');
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('删除失败时打印警告不抛出', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.rmSync = jest.fn().mockImplementation(() => { throw new Error('permission denied'); });
      expect(() => manager._cleanupTempDir('/tmp/protected')).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('Docker decision logic', () => {
    it('高风险 skill 名称应使用 Docker', () => {
      expect(manager._shouldUseDocker('file-system', [])).toBe(true);
      expect(manager._shouldUseDocker('network-scan', [])).toBe(true);
      expect(manager._shouldUseDocker('system-cleanup', [])).toBe(true);
    });

    it('超过 3 个依赖的 skill 应使用 Docker', () => {
      const deps = ['a', 'b', 'c', 'd'];
      expect(manager._shouldUseDocker('simple-math', deps)).toBe(true);
    });

    it('3 个及以下依赖的无风险 skill 不使用 Docker', () => {
      expect(manager._shouldUseDocker('simple-math', ['numpy'])).toBe(false);
      expect(manager._shouldUseDocker('text-process', ['a', 'b', 'c'])).toBe(false);
    });

    it('skill 名称大小写不敏感', () => {
      expect(manager._shouldUseDocker('FILE-SYSTEM', [])).toBe(true);
      expect(manager._shouldUseDocker('Network', [])).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('返回合并的指标和缓存统计', () => {
      manager.metrics.totalExecutions = 10;
      manager.metrics.localExecutions = 7;
      manager.metrics.dockerExecutions = 3;
      manager.metrics.averageExecutionTime = 1500;
      manager.cacheStats.hits = 5;
      manager.cacheStats.misses = 5;
      manager.cacheStats.size = 10;
      manager.dockerAvailable = false;

      const metrics = manager.getMetrics();
      expect(metrics.totalExecutions).toBe(10);
      expect(metrics.localExecutions).toBe(7);
      expect(metrics.dockerExecutions).toBe(3);
      expect(metrics.averageExecutionTime).toBe(1500);
      expect(metrics.dockerAvailable).toBe(false);
      expect(metrics.cacheStats.hitRate).toBe('50.00%');
    });
  });

  describe('runPythonScript (mockMode)', () => {
    it('在 mockMode 下通过 _runLocal 返回 mock 结果', async () => {
      const result = await manager.runPythonScript('test-skill', '/path/to/script.py', { data: 'test' });
      expect(result).toEqual({
        ok: true,
        message: 'mock-run',
        data: { data: 'test' },
        executionMetadata: expect.objectContaining({
          usedDocker: false,
          cached: false
        })
      });
      expect(manager.metrics.totalExecutions).toBe(1);
      expect(manager.metrics.localExecutions).toBe(1);
    });

    it('isPure 为 true 时缓存结果并返回', async () => {
      await manager.runPythonScript('skill', '/p.py', { x: 1 }, { isPure: true });
      expect(manager.metrics.cacheHits).toBe(0);
      expect(manager.cacheStats.hits).toBe(0);
      const result2 = await manager.runPythonScript('skill', '/p.py', { x: 1 }, { isPure: true });
      expect(result2).toEqual({ ok: true, message: 'mock-run', data: { x: 1 } });
      expect(manager.metrics.cacheHits).toBe(1);
      expect(manager.cacheStats.hits).toBe(1);
    });

    it('更新平均执行时间', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(1000);
      const runPromise = manager.runPythonScript('s', '/p.py', {});
      jest.setSystemTime(2000);
      await runPromise;
      expect(manager.metrics.averageExecutionTime).toBe(1000);
      jest.useRealTimers();
    });

    it('Docker 失败时回退到本地执行', async () => {
      const m = new PythonEnvManager({ mockMode: true, dockerEnabled: true });
      m.dockerAvailable = true;
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.mkdirSync = jest.fn();
      fs.readFileSync = jest.fn().mockReturnValue('');

      jest.spyOn(m, '_shouldUseDocker').mockReturnValue(true);
      jest.spyOn(m, '_runInDocker').mockRejectedValue(new Error('docker failed'));

      const result = await m.runPythonScript('s', '/p.py', {});
      expect(result).toEqual(expect.objectContaining({
        ok: true,
        message: 'mock-run'
      }));
      expect(m.metrics.localExecutions).toBe(1);
      expect(console.warn).toHaveBeenCalled();
    });

    it('Docker 失败且 forceLocal 时直接抛出', async () => {
      const m = new PythonEnvManager({ mockMode: true });
      m.dockerAvailable = true;
      jest.spyOn(m, '_shouldUseDocker').mockReturnValue(true);
      jest.spyOn(m, '_runInDocker').mockRejectedValue(new Error('docker failed'));
      jest.spyOn(m, '_runLocal').mockRejectedValue(new Error('local also failed'));
      await expect(
        m.runPythonScript('s', '/p.py', {}, { forceLocal: true })
      ).rejects.toThrow('local also failed');
    });
  });

  describe('buildDockerImage', () => {
    it('Docker 不可用时抛出错误', async () => {
      manager.dockerAvailable = false;
      await expect(manager.buildDockerImage('test-skill')).rejects.toThrow('Docker is not available');
    });

    it('Dockerfile 不存在时抛出错误', async () => {
      const m = new PythonEnvManager({ mockMode: true });
      m.dockerAvailable = true;
      fs.existsSync = jest.fn().mockReturnValue(false);
      await expect(m.buildDockerImage('test-skill')).rejects.toThrow('Dockerfile not found at:');
    });
  });

  describe('ensureEnvironment (non-mock, real flow)', () => {
    it('创建 venv 并安装依赖', async () => {
      const m = new PythonEnvManager({ mockMode: false, baseDir: TEST_BASE });
      fs.existsSync = jest.fn().mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      const _runSpy = jest.spyOn(m, '_run').mockResolvedValue(undefined);
      jest.spyOn(m, '_pipPath').mockReturnValue(path.join(TEST_BASE, 'skill-a', 'Scripts', 'pip.exe'));
      const envDir = await m.ensureEnvironment('skill-a', ['numpy']);
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(_runSpy).toHaveBeenCalledWith(['python', '-m', 'venv', path.join(TEST_BASE, 'skill-a')], { cwd: process.cwd(), silent: true });
      expect(_runSpy).toHaveBeenCalledWith([path.join(TEST_BASE, 'skill-a', 'Scripts', 'pip.exe'), 'install', 'numpy'], { cwd: path.join(TEST_BASE, 'skill-a'), silent: true });
      expect(envDir).toBe(path.join(TEST_BASE, 'skill-a'));
    });

    it('venv 已存在时跳过创建', async () => {
      const m = new PythonEnvManager({ mockMode: false, baseDir: TEST_BASE });
      fs.existsSync = jest.fn().mockReturnValue(true);
      const _runSpy = jest.spyOn(m, '_run').mockResolvedValue(undefined);
      await m.ensureEnvironment('skill-a', []);
      expect(_runSpy).not.toHaveBeenCalled();
    });

    it('无依赖时不安装', async () => {
      const m = new PythonEnvManager({ mockMode: false, baseDir: TEST_BASE });
      fs.existsSync = jest.fn().mockReturnValue(true);
      const _runSpy = jest.spyOn(m, '_run').mockResolvedValue(undefined);
      await m.ensureEnvironment('skill-a');
      expect(_runSpy).not.toHaveBeenCalled();
    });

    it('pip 不存在时跳过安装', async () => {
      const m = new PythonEnvManager({ mockMode: false, baseDir: TEST_BASE });
      fs.existsSync = jest.fn().mockReturnValue(false);
      const _runSpy = jest.spyOn(m, '_run').mockResolvedValue(undefined);
      const pipSpy = jest.spyOn(m, '_pipPath').mockReturnValue(null);
      await m.ensureEnvironment('skill-a', ['numpy']);
      expect(pipSpy).toHaveBeenCalled();
      expect(_runSpy).toHaveBeenCalledTimes(1); // only venv creation
    });
  });

  describe('_pipPath', () => {
    it('win32 返回 Scripts/pip.exe', () => {
      const win32 = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      fs.existsSync = jest.fn().mockReturnValue(true);
      const result = manager._pipPath('/env');
      expect(result).toBe(path.join('/env', 'Scripts', 'pip.exe'));
      Object.defineProperty(process, 'platform', { value: win32 });
    });

    it('非 win32 返回 bin/pip', () => {
      const win32 = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      fs.existsSync = jest.fn().mockReturnValue(true);
      const result = manager._pipPath('/env');
      expect(result).toBe(path.join('/env', 'bin', 'pip'));
      Object.defineProperty(process, 'platform', { value: win32 });
    });

    it('pip 不存在时返回 null', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      expect(manager._pipPath('/env')).toBeNull();
    });
  });

  describe('_runLocal (real flow)', () => {
    const makeSpawn = ({ code = 0, stdout = '', stderr = '', throwError = false } = {}) => {
      const handlers = {};
      const child = {
        on: jest.fn((event, cb) => { handlers[event] = cb; }),
        stdout: { on: jest.fn((e, cb) => { if (e === 'data') cb(Buffer.from(stdout)); }) },
        stderr: { on: jest.fn((e, cb) => { if (e === 'data') cb(Buffer.from(stderr)); }) },
        stdin: { write: jest.fn(), end: jest.fn() }
      };
      process.nextTick(() => {
        if (throwError) { if (handlers.error) handlers.error(new Error('spawn failed')); return; }
        if (handlers.close) handlers.close(code);
      });
      return child;
    };

    it('mockMode 返回 mock 结果', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      jest.spyOn(m, 'ensureEnvironment').mockResolvedValue(path.join(TEST_BASE, 's'));
      const result = await m._runLocal('s', '/p.py', { data: 1 });
      expect(result).toEqual({ ok: true, message: 'mock-run', data: { data: 1 } });
    });

    it('python 解释器不存在时抛错', async () => {
      const m = new PythonEnvManager({ mockMode: false, baseDir: TEST_BASE });
      jest.spyOn(m, 'ensureEnvironment').mockResolvedValue('/env');
      fs.existsSync = jest.fn().mockReturnValue(false);
      await expect(m._runLocal('s', '/p.py', {})).rejects.toThrow('Python interpreter not found in env');
    });

    it('成功时解析 JSON 输出', async () => {
      const m = new PythonEnvManager({ mockMode: false, baseDir: TEST_BASE });
      jest.spyOn(m, 'ensureEnvironment').mockResolvedValue('/env');
      fs.existsSync = jest.fn().mockReturnValue(true);
      safeSpawn.mockReturnValue(makeSpawn({ stdout: '{"ok":true}' }));
      const result = await m._runLocal('s', '/p.py', {});
      expect(result).toEqual({ ok: true });
    });

    it('非 JSON 输出时返回 output/error', async () => {
      const m = new PythonEnvManager({ mockMode: false, baseDir: TEST_BASE });
      jest.spyOn(m, 'ensureEnvironment').mockResolvedValue('/env');
      fs.existsSync = jest.fn().mockReturnValue(true);
      safeSpawn.mockReturnValue(makeSpawn({ stdout: 'plain text', stderr: 'warn' }));
      const result = await m._runLocal('s', '/p.py', {});
      expect(result).toEqual({ output: 'plain text', error: 'warn' });
    });

    it('非零退出码时抛错', async () => {
      const m = new PythonEnvManager({ mockMode: false, baseDir: TEST_BASE });
      jest.spyOn(m, 'ensureEnvironment').mockResolvedValue('/env');
      fs.existsSync = jest.fn().mockReturnValue(true);
      safeSpawn.mockReturnValue(makeSpawn({ code: 3, stderr: 'boom' }));
      await expect(m._runLocal('s', '/p.py', {})).rejects.toThrow('Python script failed with code 3');
    });

    it('spawn 错误时 reject', async () => {
      const m = new PythonEnvManager({ mockMode: false, baseDir: TEST_BASE });
      jest.spyOn(m, 'ensureEnvironment').mockResolvedValue('/env');
      fs.existsSync = jest.fn().mockReturnValue(true);
      safeSpawn.mockReturnValue(makeSpawn({ throwError: true }));
      await expect(m._runLocal('s', '/p.py', {})).rejects.toThrow('spawn failed');
    });
  });

  describe('_runInDocker (real flow)', () => {
    const makeDockerSpawn = ({ code = 0, stdout = '', stderr = '', throwError = false } = {}) => {
      const handlers = {};
      const child = {
        on: jest.fn((event, cb) => { (handlers[event] = handlers[event] || []).push(cb); }),
        stdout: { on: jest.fn((e, cb) => { if (e === 'data') cb(Buffer.from(stdout)); }) },
        stderr: { on: jest.fn((e, cb) => { if (e === 'data') cb(Buffer.from(stderr)); }) },
        kill: jest.fn(() => { (handlers.close || []).forEach((cb) => cb(1)); })
      };
      if (throwError) {
        process.nextTick(() => { (handlers.error || []).forEach((cb) => cb(new Error('docker spawn failed'))); });
      } else {
        process.nextTick(() => { (handlers.close || []).forEach((cb) => cb(code)); });
      }
      return child;
    };

    it('成功时解析 JSON 输出并清理临时目录', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      fs.existsSync = jest.fn().mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      fs.copyFileSync = jest.fn();
      const cleanupSpy = jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      safeSpawn.mockReturnValue(makeDockerSpawn({ stdout: '{"ok":true}' }));
      const result = await m._runInDocker('skill-a', '/p.py', { d: 1 }, []);
      expect(result).toEqual({ ok: true });
      expect(cleanupSpy).toHaveBeenCalled();
      expect(fs.copyFileSync).toHaveBeenCalledWith('/p.py', expect.stringMatching(new RegExp('\\' + path.sep + '\\.docker\\' + path.sep)));
      const copiedTo = fs.copyFileSync.mock.calls[0][1];
      expect(path.basename(copiedTo)).toBe('p.py');
    });

    it('非 JSON 输出时返回 output/error', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      fs.existsSync = jest.fn().mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      fs.copyFileSync = jest.fn();
      jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      safeSpawn.mockReturnValue(makeDockerSpawn({ stdout: 'text', stderr: 'err' }));
      const result = await m._runInDocker('skill-a', '/p.py', {}, []);
      expect(result).toEqual({ output: 'text', error: 'err' });
    });

    it('requirements 存在时写入 requirements.txt', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      fs.existsSync = jest.fn().mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      fs.copyFileSync = jest.fn();
      fs.writeFileSync = jest.fn();
      jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      safeSpawn.mockReturnValue(makeDockerSpawn({ stdout: '{}' }));
      await m._runInDocker('skill-a', '/p.py', {}, ['numpy', 'pandas']);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/requirements\.txt$/),
        'numpy\npandas'
      );
    });

    it('非零退出码时抛错', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      fs.existsSync = jest.fn().mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      fs.copyFileSync = jest.fn();
      jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      safeSpawn.mockReturnValue(makeDockerSpawn({ code: 2, stderr: 'docker boom' }));
      await expect(m._runInDocker('skill-a', '/p.py', {}, [])).rejects.toThrow('Docker execution failed with code 2');
    });

    it('spawn 错误时清理并 reject', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      fs.existsSync = jest.fn().mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      fs.copyFileSync = jest.fn();
      const cleanupSpy = jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      safeSpawn.mockReturnValue(makeDockerSpawn({ throwError: true }));
      await expect(m._runInDocker('skill-a', '/p.py', {}, [])).rejects.toThrow('docker spawn failed');
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('超时后 kill 容器并 reject', async () => {
      jest.useFakeTimers();
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE, dockerTimeout: 30000 });
      fs.existsSync = jest.fn().mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      fs.copyFileSync = jest.fn();
      jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      const handlers = {};
      const hangingChild = {
        on: jest.fn((event, cb) => { (handlers[event] = handlers[event] || []).push(cb); }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        kill: jest.fn(() => { (handlers.close || []).forEach((cb) => cb(1)); })
      };
      safeSpawn.mockReturnValue(hangingChild);
      const runPromise = m._runInDocker('skill-a', '/p.py', {}, []);
      jest.advanceTimersByTime(30000);
      await expect(runPromise).rejects.toThrow('Docker execution timeout after 30000ms');
      expect(hangingChild.kill).toHaveBeenCalled();
      expect(safeSpawn).toHaveBeenCalledWith('docker', ['rm', '-f', expect.any(String)], { stdio: 'ignore' });
      jest.useRealTimers();
    });
  });

  describe('buildDockerImage (success path)', () => {
    it('构建成功并返回 imageTag', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      m.dockerAvailable = true;
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.mkdirSync = jest.fn();
      fs.writeFileSync = jest.fn();
      fs.readFileSync = jest.fn().mockReturnValue('# Copy requirements if they exist\n');
      jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      safeSpawn.mockReturnValue({
        on: jest.fn((event, cb) => { if (event === 'close') cb(0); }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      });
      const result = await m.buildDockerImage('skill-a');
      expect(result).toEqual({
        success: true,
        imageTag: 'skill-skill-a:latest',
        message: 'Docker image skill-skill-a:latest built successfully'
      });
    });

    it('有 requirements 时插入安装指令', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      m.dockerAvailable = true;
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.mkdirSync = jest.fn();
      fs.writeFileSync = jest.fn();
      fs.readFileSync = jest.fn().mockReturnValue('# Copy requirements if they exist\n');
      jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      safeSpawn.mockReturnValue({
        on: jest.fn((event, cb) => { if (event === 'close') cb(0); }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      });
      await m.buildDockerImage('skill-a', ['numpy', 'pandas']);
      const written = fs.writeFileSync.mock.calls[0][1];
      expect(written).toContain('pip install --no-cache-dir numpy pandas');
    });

    it('构建失败时抛错', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      m.dockerAvailable = true;
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.mkdirSync = jest.fn();
      fs.writeFileSync = jest.fn();
      fs.readFileSync = jest.fn().mockReturnValue('# Copy requirements if they exist\n');
      jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      safeSpawn.mockReturnValue({
        on: jest.fn((event, cb) => { if (event === 'close') cb(1); }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn((e, cb) => cb(Buffer.from('build failed'))) }
      });
      await expect(m.buildDockerImage('skill-a')).rejects.toThrow('Docker build failed: build failed');
    });

    it('spawn 错误时 reject', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      m.dockerAvailable = true;
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.mkdirSync = jest.fn();
      fs.writeFileSync = jest.fn();
      fs.readFileSync = jest.fn().mockReturnValue('# Copy requirements if they exist\n');
      jest.spyOn(m, '_cleanupTempDir').mockImplementation(() => {});
      safeSpawn.mockReturnValue({
        on: jest.fn((event, cb) => { if (event === 'error') cb(new Error('build spawn error')); }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      });
      await expect(m.buildDockerImage('skill-a')).rejects.toThrow('build spawn error');
    });
  });

  describe('runPythonScript docker success path', () => {
    it('useDocker 时走 docker 执行并记录 dockerExecutions', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      m.dockerAvailable = true;
      jest.spyOn(m, '_shouldUseDocker').mockReturnValue(true);
      jest.spyOn(m, '_runInDocker').mockResolvedValue({ ok: true });
      const result = await m.runPythonScript('file-system', '/p.py', {}, {});
      expect(result.ok).toBe(true);
      expect(result.executionMetadata.usedDocker).toBe(true);
      expect(m.metrics.dockerExecutions).toBe(1);
      expect(m.metrics.localExecutions).toBe(0);
    });

    it('forceDocker 强制使用 docker', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      m.dockerAvailable = true;
      const dockerSpy = jest.spyOn(m, '_runInDocker').mockResolvedValue({ ok: true });
      await m.runPythonScript('s', '/p.py', {}, { forceDocker: true });
      expect(dockerSpy).toHaveBeenCalled();
      expect(m.metrics.dockerExecutions).toBe(1);
    });

    it('forceLocal 强制本地执行', async () => {
      const m = new PythonEnvManager({ mockMode: true, baseDir: TEST_BASE });
      m.dockerAvailable = true;
      jest.spyOn(m, '_shouldUseDocker').mockReturnValue(true);
      const dockerSpy = jest.spyOn(m, '_runInDocker').mockResolvedValue({ ok: true });
      await m.runPythonScript('s', '/p.py', {}, { forceLocal: true });
      expect(dockerSpy).not.toHaveBeenCalled();
      expect(m.metrics.localExecutions).toBe(1);
    });
  });

  describe('_run', () => {
    it('命令成功时 resolve', async () => {
      safeSpawn.mockReturnValue({
        on: jest.fn((event, cb) => { if (event === 'exit') cb(0); }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      });
      await expect(manager._run(['python', '--version'])).resolves.toBeUndefined();
    });

    it('命令失败时 reject', async () => {
      safeSpawn.mockReturnValue({
        on: jest.fn((event, cb) => { if (event === 'exit') cb(1); }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      });
      await expect(manager._run(['false'])).rejects.toThrow('Command failed: false');
    });

    it('spawn 错误时 reject', async () => {
      safeSpawn.mockReturnValue({
        on: jest.fn((event, cb) => { if (event === 'error') cb(new Error('spawn error')); }),
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() }
      });
      await expect(manager._run(['invalid-cmd'])).rejects.toThrow('spawn error');
    });
  });
});
