# OpenCode 全方位升级方案

> 基于 Claude Code 源码深度分析的反向工程实现

## 📋 升级概览

| 模块 | 优先级 | 复杂度 | 预估时间 |
|------|--------|--------|----------|
| Agent 循环架构 | P0 | 高 | 2周 |
| 工具系统 | P0 | 高 | 2周 |
| 上下文压缩 | P1 | 中 | 1周 |
| 权限系统 | P1 | 中 | 1周 |
| 命令系统 | P2 | 低 | 3天 |
| Plugin 系统 | P2 | 中 | 1周 |
| 特性开关 | P2 | 低 | 3天 |

---

## 🔄 1. Agent 循环架构 (P0)

### 1.1 核心设计

基于 `query.ts` (1729行) 的流式异步执行模式：

```typescript
// OpenCode 目标架构
interface AgentLoopConfig {
  maxTurns?: number;
  taskBudget?: { total: number };
  fallbackModel?: string;
  enableStreaming: boolean;
  enableErrorRecovery: boolean;
}

// 状态机
type LoopState = {
  messages: Message[];
  turnCount: number;
  autoCompactTracking?: AutoCompactState;
  tokenBudget: TokenBudget;
  stopReason?: StopReason;
};

type StopReason = 
  | 'completed'
  | 'max_turns'
  | 'prompt_too_long'
  | 'model_error'
  | 'token_budget_exceeded';
```

### 1.2 实现要点

```typescript
// 异步生成器模式
async function* agentLoop(config: AgentLoopConfig): AsyncGenerator<LoopEvent> {
  let state = initialState(config);
  
  while (true) {
    // 1. Token 预算检查
    if (!checkTokenBudget(state)) {
      yield { type: 'budget_exceeded' };
      break;
    }
    
    // 2. 模型调用
    const response = await queryModel(state.messages, config);
    
    // 3. 流式处理
    for await (const chunk of response) {
      yield { type: 'chunk', data: chunk };
    }
    
    // 4. 工具执行或完成
    if (response.stopReason === 'tool_use') {
      const results = await executeTools(response.toolUses);
      state = updateState(state, results);
    } else {
      yield { type: 'completed', result: response };
      break;
    }
    
    // 5. 错误恢复
    if (response.error) {
      state = await handleError(state, response.error);
    }
  }
}
```

### 1.3 错误恢复机制

| 错误类型 | 恢复策略 |
|----------|----------|
| FallbackTriggeredError | 切换备用模型重试 |
| prompt_too_long | Context Collapse → 响应式压缩 → 失败 |
| max_output_tokens | 恢复并增加输出限制 |
| model_error | 降级到轻量模型 |

---

## 🛠️ 2. 工具系统 (P0)

### 2.1 泛型工具接口

基于 Claude Code `Tool.ts` 的设计：

```typescript
// 泛型工具定义
interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: ZodSchema<I>;
  
  // 核心方法
  call(input: I, context: ToolContext): Promise<O>;
  
  // 生命周期钩子
  validateInput?: (input: I, context: ToolContext) => ValidationResult;
  checkPermissions?: (input: I, context: ToolContext) => PermissionResult;
  
  // 状态标志
  isEnabled: () => boolean;
  isConcurrencySafe: (input: I) => boolean;
  isReadOnly: (input: I) => boolean;
  isDestructive: (input: I) => boolean;
  
  // 中断控制
  interruptBehavior?: 'cancel' | 'block';
}

// 工具注册
class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  
  register(tool: ToolDefinition): void;
  unregister(name: string): void;
  get(name: string): ToolDefinition | undefined;
  getAll(): ToolDefinition[];
  filter(predicate: (tool: ToolDefinition) => boolean): ToolDefinition[];
}
```

### 2.2 流式工具执行器

```typescript
// StreamingToolExecutor 架构
interface ToolExecutionState {
  status: 'queued' | 'executing' | 'completed' | 'yielded';
  abortController: AbortController;
  progressCallback?: (progress: ToolProgress) => void;
}

class StreamingToolExecutor {
  private queue: ToolExecutionState[] = [];
  private maxConcurrency: number = 3;
  
  async execute(
    tools: Tool[],
    context: ToolContext,
    options: ExecutionOptions
  ): Promise<ToolResult[]> {
    // 1. 并发控制
    const batches = this.createBatches(tools, this.maxConcurrency);
    
    // 2. 批量执行
    const results: ToolResult[] = [];
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(tool => this.executeSingle(tool, context))
      );
      results.push(...batchResults);
    }
    
    return results;
  }
  
  // 中断支持
  abort(): void {
    this.queue.forEach(task => {
      task.abortController.abort();
    });
  }
}
```

### 2.3 工具结果格式化

```typescript
// 工具结果 → SDK 格式
function mapToolResultToSDK(
  result: unknown,
  toolName: string
): ToolResultBlockParam {
  return {
    type: 'tool_result',
    content: formatResult(result),
    tool_use_id: generateToolUseId(),
  };
}

// 工具使用消息渲染
function renderToolUseMessage(
  tool: ToolDefinition,
  input: unknown
): ToolUseMessage {
  return {
    role: 'assistant',
    content: [{
      type: 'tool_use',
      id: generateToolUseId(),
      name: tool.name,
      input: tool.inputSchema.parse(input),
    }],
  };
}
```

---

## 📦 3. 上下文压缩系统 (P1)

### 3.1 多层级压缩策略

```typescript
// 压缩配置
interface CompactConfig {
  // 阈值配置
  autoCompactBufferTokens: number;    // 13000
  warningThresholdBuffer: number;     // 20000
  errorThresholdBuffer: number;       // 20000
  
  // 压缩后配置
  postCompactTokenBudget: number;    // 50000
  maxTokensPerFile: number;           // 5000
  maxTokensPerSkill: number;          // 5000
  skillsTokenBudget: number;         // 25000
}

// 压缩类型
type CompactType = 
  | 'auto'        // 自动压缩
  | 'micro'        // 微压缩
  | 'partial'      // 部分压缩
  | 'session';     // 会话记忆压缩

interface CompactionResult {
  boundaryMarker: SystemMessage;
  summaryMessages: UserMessage[];
  attachments: AttachmentMessage[];
  preCompactTokenCount: number;
  postCompactTokenCount: number;
  compactionUsage: TokenUsage;
}
```

### 3.2 压缩流程

```
messages[]
    ↓
stripImagesFromMessages()  // 移除图片
    ↓
groupMessagesByApiRound()   // 按API轮次分组
    ↓
getCompactPrompt()         // 构建压缩提示
    ↓
queryModelWithStreaming()   // 调用模型生成摘要
    ↓
buildPostCompactMessages() // 构建压缩后的消息
    ↓
[新消息列表]
```

### 3.3 Token 预算管理

```typescript
class TokenBudget {
  private total: number;
  private used: number = 0;
  
  allocate(amount: number): boolean {
    if (this.used + amount > this.total) {
      return false;
    }
    this.used += amount;
    return true;
  }
  
  checkThreshold(): 'ok' | 'warning' | 'error' {
    const remaining = this.total - this.used;
    if (remaining < 3000) return 'error';
    if (remaining < 20000) return 'warning';
    return 'ok';
  }
}
```

---

## 🔐 4. 权限系统 (P1)

### 4.1 权限模式

```typescript
type PermissionMode = 
  | 'default'        // 默认 - 需要询问
  | 'plan'           // Plan Mode - 暂停执行
  | 'acceptEdits'    // 自动接受编辑
  | 'bypassPermissions' // 绕过权限
  | 'dontAsk'        // 不询问
  | 'auto';          // 自动模式

interface PermissionContext {
  mode: PermissionMode;
  alwaysAllowRules: PermissionRule[];
  alwaysDenyRules: PermissionRule[];
  deniedRules: string[];
  sessionAllowRules: string[];
  autoAllowedPaths: string[];
}
```

### 4.2 权限决策

```typescript
// 权限决策流程
async function checkToolPermission(
  tool: ToolDefinition,
  input: unknown,
  context: PermissionContext
): Promise<PermissionDecision> {
  // 1. 检查拒绝规则
  if (matchesRule(tool, input, context.alwaysDenyRules)) {
    return { decision: 'deny', reason: 'Rule denied' };
  }
  
  // 2. 检查允许规则
  if (matchesRule(tool, input, context.alwaysAllowRules)) {
    return { decision: 'allow' };
  }
  
  // 3. 检查路径白名单
  if (isAutoAllowedPath(input, context.autoAllowedPaths)) {
    return { decision: 'allow' };
  }
  
  // 4. 根据模式决定
  switch (context.mode) {
    case 'bypassPermissions':
      return { decision: 'allow' };
    case 'dontAsk':
      return { decision: 'deny', reason: 'dontAsk mode' };
    case 'plan':
      return { decision: 'pause', action: 'wait_for_approval' };
    default:
      return { decision: 'ask' };
  }
}
```

---

## ⌨️ 5. 命令系统 (P2)

### 5.1 命令注册

```typescript
interface Command {
  name: string;
  aliases?: string[];
  description: string;
  priority: number;
  patterns: RegExp[];
  
  execute(params: CommandParams): Promise<CommandResult>;
  shouldTrigger(input: string): boolean;
}

class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  
  register(command: Command): void;
  
  getByName(name: string): Command | undefined;
  
  getByPattern(input: string): Command | undefined;
  
  getAll(): Command[];
  
  // 按优先级排序
  getByPriority(): Command[];
}
```

### 5.2 内置命令 (85+)

| 类别 | 命令数 | 示例 |
|------|--------|------|
| 文件操作 | 15+ | `/read`, `/edit`, `/write`, `/delete` |
| Git | 10+ | `/commit`, `/push`, `/branch`, `/diff` |
| 搜索 | 8+ | `/grep`, `/search`, `/find` |
| 开发 | 20+ | `/test`, `/lint`, `/build`, `/debug` |
| AI | 15+ | `/ask`, `/explain`, `/review` |
| 系统 | 17+ | `/shell`, `/env`, `/config` |

---

## 🔌 6. Plugin 系统 (P2)

### 6.1 Plugin 接口

```typescript
interface OpenCodePlugin {
  name: string;
  version: string;
  description?: string;
  
  // 生命周期
  onLoad?: (context: PluginContext) => Promise<void>;
  onUnload?: () => Promise<void>;
  
  // 扩展点
  tools?: ToolDefinition[];
  commands?: Command[];
  hooks?: HookDefinition[];
  skills?: SkillDefinition[];
  
  // 配置
  config?: PluginConfig;
}

class PluginManager {
  async load(plugin: OpenCodePlugin): Promise<void>;
  async unload(name: string): Promise<void>;
  get(name: string): OpenCodePlugin | undefined;
  getAll(): OpenCodePlugin[];
}
```

### 6.2 Hook 系统

```typescript
interface HookDefinition {
  name: string;
  event: HookEvent;
  handler: (context: HookContext) => Promise<HookResult>;
}

type HookEvent = 
  | 'session.start'
  | 'session.end'
  | 'message.before'
  | 'message.after'
  | 'tool.before'
  | 'tool.after'
  | 'error';
```

---

## ⚙️ 7. 特性开关 (P2)

### 7.1 特性配置

```typescript
interface FeatureFlags {
  // Agent 特性
  AGENT_TRIGGERS?: boolean;
  REACTIVE_COMPACT?: boolean;
  CONTEXT_COLLAPSE?: boolean;
  
  // 实验特性
  EXPERIMENTAL_SKILL_SEARCH?: boolean;
  BG_SESSIONS?: boolean;
  HISTORY_SNIP?: boolean;
  
  // 调试特性
  VERBOSE_LOGGING?: boolean;
  DCE?: boolean; // Dead Code Elimination
}

class FeatureManager {
  isEnabled(flag: keyof FeatureFlags): boolean;
  enable(flag: keyof FeatureFlags): void;
  disable(flag: keyof FeatureFlags): void;
  getValue<T>(flag: keyof FeatureFlags): T | undefined;
}
```

---

## 📁 项目结构

```
opencode-upgrade/
├── src/
│   ├── core/
│   │   ├── agent-loop/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── state.ts
│   │   │   ├── errors.ts
│   │   │   └── recovery.ts
│   │   │
│   │   ├── tools/
│   │   │   ├── index.ts
│   │   │   ├── registry.ts
│   │   │   ├── executor.ts
│   │   │   ├── streaming.ts
│   │   │   └── schemas.ts
│   │   │
│   │   ├── compact/
│   │   │   ├── index.ts
│   │   │   ├── auto.ts
│   │   │   ├── micro.ts
│   │   │   ├── session.ts
│   │   │   └── token-budget.ts
│   │   │
│   │   └── permissions/
│   │       ├── index.ts
│   │       ├── context.ts
│   │       ├── rules.ts
│   │       └── modes.ts
│   │
│   ├── commands/
│   │   ├── index.ts
│   │   ├── registry.ts
│   │   ├── builtins/
│   │   │   ├── file.ts
│   │   │   ├── git.ts
│   │   │   ├── search.ts
│   │   │   └── dev.ts
│   │   └── parser.ts
│   │
│   ├── plugins/
│   │   ├── index.ts
│   │   ├── manager.ts
│   │   ├── hooks.ts
│   │   └── sandbox.ts
│   │
│   └── features/
│       ├── index.ts
│       ├── flags.ts
│       └── dce.ts
│
├── tests/
│   ├── agent-loop/
│   ├── tools/
│   ├── compact/
│   └── permissions/
│
└── docs/
    ├── ARCHITECTURE.md
    └── UPGRADE_GUIDE.md
```

---

## 🚀 实施计划

### Phase 1: 核心架构 (2周)
1. Agent 循环基础实现
2. 状态机设计
3. 错误恢复框架

### Phase 2: 工具系统 (2周)
1. 工具注册表
2. 流式执行器
3. 并发控制

### Phase 3: 上下文管理 (1周)
1. Token 预算
2. 自动压缩
3. 微压缩

### Phase 4: 权限和安全 (1周)
1. 权限模式
2. 规则引擎
3. 安全审计

### Phase 5: 命令和插件 (2周)
1. 命令系统
2. Plugin API
3. Hook 系统

---

## 📚 参考文档

- Claude Code 源码分析 Skills: `.opencode/skills/claude-code-*`
- 原始源码: `claude-code-leak/source/src/`
