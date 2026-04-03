/**
 * MCP 示例工作流
 * 
 * 工作流：读取本地日志 → 分析错误 → 创建 GitHub Issue
 * 
 * 使用方式: node examples/mcp/mcp-log-analysis-workflow.js
 */

const { MCPPlugin } = require('../../src/mcp/MCPPlugin');
const { NodeWorkflowEngine } = require('../../src/workflow/NodeWorkflowEngine');

class LogAnalysisWorkflow {
  constructor() {
    this.plugin = null;
    this.engine = null;
    this.results = {};
  }

  async initialize() {
    console.log('[Workflow] 初始化日志分析工作流...\n');

    this.plugin = new MCPPlugin();
    
    try {
      await Promise.race([
        this.plugin.onLoad(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
    } catch (error) {
      console.warn('[Workflow] MCP 初始化跳过（需要真实 MCP 服务器）');
    }

    this.engine = new NodeWorkflowEngine({
      onNodeExecute: ({ nodeId, type, result }) => {
        console.log(`  [执行] ${type}: ${JSON.stringify(result).substring(0, 100)}...`);
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

  createWorkflow(logFilePath = '/tmp/app.log', options = {}) {
    console.log('='.repeat(60));
    console.log('创建工作流：日志分析 → 问题创建');
    console.log('='.repeat(60));
    console.log(`日志文件: ${logFilePath}\n`);

    this.engine.nodes.clear();
    this.engine.connections = [];

    const inputNode = this.engine.createNode('input', { x: 50, y: 100 }, {
      value: logFilePath
    });

    const readLogNode = this.engine.createNode('mcp.filesystem.read_file', { x: 250, y: 100 }, {
      path: logFilePath
    });

    const analyzeNode = this.engine.createNode('mcp.sequential-thinking.think', { x: 450, y: 100 }, {
      thought: `分析以下日志内容，识别错误模式：${options.context || ''}`
    });

    const outputNode = this.engine.createNode('output', { x: 650, y: 100 });

    this.engine.connect(inputNode.id, 'value', readLogNode.id, 'path');
    this.engine.connect(readLogNode.id, 'result', analyzeNode.id, 'thought');
    this.engine.connect(analyzeNode.id, 'result', outputNode.id, 'value');

    console.log('节点:');
    this.engine.getAllNodes().forEach((node, i) => {
      console.log(`  ${i + 1}. [${node.type}] ${node.name}`);
    });
    console.log(`\n连接: ${this.engine.getConnections().length} 条`);
    console.log('');

    return this;
  }

  async execute() {
    console.log('开始执行工作流...\n');
    
    const execution = await this.engine.execute('log-analysis');
    
    return execution;
  }

  getResults() {
    const nodes = this.engine.getAllNodes();
    const results = {};
    
    for (const node of nodes) {
      results[node.type] = {
        outputs: node.outputs.reduce((acc, o) => ({ ...acc, [o.name]: o.value }), {})
      };
    }
    
    return results;
  }

  async shutdown() {
    if (this.plugin) {
      await this.plugin.onUnload();
    }
  }
}

class GitHubIssueWorkflow {
  constructor() {
    this.plugin = null;
  }

  async initialize() {
    this.plugin = new MCPPlugin();
    
    try {
      await Promise.race([
        this.plugin.onLoad(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
    } catch (error) {
      console.warn('[Workflow] MCP 初始化跳过');
    }

    return this;
  }

  async createIssueFromAnalysis(analysis, options = {}) {
    console.log('='.repeat(60));
    console.log('创建 GitHub Issue 工作流');
    console.log('='.repeat(60));

    const title = options.title || `日志分析报告 - ${new Date().toISOString().split('T')[0]}`;
    const repo = options.repo || 'owner/repo';
    
    const body = `
## 日志分析报告

### 分析时间
${new Date().toISOString()}

### 分析内容
${analysis.substring(0, 5000)}

### 建议
${options.recommendations || '请查看上述分析内容'}

---
*由 MCP 工作流自动生成*
`.trim();

    console.log(`仓库: ${repo}`);
    console.log(`标题: ${title}`);
    console.log(`正文长度: ${body.length} 字符\n`);

    if (!this.plugin || !this.plugin.bridge) {
      console.log('[Workflow] MCP Bridge 不可用，跳过实际调用');
      return {
        success: false,
        message: 'MCP Bridge not available',
        simulated: true,
        data: { repo, title, body }
      };
    }

    try {
      const result = await this.plugin.executeTool('github:create_issue', {
        repo,
        title,
        body
      });

      console.log('[Workflow] Issue 创建成功!');
      console.log(JSON.stringify(result, null, 2).substring(0, 500));

      return { success: true, result };
    } catch (error) {
      console.error('[Workflow] Issue 创建失败:', error.message);
      return { success: false, error: error.message };
    }
  }

  async shutdown() {
    if (this.plugin) {
      await this.plugin.onUnload();
    }
  }
}

async function demo_LogReadWorkflow() {
  console.log('\n' + '═'.repeat(60));
  console.log('演示 1: 读取日志文件工作流');
  console.log('═'.repeat(60) + '\n');

  const workflow = new LogAnalysisWorkflow();
  await workflow.initialize();
  
  workflow.createWorkflow('/tmp/app.log', {
    context: '应用启动日志，查找 ERROR 和 WARNING'
  });

  const results = workflow.getResults();
  console.log('\n工作流结构预览:');
  console.log('  input (日志路径)');
  console.log('    ↓');
  console.log('  mcp.filesystem.read_file (读取日志)');
  console.log('    ↓');
  console.log('  mcp.sequential-thinking.think (分析错误)');
  console.log('    ↓');
  console.log('  output (输出结果)');

  await workflow.shutdown();
  return results;
}

async function demo_CreateIssueWorkflow() {
  console.log('\n' + '═'.repeat(60));
  console.log('演示 2: 创建 GitHub Issue 工作流');
  console.log('═'.repeat(60) + '\n');

  const workflow = new GitHubIssueWorkflow();
  await workflow.initialize();

  const sampleAnalysis = `
检测到以下问题:

1. **ERROR: Connection timeout** - 数据库连接超时
   - 发生次数: 15次/小时
   - 可能原因: 数据库负载过高或网络问题
   
2. **WARNING: Memory usage high** - 内存使用率超过 80%
   - 当前使用: 4.2GB / 8GB
   
3. **ERROR: Null pointer exception** - 空指针异常
   - 位置: com.app.service.UserService:142
   - 影响: 用户登录功能

建议措施:
1. 增加数据库连接池大小
2. 优化内存使用，考虑增加内存或优化缓存
3. 检查 UserService 中的空值处理逻辑
`.trim();

  const result = await workflow.createIssueFromAnalysis(sampleAnalysis, {
    repo: 'myorg/myapp',
    title: '[自动] 日志分析报告 - 需处理的问题',
    recommendations: '请相关开发人员尽快处理上述问题'
  });

  await workflow.shutdown();
  return result;
}

async function demo_FullPipeline() {
  console.log('\n' + '═'.repeat(60));
  console.log('演示 3: 完整流水线 (日志 → 分析 → Issue)');
  console.log('═'.repeat(60) + '\n');

  const workflow = new LogAnalysisWorkflow();
  await workflow.initialize();
  
  workflow.createWorkflow('/var/log/app.log', {
    context: '生产环境应用日志'
  });

  console.log('步骤 1: 读取日志');
  console.log('  → 读取 /var/log/app.log');
  
  console.log('\n步骤 2: 分析错误');
  console.log('  → 使用 sequential-thinking 进行深度分析');
  
  console.log('\n步骤 3: 创建 Issue');
  console.log('  → 如果检测到关键错误，自动创建 GitHub Issue');

  console.log('\n完整流水线已创建。');
  console.log('在生产环境中，这将:');
  console.log('  1. 自动读取日志文件');
  console.log('  2. 使用 AI 分析错误模式');
  console.log('  3. 为每个检测到的问题创建 Issue');

  await workflow.shutdown();
}

async function demo_WorkflowTemplate() {
  console.log('\n' + '═'.repeat(60));
  console.log('演示 4: 工作流模板');
  console.log('═'.repeat(60) + '\n');

  const templates = [
    {
      name: '日志监控告警',
      icon: '📊',
      steps: [
        { type: 'input', desc: '日志路径' },
        { type: 'mcp.filesystem.read_file', desc: '读取日志' },
        { type: 'mcp.sequential-thinking.think', desc: 'AI 分析' },
        { type: 'condition', desc: '是否需要告警?' },
        { type: 'mcp.github.create_issue', desc: '创建 Issue' }
      ]
    },
    {
      name: '代码审查助手',
      icon: '🔍',
      steps: [
        { type: 'input', desc: 'GitHub PR URL' },
        { type: 'mcp.github.get_pull_request', desc: '获取 PR 信息' },
        { type: 'mcp.sequential-thinking.think', desc: '分析代码' },
        { type: 'mcp.github.create_review_comment', desc: '添加评论' }
      ]
    },
    {
      name: '数据采集报告',
      icon: '📈',
      steps: [
        { type: 'input', desc: '数据源配置' },
        { type: 'mcp.filesystem.list_directory', desc: '列出文件' },
        { type: 'loop', desc: '遍历处理' },
        { type: 'mcp.filesystem.read_file', desc: '读取数据' },
        { type: 'output', desc: '生成报告' }
      ]
    }
  ];

  console.log('可用工作流模板:\n');
  
  templates.forEach((t, i) => {
    console.log(`${i + 1}. ${t.icon} ${t.name}`);
    t.steps.forEach((s, j) => {
      console.log(`   ${j + 1}. ${s.type}: ${s.desc}`);
    });
    console.log('');
  });

  return templates;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     MCP 工作流示例 - 日志分析 & GitHub Issue 创建         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await demo_LogReadWorkflow();
    await demo_CreateIssueWorkflow();
    await demo_FullPipeline();
    await demo_WorkflowTemplate();

    console.log('\n' + '='.repeat(60));
    console.log('所有演示完成!');
    console.log('='.repeat(60));
    console.log('\n下一步:');
    console.log('  1. 配置真实的 MCP 服务器 (config/mcp-servers.json)');
    console.log('  2. 设置 GITHUB_TOKEN 环境变量');
    console.log('  3. 访问 /mcp-market 查看可用工具');
    console.log('  4. 在工作流编辑器中拖拽 MCP 节点\n');

  } catch (error) {
    console.error('\n错误:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { LogAnalysisWorkflow, GitHubIssueWorkflow };
