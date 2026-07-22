# Compact 模块深度分析

## 概述

上下文压缩系统，在对话过长时将早期消息压缩成摘要，保持上下文窗口效率。1705行核心逻辑。

## 核心架构

```typescript
compactConversation()          // 主入口 - 完整压缩
    ↓
streamCompactSummary()         // 核心摘要生成 (两种模式)
    ├── Cache Sharing 模式     // 优先 - API缓存复用
    └── Streaming 模式          // 回退 - 传统流式调用
    ↓
getMessagesAfterCompactBoundary()  // 保留边界内消息
    ↓
createPostCompactAttachments()  // 压缩后附件注入
    ├── createPostCompactFileAttachments()   // 最近文件
    ├── createPlanAttachmentIfNeeded()       // 计划文件
    ├── createSkillAttachmentIfNeeded()      // Skills
    ├── createPlanModeAttachmentIfNeeded()   // Plan mode
    └── createAsyncAgentAttachmentsIfNeeded() // 异步agent
```

## 核心函数详解

### 1. compactConversation()

```typescript
export async function compactConversation(
  context: ToolUseContext,
  options: {
    targetTokenCount?: number
    forceCompact?: boolean
    preCompactTokenCount: number
  },
): Promise<{
  messages: Message[]
  summary: string | null
  boundaryIndex: number
}>
```

**完整流程**:
1. **合并多次 compact**: 如果已存在 boundary，合并到最近的 boundary
2. **寻找压缩点**: `findCompactBoundary()` 找到保留边界
3. **获取保留消息**: `getMessagesAfterCompactBoundary()` 保留边界内消息
4. **生成摘要**: `streamCompactSummary()` 调用 LLM 生成摘要
5. **创建压缩消息**: 包含 summary_text + summary_compact_boundary
6. **更新会话存储**: `addMessagesToSession()` 追加新消息

### 2. streamCompactSummary()

```typescript
async function streamCompactSummary(
  messages: Message[],
  context: ToolUseContext,
  options: {
    preCompactTokenCount: number
    cacheSharingEnabled: boolean
  },
): Promise<AssistantMessage>
```

**两种生成模式**:

#### 模式一: Cache Sharing (优先)
```typescript
// 利用 API 的缓存机制
// 如果之前的 compact 摘要可用于后续压缩，API 自动复用
// 优势: 更快、更便宜

const cacheReadInputTokens = result.totalUsage.cache_read_input_tokens
const cacheHitRate = cacheReadInputTokens / totalInputTokens
```

**关键条件**:
- 需要 `tengu_compact_cache_sharing` 功能标志启用
- 需要 Anthropic API 支持 cache control
- 需要 `cacheCreationInputTokens > 0` 表示创建了缓存

#### 模式二: Streaming (回退)
```typescript
// 传统流式调用 LLM 生成摘要
const streamingGen = queryModelWithStreaming({
  messages: [...getMessagesAfterCompactBoundary(messages), summaryRequest],
  systemPrompt: asSystemPrompt(['You are a helpful AI assistant...']),
  thinkingConfig: { type: 'disabled' as const },
  tools: [FileReadTool],
  // ...
})
```

**重试机制**:
```typescript
const MAX_COMPACT_STREAMING_RETRIES = 3
// 重试时使用指数退避: attempt * baseDelay
```

**Tool Search 集成**:
```typescript
// 当启用 tool search 时，包含 ToolSearchTool
const tools = useToolSearch
  ? [FileReadTool, ToolSearchTool, ...mcpTools]
  : [FileReadTool]
```

### 3. partialCompactConversation()

支持两种方向的部分压缩:
```typescript
// 从前往后压缩
await partialCompactConversation(context, {
  direction: 'forward',
  targetTokenCount: 50000,
})

// 从后往前压缩 (默认)
await partialCompactConversation(context, {
  direction: 'backward',
  targetTokenCount: 50000,
})
```

### 4. Post-Compact 附件系统

#### createPostCompactFileAttachments()
```typescript
export async function createPostCompactFileAttachments(
  readFileState: Record<string, { content: string; timestamp: number }>,
  toolUseContext: ToolUseContext,
  maxFiles: number = 5,
  preservedMessages: Message[] = [],
): Promise<AttachmentMessage[]>
```

**设计原则**:
- **Token Budget**: 总共 POST_COMPACT_TOKEN_BUDGET (约25K tokens)
- **Per-File Limit**: 每个文件 POST_COMPACT_MAX_TOKENS_PER_FILE
- **Deduplication**: 排除已存在于 preservedMessages 中的文件
- **Recency Sort**: 按时间戳排序，优先保留最近访问的

**关键洞察**:
```typescript
// 防止重复注入: 如果模型已能在保留消息中看到某文件的 Read 结果，
// 不需要重新注入完全相同的内容（节省高达 25K tokens/次压缩）
const preservedReadPaths = collectReadToolFilePaths(preservedMessages)
```

#### createSkillAttachmentIfNeeded()
```typescript
export function createSkillAttachmentIfNeeded(agentId?: string): AttachmentMessage | null
```

**Budget 控制**:
```typescript
const POST_COMPACT_SKILLS_TOKEN_BUDGET = 3000  // 3K tokens
const POST_COMPACT_MAX_TOKENS_PER_SKILL = 1500  // 每 skill 最多 1.5K

// 按最近调用时间排序，预算压力时丢弃最不相关的
skills.sort((a, b) => b.invokedAt - a.invokedAt)
```

#### createAsyncAgentAttachmentsIfNeeded()
```typescript
export async function createAsyncAgentAttachmentsIfNeeded(
  context: ToolUseContext,
): Promise<AttachmentMessage[]>
```

**保留的 agent 类型**:
- 正在后台运行的 agent (status: 'running')
- 已完成但结果尚未获取的 agent
- 排除: pending 状态、已 retrieved、当前 agent

#### createPlanModeAttachmentIfNeeded()
```typescript
export async function createPlanModeAttachmentIfNeeded(
  context: ToolUseContext,
): Promise<AttachmentMessage | null>
```

**关键**: 确保压缩后模型继续在 plan mode 下工作（plan mode 指令通常只在 tool-use 时注入）

### 5. 辅助函数

#### findCompactBoundary()
```typescript
export function findCompactBoundary(messages: Message[]): number | null
```
从后往前找 `type === 'summary_compact_boundary'` 的消息索引。

#### getMessagesAfterCompactBoundary()
```typescript
export function getMessagesAfterCompactBoundary(messages: Message[]): Message[]
```
返回 boundary 之后的所有消息（保留的上下文）。

#### collectReadToolFilePaths()
```typescript
function collectReadToolFilePaths(messages: Message[]): Set<string>
```
扫描消息中的 Read tool_use 块，收集文件路径。

**跳过 Dedup Stub**: 
```typescript
// 如果 tool_result 是 FILE_UNCHANGED_STUB，说明指向更早的完整 Read
// 应该重新注入真实内容
if (block.content.startsWith(FILE_UNCHANGED_STUB)) {
  stubIds.add(block.tool_use_id)
}
```

## 关键设计模式

### 1. Compact Boundary Marker

```typescript
interface SummaryCompactBoundary {
  type: 'summary_compact_boundary'
  summary: string           // 摘要文本
  tokenCount: number        // 压缩前的 token 数
  timestamp: number         // 压缩时间戳
}
```

### 2. Token Budget 分配

| 类型 | Budget |
|------|--------|
| 总 postCompact 预算 | ~25K tokens |
| 每文件限制 | ~5K tokens |
| Skills 总预算 | 3K tokens |
| 每 Skill 限制 | 1.5K tokens |

### 3. 截断策略

```typescript
function truncateToTokens(content: string, maxTokens: number): string {
  const charBudget = maxTokens * 4 - SKILL_TRUNCATION_MARKER.length
  return content.slice(0, charBudget) + SKILL_TRUNCATION_MARKER
}

// 截断标记: "[... skill content truncated for compaction; use Read...]"
```

## 安全与错误处理

### API 错误处理
```typescript
// 防止 abort 被当作"成功"的摘要
if (!assistantText.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) {
  logEvent('tengu_compact_cache_sharing_success', { cacheHitRate, ... })
}

// PTL 错误需要让调用方捕获并重试
if (assistantText.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) {
  return assistantMsg  // 调用方会进入 retry loop
}
```

### 错误事件追踪
```typescript
logEvent('tengu_compact_failed', {
  reason: 'no_streaming_response' | 'no_text_response' | 'error',
  preCompactTokenCount,
  hasStartedStreaming,
})
```

## 性能优化

### 1. Cache Sharing 优势
- 后续压缩可复用之前摘要的缓存
- 减少 API 调用次数
- 降低 token 消耗

### 2. 增量压缩
- 部分压缩比完全压缩更轻量
- 支持双向压缩方向

### 3. 智能去重
- 避免重复注入模型已可见的内容
- 节省大量 token

## 调用链

```
mainLoop.ts
    ↓
shouldCompact()              // 检查是否需要压缩
    ↓
compactConversation()       // 执行压缩
    ├→ streamCompactSummary()      // 生成摘要
    │   ├→ Cache Sharing (优先)
    │   └→ Streaming (回退)
    ├→ createPostCompactFileAttachments()
    ├→ createSkillAttachmentIfNeeded()
    └→ addMessagesToSession()  // 更新存储
```

## 关键常量

```typescript
const COMPACT_MAX_OUTPUT_TOKENS = 3500
const MAX_COMPACT_STREAMING_RETRIES = 3
const POST_COMPACT_TOKEN_BUDGET = 25000
const POST_COMPACT_MAX_TOKENS_PER_FILE = 5000
const POST_COMPACT_SKILLS_TOKEN_BUDGET = 3000
const POST_COMPACT_MAX_TOKENS_PER_SKILL = 1500
const MAX_POST_COMPACT_FILES = 5
```

## 深入洞察

### 1. 为什么需要 Post-Compact 附件?

压缩后模型丢失了早期对话中的信息。附件系统确保:
- **最近文件**: 模型可以继续基于最新代码工作
- **Skills**: 保持已加载的 skill guidelines
- **Plan**: Plan mode 状态不丢失
- **Async Agents**: 后台任务状态保持可见

### 2. Cache Sharing 的工作原理

当调用 compact API 时:
1. API 检查是否有可复用的缓存块
2. 如果有，自动使用 `cache_read` 读取缓存
3. 只发送新增内容（boundary 后的消息）
4. 返回 `cache_read_input_tokens` 统计

### 3. 为什么排除某些文件?

```typescript
// Plan 文件: 已在 boundary 消息中
// Memory 文件 (.claude.md 等): 可能包含敏感上下文
function shouldExcludeFromPostCompactRestore(filename, agentId): boolean {
  return normalizedFilename === planFilePath || 
         normalizedMemoryPaths.has(normalizedFilename)
}
```

### 4. Async Agent 状态保持

```typescript
// 防止模型"忘记"后台有 agent 在运行
// 否则可能启动重复的 agent
if (agent.status === 'running') {
  // 显示进度摘要
  deltaSummary: agent.progress?.summary
} else if (agent.status === 'error') {
  // 显示错误信息
  deltaSummary: agent.error
}
```
