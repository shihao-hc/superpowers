/**
 * MCP Agent 集成示例
 * 
 * 展示如何在 Agent 中使用 MCP 工具
 * 使用方式: node examples/mcp/mcp-agent-example.js
 */

const { MCPPlugin } = require('../../src/mcp/MCPPlugin');
const AgentLoop = require('../../src/agent/AgentLoop');

class MCPAgent {
  constructor(options = {}) {
    this.mcpPlugin = null;
    this.agentLoop = null;
    this.name = options.name || 'MCPAgent';
  }

  async initialize(configPath = './config/mcp-servers.json') {
    console.log(`[${this.name}] 初始化...`);

    this.mcpPlugin = new MCPPlugin({ configPath });
    const result = await this.mcpPlugin.onLoad();
    
    if (!result.success) {
      throw new Error(`MCP 初始化失败: ${result.error}`);
    }

    const tools = this.mcpPlugin.getAvailableTools();
    console.log(`[${this.name}] MCP 工具: ${tools.length}`);

    this.agentLoop = new AgentLoop({
      maxIterations: options.maxIterations || 10,
      timeout: options.timeout || 60000,
      llmAdapter: options.llmAdapter || this._createMockAdapter()
    });

    await this.mcpPlugin.registerAgentLoop(this.agentLoop);

    console.log(`[${this.name}] 就绪`);
    return this;
  }

  _createMockAdapter() {
    return {
      generate: async (prompt) => {
        if (prompt.includes('mcpCall') || prompt.includes('MCP')) {
          return JSON.stringify({
            analysis: '我可以使用 MCP 工具来完成任务',
            plan: ['mcpCall'],
            reasoning: 'MCP 工具提供了强大的能力',
            nextAction: {
              type: 'mcpCall',
              params: {
                toolFullName: 'sequential-thinking:think',
                arguments: { thought: '分析任务并执行' }
              }
            }
          });
        }

        return JSON.stringify({
          analysis: '任务分析完成',
          plan: ['complete'],
          reasoning: '执行完成',
          nextAction: { type: 'complete', params: { result: '任务完成' } }
        });
      }
    };
  }

  async execute(task, context = {}) {
    if (!this.agentLoop) {
      throw new Error('Agent 未初始化');
    }

    console.log(`\n[${this.name}] 执行任务: ${task}`);

    const result = await this.agentLoop.run(task, {
      ...context,
      mcpTools: this.mcpPlugin.getAvailableTools()
    });

    return result;
  }

  async executeTool(toolFullName, params) {
    return this.mcpPlugin.executeTool(toolFullName, params);
  }

  async batchExecute(calls) {
    return this.mcpPlugin.bridge.batchCall(calls);
  }

  getAvailableTools() {
    return this.mcpPlugin.getAvailableTools();
  }

  getToolsForPrompt() {
    return this.mcpPlugin.getToolsForPrompt({ includeSchema: true });
  }

  async shutdown() {
    if (this.mcpPlugin) {
      await this.mcpPlugin.onUnload();
    }
    console.log(`[${this.name}] 已关闭`);
  }
}

async function example1_BasicToolCall() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 1: 直接工具调用');
  console.log('='.repeat(50));

  const agent = new MCPAgent({ name: 'BasicToolAgent' });

  try {
    await agent.initialize();

    const result = await agent.executeTool('sequential-thinking:think', {
      thought: '我正在测试 MCP 工具调用功能'
    });

    console.log('\n调用结果:');
    console.log(JSON.stringify(result, null, 2));

  } finally {
    await agent.shutdown();
  }
}

async function example2_BatchToolCall() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 2: 批量工具调用');
  console.log('='.repeat(50));

  const agent = new MCPAgent({ name: 'BatchAgent' });

  try {
    await agent.initialize();

    const calls = [
      { toolFullName: 'sequential-thinking:think', params: { thought: '思考1' } },
      { toolFullName: 'sequential-thinking:think', params: { thought: '思考2' } },
      { toolFullName: 'sequential-thinking:think', params: { thought: '思考3' } }
    ];

    const results = await agent.batchExecute(calls);

    console.log('\n批量调用结果:');
    console.log(`成功: ${results.filter(r => r.success).length}/${results.length}`);
    results.forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.toolFullName}: ${r.success ? '成功' : r.error}`);
    });

  } finally {
    await agent.shutdown();
  }
}

async function example3_AgentTask() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 3: Agent 任务执行');
  console.log('='.repeat(50));

  const agent = new MCPAgent({ 
    name: 'TaskAgent',
    maxIterations: 5
  });

  try {
    await agent.initialize();

    const result = await agent.execute('使用 MCP 工具分析问题');

    console.log('\nAgent 执行结果:');
    console.log(`成功: ${result.success}`);
    console.log(`迭代次数: ${result.iterations}`);
    console.log(`耗时: ${result.duration}ms`);

  } finally {
    await agent.shutdown();
  }
}

async function example4_PromptIntegration() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 4: 提示词集成');
  console.log('='.repeat(50));

  const agent = new MCPAgent({ name: 'PromptAgent' });

  try {
    await agent.initialize();

    const prompt = agent.getToolsForPrompt();

    console.log('\n生成的提示词 (前 1000 字符):');
    console.log(prompt.substring(0, 1000) + '...\n');

  } finally {
    await agent.shutdown();
  }
}

async function example5_NodeWorkflowIntegration() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 5: 工作流节点集成');
  console.log('='.repeat(50));

    const { MCPPlugin } = require('../../src/mcp/MCPPlugin');
    const { NodeWorkflowEngine } = require('../../src/workflow/NodeWorkflowEngine');

  const plugin = new MCPPlugin();
  await plugin.onLoad();

  const engine = new NodeWorkflowEngine();
  await plugin.registerWorkflowEngine(engine);

  console.log('\n工作流引擎节点类型:');
  const mcpNodes = engine.getAllNodeTypes()
    .filter(n => n.type.startsWith('mcp.'))
    .slice(0, 10);

  console.log(`MCP 节点 (${mcpNodes.length}):`);
  mcpNodes.forEach(n => {
    console.log(`  - ${n.type}: ${n.name}`);
  });

  const workflow = engine.createNode('input', { x: 100, y: 100 }, { value: '测试' });
  const mcpNode = engine.createNode('mcp.sequential-thinking.think', { x: 300, y: 100 });
  const output = engine.createNode('output', { x: 500, y: 100 });

  engine.connect(workflow.id, 'value', mcpNode.id, 'thought');
  engine.connect(mcpNode.id, 'result', output.id, 'value');

  console.log('\n创建的工作流:');
  console.log(`  节点: ${engine.getAllNodes().length}`);
  console.log(`  连接: ${engine.getConnections().length}`);

  await plugin.onUnload();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       MCP Agent 集成示例                        ║');
  console.log('╚══════════════════════════════════════════════════╝');

  try {
    await example1_BasicToolCall();
    await example2_BatchToolCall();
    await example3_AgentTask();
    await example4_PromptIntegration();
    await example5_NodeWorkflowIntegration();

    console.log('\n' + '='.repeat(50));
    console.log('所有示例执行完成');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n错误:', error.message);
    console.error(error.stack);
  }
}

if (require.main === module) {
  main();
}

module.exports = { MCPAgent };
