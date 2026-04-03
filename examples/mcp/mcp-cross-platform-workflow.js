/**
 * MCP 工作流示例 - 跨平台自动化
 * 
 * 工作流：监控仓库 Issue → 读取本地日志 → AI分析 → 生成报告
 * 
 * 使用方式: node examples/mcp/mcp-cross-platform-workflow.js
 */

const { MCPPlugin } = require('../../src/mcp/MCPPlugin');
const { NodeWorkflowEngine } = require('../../src/workflow/NodeWorkflowEngine');
const { MCPPermissionManager } = require('../../src/mcp/MCPPermissionManager');

const WORKFLOW_TEMPLATES = [
  {
    id: 'log-monitor',
    name: '日志监控告警',
    icon: '📊',
    description: '监控日志文件，分析错误，创建GitHub Issue',
    category: 'devops',
    steps: [
      { node: 'input', desc: '日志路径输入' },
      { node: 'mcp.filesystem.read_file', desc: '读取日志文件' },
      { node: 'mcp.sequential-thinking.think', desc: 'AI错误分析' },
      { node: 'condition', desc: '判断错误严重性' },
      { node: 'mcp.github.create_issue', desc: '创建GitHub Issue' },
      { node: 'mcp.filesystem.write_file', desc: '保存分析报告' }
    ]
  },
  {
    id: 'github-monitor',
    name: 'GitHub监控报表',
    icon: '🐙',
    description: '监控仓库Issue状态，生成统计报表',
    category: 'devops',
    steps: [
      { node: 'input', desc: '仓库信息输入' },
      { node: 'mcp.github.search_repositories', desc: '搜索仓库' },
      { node: 'mcp.github.list_issues', desc: '获取Issue列表' },
      { node: 'mcp.sequential-thinking.think', desc: '趋势分析' },
      { node: 'llm_call', desc: '生成统计报表' },
      { node: 'mcp.filesystem.write_file', desc: '保存报表' }
    ]
  },
  {
    id: 'research-report',
    name: '智能研究报告',
    icon: '🔬',
    description: '网络搜索与本地数据融合，生成研究报告',
    category: 'research',
    steps: [
      { node: 'input', desc: '搜索关键词输入' },
      { node: 'mcp.brave-search.search', desc: 'Brave网络搜索' },
      { node: 'mcp.filesystem.read_file', desc: '读取本地数据' },
      { node: 'mcp.sequential-thinking.think', desc: '深度分析' },
      { node: 'llm_call', desc: '生成研究报告' },
      { node: 'mcp.filesystem.write_file', desc: '保存报告' }
    ]
  },
  {
    id: 'code-review',
    name: '代码审查助手',
    icon: '🔍',
    description: '自动审查代码变更，生成审查意见',
    category: 'development',
    steps: [
      { node: 'input', desc: 'PR URL输入' },
      { node: 'mcp.github.get_pull_request', desc: '获取PR信息' },
      { node: 'mcp.filesystem.read_file', desc: '读取代码文件' },
      { node: 'mcp.sequential-thinking.think', desc: '代码分析' },
      { node: 'mcp.github.create_review_comment', desc: '添加审查意见' }
    ]
  }
];

class CrossPlatformWorkflow {
  constructor(options = {}) {
    this.plugin = null;
    this.engine = null;
    this.permissionManager = options.permissionManager || new MCPPermissionManager();
    this.userRole = options.userRole || 'operator';
    this.results = {};
    this.executionLog = [];
  }

  async initialize() {
    console.log('[Workflow] 初始化跨平台自动化工作流...\n');

    this.plugin = new MCPPlugin({
      configPath: options.configPath || 'config/mcp-servers.json'
    });

    try {
      await Promise.race([
        this.plugin.onLoad(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
    } catch (error) {
      console.warn('[Workflow] MCP 初始化跳过（需要真实服务器）');
    }

    this.engine = new NodeWorkflowEngine({
      onNodeExecute: ({ nodeId, type, result, duration }) => {
        const log = {
          timestamp: Date.now(),
          nodeId,
          type,
          duration,
          status: 'success'
        };
        this.executionLog.push(log);
        console.log(`  [${type}] 耗时: ${duration}ms`);
      },
      onWorkflowComplete: (execution) => {
        console.log(`\n[Workflow] 完成: ${execution.status}`);
      },
      onError: (error) => {
        console.error('[Workflow] 错误:', error.message);
      }
    });

    if (this.plugin) {
      await this.plugin.registerWorkflowEngine(this.engine);
    }

    console.log('[Workflow] 初始化完成\n');
    return this;
  }

  checkPermission(toolFullName) {
    const result = this.permissionManager.checkToolAccess(toolFullName, this.userRole);
    console.log(`[权限检查] ${toolFullName} (${this.userRole}): ${result.allowed ? '✓' : '✗'}`);
    return result;
  }

  listAvailableTools() {
    if (!this.plugin || !this.plugin.registry) {
      return [];
    }

    const tools = this.plugin.registry.getTools();
    return tools.map(tool => {
      const permission = this.checkPermission(`${tool.server}:${tool.name}`);
      return {
        ...tool,
        accessible: permission.allowed,
        reason: permission.reason
      };
    });
  }

  createWorkflow(templateId, context = {}) {
    const template = WORKFLOW_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    console.log('='.repeat(60));
    console.log(`创建工作流: ${template.icon} ${template.name}`);
    console.log('='.repeat(60));

    this.engine.nodes.clear();
    this.engine.connections = [];

    let xOffset = 50;
    const yPositions = [100, 200, 300];
    let nodeId = 0;

    for (const step of template.steps) {
      const isMCP = step.node.startsWith('mcp.');
      const displayName = isMCP ? step.node.replace('mcp.', '') : step.node;

      if (isMCP) {
        const [server, tool] = step.node.replace('mcp.', '').split('.');
        const toolFullName = `${server}:${tool}`;
        const permission = this.checkPermission(toolFullName);

        if (!permission.allowed) {
          console.log(`  [跳过] ${step.desc} - 无权限`);
          continue;
        }
      }

      const node = this.engine.createNode(step.node, { x: xOffset, y: yPositions[nodeId % 3] }, context);
      console.log(`  [添加] ${step.desc} (${step.node})`);
      xOffset += 200;
      nodeId++;
    }

    console.log(`\n工作流创建完成，共 ${this.engine.getAllNodes().length} 个节点\n`);
    return this;
  }

  async execute(context = {}) {
    console.log('开始执行工作流...\n');

    const startTime = Date.now();

    try {
      for (const node of this.engine.getAllNodes()) {
        const nodeStart = Date.now();

        if (node.type === 'input') {
          node.outputs[0].value = context.value || '';
        }

        if (node.type.startsWith('mcp.')) {
          const [server, tool] = node.type.replace('mcp.', '').split('.');
          const toolFullName = `${server}:${tool}`;

          if (!this.plugin || !this.plugin.bridge) {
            console.log(`  [模拟] ${toolFullName}`);
            node.outputs[0].value = { simulated: true, toolFullName };
          } else {
            try {
              const result = await this.plugin.executeTool(toolFullName, node.inputs.reduce((acc, i) => ({ ...acc, [i.name]: i.value || context[i.name] }), {}));
              node.outputs[0].value = result;
            } catch (error) {
              console.log(`  [错误] ${toolFullName}: ${error.message}`);
              node.outputs[0].value = { error: error.message };
            }
          }
        }

        const duration = Date.now() - nodeStart;
        console.log(`  [完成] ${node.type} (${duration}ms)`);
      }

      const totalDuration = Date.now() - startTime;
      console.log(`\n工作流执行完成，耗时: ${totalDuration}ms`);

      return {
        success: true,
        duration: totalDuration,
        nodes: this.engine.getAllNodes().length,
        log: this.executionLog
      };

    } catch (error) {
      console.error('工作流执行失败:', error.message);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  getResults() {
    return this.engine.getAllNodes().map(node => ({
      type: node.type,
      outputs: node.outputs.reduce((acc, o) => ({ ...acc, [o.name]: o.value }), {})
    }));
  }

  async shutdown() {
    if (this.plugin) {
      await this.plugin.onUnload();
    }
    this.permissionManager.destroy();
  }
}

async function demo_ListWorkflows() {
  console.log('\n' + '═'.repeat(60));
  console.log('可用工作流模板');
  console.log('═'.repeat(60) + '\n');

  const categories = {};
  for (const template of WORKFLOW_TEMPLATES) {
    if (!categories[template.category]) {
      categories[template.category] = [];
    }
    categories[template.category].push(template);
  }

  for (const [category, templates] of Object.entries(categories)) {
    console.log(`【${category.toUpperCase()}】`);
    for (const t of templates) {
      console.log(`  ${t.icon} ${t.name}`);
      console.log(`     ${t.description}`);
      console.log(`     步骤: ${t.steps.map(s => s.desc).join(' → ')}`);
      console.log('');
    }
  }

  return WORKFLOW_TEMPLATES;
}

async function demo_PermissionCheck() {
  console.log('\n' + '═'.repeat(60));
  console.log('角色权限演示');
  console.log('═'.repeat(60) + '\n');

  const pm = new MCPPermissionManager();
  const roles = ['admin', 'operator', 'viewer'];
  const tools = [
    'filesystem:read_file',
    'filesystem:write_file',
    'github:create_issue',
    'github:create_release',
    'brave-search:search'
  ];

  console.log('工具权限矩阵:\n');
  console.log('工具'.padEnd(30) + roles.map(r => r.padEnd(12)).join(''));
  console.log('-'.repeat(70));

  for (const tool of tools) {
    const row = tool.padEnd(30);
    const permissions = roles.map(r => {
      const result = pm.checkToolAccess(tool, r);
      return result.allowed ? '✓' : '✗';
    }).join('');
    console.log(row + permissions);
  }

  console.log('\n说明: ✓ = 有权限, ✗ = 无权限');
  pm.destroy();
}

async function demo_ExecuteWorkflow() {
  console.log('\n' + '═'.repeat(60));
  console.log('执行示例工作流');
  console.log('═'.repeat(60) + '\n');

  const workflow = new CrossPlatformWorkflow({ userRole: 'operator' });
  await workflow.initialize();

  workflow.createWorkflow('log-monitor', {
    logPath: '/var/log/app.log'
  });

  const result = await workflow.execute({
    value: '/var/log/app.log'
  });

  console.log('\n执行结果:');
  console.log(JSON.stringify(result, null, 2));

  await workflow.shutdown();
  return result;
}

async function demo_ToolsForRole() {
  console.log('\n' + '═'.repeat(60));
  console.log('角色可用工具展示');
  console.log('═'.repeat(60) + '\n');

  const workflow = new CrossPlatformWorkflow();
  await workflow.initialize();

  const mockTools = [
    { server: 'filesystem', name: 'read_file', description: '读取文件' },
    { server: 'filesystem', name: 'write_file', description: '写入文件' },
    { server: 'filesystem', name: 'list_directory', description: '列出目录' },
    { server: 'github', name: 'create_issue', description: '创建Issue' },
    { server: 'github', name: 'create_release', description: '创建Release' },
    { server: 'github', name: 'search_repositories', description: '搜索仓库' },
    { server: 'brave-search', name: 'search', description: '网络搜索' },
    { server: 'sequential-thinking', name: 'think', description: 'AI思考' }
  ];

  const roles = ['admin', 'operator', 'viewer'];

  for (const role of roles) {
    workflow.userRole = role;
    console.log(`【${role.toUpperCase()}】可用的工具:`);

    let count = 0;
    for (const tool of mockTools) {
      const result = workflow.checkPermission(`${tool.server}:${tool.name}`);
      if (result.allowed) {
        console.log(`  ✓ ${tool.server}:${tool.name} - ${tool.description}`);
        count++;
      }
    }
    console.log(`  共 ${count} 个工具可用\n`);
  }

  await workflow.shutdown();
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     MCP 跨平台自动化工作流示例                              ║');
  console.log('║     监控 → 分析 → 报告 → 存证                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await demo_ListWorkflows();
    await demo_PermissionCheck();
    await demo_ToolsForRole();
    await demo_ExecuteWorkflow();

    console.log('\n' + '='.repeat(60));
    console.log('演示完成!');
    console.log('='.repeat(60));
    console.log('\n下一步:');
    console.log('  1. 配置 MCP 服务器 (config/mcp-servers.json)');
    console.log('  2. 设置环境变量 (GITHUB_TOKEN, BRAVE_API_KEY)');
    console.log('  3. 在前端创建并执行工作流');
    console.log('  4. 查看 /mcp-market 了解可用工具\n');

  } catch (error) {
    console.error('\n错误:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { CrossPlatformWorkflow, WORKFLOW_TEMPLATES };
