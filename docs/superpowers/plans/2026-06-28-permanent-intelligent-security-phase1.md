# Phase 1: 规则 DSL + Auto-Fix 框架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 24 条硬编码 regex 迁移为声明式规则 DSL，新增 auto-fix 能力，规则翻倍至 50+

**Architecture:** 新建 `scripts/rules/` 目录，每条规则一个文件，规则加载器统一管理；auto-fix 框架独立为 `scripts/auto-fix/`；security-scan.js 改造为规则引擎

**Tech Stack:** Node.js, regex, CommonJS modules

---

## 计划结构

Phase 1 分为两个子阶段，各自独立交付：

### Phase 1a: 规则 DSL 基础设施 + 迁移 24 条现有规则
### Phase 1b: Auto-Fix 框架 + 新增 26+ 规则

---

# Phase 1a: 规则 DSL + 迁移现有规则

## 文件结构

```
scripts/
├── security-scan.js          # 修改：改为规则引擎模式
├── rules/                    # 新建
│   ├── index.js              # 规则加载器
│   ├── 01-hardcoded-secrets.js
│   ├── 02-command-injection.js
│   ├── 03-weak-crypto.js
│   ├── 04-insecure-random.js
│   ├── 05-dom-xss.js
│   ├── 06-nosql-injection.js
│   ├── 07-path-traversal.js
│   ├── 08-sql-injection.js
│   ├── 09-prototype-pollution.js
│   ├── 10-ssrf.js
│   ├── 11-sensitive-log.js
│   ├── 12-eval-variant.js
│   ├── 99-best-practices.js
```

---

### Task 1a-1: 创建规则加载器 (rules/index.js)

**Files:**
- Create: `scripts/rules/index.js`
- Create: `scripts/rules/00-template.js`

- [ ] **Step 1: 创建规则加载器**

```js
// scripts/rules/index.js
const fs = require('fs');
const path = require('path');

/** @type {Array<import('./types').Rule>} */
const _rules = [];

function loadRules(rulesDir) {
  const files = fs.readdirSync(rulesDir)
    .filter(f => f.endsWith('.js') && f !== 'index.js' && f !== 'types.js')
    .sort();

  for (const file of files) {
    try {
      const rule = require(path.join(rulesDir, file));
      if (!rule.id || !rule.severity) {
        console.warn(`[rules] Skipping ${file}: missing id or severity`);
        continue;
      }
      rule.enabled = rule.enabled !== false;
      _rules.push(rule);
    } catch (err) {
      console.warn(`[rules] Failed to load ${file}: ${err.message}`);
    }
  }
  return _rules;
}

function getRules(options = {}) {
  let result = _rules;
  if (options.severity) {
    result = result.filter(r => r.severity === options.severity);
  }
  if (options.enabled !== undefined) {
    result = result.filter(r => r.enabled === options.enabled);
  }
  return result;
}

function getRule(id) {
  return _rules.find(r => r.id === id);
}

function reloadRules(rulesDir) {
  _rules.length = 0;
  // 清除 require 缓存
  for (const key of Object.keys(require.cache)) {
    if (key.includes(rulesDir)) {
      delete require.cache[key];
    }
  }
  return loadRules(rulesDir);
}

module.exports = { loadRules, getRules, getRule, reloadRules };
```

- [ ] **Step 2: 创建规则模板**

```js
// scripts/rules/00-template.js
module.exports = {
  id: 'RULE_ID',
  severity: 'HIGH',
  cwe: 'CWE-XXX',
  description: '规则描述',
  enabled: true,
  patterns: [],       // Regex 数组
  excludePatterns: [], // 排除的 regex
  context: {
    requireKeywords: [],
    excludeKeywords: [],
  },
  autoFix: null,       // 或 { description, fix: (match, lines, lineNum) => string }
  references: [],
  since: '2026-06-28',
};
```

- [ ] **Step 3: 验证**

```bash
node -e "
const { loadRules, getRules } = require('./scripts/rules');
const rules = loadRules('./scripts/rules');
console.log('Rules loaded:', rules.length);
console.log('IDs:', rules.map(r => r.id).join(', '));
"
```
预期：仅加载模板规则，显示 "Rules loaded: 1"

- [ ] **Step 4: Commit**

```bash
git add scripts/rules/
git commit -m "feat: add rule loader with DSL template"
```

---

### Task 1a-2: 改造 security-scan.js 为规则引擎模式

**Files:**
- Modify: `scripts/security-scan.js`

将现有的 24 条 inline 检查改为：启动时加载 rules/ 目录，扫描时逐条规则匹配。

- [ ] **Step 1: 添加规则加载入口**

在文件顶部添加：
```js
const { loadRules, getRules } = require('./rules');
const RULES_DIR = path.join(__dirname, 'rules');
let RULES = [];

// 初始化规则
function initRules() {
  if (RULES.length === 0) {
    RULES = loadRules(RULES_DIR);
  }
  return RULES;
}
```

- [ ] **Step 2: 添加规则引擎扫描函数**

在 `scanFile` 函数前添加：
```js
function scanFileWithRules(filePath, resultsArray) {
  const relativePath = path.relative(ROOT, filePath);
  if (shouldExclude(relativePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const rules = initRules();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const pattern of rule.patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!pattern.test(line)) continue;
        // 检查 exclude 条件
        if (rule.excludePatterns && rule.excludePatterns.some(ep => ep.test(line))) continue;
        // 检查 context 关键词
        if (rule.context && rule.context.requireKeywords && rule.context.requireKeywords.length > 0) {
          const hasKeyword = rule.context.requireKeywords.some(kw => 
            line.toLowerCase().includes(kw.toLowerCase()) ||
            (i > 0 && lines[i-1].toLowerCase().includes(kw.toLowerCase()))
          );
          if (!hasKeyword) continue;
        }
        // 命中！
        const detail = `行 ${i + 1}: ${line.trim().substring(0, 100)}`;
        if (resultsArray) resultsArray.push({ severity: rule.severity, ruleId: rule.id, file: relativePath, message: rule.description, detail });
        report(rule.severity, rule.id, detail, relativePath, rule.description);
      }
    }
  }
}
```

- [ ] **Step 3: 保持向后兼容**

保留原有的旧 `scanFile` 函数（24 条 inline 检查），只添加新函数。在 CLI 入口处，可以通过环境变量 `USE_RULES_ENGINE=true` 切换。当新引擎输出与旧引擎完全一致后，再删除旧代码。

在 CLI 入口添加：
```js
if (process.env.USE_RULES_ENGINE === 'true') {
  scanFile = scanFileWithRules;
  scanFiles = (filePaths) => {
    const results = [];
    for (const fp of filePaths) {
      scanFileWithRules(fp, results);
    }
    return results;
  };
}
```

- [ ] **Step 4: 验证**

```bash
# 旧引擎（默认）
node scripts/security-scan.js 2>&1 | Select-Object -First 5
# 新引擎
$env:USE_RULES_ENGINE = 'true'
node scripts/security-scan.js 2>&1 | Select-Object -First 5
```
新引擎当前只输出 1 条模板规则（无实际检查），所以会显示 0 结果。这是预期的过渡状态。

- [ ] **Step 5: Commit**

```bash
git add scripts/security-scan.js
git commit -m "feat: add rules engine mode with USE_RULES_ENGINE flag"
```

---

### Task 1a-3: 迁移现有检查 1-8 到 DSL 规则

**Files:**
- Create: `scripts/rules/01-hardcoded-secrets.js`
- Create: `scripts/rules/02-command-injection.js`
- Create: `scripts/rules/03-weak-crypto.js`
- Create: `scripts/rules/04-insecure-random.js`
- Create: `scripts/rules/05-dom-xss.js`
- Create: `scripts/rules/06-nosql-injection.js`
- Create: `scripts/rules/07-path-traversal.js`
- Create: `scripts/rules/08-sql-injection.js`

将 security-scan.js 中对应的检查（~检查6,8,21,18,17,16,19,7）迁移到 DSL 规则文件。

每条规则迁移模板：

```js
// scripts/rules/01-hardcoded-secrets.js
module.exports = {
  id: 'HARDCODED_SECRET',
  severity: 'HIGH',
  cwe: 'CWE-798',
  description: '硬编码密钥/密码，应从环境变量或密钥管理服务读取',
  enabled: true,
  patterns: [
    /(?:password|apiKey|api_key|api_secret|secret|private_key|accessToken|refreshToken)\s*[:=]\s*['"]([^'"\s]{8,})['"]/
  ],
  excludePatterns: [
    /process\.env/,
    /require\(/,
    /\/\/|^\s*\*/,
    /['"]default['"]\s*[:=]/,
  ],
  context: {
    excludeKeywords: ['placeholder', 'changeme', 'your-', 'example', 'test-', 'dummy', 'fake'],
  },
  references: ['CWE-798'],
  since: '2026-06-28',
};
```

- [ ] **Step 1: 创建 8 个规则文件**，每个从 security-scan.js 提取对应的检查逻辑

对应关系：

| 规则文件 | 对应原检查 | 严重性 |
|---------|-----------|--------|
| 01-hardcoded-secrets.js | 检查6 (HARDCODED_SECRET) | HIGH |
| 02-command-injection.js | 检查8 (COMMAND_INJECTION) | HIGH |
| 03-weak-crypto.js | 检查21 (WEAK_HASH + WEAK_TLS) | HIGH |
| 04-insecure-random.js | 检查18 (INSECURE_RANDOM) | HIGH |
| 05-dom-xss.js | 检查5+17 (INNER_HTML_XSS + DOM_XSS) | MED/HIGH |
| 06-nosql-injection.js | 检查16 (NOSQL_INJECTION) | HIGH |
| 07-path-traversal.js | 检查1+19 (S3_KEY_PATH + PATH_TRAVERSAL) | HIGH |
| 08-sql-injection.js | 检查7 (SQL_INJECTION) | HIGH |

- [ ] **Step 2: 验证**

```bash
$env:USE_RULES_ENGINE = 'true'
node scripts/security-scan.js 2>&1 | Select-Object -Last 3
```
预期：输出规则引擎模式下的扫描结果，应与旧引擎一致（0 HIGH 或相同结果）

- [ ] **Step 3: 与旧引擎对比输出**

```bash
# 旧引擎输出保存
node scripts/security-scan.js 2>&1 | Out-File old-output.txt
# 新引擎输出
$env:USE_RULES_ENGINE = 'true'
node scripts/security-scan.js 2>&1 | Out-File new-output.txt
# 对比
Compare-Object (Get-Content old-output.txt) (Get-Content new-output.txt)
```
预期：两条输出完全一致（忽略文件扫描数差异，新旧扫描的文件集合可能不同）

- [ ] **Step 4: Commit**

```bash
git add scripts/rules/0{1,2,3,4,5,6,7,8}-*.js
git commit -m "feat: migrate checks 1-8 to DSL rules"
```

---

### Task 1a-4: 迁移现有检查 9-24 到 DSL 规则

**Files:**
- Create: `scripts/rules/09-prototype-pollution.js`
- Create: `scripts/rules/10-ssrf.js`
- Create: `scripts/rules/11-sensitive-log.js`
- Create: `scripts/rules/12-eval-variant.js`
- Create: `scripts/rules/13-open-redirect.js`
- Create: `scripts/rules/14-insecure-deserialize.js`
- Create: `scripts/rules/15-host-header-injection.js`
- Create: `scripts/rules/16-cors-wildcard.js`
- Create: `scripts/rules/17-toctou-file.js`
- Create: `scripts/rules/18-user-regex.js`
- Create: `scripts/rules/19-error-leak.js`
- Create: `scripts/rules/20-log-forging.js`
- Create: `scripts/rules/21-missing-body-limit.js`
- Create: `scripts/rules/22-s3-path-traversal.js`

- [ ] **Step 1: 创建 14 个规则文件**，将剩余的检查迁移到 DSL

| 规则文件 | 对应原检查 | 严重性 |
|---------|-----------|--------|
| 09-prototype-pollution.js | 检查9 | MEDIUM |
| 10-ssrf.js | 检查10 | MEDIUM |
| 11-sensitive-log.js | 检查11 | MEDIUM |
| 12-eval-variant.js | 检查23 | HIGH/MED |
| 13-open-redirect.js | 检查14 | MEDIUM |
| 14-insecure-deserialize.js | 检查15 | MEDIUM |
| 15-host-header-injection.js | 检查12 | MEDIUM |
| 16-cors-wildcard.js | 检查13 | MED/HIGH |
| 17-toctou-file.js | 检查4 | MEDIUM |
| 18-user-regex.js | 检查3 | MEDIUM |
| 19-error-leak.js | 检查2 | MEDIUM |
| 20-log-forging.js | 检查22 | MEDIUM |
| 21-missing-body-limit.js | 检查24 | LOW |
| 22-s3-path-traversal.js | 检查1 (剩余部分) | HIGH |

- [ ] **Step 2: 全量输出对比**

```bash
$env:USE_RULES_ENGINE = 'true'
node scripts/security-scan.js 2>&1 | Out-File new-output.txt
# 对比旧引擎输出（来自 Task 1a-3）
Compare-Object (Get-Content old-output.txt) (Get-Content new-output.txt)
```
预期：两条输出完全一致。

- [ ] **Step 3: 删除旧 inline 检查代码**

当确认新引擎输出与旧引擎完全一致后，删除 `security-scan.js` 中的 24 条 inline 检查，将 `scanFile` 替换为 `scanFileWithRules`，移除 `USE_RULES_ENGINE` 切换逻辑。

- [ ] **Step 4: 全量回归**

```bash
npx eslint . --max-warnings=0; if ($?) { node scripts/security-scan.js } else { Write-Output 'ESLint failed' }
```
预期：ESLint 0/0，安全扫描 0 HIGH

- [ ] **Step 5: Commit**

```bash
git add scripts/rules/ scripts/security-scan.js
git commit -m "feat: migrate all 24 checks to DSL rules, remove inline checks"
```

---

## Phase 1a 验收标准

1. ✅ `scripts/rules/index.js` 可加载所有规则文件
2. ✅ 新规则引擎输出与旧引擎 100% 一致
3. ✅ 旧 inline 检查代码已删除
4. ✅ ESLint 0/0, Security 0 HIGH
5. ✅ 规则可独立启用/禁用

---

# Phase 1b: Auto-Fix 框架 + 新增规则

## 文件结构

```
scripts/
├── auto-fix/                # 新建
│   ├── index.js             # 修复调度器
│   ├── crypto-fix.js        # Math.random → crypto.randomBytes
│   ├── hash-fix.js          # md5/sha1 → sha256
│   ├── exec-fix.js          # exec → spawn
│   └── log-fix.js           # console.log → logger
├── rules/
│   ├── 23-aws-keys.js       # 新增
│   ├── 24-jwt-hardcoded.js  # 新增
│   ├── ...                  # 其余新增规则
```

---

### Task 1b-1: 创建 Auto-Fix 框架

**Files:**
- Create: `scripts/auto-fix/index.js`
- Create: `scripts/auto-fix/crypto-fix.js`
- Create: `scripts/auto-fix/hash-fix.js`

- [ ] **Step 1: 创建修复调度器**

```js
// scripts/auto-fix/index.js
const cryptoFix = require('./crypto-fix');
const hashFix = require('./hash-fix');

const FIXERS = [cryptoFix, hashFix];

function canFix(ruleId) {
  return FIXERS.some(f => f.ruleIds.includes(ruleId));
}

function applyFix(filePath, match, dryRun = true) {
  const fixer = FIXERS.find(f => f.ruleIds.includes(match.ruleId));
  if (!fixer) return null;
  return fixer.fix(filePath, match, dryRun);
}

function fixAll(results, dryRun = true) {
  const applied = [];
  for (const match of results) {
    const result = applyFix(match.file, match, dryRun);
    if (result) applied.push(result);
  }
  return applied;
}

module.exports = { canFix, applyFix, fixAll };
```

- [ ] **Step 2: 创建 crypto-fix 修复器**

```js
// scripts/auto-fix/crypto-fix.js
const fs = require('fs');

module.exports = {
  ruleIds: ['INSECURE_RANDOM'],
  description: '替换 Math.random() 为 crypto.randomBytes()',
  
  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const lineNum = parseInt(match.detail.match(/行 (\d+)/)[1]) - 1;
    const line = lines[lineNum];

    // 检测需要多少个字节
    const byteMatch = line.match(/Math\.random\(\)\.toString\((\d+)\)/);
    let replacement;
    if (byteMatch) {
      const radix = parseInt(byteMatch[1]);
      const bytes = Math.ceil(16 / (Math.log(radix) / Math.log(2)));
      replacement = line.replace(
        /Math\.random\(\)\.toString\(\d+\)/,
        `crypto.randomBytes(${bytes}).toString('${radix}')`
      );
    } else {
      // 默认：6 字节生成 12 字符 hex
      replacement = line.replace(/Math\.random\(\)/, 'crypto.randomBytes(6).toString(\'hex\')');
    }

    if (dryRun) {
      return { file: match.file, line: lineNum + 1, before: line.trim(), after: replacement.trim() };
    }

    // 添加 crypto require（如果还没有）
    const hasCryptoRequire = content.includes("require('crypto')") || content.includes('require("crypto")');
    let newContent = content;
    if (!hasCryptoRequire) {
      const firstLine = lines[0];
      newContent = newContent.replace(firstLine, `const crypto = require('crypto');\n${firstLine}`);
    }
    lines[lineNum] = replacement;
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: lineNum + 1, fixed: true };
  }
};
```

- [ ] **Step 3: 创建 hash-fix 修复器**

```js
// scripts/auto-fix/hash-fix.js
const fs = require('fs');

module.exports = {
  ruleIds: ['WEAK_HASH'],
  description: '替换 md5/sha1 为 sha256',
  
  fix(filePath, match, dryRun) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lineNum = parseInt(match.detail.match(/行 (\d+)/)[1]) - 1;
    const lines = content.split('\n');
    const line = lines[lineNum];

    const replacement = line
      .replace(/['"`]md5['"`]/g, "'sha256'")
      .replace(/['"`]sha1['"`]/g, "'sha256'");

    if (dryRun) {
      return { file: match.file, line: lineNum + 1, before: line.trim(), after: replacement.trim() };
    }

    lines[lineNum] = replacement;
    fs.writeFileSync(filePath, lines.join('\n'));
    return { file: match.file, line: lineNum + 1, fixed: true };
  }
};
```

- [ ] **Step 4: 创建 security-fix.js CLI 入口**

```js
// scripts/security-fix.js
const { scanFiles } = require('./security-scan');
const { fixAll, canFix } = require('./auto-fix');

const isDryRun = process.argv.includes('--fix-dry-run') || !process.argv.includes('--fix');
const files = process.argv.slice(2).filter(f => !f.startsWith('-'));

if (files.length === 0) {
  console.log('Usage: node scripts/security-fix.js [--fix | --fix-dry-run] <file1.js> [file2.js ...]');
  console.log('  --fix           修改文件应用修复');
  console.log('  --fix-dry-run   只输出建议不修改（默认）');
  process.exit(0);
}

const results = scanFiles(files);
const fixable = results.filter(r => canFix(r.ruleId));

if (fixable.length === 0) {
  console.log('No fixable issues found.');
  process.exit(0);
}

console.log(`Found ${fixable.length} fixable issue(s):`);
const applied = fixAll(fixable, isDryRun);
applied.forEach(a => {
  if (isDryRun) {
    console.log(`  ${a.file}:${a.line}`);
    console.log(`    - ${a.before}`);
    console.log(`    + ${a.after}`);
  } else {
    console.log(`  ✅ ${a.file}:${a.line} - fixed`);
  }
});
```

- [ ] **Step 5: 验证**

创建测试文件测试 auto-fix：
```bash
# 测试 crypto-fix
$tmp = "$env:TEMP\opencode\test-crypto.js"
"'use strict';`nconst token = Math.random().toString(36);" | Set-Content $tmp
node scripts/security-fix.js --fix-dry-run $tmp
```
预期：输出建议替换为 `crypto.randomBytes(6).toString('hex')`

```bash
# 测试 hash-fix
$tmp = "$env:TEMP\opencode\test-hash.js"
"const hash = crypto.createHash('md5');" | Set-Content $tmp
node scripts/security-fix.js --fix-dry-run $tmp
```
预期：输出建议替换为 `'sha256'`

- [ ] **Step 6: Commit**

```bash
git add scripts/auto-fix/ scripts/security-fix.js
git commit -m "feat: add auto-fix framework with crypto/hash fixers"
```

---

### Task 1b-2: 新增 26+ 规则（HIGH 优先）

**Files:**
- Create: `scripts/rules/23-aws-keys.js`
- Create: `scripts/rules/24-jwt-hardcoded.js`
- Create: `scripts/rules/25-db-connection-string.js`
- Create: `scripts/rules/26-oauth-token.js`
- Create: `scripts/rules/27-npm-token.js`
- Create: `scripts/rules/28-weak-tls-version.js`
- Create: `scripts/rules/29-eval-alternative.js`
- Create: `scripts/rules/30-proto-access.js`
- Create: `scripts/rules/31-regex-dos.js`

- [ ] **Step 1: 创建 9 个 HIGH 规则**

每条规则一个文件，使用 DSL 格式。参考已有规则的模式编写。

关键新增 HIGH 规则：

```js
// 23-aws-keys.js
module.exports = {
  id: 'AWS_KEY_HARDCODED',
  severity: 'HIGH',
  cwe: 'CWE-798',
  description: '硬编码 AWS 访问密钥',
  enabled: true,
  patterns: [
    /(?:AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})/,
    /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*['"][A-Za-z0-9\/+=]{20,}['"]/
  ],
  excludePatterns: [/process\.env/, /require\(/],
  references: ['CWE-798', 'AWS IAM Best Practices'],
  since: '2026-06-28',
};
```

```js
// 24-jwt-hardcoded.js
module.exports = {
  id: 'JWT_HARDCODED_SECRET',
  severity: 'HIGH',
  cwe: 'CWE-798',
  description: 'JWT 签名使用硬编码密钥',
  enabled: true,
  patterns: [
    /jwt\.sign\([^,]+,\s*['"]([^'"]{8,})['"]/
  ],
  excludePatterns: [/process\.env/],
  references: ['CWE-798'],
  since: '2026-06-28',
};
```

```js
// 25-db-connection-string.js
module.exports = {
  id: 'DB_CONNECTION_HARDCODED',
  severity: 'HIGH',
  cwe: 'CWE-798',
  description: '数据库连接串含硬编码密码',
  enabled: true,
  patterns: [
    /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/
  ],
  excludePatterns: [/process\.env/],
  references: ['CWE-798'],
  since: '2026-06-28',
};
```

（其余 6 条 HIGH 规则类似格式，不一一列出 — 按相同模式编写即可）

- [ ] **Step 2: 验证新增 HIGH 规则**

创建含 AWS key 的测试文件：
```bash
$tmp = "$env:TEMP\opencode\test-aws.js"
"'use strict';`nconst key = 'AKIAIOSFODNN7EXAMPLE';" | Set-Content $tmp
node scripts/security-scan.js --incremental $tmp
```
预期：检测到 AWS_KEY_HARDCODED

- [ ] **Step 3: Commit HIGH 规则**

```bash
git add scripts/rules/2{3,4,5,6,7,8,9,30,31}-*.js
git commit -m "feat: add 9 HIGH severity rules (AWS/JWT/DB/OAuth/npm/TLS/eval/proto/ReDoS)"
```

- [ ] **Step 4: 新增 MEDIUM 规则（~8 条）**

```
32-file-upload-limit.js
33-csrf-token.js
34-cookie-secure-flag.js
35-cors-allow-all.js
36-missing-content-type-options.js
37-missing-frame-options.js
38-hardcoded-user-agent.js
39-deep-nesting.js
```

- [ ] **Step 5: 新增 LOW 规则（~6 条）**

```
40-todo-comment.js
41-var-declaration.js
42-empty-catch.js
43-unused-variable.js
44-duplicate-object-key.js
45-large-file.js
```

- [ ] **Step 6: 全量验证 + 总规则数确认**

```bash
node -e "
const { loadRules, getRules } = require('./scripts/rules');
const rules = loadRules('./scripts/rules');
console.log('Total rules:', rules.length);
console.log('HIGH:', rules.filter(r => r.severity === 'HIGH').length);
console.log('MEDIUM:', rules.filter(r => r.severity === 'MEDIUM').length);
console.log('LOW:', rules.filter(r => r.severity === 'LOW').length);
"
```
预期：Total rules: 50+（含已有 24 条迁移 + 新增 26+）

- [ ] **Step 7: 全量回归**

```bash
npx eslint . --max-warnings=0; if ($?) { node scripts/security-scan.js } else { Write-Output 'ESLint failed' }
```
预期：ESLint 0/0，Security 0 HIGH

- [ ] **Step 8: Commit**

```bash
git add scripts/rules/3{2,3,4,5,6,7,8,9}-*.js scripts/rules/4{0,1,2,3,4,5}-*.js
git commit -m "feat: add 14 MEDIUM/LOW rules for broader coverage"
```

---

## Phase 1b 验收标准

1. ✅ `--fix-dry-run` 输出可读的修复建议
2. ✅ `--fix` 自动修改文件
3. ✅ 9 条新增 HIGH 规则全部可检测
4. ✅ 8 条新增 MEDIUM 规则覆盖
5. ✅ 6 条新增 LOW 规则覆盖
6. ✅ 规则总数 50+
7. ✅ 零回归

---

## 全量回归

### Task 1b-Final: 最终回归验证

- [ ] **ESLint**: `npx eslint . --max-warnings=0` → 0/0
- [ ] **Security scan**: `node scripts/security-scan.js` → 0 HIGH
- [ ] **Tests**: `npm test` → 363/46/0
- [ ] **Audit**: `npm run audit` → 0 vulns
