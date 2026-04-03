/**
 * MCP 集成启动器
 * 
 * 将 MCP 服务集成到现有系统中
 * 使用方式: node scripts/start-mcp.js
 */

const { MCPPlugin } = require('../src/mcp/MCPPlugin');
const { NodeWorkflowEngine } = require('../src/workflow/NodeWorkflowEngine');
const { AgentLoop } = require('../src/agent/AgentLoop');
const { EventEmitter } = require('events');

class MCPIntegration {
  constructor(options = {}) {
    this.plugin = null;
    this.workflowEngine = null;
    this.agentLoop = null;
    this.options = options;
    this.ready = false;
  }

  async initialize() {
    console.log('[MCP] 初始化 MCP 集成...');

    this.plugin = new MCPPlugin({
      configPath: this.options.configPath || './config/mcp-servers.json',
      autoRefreshInterval: this.options.autoRefreshInterval || 60000
    });

    const loadResult = await this.plugin.onLoad();
    
    if (!loadResult.success) {
      console.error('[MCP] 加载失败:', loadResult.error);
      return false;
    }

    this.workflowEngine = new NodeWorkflowEngine();
    await this.plugin.registerWorkflowEngine(this.workflowEngine);

    this.agentLoop = new AgentLoop({
      llmAdapter: this.options.llmAdapter || {
        generate: async (prompt) => {
          return JSON.stringify({
            analysis: '使用 MCP 工具完成任务',
            plan: ['mcpCall'],
            reasoning: '通过 MCP 工具调用执行操作',
            nextAction: { type: 'complete', params: { result: '任务完成' } }
          });
        }
      }
    });
    
    await this.plugin.registerAgentLoop(this.agentLoop);

    this._setupEventHandlers();
    this.ready = true;

    console.log('[MCP] MCP 集成就绪');
    console.log(`[MCP] 服务器: ${this.plugin.getStatus().servers ? Object.keys(this.plugin.getStatus().servers).length : 0}`);
    console.log(`[MCP] 工具: ${this.plugin.getStatus().tools}`);
    console.log(`[MCP] 节点: ${this.plugin.getStatus().nodes}`);

    return true;
  }

  _setupEventHandlers() {
    this.plugin.on('server-registered', ({ name, toolsCount }) => {
      console.log(`[MCP] 服务器注册: ${name} (${toolsCount} 工具)`);
    });

    this.plugin.on('server-unregistered', ({ name }) => {
      console.log(`[MCP] 服务器注销: ${name}`);
    });

    this.plugin.on('circuit-breaker-opened', ({ server }) => {
      console.warn(`[MCP] 熔断器打开: ${server}`);
    });

    this.plugin.on('circuit-breaker-half-open', ({ server }) => {
      console.log(`[MCP] 熔断器半开: ${server}`);
    });

    this.plugin.on('client-error', ({ server, error }) => {
      console.error(`[MCP] 客户端错误 [${server}]:`, error.message);
    });

    this.plugin.on('reconnecting', ({ server, attempt, delay }) => {
      console.log(`[MCP] 重连中 [${server}]: 尝试 ${attempt}, 等待 ${delay}ms`);
    });

    this.plugin.on('reconnected', ({ server }) => {
      console.log(`[MCP] 已重连: ${server}`);
    });
  }

  async executeTool(toolFullName, params) {
    if (!this.ready) {
      throw new Error('MCP 集成未就绪');
    }
    return this.plugin.executeTool(toolFullName, params);
  }

  async batchExecute(calls) {
    if (!this.ready) {
      throw new Error('MCP 集成未就绪');
    }
    return this.plugin.bridge.batchCall(calls);
  }

  getAgentLoop() {
    return this.agentLoop;
  }

  getWorkflowEngine() {
    return this.workflowEngine;
  }

  getPlugin() {
    return this.plugin;
  }

  getTools() {
    if (!this.plugin) return [];
    return this.plugin.getAvailableTools();
  }

  getToolsForPrompt() {
    if (!this.plugin) return 'No MCP tools available.';
    return this.plugin.getToolsForPrompt({ includeSchema: true });
  }

  async shutdown() {
    console.log('[MCP] 关闭 MCP 集成...');
    if (this.plugin) {
      await this.plugin.onUnload();
    }
    this.ready = false;
    console.log('[MCP] MCP 集成已关闭');
  }
}

async function main() {
  const mcp = new MCPIntegration({
    configPath: process.argv[2] || './config/mcp-servers.json'
  });

  const success = await mcp.initialize();
  
  if (!success) {
    console.error('[MCP] 初始化失败');
    process.exit(1);
  }

  console.log('\n[MCP] 测试工具调用...');
  
  try {
    const status = mcp.getPlugin().getStatus();
    console.log('\n=== MCP 状态 ===');
    console.log(JSON.stringify(status, null, 2));

    const tools = mcp.getTools();
    console.log(`\n可用工具 (${tools.length}):`);
    tools.slice(0, 5).forEach(t => {
      console.log(`  - ${t.name}: ${t.description}`);
    });

    console.log('\n=== 工具提示词 ===');
    console.log(mcp.getToolsForPrompt().substring(0, 500) + '...\n');

  } catch (error) {
    console.error('[MCP] 测试失败:', error.message);
  }

  process.on('SIGINT', async () => {
    console.log('\n[MCP] 收到中断信号...');
    await mcp.shutdown();
    process.exit(0);
  });

  setTimeout(async () => {
    console.log('\n[MCP] 演示完成，关闭...');
    await mcp.shutdown();
    process.exit(0);
  }, 5000);
}

if (require.main === module) {
  main().catch(error => {
    console.error('[MCP] 错误:', error);
    process.exit(1);
  });
}

module.exports = { MCPIntegration, MCPPlugin };
