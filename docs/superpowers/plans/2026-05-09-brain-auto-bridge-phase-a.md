# BrainSystem 自动桥接 Phase A 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 BrainSystem 从"手动拉"变为"自动推"——AI 助手每次响应前自动调用大脑，无需手动运行 brain-context.js + brain-decision.js

**Architecture:** 新建 brain-bridge.js 作为统一入口，调用 forceThink + analyzeIntent + LessonReminder + ProactiveThinking，输出结构化 JSON 供 AI 助手自动消费。同时在 BrainSystem 上新增 connectHooks() 与现有 HooksManager 接线。

**Tech Stack:** Node.js (现有), HooksManager (现有, 位于 src/hooks/), BrainSystem (现有, 6800+行)

---

## 文件映射

| 文件 | 操作 | 职责 |
|------|------|------|
| `.opencode/brain.config.json` | 创建 | 配置开关 + 断路器参数 |
| `src/core/BrainBridge.js` | 创建 | 桥接核心逻辑（不依赖 CLI） |
| `src/core/AuditLogger.js` | 创建 | JSONL 审计日志写入器 |
| `src/core/LoopGuard.js` | 创建 | 循环检测 + 熔断 |
| `src/core/CircuitBreaker.js` | 创建 | 断路器状态机 |
| `brain-bridge.js` | 创建 | CLI 入口，输出 JSON 到 stdout |
| `src/core/BrainSystem.js` | 修改 | 新增 connectHooks() / disconnectHooks() / isHooksConnected() |
| `AGENTS.md` | 修改 | 替换手动指令为自动机制 |

---

### Task 1: 基础设施 — CircuitBreaker

**Files:**
- Create: `src/core/CircuitBreaker.js`
- Test: inline verification

- [ ] **Step 1: Write CircuitBreaker class**

```javascript
// src/core/CircuitBreaker.js
const fs = require('fs');
const path = require('path');

class CircuitBreaker {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.resetAfterMs = options.resetAfterMs || 60000;
    this._state = 'OPEN'; // OPEN | HALF_OPEN | CLOSED
    this._failureCount = 0;
    this._lastFailureTime = 0;
    this._stateFile = path.join(process.cwd(), '.opencode', 'evolution', 'circuit-breaker.json');
    this._load();
  }

  get state() { return this._state; }
  get failureCount() { return this._failureCount; }

  isAllowed() {
    if (this._state === 'CLOSED') return false;
    if (this._state === 'HALF_OPEN') {
      if (Date.now() - this._lastFailureTime > this.resetAfterMs) {
        this._state = 'OPEN';
        this._failureCount = 0;
        this._save();
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this._failureCount = 0;
    this._state = 'OPEN';
    this._save();
  }

  recordFailure() {
    this._failureCount++;
    this._lastFailureTime = Date.now();
    if (this._failureCount >= this.maxRetries) {
      this._state = 'CLOSED';
    }
    this._save();
  }

  reset() {
    this._state = 'OPEN';
    this._failureCount = 0;
    this._save();
  }

  _load() {
    try {
      if (fs.existsSync(this._stateFile)) {
        const data = JSON.parse(fs.readFileSync(this._stateFile, 'utf8'));
        this._state = data.state || 'OPEN';
        this._failureCount = data.failureCount || 0;
        this._lastFailureTime = data.lastFailureTime || 0;
      }
    } catch (e) { /* 使用默认值 */ }
  }

  _save() {
    try {
      const dir = path.dirname(this._stateFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._stateFile, JSON.stringify({
        state: this._state,
        failureCount: this._failureCount,
        lastFailureTime: this._lastFailureTime
      }));
    } catch (e) { /* 持久化失败不影响运行 */ }
  }
}

module.exports = CircuitBreaker;
```

- [ ] **Step 2: Verify CircuitBreaker works**

Run: `node -e "var C=require('./src/core/CircuitBreaker');var c=new C({maxRetries:2});console.log('open:',c.isAllowed());c.recordFailure();c.recordFailure();console.log('closed:',!c.isAllowed());c.reset();console.log('reset:',c.isAllowed());"`
Expected: `open: true` `closed: true` `reset: true`

---

### Task 2: 基础设施 — LoopGuard

**Files:**
- Create: `src/core/LoopGuard.js`
- Test: inline verification

- [ ] **Step 1: Write LoopGuard class**

```javascript
// src/core/LoopGuard.js
class LoopGuard {
  constructor(options = {}) {
    this._maxHistory = options.maxHistory || 50;
    this._maxPerMinute = options.maxPerMinute || 3;
    this._history = [];
    this._tripped = false;
  }

  get isTripped() { return this._tripped; }

  check(source, action) {
    const now = Date.now();
    this._history.push({ source, action, time: now });
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
    const oneMinuteAgo = now - 60000;
    const recent = this._history.filter(h => h.time > oneMinuteAgo);
    const pattern = `${source}:${action}`;
    const count = recent.filter(h => `${h.source}:${h.action}` === pattern).length;
    if (count > this._maxPerMinute) {
      this._tripped = true;
      return { tripped: true, pattern, count, recentTotal: recent.length };
    }
    return { tripped: false, pattern, count, recentTotal: recent.length };
  }

  reset() {
    this._tripped = false;
    this._history = [];
  }
}

module.exports = LoopGuard;
```

- [ ] **Step 2: Verify LoopGuard**

Run: `node -e "var L=require('./src/core/LoopGuard');var l=new L({maxPerMinute:2});console.log(l.check('test','x').tripped);console.log(l.check('test','x').tripped);console.log(l.check('test','x').tripped);"`
Expected: `false` `false` `true` (third call exceeds 2/min threshold)

---

### Task 3: 基础设施 — AuditLogger

**Files:**
- Create: `src/core/AuditLogger.js`
- Test: inline verification

- [ ] **Step 1: Write AuditLogger class**

```javascript
// src/core/AuditLogger.js
const fs = require('fs');
const path = require('path');

class AuditLogger {
  constructor(options = {}) {
    this._logDir = options.logDir || path.join(process.cwd(), '.opencode', 'evolution', 'audit');
    this._maxDays = options.maxDays || 90;
    if (!fs.existsSync(this._logDir)) {
      fs.mkdirSync(this._logDir, { recursive: true });
    }
    this._cleanOld();
  }

  log(entry) {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(this._logDir, `${today}.jsonl`);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry
    }) + '\n';
    fs.appendFileSync(file, line, 'utf8');
  }

  _cleanOld() {
    try {
      const files = fs.readdirSync(this._logDir);
      const cutoff = Date.now() - this._maxDays * 86400000;
      for (const f of files) {
        const fp = path.join(this._logDir, f);
        const stat = fs.statSync(fp);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
        }
      }
    } catch (e) { /* 清理失败不中断 */ }
  }

  getTodayLog() {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(this._logDir, `${today}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  }
}

module.exports = AuditLogger;
```

- [ ] **Step 2: Verify AuditLogger writes and reads**

Run: `node -e "var A=require('./src/core/AuditLogger');var a=new A();a.log({level:'test',module:'verify',action:'ping'});var logs=a.getTodayLog();console.log('logged:',logs.length>0);console.log('action:',logs[0].action);"`
Expected: `logged: true` `action: ping`

---

### Task 4: 基础设施 — Config Loader

**Files:**
- Create: `.opencode/brain.config.json` (default config)
- Modify: `src/core/BrainBridge.js` (config loading inside)
- Test: inline verification

- [ ] **Step 1: Create default config**

```json
{
  "enabled": true,
  "autoBridge": true,
  "daemon": false,
  "fullAuto": false,
  "circuitBreaker": {
    "maxRetries": 3,
    "resetAfterMs": 60000
  },
  "loopGuard": {
    "maxHistory": 50,
    "maxPerMinute": 3
  },
  "audit": {
    "maxDays": 90
  },
  "backup": {
    "maxBackups": 30,
    "minDiskSpaceMB": 100
  }
}
```

Write to `.opencode/brain.config.json`.

- [ ] **Step 2: Write loadConfig() utility**

Inside `src/core/BrainBridge.js`, add a config loader:

```javascript
function loadConfig() {
  // 优先级: 环境变量 > 配置文件 > 默认值
  const configPath = path.join(process.cwd(), '.opencode', 'brain.config.json');
  let config = {
    enabled: true, autoBridge: true, daemon: false, fullAuto: false,
    circuitBreaker: { maxRetries: 3, resetAfterMs: 60000 },
    loopGuard: { maxHistory: 50, maxPerMinute: 3 },
    audit: { maxDays: 90 },
    backup: { maxBackups: 30, minDiskSpaceMB: 100 }
  };
  try {
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...fileConfig };
    }
  } catch (e) { /* 配置加载失败使用默认值 */ }
  // 环境变量覆盖
  if (process.env.BRAIN_DISABLE === '1') config.enabled = false;
  return config;
}
```

- [ ] **Step 3: Verify config loading**

Run: `node -e "var path=require('path');var fs=require('fs');var cfg=JSON.parse(fs.readFileSync('.opencode/brain.config.json'));console.log('loaded:',cfg.enabled!==undefined);console.log('keys:',Object.keys(cfg).join(','));"`
Expected: `loaded: true` `keys: enabled,autoBridge,daemon,fullAuto,circuitBreaker,...`

---

### Task 5: 核心模块 — BrainBridge

**Files:**
- Create: `src/core/BrainBridge.js` (full implementation)
- Test: inline verification

- [ ] **Step 1: Write BrainBridge complete module**

```javascript
// src/core/BrainBridge.js
const path = require('path');
const fs = require('fs');
const CircuitBreaker = require('./CircuitBreaker');
const LoopGuard = require('./LoopGuard');
const AuditLogger = require('./AuditLogger');

function loadConfig() {
  const configPath = path.join(process.cwd(), '.opencode', 'brain.config.json');
  let config = {
    enabled: true, autoBridge: true, daemon: false, fullAuto: false,
    circuitBreaker: { maxRetries: 3, resetAfterMs: 60000 },
    loopGuard: { maxHistory: 50, maxPerMinute: 3 },
    audit: { maxDays: 90 },
    backup: { maxBackups: 30, minDiskSpaceMB: 100 }
  };
  try {
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...fileConfig };
    }
  } catch (e) { /* 使用默认值 */ }
  if (process.env.BRAIN_DISABLE === '1') config.enabled = false;
  return config;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function backupBeforeWrite(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const config = loadConfig();
    const backupDir = path.join(process.cwd(), '.opencode', 'backups');
    ensureDir(backupDir);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const relPath = path.relative(process.cwd(), filePath).replace(/[\\/]/g, '_');
    const backupFile = path.join(backupDir, `${ts}_${relPath}.bak`);
    fs.copyFileSync(filePath, backupFile);
    // 清理旧备份
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.bak'))
      .sort()
      .reverse();
    if (files.length > config.backup.maxBackups) {
      files.slice(config.backup.maxBackups).forEach(f => {
        fs.unlinkSync(path.join(backupDir, f));
      });
    }
    return backupFile;
  } catch (e) {
    return null;
  }
}

class BrainBridge {
  constructor() {
    this._config = loadConfig();
    this._initialized = false;
    this._breaker = null;
    this._loopGuard = null;
    this._audit = null;
    this._brainSystem = null;
  }

  get enabled() { return this._config && this._config.enabled; }

  initialize() {
    if (this._initialized) return;
    this._config = loadConfig();
    if (!this.enabled) return;
    this._breaker = new CircuitBreaker(this._config.circuitBreaker);
    this._loopGuard = new LoopGuard(this._config.loopGuard);
    this._audit = new AuditLogger(this._config.audit);
    try {
      this._brainSystem = require('./BrainSystem');
    } catch (e) {
      this._audit?.log({ level: 'error', module: 'bridge', action: 'init_failed', error: e.message });
    }
    this._initialized = true;
  }

  process(input, taskType) {
    const start = Date.now();
    this.initialize();

    if (!this.enabled || !this._breaker.isAllowed()) {
      return this._emptyResult('disabled', start);
    }

    // 循环检测
    const loopCheck = this._loopGuard.check('brain-bridge', 'process');
    if (loopCheck.tripped) {
      this._audit.log({ level: 'warn', module: 'bridge', action: 'loop_tripped', detail: loopCheck });
      return { ...this._emptyResult('loop_guard', start), loopGuardTripped: true, blockedActions: [loopCheck.pattern] };
    }

    try {
      const result = this._execute(input, taskType);
      this._breaker.recordSuccess();
      this._audit.log({ level: 'info', module: 'bridge', action: 'success', durationMs: Date.now() - start });
      return result;
    } catch (e) {
      this._breaker.recordFailure();
      this._audit.log({ level: 'error', module: 'bridge', action: 'failed', error: e.message, durationMs: Date.now() - start });
      return this._emptyResult('error', start);
    }
  }

  _execute(input, taskType) {
    if (!this._brainSystem) return this._emptyResult('no_brain', Date.now());

    // 1. forceThink
    const forceThinkResult = this._brainSystem.forceThink ? this._brainSystem.forceThink(input) : {};

    // 2. analyzeIntent
    const intentResult = this._brainSystem.analyzeIntent ? this._brainSystem.analyzeIntent(input) : {};
    const resolvedType = taskType || this._resolveTaskType(intentResult.intent || '');

    // 3. LessonReminder
    let lessons = [];
    let warnings = [];
    try {
      const LessonReminder = require('./LessonReminder');
      const relevant = LessonReminder.getRelevantLessons(resolvedType, 5);
      lessons = relevant.map(l => ({
        id: l.id || '',
        title: l.lesson || '',
        priority: l.priority || 'medium',
        category: l.category || '',
        effectiveness: l.effectiveness || 0
      }));
      warnings = relevant
        .filter(l => l.priority === 'high' && (!l.useCount || l.useCount < 1))
        .map(l => `${l.id}: ${l.lesson}`);
    } catch (e) { /* 教训加载失败不影响主流程 */ }

    // 4. ProactiveThinking
    let proactive = {};
    try {
      if (this._brainSystem.proactiveThink) {
        const pr = this._brainSystem.proactiveThink(input, {});
        proactive = {
          interactionCount: pr.interactionCount || 0,
          topIntent: pr.predictions?.topIntent || null
        };
      }
    } catch (e) { /* 主动思考失败不中断 */ }

    return {
      intent: { type: intentResult.intent || null, confidence: intentResult.confidence || 0 },
      taskType: resolvedType,
      lessons,
      warnings: warnings.slice(0, 3),
      suggestions: [],
      proactive,
      source: 'brain-bridge-v1',
      durationMs: Date.now() - start
    };
  }

  _resolveTaskType(intentText) {
    const map = {
      '代码': 'code', '写': 'code', '函数': 'code',
      '学习': 'test', '研究': 'test',
      '安全': 'security', '审计': 'security',
      '优化': 'refactor', '性能': 'refactor',
      '调试': 'fix', 'debug': 'fix', 'bug': 'fix',
      '测试': 'test', 'test': 'test'
    };
    const lower = (intentText || '').toLowerCase();
    for (const [key, val] of Object.entries(map)) {
      if (lower.includes(key) || intentText.includes(key)) return val;
    }
    return 'default';
  }

  _emptyResult(reason, startTime) {
    return {
      intent: null, taskType: null, lessons: [], warnings: [],
      suggestions: [], proactive: {},
      source: 'brain-bridge-v1', error: reason, durationMs: Date.now() - startTime
    };
  }

  // 仪表盘状态
  getStatus() {
    this.initialize();
    return {
      enabled: this.enabled,
      breakerState: this._breaker?.state || 'UNKNOWN',
      breakerFailures: this._breaker?.failureCount || 0,
      loopTripped: this._loopGuard?.isTripped || false,
      initialized: this._initialized,
      hasBrain: !!this._brainSystem
    };
  }

  // 紧急操作
  emergencyStop() {
    this._config.enabled = false;
    try {
      const configPath = path.join(process.cwd(), '.opencode', 'brain.config.json');
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      existing.enabled = false;
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
    } catch (e) { /* */ }
    this._audit?.log({ level: 'warn', module: 'bridge', action: 'emergency_stop' });
  }

  // 执行备份
  backup(filePath) {
    return backupBeforeWrite(filePath);
  }
}

module.exports = { BrainBridge, loadConfig, backupBeforeWrite };
```

- [ ] **Step 2: Verify BrainBridge processes input**

Run: `node -e "var B=require('./src/core/BrainBridge');var b=new B.BrainBridge();var r=b.process('写一个函数');console.log('type:',r.taskType);console.log('lessons:',r.lessons.length);console.log('intent:',r.intent.type);console.log('err:',r.error||'(none)');"`
Expected: `type: code` `lessons: >=0` `intent: 代码` `err: (none)`

- [ ] **Step 3: Verify disabled mode**

Run: `BRAIN_DISABLE=1 node -e "var B=require('./src/core/BrainBridge');var b=new B.BrainBridge();var r=b.process('写代码');console.log('err:',r.error);console.log('intent:',r.intent);"`
Expected: `err: disabled` `intent: null`

---

### Task 6: CLI 入口 — brain-bridge.js

**Files:**
- Create: `brain-bridge.js` (项目根目录)
- Test: inline verification

- [ ] **Step 1: Write brain-bridge.js CLI**

```javascript
#!/usr/bin/env node
// brain-bridge.js — BrainSystem 自动桥接 CLI
// Usage:
//   node brain-bridge.js <input>
//   node brain-bridge.js <input> <taskType>
//   node brain-bridge.js --status
//   node brain-bridge.js --disable
//   node brain-bridge.js --enable
//   node brain-bridge.js --reset
//   node brain-bridge.js --backup <filepath>

const { BrainBridge, backupBeforeWrite } = require('./src/core/BrainBridge');

const args = process.argv.slice(2);

// 无参数 → status
if (args.length === 0 || args[0] === '--help') {
  console.log(JSON.stringify({
    usage: 'node brain-bridge.js <input> [taskType]',
    commands: {
      '--status': '显示大脑状态',
      '--disable': '紧急停用',
      '--enable': '重新启用',
      '--reset': '重置断路器',
      '--backup <file>': '手动备份文件',
      '--help': '显示帮助'
    }
  }, null, 2));
  process.exit(0);
}

// --status
if (args[0] === '--status') {
  const bridge = new BrainBridge();
  bridge.initialize();
  const status = bridge.getStatus();
  // 尝试加载额外信息
  try {
    const bs = require('./src/core/BrainSystem');
    const pStatus = bs.getProactiveStatus ? bs.getProactiveStatus() : {};
    status.proactive = pStatus;
  } catch (e) { /* */ }
  console.log(JSON.stringify(status, null, 2));
  process.exit(0);
}

// --disable
if (args[0] === '--disable') {
  const bridge = new BrainBridge();
  bridge.emergencyStop();
  console.log(JSON.stringify({ status: 'disabled', message: 'BrainSystem 已停用' }));
  process.exit(0);
}

// --enable
if (args[0] === '--enable') {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(process.cwd(), '.opencode', 'brain.config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    cfg.enabled = true;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    console.log(JSON.stringify({ status: 'enabled', message: 'BrainSystem 已启用' }));
  } catch (e) {
    console.log(JSON.stringify({ status: 'error', message: e.message }));
  }
  process.exit(0);
}

// --reset
if (args[0] === '--reset') {
  const { CircuitBreaker } = require('./src/core/CircuitBreaker');
  const cb = new CircuitBreaker();
  cb.reset();
  console.log(JSON.stringify({ status: 'reset', message: '断路器已重置' }));
  process.exit(0);
}

// --backup <filepath>
if (args[0] === '--backup') {
  const result = backupBeforeWrite(args[1]);
  console.log(JSON.stringify({ status: result ? 'ok' : 'skipped', backup: result }));
  process.exit(0);
}

// 正常处理输入
const input = args[0];
const taskType = args[1] || undefined;

const timeoutMs = 5000;
const timer = setTimeout(() => {
  console.log(JSON.stringify({
    intent: null, taskType: null, lessons: [], warnings: [],
    suggestions: [], proactive: {},
    source: 'brain-bridge-v1', error: 'timeout', durationMs: timeoutMs
  }));
  process.exit(0);
}, timeoutMs);

try {
  const bridge = new BrainBridge();
  const result = bridge.process(input, taskType);
  clearTimeout(timer);
  console.log(JSON.stringify(result));
} catch (e) {
  clearTimeout(timer);
  console.log(JSON.stringify({
    intent: null, taskType: null, lessons: [], warnings: [],
    suggestions: [], proactive: {},
    source: 'brain-bridge-v1', error: e.message, durationMs: 0
  }));
}
```

- [ ] **Step 2: Verify brain-bridge.js CLI**

```bash
node brain-bridge.js "帮我调试这个bug"
node brain-bridge.js --status
node brain-bridge.js --backup ".opencode/lessons.json"
```

Expected: Valid JSON with taskType: "fix", --status shows enabled state, --backup returns backup path.

- [ ] **Step 3: Verify timeout safety**

Run: `node brain-bridge.js "` + 'a'.repeat(100000) + `"`
Expected: Returns valid JSON within timeout, no crash

---

### Task 7: HooksManager 接线

> **注意**: PRE_TOOL_USE 和 POST_TOOL_USE 钩子需要 AI 助手框架级别的工具拦截能力，当前阶段仅实现 TOOL_ERROR / SESSION_START / SESSION_END。PRE/POST 钩子推迟到阶段 B 实现。

**Files:**
- Modify: `src/core/BrainSystem.js` (新增 connectHooks / disconnectHooks / isHooksConnected)
- Test: inline verification

- [ ] **Step 1: Add connectHooks() to BrainSystem**

在 `BrainSystem.js` 中找到合适位置（靠近文件末尾、其他辅助方法附近，约 Line 6800-6830 区域），添加三个方法：

```javascript
/**
 * 连接 HooksManager 事件总线
 * 注册 brain hooks 到全局 HookRegistry
 */
BrainSystem.connectHooks = function() {
  if (BrainSystem._hooksConnected) return;
  try {
    const { globalHookRegistry, HookEvents } = require('../hooks');
    
    // TOOL_ERROR → 自动诊断
    globalHookRegistry.register({
      event: HookEvents.TOOL_ERROR,
      name: 'brain-auto-diagnose',
      handler: (ctx) => {
        try {
          if (BrainSystem.forceThink) {
            BrainSystem.forceThink(ctx?.error?.message || '');
          }
        } catch (e) { /* 诊断失败不中断 */ }
        return ctx;
      }
    });
    
    // SESSION_START → 初始化
    globalHookRegistry.register({
      event: HookEvents.SESSION_START,
      name: 'brain-session-init',
      handler: (ctx) => {
        try {
          const bridge = new (require('./BrainBridge').BrainBridge)();
          bridge.initialize();
        } catch (e) { /* */ }
        return ctx;
      }
    });
    
    // SESSION_END → 自动保存状态
    globalHookRegistry.register({
      event: HookEvents.SESSION_END,
      name: 'brain-session-save',
      handler: (ctx) => {
        try {
          if (BrainSystem.autoPersist) BrainSystem.autoPersist();
        } catch (e) { /* */ }
        return ctx;
      }
    });
    
    BrainSystem._hooksConnected = true;
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * 断开 HooksManager 连接
 */
BrainSystem.disconnectHooks = function() {
  try {
    const { unregisterHook } = require('../hooks');
    unregisterHook('brain-auto-diagnose');
    unregisterHook('brain-session-init');
    unregisterHook('brain-session-save');
    BrainSystem._hooksConnected = false;
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * 检查 hooks 是否已连接
 */
BrainSystem.isHooksConnected = function() {
  return BrainSystem._hooksConnected === true;
};
```

- [ ] **Step 2: Verify hooks connection**

Run: `node -e "var bs=require('./src/core/BrainSystem');console.log('connected:',bs.connectHooks());console.log('check:',bs.isHooksConnected());console.log('disconnected:',bs.disconnectHooks());console.log('check:',!bs.isHooksConnected());"`
Expected: All `true`

- [ ] **Step 3: Verify hooks fail gracefully when hooks module missing**

Run: `node -e "var bs=require('./src/core/BrainSystem');console.log('no-crash:',1);"`
Expected: `no-crash: 1` (no require error from hooks module)

---

### Task 8: AGENTS.md 更新

**Files:**
- Modify: `AGENTS.md` (根目录)
- Test: visual review

- [ ] **Step 1: 替换原手动规则为自动机制**

将原有第 0 节内容替换为：

```markdown
## 0. 强制决策协议（自动化桥接）

### 0.1 自动大脑桥接

我已通过 brain-bridge.js 自动与 BrainSystem 桥接。以下决策注入自动生效：

- **意图分析**: forceThink + analyzeIntent 自动分析输入
- **教训匹配**: LessonReminder 自动匹配相关教训
- **主动思考**: ProactiveThinking 自动跟踪模式

### 0.2 安全协议

```
若 brain-bridge 返回空/抛异常/超时(5s):
  → 跳过大脑辅助，继续正常响应
  → 连续3次失败自动禁用当前会话 (断路器)
大脑是增强不是门控 (value-add, not gate)
禁用方式: BRAIN_DISABLE=1 或对话中说"大脑关闭"
```

### 0.3 决策展示（保留原格式）

当 brain-bridge 返回 warnings 时，在响应中展示：

```
🧠 [教训] <lesson title>
→ 本次应用：<具体应用场景>
```

### 0.4 紧急指令

| 指令 | 效果 |
|------|------|
| 大脑关闭 | 当前会话停用自动大脑 |
| 大脑状态 | 显示当前 Bridge/断路器/审计状态 |
| 大脑重置 | 重置断路器，重新启用 |

### 0.5 版本信息

保留原第 2 节（版本信息）不变。

---

保留第 1-4 节（大脑模块调用、版本信息、验证、禁止事项）原有内容不变。

- [ ] **Step 2: Verify AGENTS.md is syntactically valid markdown**

Read with: `node -e "console.log(require('fs').readFileSync('AGENTS.md','utf8').slice(0,200))"`
Expected output: Starts with `# AGENTS.md` followed by `## 0. 强制决策协议（自动化桥接）`

---

### Task 9: 集成验证

**Files:**
- Manual verification commands

- [ ] **Step 1: 完整链路测试**

```bash
# 1. CircuitBreaker 状态
node -e "var C=require('./src/core/CircuitBreaker');var c=new C();console.log('CB:',c.state,c.failureCount);"

# 2. LoopGuard 状态
node -e "var L=require('./src/core/LoopGuard');var l=new L();console.log('LG:',l.isTripped);"

# 3. AuditLogger 写入
node -e "var A=require('./src/core/AuditLogger');var a=new A();a.log({level:'info',module:'verify',action:'integration_test'});console.log('AL:OK');"

# 4. BrainBridge 处理输入
node brain-bridge.js "写一个函数" | node -e "process.stdin.on('data',d=>{var j=JSON.parse(d);console.log('taskType:',j.taskType);console.log('source:',j.source);console.log('hasLessons:',j.lessons.length>=0);})"

# 5. BrainBridge 状态
node brain-bridge.js --status | node -e "process.stdin.on('data',d=>{var j=JSON.parse(d);console.log('enabled:',j.enabled);console.log('breakerState:',j.breakerState);})"

# 6. Hooks 连接
node -e "var bs=require('./src/core/BrainSystem');var ok=bs.connectHooks();console.log('hooks:',ok);bs.disconnectHooks();"

# 7. 禁用模式
BRAIN_DISABLE=1 node brain-bridge.js "测试" | node -e "process.stdin.on('data',d=>{var j=JSON.parse(d);console.log('disabled_err:',j.error);})"

# 8. 超时安全
timeout 10 node brain-bridge.js "a".repeat(100000) | node -e "process.stdin.on('data',d=>{var j=JSON.parse(d);console.log('timeout_safe:',j.error||'ok');})"

# 9. 备份功能
node brain-bridge.js --backup ".opencode/lessons.json"

# 10. 断路器熔断测试
node -e "var C=require('./src/core/CircuitBreaker');var c=new C({maxRetries:2});c.recordFailure();c.recordFailure();console.log('closed:',!c.isAllowed());c.reset();console.log('reset:',c.isAllowed());"
```

每个命令预期：返回正常无崩溃。

- [ ] **Step 2: 清理测试产生的审计日志**

Run: `node -e "var path=require('path');var fs=require('fs');var d=path.join(process.cwd(),'.opencode','evolution','audit');if(fs.existsSync(d)){fs.readdirSync(d).filter(f=>f.endsWith('.jsonl')).forEach(f=>fs.unlinkSync(path.join(d,f)));console.log('cleaned');}"`
