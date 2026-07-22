/**
 * 多Agent团队全面检查脚本
 */

const BrainSystem = require('./src/core/BrainSystem');

async function checkAgents() {
  console.log('\n🤖 === 多Agent团队全面检查开始 === 🤖\n');

  // 1. 检查团队管理器
  if (!BrainSystem.AgentTeamManager) {
    console.log('❌ 错误：找不到 AgentTeamManager');
    return;
  }
  const team = new BrainSystem.AgentTeamManager();
  console.log(`✅ 团队管理器初始化成功`);
  console.log(`📦 团队包含 Agent 数量: ${Object.keys(team._agents).length}`);

  // 2. 检查所有 Agent 实例及其 execute 方法
  const agents = team._agents;
  const agentList = [
    // 分析团队
    'IntentAgent', 'EmotionAgent', 'ContextAgent',
    // 执行团队
    'CodeAgent', 'SearchAgent', 'DebugAgent', 'OptimizeAgent', 'TestAgent',
    // 审核团队
    'QualityAgent', 'SecurityAgent', 'EffectAgent',
    // 学习团队
    'SummaryAgent', 'ImprovementAgent', 'KnowledgeAgent'
  ];

  console.log('\n📋 --- Agent 身份与能力验证 ---');
  let allGood = true;
  
  for (const name of agentList) {
    const agent = agents[name];
    if (!agent) {
      console.log(`❌ ${name}: 缺失`);
      allGood = false;
      continue;
    }

    // 检查 execute 方法
    if (typeof agent.execute !== 'function') {
      console.log(`❌ ${name}: 没有 execute 方法`);
      allGood = false;
      continue;
    }

    // 尝试执行一个简单任务
    try {
      const result = await agent.execute('验证任务', {});
      console.log(`✅ ${name}: 正常 (返回: ${result.realExecution ? '真实执行' : '响应'})`);
    } catch (e) {
      console.log(`⚠️ ${name}: 执行报错 (${e.message})`);
    }
  }

  // 3. 检查自动化处理接口
  console.log('\n🔄 --- 自动化接口检查 ---');
  const autoResult = await BrainSystem.autoAgentProcess('全面检查测试');
  if (autoResult && autoResult.manager) {
    console.log(`✅ autoAgentProcess: 正常 (${autoResult.manager})`);
    console.log(`   处理耗时: ${autoResult.totalTime}ms`);
    console.log(`   参与 Agent: ${autoResult.agentsUsed} 个`);
  } else {
    console.log('❌ autoAgentProcess: 响应异常');
  }

  console.log('\n🏁 === 检查结束 === 🏁\n');
}

checkAgents().catch(console.error);
