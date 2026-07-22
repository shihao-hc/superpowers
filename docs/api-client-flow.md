# API 客户端模块深度分析

## 概述

Anthropic API 客户端核心，处理所有与 LLM API 的通信。3419 行核心逻辑。

## 核心架构

```typescript
queryModelWithStreaming()           // 流式查询入口
    ↓
queryModel()                        // 核心查询函数
    ├→ Off-switch 检查
    ├→ Beta headers 构建
    ├→ 工具 Schema 构建
    ├→ 消息规范化
    ├→ System Prompt 构建
    ├→ API 参数构建
    └→ 流式处理循环
         ├→ withRetry() 重试包装
         ├→ 流式事件处理
         ├→ message_delta 处理
         └→ 错误处理与回退

queryModelWithoutStreaming()         // 非流式查询
```

## 核心函数详解

### 1. queryModelWithStreaming()

```typescript
export async function* queryModelWithStreaming({
  messages,
  systemPrompt,
  thinkingConfig,
  tools,
  signal,
  options,
}): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage>
```

**职责**:
1. 包装 `queryModel()` 生成器
2. 使用 `withStreamingVCR` 进行录制/回放
3. 处理流式事件

### 2. queryModel() - 核心查询函数

```typescript
async function* queryModel(
  messages: Message[],
  systemPrompt: SystemPrompt,
  thinkingConfig: ThinkingConfig,
  tools: Tools,
  signal: AbortSignal,
  options: Options,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage>
```

**完整流程**:

#### 2.1 Off-switch 检查
```typescript
// 非订阅用户 + Opus 模型检查 off-switch
if (!isClaudeAISubscriber() && isNonCustomOpusModel(options.model)) {
  const config = await getDynamicConfig_BLOCKS_ON_INIT<{ activated: boolean }>(
    'tengu-off-switch',
    { activated: false },
  )
  if (config.activated) {
    yield getAssistantMessageFromError(new Error(CUSTOM_OFF_SWITCH_MESSAGE))
    return
  }
}
```

#### 2.2 Beta Headers 构建
```typescript
const isAgenticQuery = options.querySource.startsWith('repl_main_thread') ||
                       options.querySource.startsWith('agent:') ||
                       options.querySource === 'sdk'
const betas = getMergedBetas(options.model, { isAgenticQuery })

// 添加 advisor beta
if (isAdvisorEnabled()) {
  betas.push(ADVISOR_BETA_HEADER)
}
```

#### 2.3 工具 Schema 构建
```typescript
const toolSchemas = await Promise.all(
  filteredTools.map(tool =>
    toolToAPISchema(tool, {
      getToolPermissionContext: options.getToolPermissionContext,
      tools,
      agents: options.agents,
      deferLoading: willDefer(tool),  // MCP/LSP 延迟加载
    }),
  )
)
```

#### 2.4 消息规范化
```typescript
let messagesForAPI = normalizeMessagesForAPI(messages, filteredTools)

// 工具搜索后处理：移除不支持模型的工具搜索字段
if (!useToolSearch) {
  messagesForAPI = messagesForAPI.map(msg => {
    // 移除 tool_reference 和 caller 字段
  })
}

// 修复 tool_use/tool_result 配对
messagesForAPI = ensureToolResultPairing(messagesForAPI)

// 剥离 advisor blocks
messagesForAPI = stripAdvisorBlocks(messagesForAPI)

// 剥离过量媒体
messagesForAPI = stripExcessMediaItems(messagesForAPI, API_MAX_MEDIA_PER_REQUEST)
```

#### 2.5 System Prompt 构建
```typescript
systemPrompt = asSystemPrompt([
  getAttributionHeader(fingerprint),
  getCLISyspromptPrefix({ ... }),
  ...systemPrompt,
  ...(advisorModel ? [ADVISOR_TOOL_INSTRUCTIONS] : []),
  ...(injectChromeHere ? [CHROME_TOOL_SEARCH_INSTRUCTIONS] : []),
])

const system = buildSystemPromptBlocks(systemPrompt, enablePromptCaching, {
  skipGlobalCacheForSystemPrompt: needsToolBasedCacheMarker,
})
```

### 3. 流式处理循环

#### 3.1 withRetry 包装
```typescript
const generator = yield* withRetry(
  async function * () {
    // ... API 调用
  },
  {
    model: options.model,
    fallbackModel: options.fallbackModel,
    // ...
  }
)
```

#### 3.2 API 调用
```typescript
const result = await anthropic.beta.messages
  .create({ ...params, stream: true }, { signal, headers })
  .withResponse()

streamRequestId = result.request_id
return result.data
```

#### 3.3 流式事件处理
```typescript
for await (const part of stream) {
  switch (part.type) {
    case 'message_start':
      // 初始化 partialMessage
      partialMessage = part.message
      ttftMs = Date.now() - start
      
    case 'content_block_start':
      // 创建 content block
      contentBlocks[part.index] = part.content_block
      
    case 'content_block_delta':
      // 增量更新 content block
      switch (delta.type) {
        case 'input_json_delta':
          // 工具输入累积
        case 'text_delta':
          // 文本累积
        case 'thinking_delta':
          // 思考内容累积
      }
      
    case 'content_block_stop':
      // 完成 content block，yield 消息
      yield m
      
    case 'message_delta':
      // 最终 usage 和 stop_reason
      usage = updateUsage(usage, part.usage)
      stopReason = part.delta.stop_reason
      
    case 'message_stop':
      // 流结束
  }
}
```

### 4. 错误处理与回退

#### 4.1 流式回退到非流式
```typescript
try {
  for await (const part of stream) { ... }
} catch (streamingError) {
  // 用户中止
  if (streamingError instanceof APIUserAbortError) {
    throw streamingError
  }
  
  // 回退到非流式
  didFallBackToNonStreaming = true
  if (options.onStreamingFallback) {
    options.onStreamingFallback()
  }
  
  const result = yield* executeNonStreamingRequest(...)
}
```

#### 4.2 Watchdog 超时
```typescript
const STREAM_IDLE_TIMEOUT_MS = 90_000
let streamIdleTimer = setTimeout(() => {
  streamIdleAborted = true
  releaseStreamResources()
}, STREAM_IDLE_TIMEOUT_MS)
```

#### 4.3 错误日志
```typescript
logAPIError({
  error,
  model: errorModel,
  messageCount: messagesForAPI.length,
  durationMs: Date.now() - start,
  attempt: attemptNumber,
  requestId,
  // ...
})
```

## Beta Headers 系统

```typescript
const BETA_HEADERS = {
  // Prompt Caching
  PROMPT_CACHING_SCOPE_BETA_HEADER: 'prompt-caching-2025-04-03',
  
  // Thinking
  REDACT_THINKING_BETA_HEADER: 'redact-thinking-2025-05-14',
  
  // Fast Mode
  FAST_MODE_BETA_HEADER: 'fast-mode-2025-02-19',
  
  // Context Management
  CONTEXT_MANAGEMENT_BETA_HEADER: 'context-management-011',
  
  // 1M Context
  CONTEXT_1M_BETA_HEADER: 'context-1m-2025-05-13',
  
  // Task Budgets
  TASK_BUDGETS_BETA_HEADER: 'interleaved-chat-2025-03-05',
  
  // Structured Outputs
  STRUCTURED_OUTPUTS_BETA_HEADER: 'structured-outputs-2025-03-05',
  
  // Effort
  EFFORT_BETA_HEADER: 'effort-2025-01-16',
  
  // AFK Mode
  AFK_MODE_BETA_HEADER: 'automated-feedback-2025-03-17',
  
  // Advisor
  ADVISOR_BETA_HEADER: 'advisor-2025-03-31',
}
```

## Prompt Caching 系统

### Cache Control
```typescript
export function getCacheControl({
  scope,
  querySource,
}: {
  scope?: CacheScope
  querySource?: QuerySource
}): {
  type: 'ephemeral'
  ttl?: '1h'
  scope?: CacheScope
}
```

### 1h TTL 条件
```typescript
function should1hCacheTTL(querySource?: QuerySource): boolean {
  // 3P Bedrock 用户
  if (getAPIProvider() === 'bedrock' && ENABLE_PROMPT_CACHING_1H_BEDROCK) {
    return true
  }
  
  // GrowthBook allowlist
  const config = getPromptCache1hAllowlist()
  if (config.allowlist.includes('*') || 
      config.allowlist.some(p => querySource?.startsWith(p))) {
    return true
  }
  
  return false
}
```

### Cache Breakpoints
```typescript
export function addCacheBreakpoints(
  messages,
  enablePromptCaching,
  querySource,
  useCachedMC,
  newCacheEdits,
  pinnedEdits,
  skipCacheWrite,
): MessageParam[]
```

## 流式事件类型

```typescript
type StreamEvent =
  | { type: 'stream_event'; event: BetaRawMessageStreamEvent }
  | { type: 'assistant'; assistant: AssistantMessage }
  | { type: 'request_start'; model: string }
```

### 事件处理映射
```typescript
const eventTypeMapping: Record<string, string> = {
  'message_start': 'tengu_api_message_start',
  'content_block_start': 'tengu_api_content_block_start',
  'content_block_delta': 'tengu_api_content_block_delta',
  'content_block_stop': 'tengu_api_content_block_stop',
  'message_delta': 'tengu_api_message_delta',
  'message_stop': 'tengu_api_message_stop',
}
```

## 重试机制

### withRetry 配置
```typescript
interface RetryOptions {
  model: string
  fallbackModel?: string
  thinkingConfig: ThinkingConfig
  signal: AbortSignal
  initialConsecutive529Errors: number
  querySource: QuerySource
}
```

### 指数退避
```typescript
// INITIAL_BACKOFF_MS = 1000
// MAX_BACKOFF_MS = 30000
const backoffMs = Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)
```

### 529 错误处理
```typescript
if (is529Error(error)) {
  consecutive529Errors++
  // 529 后可以尝试 fallback 模型
  if (options.fallbackModel && consecutive529Errors >= 3) {
    throw new FallbackTriggeredError(...)
  }
}
```

## 性能监控

### TTFT (Time To First Token)
```typescript
case 'message_start': {
  ttftMs = Date.now() - start
  // 记录 TTFT 指标
  logEvent('tengu_api_ttft', { ttftMs, model })
}
```

### 流式停滞检测
```typescript
const STALL_THRESHOLD_MS = 30_000
const timeSinceLastEvent = now - lastEventTime
if (timeSinceLastEvent > STALL_THRESHOLD_MS) {
  logEvent('tengu_streaming_stall', {
    stall_duration_ms: timeSinceLastEvent,
    stall_count: stallCount,
  })
}
```

## 成本追踪

```typescript
const costUSD = calculateUSDCost(resolvedModel, usage)
addToTotalSessionCost(costUSD, usage, options.model)
```

## 内存泄漏防止

### Stream 资源释放
```typescript
function releaseStreamResources(): void {
  cleanupStream(stream)
  stream = undefined
  if (streamResponse) {
    streamResponse.body?.cancel().catch(() => {})
    streamResponse = undefined
  }
}

// 必须在 finally 块中释放
try {
  for await (const part of stream) { ... }
} finally {
  releaseStreamResources()
}
```

## VCR 录制/回放

```typescript
// 录制模式
export async function* withVCR(
  messages: Message[],
  generatorFn: () => AsyncGenerator,
)

// 流式模式
export async function* withStreamingVCR(
  messages: Message[],
  generatorFn: () => AsyncGenerator,
)
```

## 关键常量

```typescript
const API_MAX_MEDIA_PER_REQUEST = 100
const STREAM_IDLE_TIMEOUT_MS = 90_000
const STALL_THRESHOLD_MS = 30_000
const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000
const CAPPED_DEFAULT_MAX_TOKENS = 8_192
const ESCALATED_MAX_TOKENS = 64_000
```

## 深入洞察

### 1. 为什么需要流式回退？

```
流式 API 可能因网络问题、超时等失败
→ 回退到非流式 API
→ 非流式 API 更稳定（一次请求/响应）
→ 但丢失流式优势（首 token 延迟）
```

### 2. Watchdog 为什么需要？

```
流式 API 可能静默挂起（连接不断开但不发送数据）
→ SDK 的请求超时只覆盖 initial fetch()
→ 不覆盖流式 body
→ 需要 setTimeout 主动杀死挂起的流
```

### 3. 为什么需要 direct property mutation？

```typescript
// 错误方式
lastMsg = { ...lastMsg, message: { ...lastMsg.message, usage } }
// 转录文件队列持有旧引用

// 正确方式
lastMsg.message.usage = usage
lastMsg.message.stop_reason = stopReason
// 直接修改，队列引用仍然有效
```

### 4. Prompt Caching 的边界保护

```
Exactly one message-level cache_control marker per request
- 两个 marker：second-to-last 位置被保护，多存活一轮
- 一个 marker：立即释放
```

### 5. 流式工具执行的回退问题

```
流式失败 → 非流式重试
→ 部分流已经开始执行工具
→ 非流式重试产生相同的 tool_use
→ 工具被执行两次！

解决：disableStreamingFallback = true
```

### 6. Advisor Model 集成

```typescript
// Advisor 是特殊的 server-side 工具
extraToolSchemas.push({
  type: 'advisor_20260301',
  name: 'advisor',
  model: advisorModel,
})
```

### 7. 工具延迟加载

```typescript
// MCP/LSP 工具可以延迟加载
const willDefer = (t: Tool) =>
  useToolSearch && (deferredToolNames.has(t.name) || shouldDeferLspTool(t))

// defer_loading: true 不计入 token
// API 在 system_prompt_tools 中过滤
```
