# Context 模块深度分析

## 概览

Context 模块负责构建发送给 AI 模型的所有上下文信息，包括系统提示、用户上下文、附件、工具定义等。

## 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     上下文构建管道                                │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ System      │    │ User        │    │ Attachments        │  │
│  │ Context     │    │ Context     │    │ (多种类型)          │  │
│  │             │    │             │    │                    │  │
│  │ - GitStatus │    │ - CLAUDE.md │    │ - Files            │  │
│  │ - Cache     │    │ - Date      │    │ - Todos            │  │
│  │   Breaker   │    │             │    │ - Tasks            │  │
│  └──────┬──────┘    └──────┬──────┘    │ - Memories        │  │
│         │                    │            │ - Hooks           │  │
│         └──────────┬─────────┘            └─────────┬─────────┘  │
│                    ▼                                 │         │
│         ┌─────────────────┐                          │         │
│         │ System Prompt   │◄─────────────────────────┘         │
│         │ (优先级构建)     │                                    │
│         └────────┬────────┘                                    │
│                  ▼                                            │
│         ┌─────────────────┐    ┌─────────────────────────┐    │
│         │ Tool Definitions │    │ Message History        │    │
│         │ (内建+MCP)      │    │ (带附件)              │    │
│         └────────┬────────┘    └───────────┬───────────┘    │
│                  │                        │                  │
│                  └───────────┬────────────┘                  │
│                              ▼                                │
│                   ┌─────────────────────┐                     │
│                   │ API Request Builder │                     │
│                   │ (Token Budget)      │                     │
│                   └─────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

## 1. System Context (`context.ts`)

### Git Status
```typescript
export const getGitStatus = memoize(async ()): Promise<string | null> => {
  // 1. 检查是否 Git 仓库
  const isGit = await getIsGit()
  
  // 2. 并行获取: branch, mainBranch, status, log, userName
  const [branch, mainBranch, status, log, userName] = await Promise.all([
    getBranch(),
    getDefaultBranch(),
    execFileNoThrow(gitExe(), ['--no-optional-locks', 'status', '--short']),
    execFileNoThrow(gitExe(), ['--no-optional-locks', 'log', '--oneline', '-n', '5']),
    execFileNoThrow(gitExe(), ['config', 'user.name']),
  ])
  
  // 3. 截断 (2K 字符限制)
  const truncatedStatus = status.length > MAX_STATUS_CHARS
    ? status.substring(0, MAX_STATUS_CHARS) + '\n... (truncated)'
    : status
})
```

### System Context 构建
```typescript
export const getSystemContext = memoize(async () => {
  const gitStatus = await getGitStatus()
  const injection = getSystemPromptInjection()  // Cache breaker
  
  return {
    gitStatus: `...`,
    cacheBreaker: `[CACHE_BREAKER: ${injection}]`,  // 仅 ant
  }
})
```

### User Context 构建
```typescript
export const getUserContext = memoize(async () => {
  // 加载 CLAUDE.md 文件
  const claudeMd = getClaudeMds(filterInjectedMemoryFiles(await getMemoryFiles()))
  
  return {
    claudeMd,  // 用户规则和指令
    currentDate: `Today's date is ${getLocalISODate()}.`,
  }
})
```

## 2. Context Window 管理 (`utils/context.ts`)

### 上下文窗口计算
```typescript
export function getContextWindowForModel(model: string, betas?: string[]): number {
  // 优先级:
  // 1. 环境变量覆盖 (ant only)
  // 2. [1m] 后缀显式指定
  // 3. 模型能力上限
  // 4. Beta 功能标志
  // 5. 默认 200K
  
  if (has1mContext(model)) {
    return 1_000_000
  }
  
  const cap = getModelCapability(model)
  if (cap?.max_input_tokens >= 100_000) {
    return cap.max_input_tokens
  }
  
  return MODEL_CONTEXT_WINDOW_DEFAULT  // 200_000
}
```

### 上下文使用百分比
```typescript
export function calculateContextPercentages(
  currentUsage: {
    input_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  } | null,
  contextWindowSize: number,
): { used: number | null; remaining: number | null } {
  const totalInputTokens =
    currentUsage.input_tokens +
    currentUsage.cache_creation_input_tokens +
    currentUsage.cache_read_input_tokens
  
  const usedPercentage = (totalInputTokens / contextWindowSize) * 100
  return { used: usedPercentage, remaining: 100 - usedPercentage }
}
```

## 3. 上下文分析 (`analyzeContext.ts`)

### Context Categories
```typescript
interface ContextCategory {
  name: string
  tokens: number
  color: keyof Theme
  isDeferred?: boolean  // 延迟加载，不计入实际使用
}
```

### 上下文类别优先级
```typescript
const categories = [
  'System prompt',           // 固定开销
  'System tools',           // 内置工具
  'MCP tools',             // MCP 工具
  'MCP tools (deferred)',   // 延迟加载
  'System tools (deferred)', // 延迟加载
  'Custom agents',          // 自定义 Agent
  'Memory files',           // CLAUDE.md
  'Skills',                 // 技能
  'Messages',               // 消息历史
  'Free space',             // 剩余空间
]
```

### 延迟工具 (Deferred Tools)
```typescript
// 当 ToolSearch 启用时，某些工具不计入实际上下文
interface DeferredBuiltinTool {
  name: string
  tokens: number
  isLoaded: boolean  // 是否已在消息中使用
}

// 统计逻辑
const isDeferred = await isToolSearchEnabled(model, tools, ...)

// 已加载的工具计入
// 未加载的工具计入 deferredToolTokens
```

## 4. System Prompt 构建 (`systemPrompt.ts`)

### 优先级系统
```typescript
export function buildEffectiveSystemPrompt({
  mainThreadAgentDefinition,
  customSystemPrompt,
  defaultSystemPrompt,
  appendSystemPrompt,
  overrideSystemPrompt,
}): SystemPrompt {
  // 优先级 (0 最高)
  // 0. overrideSystemPrompt - 完全替换
  // 1. Coordinator mode - Coordinator 提示
  // 2. Agent system prompt - Agent 特定提示
  //    - Proactive mode: 追加到默认提示
  //    - 其他: 替换默认提示
  // 3. Custom system prompt - 自定义提示
  // 4. Default system prompt - 默认提示
  
  if (overrideSystemPrompt) {
    return [overrideSystemPrompt]
  }
  
  if (agentSystemPrompt && isProactiveActive()) {
    return [...defaultSystemPrompt, `\n# Custom Agent Instructions\n${agentSystemPrompt}`]
  }
  
  return [agentSystemPrompt ?? customSystemPrompt ?? defaultSystemPrompt]
}
```

## 5. Attachments 系统 (`attachments.ts`)

### 附件类型
```typescript
type Attachment =
  | FileAttachment           // 用户 @ 提及的文件
  | CompactFileReferenceAttachment  // 压缩后的文件引用
  | AlreadyReadFileAttachment // 已读取文件
  | EditedTextFileAttachment // 被编辑的文件
  | SelectedLinesAttachment  // IDE 选中的行
  | OpenedFileAttachment    // IDE 打开的文件
  | TodoReminder            // Todo 提醒
  | TaskReminder            // 任务提醒
  | MemoryFileAttachment    // Memory 文件
  | HookAttachment          // Hook 相关
  | AgentMentionAttachment   // Agent 提及
  | PlanModeAttachment      // Plan mode 状态
  | AsyncHookResponseAttachment  // 异步 Hook 响应
```

### 关键配置
```typescript
const TODO_REMINDER_CONFIG = {
  TURNS_SINCE_WRITE: 10,           // 10 轮后开始提醒
  TURNS_BETWEEN_REMINDERS: 10,    // 每 10 轮提醒一次
}

const AUTO_MODE_ATTACHMENT_CONFIG = {
  TURNS_BETWEEN_ATTACHMENTS: 5,  // 每 5 轮注入一次
  FULL_REMINDER_EVERY_N_ATTACHMENTS: 5,
}

const MAX_MEMORY_BYTES = 4096     // 每文件最大 4KB
const RELEVANT_MEMORIES_CONFIG = {
  MAX_SESSION_BYTES: 60 * 1024,  // 会话最大 60KB
}
```

## 6. Token 计算

### Token 计数策略
```typescript
async function countTokensWithFallback(
  messages: Anthropic.Beta.MessageParam[],
  tools: Anthropic.Beta.BetaToolUnion[],
): Promise<number | null> {
  // 1. 优先使用 API 计数
  try {
    return await countMessagesTokensWithAPI(messages, tools)
  } catch (err) {
    // 2. API 失败时使用 Haiku 回退
    return await countTokensViaHaikuFallback(messages, tools)
  }
}
```

### 工具 Token 开销
```typescript
// API 添加工具提示前导约 500 tokens
// 批量调用会导致 N × 500 开销
export const TOOL_TOKEN_COUNT_OVERHEAD = 500

// 解决方案：从每个工具计数中减去这个开销
const totalTokens = bulkCountResult - TOOL_TOKEN_COUNT_OVERHEAD
```

## 7. Context 构建入口

### `analyzeContextUsage()` 函数
```typescript
export async function analyzeContextUsage(
  messages: Message[],
  model: string,
  getToolPermissionContext: () => Promise<ToolPermissionContext>,
  tools: Tools,
  agentDefinitions: AgentDefinitionsResult,
  terminalWidth?: number,
  toolUseContext?: ToolUseContext,
  mainThreadAgentDefinition?: AgentDefinition,
  originalMessages?: Message[],
): Promise<ContextData> {
  // 并行执行所有计数操作
  const [
    { systemPromptTokens, systemPromptSections },
    { claudeMdTokens, memoryFileDetails },
    { builtInToolTokens, deferredBuiltinTokens, systemToolDetails },
    { mcpToolTokens, mcpToolDetails, deferredToolTokens },
    { agentTokens, agentDetails },
    { slashCommandTokens, commandInfo },
    messageBreakdown,
  ] = await Promise.all([
    countSystemTokens(effectiveSystemPrompt),
    countMemoryFileTokens(),
    countBuiltInToolTokens(...),
    countMcpToolTokens(...),
    countCustomAgentTokens(agentDefinitions),
    countSlashCommandTokens(tools, ...),
    approximateMessageTokens(messages),
  ])
  
  // 构建可视化 Grid
  const gridRows = buildGrid(categories, contextWindow, terminalWidth)
  
  return { categories, totalTokens, gridRows, ... }
}
```

## 8. 关键设计决策

### 1. Memoization 缓存
```typescript
export const getSystemContext = memoize(async () => {
  // 整个会话只计算一次
})

export const getGitStatus = memoize(async () => {
  // Git 命令结果缓存
})
```

### 2. 并行 Token 计数
```typescript
// 使用 Promise.all 并行执行独立计数
const [systemTokens, memoryTokens, toolTokens, ...] = await Promise.all([
  countSystemTokens(...),
  countMemoryFileTokens(),
  countBuiltInToolTokens(...),
  ...
])
```

### 3. 延迟加载 (Deferred)
```typescript
// 工具搜索启用时，部分工具延迟加载
// 它们不计入实际上下文使用，但显示在 UI 中
if (isDeferredTool(tool)) {
  deferredToolTokens += tokens
  deferredBuiltinDetails.push({ name, tokens, isLoaded: false })
}
```

### 4. Grid 可视化
```typescript
// 根据终端宽度调整 grid 尺寸
const isNarrowScreen = terminalWidth < 80
const GRID_WIDTH = contextWindow >= 1_000_000
  ? isNarrowScreen ? 5 : 20
  : isNarrowScreen ? 5 : 10
```

### 5. API vs 估算
```typescript
// 优先使用 API 返回的实际使用量
// 如果不可用，回退到估算值
const apiUsage = getCurrentUsage(originalMessages ?? messages)
const finalTotalTokens = apiUsage 
  ? apiUsage.input_tokens + apiUsage.cache_creation + apiUsage.cache_read
  : totalIncludingReserved
```

## 9. 上下文效率优化

### 保留空间策略
```typescript
// 自动压缩模式: 保留 33K tokens
const autoCompactThreshold = contextWindow - AUTOCOMPACT_BUFFER_TOKENS

// 手动压缩模式: 保留 3K tokens
const manualCompactBuffer = MANUAL_COMPACT_BUFFER_TOKENS  // 3000
```

### 内存文件限制
```typescript
const MAX_MEMORY_LINES = 200
const MAX_MEMORY_BYTES = 4096  // 每文件 4KB
const MAX_SESSION_BYTES = 60 * 1024  // 会话总计 60KB
```

## 10. 关键创新点

1. **多级缓存**: `memoize()` 确保昂贵计算只执行一次
2. **并行计数**: `Promise.all` 并行化独立 token 计数
3. **延迟加载**: ToolSearch 模式下工具延迟加载，减少上下文
4. **Grid 可视化**: 终端友好的上下文使用可视化
5. **API 回退**: API 计数失败时优雅降级到 Haiku 估算
6. **Token 预算**: 明确的保留空间策略，防止上下文溢出

## 文件位置

- `src/context.ts` - System/User Context (189 行)
- `src/utils/context.ts` - Context Window 计算 (221 行)
- `src/utils/analyzeContext.ts` - Context 分析 (1382 行)
- `src/utils/systemPrompt.ts` - System Prompt 构建 (123 行)
- `src/utils/attachments.ts` - Attachments 系统 (3997 行)
