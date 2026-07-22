/**
 * 全面质量审计 - 诚实检查效率和质量平衡
 */

const bs = require('./src/core/BrainSystem');

console.log('========================================');
console.log('  BrainSystem v22.1 全面质量审计');
console.log('  重点: 效率提升不以牺牲质量为代价');
console.log('========================================\n');

let passed = 0;
let failed = 0;
let warnings = 0;

function check(name, condition, warning = false) {
  if (condition) {
    console.log('✓', name);
    passed++;
  } else {
    if (warning) {
      console.log('⚠', name, '(警告)');
      warnings++;
    } else {
      console.log('✗', name);
      failed++;
    }
  }
}

async function runAudit() {
  // ========== 1. 基础加载检查 ==========
  console.log('--- 1. 基础加载检查 ---');
  
  check('BrainSystem加载成功', bs != null);
  check('autoAgentProcess是函数', typeof bs.autoAgentProcess === 'function');
  check('autoValidate是函数', typeof bs.autoValidate === 'function');
  check('autoLearn是函数', typeof bs.autoLearn === 'function');
  check('autoGetStatus是函数', typeof bs.autoGetStatus === 'function');
  check('AgentTeamManager是函数', typeof bs.AgentTeamManager === 'function');
  
  console.log('');

  // ========== 2. 自动化流程检查 ==========
  console.log('--- 2. 自动化流程检查 ---');
  
  try {
    const result = await bs.autoAgentProcess('帮我优化代码性能');
    check('autoAgentProcess返回结果', result != null);
    check('结果包含manager字段', result.manager != null);
    check('结果包含intent字段', result.intent != null);
    check('结果包含auto:true', result.auto === true);
    check('使用FullMode(14个Agent)', result.manager === 'v22.1 FullMode');
    check('Agent数量正确', result.agentsUsed === 14);
    check('执行时间合理(<100ms)', result.time < 100);
  } catch (e) {
    check('autoAgentProcess无错误', false);
    console.log('  错误:', e.message);
  }
  
  console.log('');

  // ========== 3. 边界情况检查 ==========
  console.log('--- 3. 边界情况检查 ---');
  
  try {
    await bs.autoAgentProcess('');
    check('空字符串应被拦截', false);
  } catch (e) {
    check('空字符串被正确拦截', true);
  }
  
  try {
    await bs.autoAgentProcess(null);
    check('null应被拦截', false);
  } catch (e) {
    check('null被正确拦截', true);
  }
  
  try {
    await bs.autoAgentProcess(undefined);
    check('undefined应被拦截', false);
  } catch (e) {
    check('undefined被正确拦截', true);
  }
  
  console.log('');

  // ========== 4. Agent执行质量检查 ==========
  console.log('--- 4. Agent执行质量检查 ---');
  
  const result = await bs.autoAgentProcess('测试Agent质量');
  
  // 检查是否有真正的Agent输出（不是占位符）
  const hasRealOutput = result.stages > 0 && result.agentsUsed === 14;
  check('14个Agent都被调用', hasRealOutput);
  
  // 警告：检查Agent是否只是返回占位符
  const agentOutput = JSON.stringify(result);
  const hasPlaceholder = agentOutput.includes('ready') || agentOutput.includes('status');
  if (hasPlaceholder) {
    check('Agent返回真实结果(非占位符)', false, true);
    console.log('  警告: Agent可能只是返回占位符数据，未真正执行任务');
    warnings++;
  } else {
    check('Agent返回真实结果', true);
  }
  
  console.log('');

  // ========== 5. 效率与质量平衡检查 ==========
  console.log('--- 5. 效率与质量平衡检查 ---');
  
  const start = Date.now();
  await bs.autoAgentProcess('性能测试');
  const time = Date.now() - start;
  
  check('执行时间<50ms (效率)', time < 50);
  check('执行时间>3ms (确保不是跳过)', time > 3);
  
  // 检查是否4阶段都执行了
  const result2 = await bs.autoAgentProcess('阶段检查');
  check('4个阶段都执行', result2.stages === 4);
  check('完整统计信息', result2.stats != null);
  
  console.log('');

  // ========== 6. 核心模块质量检查 ==========
  console.log('--- 6. 核心模块质量检查 ---');
  
  const intent = bs.analyzeIntent('优化代码');
  check('analyzeIntent返回有效intent', intent.intent != null && intent.intent !== 'unknown');
  check('analyzeIntent返回confidence', intent.confidence > 0);
  
  const emotion = bs.expressEmotion('我很高兴', '');
  check('expressEmotion返回结果', emotion != null);
  
  // 警告：检查是否有模块只是占位符
  check('forceThink可用', typeof bs.forceThink === 'function');
  check('agiEngine可用', typeof bs.agiEngine === 'function');
  
  console.log('');

  // ========== 总结 ==========
  console.log('========================================');
  console.log('  审计完成');
  console.log('  通过:', passed, '| 失败:', failed, '| 警告:', warnings);
  console.log('========================================\n');
  
  if (failed > 0) {
    console.log('❌ 存在质量问题，需要修复！');
    console.log('   主要问题:');
    if (failed > 3) console.log('   - 多项基础功能失败');
  } else if (warnings > 0) {
    console.log('⚠ 质量合格，但有警告：');
    console.log('   - Agent可能返回占位符而非真实结果');
    console.log('   - 效率虽高，但需确认Agent真正执行了任务');
  } else {
    console.log('✅ 质量审计通过！');
    console.log('   - 效率提升: ✓');
    console.log('   - 质量保障: ✓');
    console.log('   - 自动化可靠: ✓');
  }
}

runAudit().catch(e => {
  console.log('审计过程出错:', e.message);
  console.log(e.stack);
});
