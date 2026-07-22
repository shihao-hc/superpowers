'use strict';

const mockWorkerInstances = [];
let MockWorker;

jest.mock('worker_threads', () => {
  const EE = require('events');
  MockWorker = class extends EE {
    constructor(filename, options) {
      super();
      this.filename = filename;
      this.options = options;
      mockWorkerInstances.push(this);
      this._terminated = false;
      this.terminate = jest.fn().mockImplementation(() => {
        this._terminated = true;
      });
    }
  };

  return {
    Worker: MockWorker,
    isMainThread: true,
    parentPort: null,
    workerData: null
  };
});

const { run } = require('../../src/plugins/SandboxRunner');

describe('SandboxRunner', () => {
  beforeEach(() => {
    mockWorkerInstances.length = 0;
  });

  describe('run', () => {
    function guardedRun(...args) {
      const p = run(...args);
      p.catch(() => {});
      return p;
    }

    it('resolves with result on worker success', async () => {
      const promise = guardedRun('/path/to/plugin', 'myMethod', ['arg1']);

      const worker = mockWorkerInstances[0];
      worker.emit('message', { result: 'executed' });

      await expect(promise).resolves.toBe('executed');
    });

    it('rejects when worker returns method-not-found error', async () => {
      const promise = guardedRun('/path/to/plugin', 'missingMethod', []);

      const worker = mockWorkerInstances[0];
      worker.emit('message', { error: 'method-not-found' });

      await expect(promise).rejects.toThrow('method-not-found');
    });

    it('rejects when worker returns runtime error', async () => {
      const promise = guardedRun('/path/to/plugin', 'crash', []);

      const worker = mockWorkerInstances[0];
      worker.emit('message', { error: 'Cannot read property of undefined' });

      await expect(promise).rejects.toThrow('Cannot read property of undefined');
    });

    it('rejects with non-string error messages', async () => {
      const promise = guardedRun('/path/to/plugin', 'fail', []);

      const worker = mockWorkerInstances[0];
      worker.emit('message', { error: 42 });

      await expect(promise).rejects.toThrow('42');
    });

    it('rejects on worker error event', async () => {
      const promise = guardedRun('/path/to/plugin', 'method', []);

      const worker = mockWorkerInstances[0];
      worker.emit('error', new Error('Worker crashed'));

      await expect(promise).rejects.toThrow('Worker crashed');
    });

    it('rejects on timeout when worker does not respond', async () => {
      const promise = guardedRun('/path/to/plugin', 'slowMethod', [], 50);

      await expect(promise).rejects.toThrow('timeout');
    });

    it('terminates worker on timeout', async () => {
      const promise = guardedRun('/path/to/plugin', 'slowMethod', [], 50);

      await expect(promise).rejects.toThrow('timeout');
      const worker = mockWorkerInstances[0];
      expect(worker.terminate).toHaveBeenCalled();
    });

    it('ignores worker error after settled', async () => {
      const promise = guardedRun('/path/to/plugin', 'method', []);

      const worker = mockWorkerInstances[0];
      worker.emit('message', { result: 'done' });
      worker.emit('error', new Error('Late error'));

      await expect(promise).resolves.toBe('done');
    });

    it('passes pluginPath, method and args as workerData', async () => {
      const promise = guardedRun('/my/plugin', 'execute', [1, 2, 3], 50);

      const worker = mockWorkerInstances[0];
      expect(worker.options.workerData).toEqual({
        pluginPath: '/my/plugin',
        method: 'execute',
        args: [1, 2, 3]
      });

      await expect(promise).rejects.toThrow('timeout');
    });

    it('uses default timeout of 3000ms when not specified', async () => {
      const promise = guardedRun('/path/to/plugin', 'method', [], 200);

      await expect(promise).rejects.toThrow('timeout');
    });
  });
});
