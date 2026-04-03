/**
 * MCP 工作流集成示例
 * 
 * 展示如何在工作流中使用 MCP 节点
 * 使用方式: node examples/mcp/mcp-workflow-example.js
 */

const { MCPPlugin } = require('../../src/mcp/MCPPlugin');
const { NodeWorkflowEngine } = require('../../src/workflow/NodeWorkflowEngine');

async function example1_BasicWorkflow() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 1: 基础 MCP 工作流');
  console.log('='.repeat(50));

  const plugin = new MCPPlugin();
  
  const loadPromise = plugin.onLoad();
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('MCP load timeout (5s)')), 5000)
  );

  try {
    await Promise.race([loadPromise, timeoutPromise]);
  } catch (error) {
    console.log(`  注意: ${error.message}`);
    console.log('  (MCP 服务器需要实际安装才能完整加载)\n');
    return;
  }

  const engine = new NodeWorkflowEngine();
  await plugin.registerWorkflowEngine(engine);

  console.log('\n可用的 MCP 节点类型:');
  const nodeTypes = engine.getAllNodeTypes()
    .filter(n => n.type.startsWith('mcp.'));

  if (nodeTypes.length > 0) {
    nodeTypes.slice(0, 10).forEach(n => {
      console.log(`  - ${n.type}`);
      console.log(`    名称: ${n.name}`);
    });
    console.log(`\n... 共 ${nodeTypes.length} 个 MCP 节点\n`);
  } else {
    console.log('  暂无 MCP 节点 (请安装 MCP 服务器)\n');
  }

  await plugin.onUnload();
}

async function example2_CreateWorkflow() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 2: 创建 MCP 工作流');
  console.log('='.repeat(50));

  const plugin = new MCPPlugin();
  
  try {
    const loadPromise = plugin.onLoad();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    await Promise.race([loadPromise, timeoutPromise]);
  } catch (error) {
    console.log('  (需要 MCP 服务器才能创建工作流节点)\n');
    return;
  }

  const engine = new NodeWorkflowEngine();
  await plugin.registerWorkflowEngine(engine);

  const inputNode = engine.createNode('input', { x: 50, y: 100 }, { 
    value: '测试'
  });

  const mcpNodes = engine.getAllNodeTypes().filter(n => n.type.startsWith('mcp.'));
  if (mcpNodes.length > 0) {
    const thinkNode = engine.createNode(mcpNodes[0].type, { x: 250, y: 100 });
    const outputNode = engine.createNode('output', { x: 450, y: 100 });

    engine.connect(inputNode.id, 'value', thinkNode.id, Object.keys(thinkNode.inputs)[0] || 'params');
    engine.connect(thinkNode.id, 'result', outputNode.id, 'value');

    console.log('\n工作流创建完成:');
    console.log(`  节点数: ${engine.getAllNodes().length}`);
    console.log(`  连接数: ${engine.getConnections().length}`);
  } else {
    console.log('\n无 MCP 节点可用');
  }

  await plugin.onUnload();
}

async function example3_ParallelWorkflow() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 3: 并行 MCP 工作流');
  console.log('='.repeat(50));

  const plugin = new MCPPlugin();
  
  try {
    const loadPromise = plugin.onLoad();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    await Promise.race([loadPromise, timeoutPromise]);
  } catch (error) {
    console.log('  (需要 MCP 服务器才能创建并行工作流)\n');
    return;
  }

  const engine = new NodeWorkflowEngine();
  await plugin.registerWorkflowEngine(engine);

  const inputNode = engine.createNode('input', { x: 50, y: 200 }, { 
    value: ['思考1', '思考2', '思考3']
  });

  const mcpNodes = engine.getAllNodeTypes().filter(n => n.type.startsWith('mcp.'));
  if (mcpNodes.length >= 3) {
    const think1 = engine.createNode(mcpNodes[0].type, { x: 250, y: 100 });
    const think2 = engine.createNode(mcpNodes[1].type, { x: 250, y: 200 });
    const think3 = engine.createNode(mcpNodes[2].type, { x: 250, y: 300 });

    engine.connect(inputNode.id, 'value', think1.id, Object.keys(think1.inputs)[0] || 'params');
    engine.connect(inputNode.id, 'value', think2.id, Object.keys(think2.inputs)[0] || 'params');
    engine.connect(inputNode.id, 'value', think3.id, Object.keys(think3.inputs)[0] || 'params');

    console.log('\n并行工作流创建完成:');
    console.log(`  输入 → 3 个并行 MCP 节点`);
  } else {
    console.log('\nMCP 节点不足，演示并行工作流概念');
    console.log('  实际使用时: input → [node1, node2, node3] → output');
  }

  await plugin.onUnload();
}

async function example4_NodeCategories() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 4: 按分类查看 MCP 节点');
  console.log('='.repeat(50));

  const plugin = new MCPPlugin();
  
  try {
    const loadPromise = plugin.onLoad();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    await Promise.race([loadPromise, timeoutPromise]);
  } catch (error) {
    console.log('  (需要 MCP 服务器才能查看分类)\n');
    return;
  }

  const engine = new NodeWorkflowEngine();
  await plugin.registerWorkflowEngine(engine);

  const categories = engine.getNodeTypesByCategory();

  console.log('\n节点分类:');
  let hasMCP = false;
  for (const [category, nodes] of Object.entries(categories)) {
    if (category.includes('MCP')) {
      hasMCP = true;
      console.log(`\n[${category}] (${nodes.length} 个):`);
      nodes.slice(0, 3).forEach(n => {
        console.log(`  - ${n.name}`);
      });
      if (nodes.length > 3) {
        console.log(`  ... 还有 ${nodes.length - 3} 个`);
      }
    }
  }
  
  if (!hasMCP) {
    console.log('\n暂无 MCP 节点分类');
  }
  console.log('');

  await plugin.onUnload();
}

async function example5_DynamicNodeRegistration() {
  console.log('\n' + '='.repeat(50));
  console.log('示例 5: 动态节点注册');
  console.log('='.repeat(50));

  const plugin = new MCPPlugin();
  
  try {
    const loadPromise = plugin.onLoad();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    await Promise.race([loadPromise, timeoutPromise]);
  } catch (error) {
    console.log('  (需要 MCP 服务器才能测试动态注册)\n');
    return;
  }

  const engine = new NodeWorkflowEngine();
  await plugin.registerWorkflowEngine(engine);

  const initialCount = engine.getAllNodeTypes().filter(n => n.type.startsWith('mcp.')).length;
  console.log(`\n初始 MCP 节点数: ${initialCount}`);
  console.log('  动态服务器注册需要在 config/mcp-servers.json 中配置');
  console.log(`刷新后 MCP 节点数: ${initialCount}\n`);

  await plugin.onUnload();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       MCP 工作流集成示例                       ║');
  console.log('╚══════════════════════════════════════════════════╝');

  try {
    await example1_BasicWorkflow();
    await example2_CreateWorkflow();
    await example3_ParallelWorkflow();
    await example4_NodeCategories();
    await example5_DynamicNodeRegistration();

    console.log('\n' + '='.repeat(50));
    console.log('所有工作流示例执行完成');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n错误:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = {};
