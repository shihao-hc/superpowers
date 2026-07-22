# Claude Code → OpenCode 功能融合分析

> 基于 Claude Code 源码学习的 20+ 模块，识别可融入 OpenCode 的设计模式

## 一、已学习模块清单

| # | 模块 | 核心功能 | 已融入 |
|---|------|----------|--------|
| 1 | Tools Module | 工具注册、执行、并发控制 | ✅ 部分融入 |
| 2 | Permissions Module | 权限检查、安全验证 | ✅ 已融入 AuditLogger |
| 3 | Agents Module | 子Agent、Fork prompt cache | ✅ AgentLoop 已升级 |
| 4 | Session Module | JSONL持久化、compact boundary | ✅ SessionManager 已升级 |
| 5 | Compact Module | 上下文压缩、Cache Sharing | ⚠️ ContextCompactService 已融入 |
| 6 | Query Module | 多层压缩、Withholding | ⚠️ 需进一步融合 |
| 7 | API Client Module | 流式处理、请求追踪 | ✅ LLMAdapter 已升级 |
| 8 | Coordinator Module | 任务分解、邮箱机制 | ⚠️ 需融合 |
| 9 | MCP Module | 6种传输、OAuth认证 | ✅ MCPManager 已升级 |
| 10 | Hooks Module | 26种事件、异步Hook | ✅ **已融入** |
| 11 | Auth Module | OAuth管理、多源认证 | ⚠️ 需融合 |
| 12 | Analytics Module | Feature Gate、遥测 | ⚠️ FeatureFlagsService 已融入 |
| 13 | Suggestions Module | 推测执行、Pipeline | ✅ **已融入** |
| 14 | Print/Headless Module | StructuredIO、RemoteIO | ❌ **待融入** |
| 15 | settingsSyncModule | 双向同步、增量上传 | ✅ **已融入** |
| 16 | sessionMemoryModule | Fork子Agent、阈值触发 | ✅ **已融入** |
| 17 | nativeTsModule | fuzzy搜索、语法高亮 | ✅ **已融入** |
| 18 | memdirModule | 四类记忆、路径安全 | ⚠️ memory 模块已有 |
| 19 | upstreamproxyModule | MITM代理、WebSocket隧道 | ❌ 不需要 |
| 20 | promptsModule | Dynamic Boundary、Feature Flags | ✅ 部分已融入 |
| 21 | skillsModule | 三层发现、条件激活 | ✅ skills 模块已有 |

---

## 二、高优先级待融入功能

### 2.1 Hooks System（钩子系统）⭐⭐⭐

**核心价值**：26种事件 + 4种Hook类型 + 异步执行

**Claude Code 实现**：
```typescript
// 事件类型
type HookEvent = 
  | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'
  | 'UserPromptSubmit' | 'PermissionRequest' | 'PermissionDenied'
  | 'SessionStart' | 'SessionEnd'
  | 'PreCompact' | 'PostCompact'
  | 'SubagentStart' | 'SubagentStop'
  | 'Elicitation' | 'ElicitationResult'
  // ... 共26种

// Hook类型
type HookType = 'command' | 'prompt' | 'agent' | 'http'

// 异步Hook协议
if (stdout starts with '{"async": true}') {
  AsyncHookRegistry.register(hook, callback)
}
```

**OpenCode 当前**：无钩子系统

**融入方案**：
```javascript
// src/hooks/HookManager.js
class HookManager extends EventEmitter {
  static HOOK_EVENTS = [
    'preToolUse', 'postToolUse', 'toolError',
    'preAgent', 'postAgent',
    'sessionStart', 'sessionEnd',
    'contextCompact', 'messageSend'
  ];
  
  async executeHook(event, context) {
    const hooks = this.hooks.get(event) || [];
    for (const hook of hooks) {
      const result = await this._executeHook(hook, context);
      if (result.blocked) return result;
    }
    return { allowed: true };
  }
}
```

---

### 2.2 Session Memory（会话记忆）⭐⭐⭐

**核心价值**：Fork子Agent + 双重阈值 + 结构化文件

**Claude Code 实现**：
```typescript
// 触发阈值
const minimumTokensBetweenUpdate = 5000;
const toolCallsBetweenUpdates = 3;

// 会话记忆文件结构
const sections = [
  'Session Title',
  'Current State',
  'Task specification',
  'Files and Functions',
  'Workflow',
  'Errors & Corrections',
  'Codebase and System Documentation',
  'Learnings',
  'Key results',
  'Worklog'
];

// Fork子Agent提取
async runForkedAgent(prompt, context) {
  return spawn('node', ['--eval', generateScript(prompt)])
}
```

**OpenCode 当前**：memory 模块有基础实现，但缺乏 Fork 子Agent 机制

**融入方案**：
```javascript
// src/memory/SessionMemory.js
class SessionMemory {
  constructor(options = {}) {
    this.tokenThreshold = options.tokenThreshold || 5000;
    this.toolCallThreshold = options.toolCallThreshold || 3;
    this.content = new Map();
  }
  
  async extractMemory(session) {
    const agent = new AgentLoop({
      model: 'haiku',
      prompt: this.buildExtractPrompt(session)
    });
    const result = await agent.run();
    this.mergeSections(result.sections);
  }
  
  mergeSections(newSections) {
    for (const [name, content] of Object.entries(newSections)) {
      const existing = this.content.get(name) || '';
      this.content.set(name, this.merge(existing, content));
    }
  }
}
```

---

### 2.3 Suggestions System（建议系统）⭐⭐

**核心价值**：推测执行 + Pipeline 管道化

**Claude Code 实现**：
```typescript
// 推测执行模式
async function speculate(tool, input) {
  const spec = await runSpeculativeAgent(tool, input);
  return {
    speculation: spec,
    execute: async () => tool.call(input)
  };
}

// Pipeline 管道化
class SuggestionPipeline {
  stages = ['generate', 'filter', 'rank', 'present'];
  
  async process(context) {
    let result = context;
    for (const stage of this.stages) {
      result = await this[stage](result);
    }
    return result;
  }
}
```

**OpenCode 当前**：无建议系统

**融入方案**：
```javascript
// src/agent/SuggestionPipeline.js
class SuggestionPipeline {
  constructor() {
    this.stages = new Map();
  }
  
  use(name, handler) {
    this.stages.set(name, handler);
    return this;
  }
  
  async execute(context) {
    let result = context;
    for (const [name, handler] of this.stages) {
      result = await handler(result);
      if (result.skip) break;
    }
    return result;
  }
}

// 使用示例
const pipeline = new SuggestionPipeline()
  .use('generate', ctx => this.generate(ctx))
  .use('filter', ctx => this.filterByRelevance(ctx))
  .use('rank', ctx => this.rankByConfidence(ctx));
```

---

### 2.4 Settings Sync（设置同步）⭐⭐

**核心价值**：双向同步 + 增量上传 + OAuth认证

**Claude Code 实现**：
```typescript
// 同步键
const SYNC_KEYS = {
  USER_SETTINGS: '~/.claude/settings.json',
  USER_MEMORY: '~/.claude/CLAUDE.md',
  projectSettings: 'projects/{projectId}/settings.local.json',
  projectMemory: 'projects/{projectId}/CLAUDE.local.md'
};

// 增量同步
async function uploadUserSettings(local, remote) {
  const changed = pickBy(local, (v, k) => local[k] !== remote[k]);
  if (Object.keys(changed).length > 0) {
    await api.upload(changed);
  }
}

// OAuth认证
async function authenticate() {
  const token = await oauth.getAccessToken({
    scope: 'settings:read settings:write'
  });
  return token;
}
```

**OpenCode 当前**：无设置同步功能

**融入方案**：
```javascript
// src/config/SettingsSync.js
class SettingsSync {
  static SYNC_KEYS = {
    'settings.json': 'USER_SETTINGS',
    'CLAUDE.md': 'USER_MEMORY'
  };
  
  async upload(settings) {
    const remote = await this.fetchRemote();
    const changed = this.diff(settings, remote);
    if (Object.keys(changed).length > 0) {
      await this.api.upload({ entries: changed });
    }
  }
  
  async download() {
    const remote = await this.api.download();
    const local = this.loadLocal();
    return this.merge(remote, local);
  }
}
```

---

### 2.5 Native-TS 模块 ⭐⭐

**核心价值**：无 native 依赖的 Pure-TS 移植

**Claude Code 实现**：
```typescript
// fuzzy 搜索（nucleo 端口）
class FuzzyMatcher {
  score(query, target) {
    // 位图快速拒绝
    if (!this.containsChars(target, query)) return 0;
    // 评分计算
    return this.calculateScore(target, query);
  }
  
  containsChars(target, query) {
    const bits = this.buildBitmap(target);
    return query.every(c => bits[c.charCodeAt(0)]);
  }
}

// 语法高亮（syntect 端口）
class SyntaxHighlighter {
  highlight(code, language) {
    const grammar = this.getGrammar(language);
    return this.tokenize(code, grammar);
  }
}
```

**OpenCode 当前**：使用外部库依赖

**融入方案**：
```javascript
// src/utils/FuzzyMatcher.js
class FuzzyMatcher {
  buildBitmap(str) {
    const bits = new Uint32Array(256);
    for (const c of str.toLowerCase()) {
      bits[c.charCodeAt(0)] = 1;
    }
    return bits;
  }
  
  containsAllChars(str, chars) {
    const bits = this.buildBitmap(str);
    return chars.every(c => bits[c.charCodeAt(0)]);
  }
  
  score(query, target) {
    if (!this.containsAllChars(target, query)) return 0;
    // ... 完整评分算法
  }
}
```

---

## 三、中优先级待融入功能

### 3.1 Coordinator 任务分解 ⭐⭐

**核心价值**：邮箱机制 + Continue vs Spawn 决策

**融入方案**：
```javascript
// src/coordinator/TaskDecomposer.js
class TaskDecomposer {
  decompose(task) {
    const subtasks = [];
    const steps = this.identifySteps(task);
    
    for (const step of steps) {
      subtasks.push({
        ...step,
        mailbox: this.createMailbox()
      });
    }
    
    return {
      subtasks,
      strategy: this.decideStrategy(subtasks)
    };
  }
  
  decideStrategy(tasks) {
    if (tasks.every(t => t.independent)) {
      return 'spawn'; // 并行
    }
    return 'continue'; // 串行
  }
}
```

### 3.2 Prompt Dynamic Boundary ⭐⭐

**核心价值**：静态/动态内容分离 + 缓存优化

**融入方案**：
```javascript
// src/agent/PromptBuilder.js
class PromptBuilder {
  build(systemPrompt, context) {
    const staticPart = this.getStaticPart(systemPrompt);
    const dynamicPart = this.buildDynamic(context);
    
    return [
      staticPart,
      '=== DYNAMIC_BOUNDARY ===',
      dynamicPart
    ].join('\n\n');
  }
  
  getStaticPart(prompt) {
    return prompt.split('=== DYNAMIC_BOUNDARY ===')[0]?.trim() || prompt;
  }
}
```

---

## 四、低优先级（可选融入）

| 功能 | 说明 | 状态 |
|------|------|------|
| upstreamproxy | MITM代理，OpenCode不需要 | ❌ 不融入 |
| Buddy System | 伙伴系统，娱乐性质 | ⚠️ 可选 |
| print/RemoteIO | 远程IO，架构差异大 | ⚠️ 架构重设计 |

---

## 五、融合计划

### Phase 1: Hooks System（1周）

| 任务 | 工作量 | 优先级 |
|------|--------|--------|
| 设计 HookManager 架构 | 1天 | 🔴 |
| 实现核心事件 | 2天 | 🔴 |
| 实现 Hook 类型 | 2天 | 🔴 |
| 测试覆盖 | 1天 | 🔴 |
| 文档编写 | 1天 | 🟡 |

### Phase 2: Session Memory（1周）

| 任务 | 工作量 | 优先级 |
|------|--------|--------|
| 设计 SessionMemory 架构 | 1天 | 🔴 |
| 实现 Fork 子Agent | 2天 | 🔴 |
| 实现阈值触发 | 1天 | 🔴 |
| 实现文件结构 | 1天 | 🟡 |
| 测试覆盖 | 1天 | 🔴 |

### Phase 3: Suggestions Pipeline（3天）

| 任务 | 工作量 | 优先级 |
|------|--------|--------|
| 设计 Pipeline 架构 | 0.5天 | 🟡 |
| 实现 generate 阶段 | 0.5天 | 🟡 |
| 实现 filter/rank 阶段 | 1天 | 🟡 |
| 集成到 AgentLoop | 1天 | 🟡 |

### Phase 4: Settings Sync（3天）

| 任务 | 工作量 | 优先级 |
|------|--------|--------|
| 设计 Sync 架构 | 0.5天 | 🟡 |
| 实现增量同步 | 1天 | 🟡 |
| 实现 OAuth | 1天 | 🟡 |
| 测试覆盖 | 0.5天 | 🟡 |

### Phase 5: Native-TS Fuzzy（2天）

| 任务 | 工作量 | 优先级 |
|------|--------|--------|
| 实现 FuzzyMatcher | 1天 | 🟡 |
| 性能测试 | 0.5天 | 🟡 |
| 替换现有实现 | 0.5天 | 🟡 |

---

## 六、已融入功能总结

| 模块 | Claude Code 设计 | OpenCode 实现 | 状态 |
|------|------------------|---------------|------|
| MessageService | BoundedUUIDSet, FlushGate | ✅ 已升级 | ✅ |
| LLMAdapter | 流式处理, 重试机制 | ✅ 已升级 | ✅ |
| AgentLoop | 后台任务, 批处理 | ✅ 已升级 | ✅ |
| MCPManager | 增量更新, 6种传输 | ✅ 已升级 | ✅ |
| ContextCompact | Cache Sharing, Stream Retry | ✅ 已升级 | ✅ |
| Permission | AuditLogger, RateLimiter | ✅ 已融入 | ✅ |
| Skills | 三层发现, 条件激活 | ✅ 已升级 | ✅ |
| memory | 四类记忆, 路径安全 | ⚠️ 部分融入 | 🔄 |

---

## 七、已完成功能总结

| 模块 | Claude Code 设计 | OpenCode 实现 | 状态 |
|------|------------------|---------------|------|
| HooksManager | 26种事件、异步Hook | ✅ src/hooks/HooksManager.js (600行) | ✅ **完成** |
| SessionMemory | Fork子Agent、阈值触发 | ✅ src/memory/SessionMemory.js (450行) | ✅ **完成** |
| SuggestionPipeline | 推测执行、Pipeline | ✅ src/agent/SuggestionPipeline.js (400行) | ✅ **完成** |
| SettingsSync | 双向同步、增量上传 | ✅ src/config/SettingsSync.js (500行) | ✅ **完成** |
| FuzzyMatcher | 原生模糊匹配、语法高亮 | ✅ src/utils/FuzzyMatcher.js (400行) | ✅ **完成** |

---

## 八、剩余待融入功能

| 功能 | 说明 | 状态 |
|------|------|------|
| Coordinator 任务分解 | 邮箱机制 + Continue vs Spawn 决策 | ⚠️ 可选 |
| Prompt Dynamic Boundary | 静态/动态内容分离 + 缓存优化 | ⚠️ 可选 |
| upstreamproxy | MITM代理，OpenCode不需要 | ❌ 不融入 |
| Buddy System | 伙伴系统，娱乐性质 | ⚠️ 可选 |
| print/RemoteIO | 远程IO，架构差异大 | ⚠️ 架构重设计 |

---

## 九、测试覆盖

| 模块 | 测试文件 | 测试数量 | 状态 |
|------|---------|----------|------|
| HooksManager | tests/HooksManager.test.js | 25 | ✅ |
| SessionMemory | tests/SessionMemory.test.js | 20 | ✅ |
| SuggestionPipeline | tests/SuggestionPipeline.test.js | 18 | ✅ |
| SettingsSync | tests/SettingsSync.test.js | 26 | ✅ |
| FuzzyMatcher | tests/FuzzyMatcher.test.js | 31 | ✅ |
| 集成测试 | tests/integration/new-modules-integration.test.js | 38 | ✅ |

**总计**: 158 个测试，全部通过

---

**文档版本**: v2  
**最后更新**: 2026-04-13  
**基于**: Claude Code 源码深度学习（20+模块）
