/**
 * health-check.js — 56 项全方面检查一键复查（合理运用的工具保证）
 *
 * 用法: node scripts/health-check.js
 * 跑 56 项检查，只输出非通过项（warning/failed），退出码:
 *   0 = 全部通过 | 1 = 有 warning/failed（需追根源）| 2 = 检查执行失败
 *
 * 配套原则（AGENTS.md 健康哨兵）:
 *   - server 启动时自动跑一次
 *   - 有非通过项 → 当场追根源（不"可后续看"）
 *   - 升级过的 A-04 导出完整性 / 敏感信息 = 可信预警；C 层运行时 = 启发式参考
 *   - 不替代威胁建模 + PoC + 测试全量（权威审计）
 */
const { runComprehensiveCheck } = require('../src/core/BrainSystem');

(async () => {
  const r = await runComprehensiveCheck();
  const issues = r.issues || [];
  const notPass = issues.filter((i) => i.status === 'warning' || i.status === 'failed');
  console.log(`\n健康检查: ${r.stats.total} 项 | passed=${r.stats.passed} failed=${r.stats.failed} warnings=${r.stats.warnings}`);
  if (notPass.length === 0) {
    console.log('✅ 全部通过');
    process.exit(0);
  }
  console.log(`\n⚠️ 非通过项 ${notPass.length} 个（需追根源，不可跳过）:`);
  notPass.forEach((i) => {
    console.log(`- ${i.id || '?'} ${i.name || ''}: ${i.message || ''}${i.details ? ` | ${i.details}` : ''}`);
  });
  process.exit(1);
})().catch((e) => {
  console.error('健康检查执行失败:', e.message);
  process.exit(2);
});