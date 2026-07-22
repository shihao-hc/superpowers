# Phase 0: 永久执行层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建安全扫描的永久执行基础设施 — 文件监控、增量扫描、pre-commit 升级、dev server 嵌入

**Architecture:** 在现有 daemon 基础上集成 chokidar 文件监控，改造 security-scan.js 支持增量扫描，用 husky + lint-staged 取代手动 pre-commit 钩子

**Tech Stack:** chokidar (已有间接依赖), husky, lint-staged, Node.js fs.watch 替代方案

---

### Task 1: 改造 security-scan.js 支持增量 + 模块导出

**Files:**
- Modify: `scripts/security-scan.js`
- Test: 手动运行验证

- [ ] **Step 1: 给 scanFile 添加结果收集参数**

现有 `scanFile(filePath)`（line 38）扫描后直接调 `report()` 打印并计数。改造为：

```js
function scanFile(filePath, resultsArray) {
  const relativePath = path.relative(ROOT, filePath);
  if (shouldExclude(relativePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 将所有 report() 调用改为:
  //   若入了 resultsArray，push 对象；同时保留原有 report() 用于打印
  //   例如: report('HIGH', 'S3_KEY_PATH_TRAVERSAL', ..., relativePath, ...)
  //   改为:
  //   resultsArray.push({ severity: 'HIGH', ruleId: 'S3_KEY_PATH_TRAVERSAL', file: relativePath, ... });
  //   report('HIGH', 'S3_KEY_PATH_TRAVERSAL', ..., relativePath, ...);
  //
  // 24 个检查全部这样改：push + report()

  // ... 现有 24 个检查逻辑不变，仅每处 report() 前加 resultsArray.push()
}
```

具体修改模式：每处 `report(severity, ruleId, detail, file, message)` 前加一行：

```js
if (resultsArray) resultsArray.push({ severity, ruleId, file: relativePath, message, detail });
```

共 24 处修改，均遵循此模式。

- [ ] **Step 2: 添加 scanFiles 函数 + module.exports**

在 `report()` 函数之后添加：

```js
function scanFiles(filePaths) {
  const results = [];
  for (const fp of filePaths) {
    scanFile(fp, results);
  }
  return results;
}

module.exports = { scanFile, scanFiles };
```

- [ ] **Step 3: 添加 --incremental CLI 参数 + 保留全量扫描**

文件底部最后一段（现有 `// ===== 执行扫描 =====` 及之后代码）改造为：

```js
// ===== CLI 入口（仅直接运行执行） =====
if (require.main === module) {
  if (process.argv.includes('--incremental')) {
    const idx = process.argv.indexOf('--incremental');
    const files = process.argv.slice(idx + 1).filter(f => f && !f.startsWith('-'));
    if (files.length === 0) {
      console.error('Usage: node scripts/security-scan.js --incremental <file1.js> [file2.js ...]');
      process.exit(1);
    }
    const results = scanFiles(files);
    // results 已经通过 report() 打印了，不需额外输出
    const highCount = results.filter(r => r.severity === 'HIGH').length;
    console.log(`\n=== 扫描完成: ${highCount} HIGH, ${results.length - highCount} MEDIUM/LOW ===\n`);
    process.exit(highCount > 0 ? 1 : 0);
  } else {
    // 原有全量扫描逻辑（保持完全一致）
    console.log('=== 安全扫描 ===\n');
    const files = getAllJSFiles(ROOT);
    console.log(`扫描 ${files.length} 个 JS 文件...\n`);
    for (const file of files) {
      scanFile(file);
    }
    console.log(`\n=== 扫描完成: ${totalErrors} HIGH, ${totalWarnings} MEDIUM/LOW ===\n`);
    process.exit(totalErrors > 0 ? 1 : 0);
  }
}
```

- [ ] **Step 4: 验证向后兼容**

```bash
node scripts/security-scan.js
```
预期：输出与修改前完全一致（全量扫描）。

```bash
node scripts/security-scan.js --incremental src/daemon/index.js
```
预期：仅输出该文件的匹配结果。

- [ ] **Step 5: Commit**

```bash
git add scripts/security-scan.js
git commit -m "feat: add scanFile resultsArray, scanFiles, module.exports, --incremental flag"
```

---

### Task 2: 创建 securityMonitor 模块

**Files:**
- Create: `src/daemon/securityMonitor.js`
- Test: 手动验证

- [ ] **Step 1: 创建 securityMonitor.js**

```js
const chokidar = require('chokidar');
const path = require('path');
const { scanFiles } = require('../../scripts/security-scan');

const ROOT = path.resolve(__dirname, '../..');
const WATCH_DIRS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'server'),
  path.join(ROOT, 'scripts'),
];
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /coverage/,
  /test\//,
  /tests\//,
  /\.test\./,
  /\.spec\./,
];

function isIgnored(filePath) {
  return IGNORE_PATTERNS.some(p => p.test(filePath));
}

const DEBOUNCE_MS = 300;
let debounceTimer = null;
let pendingFiles = new Set();

function flushScan() {
  const files = [...pendingFiles].filter(f => !isIgnored(f) && f.endsWith('.js'));
  pendingFiles.clear();
  if (files.length === 0) return;
  const results = scanFiles(files);
  const highs = results.filter(r => r.severity === 'HIGH');
  const mediums = results.filter(r => r.severity === 'MEDIUM');
  if (highs.length > 0) {
    console.error(`\x1b[31m🔴 [SECURITY] ${highs.length} HIGH severity issue(s) found:\x1b[0m`);
    highs.forEach(h => console.error(`  ${h.file}:${h.line} - ${h.message}`));
  }
  if (mediums.length > 0) {
    console.error(`\x1b[33m🟡 [SECURITY] ${mediums.length} MEDIUM severity issue(s) found:\x1b[0m`);
  }
}

/**
 * 启动安全文件监控
 * @param {object} [options]
 * @param {boolean} [options.blockOnHigh=false] - HIGH 违规是否阻塞
 * @returns {import('chokidar').FSWatcher}
 */
function startSecurityMonitor(options = {}) {
  const watcher = chokidar.watch(WATCH_DIRS, {
    ignored: IGNORE_PATTERNS,
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on('change', (filePath) => {
    pendingFiles.add(filePath);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushScan, DEBOUNCE_MS);
  });

  watcher.on('add', (filePath) => {
    pendingFiles.add(filePath);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushScan, DEBOUNCE_MS);
  });

  console.log(`\x1b[36m🔒 Security monitor active (watching ${WATCH_DIRS.length} dirs)\x1b[0m`);
  return watcher;
}

function stopSecurityMonitor(watcher) {
  if (watcher) watcher.close();
}

module.exports = { startSecurityMonitor, stopSecurityMonitor };
```

- [ ] **Step 2: 验证模块加载**

```bash
node -e "const m = require('./src/daemon/securityMonitor'); console.log(Object.keys(m))"
```
预期：输出 `['startSecurityMonitor', 'stopSecurityMonitor']`

- [ ] **Step 3: 验证增量扫描集成**

```bash
node -e "
const m = require('./src/daemon/securityMonitor');
const w = m.startSecurityMonitor();
setTimeout(() => m.stopSecurityMonitor(w), 2000);
"
```
预期：2 秒内无报错退出。

- [ ] **Step 4: Commit**

```bash
git add src/daemon/securityMonitor.js
git commit -m "feat: add securityMonitor with chokidar file watching"
```

---

### Task 3: 集成 daemon 安全监控

**Files:**
- Modify: `src/daemon/index.js`
- Test: 手动验证

- [ ] **Step 1: 读取现有 daemon/index.js**

先完整读取文件了解现有结构。

- [ ] **Step 2: 集成 securityMonitor**

在现有 Daemon 类的 `start()` 方法中添加：

```js
const { startSecurityMonitor, stopSecurityMonitor } = require('./securityMonitor');

class Daemon {
  constructor() {
    this.securityWatcher = null;
    // ... existing constructor code
  }

  async start() {
    // ... existing start code

    // 启动安全监控
    if (!process.argv.includes('--no-security')) {
      this.securityWatcher = startSecurityMonitor({
        blockOnHigh: process.env.NODE_ENV === 'production'
      });
    }
  }

  async stop() {
    if (this.securityWatcher) {
      stopSecurityMonitor(this.securityWatcher);
      this.securityWatcher = null;
    }
    // ... existing stop code
  }

  // ... rest of existing class
}
```

注意：保持现有 daemon 的所有其他功能（健康检查、备份清理、主动扫描）不动。

- [ ] **Step 3: 验证集成**

```bash
node src/daemon/index.js start --no-security
```
预期：daemon 正常启动（安全监控被跳过的日志或静默）。

```bash
node src/daemon/index.js start &
sleep 3
node src/daemon/index.js stop
```
预期：控制台输出 "Security monitor active" 后正常停止。

- [ ] **Step 4: Commit**

```bash
git add src/daemon/index.js
git commit -m "feat: integrate securityMonitor into daemon"
```

---

### Task 4: Dev Server 嵌入安全守护

**Files:**
- Modify: `server/index.js`
- Test: 手动验证

- [ ] **Step 1: 在 server/index.js 添加启动逻辑**

在 `server/index.js` 中找到 `listen()` 或启动部分，在 `app.listen()` 之后添加：

```js
if (process.env.NODE_ENV === 'development') {
  try {
    const { startSecurityMonitor } = require('../src/daemon/securityMonitor');
    const watcher = startSecurityMonitor();
    process.on('SIGINT', () => {
      watcher.close();
      process.exit(0);
    });
  } catch (err) {
    console.warn('⚠️  Security monitor unavailable:', err.message);
  }
}
```

注意：如果 `server/index.js` 是 CommonJS，确保 require 路径正确；如果是 ES modules，使用动态 import。

- [ ] **Step 2: 验证 dev 模式启动**

```bash
NODE_ENV=development node server/index.js &
sleep 3
kill %1
```
预期：控制台输出 "Security monitor active"

- [ ] **Step 3: 验证 production 模式不启动**

```bash
NODE_ENV=production node -e "
process.env.NODE_ENV = 'production';
const { startSecurityMonitor } = require('./src/daemon/securityMonitor');
console.log('should not auto-start');
"
```
预期：仅在开发模式启动。

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: auto-start security monitor in dev mode"
```

---

### Task 5: 安装 husky + lint-staged

**Files:**
- Modify: `package.json`
- Create: `.husky/pre-commit`
- Create: `.husky/.gitignore`
- Test: 提交测试

- [ ] **Step 1: 安装依赖**

```bash
npm install --save-dev husky lint-staged
```

- [ ] **Step 2: 初始化 husky**

```bash
npx husky init
```
预期：生成 `.husky/` 目录和 `pre-commit` 文件。

- [ ] **Step 3: 配置 lint-staged 到 package.json**

读取 `package.json`，在根层级添加：

```json
"lint-staged": {
  "*.js": [
    "node scripts/security-scan.js --incremental",
    "eslint --max-warnings=0"
  ]
}
```

- [ ] **Step 4: 配置 husky pre-commit hook**

编辑 `.husky/pre-commit`：

```sh
npx lint-staged
```

- [ ] **Step 5: 备份并移除旧的 pre-commit 钩子**

```bash
mv .git/hooks/pre-commit .git/hooks/pre-commit.backup
```

- [ ] **Step 6: 创建 .husky/.gitignore**

```
*
```

- [ ] **Step 7: 验证 pre-commit**

修改一个 JS 文件添加高危漏洞（例如 `const secret = "hardcoded-key-12345"`），然后：

```bash
git add <file>
git commit -m "test pre-commit"
```
预期：被 lint-staged 拦截，输出安全扫描 + ESLint 错误，提交失败。

```bash
git checkout -- <file>  # 还原测试文件
```

- [ ] **Step 8: Commit**

```bash
git add package.json .husky/
git commit -m "feat: add husky + lint-staged for pre-commit security gate"
```

---

### Task 6: 全量回归验证

**Files:**
- 全项目

- [ ] **Step 1: ESLint 零回归**

```bash
npx eslint . --max-warnings=0
```
预期：0 errors, 0 warnings

- [ ] **Step 2: 安全扫描零回归**

```bash
node scripts/security-scan.js
```
预期：0 HIGH, exit code 0

- [ ] **Step 3: 测试全量通过**

```bash
npm test 2>&1
```
预期：所有测试通过

- [ ] **Step 4: npm audit**

```bash
npm run audit
```
预期：0 vulnerabilities

- [ ] **Step 5: 提交回归验证**

无需提交（无代码变更）。
