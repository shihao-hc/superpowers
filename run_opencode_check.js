const { ComprehensiveChecker } = require('./src/agent/ComprehensiveChecker');

const checker = new ComprehensiveChecker({ projectRoot: 'D:/龙虾/.opencode' });

console.log('=== OpenCode 全方面检查 ===\n');

checker.run().then(report => {
  console.log('【统计摘要】');
  console.log('通过:', report.stats?.passed || 0);
  console.log('失败:', report.stats?.failed || 0);
  console.log('警告:', report.stats?.warnings || 0);
  console.log('');
  
  console.log('【各维度结果】');
  for (const [key, value] of Object.entries(report.results || {})) {
    const passed = value.filter(c => c.pass).length;
    const total = value.length;
    console.log(`${key}: ${passed}/${total} 通过`);
  }
  
  console.log('\n【失败项详情】');
  for (const [key, value] of Object.entries(report.results || {})) {
    const failed = value.filter(c => !c.pass);
    if (failed.length > 0) {
      console.log(`\n${key}:`);
      failed.forEach(c => console.log(`  ❌ ${c.name}: ${c.message || '未通过'}`));
    }
  }
}).catch(e => {
  console.error('检查失败:', e.message);
});