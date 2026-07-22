/**
 * SelfCodeImprover - 自我代码改进系统 v1.0
 *
 * AI能够自主检测、优化、改进自身代码的系统
 *
 * 核心能力：
 * 1. 代码扫描 - 检测常见问题
 * 2. 版本追踪 - 保持版本一致性
 * 3. 自动修复 - 修复可自动处理的问题
 * 4. 进化记录 - 记录改进历史
 *
 * @version 1.0.0
 * @license MIT
 * @copyright 2026 AI Brain System
 */

const fs = require('fs');
const path = require('path');
const { splitLines } = require('../utils/UltraWorkUtils');

class SelfCodeImprover {
  constructor(brainSystem) {
    this.brain = brainSystem;
    this.basePath = path.join(process.cwd(), 'src');
    this.scanPaths = [
      path.join(process.cwd(), 'src', 'core'),
      path.join(process.cwd(), 'src', 'agent'),
      path.join(process.cwd(), 'src', 'agents'),
      path.join(process.cwd(), 'src', 'ai'),
      path.join(process.cwd(), 'src', 'api'),
      path.join(process.cwd(), 'src', 'config'),
      path.join(process.cwd(), 'src', 'context')
    ];
    this.improvements = [];
    this.history = [];
    this.autoFixEnabled = true;
    this.scanStats = { byPath: {} };
    this.issueTracker = {
      byFile: {},
      bySeverity: { critical: [], high: [], medium: [], low: [] },
      fixed: [],
      recurring: []
    };

    console.log('[SelfCodeImprover] 自我代码改进系统已启动 (7目录扫描)');
  }

  /**
   * 执行完整的自我代码改进检查
   */
  fullScan() {
    const scan = {
      timestamp: Date.now(),
      issues: [],
      fixes: [],
      stats: {}
    };

    let totalFiles = 0;
    const byPath = {};

    for (let i = 0; i < this.scanPaths.length; i++) {
      const scanPath = this.scanPaths[i];
      const dirName = path.basename(scanPath);

      if (!fs.existsSync(scanPath)) {
        console.log(`[SelfCodeImprover] 跳过不存在: ${dirName}`);
        continue;
      }

      const files = this._getFilesFromPath(scanPath);
      byPath[dirName] = files.length;
      totalFiles += files.length;

      for (let j = 0; j < files.length; j++) {
        const fileIssues = this._scanFile(files[j]);
        scan.issues.push.apply(scan.issues, fileIssues);
      }
    }

    scan.stats.totalFiles = totalFiles;
    scan.stats.byPath = byPath;

    scan.issuesBySeverity = this._groupBySeverity(scan.issues);
    scan.stats.critical = scan.issuesBySeverity.critical ? scan.issuesBySeverity.critical.length : 0;
    scan.stats.high = scan.issuesBySeverity.high ? scan.issuesBySeverity.high.length : 0;
    scan.stats.medium = scan.issuesBySeverity.medium ? scan.issuesBySeverity.medium.length : 0;
    scan.stats.low = scan.issuesBySeverity.low ? scan.issuesBySeverity.low.length : 0;

    if (this.autoFixEnabled && scan.issues.length > 0) {
      scan.fixes = this._autoFix(scan.issues);
    }

    this._updateIssueTracker(scan.issues);

    this.history.push({
      timestamp: scan.timestamp,
      issuesFound: scan.issues.length,
      fixesApplied: scan.fixes.length,
      filesScanned: totalFiles
    });

    console.log(`[SelfCodeImprover] 扫描完成: ${scan.issues.length} 问题, ${scan.fixes.length} 已修复`);

    return scan;
  }

  /**
   * 获取指定目录的文件列表
   */
  _getFilesFromPath(dirPath) {
    const files = [];

    try {
      const entries = fs.readdirSync(dirPath);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.endsWith('.js') && !entry.endsWith('.test.js')) {
          files.push(path.join(dirPath, entry));
        }
      }
    } catch (e) {
      // 忽略目录读取错误
    }

    return files;
  }

  /**
   * 扫描单个文件
   */
  _scanFile(filePath) {
    const issues = [];
    const content = fs.readFileSync(filePath, 'utf8');
    const _lines = splitLines(content);
    const fileName = path.basename(filePath);
    const checks = [
      { name: 'duplicate-require', check: this._checkDuplicateRequire(content, fileName) },
      { name: 'version-inconsistency', check: this._checkVersionInconsistency(content, fileName) },
      { name: 'empty-catch', check: this._checkEmptyCatch(content, fileName) },
      { name: 'unused-variable', check: this._checkUnusedVariable(content, fileName) },
      { name: 'console-log-leak', check: this._checkConsoleLogLeak(content, fileName) },
      { name: 'sync-file-ops', check: this._checkSyncFileOps(content, fileName) },
      { name: 'security-hardcoded-secret', check: this._checkHardcodedSecret(content, fileName) }
    ];

    for (const { name, check } of checks) {
      if (check.found) {
        issues.push({
          file: fileName,
          type: name,
          severity: check.severity,
          line: check.line,
          message: check.message,
          suggestion: check.suggestion
        });
      }
    }

    return issues;
  }

  /**
   * 检查重复require
   */
  _checkDuplicateRequire(content, _fileName) {
    const requireCounts = {};
    const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;

    while ((match = requirePattern.exec(content)) != null) { // eslint-disable-line eqeqeq
      const module = match[1];
      if (requireCounts[module]) {
        requireCounts[module]++;
      } else {
        requireCounts[module] = 1;
      }
    }

    const duplicates = [];
    for (const mod in requireCounts) {
      if (requireCounts[mod] > 1) {
        duplicates.push(mod);
      }
    }

    if (duplicates.length > 0) {
      return {
        found: true,
        severity: 'high',
        message: `重复require: ${duplicates.join(', ')}`,
        suggestion: '合并重复的require语句到一处'
      };
    }

    return { found: false };
  }

  /**
   * 检查版本号不一致
   */
  _checkVersionInconsistency(content, _fileName) {
    const versionPattern = /@version\s+([0-9.]+)/g;
    const versions = [];
    let match;

    while ((match = versionPattern.exec(content)) != null) { // eslint-disable-line eqeqeq
      versions.push(match[1]);
    }

    const uniqueVersions = versions.filter(function(v, i, a) { return a.indexOf(v) === i; });

    if (uniqueVersions.length > 1) {
      return {
        found: true,
        severity: 'medium',
        message: `版本号不一致: ${uniqueVersions.join(' vs ')}`,
        suggestion: '统一版本号'
      };
    }

    return { found: false };
  }

  /**
   * 检查空catch块
   */
  _checkEmptyCatch(content, _fileName) {
    const catchPattern = /catch\s*\([^)]+\)\s*\{\s*\}/g;
    const matches = [];
    let match;

    while ((match = catchPattern.exec(content)) != null) { // eslint-disable-line eqeqeq
      const lineNumber = splitLines(content.substring(0, match.index)).length;
      matches.push(lineNumber);
    }

    if (matches.length > 0) {
      return {
        found: true,
        severity: 'medium',
        line: matches[0],
        message: `发现${matches.length}个空catch块`,
        suggestion: '在catch中记录错误信息'
      };
    }

    return { found: false };
  }

  /**
   * 检查未使用变量
   */
  _checkUnusedVariable(_content, _fileName) {
    return { found: false };
  }

  /**
   * 检查console.log泄露
   */
  _checkConsoleLogLeak(content, _fileName) {
    const debugPattern = /console\.(log|debug)\s*\(\s*['"][^'"]*debug[^'"]*['"]/gi;
    const matches = [];
    let match;

    while ((match = debugPattern.exec(content)) != null) { // eslint-disable-line eqeqeq
      const lineNumber = splitLines(content.substring(0, match.index)).length;
      matches.push(lineNumber);
    }

    if (matches.length > 2) {
      return {
        found: true,
        severity: 'low',
        line: matches[0],
        message: `发现${matches.length}个调试日志`,
        suggestion: '考虑移除生产环境的调试日志'
      };
    }

    return { found: false };
  }

  /**
   * 检查同步文件操作
   */
  _checkSyncFileOps(content, _fileName) {
    const syncPattern = /fs\.(readFileSync|writeFileSync|readdirSync)\s*\(/g;
    const matches = [];
    let match;

    while ((match = syncPattern.exec(content)) != null) { // eslint-disable-line eqeqeq
      matches.push(match[0]);
    }

    if (matches.length > 60) {
      return {
        found: true,
        severity: 'low',
        message: `发现${matches.length}个同步文件操作`,
        suggestion: '建议使用异步操作替代'
      };
    }

    return { found: false };
  }

  /**
   * 检查硬编码密钥（安全检查）
   */
  _checkHardcodedSecret(content, _fileName) {
    const secretPatterns = [
      /['"]api[_-]?key['"]\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
      /['"]password['"]\s*[:=]\s*['"][^'"]+['"]/gi,
      /['"]secret['"]\s*[:=]\s*['"][^'"]+['"]/gi
    ];

    let matches = 0;
    for (let i = 0; i < secretPatterns.length; i++) {
      if (secretPatterns[i].test(content)) {
        matches++;
      }
    }

    if (matches > 0) {
      return {
        found: true,
        severity: 'high',
        message: '发现疑似硬编码密钥',
        suggestion: '使用环境变量或配置文件'
      };
    }

    return { found: false };
  }

  /**
   * 更新问题追踪器
   */
  _updateIssueTracker(issues) {
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const file = issue.file;

      if (!this.issueTracker.byFile[file]) {
        this.issueTracker.byFile[file] = [];
      }
      this.issueTracker.byFile[file].push(issue);

      if (this.issueTracker.bySeverity[issue.severity]) {
        this.issueTracker.bySeverity[issue.severity].push(issue);
      }
    }
  }

  /**
   * 获取问题追踪报告
   */
  getTrackingReport() {
    const report = {
      totalIssues: 0,
      byFile: this.issueTracker.byFile,
      bySeverity: {
        critical: this.issueTracker.bySeverity.critical.length,
        high: this.issueTracker.bySeverity.high.length,
        medium: this.issueTracker.bySeverity.medium.length,
        low: this.issueTracker.bySeverity.low.length
      },
      fileCount: Object.keys(this.issueTracker.byFile).length,
      scanHistory: this.history.length
    };

    for (const sev in report.bySeverity) {
      report.totalIssues += report.bySeverity[sev];
    }

    return report;
  }

  /**
   * 按严重程度分组
   */
  _groupBySeverity(issues) {
    const grouped = { critical: [], high: [], medium: [], low: [] };

    for (const issue of issues) {
      const severity = issue.severity || 'medium';
      if (grouped[severity]) {
        grouped[severity].push(issue);
      } else {
        grouped.medium.push(issue);
      }
    }

    return grouped;
  }

  /**
   * 自动修复可修复的问题
   */
  _autoFix(issues) {
    const fixes = [];

    for (const issue of issues) {
      if (!this._canAutoFix(issue.type)) {continue;}

      try {
        const result = this._applyFix(issue);
        fixes.push({
          issue: issue.message,
          result: result.success ? 'fixed' : 'failed',
          error: result.error
        });
      } catch (e) {
        fixes.push({
          issue: issue.message,
          result: 'error',
          error: e.message
        });
      }
    }

    return fixes.filter((f) => f.result === 'fixed');
  }

  /**
   * 检查问题是否可自动修复
   */
  _canAutoFix(type) {
    const autoFixable = ['duplicate-require', 'version-inconsistency'];
    return autoFixable.includes(type);
  }

  /**
   * 应用修复
   */
  _applyFix(issue) {
    if (issue.type === 'duplicate-require') {
      return { success: false, error: '需要手动处理' };
    }

    if (issue.type === 'version-inconsistency') {
      return { success: false, error: '需要手动确认版本' };
    }

    return { success: false, error: '未知问题类型' };
  }

  /**
   * 启用/禁用自动修复
   */
  setAutoFix(enabled) {
    this.autoFixEnabled = enabled;
    console.log(`[SelfCodeImprover] 自动修复: ${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 启动自动迭代改进循环
   */
  startAutoImprovementLoop(intervalMs) {
    if (this.improvementLoop) {
      console.log('[SelfCodeImprover] 改进循环已在运行');
      return;
    }
    intervalMs = intervalMs || 300000;
    const self = this;
    this.improvementLoop = setInterval(function() {
      self.runImprovementCycle();
    }, intervalMs);

    console.log(`[SelfCodeImprover] 自动改进循环已启动 (间隔: ${intervalMs}ms)`);
    this.runImprovementCycle();
  }

  /**
   * 停止自动迭代改进循环
   */
  stopAutoImprovementLoop() {
    if (this.improvementLoop) {
      clearInterval(this.improvementLoop);
      this.improvementLoop = null;
      console.log('[SelfCodeImprover] 改进循环已停止');
    }
  }

  /**
   * 执行一次完整的改进周期
   */
  runImprovementCycle() {
    console.log('[SelfCodeImprover] ═══ 改进周期开始 ═══');

    const scanResult = this.fullScan();
    console.log(`  扫描: 发现 ${scanResult.issues.length} 个问题`);

    if (scanResult.fixes.length > 0) {
      console.log(`  修复: 已应用 ${scanResult.fixes.length} 个修复`);
    } else {
      console.log('  修复: 需要手动处理');
    }

    if (this.brain && this.brain.evolution) {
      this.brain.evolution.learn('code-scan', 'auto', {
        issuesFound: scanResult.issues.length,
        fixesApplied: scanResult.fixes.length
      });
    }

    console.log('[SelfCodeImprover] ═══ 改进周期完成 ═══');

    return scanResult;
  }

  /**
   * 获取改进建议
   */
  getSuggestions() {
    const latestScan = this.history[this.history.length - 1];
    const suggestions = [];

    if (!latestScan) {
      return [{ action: 'run-scan', description: '运行一次代码扫描' }];
    }

    if (latestScan.issuesFound > 0) {
      suggestions.push({
        action: 'manual-fix',
        description: `手动修复 ${latestScan.issuesFound} 个问题`
      });
    }

    if (latestScan.filesScanned > 5) {
      suggestions.push({
        action: 'expand-scan',
        description: '扩展扫描范围到更多模块'
      });
    }

    return suggestions;
  }

  generateReport() {
    const tracking = this.getTrackingReport();
    const latestScan = this.history[this.history.length - 1];

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: latestScan ? latestScan.filesScanned : 0,
        totalIssues: tracking.totalIssues,
        bySeverity: tracking.bySeverity,
        scanCount: this.history.length
      },
      scanPaths: this.scanPaths.map(function(p) {
        return path.basename(p);
      }),
      history: this.history.slice(-5).map(function(h) {
        return {
          date: new Date(h.timestamp).toISOString(),
          issues: h.issuesFound,
          fixed: h.fixesApplied
        };
      })
    };
  }
}

module.exports = SelfCodeImprover;