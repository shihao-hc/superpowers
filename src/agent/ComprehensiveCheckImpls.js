/**
 * ComprehensiveCheckImpls - 56项全面检查的实现聚合
 *
 * 56项检查按 14 个维度拆分为独立模块（见 ./comprehensiveChecks/），
 * 本文件负责聚合导出，保持 ComprehensiveChecker.js 的 require 路径不变。
 *
 * @version 3.1.0
 */

const CHECK_IMPLEMENTATIONS = {
  ...require('./comprehensiveChecks/A-code'),
  ...require('./comprehensiveChecks/B-security'),
  ...require('./comprehensiveChecks/C-runtime'),
  ...require('./comprehensiveChecks/D-config'),
  ...require('./comprehensiveChecks/E-docs'),
  ...require('./comprehensiveChecks/F-maintainability'),
  ...require('./comprehensiveChecks/G-testability'),
  ...require('./comprehensiveChecks/H-ops'),
  ...require('./comprehensiveChecks/I-compliance'),
  ...require('./comprehensiveChecks/J-deployment'),
  ...require('./comprehensiveChecks/K-ux'),
  ...require('./comprehensiveChecks/L-extensibility'),
  ...require('./comprehensiveChecks/M-observability'),
  ...require('./comprehensiveChecks/N-cleanliness')
};

module.exports = { CHECK_IMPLEMENTATIONS };
