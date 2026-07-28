/**
 * 安全扫描脚本 — 编码审计发现为可重复的自动化检查
 * 检测本次安全审计中发现的常见漏洞模式
 *
 * 运行: node scripts/security-scan.js
 */
const fs = require('fs');
const path = require('path');
const { loadRules, getRules, getRule, isCustomMatchRule } = require('./rules');

const ROOT = path.resolve(__dirname, '..');
const RULES_DIR = path.join(__dirname, 'rules');
const EXCLUDE_DIRS = ['node_modules', '.git', '.opencode', 'tradingagents-cn', 'shihao-', 'test', 'tests', 'scripts', 'frontend', 'examples', 'coverage'];
const EXCLUDE_PATTERNS = [/node_modules/, /\.test\.js$/, /\.spec\.js$/, /tradingagents-cn/, /shihao-/, /test[/\\]archive[/\\]/];

let totalErrors = 0;
let totalWarnings = 0;

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some((p) => p.test(filePath));
}

let _disabledRules = [];
let _rulesDirOverride = null;
const _severityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
let _minSeverity = null;

function initRules(rulesDir) {
  const dir = rulesDir || _rulesDirOverride || RULES_DIR;
  if (getRules().length === 0 || dir !== RULES_DIR) {
    try {
      loadRules(dir);
    } catch (e) {
      if (dir !== RULES_DIR) {
        console.error(`警告: 无法加载规则目录 "${dir}" (${e.message})，回退到默认规则`);
        loadRules(RULES_DIR);
      } else {
        console.error(`错误: 无法加载默认规则目录: ${e.message}`);
        return [];
      }
    }
  }
  const rules = getRules();
  if (_disabledRules.length > 0) {
    const loadedIds = new Set(rules.map(r => r.id));
    for (const id of _disabledRules) {
      if (!loadedIds.has(id)) {
        console.warn(`警告: --disable-rule "${id}" 不在已加载规则中，已忽略`);
      }
    }
    return rules.filter(r => !_disabledRules.includes(r.id));
  }
  return rules;
}

function getAllJSFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (EXCLUDE_DIRS.some((e) => fullPath.includes(e))) continue;
      if (entry.isDirectory()) {
        results.push(...getAllJSFiles(fullPath));
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') && !entry.name.endsWith('.spec.js')) {
        results.push(fullPath);
      }
    }
  } catch { /* 跳过无权限目录 */ }
  return results;
}

function scanFile(filePath, resultsArray) {
  const relativePath = path.relative(ROOT, filePath);
  if (shouldExclude(relativePath)) return;
  let content;
  try { content = fs.readFileSync(filePath, 'utf-8'); } catch { return; }
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const rules = initRules();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (isCustomMatchRule(rule)) {
      rule.match(lines, relativePath, filePath, (severity, ruleId, detail, message) => {
        if (resultsArray) resultsArray.push({ severity, ruleId, file: relativePath, message, detail });
        report(severity, ruleId, detail, relativePath, message);
      });
      continue;
    }
    for (const pattern of rule.patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!pattern.test(line)) continue;
        if (rule.excludePatterns && rule.excludePatterns.some(ep => ep.test(line))) continue;
        if (rule.context && rule.context.requireKeywords && rule.context.requireKeywords.length > 0) {
          const hasKeyword = rule.context.requireKeywords.some(kw =>
            line.toLowerCase().includes(kw.toLowerCase())
          );
          if (!hasKeyword) continue;
        }
        const detail = `行 ${i + 1}: ${line.trim().substring(0, 100)}`;
        if (resultsArray) resultsArray.push({ severity: rule.severity, ruleId: rule.id, file: relativePath, message: rule.description, detail });
        report(rule.severity, rule.id, detail, relativePath, rule.description);
      }
    }
  }
}

let _suggestMode = false;
const _suggestResults = [];

function report(severity, ruleId, detail, file, message) {
  if (_minSeverity && (_severityOrder[severity] || 0) < (_severityOrder[_minSeverity] || 0)) return;
  if (_suggestMode) { _suggestResults.push({ severity, ruleId, file, message, detail }); }
  const prefix = severity === 'HIGH' ? '🔴' : severity === 'MEDIUM' ? '🟡' : '🟢';
  if (severity === 'HIGH') { totalErrors++; } else { totalWarnings++; }
  console.log(`${prefix} [${severity}] ${ruleId}: ${file}`);
  console.log(`   ${detail}`);
  console.log(`   → ${message}`);
  console.log();
}

function printSuggestions(results) {
  const seen = new Set();
  let count = 0;
  for (const r of results) {
    const key = `${r.file}::${r.ruleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rule = getRule(r.ruleId);
    if (rule && rule.suggest) {
      if (count === 0) console.log('\n=== 修复建议 ===\n');
      count++;
      console.log(`📋 [${r.severity}] ${r.ruleId}: ${r.file}`);
      console.log(`   ${rule.suggest.split('\n').join('\n   ')}`);
      console.log();
    }
  }
  if (count > 0) console.log(`=== 共 ${count} 条建议 ===\n`);
}

function scanFiles(filePaths) {
  const results = [];
  for (const fp of filePaths) {
    scanFile(fp, results);
  }
  return results;
}

module.exports = { scanFile, scanFiles, initRules };

// ===== CLI 入口（顺序解析 argv 避免旗标-文件歧义） =====
if (require.main === module) {
  const files = [];
  let incrementalMode = false;
  let fixMode = false;
  let fixDryRun = false;

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--incremental') { incrementalMode = true; continue; }
    if (a === '--suggest') { _suggestMode = true; continue; }
    if (a === '--fix') { fixMode = true; continue; }
    if (a === '--fix-dry-run') { fixDryRun = true; continue; }
    if (a === '--severity') {
      const val = process.argv[++i];
      if (val && !val.startsWith('-')) {
        const up = val.toUpperCase();
        if (['HIGH', 'MEDIUM', 'LOW'].includes(up)) { _minSeverity = up; }
        else { console.warn(`警告: 无效的 --severity 值 "${val}"，有效值: HIGH/MEDIUM/LOW`); }
      }
      continue;
    }
    if (a === '--disable-rule') {
      while (i + 1 < process.argv.length && /^[A-Z][A-Z_\d]*$/.test(process.argv[i + 1])) {
        _disabledRules.push(process.argv[++i]);
      }
      continue;
    }
    if (a === '--rules-dir') {
      const dir = process.argv[++i];
      if (dir && !dir.startsWith('-')) { _rulesDirOverride = path.resolve(dir); }
      continue;
    }
    // 非旗标参数=文件路径
    files.push(a);
  }

  if (!incrementalMode) {
    // 全量扫描：忽略 files（全量扫描不走 CLI files）
    console.log('=== 安全扫描 ===\n');
    const allFiles = getAllJSFiles(ROOT);
    console.log(`扫描 ${allFiles.length} 个 JS 文件...\n`);
    for (const file of allFiles) { scanFile(file); }
    console.log(`\n=== 扫描完成: ${totalErrors} HIGH, ${totalWarnings} MEDIUM/LOW ===\n`);
    if (_suggestMode) printSuggestions(_suggestResults);
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  // 增量模式
  const filteredFiles = files.filter(f => {
    const abs = path.resolve(f);
    if (abs === __filename) return false;
    if (abs.startsWith(path.resolve(__dirname, 'rules'))) return false;
    return true;
  });
  if (filteredFiles.length === 0) { process.exit(0); }
  const results = scanFiles(filteredFiles);
  const highCount = results.filter(r => r.severity === 'HIGH').length;
  console.log(`\n=== 扫描完成: ${highCount} HIGH, ${results.length - highCount} MEDIUM/LOW ===\n`);
  if (_suggestMode) printSuggestions(results);
  if (fixMode || fixDryRun) {
    try {
      const { fixAll } = require('./auto-fix');
      const applied = fixAll(results, fixDryRun);
      if (applied.length > 0) { console.log(`\n=== ${fixDryRun ? '试运行' : '已应用'} ${applied.length} 个修复 ===\n`); }
    } catch (e) { console.error('Auto-fix 不可用:', e.message); }
  }
  process.exit(highCount > 0 ? 1 : 0);
}
