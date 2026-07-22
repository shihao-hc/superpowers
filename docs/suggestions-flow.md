# Suggestions 建议系统深度分析

## 概览

Suggestions 模块包含两个核心功能：
1. **Prompt Suggestion** - 预测用户下一步可能输入的命令
2. **Speculation** - 推测执行用户可能想要的操作

## 核心文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `services/PromptSuggestion/promptSuggestion.ts` | 523 | 建议生成核心逻辑 |
| `services/PromptSuggestion/speculation.ts` | 991 | 推测执行系统 |
| `hooks/usePromptSuggestion.ts` | 177 | React Hook 集成 |

---

## Prompt Suggestion 系统

### 核心流程

```
1. tryGenerateSuggestion() 入口检查
   ├─ abortController.signal.aborted
   ├─ assistantTurnCount < 2 → 早期对话跳过
   ├─ lastAssistantMessage.isApiErrorMessage → API错误跳过
   └─ getParentCacheSuppressReason() → 缓存检查

2. generateSuggestion() 生成建议
   ├─ runForkedAgent() 启动子Agent
   ├─ 使用 cacheSafeParams 复用缓存
   └─ 返回纯文本建议

3. shouldFilterSuggestion() 过滤
   ├─ 元文本过滤 (silence, nothing found)
   ├─ 格式检查 (字数、句子数)
   └─ 语气检查 (非用户口吻)
```

### 启用条件

```typescript
function shouldEnablePromptSuggestion(): boolean {
  // 1. 环境变量覆盖
  if (isEnvDefinedFalsy(envOverride)) return false
  if (isEnvTruthy(envOverride)) return true
  
  // 2. GrowthBook 功能开关
  if (!getFeatureValue('tengu_chomp_inflection')) return false
  
  // 3. 非交互模式禁用
  if (getIsNonInteractiveSession()) return false
  
  // 4. Swarm teammate 禁用
  if (isAgentSwarmsEnabled() && isTeammate()) return false
  
  // 5. 用户设置
  return settings.promptSuggestionEnabled !== false
}
```

### 抑制原因

```typescript
function getSuggestionSuppressReason(appState): string | null {
  if (!appState.promptSuggestionEnabled) return 'disabled'
  if (appState.pendingWorkerRequest) return 'pending_permission'
  if (appState.elicitation.queue.length > 0) return 'elicitation_active'
  if (appState.toolPermissionContext.mode === 'plan') return 'plan_mode'
  if (currentLimits.status !== 'allowed') return 'rate_limit'
  return null
}
```

### 提示词模板

```
[SUGGESTION MODE: Suggest what the user might naturally type next]

TEST: Would they think "I was just about to type that"?

EXAMPLES:
- User asked "fix bug", bug fixed → "run the tests"
- After code written → "try it out"
- Task complete → "commit this" or "push it"

NEVER SUGGEST:
- Evaluative ("looks good", "thanks")
- Questions ("what about...?")
- Claude-voice ("Let me...", "I'll...")

Format: 2-12 words, match user's style
```

### 过滤规则

```typescript
const filters = [
  ['done', () => lower === 'done'],
  ['meta_text', () => /silence|stay silent/.test(lower)],
  ['error_message', () => lower.startsWith('api error:')],
  ['too_few_words', () => wordCount < 2 && !ALLOWED_SINGLE_WORDS.has(lower)],
  ['too_many_words', () => wordCount > 12],
  ['evaluative', () => /thanks|looks good|sounds good/.test(lower)],
  ['claude_voice', () => /^(let me|i'll|i'm|i can)/.test(suggestion)],
]
```

---

## Speculation 推测执行系统

### 核心概念

Speculation 在后台**推测执行**用户可能想要的命令，如果用户接受(Tab)，则结果立即可用。

### 状态机

```typescript
type SpeculationState = 
  | { status: 'idle' }
  | { 
      status: 'active'
      id: string
      abort: () => void
      startTime: number
      messagesRef: { current: Message[] }
      writtenPathsRef: { current: Set<string> }
      boundary: CompletionBoundary | null
      suggestionLength: number
      toolUseCount: number
      isPipelined: boolean
      pipelinedSuggestion: PromptSuggestion | null
    }
```

### Completion Boundary

```typescript
type CompletionBoundary =
  | { type: 'complete'; completedAt: number; outputTokens: number }
  | { type: 'bash'; command: string; completedAt: number }
  | { type: 'edit'; toolName: string; filePath: string; completedAt: number }
  | { type: 'denied_tool'; toolName: string; detail: string; completedAt: number }
```

### 执行流程

```
startSpeculation(suggestionText)
    │
    ├─ 1. 创建 overlay 目录隔离文件系统
    │
    ├─ 2. runForkedAgent() 执行推测
    │   ├─ canUseTool 权限检查
    │   │   ├─ WRITE_TOOLS (Edit/Write/NotebookEdit) → 检查 acceptEdits 模式
    │   │   ├─ 文件路径重写 → overlay 目录
    │   │   ├─ Bash → 只读命令检查
    │   │   └─ 其他工具 → 拒绝
    │   └─ onMessage 回调 → 收集消息
    │
    ├─ 3. 完成时 → generatePipelinedSuggestion() 管道化下一个建议
    │
    └─ 4. acceptSpeculation() 或 abortSpeculation()
```

### 文件系统隔离

```typescript
// Copy-on-write 机制
if (isWriteTool) {
  // 写入前复制到 overlay
  if (!writtenPathsRef.current.has(rel)) {
    await copyFile(join(cwd, rel), join(overlayPath, rel))
    writtenPathsRef.current.add(rel)
  }
  input = { ...input, [pathKey]: join(overlayPath, rel) }
} else if (isSafeReadOnlyTool) {
  // 读取时重定向到 overlay（如果文件已修改）
  if (writtenPathsRef.current.has(rel)) {
    input = { ...input, [pathKey]: join(overlayPath, rel) }
  }
}
```

### 权限边界

```typescript
// 写入工具需要 acceptEdits 模式
if (isWriteTool) {
  const canAutoAcceptEdits =
    mode === 'acceptEdits' ||
    mode === 'bypassPermissions' ||
    (mode === 'plan' && isBypassPermissionsModeAvailable)
  
  if (!canAutoAcceptEdits) {
    return denySpeculation('file edit requires permission')
  }
}

// Bash 需要只读
if (tool.name === 'Bash') {
  if (checkReadOnlyConstraints(command).behavior !== 'allow') {
    return denySpeculation('bash boundary')
  }
}
```

### 接受结果

```typescript
async function acceptSpeculation(state, setAppState) {
  // 1. 复制 overlay 到主目录
  await copyOverlayToMain(overlayPath, writtenPathsRef.current, cwd)
  
  // 2. 清理 overlay
  safeRemoveOverlay(overlayPath)
  
  // 3. 计算节省时间
  const timeSavedMs = endTime - startTime
  
  // 4. 准备消息注入
  const cleanMessages = prepareMessagesForInjection(speculatedMessages)
  
  // 5. 如果 speculation 完成，管道化下一个建议
  if (isComplete && pipelinedSuggestion) {
    void startSpeculation(pipelinedSuggestion.text, ..., true)
  }
  
  return { messages: cleanMessages, boundary, timeSavedMs }
}
```

---

## 缓存优化

### 关键洞察

```typescript
// 关键：不覆盖任何 API 参数
// runForkedAgent 必须发送与父请求相同的 cache-key 参数
// 覆盖 effort/maxOutputTokens 会导致 45x 缓存写入激增

const result = await runForkedAgent({
  promptMessages: [createUserMessage({ content: prompt })],
  cacheSafeParams, // 不覆盖 tools/thinking settings
  canUseTool,
  skipCacheWrite: true,  // 跳过缓存写入
})
```

### 缓存抑制

```typescript
// 父请求未缓存时抑制建议生成
function getParentCacheSuppressReason(lastAssistantMessage) {
  const inputTokens = usage.input_tokens ?? 0
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  
  // 如果总 tokens > 10000，认为缓存已冷
  if (inputTokens + cacheWriteTokens + outputTokens > 10_000) {
    return 'cache_cold'
  }
  return null
}
```

---

## Analytics 事件

### Prompt Suggestion

```typescript
// 初始化
logEvent('tengu_prompt_suggestion_init', {
  enabled: boolean,
  source: 'env' | 'growthbook' | 'setting' | 'non_interactive' | 'swarm_teammate'
})

// 建议结果
logEvent('tengu_prompt_suggestion', {
  source: 'cli' | 'sdk',
  outcome: 'accepted' | 'ignored' | 'suppressed',
  reason?: string,
  prompt_id: 'user_intent' | 'stated_intent',
  acceptMethod?: 'tab' | 'enter',
  timeToAcceptMs?: number,
  timeToIgnoreMs?: number,
  timeToFirstKeystrokeMs?: number,
  wasFocusedWhenShown?: boolean,
  similarity?: number
})
```

### Speculation

```typescript
logEvent('tengu_speculation', {
  speculation_id: string,
  outcome: 'accepted' | 'aborted' | 'error',
  duration_ms: number,
  suggestion_length: number,
  tools_executed: number,
  completed: boolean,
  boundary_type?: 'complete' | 'bash' | 'edit' | 'denied_tool',
  boundary_tool?: string,
  boundary_detail?: string,
  time_saved_ms?: number,
  is_pipelined?: boolean
})
```

---

## 关键设计模式

### 1. Fork Agent 复用缓存

```typescript
// 子Agent通过完全相同的 cache-safe 参数复用父请求的缓存
const cacheSafeParams = createCacheSafeParams(context)
const result = await runForkedAgent({
  cacheSafeParams,  // 关键！
  skipCacheWrite: true,
})
```

### 2. Overlay 文件系统隔离

```typescript
// 推测执行的写入操作隔离在临时目录
overlayPath = join(getClaudeTempDir(), 'speculation', pid, id)
// 接受时才复制回主目录
```

### 3. Pipeline 管道化

```typescript
// speculation 完成后，立即开始下一个建议的推测
// 用户接受当前 → 下一个已准备就绪
void generatePipelinedSuggestion(
  context,
  suggestionText,
  messagesRef.current,
  setAppState,
  abortController
)
```

### 4. 边界检测

```typescript
// 检测何时停止推测执行
const boundaries = [
  { type: 'bash', check: () => !checkReadOnlyConstraints().allow },
  { type: 'edit', check: () => !canAutoAcceptEdits },
  { type: 'denied_tool', check: () => true }  // 其他工具默认停止
]
```

---

## 与其他模块的交互

```
PromptSuggestion
    │
    ├── forkAgent.ts ──> runForkedAgent()
    │
    ├── hooks/postSamplingHooks.ts ──> executePromptSuggestion()
    │
    ├── AppState.ts ──> promptSuggestion 状态
    │
    └── usePromptSuggestion.ts ──> React UI 集成

Speculation
    │
    ├── speculation.ts ──> startSpeculation() / acceptSpeculation()
    │
    ├── permissions.ts ──> checkReadOnlyConstraints()
    │
    ├── BashTool/bashPermissions.ts ──> commandHasAnyCd()
    │
    └── AppState.ts ──> speculation 状态
```

---

## 关键洞察

1. **缓存复用优先**: 建议生成通过 Fork Agent 复用父请求缓存，不覆盖 API 参数
2. **安全隔离**: Speculation 使用 Overlay 隔离文件系统操作，接受时才合并
3. **管道化**: 完成一个 speculation 后立即开始下一个，减少等待时间
4. **智能边界**: 只读命令继续，危险操作停止
5. **UX 优化**: Tab 接受建议，Enter 提交自定义输入
6. **严格过滤**: 过滤元文本、错误消息、Claude 口吻
