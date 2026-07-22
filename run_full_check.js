const { ComprehensiveChecker } = require('./src/agent/ComprehensiveChecker');

const checker = new ComprehensiveChecker({ projectRoot: 'D:/龙虾' });

console.log('=== OpenCode 完整系统 全方面检查 ===\n');

checker.run().then(report => {
  console.log('【总体统计】');
  console.log('通过:', report.stats?.passed || 0);
  console.log('失败:', report.stats?.failed || 0);
  console.log('警告:', report.stats?.warnings || 0);
  console.log('通过率:', Math.round((report.stats?.passed || 0) / 56 * 100) + '%');
  console.log('');
  
  console.log('【各维度结果】');
  const dims = {
    'A.代码层': [], 'B.安全层': [], 'C.运行时层': [],
    'D.配置层': [], 'E.文档层': [], 'F.可维护性层': [],
    'G.可测试性层': [], 'H.运维层': [], 'I.合规层': [],
    'J.部署层': [], 'K.用户体验层': [], 'L.可扩展性层': [],
    'M.可观测性层': [], 'N.清洁层': []
  };
  
  for (const [key, value] of Object.entries(report.results || {})) {
    const passed = value.filter(c => c.pass).length;
    const total = value.length;
    const pct = Math.round(passed/total*100);
    const icon = pct >= 80 ? '✅' : pct >= 50 ? '⚠️' : '❌';
    console.log(`${icon} ${key}: ${passed}/${total} (${pct}%)`);
  }
  
  console.log('\n【失败项详情】');
  let hasFailed = false;
  for (const [key, value] of Object.entries(report.results || {})) {
    const failed = value.filter(c => !c.pass);
    if (failed.length > 0) {
      hasFailed = true;
      console.log(`\n${key}:`);
      failed.forEach(c => console.log(`  ❌ ${c.name}: ${c.message || '未通过'}`));
    }
  }
  
  if (!hasFailed) {
    console.log('\n✅ 无失败项！');
  }
  
  console.log('\n' + '='.repeat(50));
  if (report.stats?.failed > 0) {
    console.log('⚠️  有 ' + report.stats.failed + ' 项检查失败');
  } else {
    console.log('✅ 所有56项检查通过！');
  }
}).catch(e => {
  console.error('检查失败:', e.message);
});