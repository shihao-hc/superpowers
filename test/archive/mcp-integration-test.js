/**
 * MCP 集成模块测试
 */

'use strict';

const { EventEmitter } = require('events');

const { MCPBridge } = require('../src/mcp/MCPBridge');
const { MCPToolRegistry } = require('../src/mcp/MCPToolRegistry');
const { MCPNodeManager } = require('../src/mcp/MCPNodeManager');
const { MCPPermissionManager } = require('../src/mcp/MCPPermissionManager');

class MockMCPClient extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.ready = true;
    this.connected = true;
    this.tools = this._getMockTools();
  }

  _getMockTools() {
    const toolSets = {
      'filesystem': [
        { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
        { name: 'write_file', description: 'Write a file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } }
      ],
      'github': [
        { name: 'create_issue', description: 'Create a GitHub issue', inputSchema: { type: 'object', properties: { repo: { type: 'string' }, title: { type: 'string' } }, required: ['repo', 'title'] } }
      ],
      'sequential-thinking': [
        { name: 'think', description: 'Deep thinking', inputSchema: { type: 'object', properties: { thought: { type: 'string' } }, required: ['thought'] } }
      ]
    };
    return toolSets[this.name] || [];
  }

  async start() {}
  async stop() {}

  async listTools() {
    return this.tools;
  }

  async callTool(toolName, args = {}) {
    return { success: true, tool: toolName, result: args };
  }

  getStatus() {
    return { name: this.name, connected: this.connected, ready: this.ready, pendingRequests: 0 };
  }
}

MCPBridge.setMCPClient(MockMCPClient);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

async function main() {
  console.log('=== MCP Bridge 测试 ===\n');

  await test('MCPBridge 可以创建实例', async () => {
    const bridge = new MCPBridge();
    assert(bridge.clients.size === 0, 'Bridge should start empty');
    await bridge.shutdown();
  });

  await test('MCPBridge 可以注册服务器', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'filesystem', command: 'mock', args: [], env: {} });
    assert(bridge.clients.has('filesystem'), 'Should register filesystem');
    await bridge.shutdown();
  });

  await test('MCPBridge 可以获取工具', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'filesystem', command: 'mock', args: [], env: {} });
    const tools = bridge.getAvailableTools();
    assert(tools.length > 0, 'Should have tools');
    assert(tools.some(t => t.fullName === 'filesystem:read_file'), 'Should have read_file');
    await bridge.shutdown();
  });

  await test('MCPBridge 可以调用工具', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'sequential-thinking', command: 'mock', args: [], env: {} });
    const result = await bridge.call('sequential-thinking:think', { thought: 'test' });
    assert(result.success, 'Should return result');
    await bridge.shutdown();
  });

  await test('MCPBridge 可以批量调用', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'sequential-thinking', command: 'mock', args: [], env: {} });
    const results = await bridge.batchCall([
      { toolFullName: 'sequential-thinking:think', params: { thought: 'first' } },
      { toolFullName: 'sequential-thinking:think', params: { thought: 'second' } }
    ]);
    assert(results.length === 2, 'Should have 2 results');
    assert(results.every(r => r.success), 'All should succeed');
    await bridge.shutdown();
  });

  await test('MCPBridge 可以获取服务器状态', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'github', command: 'mock', args: [], env: {} });
    const status = bridge.getServerStatus();
    assert(status.github?.connected, 'Should show connected');
    await bridge.shutdown();
  });

  await test('MCPBridge 可以取消注册', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'temp', command: 'mock', args: [], env: {} });
    assert(bridge.clients.has('temp'), 'Should be registered');
    await bridge.unregister('temp');
    assert(!bridge.clients.has('temp'), 'Should be unregistered');
  });

  await test('MCPBridge 可以获取指标', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'filesystem', command: 'mock', args: [], env: {} });
    await bridge.call('filesystem:read_file', { path: '/test' });
    const metrics = bridge.getMetrics();
    assert(metrics.totalCalls > 0, 'Should track calls');
    await bridge.shutdown();
  });

  console.log('\n=== MCPToolRegistry 测试 ===\n');

  await test('MCPToolRegistry 可以创建实例', async () => {
    const registry = new MCPToolRegistry();
    assert(registry.tools.size === 0, 'Should start empty');
  });

  await test('MCPToolRegistry 可以格式化工具', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'filesystem', command: 'mock', args: [], env: {} });
    const registry = new MCPToolRegistry();
    registry.initialize(bridge);
    await registry.refresh();
    const formatted = registry.formatForLLM();
    assert(formatted.length > 0, 'Should format tools');
    await bridge.shutdown();
    registry.destroy();
  });

  await test('MCPToolRegistry 可以过滤工具', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'filesystem', command: 'mock', args: [], env: {} });
    await bridge.register({ name: 'github', command: 'mock', args: [], env: {} });
    const registry = new MCPToolRegistry();
    registry.initialize(bridge);
    await registry.refresh();
    const fsTools = registry.getTools({ serverName: 'filesystem' });
    assert(fsTools.length > 0, 'Should filter by server');
    assert(fsTools.every(t => t.serverName === 'filesystem'), 'All should be filesystem');
    await bridge.shutdown();
    registry.destroy();
  });

  await test('MCPToolRegistry 可以验证参数', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'filesystem', command: 'mock', args: [], env: {} });
    const registry = new MCPToolRegistry();
    registry.initialize(bridge);
    await registry.refresh();
    
    const invalid = registry.validateParams('filesystem:read_file', {});
    assert(!invalid.valid, 'Should fail for missing params');
    
    const valid = registry.validateParams('filesystem:read_file', { path: '/test' });
    assert(valid.valid, 'Should pass with required params');
    
    await bridge.shutdown();
    registry.destroy();
  });

  console.log('\n=== MCPNodeManager 测试 ===\n');

  await test('MCPNodeManager 可以转换工具名', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'filesystem', command: 'mock', args: [], env: {} });
    const registry = new MCPToolRegistry();
    registry.initialize(bridge);
    await registry.refresh();
    const nodeManager = new MCPNodeManager(bridge, registry);
    const nodeType = nodeManager.getNodeType('filesystem:read_file');
    assert(nodeType === 'mcp.filesystem.read_file', 'Should convert name');
    await bridge.shutdown();
    registry.destroy();
    nodeManager.destroy();
  });

  await test('MCPNodeManager 可以反向转换', async () => {
    const bridge = new MCPBridge();
    await bridge.register({ name: 'filesystem', command: 'mock', args: [], env: {} });
    const registry = new MCPToolRegistry();
    registry.initialize(bridge);
    await registry.refresh();
    const nodeManager = new MCPNodeManager(bridge, registry);
    const toolName = nodeManager.getToolFromNodeType('mcp.filesystem.read_file');
    assert(toolName === 'filesystem:read_file', 'Should convert back');
    await bridge.shutdown();
    registry.destroy();
    nodeManager.destroy();
  });

  console.log('\n=== AgentLoop MCP 集成测试 ===\n');

  await test('AgentLoop 有 MCP 操作', async () => {
    delete require.cache[require.resolve('../src/agent/AgentLoop')];
    const AgentLoop = require('../src/agent/AgentLoop');
    const agentLoop = new AgentLoop();
    assert(agentLoop._allowedActions.has('mcpCall'), 'Should have mcpCall');
    assert(agentLoop._allowedActions.has('batchMCPCall'), 'Should have batchMCPCall');
  });

  await test('AgentLoop 可以生成工具部分', async () => {
    delete require.cache[require.resolve('../src/agent/AgentLoop')];
    const AgentLoop = require('../src/agent/AgentLoop');
    const agentLoop = new AgentLoop();
    const section = agentLoop._getMCPToolsSection();
    assert(typeof section === 'string', 'Should return string');
  });

  console.log('\n=== MCPPermissionManager 测试 ===\n');

  await test('MCPPermissionManager 可以创建实例', async () => {
    const pm = new MCPPermissionManager();
    assert(pm !== null, 'Should create instance');
    pm.destroy();
  });

  await test('MCPPermissionManager admin 可以访问所有工具', async () => {
    const pm = new MCPPermissionManager();
    const result = pm.checkToolAccess('github:create_issue', 'admin');
    assert(result.allowed === true, 'Admin should have access');
    pm.destroy();
  });

  await test('MCPPermissionManager viewer 不能访问 write 工具', async () => {
    const pm = new MCPPermissionManager();
    const result = pm.checkToolAccess('github:create_issue', 'viewer');
    assert(result.allowed === false, 'Viewer should not have access');
    pm.destroy();
  });

  await test('MCPPermissionManager 可以设置工具权限', async () => {
    const pm = new MCPPermissionManager();
    pm.setToolPermission('custom:test', 'admin');
    const result = pm.checkToolAccess('custom:test', 'admin');
    assert(result.allowed === true, 'Admin should have access to custom tool');
    pm.destroy();
  });

  await test('MCPPermissionManager 可以审计工具访问', async () => {
    const pm = new MCPPermissionManager();
    pm.checkToolAccess('github:create_issue', 'admin');
    const logs = pm.getAuditLog();
    assert(logs.length > 0, 'Should have audit logs');
    pm.destroy();
  });

  console.log('\n=== 测试结果 ===\n');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
