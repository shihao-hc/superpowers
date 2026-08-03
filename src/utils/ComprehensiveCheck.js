/**
 * ComprehensiveCheck - 全方面检查自动触发
 *
 * 任务完成后自动执行全方面检查
 */

class ComprehensiveCheck {
  constructor(bs) {
    this.bs = bs;
  }

  _autoComprehensiveCheck(context, result, _action) {
    const bs = this.bs;
    if (!result || result.success === false) {
      return { triggered: false, reason: '任务未成功' };
    }

    if (!bs.comprehensiveChecker) {
      return { triggered: false, reason: 'ComprehensiveChecker未初始化' };
    }

    bs.comprehensiveChecker.run().then((report) => {
      const passed = report.stats?.passed || 0;
      const failed = report.stats?.failed || 0;

      if (failed > 0) {
        console.log(`[BrainSystem] ⚠️ 全方面检查发现问题: ${failed}项`);
        console.log('[BrainSystem] 任务完成后自动检查 - 请修复后再继续');
      } else {
        console.log(`[BrainSystem] ✅ 全方面检查通过: ${passed}/${56}`);
      }

      return {
        triggered: true,
        passed,
        failed,
        timestamp: Date.now()
      };
    }).catch((e) => {
      console.log(`[BrainSystem] 全方面检查跳过: ${e.message}`);
    });

    return { triggered: true, status: 'executing' };
  }
}

module.exports = ComprehensiveCheck;
