/**
 * MCP 集成使用示例
 */

const { MCPPlugin } = require('../src/mcp/MCPPlugin');
const { NodeWorkflowEngine } = require('../src/workflow/NodeWorkflowEngine');
const { AgentLoop } = require('../src/agent/AgentLoop');

async function main() {
  console.log('=== MCP 集成示例 ===\n');

  const plugin = new MCPPlugin({
    configPath: './config/mcp-servers.json',
    enableWorkflowIntegration: true,
    enableAgentIntegration: true
  });

  await plugin.onLoad();
  console.log('MCP 插件已加载');
  console.log('状态:', plugin.getStatus());

  const tools = plugin.getAvailableTools({ includeSchema: true });
  console.log(`\n可用工具数量: ${tools.length}`);
  
  if (tools.length > 0) {
    console.log('\n前 5 个工具:');
    tools.slice(0, 5).forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
  }

  const workflowEngine = new NodeWorkflowEngine();
  await plugin.registerWorkflowEngine(workflowEngine);
  console.log('\n已注册到工作流引擎');
  console.log('节点类型:', workflowEngine.getAllNodeTypes().map(n => n.type).join(', '));

  const agentLoop = new AgentLoop({
    llmAdapter: {
      generate: async (prompt) => {
        return JSON.stringify({
          analysis: '示例分析',
          plan: ['complete'],
          reasoning: '示例推理',
          nextAction: { type: 'complete', params: { result: '任务完成' } }
        });
      }
    }
  });
  
  await plugin.registerAgentLoop(agentLoop);
  console.log('\n已注册到 AgentLoop');

  console.log('\n系统提示词中的 MCP 工具部分:');
  console.log(plugin.getToolsForPrompt({ includeSchema: true }).substring(0, 1000) + '...\n');

  if (plugin.mcpBridge) {
    const result = await plugin.mcpBridge.call('sequential-thinking:think', {
      thought: '我应该使用 MCP 工具来帮助我思考这个问题'
    });
    console.log('MCP 调用结果:', JSON.stringify(result, null, 2).substring(0, 500));
  }

  console.log('\n=== 清理资源 ===');
  await plugin.onUnload();
  console.log('MCP 插件已卸载');
}

main().catch(console.error);
