/**
 * AgentLoop v2 单元测试
 * 测试后台任务追踪、Result Holdback、命令批处理
 */

const assert = require('assert');

const {
  AgentLoop,
  BackgroundTask,
  BackgroundTaskManager,
  TaskStatus
} = require('../src/agent/AgentLoop');

console.log('\n=== AgentLoop v2 单元测试 ===\n');

// ========== BackgroundTask 测试 ==========
console.log('--- BackgroundTask Tests ---');

{
  const task = new BackgroundTask({ name: 'test-task', type: 'test' });

  // 测试初始状态
  assert(task.status === TaskStatus.PENDING, 'Initial status should be PENDING');
  console.log('✓ Initial status: PENDING');

  // 测试启动
  let startEvent = false;
  task.on('start', () => { startEvent = true; });
  task.start();
  assert(task.status === TaskStatus.RUNNING, 'Status should be RUNNING after start');
  assert(task.startTime !== null, 'Start time should be set');
  assert(startEvent === true, 'Start event should fire');
  console.log('✓ Start method works');

  // 测试完成
  let completeEvent = false;
  task.on('complete', () => { completeEvent = true; });
  task.complete('success');
  assert(task.status === TaskStatus.COMPLETED, 'Status should be COMPLETED');
  assert(task.result === 'success', 'Result should be set');
  assert(task.endTime !== null, 'End time should be set');
  assert(completeEvent === true, 'Complete event should fire');
  console.log('✓ Complete method works');

  // 测试失败
  const failTask = new BackgroundTask({ name: 'fail-test' });
  failTask.start();
  failTask.fail(new Error('test error'));
  assert(failTask.status === TaskStatus.FAILED, 'Status should be FAILED');
  assert(failTask.error === 'test error', 'Error should be set');
  console.log('✓ Fail method works');

  // 测试取消
  const cancelTask = new BackgroundTask({ name: 'cancel-test' });
  cancelTask.start();
  cancelTask.cancel();
  assert(cancelTask.status === TaskStatus.CANCELLED, 'Status should be CANCELLED');
  console.log('✓ Cancel method works');

  // 测试时长计算
  const durationTask = new BackgroundTask();
  durationTask.start();
  assert(durationTask.getDuration() >= 0, 'Duration should be >= 0');
  console.log(`✓ Duration calculation: ${durationTask.getDuration()}ms`);

  // 测试序列化
  const json = task.toJSON();
  assert(json.name === 'test-task', 'JSON should contain name');
  assert(json.status === TaskStatus.COMPLETED, 'JSON should contain status');
  console.log('✓ toJSON works');

  console.log('✅ BackgroundTask: All tests passed\n');
}

// ========== BackgroundTaskManager 测试 ==========
console.log('--- BackgroundTaskManager Tests ---');

{
  const manager = new BackgroundTaskManager({ maxConcurrent: 2 });

  // 测试创建任务
  const task = manager.create({ name: 'test', priority: 1 });
  assert(task instanceof BackgroundTask, 'Should create BackgroundTask');
  assert(manager.get(task.id) === task, 'Should get task by id');
  assert(manager.getStats().total === 1, 'Should have 1 task');
  console.log('✓ Create task works');

  // 测试启动任务 (使用同步方式)
  manager.on('taskStarted', () => {});

  // 创建任务后手动测试状态
  const syncTask = manager.create({ name: 'sync-test' });
  syncTask.start();
  assert(syncTask.status === TaskStatus.RUNNING, 'Status should be RUNNING after start');
  syncTask.complete('sync-result');
  assert(syncTask.status === TaskStatus.COMPLETED, 'Status should be COMPLETED');
  assert(syncTask.result === 'sync-result', 'Result should be set');
  console.log('✓ Task lifecycle works');

  // 测试失败任务
  const failTask = manager.create({ name: 'fail' });
  failTask.start();
  failTask.fail(new Error('intentional error'));
  assert(failTask.status === TaskStatus.FAILED, 'Task should be failed');
  console.log('✓ Failed task handling works');

  // 测试统计
  const stats = manager.getStats();
  assert(stats.total === 3, 'Should have 3 tasks');
  assert(stats.completed === 1, 'Should have 1 completed');
  assert(stats.failed === 1, 'Should have 1 failed');
  console.log('✓ Statistics work');

  // 测试清理 (清理所有任务)
  manager.cleanup(false);
  assert(manager.getStats().total === 0, 'Should be empty after cleanup');
  console.log('✓ Cleanup works');

  console.log('✅ BackgroundTaskManager: All tests passed\n');
}

// ========== AgentLoop v2 测试 ==========
console.log('--- AgentLoop v2 Tests ---');

{
  const loop = new AgentLoop({
    maxIterations: 5,
    timeout: 30000,
    maxConcurrentTasks: 2
  });

  // 测试初始化
  assert(loop.maxIterations === 5, 'maxIterations should be 5');
  assert(loop.backgroundTasks instanceof BackgroundTaskManager, 'Should have BackgroundTaskManager');
  assert(loop.hasRunningBackgroundTasks() === false, 'Should have no running tasks');
  console.log('✓ Initialization works');

  // 测试 Result Holdback
  loop.holdResult({ test: 'data' });
  assert(loop.hasHeldResult() === true, 'Should have held result');
  assert(loop.getHeldResult().test === 'data', 'Held result should match');
  const released = loop.releaseHeldResult();
  assert(released.test === 'data', 'Released result should match');
  assert(loop.hasHeldResult() === false, 'Should not have held result');
  console.log('✓ Result Holdback works');

  // 测试命令批处理
  loop.enqueueCommand({ type: 'prompt', value: 'hello', isMeta: false });
  loop.enqueueCommand({ type: 'prompt', value: 'world', isMeta: false });
  const commands = loop.getCommands();
  assert(commands.length === 1, 'Should merge same type commands');
  assert(commands[0].value === 'hello\nworld', 'Values should be merged');
  console.log('✓ Command batching works');

  // 测试清除命令
  const cleared = loop.clearCommands();
  assert(cleared.length === 1, 'Should return 1 command');
  assert(loop.getCommands().length === 0, 'Queue should be empty');
  console.log('✓ Clear commands works');

  // 测试后台任务
  const bgTask = loop.createBackgroundTask('test-task', 'test', 1);
  assert(bgTask instanceof BackgroundTask, 'Should create BackgroundTask');
  assert(bgTask.priority === 1, 'Priority should be 1');
  console.log('✓ Background task creation works');

  // 测试动作注册
  loop.registerAction('testAction', async (params) => {
    return { success: true, params };
  });
  assert(loop.actions.has('testAction'), 'Should have registered action');
  console.log('✓ Action registration works');

  // 测试允许动作
  assert(loop._allowedActions.has('spawnTask'), 'spawnTask should be allowed');
  assert(loop._allowedActions.has('waitForTask'), 'waitForTask should be allowed');
  assert(loop._allowedActions.has('backgroundTask'), 'backgroundTask should be allowed');
  console.log('✓ v2 actions allowed');

  // 测试统计
  const stats = loop.getStats();
  assert(stats.iterations === 0, 'Initial iterations should be 0');
  assert(stats.actionsExecuted === 0, 'Initial actions should be 0');
  assert(stats.backgroundTasks instanceof Object, 'Should have bg task stats');
  console.log('✓ Statistics work');

  // 测试状态
  loop._state.pageUrl = 'http://test.com';
  const state = loop.getState();
  assert(state.pageUrl === 'http://test.com', 'State should be accessible');
  console.log('✓ State access works');

  // 测试历史
  loop.history.push({ type: 'test' });
  const history = loop.getHistory();
  assert(history.length === 1, 'History should be accessible');
  loop.clearHistory();
  assert(loop.history.length === 0, 'History should be cleared');
  console.log('✓ History management works');

  console.log('✅ AgentLoop v2: All tests passed\n');
}

// ========== 向后兼容测试 ==========
console.log('--- Backward Compatibility Tests ---');

{
  const loop = new AgentLoop();

  // 确保原有方法签名兼容
  assert(typeof loop.run === 'function', 'run should be function');
  assert(typeof loop.abort === 'function', 'abort should be function');
  assert(typeof loop.registerAction === 'function', 'registerAction should be function');
  assert(typeof loop.setMCPServices === 'function', 'setMCPServices should be function');
  assert(typeof loop.setSkillServices === 'function', 'setSkillServices should be function');
  console.log('✓ Original method signatures preserved');

  // 确保原有动作兼容
  assert(loop._allowedActions.has('navigate'), 'navigate should be allowed');
  assert(loop._allowedActions.has('click'), 'click should be allowed');
  assert(loop._allowedActions.has('type'), 'type should be allowed');
  assert(loop._allowedActions.has('complete'), 'complete should be allowed');
  console.log('✓ Original actions preserved');

  // 确保事件兼容
  assert(typeof loop.on === 'function', 'Should be EventEmitter');
  console.log('✓ EventEmitter compatibility');

  console.log('✅ Backward Compatibility: All tests passed\n');
}

// ========== 集成场景测试 ==========
console.log('--- Integration Scenario Tests ---');

{
  const loop = new AgentLoop({ maxConcurrentTasks: 2 });

  // 直接测试后台任务执行
  const bgTask = loop.createBackgroundTask('direct-test', 'direct');
  bgTask.start();

  // 模拟异步操作
  setTimeout(() => {
    bgTask.complete('direct-result');
  }, 20);

  // 验证任务创建成功
  assert(bgTask instanceof BackgroundTask, 'Should be BackgroundTask');
  assert(bgTask.status === TaskStatus.RUNNING, 'Should be RUNNING');
  console.log('✓ Background task creation works');

  // 验证可以获取任务
  const retrieved = loop.backgroundTasks.get(bgTask.id);
  assert(retrieved === bgTask, 'Should retrieve same task');
  console.log('✓ Background task retrieval works');

  console.log('✅ Integration: All tests passed\n');
}

// 异步测试 - 单独隔离
(async () => {
  const loop = new AgentLoop({ maxConcurrentTasks: 2 });

  const bgTask = loop.createBackgroundTask('async-test', 'async', 1);
  const startPromise = loop.backgroundTasks.start(bgTask.id, async () => {
    await new Promise((r) => setTimeout(r, 10));
    return 'async-result';
  });

  // 等待任务完成
  await startPromise.catch(() => {});
  await new Promise((r) => setTimeout(r, 20)); // 额外等待确保状态更新

  const completed = loop.getBackgroundTasks();
  assert(completed.length === 1, 'Should have 1 task');
  assert(completed[0].result === 'async-result', 'Result should match');
  console.log('✓ Async background task execution works');

  console.log('✅ Integration (async): All tests passed\n');
})();

// ========== 性能测试 ==========
console.log('--- Performance Tests ---');

{
  const manager = new BackgroundTaskManager();

  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    const task = manager.create({ name: `task-${i}` });
    task.start();
    task.complete('result');
  }
  const duration = Date.now() - start;

  console.log(`✓ BackgroundTaskManager: 100 tasks in ${duration}ms`);
  assert(duration < 1000, 'Should handle 100 tasks quickly');

  console.log('✅ Performance: All tests passed\n');
}

console.log('========================================');
console.log('🎉 All AgentLoop v2 tests passed!');
console.log('========================================\n');
