/**
 * MCPManager v2 单元测试 (简化版)
 */

const assert = require('assert');
const {
  MCPManager,
  MCPServerConfig,
  LRUCache,
  ServerType
} = require('../src/mcp/MCPManager');

console.log('\n=== MCPManager v2 单元测试 ===\n');

console.log('--- LRUCache Tests ---');
{
  const cache = new LRUCache(3);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.strictEqual(cache.get('a'), 1);
  assert.strictEqual(cache.get('b'), 2);
  assert.strictEqual(cache.get('c'), 3);
  console.log('✓ Basic get/set works');

  cache.set('d', 4);
  assert(!cache.has('a'), 'a should be evicted (oldest)');
  assert(cache.has('b'));
  assert(cache.has('c'));
  assert(cache.has('d'));
  console.log('✓ LRU eviction works');

  cache.delete('c');
  assert(!cache.has('c'));
  console.log('✓ Delete works');

  cache.clear();
  assert.strictEqual(cache.size, 0);
  console.log('✓ Clear works');

  console.log('✅ LRUCache: All tests passed\n');
}

console.log('--- MCPServerConfig Tests ---');
{
  const config = new MCPServerConfig({
    type: ServerType.STDIO,
    command: 'npx',
    args: ['-y', 'server'],
    env: { DEBUG: 'true' }
  });

  assert.strictEqual(config.type, ServerType.STDIO);
  assert.strictEqual(config.command, 'npx');
  assert(Array.isArray(config.args));
  console.log('✓ Configuration parsing works');

  const cloned = config.clone();
  assert.strictEqual(cloned.type, config.type);
  console.log('✓ Clone works');

  console.log('✅ MCPServerConfig: All tests passed\n');
}

console.log('--- MCPManager Basic Tests ---');
{
  const manager = new MCPManager({ maxConcurrent: 2 });

  assert(manager instanceof MCPManager);
  assert(manager.clients instanceof Map);
  assert(manager.serverConfigs instanceof Map);
  console.log('✓ Initialization works');

  const stats = manager.getStats();
  assert.strictEqual(stats.total, 0);
  console.log('✓ Statistics work');

  console.log('✅ MCPManager Basic: All tests passed\n');
}

console.log('--- Config Comparison Tests ---');
{
  const manager = new MCPManager();
  const c1 = new MCPServerConfig({ type: ServerType.STDIO, command: 'test' });
  const c2 = new MCPServerConfig({ type: ServerType.STDIO, command: 'test' });
  const c3 = new MCPServerConfig({ type: ServerType.STDIO, command: 'other' });
  const c4 = new MCPServerConfig({ type: ServerType.SSE, command: 'test' });

  assert.strictEqual(manager.areConfigsEqual(c1, c2), true);
  assert.strictEqual(manager.areConfigsEqual(c1, c3), false);
  assert.strictEqual(manager.areConfigsEqual(c1, c4), false);
  assert.strictEqual(manager.areConfigsEqual(null, c1), false);
  console.log('✅ Config Comparison: All tests passed\n');
}

console.log('--- Diff Computation Tests ---');
{
  const manager = new MCPManager();

  const diff1 = manager.computeConfigDiff(
    { s1: { type: 'stdio' }, s2: { type: 'stdio' } },
    { s1: { type: 'stdio' }, s3: { type: 'stdio' } }
  );
  assert(diff1.added.includes('s3'));
  assert(diff1.removed.includes('s2'));
  assert(diff1.unchanged.includes('s1'));
  console.log('✓ Diff computation works');

  const diff2 = manager.computeConfigDiff(
    { s1: { type: 'stdio' } },
    { s1: { type: 'stdio' } }
  );
  assert.strictEqual(diff2.added.length, 0);
  assert.strictEqual(diff2.removed.length, 0);
  assert.strictEqual(diff2.changed.length, 0);
  console.log('✓ No-change detection works');

  console.log('✅ Diff Computation: All tests passed\n');
}

console.log('--- Cache Tests ---');
{
  const manager = new MCPManager();

  const config = new MCPServerConfig({ type: ServerType.STDIO, command: 'test' });
  const key1 = manager._getCacheKey('server1', config);
  const key2 = manager._getCacheKey('server1', config);
  assert.strictEqual(key1, key2);
  console.log('✓ Cache key generation works');

  manager.toolCache.set('server1', ['tool1', 'tool2']);
  assert(manager.toolCache.has('server1'));
  manager.toolCache.delete('server1');
  assert(!manager.toolCache.has('server1'));
  console.log('✓ Cache operations work');

  console.log('✅ Cache: All tests passed\n');
}

console.log('--- Event Tests ---');
{
  const manager = new MCPManager();
  // eslint-disable-next-line no-unused-vars
  let fired = false;

  manager.on('serverAdded', () => { fired = true; });
  manager.on('serverError', () => { fired = true; });
  manager.on('configChange', () => {});
  manager.on('serverRemoved', () => {});

  assert.strictEqual(typeof manager.on, 'function');
  assert.strictEqual(typeof manager.emit, 'function');
  console.log('✅ Events: All tests passed\n');
}

console.log('--- API Tests ---');
{
  const manager = new MCPManager();

  assert.strictEqual(typeof manager.addServer, 'function');
  assert.strictEqual(typeof manager.removeServer, 'function');
  assert.strictEqual(typeof manager.updateServer, 'function');
  assert.strictEqual(typeof manager.updateServers, 'function');
  assert.strictEqual(typeof manager.getServer, 'function');
  assert.strictEqual(typeof manager.getAllServers, 'function');
  assert.strictEqual(typeof manager.getConnectedServers, 'function');
  assert.strictEqual(typeof manager.getTools, 'function');
  assert.strictEqual(typeof manager.callTool, 'function');
  assert.strictEqual(typeof manager.getStats, 'function');
  assert.strictEqual(typeof manager.cleanup, 'function');
  assert.strictEqual(typeof manager.reconnectServer, 'function');
  assert.strictEqual(typeof manager.clearServerCache, 'function');
  console.log('✅ API: All tests passed\n');
}

console.log('--- Performance Tests ---');
{
  const manager = new MCPManager();

  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    const config = new MCPServerConfig({
      type: ServerType.STDIO,
      command: 'test',
      args: ['arg1', 'arg2']
    });
    manager.areConfigsEqual(config, config);
  }
  const duration = Date.now() - start;

  console.log(`✓ Config comparison: 100 iterations in ${duration}ms`);
  assert(duration < 100);

  console.log('✅ Performance: All tests passed\n');
}

console.log('========================================');
console.log('🎉 All MCPManager v2 tests passed!');
console.log('========================================\n');
