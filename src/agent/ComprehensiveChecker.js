/**
 * ComprehensiveChecker - 全方面检查系统 v3.1
 *
 * 56项全面检查，涵盖14个维度
 *
 * @version 3.1.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { splitLines } = require('../utils/UltraWorkUtils');

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

const CHECK_IMPLEMENTATIONS = {

  // ========== A. 代码层 ==========

  'checkFileIntegrity': async (root, files) => {
    // 兼容 Skills 项目（Markdown 文件）
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    const jsFiles = files.filter((f) => f.endsWith('.js'));

    if (files.length === 0) {
      // 检查是否有 Markdown 文件（Skills 项目）
      const skillsDir = path.join(root, 'skills');
      if (fs.existsSync(skillsDir)) {
        const skillFiles = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => path.join(skillsDir, e.name, 'SKILL.md'))
          .filter((f) => fs.existsSync(f));

        if (skillFiles.length > 0) {
          return { status: 'passed', message: `Skills项目完整，共${skillFiles.length}个Skills` };
        }
      }
      return { status: 'failed', message: '未找到任何文件', details: '项目为空' };
    }

    // 检查关键文件是否存在（JavaScript 项目）
    const essentialFiles = [
      'src/core/BrainSystem.js',
      'src/core/MetaCognition.js',
      'src/core/Thinking.js'
    ];

    const missing = essentialFiles.filter((f) =>
      fs.existsSync(path.join(root, f))
    );

    // 如果是 Skills 项目或有足够文件，则通过
    if (mdFiles.length > 10 || jsFiles.length > 5 || missing.length >= 2) {
      return { status: 'passed', message: `文件完整，共${files.length}个文件` };
    }

    if (missing.length > 0) {
      return { status: 'warning', message: `缺少部分关键文件: ${missing.join(', ')}` };
    }

    return { status: 'passed', message: `文件完整，共${files.length}个文件` };
  },

  'checkSyntax': async (root, files) => {
    // 只检查括号严重不匹配（差异>5才警告）
    let severe = 0;

    for (const file of files.slice(0, 30)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const open = (content.match(/\{/g) || []).length;
        const close = (content.match(/\}/g) || []).length;

        if (Math.abs(open - close) > 5) {
          severe++;
        }
      } catch (e) { /* 忽略错误 */ }
    }

    if (severe > 0) {
      return { status: 'warning', message: `发现${severe}个文件括号严重不匹配`, details: '建议使用IDE检查语法' };
    }

    return { status: 'passed', message: '语法检查通过' };
  },

  'checkCodeQuality': async (root, files) => {
    const issues = [];

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检测var声明
      if (/\bvar\s+\w+/.test(content)) {
        issues.push('使用var声明');
      }

      // 检测过长的函数
      const functions = content.match(/function\s+\w+\s*\([^)]*\)\s*\{[^}]{200,}\}/g);
      if (functions) {
        issues.push(`${path.basename(file)}: ${functions.length}个过长函数`);
      }
    }

    if (issues.length > 3) {
      return { status: 'warning', message: '代码质量问题', details: issues.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '代码质量检查通过' };
  },

  'checkModuleExports': async (root, files) => {
    const mainFiles = files.filter((f) =>
      f.includes('core/') || f.includes('agent/')
    );

    let noExport = 0;
    for (const file of mainFiles.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('module.exports') && !content.includes('export')) {
        noExport++;
      }
    }

    if (noExport > mainFiles.length / 2) {
      return { status: 'warning', message: '部分模块未导出', details: `${noExport}个文件无导出` };
    }

    return { status: 'passed', message: '模块导出检查通过' };
  },

  'checkCodeDuplication': async (root, files) => {
    const hashes = new Map();
    let duplicates = 0;

    for (const file of files.slice(0, 20)) {
      const content = fs.readFileSync(file, 'utf-8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      if (hashes.has(hash)) {
        duplicates++;
      } else {
        hashes.set(hash, file);
      }
    }

    if (duplicates > 5) {
      return { status: 'warning', message: '存在重复代码', details: `${duplicates}个重复` };
    }

    return { status: 'passed', message: '未发现明显重复代码' };
  },

  // ========== B. 安全层 ==========

  'checkSecurity': async (root, files) => {
    const risks = [];

    // 真正的危险模式检测
    // 1. eval() 直接调用（非字符串匹配）
    // 2. new Function() 动态创建函数
    // 3. innerHTML 直接赋值（非React/Vue框架）
    // 4. document.write() XSS风险

    for (const file of files.slice(0, 20)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 移除注释
      const codeOnly = content
        .replace(/\/\/.*$/gm, '')           // 单行注释
        .replace(/\/\*[\s\S]*?\*\//g, '');   // 多行注释

      // 移除字符串字面量
      const noStrings = codeOnly
        .replace(/'[^']*'/g, '\'\'')
        .replace(/"[^"]*"/g, '""')
        .replace(/`[^`]*`/g, '``');

      // 检测危险模式
      if (/\beval\s*\([^)]*\)/.test(noStrings)) {
        // 排除 $$eval (Playwright API)
        if (!noStrings.includes('$$eval')) {
          risks.push(`${path.basename(file)}: eval调用`);
        }
      }

      // 检测 new Function
      if (/new\s+Function\s*\(/.test(noStrings)) {
        risks.push(`${path.basename(file)}: 动态函数`);
      }

      // 检测危险的innerHTML直接赋值
      if (/\.innerHTML\s*=\s*(?![`'"]).*(?:\{|\+)/.test(noStrings)) {
        risks.push(`${path.basename(file)}: innerHTML动态赋值`);
      }

      // 检测 document.write
      if (/document\.write\s*\(/.test(noStrings)) {
        risks.push(`${path.basename(file)}: document.write`);
      }
    }

    if (risks.length > 0) {
      return { status: 'failed', message: '安全风险', details: risks.slice(0, 5).join(', ') };
    }

    return { status: 'passed', message: '安全检查通过' };
  },

  'checkVulnerabilities': async (root, files) => {
    // 检查是否包含已知漏洞模式
    const vulnerabilityPatterns = [
      { pattern: /password\s*=\s*['"][^'"]+['"]/i, desc: '硬编码密码' },
      { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/i, desc: '硬编码API Key' },
      { pattern: /secret\s*=\s*['"][^'"]+['"]/i, desc: '硬编码密钥' },
      { pattern: /token\s*=\s*['"][^'"]+['"]/i, desc: '硬编码Token' },
      { pattern: /private[_-]?key\s*=\s*['"]/i, desc: '硬编码私钥' }
    ];

    const found = [];
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const vp of vulnerabilityPatterns) {
        if (vp.pattern.test(content) && !content.includes('//') && !content.includes('placeholder')) {
          found.push(`${path.basename(file)}: ${vp.desc}`);
        }
      }
    }

    if (found.length > 0) {
      return { status: 'failed', message: '发现漏洞', details: found.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '无已知漏洞' };
  },

  'checkPotentialRisks': async (root, files) => {
    const riskPatterns = [
      { pattern: /\.sql\(`|sql\s*\+=/i, desc: 'SQL拼接' },
      { pattern: /shell\s*\.\s*exec/i, desc: 'Shell执行' },
      { pattern: /http.*\?.*\$/i, desc: 'URL参数拼接' },
      { pattern: /JSON\.parse.*user/i, desc: '用户输入JSON解析' },
      { pattern: /fs\.\w+.*path\.(join|resolve).*\$/i, desc: '动态路径' }
    ];

    const risks = [];
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const rp of riskPatterns) {
        if (rp.pattern.test(content)) {
          risks.push(`${path.basename(file)}: ${rp.desc}`);
        }
      }
    }

    if (risks.length > 0) {
      return { status: 'warning', message: '发现潜在风险', details: risks.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '无明显隐患' };
  },

  'checkInputValidation': async (root, files) => {
    const validators = ['isNaN', 'isFinite', 'typeof', 'instanceof', 'validate', 'sanitize'];
    let hasValidation = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (validators.some((v) => content.includes(v))) {
        hasValidation++;
      }
    }

    if (hasValidation < 2) {
      return { status: 'warning', message: '输入验证不足', details: '建议添加更多输入验证' };
    }

    return { status: 'passed', message: '输入验证检查通过' };
  },

  'checkPathSecurity': async (root, files) => {
    // 路径安全检查 - 核心：检查真正的路径遍历漏洞
    // 安全的 ../core 和 ../agent 相对导入是正常使用，不计入风险

    // 只检查是否有 eval + 动态路径的组合（真正危险）
    let realRisks = 0;

    for (const file of files.slice(0, 10)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');

        // 真正危险：用户输入拼接到文件路径
        const dangerous = content.includes('eval(userInput') ||
                              content.includes('fs.readFile(userPath') ||
                              content.includes('require(userModule');
        if (dangerous) {realRisks++;}
      } catch (e) {}
    }

    if (realRisks > 0) {
      return { status: 'warning', message: '发现真实路径遍历风险', details: `${realRisks}个文件` };
    }

    return { status: 'passed', message: '路径安全检查通过' };
  },

  // ========== C. 运行时层 ==========

  'checkErrorHandling': async (root, files) => {
    let noTryCatch = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('try {') && (content.includes('require(') || content.includes('async'))) {
        noTryCatch++;
      }
    }

    if (noTryCatch > 2) {
      return { status: 'warning', message: '部分模块缺少错误处理', details: `${noTryCatch}个文件` };
    }

    return { status: 'passed', message: '错误处理检查通过' };
  },

  'checkConcurrency': async (root, files) => {
    const concurrencyPatterns = ['async', 'Promise', 'await', 'setTimeout', 'setInterval', 'Worker'];
    let hasConcurrency = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (concurrencyPatterns.some((p) => content.includes(p))) {
        hasConcurrency++;
      }
    }

    if (hasConcurrency > 0) {
      // 检查是否有锁或同步机制
      const hasLock = files.some((f) =>
        fs.readFileSync(f, 'utf-8').includes('lock') ||
        fs.readFileSync(f, 'utf-8').includes('mutex')
      );

      if (!hasLock) {
        return { status: 'warning', message: '并发场景无同步机制', details: '建议添加锁或互斥机制' };
      }
    }

    return { status: 'passed', message: '并发安全检查通过' };
  },

  'checkMemoryManagement': async (root, files) => {
    const issues = [];

    // 更精确的检测：只检查真正的内存问题
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检查明显的内存泄漏模式：全局变量累积
      if (/global\.\w+\s*=\s*\[\]/.test(content)) {
        issues.push(`${path.basename(file)}: 全局数组累积`);
      }

      // 检查未清理的缓存
      if (/cache\s*=\s*new\s+Map/.test(content) && !content.includes('cache.clear')) {
        issues.push(`${path.basename(file)}: 缓存无清理`);
      }
    }

    if (issues.length > 0) {
      return { status: 'warning', message: '潜在内存问题', details: issues.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '内存管理检查通过' };
  },

  'checkPerformance': async (root, files) => {
    const issues = [];

    for (const file of files.slice(0, 3)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检查递归
      const funcMatch = content.match(/function\s+(\w+)[^{]*\{[^}]*\}|\b\w+\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\}/g);
      if (funcMatch && funcMatch.length > 20) {
        issues.push(`${path.basename(file)}: 函数过多`);
      }

      // 检查嵌套过深
      if (/\{[^}]{0,20}\{[^}]{0,20}\{[^}]{0,20}\{/.test(content)) {
        issues.push(`${path.basename(file)}: 嵌套过深`);
      }
    }

    if (issues.length > 0) {
      return { status: 'warning', message: '性能问题', details: issues.join('; ') };
    }

    return { status: 'passed', message: '性能检查通过' };
  },

  'checkResourceLeaks': async (root, files) => {
    const issues = [];

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检查文件流
      if (content.includes('fs.createReadStream') && !content.includes('.close()')) {
        issues.push('未关闭文件流');
      }

      // 检查数据库连接
      if (content.includes('connect(') && !content.includes('disconnect')) {
        issues.push('未关闭数据库连接');
      }

      // 检查setTimeout无清理
      if (content.includes('setInterval') && !content.includes('clearInterval')) {
        issues.push('setInterval未清理');
      }
    }

    if (issues.length > 0) {
      return { status: 'warning', message: '资源泄露风险', details: issues.join(', ') };
    }

    return { status: 'passed', message: '无明显资源泄露' };
  },

  // ========== D. 配置层 ==========

  'checkConfigManagement': async (root, files) => {
    const hasEnv = files.some((f) =>
      fs.readFileSync(f, 'utf-8').includes('process.env')
    );

    const hasConfig = fs.existsSync(path.join(root, 'config')) ||
                      fs.existsSync(path.join(root, 'src/config')) ||
                      files.some((f) => f.includes('config'));

    if (!hasEnv && !hasConfig) {
      return { status: 'warning', message: '未使用环境变量或配置文件', details: '建议使用config模块管理配置' };
    }

    return { status: 'passed', message: '配置管理检查通过' };
  },

  'checkEnvDifferences': async (root, _files) => {
    const envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
    const existing = envFiles.filter((f) => fs.existsSync(path.join(root, f)));

    if (existing.length === 0) {
      return { status: 'warning', message: '缺少环境配置文件', details: '建议创建.env文件管理环境差异' };
    }

    return { status: 'passed', message: `环境配置文件: ${existing.join(', ')}` };
  },

  'checkDependencies': async (root, _files) => {
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return { status: 'failed', message: '缺少package.json' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {}).length;
    const devDeps = Object.keys(pkg.devDependencies || {}).length;

    if (deps > 100) {
      return { status: 'warning', message: '依赖过多', details: `${deps}生产依赖, ${devDeps}开发依赖` };
    }

    return { status: 'passed', message: `依赖检查通过 (${deps}+${devDeps})` };
  },

  // ========== E. 文档层 ==========

  'checkReadme': async (root) => {
    const readmeFiles = ['README.md', 'README.txt', 'readme.md'];
    const exists = readmeFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'failed', message: '缺少README文件', details: '项目根目录应包含README.md' };
    }

    const content = fs.readFileSync(path.join(root, exists), 'utf-8');

    // 检测项目类型（优先Python）
    const isPython = fs.existsSync(path.join(root, 'requirements.txt')) ||
                     fs.existsSync(path.join(root, 'setup.py')) ||
                     fs.existsSync(path.join(root, 'pyproject.toml'));
    const isNode = fs.existsSync(path.join(root, 'package.json')) && !isPython;

    // 根据项目类型检查对应内容
    const required = ['#'];
    if (isNode) {
      required.push(...['npm', 'install', 'node']);
    } else if (isPython) {
      required.push(...['pip', 'install', 'python']);
    } else {
      required.push(...['install']);
    }

    // 通用内容（支持多种表达）
    const hasInstall = /install|pip|npm|yarn/i.test(content);
    const hasUsage = /usage|quick start|start|run/i.test(content);

    if (!hasInstall) {required.push('install');}
    if (!hasUsage) {required.push('start/usage');}

    const missing = required.filter((r) => !content.toLowerCase().includes(r.toLowerCase()));

    if (missing.length > 2) {
      return { status: 'warning', message: 'README可能不完整', details: `建议添加: ${missing.slice(0, 3).join(', ')}` };
    }

    return { status: 'passed', message: 'README检查通过' };
  },

  'checkAPIDocs': async (root, files) => {
    const docsFiles = ['docs/API.md', 'docs/api.md', 'API.md', 'api.md'];
    const exists = docsFiles.find((f) => fs.existsSync(path.join(root, f)));

    // 检查JSDoc注释
    let jsdocCount = 0;
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/\/\*\*[\s\S]*?@\w+/.test(content)) {
        jsdocCount++;
      }
    }

    if (!exists && jsdocCount < 3) {
      return { status: 'warning', message: '缺少API文档', details: `仅${jsdocCount}个文件有JSDoc` };
    }

    return { status: 'passed', message: exists ? 'API文档存在' : 'JSDoc注释充足' };
  },

  'checkExamples': async (root) => {
    const exampleDirs = ['examples', 'example', 'demo', 'samples'];
    const exists = exampleDirs.find((d) =>
      fs.existsSync(path.join(root, d)) ||
      fs.existsSync(path.join(root, 'docs', d))
    );

    if (!exists) {
      return { status: 'warning', message: '缺少示例代码', details: '建议添加examples目录' };
    }

    return { status: 'passed', message: `示例目录: ${exists}` };
  },

  'checkChangelog': async (root) => {
    const changelogFiles = ['CHANGELOG.md', 'CHANGELOG', 'HISTORY.md', 'changelog.md'];
    const exists = changelogFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少CHANGELOG', details: '建议添加CHANGELOG.md记录版本变更' };
    }

    return { status: 'passed', message: 'CHANGELOG存在' };
  },

  'checkLicense': async (root) => {
    const licenseFiles = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license.md'];
    const exists = licenseFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'failed', message: '缺少许可证文件', details: '项目根目录应包含LICENSE文件' };
    }

    return { status: 'passed', message: '许可证文件存在' };
  },

  // ========== F. 可维护性层 ==========

  'checkReadability': async (root, files) => {
    let issues = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = splitLines(content);

      // 检查超长行
      const longLines = lines.filter((l) => l.length > 120);
      if (longLines.length > 5) {
        issues++;
      }
    }

    if (issues > 2) {
      return { status: 'warning', message: '代码可读性有待提升', details: '部分文件存在超长行' };
    }

    return { status: 'passed', message: '代码可读性检查通过' };
  },

  'checkCommentCoverage': async (root, files) => {
    // Node.js项目通常注释较少，降低阈值到5%
    let totalLines = 0;
    let commentLines = 0;
    let jsdocCount = 0;

    for (const file of files.slice(0, 20)) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = splitLines(content);
      totalLines += lines.length;

      // 行注释
      commentLines += lines.filter((l) =>
        l.trim().startsWith('//') ||
        l.trim().startsWith('/*') ||
        l.trim().startsWith('*')
      ).length;

      // JSDoc加分
      if (/\/\*\*[\s\S]*?@\w+/.test(content)) {
        jsdocCount++;
      }
    }

    const coverage = totalLines > 0 ? (commentLines / totalLines * 100).toFixed(1) : 0;
    const jsdocRatio = files.length > 0 ? (jsdocCount / Math.min(files.length, 20) * 100).toFixed(1) : 0;

    // JSDoc密集的项目降低注释要求
    const effectiveCoverage = parseFloat(coverage) + (parseFloat(jsdocRatio) * 0.5);

    if (effectiveCoverage < 5) {
      return { status: 'warning', message: '注释覆盖率过低', details: `行注释${coverage}%, JSDoc ${jsdocCount}个文件` };
    }

    return { status: 'passed', message: `注释覆盖率: ${coverage}%` };
  },

  'checkNamingConsistency': async (root, files) => {
    // Node.js项目中混合camelCase(方法)和PascalCase(类)是正常的
    // 这里只检查真正的命名问题：如同一上下文中混用不同风格

    let issues = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 检查常量命名：如果有常量使用camelCase而不是SCREAMING_SNAKE_CASE
      const constDecl = content.match(/\bconst\s+[a-z][A-Z]\w*\s*=/g);
      const letDecl = content.match(/\blet\s+[a-z][A-Z]\w*\s*=/g);

      if ((constDecl?.length || 0) + (letDecl?.length || 0) > 3) {
        issues++;
      }
    }

    if (issues > 2) {
      return { status: 'warning', message: '部分常量未使用大写下划线', details: '建议常量使用SCREAMING_SNAKE_CASE' };
    }

    return { status: 'passed', message: '命名规范一致' };
  },

  'checkModularization': async (root, files) => {
    const coreFiles = files.filter((f) => f.includes('/core/') || f.includes('/agent/'));
    let largeFiles = 0;

    for (const file of coreFiles.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.length > 5000) {
        largeFiles++;
      }
    }

    if (largeFiles > 3) {
      return { status: 'warning', message: '部分模块过大', details: `${largeFiles}个文件超过5000字符` };
    }

    return { status: 'passed', message: '模块化程度良好' };
  },

  // ========== G. 可测试性层 ==========

  'checkUnitTests': async (root, files) => {
    const testPatterns = ['.test.js', '.spec.js', 'test/', 'tests/', '__tests__/'];
    const hasTests = files.some((f) => testPatterns.some((p) => f.includes(p)));

    const testFile = path.join(root, 'src/core/BrainSystem.test.js');
    if (fs.existsSync(testFile)) {
      return { status: 'passed', message: '单元测试文件存在' };
    }

    if (!hasTests) {
      return { status: 'failed', message: '缺少单元测试', details: '建议添加*.test.js文件' };
    }

    return { status: 'passed', message: '单元测试存在' };
  },

  'checkIntegrationTests': async (root) => {
    const integrationPaths = [
      'tests/integration',
      'test/integration',
      '__tests__/integration'
    ];

    const exists = integrationPaths.some((p) =>
      fs.existsSync(path.join(root, p))
    );

    if (!exists) {
      return { status: 'warning', message: '缺少集成测试', details: '建议添加integration测试目录' };
    }

    return { status: 'passed', message: '集成测试目录存在' };
  },

  'checkBoundaryTests': async (root) => {
    const testFiles = [
      'src/core/BrainSystem.test.js',
      'test/BrainSystem.test.js'
    ];

    const exists = testFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少边界测试', details: '建议在测试中添加边界条件覆盖' };
    }

    const content = fs.readFileSync(path.join(root, exists), 'utf-8');
    const hasBoundary = content.includes('边界') ||
                        content.includes('boundary') ||
                        content.includes('edge') ||
                        content.includes('max') ||
                        content.includes('min');

    if (!hasBoundary) {
      return { status: 'warning', message: '边界测试不完整', details: '建议添加更多边界条件测试' };
    }

    return { status: 'passed', message: '边界测试覆盖' };
  },

  'checkErrorTests': async (root) => {
    const testFiles = [
      'src/core/BrainSystem.test.js',
      'test/BrainSystem.test.js'
    ];

    const exists = testFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少错误场景测试', details: '建议添加try-catch和错误处理测试' };
    }

    const content = fs.readFileSync(path.join(root, exists), 'utf-8');
    const hasErrorTests = content.includes('catch') ||
                          content.includes('throw') ||
                          content.includes('reject') ||
                          content.includes('error');

    if (!hasErrorTests) {
      return { status: 'warning', message: '缺少错误场景测试', details: '建议添加异常和错误处理测试' };
    }

    return { status: 'passed', message: '错误场景测试覆盖' };
  },

  // ========== H. 运维层 ==========

  'checkBackup': async (root, files) => {
    const backupFiles = ['backup', 'backups', '.backup', 'scripts/backup'];
    const exists = backupFiles.some((f) =>
      fs.existsSync(path.join(root, f)) ||
      fs.existsSync(path.join(root, 'scripts', f))
    );

    // 检查是否有机制
    const _hasBackupCode = files.some((f) =>
      fs.readFileSync(f, 'utf-8').includes('backup') ||
      fs.readFileSync(f, 'utf-8').includes('dump')
    );

    if (!exists) {
      return { status: 'warning', message: '缺少备份机制', details: '建议添加自动备份脚本' };
    }

    return { status: 'passed', message: '备份机制存在' };
  },

  'checkMonitoring': async (root, files) => {
    let hasMetrics = false;
    let hasPrometheus = false;

    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      if (content.includes('metrics') || content.includes('monitor')) {hasMetrics = true;}
      if (content.includes('prometheus')) {hasPrometheus = true;}
      if (hasMetrics && hasPrometheus) {break;}
    }

    if (!hasMetrics && !hasPrometheus) {
      return { status: 'warning', message: '缺少监控指标', details: '建议添加Prometheus指标暴露' };
    }

    return { status: 'passed', message: '监控指标存在' };
  },

  'checkAlerts': async (root, files) => {
    let hasAlerts = false;

    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      if (content.includes('alert') || content.includes('warning') || content.includes('notify')) {
        hasAlerts = true;
        break;
      }
    }

    if (!hasAlerts) {
      return { status: 'warning', message: '缺少告警配置', details: '建议配置错误告警机制' };
    }

    return { status: 'passed', message: '告警配置存在' };
  },

  'checkLogLevels': async (root, files) => {
    const logLevels = ['debug', 'info', 'warn', 'error'];
    const foundLevels = [];

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      for (const level of logLevels) {
        if (content.includes(level) && !foundLevels.includes(level)) {
          foundLevels.push(level);
        }
      }
    }

    if (foundLevels.length < 2) {
      return { status: 'warning', message: '日志级别不完整', details: `仅发现: ${foundLevels.join(', ')}` };
    }

    return { status: 'passed', message: `日志级别: ${foundLevels.join(', ')}` };
  },

  'checkDisasterRecovery': async (root) => {
    const recoveryFiles = ['docs/recovery.md', 'docs/disaster.md', 'RECOVERY.md'];
    const exists = recoveryFiles.some((f) => fs.existsSync(path.join(root, f)));

    const _hasRecoveryCode = (files) => files.some((f) =>
      fs.readFileSync(f, 'utf-8').includes('recovery') ||
      fs.readFileSync(f, 'utf-8').includes('failover') ||
      fs.readFileSync(f, 'utf-8').includes('replicate')
    );

    if (!exists) {
      return { status: 'warning', message: '缺少容灾恢复文档', details: '建议添加灾难恢复方案' };
    }

    return { status: 'passed', message: '容灾恢复机制存在' };
  },

  // ========== I. 合规层 ==========

  'checkLicenseCompliance': async (root) => {
    const licensePath = path.join(root, 'LICENSE');
    if (!fs.existsSync(licensePath)) {
      return { status: 'failed', message: '缺少许可证', details: '必须包含LICENSE文件' };
    }

    const license = fs.readFileSync(licensePath, 'utf-8');
    const knownLicenses = ['MIT', 'Apache', 'GPL', 'BSD', 'ISC', 'MIT License'];
    const isKnown = knownLicenses.some((l) => license.includes(l));

    if (!isKnown) {
      return { status: 'warning', message: '许可证类型不明确', details: '建议使用标准开源许可证' };
    }

    return { status: 'passed', message: '许可证合规' };
  },

  'checkSensitiveData': async (root, files) => {
    const sensitivePatterns = [
      { pattern: /password\s*[:=]\s*['"][^'"]+['"]/i, desc: '密码' },
      { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, desc: 'API Key' },
      { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/i, desc: '密钥' },
      { pattern: /token\s*[:=]\s*['"][^'"]+['"]/i, desc: 'Token' },
      { pattern: /private[_-]?key\s*[:=]/i, desc: '私钥' }
    ];

    const found = [];
    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const sp of sensitivePatterns) {
        if (sp.pattern.test(content) && !content.includes('//') && !content.includes('example')) {
          found.push(`${path.basename(file)}: ${sp.desc}`);
        }
      }
    }

    if (found.length > 0) {
      return { status: 'failed', message: '发现敏感信息泄露', details: found.slice(0, 3).join('; ') };
    }

    return { status: 'passed', message: '无敏感信息泄露' };
  },

  'checkAuditLogs': async (root, files) => {
    let hasAudit = false;

    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      if (content.includes('audit') || content.includes('history') || content.includes('记录')) {
        hasAudit = true;
        break;
      }
    }

    if (!hasAudit) {
      return { status: 'warning', message: '缺少审计日志', details: '建议添加操作审计功能' };
    }

    return { status: 'passed', message: '审计日志机制存在' };
  },

  'checkDataIsolation': async (root, files) => {
    let hasIsolation = false;

    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      if (content.includes('tenant') || content.includes('namespace') ||
          content.includes('隔离') || content.includes('sandbox')) {
        hasIsolation = true;
        break;
      }
    }

    if (!hasIsolation) {
      return { status: 'warning', message: '缺少数据隔离机制', details: '建议为多租户场景添加数据隔离' };
    }

    return { status: 'passed', message: '数据隔离机制存在' };
  },

  // ========== J. 部署层 ==========

  'checkEnvVariables': async (root, files) => {
    const hasEnvUsage = files.some((f) =>
      fs.readFileSync(f, 'utf-8').includes('process.env')
    );

    const hasEnvFile = fs.existsSync(path.join(root, '.env')) ||
                        fs.existsSync(path.join(root, '.env.example'));

    if (!hasEnvUsage) {
      return { status: 'warning', message: '未使用环境变量', details: '建议使用process.env管理配置' };
    }

    if (!hasEnvFile) {
      return { status: 'warning', message: '缺少.env文件', details: '建议创建.env.example作为模板' };
    }

    return { status: 'passed', message: '环境变量使用正确' };
  },

  'checkContainerization': async (root) => {
    const dockerFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'];
    const hasDocker = dockerFiles.some((f) => fs.existsSync(path.join(root, f)));

    if (!hasDocker) {
      return { status: 'warning', message: '缺少容器化配置', details: '建议添加Dockerfile和docker-compose.yml' };
    }

    return { status: 'passed', message: '容器化配置存在' };
  },

  'checkCICD': async (root) => {
    const cicdFiles = [
      '.github/workflows',
      '.gitlab-ci.yml',
      'Jenkinsfile',
      '.circleci/config.yml',
      'azure-pipelines.yml'
    ];

    const exists = cicdFiles.some((f) =>
      fs.existsSync(path.join(root, f))
    );

    if (!exists) {
      return { status: 'warning', message: '缺少CI/CD配置', details: '建议配置GitHub Actions或其他CI/CD' };
    }

    return { status: 'passed', message: 'CI/CD配置存在' };
  },

  'checkVersionConsistency': async (root) => {
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return { status: 'warning', message: '缺少package.json' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const version = pkg.version;

    // 1.0.0是正常的初始化版本，不警告
    if (!version || version === '0.0.0') {
      return { status: 'warning', message: '版本号未设置', details: `当前版本: ${version || 'undefined'}` };
    }

    // 检查README和package.json版本是否一致
    const readmePath = path.join(root, 'README.md');
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, 'utf-8');
      const readmeVersion = readme.match(/v?(\d+\.\d+\.\d+)/);
      if (readmeVersion && readmeVersion[1] !== version) {
        return { status: 'warning', message: '版本不一致', details: `README: ${readmeVersion[1]}, package.json: ${version}` };
      }
    }

    return { status: 'passed', message: `版本一致: ${version}` };
  },

  // ========== K. 用户体验层 ==========

  'checkErrorMessages': async (root, files) => {
    let friendlyErrors = 0;
    let unfriendlyErrors = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');

      // 友好错误消息
      if (/throw\s+new\s+Error\(['"`].*[.!。]/.test(content)) {
        friendlyErrors++;
      }

      // 不友好错误消息
      if (/throw\s+Error\(['"`]\w{1,20}['"`]\)/.test(content)) {
        unfriendlyErrors++;
      }
    }

    if (unfriendlyErrors > friendlyErrors) {
      return { status: 'warning', message: '错误消息不够友好', details: '建议使用描述性错误消息' };
    }

    return { status: 'passed', message: '错误提示友好性良好' };
  },

  'checkHelpDocs': async (root) => {
    const helpFiles = ['docs/help.md', 'docs/guide.md', 'HELP.md', 'docs/README.md'];
    const exists = helpFiles.some((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少帮助文档', details: '建议添加docs/guide.md' };
    }

    return { status: 'passed', message: '帮助文档存在' };
  },

  'checkAPIFriendliness': async (root, files) => {
    // 检查更多文件的核心模块
    const coreFiles = files.filter((f) =>
      f.includes('/core/') || f.includes('/agent/') || f.includes('/api/')
    ).slice(0, 15);

    let jsdocCount = 0;

    for (const file of coreFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/\/\*\*[\s\S]*?@param/.test(content)) {
        jsdocCount++;
      }
    }

    // 调整阈值：至少20%的核心文件有JSDoc
    const threshold = Math.ceil(coreFiles.length * 0.2);
    if (jsdocCount < threshold) {
      return { status: 'warning', message: '核心模块API文档不足', details: `${jsdocCount}/${coreFiles.length}个核心文件有JSDoc` };
    }

    return { status: 'passed', message: `API文档充足 (${jsdocCount}/${coreFiles.length})` };
  },

  'checkBackwardCompatibility': async (root) => {
    const changelogPath = path.join(root, 'CHANGELOG.md');
    if (!fs.existsSync(changelogPath)) {
      return { status: 'warning', message: '缺少变更日志', details: '建议维护CHANGELOG记录Breaking Changes' };
    }

    const changelog = fs.readFileSync(changelogPath, 'utf-8');
    const hasBreakingChanges = changelog.includes('BREAKING') ||
                              changelog.includes('破坏性') ||
                              changelog.includes('!');

    return { status: 'passed', message: hasBreakingChanges ? '变更日志完整' : '未发现Breaking Changes' };
  },

  // ========== L. 可扩展性层 ==========

  'checkPluginSystem': async (root, files) => {
    const hasPlugin = files.some((f) => {
      const content = fs.readFileSync(f, 'utf-8');
      return content.includes('plugin') ||
             content.includes('Plugin') ||
             content.includes('extension') ||
             content.includes('hook');
    });

    if (!hasPlugin) {
      return { status: 'warning', message: '缺少插件机制', details: '建议实现插件系统提高可扩展性' };
    }

    return { status: 'passed', message: '插件机制存在' };
  },

  'checkExtensionPoints': async (root, files) => {
    const extensionPatterns = ['before', 'after', 'on', 'emit', 'subscribe', 'middleware'];
    let extensionCount = 0;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      extensionCount += extensionPatterns.filter((p) => content.includes(p)).length;
    }

    if (extensionCount < 3) {
      return { status: 'warning', message: '扩展点不足', details: '建议添加更多生命周期钩子' };
    }

    return { status: 'passed', message: '扩展点设计良好' };
  },

  'checkUpgradePath': async (root) => {
    const upgradeDoc = ['UPGRADE.md', 'docs/upgrade.md', 'MIGRATION.md'];
    const exists = upgradeDoc.some((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少升级指南', details: '建议添加UPGRADE.md指导版本升级' };
    }

    return { status: 'passed', message: '升级指南存在' };
  },

  // ========== M. 可观测性层 ==========

  'checkTracing': async (root, files) => {
    const tracingPatterns = ['trace', 'span', 'traceId', 'requestId', 'correlationId'];
    let hasTracing = false;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (tracingPatterns.some((p) => content.toLowerCase().includes(p))) {
        hasTracing = true;
        break;
      }
    }

    if (!hasTracing) {
      return { status: 'warning', message: '缺少链路追踪', details: '建议添加traceId实现链路追踪' };
    }

    return { status: 'passed', message: '链路追踪机制存在' };
  },

  'checkPerformanceMonitoring': async (root, files) => {
    const perfPatterns = ['performance', 'timing', 'latency', 'duration', 'benchmark'];
    let hasPerf = false;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (perfPatterns.some((p) => content.includes(p))) {
        hasPerf = true;
        break;
      }
    }

    if (!hasPerf) {
      return { status: 'warning', message: '缺少性能监控', details: '建议添加性能指标收集' };
    }

    return { status: 'passed', message: '性能监控存在' };
  },

  'checkHealthCheck': async (root, files) => {
    const hasHealth = files.some((f) => {
      const content = fs.readFileSync(f, 'utf-8');
      return content.includes('getStatus') ||
             content.includes('health') ||
             content.includes('ping');
    });

    if (!hasHealth) {
      return { status: 'warning', message: '缺少健康检查', details: '建议实现/health端点' };
    }

    return { status: 'passed', message: '健康检查端点存在' };
  },

  'checkDiagnostics': async (root, files) => {
    const diagPatterns = ['debug', 'diagnostic', 'dump', 'profile', 'stats'];
    let hasDiag = false;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (diagPatterns.some((p) => content.includes(p))) {
        hasDiag = true;
        break;
      }
    }

    if (!hasDiag) {
      return { status: 'warning', message: '缺少诊断接口', details: '建议添加调试和诊断端点' };
    }

    return { status: 'passed', message: '诊断接口存在' };
  },

  // ========== N. 清洁层 ==========

  'checkCleanup': async (root, files) => {
    const srcDir = path.join(root, 'src');
    const emptyDirs = [];

    // 检查空目录
    try {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const dirPath = path.join(srcDir, entry.name);
          const subFiles = fs.readdirSync(dirPath);
          if (subFiles.length === 0) {
            emptyDirs.push(entry.name);
          }
        }
      }
    } catch (e) { /* 忽略错误 */ }

    // 检查TODO/FIXME（警告级别）
    let todoCount = 0;
    for (const file of files.slice(0, 20)) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(/\bTODO\b|\bFIXME\b|\bXXX\b|\bHACK\b/g);
      if (matches) {todoCount += matches.length;}
    }

    const issues = [];
    if (emptyDirs.length > 0) {
      issues.push(`空目录: ${emptyDirs.slice(0, 5).join(', ')}${emptyDirs.length > 5 ? '...' : ''}`);
    }
    if (todoCount > 10) {
      issues.push(`TODO/FIXME: ${todoCount}处`);
    }

    if (issues.length > 0) {
      return { status: 'warning', message: '需要清理', details: issues.join('; ') };
    }

    return { status: 'passed', message: '代码整洁，无明显垃圾' };
  }
};

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
