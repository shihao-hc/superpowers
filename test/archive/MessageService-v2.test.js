/**
 * MessageService v2 单元测试
 * 测试 BoundedUUIDSet, FlushGate, CommandQueue
 */

const assert = require('assert');

// 导入被测试的类
const {
  MessageService,
  BoundedUUIDSet,
  FlushGate,
  CommandQueue
} = require('../src/agent/MessageService');

// ========== BoundedUUIDSet 测试 ==========
console.log('\n=== BoundedUUIDSet Tests ===');

{
  const set = new BoundedUUIDSet(5);

  // 测试基本添加
  assert(set.add('uuid-1') === true, 'First add should succeed');
  assert(set.add('uuid-2') === true, 'Second add should succeed');
  assert(set.has('uuid-1') === true, 'Should contain uuid-1');
  assert(set.has('uuid-2') === true, 'Should contain uuid-2');
  console.log('✓ Basic add operations work');

  // 测试重复添加
  assert(set.add('uuid-1') === false, 'Duplicate add should return false');
  assert(set.size() === 2, 'Size should be 2');
  console.log('✓ Duplicate detection works');

  // 测试容量限制
  set.add('uuid-3');
  set.add('uuid-4');
  assert(set.add('uuid-5') === true, 'Should add up to capacity');
  assert(set.size() === 5, 'Size should be at capacity');

  // 测试驱逐最旧条目
  set.add('uuid-6'); // 应该驱逐 uuid-1
  assert(set.has('uuid-1') === false, 'uuid-1 should be evicted');
  assert(set.has('uuid-6') === true, 'uuid-6 should be present');
  console.log('✓ LRU eviction works');

  // 测试清空
  set.clear();
  assert(set.size() === 0, 'Size should be 0 after clear');
  assert(set.isEmpty() === true, 'Should be empty');
  console.log('✓ Clear operation works');

  // 测试容量
  assert(set.getCapacity() === 5, 'Capacity should be 5');
  console.log('✓ Capacity getter works');

  console.log('✅ BoundedUUIDSet: All tests passed');
}

// ========== FlushGate 测试 ==========
console.log('\n=== FlushGate Tests ===');

{
  const gate = new FlushGate();

  // 测试初始状态
  assert(gate.isFlushed() === false, 'Should not be flushed initially');
  assert(gate.length() === 0, 'Queue should be empty');
  console.log('✓ Initial state correct');

  // 测试入队
  assert(gate.enqueue('msg-1') === true, 'First enqueue should succeed');
  assert(gate.enqueue('msg-2') === true, 'Second enqueue should succeed');
  assert(gate.length() === 2, 'Queue length should be 2');
  console.log('✓ Enqueue works');

  // 测试 flush
  const pending = gate.flush();
  assert(pending.length === 2, 'Should return 2 items');
  assert(gate.isFlushed() === true, 'Should be flushed after flush()');
  console.log('✓ Flush works');

  // 测试 flush 后不能再入队
  assert(gate.enqueue('msg-3') === false, 'Should not enqueue after flush');
  console.log('✓ Flush blocks further enqueues');

  // 测试重置
  gate.reset();
  assert(gate.isFlushed() === false, 'Should not be flushed after reset');
  assert(gate.length() === 0, 'Queue should be empty after reset');
  console.log('✓ Reset works');

  // 测试丢弃
  gate.enqueue('msg-4');
  gate.enqueue('msg-5');
  const dropped = gate.drop();
  assert(dropped === 2, 'Should drop 2 items');
  assert(gate.length() === 0, 'Queue should be empty after drop');
  assert(gate.isFlushed() === true, 'Should be flushed after drop');
  console.log('✓ Drop works');

  console.log('✅ FlushGate: All tests passed');
}

// ========== CommandQueue 测试 ==========
console.log('\n=== CommandQueue Tests ===');

{
  const queue = new CommandQueue();

  // 测试基本入队
  queue.enqueue({ type: 'prompt', value: 'hello', uuid: 'cmd-1' });
  assert(queue.length() === 1, 'Queue should have 1 item');
  console.log('✓ Basic enqueue works');

  // 测试合并相同类型
  queue.enqueue({ type: 'prompt', value: 'world', uuid: 'cmd-2' });
  assert(queue.length() === 1, 'Should merge same type');

  const cmd = queue.peek();
  assert(cmd.value === 'hello\nworld', 'Values should be merged');
  console.log('✓ Same-type merging works');

  // 测试不合并不同类型
  queue.enqueue({ type: 'task-notification', value: 'task done', uuid: 'cmd-3' });
  assert(queue.length() === 2, 'Different types should not merge');
  console.log('✓ Different types stay separate');

  // 测试出队
  const dequeued = queue.dequeue();
  assert(dequeued.type === 'prompt', 'Should dequeue prompt first');
  assert(queue.length() === 1, 'Queue should have 1 item');
  console.log('✓ Dequeue works');

  // 测试清空
  queue.clear();
  assert(queue.length() === 0, 'Queue should be empty after clear');
  console.log('✓ Clear works');

  // 测试统计
  queue.enqueue({ type: 'prompt', value: 'a' });
  queue.enqueue({ type: 'prompt', value: 'b' });
  queue.enqueue({ type: 'task-notification', value: 'c' });
  const stats = queue.getStats();
  assert(stats.byType.prompt === 1, 'Should have 1 merged prompt');
  assert(stats.byType['task-notification'] === 1, 'Should have 1 task-notification');
  console.log('✓ Stats work');

  console.log('✅ CommandQueue: All tests passed');
}

// ========== MessageService v2 测试 ==========
console.log('\n=== MessageService v2 Tests ===');

{
  const service = new MessageService();

  // 测试基本消息添加（使用带去重的版本以便追踪）
  const msg1 = service.createUserMessage('Hello', { uuid: 'msg-1' });
  service.addMessageWithDedupe(msg1);
  assert(service.messages.length === 1, 'Should have 1 message');
  console.log('✓ Basic message add works');

  // 测试 UUID 去重
  const msg1Dup = service.createUserMessage('Duplicate', { uuid: 'msg-1' });
  const result = service.addMessageWithDedupe(msg1Dup);
  assert(result === null, 'Duplicate should return null');
  assert(service.messages.length === 1, 'Should still have 1 message');
  console.log('✓ UUID deduplication works');

  // 测试 UUID 追踪
  assert(service.isProcessed('msg-1') === true, 'msg-1 should be marked processed');
  assert(service.isProcessed('msg-999') === false, 'msg-999 should not be processed');
  console.log('✓ UUID tracking works');

  // 测试 FlushGate
  service.resetFlushGate();
  const queuedMsg = service.createUserMessage('Queued', { uuid: 'msg-2' });
  const queued = service.addMessageEnhanced(queuedMsg, { useFlushGate: true });
  assert(queued === null, 'Should be queued');
  assert(service.getFlushGateStats().queueLength === 1, 'Queue should have 1 item');
  console.log('✓ FlushGate integration works');

  // 测试 flush - beginFlush 返回 pending 消息，需要手动添加
  const pending = service.beginFlush();
  assert(pending.length === 1, 'Should have 1 pending message');
  for (const msg of pending) {
    service.addMessage(msg);
  }
  assert(service.messages.length === 2, 'Should have 2 messages after flush');
  console.log('✓ Flush works');

  // 测试命令队列
  service.enqueueCommand({ type: 'prompt', value: 'cmd-1' });
  service.enqueueCommand({ type: 'prompt', value: 'cmd-2' });
  assert(service.getCommandQueueLength() === 1, 'Should have merged to 1 command');
  console.log('✓ Command queue works');

  // 测试 Result Holdback
  service.holdResult({ type: 'result', data: 'test' });
  assert(service.hasHeldResult() === true, 'Should have held result');
  const released = service.releaseHeldResult();
  assert(released.data === 'test', 'Should release held result');
  assert(service.hasHeldResult() === false, 'Should not have held result');
  console.log('✓ Result holdback works');

  // 测试诊断信息
  const diagnostics = service.getDiagnostics();
  assert(diagnostics.messages.count === 2, 'Should show correct message count');
  assert(diagnostics.flushGate !== undefined, 'Should include flushGate stats');
  assert(diagnostics.commandQueue !== undefined, 'Should include commandQueue stats');
  console.log('✓ Diagnostics work');

  // 测试重置
  service.resetAll();
  assert(service.messages.length === 0, 'Messages should be cleared');
  assert(service.getCommandQueueLength() === 0, 'Command queue should be cleared');
  console.log('✓ ResetAll works');

  // 测试向后兼容：原有方法仍然工作
  service.addMessage(service.createUserMessage('Compatibility test'));
  assert(service.messages.length === 1, 'Old addMessage should still work');
  const normalized = service.normalizeForAPI();
  assert(normalized.length === 1, 'normalizeForAPI should still work');
  console.log('✓ Backward compatibility preserved');

  console.log('✅ MessageService v2: All tests passed');
}

// ========== 性能测试 ==========
console.log('\n=== Performance Tests ===');

{
  // BoundedUUIDSet 性能
  const set = new BoundedUUIDSet(10000);
  const start = Date.now();
  for (let i = 0; i < 10000; i++) {
    set.add(`uuid-${i}`);
  }
  const addTime = Date.now() - start;
  console.log(`✓ BoundedUUIDSet: 10,000 adds in ${addTime}ms`);

  // 查找性能
  const searchStart = Date.now();
  for (let i = 0; i < 10000; i++) {
    set.has(`uuid-${i}`);
  }
  const searchTime = Date.now() - searchStart;
  console.log(`✓ BoundedUUIDSet: 10,000 searches in ${searchTime}ms`);

  console.log('✅ Performance tests completed');
}

console.log('\n========================================');
console.log('🎉 All tests passed!');
console.log('========================================\n');
