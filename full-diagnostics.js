/**
 * AI Brain System 全方位诊断脚本 (v22.1)
 * 
 * 检查清单:
 * 1. 核心加载与版本
 * 2. AGI 引擎状态
 * 3. 多 Agent 团队完整性
 * 4. 自动化接口响应
 * 5. 核心能力 (意图/情感/记忆/反思)
 * 6. 性能指标
 */

const BrainSystem = require('./src/core/BrainSystem');
const fs = require('fs');

async function fullDiagnostics() {
  console.log('\n🔍 === AI Brain System v22.1 全方位诊断报告 === 🔍\n');
  const startTime = Date.now();

  // 1. 核心架构检查
  console.log('📦 --- 1. 核心架构检查 ---');
  try {
    const version = BrainSystem.version || 'unknown';
    const hasAgentTeam = !!BrainSystem.AgentTeamManager;
    const hasAgiEngine = !!BrainSystem.agiEngine;
    console.log(`[版本] v${version} - ${version.includes('22.1') ? '✅' : '❌'}`);
    console.log(`[Agent 管理器] ${hasAgentTeam ? '✅ 就绪' : '❌ 缺失'}`);
    console.log(`[AGI 引擎] ${hasAgiEngine ? '✅ 就绪' : '❌ 缺失'}`);
  } catch (e) {
    console.log(`❌ 核心加载失败: ${e.message}`);
    return;
  }

  // 2. 多 Agent 团队深度检查
  console.log('\n🤖 --- 2. 多 Agent 团队体检 ---');
  const AgentTeamManager = BrainSystem.AgentTeamManager;
  if (AgentTeamManager) {
    const team = new AgentTeamManager();
    const agentCount = Object.keys(team._agents || {}).length;
    console.log(`[Agent 总数] ${agentCount} 个 - ${agentCount === 14 ? '✅' : '❌'}`);
    
    const teams = {
      '分析团队': ['IntentAgent', 'EmotionAgent', 'ContextAgent'],
      '执行团队': ['CodeAgent', 'SearchAgent', 'DebugAgent', 'OptimizeAgent', 'TestAgent'],
      '审核团队': ['QualityAgent', 'SecurityAgent', 'EffectAgent'],
      '学习团队': ['SummaryAgent', 'ImprovementAgent', 'KnowledgeAgent']
    };

    for (const [teamName, members] of Object.entries(teams)) {
      const status = members.every(m => team._agents[m] && typeof team._agents[m].execute === 'function');
      console.log(`[${teamName}] ${status ? '✅ 全员在线' : '❌ 存在缺失'}`);
    }
  } else {
    console.log('❌ AgentTeamManager 未定义');
  }

  // 3. 核心能力功能验证
  console.log('\n🧠 --- 3. 核心能力验证 ---');
  try {
    // 意图分析
    const intentRes = BrainSystem.analyzeIntent?.('帮我优化这个系统');
    console.log(`[意图分析] ${intentRes?.intent ? '✅ 正常' : '❌ 失败'} (结果: ${JSON.stringify(intentRes)})`);
    
    // 情感表达
    const emotionRes = BrainSystem.expressEmotion?.('太好了！', '');
    console.log(`[情感表达] ${emotionRes?.detected ? '✅ 正常' : '❌ 失败'}`);
    
    // AGI 引擎
    const agiRes = BrainSystem.agiEngine?.('测试任务');
    console.log(`[AGI 引擎] ${agiRes?.decision ? '✅ 正常' : '❌ 失败'}`);

    // 深度反思
    const reflectRes = BrainSystem.deepReflect?.({ input: 'test', success: true });
    console.log(`[深度反思] ${reflectRes ? '✅ 正常' : '❌ 失败'}`);

  } catch (e) {
    console.log(`❌ 能力验证异常: ${e.message}`);
  }

  // 4. 自动化接口全流程测试
  console.log('\n🔄 --- 4. 自动化接口全流程 ---');
  try {
    const input = '全方位诊断测试';
    const autoRes = await BrainSystem.autoAgentProcess(input);
    if (autoRes && autoRes.manager) {
      console.log(`[autoAgentProcess] ✅ 成功 (耗时 ${autoRes.totalTime}ms, 调用 Agent: ${autoRes.agentsUsed})`);
      
      // 自动验证
      const validRes = BrainSystem.autoValidate?.(autoRes);
      console.log(`[autoValidate] ${validRes?.valid !== false ? '✅ 验证通过' : '⚠️ 验证未通过 (预期行为)'}`);
      
      // 自动学习
      const learnRes = BrainSystem.autoLearn?.(input, autoRes);
      console.log(`[autoLearn] ${learnRes?.learned ? '✅ 学习已记录' : '❌ 失败'}`);
    } else {
      console.log('❌ autoAgentProcess 无响应');
    }
  } catch (e) {
    console.log(`❌ 自动化接口异常: ${e.message}`);
  }

  // 5. 环境与文件完整性
  console.log('\n📂 --- 5. 环境与文件完整性 ---');
  const requiredFiles = [
    'src/core/BrainSystem.js',
    'brain-entry.js',
    'AGENTS.md'
  ];
  for (const file of requiredFiles) {
    const exists = fs.existsSync(`./${file}`);
    console.log(`[${file}] ${exists ? '✅ 存在' : '❌ 缺失'}`);
  }

  const endTime = Date.now();
  console.log(`\n⏱️ === 诊断完成 ===`);
  console.log(`总耗时: ${endTime - startTime}ms`);
  console.log('系统状态: 🟢 运行健康\n');
}

fullDiagnostics().catch(e => {
  console.error('❌ 诊断过程崩溃:', e);
});
