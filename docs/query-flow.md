# Query 模块深度分析

## 概述

核心查询引擎，处理用户输入 → LLM API 调用 → 工具执行 → 循环的完整流程。1729 行核心逻辑。

## 核心架构

```typescript
query()                           // 异步生成器入口
    ↓
queryLoop()                      // 主循环 (while true)
    ↓
┌─────────────────────────────────────────────┐
│  1. 消息预处理阶段                           │
│     - applyToolResultBudget()               │
│     - snipCompactIfNeeded()                  │
│     - microcompact()                         │
│     - applyCollapsesIfNeeded()                │
│     - deps.autocompact()                     │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│  2. API 调用阶段                             │
│     - deps.callModel() → 流式事件            │
│     - 工具输入回填 (backfillObservableInput) │
│     - 流式工具执行 (StreamingToolExecutor)   │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│  3. 错误恢复阶段                             │
│     - Context Collapse 排出                 │
│     - Reactive Compact                      │
│     - Max Output Tokens 恢复               │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│  4. 工具执行阶段                             │
│     - runTools() 或 streamingToolExecutor    │
│     - Tool Use Summary 生成                  │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│  5. 附件注入阶段                             │
│     - getAttachmentMessages()                │
│     - Memory Prefetch                       │
│     - Skill Prefetch                        │
└─────────────────────────────────────────────┘
    ↓
    continue / return
```

## 核心函数详解

### 1. query() - 异步生成器入口

```typescript
export async function* query(
  params: QueryParams,
): AsyncGenerator<
  | StreamEvent        // API 流式事件
  | RequestStartEvent  // 请求开始
  | Message            // 消息
  | TombstoneMessage   // 墓碑消息（删除标记）
  | ToolUseSummaryMessage, // 工具使用摘要
  Terminal             // 终止原因
>
```

**职责**:
1. 包装 `queryLoop()` 生成器
2. 管理命令生命周期通知
3. 处理生成器退出清理

### 2. queryLoop() - 主循环

```typescript
async function* queryLoop(
  params: QueryParams,
  consumedCommandUuids: string[],
): AsyncGenerator<...> {
  let state: State = {
    messages: params.messages,
    toolUseContext: params.toolUseContext,
    autoCompactTracking: undefined,
    maxOutputTokensRecoveryCount: 0,
    turnCount: 1,
    transition: undefined,
  }

  while (true) {
    // 1. 消息预处理
    // 2. API 调用
    // 3. 错误恢复
    // 4. 工具执行
    // 5. 附件注入
    // 6. continue 或 return
  }
}
```

**State 类型**:
```typescript
type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: Continue | undefined
}
```

### 3. 消息预处理管道

#### 3.1 applyToolResultBudget()
```typescript
// 强制工具结果大小预算
// 只对没有 maxResultSizeChars 限制的工具生效
const persistReplacements = querySource.startsWith('agent:') ||
                            querySource.startsWith('repl_main_thread')
messagesForQuery = await applyToolResultBudget(
  messagesForQuery,
  toolUseContext.contentReplacementState,
  persistReplacements ? recordContentReplacement : undefined,
  new Set(unlimitedTools),
)
```

#### 3.2 Snip Compact
```typescript
// HISTORY_SNIP: 移除冗余的"无变化"工具结果
if (feature('HISTORY_SNIP')) {
  const snipResult = snipModule!.snipCompactIfNeeded(messagesForQuery)
  messagesForQuery = snipResult.messages
  snipTokensFreed = snipResult.tokensFreed
}
```

#### 3.3 Microcompact
```typescript
// 工具结果微压缩 - CACHED_MICROCOMPACT
const microcompactResult = await deps.microcompact(
  messagesForQuery,
  toolUseContext,
  querySource,
)
messagesForQuery = microcompactResult.messages
```

#### 3.4 Context Collapse
```typescript
// CONTEXT_COLLAPSE: 折叠冗余消息
if (feature('CONTEXT_COLLAPSE') && contextCollapse) {
  const collapseResult = await contextCollapse.applyCollapsesIfNeeded(
    messagesForQuery,
    toolUseContext,
    querySource,
  )
  messagesForQuery = collapseResult.messages
}
```

#### 3.5 Auto Compact
```typescript
// 自动压缩 - 基于 token 阈值
const { compactionResult, consecutiveFailures } = await deps.autocompact(
  messagesForQuery,
  toolUseContext,
  {
    systemPrompt, userContext, systemContext,
    toolUseContext, forkContextMessages: messagesForQuery,
  },
  querySource,
  tracking,
  snipTokensFreed,
)
```

### 4. API 调用阶段

#### 4.1 流式调用
```typescript
for await (const message of deps.callModel({
  messages: prependUserContext(messagesForQuery, userContext),
  systemPrompt: fullSystemPrompt,
  thinkingConfig: toolUseContext.options.thinkingConfig,
  tools: toolUseContext.options.tools,
  signal: toolUseContext.abortController.signal,
  options: {
    model: currentModel,
    fallbackModel,
    querySource,
    agents: toolUseContext.options.agentDefinitions.activeAgents,
    // ...
  },
})) {
  // 处理流式事件
}
```

#### 4.2 工具输入回填
```typescript
// API 返回的 tool_use 只有可见参数，需要回填完整输入
if (message.type === 'assistant') {
  for (const block of message.message.content) {
    if (block.type === 'tool_use') {
      const tool = findToolByName(toolUseContext.options.tools, block.name)
      if (tool?.backfillObservableInput) {
        tool.backfillObservableInput(inputCopy)
      }
    }
  }
}
```

#### 4.3 流式工具执行
```typescript
// 使用 StreamingToolExecutor 在 API 流式传输时并行执行工具
if (streamingToolExecutor) {
  for (const toolBlock of msgToolUseBlocks) {
    streamingToolExecutor.addTool(toolBlock, message)
  }
  for (const result of streamingToolExecutor.getCompletedResults()) {
    yield result.message
    toolResults.push(...normalizeMessagesForAPI([result.message], tools))
  }
}
```

### 5. 错误恢复机制

#### 5.1 Context Collapse 排出
```typescript
// PTL 错误时先尝试排出 staged collapses
if (isWithheld413) {
  if (feature('CONTEXT_COLLAPSE') && state.transition?.reason !== 'collapse_drain_retry') {
    const drained = contextCollapse.recoverFromOverflow(messagesForQuery, querySource)
    if (drained.committed > 0) {
      state = { ...state, messages: drained.messages, transition: { reason: 'collapse_drain_retry' } }
      continue
    }
  }
}
```

#### 5.2 Reactive Compact
```typescript
// 如果排出不够，进行响应式压缩
if ((isWithheld413 || isWithheldMedia) && reactiveCompact) {
  const compacted = await reactiveCompact.tryReactiveCompact({
    hasAttempted: hasAttemptedReactiveCompact,
    querySource,
    messages: messagesForQuery,
    cacheSafeParams: { systemPrompt, userContext, systemContext, toolUseContext },
  })
  if (compacted) {
    const postCompactMessages = buildPostCompactMessages(compacted)
    state = { ...state, messages: postCompactMessages, hasAttemptedReactiveCompact: true }
    continue
  }
}
```

#### 5.3 Max Output Tokens 恢复
```typescript
// 3次重试机会，注入恢复消息
if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
  const recoveryMessage = createUserMessage({
    content: `Output token limit hit. Resume directly...`,
    isMeta: true,
  })
  state = {
    ...state,
    messages: [...messagesForQuery, ...assistantMessages, recoveryMessage],
    maxOutputTokensRecoveryCount: maxOutputTokensRecoveryCount + 1,
    transition: { reason: 'max_output_tokens_recovery', attempt: ... },
  }
  continue
}
```

### 6. 工具执行阶段

#### 6.1 双模式执行
```typescript
// 模式1: 流式工具执行 (并行)
const toolUpdates = streamingToolExecutor
  ? streamingToolExecutor.getRemainingResults()
  // 模式2: 传统串行执行
  : runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)

for await (const update of toolUpdates) {
  if (update.message) {
    yield update.message
    toolResults.push(...normalizeMessagesForAPI([update.message], tools))
  }
  if (update.newContext) {
    updatedToolUseContext = { ...update.newContext, queryTracking }
  }
}
```

#### 6.2 Tool Use Summary
```typescript
// 使用 Haiku 模型生成工具使用摘要
if (config.gates.emitToolUseSummaries && toolUseBlocks.length > 0) {
  nextPendingToolUseSummary = generateToolUseSummary({
    tools: toolInfoForSummary,
    signal: toolUseContext.abortController.signal,
    lastAssistantText,
  })
}
```

### 7. 附件注入阶段

```typescript
// 获取命令队列中的附件
const queuedCommandsSnapshot = getCommandsByMaxPriority(sleepRan ? 'later' : 'next')

// 注入附件
for await (const attachment of getAttachmentMessages(
  null, updatedToolUseContext, null, queuedCommandsSnapshot,
  [...messagesForQuery, ...assistantMessages, ...toolResults],
  querySource,
)) {
  yield attachment
  toolResults.push(attachment)
}

// 消费 Memory Prefetch
if (pendingMemoryPrefetch?.settledAt !== null) {
  const memoryAttachments = filterDuplicateMemoryAttachments(
    await pendingMemoryPrefetch.promise,
    toolUseContext.readFileState,
  )
  // ...
}

// 消费 Skill Prefetch
if (skillPrefetch && pendingSkillPrefetch) {
  const skillAttachments = await skillPrefetch.collectSkillDiscoveryPrefetch(pendingSkillPrefetch)
  // ...
}
```

### 8. 循环继续条件

```typescript
const next: State = {
  messages: [...messagesForQuery, ...assistantMessages, ...toolResults],
  toolUseContext: toolUseContextWithQueryTracking,
  autoCompactTracking: tracking,
  turnCount: nextTurnCount,
  maxOutputTokensRecoveryCount: 0,
  hasAttemptedReactiveCompact: false,
  pendingToolUseSummary: nextPendingToolUseSummary,
  transition: { reason: 'next_turn' },
}
state = next
// continue → 下一轮循环
```

**返回条件**:
- `completed` - 正常完成
- `aborted_streaming` - 流式中断
- `aborted_tools` - 工具执行中断
- `prompt_too_long` - 上下文超限
- `image_error` - 图片错误
- `model_error` - 模型错误
- `max_turns` - 达到最大轮次
- `stop_hook_prevented` - 停止钩子阻止
- `blocking_limit` - 阻塞限制

## 关键设计模式

### 1. Async Generator 模式
```typescript
// query() 和 queryLoop() 都是 AsyncGenerator
// 支持 yield 流式事件，在 API 调用和工具执行间保持响应性
for await (const message of deps.callModel({ ... })) {
  yield yieldMessage
}
```

### 2. State 可变对象
```typescript
// State 在循环中更新，支持 continue 重置
let state: State = { ... }
state = { ...state, newValue }  // 继续循环
return terminal  // 退出循环
```

### 3. Feature Gate 条件编译
```typescript
// 使用 bun:bundle 的 feature() 进行条件编译
const reactiveCompact = feature('REACTIVE_COMPACT')
  ? require('./services/compact/reactiveCompact.js')
  : null
```

### 4. Withholding 机制
```typescript
// 可恢复错误暂存，不立即暴露给 UI
// 等待恢复尝试完成后决定是否暴露
let withheld = false
if (reactiveCompact?.isWithheldPromptTooLong(message)) {
  withheld = true
}
if (!withheld) {
  yield yieldMessage
}
```

### 5. Streaming Fallback 处理
```typescript
// 模型切换时清除旧消息，防止工具 ID 不匹配
if (streamingFallbackOccured) {
  for (const msg of assistantMessages) {
    yield { type: 'tombstone' as const, message: msg }
  }
  assistantMessages.length = 0
  streamingToolExecutor.discard()
  streamingToolExecutor = new StreamingToolExecutor(...)
}
```

### 6. Query Tracking
```typescript
// 链式追踪，depth 递增
const queryTracking = toolUseContext.queryTracking
  ? { chainId: toolUseContext.queryTracking.chainId, depth: toolUseContext.queryTracking.depth + 1 }
  : { chainId: deps.uuid(), depth: 0 }
```

## 关键常量

```typescript
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3
const ESCALATED_MAX_TOKENS = 64000
const MAX_POST_COMPACT_FILES = 5
```

## 事件追踪

```typescript
logEvent('tengu_auto_compact_succeeded', { ... })
logEvent('tengu_streaming_tool_execution_used', { ... })
logEvent('tengu_model_fallback_triggered', { ... })
logEvent('tengu_query_error', { ... })
logEvent('tengu_token_budget_completed', { ... })
```

## 核心依赖

```typescript
type QueryDeps = {
  callModel: typeof queryModelWithStreaming
  autocompact: typeof autoCompact
  microcompact: typeof runMicrocompact
  uuid: () => string
}
```

## 深入洞察

### 1. 为什么需要多层压缩？

```
Snip → Microcompact → Context Collapse → Auto Compact
(轻量级)              (中等)            (可逆)        (重量级)
```

每层针对不同场景，共同确保上下文不超限。

### 2. 流式工具执行的优势

```typescript
// 传统模式: 等 API 完全返回 → 串行执行工具
// 流式模式: 边接收 tool_use 边执行工具
for await (const message of deps.callModel({ ... })) {
  if (message.type === 'assistant') {
    streamingToolExecutor.addTool(toolBlock, message)
  }
  for (const result of streamingToolExecutor.getCompletedResults()) {
    yield result.message  // 立即 yield 结果
  }
}
```

### 3. Tombstone 消息的作用

```typescript
// 模型切换时，旧模型产生的消息需要标记为"墓碑"
// 防止 UI 和转录文件保留无效状态
for (const msg of assistantMessages) {
  yield { type: 'tombstone' as const, message: msg }
}
```

### 4. 停止钩子死亡螺旋防止

```typescript
// API 错误时跳过停止钩子
if (lastMessage?.isApiErrorMessage) {
  executeStopFailureHooks(lastMessage, toolUseContext)
  return { reason: 'completed' }  // 不运行正常停止钩子
}

// 停止钩子阻塞错误时，检查是否已经尝试过压缩
hasAttemptedReactiveCompact  // 防止无限循环
```

### 5. Memory Prefetch 时机

```typescript
// 入口时启动 prefetch
using pendingMemoryPrefetch = startRelevantMemoryPrefetch(messages, toolUseContext)

// 在工具执行后消耗（如果已 settled）
if (pendingMemoryPrefetch?.settledAt !== null) {
  const memoryAttachments = await pendingMemoryPrefetch.promise
  // ...
}
```

### 6. Task Budget 跨压缩边界追踪

```typescript
// 压缩后 server 只能看到摘要，会少算
// 需要告诉 server 还有多少 budget 剩余
if (params.taskBudget) {
  const preCompactContext = finalContextTokensFromLastResponse(messagesForQuery)
  taskBudgetRemaining = Math.max(0,
    (taskBudgetRemaining ?? params.taskBudget.total) - preCompactContext
  )
}
```
