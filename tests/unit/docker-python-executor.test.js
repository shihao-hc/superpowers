'use strict';

const fs = require('fs');
const path = require('path');

jest.mock('../../src/utils/SafeExec', () => ({
  safeSpawn: jest.fn()
}));

const { safeSpawn } = require('../../src/utils/SafeExec');
const { DockerPythonExecutor } = require('../../src/skills/executors/DockerPythonExecutor');

function makeChild({ closeCode = 0, stdout = '', stderr = '', shouldError = false, errorMsg = '', skipClose = false } = {}) {
  const handlers = {};
  let closeScheduled = false;
  const scheduleClose = () => {
    if (closeScheduled) return;
    closeScheduled = true;
    process.nextTick(() => {
      if (shouldError && handlers.error) {
        handlers.error.forEach(cb => cb(new Error(errorMsg)));
      }
      if (handlers.close) {
        handlers.close.forEach(cb => cb(closeCode));
      }
    });
  };
  const child = {
    on: jest.fn((event, cb) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(cb);
      if (!skipClose) {
        if (event === 'error') scheduleClose();
        if (event === 'close') scheduleClose();
      }
    }),
    stdout: { on: jest.fn((event, cb) => { if (event === 'data') cb(stdout); }) },
    stderr: { on: jest.fn((event, cb) => { if (event === 'data') cb(stderr); }) },
    kill: jest.fn()
  };
  return child;
}

describe('DockerPythonExecutor', () => {
  let executor;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    executor = new DockerPythonExecutor();
  });

  describe('constructor', () => {
    it('sets default values when no options provided', () => {
      expect(executor.dockerImage).toBe('skill-python:latest');
      expect(executor.baseVolumePath).toBe(path.join(process.cwd(), 'uploads', 'skills'));
      expect(executor.containerTimeout).toBe(30000);
      expect(executor.maxContainers).toBe(5);
      expect(executor.activeContainers).toBeInstanceOf(Map);
      expect(executor.activeContainers.size).toBe(0);
      expect(executor.containerPool).toEqual([]);
      expect(executor.metrics).toEqual({
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        containerReuseCount: 0
      });
    });

    it('overrides defaults with custom options', () => {
      const e = new DockerPythonExecutor({
        dockerImage: 'custom:1.0',
        baseVolumePath: '/custom/path',
        containerTimeout: 60000,
        maxContainers: 10
      });
      expect(e.dockerImage).toBe('custom:1.0');
      expect(e.baseVolumePath).toBe('/custom/path');
      expect(e.containerTimeout).toBe(60000);
      expect(e.maxContainers).toBe(10);
    });
  });

  describe('execute', () => {
    it('throws if skillName is missing', async () => {
      await expect(executor.execute({ scriptPath: '/tmp/test.py' }))
        .rejects.toThrow('skillName and scriptPath are required');
    });

    it('throws if scriptPath is missing', async () => {
      await expect(executor.execute({ skillName: 'test-skill' }))
        .rejects.toThrow('skillName and scriptPath are required');
    });

    it('throws if both are missing', async () => {
      await expect(executor.execute({}))
        .rejects.toThrow('skillName and scriptPath are required');
    });

    it('returns success result on successful execution', async () => {
      safeSpawn.mockImplementation(() => makeChild({ stdout: 'hello world' }));

      const result = await executor.execute({
        skillName: 'my-skill',
        scriptPath: '/scripts/test.py',
        inputs: { name: 'test' },
        env: { MY_VAR: 'value' }
      });

      expect(result.success).toBe(true);
      expect(result.skillName).toBe('my-skill');
      expect(result.executionId).toBeDefined();
      expect(result.containerName).toMatch(/^skill-my-skill-/);
      expect(result.output).toBe('hello world');
      expect(result.exitCode).toBe(0);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it('increments metrics on success', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      await executor.execute({ skillName: 's', scriptPath: '/s.py' });

      expect(executor.metrics.totalExecutions).toBe(1);
      expect(executor.metrics.successfulExecutions).toBe(1);
      expect(executor.metrics.failedExecutions).toBe(0);
    });

    it('returns failure result on non-zero exit code', async () => {
      safeSpawn.mockImplementation(() => makeChild({ closeCode: 1, stderr: 'runtime error' }));

      const result = await executor.execute({ skillName: 's', scriptPath: '/s.py' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/runtime error/);
      expect(executor.metrics.failedExecutions).toBe(1);
    });

    it('returns failure result on spawn error', async () => {
      safeSpawn.mockImplementation(() => makeChild({ shouldError: true, errorMsg: 'ENOENT' }));

      const result = await executor.execute({ skillName: 's', scriptPath: '/s.py' });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ENOENT/);
      expect(executor.metrics.failedExecutions).toBe(1);
    });

    it('increments totalExecutions even on failure', async () => {
      safeSpawn.mockImplementation(() => makeChild({ closeCode: 1, stderr: 'error' }));

      await executor.execute({ skillName: 's', scriptPath: '/s.py' });
      expect(executor.metrics.totalExecutions).toBe(1);
      expect(executor.metrics.failedExecutions).toBe(1);
    });

    it('spawns docker run with correct arguments', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      await executor.execute({
        skillName: 'my-skill',
        scriptPath: '/scripts/test.py',
        inputs: { key: 'val' },
        env: { DEBUG: '1' }
      });

      const spawnArgs = safeSpawn.mock.calls[0];
      expect(spawnArgs[0]).toBe('docker');
      expect(spawnArgs[1]).toContain('run');
      expect(spawnArgs[1]).toContain('--rm');
      expect(spawnArgs[1]).toContain('--network=none');
      expect(spawnArgs[1]).toContain('--memory=256m');
      expect(spawnArgs[1]).toContain('--cpus=0.5');
      expect(spawnArgs[1]).toContain('skill-python:latest');
      expect(spawnArgs[1]).toContain('python');
    });
  });

  describe('_executeInContainer', () => {
    it('rejects on timeout and removes container', async () => {
      jest.useFakeTimers();

      safeSpawn.mockImplementation(() => makeChild({ skipClose: true }));

      const execPromise = executor._executeInContainer(
        ['docker', 'run', '--name', 'test-container', 'image'],
        'test-container',
        5000
      );

      jest.advanceTimersByTime(5000);

      await expect(execPromise).rejects.toThrow('timeout after 5000ms');

      expect(safeSpawn).toHaveBeenCalledWith('docker', ['rm', '-f', 'test-container'], { stdio: 'ignore' });

      jest.useRealTimers();
    });

    it('does not reject after close if killed flag was set', async () => {
      jest.useFakeTimers();
      safeSpawn.mockImplementation(() => makeChild({ skipClose: true }));

      const execPromise = executor._executeInContainer(
        ['docker', 'run', '--name', 'tc', 'img'],
        'tc',
        5000
      );

      jest.advanceTimersByTime(5000);

      await expect(execPromise).rejects.toThrow('timeout');

      jest.useRealTimers();
    });

    it('rejects on spawn error', async () => {
      safeSpawn.mockImplementation(() => makeChild({ shouldError: true, errorMsg: 'spawn failed' }));

      await expect(executor._executeInContainer(
        ['docker', 'run', '--name', 'c', 'i'],
        'c',
        5000
      )).rejects.toThrow('spawn failed');
    });
  });

  describe('executeWithDependencies', () => {
    it('throws if skillName is missing', async () => {
      await expect(executor.executeWithDependencies({ scriptPath: '/s.py' }))
        .rejects.toThrow('skillName and scriptPath are required');
    });

    it('builds image and executes script', async () => {
      safeSpawn
        .mockImplementationOnce(() => makeChild({}))              // _buildDockerImage
        .mockImplementationOnce(() => makeChild({ stdout: 'dep output' })); // _executeInContainer

      const result = await executor.executeWithDependencies({
        skillName: 'dep-skill',
        scriptPath: '/scripts/dep.py',
        requirements: ['numpy', 'pandas'],
        inputs: { x: 1 }
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('dep output');
    });

    it('creates .docker directory if not exists', async () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p.toString().includes('.docker')) return false;
        return true;
      });
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      safeSpawn
        .mockImplementationOnce(() => makeChild({}))              // _buildDockerImage
        .mockImplementationOnce(() => makeChild({ stdout: 'ok' })); // _executeInContainer

      await executor.executeWithDependencies({
        skillName: 'dep-skill',
        scriptPath: '/scripts/dep.py',
        requirements: ['numpy']
      });

      const tempDir = path.join(executor.baseVolumePath, 'dep-skill', '.docker');
      expect(fs.mkdirSync).toHaveBeenCalledWith(tempDir, { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('writes Dockerfile with requirements', async () => {
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      safeSpawn
        .mockImplementationOnce(() => makeChild({}))              // _buildDockerImage
        .mockImplementationOnce(() => makeChild({ stdout: 'ok' })); // _executeInContainer

      await executor.executeWithDependencies({
        skillName: 'dep-skill',
        scriptPath: '/scripts/dep.py',
        requirements: ['numpy', 'pandas']
      });

      const dockerfileCall = fs.writeFileSync.mock.calls.find(
        c => c[0] && c[0].endsWith('Dockerfile')
      );
      expect(dockerfileCall).toBeDefined();
      expect(dockerfileCall[1]).toContain('pip install --no-cache-dir numpy pandas');
    });

    it('returns failure result on build error', async () => {
      safeSpawn.mockImplementation(() => makeChild({ closeCode: 1, stderr: 'build failed' }));

      const result = await executor.executeWithDependencies({
        skillName: 'dep-skill',
        scriptPath: '/scripts/dep.py',
        requirements: ['broken-dep']
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/build failed/);
    });

    it('handles empty requirements gracefully', async () => {
      safeSpawn
        .mockImplementationOnce(() => makeChild({}))              // _buildDockerImage
        .mockImplementationOnce(() => makeChild({ stdout: 'ok' })); // _executeInContainer

      const result = await executor.executeWithDependencies({
        skillName: 'dep-skill',
        scriptPath: '/scripts/dep.py',
        requirements: []
      });

      expect(result.success).toBe(true);
    });
  });

  describe('executeWithCachedImage', () => {
    it('delegates to execute with same options', async () => {
      safeSpawn.mockImplementation(() => makeChild({ stdout: 'cached' }));
      jest.spyOn(executor, 'execute');

      const result = await executor.executeWithCachedImage({
        skillName: 'cached-skill',
        scriptPath: '/scripts/cached.py',
        inputs: { a: 1 },
        imageTag: 'custom-image:1.0',
        timeout: 10000
      });

      expect(executor.execute).toHaveBeenCalledWith({
        skillName: 'cached-skill',
        scriptPath: '/scripts/cached.py',
        inputs: { a: 1 },
        timeout: 10000,
        env: {}
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('cached');
    });

    it('uses default dockerImage when no imageTag provided', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      await executor.executeWithCachedImage({
        skillName: 's',
        scriptPath: '/s.py'
      });

      const spawnArgs = safeSpawn.mock.calls[0][1];
      expect(spawnArgs).toContain('skill-python:latest');
    });
  });

  describe('_buildDockerImage', () => {
    it('resolves on successful build', async () => {
      safeSpawn.mockImplementation(() => makeChild({ stdout: 'build success' }));

      await expect(executor._buildDockerImage('/tmp/Dockerfile', 'my-image:1.0'))
        .resolves.toBeUndefined();
    });

    it('rejects on build failure', async () => {
      safeSpawn.mockImplementation(() => makeChild({ closeCode: 1, stderr: 'build error' }));

      await expect(executor._buildDockerImage('/tmp/Dockerfile', 'my-image:1.0'))
        .rejects.toThrow('build error');
    });

    it('rejects on spawn error', async () => {
      safeSpawn.mockImplementation(() => makeChild({ shouldError: true, errorMsg: 'no docker' }));

      await expect(executor._buildDockerImage('/tmp/Dockerfile', 'my-image:1.0'))
        .rejects.toThrow('no docker');
    });

    it('spawns docker build with correct args', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      await executor._buildDockerImage('/tmp/dir/Dockerfile', 'img:v1');

      expect(safeSpawn).toHaveBeenCalledWith('docker', ['build', '-t', 'img:v1', '-f', '/tmp/dir/Dockerfile', '/tmp/dir'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });
  });

  describe('_removeDockerImage', () => {
    it('spawns docker rmi with correct args', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      await executor._removeDockerImage('my-image:1.0');

      expect(safeSpawn).toHaveBeenCalledWith('docker', ['rmi', '-f', 'my-image:1.0'], { stdio: 'ignore' });
    });

    it('resolves on success', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      await expect(executor._removeDockerImage('img:1.0')).resolves.toBeUndefined();
    });

    it('resolves on close with non-zero code (ignores cleanup errors)', async () => {
      safeSpawn.mockImplementation(() => makeChild({ closeCode: 1 }));

      await expect(executor._removeDockerImage('img:1.0')).resolves.toBeUndefined();
    });

    it('resolves on error (ignores cleanup errors)', async () => {
      safeSpawn.mockImplementation(() => makeChild({ shouldError: true, errorMsg: 'not found' }));

      await expect(executor._removeDockerImage('img:1.0')).resolves.toBeUndefined();
    });
  });

  describe('_removeContainer', () => {
    it('spawns docker rm with correct args', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      await executor._removeContainer('my-container');

      expect(safeSpawn).toHaveBeenCalledWith('docker', ['rm', '-f', 'my-container'], { stdio: 'ignore' });
    });

    it('resolves on success', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      await expect(executor._removeContainer('c')).resolves.toBeUndefined();
    });

    it('resolves on non-zero close (ignores cleanup errors)', async () => {
      safeSpawn.mockImplementation(() => makeChild({ closeCode: 1 }));

      await expect(executor._removeContainer('c')).resolves.toBeUndefined();
    });

    it('resolves on error (ignores cleanup errors)', async () => {
      safeSpawn.mockImplementation(() => makeChild({ shouldError: true }));

      await expect(executor._removeContainer('c')).resolves.toBeUndefined();
    });
  });

  describe('getMetrics', () => {
    it('returns a copy of metrics with activeContainers and containerPoolSize', () => {
      executor.metrics.totalExecutions = 5;
      executor.metrics.successfulExecutions = 3;
      executor.metrics.failedExecutions = 2;
      executor.metrics.averageExecutionTime = 1200;
      executor.metrics.containerReuseCount = 1;
      executor.activeContainers.set('c1', {});
      executor.containerPool.push('p1');

      const m = executor.getMetrics();

      expect(m.totalExecutions).toBe(5);
      expect(m.successfulExecutions).toBe(3);
      expect(m.failedExecutions).toBe(2);
      expect(m.averageExecutionTime).toBe(1200);
      expect(m.containerReuseCount).toBe(1);
      expect(m.activeContainers).toBe(1);
      expect(m.containerPoolSize).toBe(1);
    });

    it('returns zero metrics for fresh executor', () => {
      const m = executor.getMetrics();
      expect(m.totalExecutions).toBe(0);
      expect(m.activeContainers).toBe(0);
      expect(m.containerPoolSize).toBe(0);
    });

    it('does not allow mutation of original metrics', () => {
      const m = executor.getMetrics();
      m.totalExecutions = 999;
      expect(executor.metrics.totalExecutions).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('kills active containers and removes them', async () => {
      const child1 = { kill: jest.fn() };
      const child2 = { kill: jest.fn() };
      executor.activeContainers.set('c1', child1);
      executor.activeContainers.set('c2', child2);
      safeSpawn.mockImplementation(() => makeChild({}));

      await executor.cleanup();

      expect(child1.kill).toHaveBeenCalled();
      expect(child2.kill).toHaveBeenCalled();
      expect(executor.activeContainers.size).toBe(0);
      expect(executor.containerPool.length).toBe(0);
    });

    it('handles cleanup with no active containers', async () => {
      await executor.cleanup();
      expect(executor.activeContainers.size).toBe(0);
      expect(executor.containerPool.length).toBe(0);
    });

    it('still clears state even if removal fails', async () => {
      executor.activeContainers.set('c1', { kill: jest.fn() });
      safeSpawn.mockImplementation(() => makeChild({ shouldError: true }));

      await executor.cleanup();

      expect(executor.activeContainers.size).toBe(0);
    });
  });

  describe('checkDockerAvailable (static)', () => {
    it('returns true when docker --version succeeds', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      const result = await DockerPythonExecutor.checkDockerAvailable();
      expect(result).toBe(true);
    });

    it('returns false when docker --version fails', async () => {
      safeSpawn.mockImplementation(() => makeChild({ closeCode: 1 }));

      const result = await DockerPythonExecutor.checkDockerAvailable();
      expect(result).toBe(false);
    });

    it('returns false on spawn error', async () => {
      safeSpawn.mockImplementation(() => makeChild({ shouldError: true, errorMsg: 'not found' }));

      const result = await DockerPythonExecutor.checkDockerAvailable();
      expect(result).toBe(false);
    });

    it('spawns docker --version', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));

      await DockerPythonExecutor.checkDockerAvailable();

      expect(safeSpawn).toHaveBeenCalledWith('docker', ['--version'], { stdio: 'ignore' });
    });
  });

  describe('buildBaseImage', () => {
    it('returns false when Dockerfile does not exist', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = await executor.buildBaseImage();

      expect(result).toBe(false);
      expect(console.warn).toHaveBeenCalled();
    });

    it('returns true when image builds successfully', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(executor, '_buildDockerImage').mockResolvedValue();

      const result = await executor.buildBaseImage();

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalled();
    });

    it('returns false when build fails', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(executor, '_buildDockerImage').mockRejectedValue(new Error('no space'));

      const result = await executor.buildBaseImage();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('execute metrics tracking', () => {
    it('updates average execution time on success', async () => {
      safeSpawn.mockImplementation(() => makeChild({ stdout: 'ok' }));

      await executor.execute({ skillName: 's', scriptPath: '/s.py' });

      expect(executor.metrics.totalExecutions).toBe(1);
      expect(executor.metrics.successfulExecutions).toBe(1);
      expect(executor.metrics.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('returns executionTime in result', async () => {
      safeSpawn.mockImplementation(() => makeChild({ stdout: 'ok' }));

      const result = await executor.execute({ skillName: 's', scriptPath: '/s.py' });

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('execute result timestamp', () => {
    it('returns ISO timestamp in result', async () => {
      jest.useFakeTimers();
      safeSpawn.mockImplementation(() => makeChild({ stdout: 'ok' }));

      const p = executor.execute({ skillName: 's', scriptPath: '/s.py' });
      jest.runAllTimers();
      const result = await p;

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      jest.useRealTimers();
    });
  });

  describe('execute timeout propagation', () => {
    it('uses default containerTimeout when no timeout option given', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));
      jest.spyOn(executor, '_executeInContainer');

      await executor.execute({ skillName: 's', scriptPath: '/s.py' });

      expect(executor._executeInContainer).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        30000
      );
    });

    it('passes custom timeout to _executeInContainer', async () => {
      safeSpawn.mockImplementation(() => makeChild({}));
      jest.spyOn(executor, '_executeInContainer');

      await executor.execute({ skillName: 's', scriptPath: '/s.py', timeout: 15000 });

      expect(executor._executeInContainer).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        15000
      );
    });
  });

  describe('failure result has timestamp', () => {
    it('includes timestamp in failure result', async () => {
      jest.useFakeTimers();
      safeSpawn.mockImplementation(() => makeChild({ closeCode: 1, stderr: 'fail' }));

      const p = executor.execute({ skillName: 's', scriptPath: '/s.py' });
      jest.runAllTimers();
      const result = await p;

      expect(result.success).toBe(false);
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      jest.useRealTimers();
    });
  });
});
