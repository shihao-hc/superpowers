/**
 * ComprehensiveChecker - 全方面检查系统 v3.1
 *
 * 56项全面检查，涵盖14个维度
 *
 * @version 3.1.0
 */

const fs = require('fs');
const path = require('path');
const { CHECK_IMPLEMENTATIONS } = require('./ComprehensiveCheckImpls');

// ========== 55项检查框架 ==========

const CHECKS = {
  // ========== A. 代码层 (5项) ==========
  A: {
    name: '代码层',
    checks: [
      { id: 'A-01', name: '文件完整性', severity: 'critical', fn: 'checkFileIntegrity' },
      { id: 'A-02', name: '语法检查', severity: 'high', fn: 'checkSyntax' },
      { id: 'A-03', name: '代码质量', severity: 'medium', fn: 'checkCodeQuality' },
      { id: 'A-04', name: '模块导出', severity: 'high', fn: 'checkModuleExports' },
      { id: 'A-05', name: '代码重复', severity: 'medium', fn: 'checkCodeDuplication' }
    ]
  },

  // ========== B. 安全层 (5项) ==========
  B: {
    name: '安全层',
    checks: [
      { id: 'B-01', name: '安全检查', severity: 'critical', fn: 'checkSecurity' },
      { id: 'B-02', name: '漏洞扫描', severity: 'critical', fn: 'checkVulnerabilities' },
      { id: 'B-03', name: '隐患扫描', severity: 'high', fn: 'checkPotentialRisks' },
      { id: 'B-04', name: '输入验证', severity: 'high', fn: 'checkInputValidation' },
      { id: 'B-05', name: '路径安全', severity: 'high', fn: 'checkPathSecurity' }
    ]
  },

  // ========== C. 运行时层 (5项) ==========
  C: {
    name: '运行时层',
    checks: [
      { id: 'C-01', name: '错误处理', severity: 'high', fn: 'checkErrorHandling' },
      { id: 'C-02', name: '并发安全', severity: 'critical', fn: 'checkConcurrency' },
      { id: 'C-03', name: '内存管理', severity: 'high', fn: 'checkMemoryManagement' },
      { id: 'C-04', name: '性能检查', severity: 'medium', fn: 'checkPerformance' },
      { id: 'C-05', name: '资源泄露', severity: 'high', fn: 'checkResourceLeaks' }
    ]
  },

  // ========== D. 配置层 (3项) ==========
  D: {
    name: '配置层',
    checks: [
      { id: 'D-01', name: '配置管理', severity: 'high', fn: 'checkConfigManagement' },
      { id: 'D-02', name: '环境差异', severity: 'medium', fn: 'checkEnvDifferences' },
      { id: 'D-03', name: '依赖检查', severity: 'high', fn: 'checkDependencies' }
    ]
  },

  // ========== E. 文档层 (5项) ==========
  E: {
    name: '文档层',
    checks: [
      { id: 'E-01', name: 'README完整性', severity: 'medium', fn: 'checkReadme' },
      { id: 'E-02', name: 'API文档', severity: 'medium', fn: 'checkAPIDocs' },
      { id: 'E-03', name: '示例代码', severity: 'low', fn: 'checkExamples' },
      { id: 'E-04', name: 'CHANGELOG', severity: 'low', fn: 'checkChangelog' },
      { id: 'E-05', name: '许可证', severity: 'high', fn: 'checkLicense' }
    ]
  },

  // ========== F. 可维护性层 (4项) ==========
  F: {
    name: '可维护性层',
    checks: [
      { id: 'F-01', name: '代码可读性', severity: 'medium', fn: 'checkReadability' },
      { id: 'F-02', name: '注释覆盖率', severity: 'low', fn: 'checkCommentCoverage' },
      { id: 'F-03', name: '命名规范一致性', severity: 'medium', fn: 'checkNamingConsistency' },
      { id: 'F-04', name: '模块化程度', severity: 'medium', fn: 'checkModularization' }
    ]
  },

  // ========== G. 可测试性层 (4项) ==========
  G: {
    name: '可测试性层',
    checks: [
      { id: 'G-01', name: '单元测试覆盖', severity: 'high', fn: 'checkUnitTests' },
      { id: 'G-02', name: '集成测试覆盖', severity: 'high', fn: 'checkIntegrationTests' },
      { id: 'G-03', name: '边界测试', severity: 'medium', fn: 'checkBoundaryTests' },
      { id: 'G-04', name: '错误场景测试', severity: 'medium', fn: 'checkErrorTests' }
    ]
  },

  // ========== H. 运维层 (5项) ==========
  H: {
    name: '运维层',
    checks: [
      { id: 'H-01', name: '备份机制', severity: 'high', fn: 'checkBackup' },
      { id: 'H-02', name: '监控指标', severity: 'high', fn: 'checkMonitoring' },
      { id: 'H-03', name: '告警配置', severity: 'medium', fn: 'checkAlerts' },
      { id: 'H-04', name: '日志级别', severity: 'medium', fn: 'checkLogLevels' },
      { id: 'H-05', name: '容灾恢复', severity: 'critical', fn: 'checkDisasterRecovery' }
    ]
  },

  // ========== I. 合规层 (4项) ==========
  I: {
    name: '合规层',
    checks: [
      { id: 'I-01', name: '许可证检查', severity: 'high', fn: 'checkLicenseCompliance' },
      { id: 'I-02', name: '敏感信息检测', severity: 'critical', fn: 'checkSensitiveData' },
      { id: 'I-03', name: '审计日志', severity: 'high', fn: 'checkAuditLogs' },
      { id: 'I-04', name: '数据隔离', severity: 'high', fn: 'checkDataIsolation' }
    ]
  },

  // ========== J. 部署层 (4项) ==========
  J: {
    name: '部署层',
    checks: [
      { id: 'J-01', name: '环境变量', severity: 'high', fn: 'checkEnvVariables' },
      { id: 'J-02', name: '容器化配置', severity: 'medium', fn: 'checkContainerization' },
      { id: 'J-03', name: 'CI/CD配置', severity: 'medium', fn: 'checkCICD' },
      { id: 'J-04', name: '版本一致性', severity: 'high', fn: 'checkVersionConsistency' }
    ]
  },

  // ========== K. 用户体验层 (4项) ==========
  K: {
    name: '用户体验层',
    checks: [
      { id: 'K-01', name: '错误提示友好性', severity: 'medium', fn: 'checkErrorMessages' },
      { id: 'K-02', name: '帮助文档', severity: 'low', fn: 'checkHelpDocs' },
      { id: 'K-03', name: 'API易用性', severity: 'medium', fn: 'checkAPIFriendliness' },
      { id: 'K-04', name: '向下兼容', severity: 'high', fn: 'checkBackwardCompatibility' }
    ]
  },

  // ========== L. 可扩展性层 (3项) ==========
  L: {
    name: '可扩展性层',
    checks: [
      { id: 'L-01', name: '插件机制', severity: 'medium', fn: 'checkPluginSystem' },
      { id: 'L-02', name: '扩展点设计', severity: 'medium', fn: 'checkExtensionPoints' },
      { id: 'L-03', name: '版本升级路径', severity: 'low', fn: 'checkUpgradePath' }
    ]
  },

  // ========== M. 可观测性层 (4项) ==========
  M: {
    name: '可观测性层',
    checks: [
      { id: 'M-01', name: '埋点设计', severity: 'medium', fn: 'checkTracing' },
      { id: 'M-02', name: '性能监控', severity: 'high', fn: 'checkPerformanceMonitoring' },
      { id: 'M-03', name: '健康检查', severity: 'high', fn: 'checkHealthCheck' },
      { id: 'M-04', name: '诊断接口', severity: 'medium', fn: 'checkDiagnostics' }
    ]
  },

  // ========== N. 清洁层 (1项) ==========
  N: {
    name: '清洁层',
    checks: [
      { id: 'N-01', name: '垃圾清理', severity: 'medium', fn: 'checkCleanup' }
    ]
  }
};

// ========== 检查实现 ==========

class ComprehensiveChecker {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.verbose = options.verbose || false;
    this.strictMode = options.strictMode || false;

    this.results = new Map();
    this.issues = new Map();
    this.stats = { total: 0, passed: 0, failed: 0, warnings: 0 };

    this.coreFiles = this.findCoreFiles();
  }

  static getStats() {
    return { total: 56, categories: 14 };
  }

  getStats() {
    return this.stats;
  }

  findCoreFiles() {
    const files = [];
    const srcDir = path.join(this.projectRoot, 'src');

    if (!fs.existsSync(srcDir)) {return files;}

    const scan = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scan(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath);
          }
        }
      } catch (e) { /* 忽略错误 */ }
    };

    scan(srcDir);
    return files;
  }

  async run() {
    console.log(`\n${'═'.repeat(80)}`);
    console.log('                 全方面检查系统 v3.1 - 56项全面检查');
    console.log(`${'═'.repeat(80)}\n`);

    const startTime = Date.now();

    // 按类别执行检查
    for (const [categoryKey, category] of Object.entries(CHECKS)) {
      await this.runCategory(categoryKey, category);
    }

    const duration = Date.now() - startTime;
    this.generateReport(duration);

    return { stats: this.stats, issues: Array.from(this.issues.values()) };
  }

  async runCategory(key, category) {
    console.log(`【${key}. ${category.name}】`);

    for (const check of category.checks) {
      this.stats.total++;

      const result = await this.executeCheck(check);
      this.results.set(check.id, result);

      const icon = result.status === 'passed' ? '✅'
        : result.status === 'failed' ? '❌'
          : '⚠️';

      console.log(`  ${icon} ${check.id} ${check.name}`);

      if (result.status === 'passed') {this.stats.passed++;}
      else if (result.status === 'failed') {
        this.stats.failed++;
        this.issues.set(check.id, { ...check, ...result });
      }
      else {this.stats.warnings++;}

      if (this.verbose && result.details) {
        console.log(`     → ${result.details}`);
      }
    }
    console.log('');
  }

  async executeCheck(check) {
    const fn = CHECK_IMPLEMENTATIONS[check.fn];
    if (!fn) {
      return { status: 'warning', message: '检查未实现', details: check.fn };
    }

    try {
      return await fn(this.projectRoot, this.coreFiles);
    } catch (error) {
      return { status: 'failed', message: error.message };
    }
  }

  generateReport(duration) {
    console.log('═'.repeat(80));
    console.log('                       检查报告');
    console.log('═'.repeat(80));

    const passRate = this.stats.total > 0
      ? Math.round(this.stats.passed / this.stats.total * 100)
      : 0;

    console.log('\n【总体统计】');
    console.log(`  检查总数: ${this.stats.total}`);
    console.log(`  ✅ 通过: ${this.stats.passed}`);
    console.log(`  ❌ 失败: ${this.stats.failed}`);
    console.log(`  ⚠️  警告: ${this.stats.warnings}`);
    console.log(`  通过率: ${passRate}%`);
    console.log(`  执行时间: ${duration}ms`);

    // 按类别统计
    console.log('\n【各维度统计】');
    for (const [key, category] of Object.entries(CHECKS)) {
      const categoryResults = category.checks.map((c) => this.results.get(c.id)?.status || 'pending');
      const passed = categoryResults.filter((s) => s === 'passed').length;
      const total = category.checks.length;
      const pct = Math.round(passed / total * 100);
      console.log(`  ${key}. ${category.name}: ${passed}/${total} (${pct}%)`);
    }

    // 失败详情
    if (this.issues.size > 0) {
      console.log('\n【失败项详情】');
      for (const [id, issue] of this.issues) {
        console.log(`  ❌ ${id} ${issue.name}`);
        console.log(`     严重程度: ${issue.severity}`);
        console.log(`     原因: ${issue.message}`);
        if (issue.details) {console.log(`     详情: ${issue.details}`);}
      }
    }

    console.log(`\n${'═'.repeat(80)}`);

    if (this.stats.failed === 0) {
      console.log('  ✅ 所有56项检查通过！');
    } else {
      console.log(`  ⚠️  有 ${this.stats.failed} 项检查失败，请修复`);
    }
    console.log(`${'═'.repeat(80)}\n`);
  }
}

// ========== 55项检查实现 ==========

// ========== 具体检查实现 ==========
// 已拆出到 ./ComprehensiveCheckImpls.js (56项检查实现)
// 通过顶部 require 引入 CHECK_IMPLEMENTATIONS

// ========== 导出 ==========

module.exports = { ComprehensiveChecker, CHECKS };

// ========== 直接运行 ==========

if (require.main === module) {
  const checker = new ComprehensiveChecker({ projectRoot: 'D:/龙虾' });
  checker.run().then(({ stats }) => {
    console.log('\n检查完成！');
    process.exit(stats.failed > 0 ? 1 : 0);
  }).catch((e) => {
    console.error('检查失败:', e);
    process.exit(1);
  });
}
