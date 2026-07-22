# Tasks 模块深度分析

## 核心架构

Claude Code 的 Tasks 模块是一个复杂的**多任务生命周期管理系统**，负责管理后台运行的 Bash 命令、本地 Agent、远程 Agent、工作流等。

### 任务类型体系

```
TaskType (7种):
├── local_bash      # 本地 Bash 命令 (前缀: 'b')
├── local_agent     # 本地 Agent (前缀: 'a')
├── remote_agent    # 远程 Agent (前缀: 'r')
├── in_process_teammate  # 进程内队友 (前缀: 't')
├── local_workflow  # 本地工作流 (前缀: 'w')
├── monitor_mcp    # MCP 监控 (前缀: 'm')
└── dream          # 梦境任务 (前缀: 'd')

TaskStatus (5种):
├── pending         # 等待中
├── running         # 运行中
├── completed       # 已完成
├── failed         # 失败
└── killed         # 已停止
```

### 核心接口设计

```typescript
// Task.ts:72-76
export type Task = {
  name: string
  type: TaskType
  kill(taskId: string, setAppState: SetAppState): Promise<void>
}
```

**设计亮点**: 简洁的 Task 接口，只暴露 `kill` 方法。spawn/render 在 #22546 重构中被移除。

## LocalAgentTask 深度解析

### Agent 进度追踪

```typescript
// LocalAgentTask.tsx:33-39
export type AgentProgress = {
  toolUseCount: number
  tokenCount: number
  lastActivity?: ToolActivity
  recentActivities?: ToolActivity[]
  summary?: string
}
```

**关键设计**: Token 计数分离 input/output：
- `latestInputTokens`: 取最新值（API 返回的是累计值）
- `cumulativeOutputTokens`: 累加每个 turn 的输出

### 双模式任务注册

Claude Code 支持两种 Agent 任务模式：

1. **Background 模式** (`registerAsyncAgent`)
   - 立即后台运行
   - 自动后台化时间可配置

2. **Foreground 模式** (`registerAgentForeground`)
   - 前台运行，可被后台化
   - 返回 `backgroundSignal` promise

```typescript
// LocalAgentTask.tsx:526-614
export function registerAgentForeground({
  agentId,
  description,
  prompt,
  selectedAgent,
  setAppState,
  autoBackgroundMs,
  toolUseId
}): {
  taskId: string
  backgroundSignal: Promise<void>
  cancelAutoBackground?: () => void
}
```

### 层级 Abort 控制

```typescript
// LocalAgentTask.tsx:486
const abortController = parentAbortController
  ? createChildAbortController(parentAbortController)
  : createAbortController()
```

**关键**: 子 Agent 的 AbortController 自动跟随父 Agent Abort。当 in-process teammate abort 时，所有子 agent 都会被停止。

### 状态合并策略

```typescript
// utils/task/framework.ts:78-99
export function registerTask(task: TaskState, setAppState: SetAppState): void {
  setAppState(prev => {
    const existing = prev.tasks[task.id]
    const merged = existing && 'retain' in existing
      ? {
          ...task,
          retain: existing.retain,           // 保留 UI 状态
          startTime: existing.startTime,    // 保持面板排序
          messages: existing.messages,      // 保留已查看的转录
          diskLoaded: existing.diskLoaded,
          pendingMessages: existing.pendingMessages,
        }
      : task
    return { ...prev, tasks: { ...prev.tasks, [task.id]: merged } }
  })
}
```

**设计意图**: `resumeAgentBackground` 替换任务时，用户的 retain、消息历史不会丢失。

## LocalShellTask 深度解析

### Stall Watchdog 机制

```typescript
// LocalShellTask.tsx:24-26
const STALL_CHECK_INTERVAL_MS = 5_000
const STALL_THRESHOLD_MS = 45_000

// 检测交互式提示
const PROMPT_PATTERNS = [
  /\(y\/n\)/i,
  /\[y\/n\]/i,
  /Press (any key|Enter)/i,
  /Continue\?/i,
]
```

**关键**: 输出停滞 45 秒后，检测最后一行是否是交互式提示。避免误报长时间运行的命令（如 `git log -S`）。

### Bash 任务状态机

```
foreground (isBackgrounded=false)
    │
    ├── backgroundTask() → backgrounded (isBackgrounded=true)
    │
    └── unregisterForeground() → 已完成/失败 → 移除状态

backgrounded (isBackgrounded=true)
    │
    ├── killTask() → killed → evicted after grace period
    │
    └── 完成 → completed/failed → evicted after grace period
```

### 全局后台化

```typescript
// LocalShellTask.tsx:390-410
export function backgroundAll(getAppState: () => AppState, setAppState: SetAppState): void {
  // 后台化所有前台 Bash 任务
  for (const taskId of foregroundBashTaskIds) {
    backgroundTask(taskId, getAppState, setAppState)
  }
  // 后台化所有前台 Agent 任务
  for (const taskId of foregroundAgentTaskIds) {
    backgroundAgentTask(taskId, getAppState, setAppState)
  }
}
```

**场景**: 用户按 Ctrl+B 时，所有前台任务同时后台化。

## DiskTaskOutput 深度解析

### 内存安全写入

```typescript
// utils/task/diskOutput.ts:97-231
export class DiskTaskOutput {
  #queue: string[] = []
  #flushPromise: Promise<void> | null = null

  append(content: string): void {
    this.#bytesWritten += content.length
    if (this.#bytesWritten > MAX_TASK_OUTPUT_BYTES) {
      this.#capped = true
      this.#queue.push('\n[output truncated: exceeded 5GB disk cap]\n')
    } else {
      this.#queue.push(content)
    }
    if (!this.#flushPromise) {
      this.#flushPromise = new Promise(resolve => {
        this.#flushResolve = resolve
      })
      void track(this.#drain())
    }
  }
}
```

**关键设计**: 
- 使用 flat array 作为写队列，避免链式 `.then()` 闭包内存泄漏
- `#queueToBuffers()` 用 splice 原地修改数组，告知 GC 可立即释放
- **严格禁止在 `#writeAllChunks()` 内添加 await，防止内存膨胀

### 安全标志

```typescript
// utils/task/diskOutput.ts:17-21
// SECURITY: O_NOFOLLOW prevents following symlinks when opening task output files.
// Without this, an attacker in the sandbox could create symlinks in the tasks directory
// pointing to arbitrary files, causing Claude Code on the host to write to those files.
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
```

**安全**: Unix 系统使用 `O_NOFOLLOW` 防止符号链接攻击。Windows 上不可用但 sandbox 攻击向量仅限 Unix。

## TodoWrite vs Task 任务系统

Claude Code 有两个独立的任务系统：

### 1. TodoWrite 任务 (utils/tasks.ts)

**用途**: LLM 可创建/管理的结构化任务

```typescript
// utils/tasks.ts:76-89
export const TaskSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    subject: z.string(),
    description: z.string(),
    activeForm: z.string().optional(),
    owner: z.string().optional(),
    status: TaskStatusSchema(),
    blocks: z.array(z.string()),
    blockedBy: z.array(z.string()),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
)
```

**特性**:
- **文件持久化**: 每个任务一个 JSON 文件
- **文件锁**: 使用 `proper-lockfile` 防止并发冲突
- **高水位标记**: 删除任务后 ID 不复用，防止混淆
- **团队感知**: `getTaskListId()` 支持团队任务列表
- **依赖管理**: `blocks`/`blockedBy` 支持任务依赖图

### 2. Task 任务 (Task.ts)

**用途**: 后台运行的任务生命周期管理

**特性**:
- **内存状态**: 存储在 AppState.tasks
- **输出流**: 通过 DiskTaskOutput 写入磁盘
- **UI 集成**: 支持前台/后台切换、进度追踪

### 隔离机制

```typescript
// utils/tasks.ts:199-210
export function getTaskListId(): string {
  if (process.env.CLAUDE_CODE_TASK_LIST_ID) {
    return process.env.CLAUDE_CODE_TASK_LIST_ID
  }
  const teammateCtx = getTeammateContext()
  if (teammateCtx) {
    return teammateCtx.teamName  // 进程内队友使用团队名称
  }
  return getTeamName() || leaderTeamName || getSessionId()
}
```

**设计**: 进程内 teammate 与 leader 共享任务列表，tmux/iTerm2 teammate 也解析到同一列表。

## Task Polling 机制

```typescript
// utils/task/framework.ts:255-269
export async function pollTasks(
  getAppState: () => AppState,
  setAppState: SetAppState,
): Promise<void> {
  const state = getAppState()
  const { attachments, updatedTaskOffsets, evictedTaskIds } =
    await generateTaskAttachments(state)

  applyTaskOffsetsAndEvictions(setAppState, updatedTaskOffsets, evictedTaskIds)

  for (const attachment of attachments) {
    enqueueTaskNotification(attachment)
  }
}
```

**关键**: 使用新鲜状态计算 delta，避免 TOCTOU 问题：
- `generateTaskAttachments` await 后可能发生状态变化
- `applyTaskOffsetsAndEvictions` 重新检查状态，避免覆盖

## 通知防重机制

```typescript
// LocalAgentTask.tsx:224-240
export function enqueueAgentNotification({...}): void {
  let shouldEnqueue = false
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.notified) {
      return task  // 已通知，跳过
    }
    shouldEnqueue = true
    return { ...task, notified: true }
  })
  if (!shouldEnqueue) {
    return
  }
  // 发送通知...
}
```

**关键**: 原子性的 check-and-set，确保不重复通知。

## LocalMainSessionTask 深度解析

### 后台会话隔离

```typescript
// LocalMainSessionTask.ts:102-110
// Link output to an isolated per-task transcript file (same layout as
// sub-agents). Do NOT use getTranscriptPath() — that's the main session's
// file, and writing there from a background query after /clear would corrupt
// the post-clear conversation.
void initTaskOutputAsSymlink(
  taskId,
  getAgentTranscriptPath(asAgentId(taskId)),
)
```

**关键**: 后台会话使用独立的 transcript 文件，避免 `/clear` 后的会话混乱。

### 前台化流程

```typescript
// LocalMainSessionTask.ts:270-302
export function foregroundMainSessionTask(
  taskId: string,
  setAppState: SetAppState,
): Message[] | undefined {
  setAppState(prev => {
    // 恢复之前的前台任务到后台
    const restorePrev = prevId && prevId !== taskId && prevTask?.type === 'local_agent'
    
    return {
      ...prev,
      foregroundedTaskId: taskId,
      tasks: {
        ...prev.tasks,
        ...(restorePrev && { [prevId]: { ...prevTask, isBackgrounded: true } }),
        [taskId]: { ...task, isBackgrounded: false },
      },
    }
  })
}
```

**设计**: 同时只能有一个前台任务。切换时自动将旧任务放回后台。

## 关键设计模式

### 1. 状态合并模式

```typescript
// utils/task/framework.ts:87-97
const merged = existing && 'retain' in existing
  ? {
      ...task,
      retain: existing.retain,
      startTime: existing.startTime,
      messages: existing.messages,
      diskLoaded: existing.diskLoaded,
      pendingMessages: existing.pendingMessages,
    }
  : task
```

**意图**: 保留 UI 状态的同时接受新的任务数据。

### 2. 异步边界外副作用

```typescript
// LocalAgentTask.tsx:669-681
export function unregisterAgentForeground(taskId: string, setAppState: SetAppState): void {
  let cleanupFn: (() => void) | undefined
  setAppState(prev => {
    // ...
    cleanupFn = task.unregisterCleanup  // 捕获到闭包
    // ...
  })
  cleanupFn?.()  // 在 updater 外调用，避免状态更新中的副作用
}
```

**关键**: 清理函数在状态 updater 外调用，避免 React 不推荐的状态更新副作用。

### 3. 锁重试策略

```typescript
// utils/tasks.ts:102-108
const LOCK_OPTIONS = {
  retries: {
    retries: 30,
    minTimeout: 5,
    maxTimeout: 100,
  },
}
```

**设计**: 为多 Claude swarm 场景优化，最后一个调用者需要 ~2.6s 等待时间。

## 安全考量

### 1. 符号链接攻击防护

```typescript
// utils/task/diskOutput.ts:405-417
const fh = await open(
  outputPath,
  process.platform === 'win32'
    ? 'wx'
    : fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | O_NOFOLLOW,
)
```

### 2. 路径遍历防护

```typescript
// utils/tasks.ts:217-219
export function sanitizePathComponent(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '-')
}
```

### 3. Abort 级联

```typescript
// LocalAgentTask.tsx:486
const abortController = parentAbortController
  ? createChildAbortController(parentAbortController)
  : createAbortController()
```

子 agent abort 时自动 abort，父 agent abort 时子 agent 也自动 abort。

## 性能优化

### 1. 高水位标记

```typescript
// utils/tasks.ts:91-131
// High water mark file — 存储最大任务 ID
// 删除任务后 ID 不复用，防止与残留引用混淆
```

### 2. 批量读取

```typescript
// utils/tasks.ts:443-456
export async function listTasks(taskListId: string): Promise<Task[]> {
  const files = await readdir(dir)
  const taskIds = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  const results = await Promise.all(taskIds.map(id => getTask(taskListId, id)))
  return results.filter((t): t is Task => t !== null)
}
```

### 3. 内存中的 DiskTaskOutput 缓存

```typescript
// utils/task/diskOutput.ts:233
const outputs = new Map<string, DiskTaskOutput>()

function getOrCreateOutput(taskId: string): DiskTaskOutput {
  let output = outputs.get(taskId)
  if (!output) {
    output = new DiskTaskOutput(taskId)
    outputs.set(taskId, output)
  }
  return output
}
```

## 集成点

### 与 AgentTool 的集成

```typescript
// AgentTool 调用 registerAsyncAgent 创建后台 agent
// AgentTool 接收 agent 结果后调用 completeAgentTask
// AgentTool 捕获错误后调用 failAgentTask
```

### 与 Hooks 的集成

```typescript
// LocalShellTask 支持 hook 的 postSpawn 回调
// 错误通过 hooks 的 error handler 传播
```

### 与 Compact 的集成

```typescript
// 后台任务输出通过 Attachments 系统传递
// TASK_NOTIFICATION_TAG XML 标签嵌入消息
```

## 总结

Tasks 模块展现了 Claude Code 对**多任务并发管理**的深刻理解：

1. **统一的任务接口**: 7 种任务类型共享相同的生命周期模式
2. **状态隔离**: Foreground/Background 分离，UI 与执行解耦
3. **安全优先**: 符号链接防护、路径清理、Abort 级联
4. **性能优化**: 内存安全的写入队列、批量操作、缓存
5. **优雅降级**: 锁重试、Stall Watchdog、超时处理
6. **团队协作**: 共享任务列表、任务认领、依赖管理
