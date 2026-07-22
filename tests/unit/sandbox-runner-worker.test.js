'use strict';

const mockPostMessage = jest.fn();

jest.mock('worker_threads', () => ({
  isMainThread: false,
  parentPort: { postMessage: mockPostMessage },
  workerData: { pluginPath: '/test/plugin', method: 'testMethod', args: [] },
  Worker: class FakeWorker {}
}));

describe('SandboxRunner worker thread', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
    jest.resetModules();
  });

  test('executes class plugin method and posts result', async () => {
    class TestPlugin { testMethod() { return 'ok'; } }
    jest.doMock('/test/plugin', () => TestPlugin, { virtual: true });
    require('../../src/plugins/SandboxRunner');
    await new Promise(process.nextTick);
    expect(mockPostMessage).toHaveBeenCalledWith({ result: 'ok' });
  });

  test('posts error when plugin method throws', async () => {
    class BrokenPlugin { testMethod() { throw new Error('boom'); } }
    jest.doMock('/test/plugin', () => BrokenPlugin, { virtual: true });
    require('../../src/plugins/SandboxRunner');
    await new Promise(process.nextTick);
    expect(mockPostMessage).toHaveBeenCalledWith({ error: 'boom' });
  });
});
