# State 模块深度分析

## 核心架构

Claude Code采用**双层状态架构**：

```
┌─────────────────────────────────────────────────────────────────┐
│  全局状态 (bootstrap/state.ts - 1758行)                         │
│  - 纯JavaScript对象 (STATE常量)                                  │
│  - 运行时指标、API使用、会话跟踪                                  │
│  - 200+ 字段，通过getter/setter访问                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  响应式状态 (state/*.ts)                                        │
│  - AppState: UI状态、MCP、插件、任务、团队                       │
│  - createStore<T>(): 响应式Store模式                            │
│  - onChangeAppState: 状态变更副作用处理                          │
└─────────────────────────────────────────────────────────────────┘
```

## 1. Store模式 (store.ts - 34行)

```typescript
type Store<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: () => void) => () => void
}
```

**关键设计：**
- `Object.is` 相等性检查，避免无意义更新
- `Set<Listener>` 支持多个订阅者
- `onChange` 回调用于副作用处理

## 2. AppState 结构 (AppStateStore.ts - 569行)

### 2.1 核心类型

```typescript
export type CompletionBoundary =
  | { type: 'complete'; completedAt: number; outputTokens: number }
  | { type: 'bash'; command: string; completedAt: number }
  | { type: 'edit'; toolName: string; filePath: string; completedAt: number }
  | { type: 'denied_tool'; toolName: string; detail: string; completedAt: number }

export type SpeculationState =
  | { status: 'idle' }
  | {
      status: 'active'
      id: string
      abort: () => void
      messagesRef: { current: Message[] }
      writtenPathsRef: { current: Set<string> }
      boundary: CompletionBoundary | null
      isPipelined: boolean
    }
```

### 2.2 AppState 主要字段

```typescript
export type AppState = DeepImmutable<{
  // 核心配置
  settings: SettingsJson
  toolPermissionContext: ToolPermissionContext
  mainLoopModel: ModelSetting
  
  // UI状态
  expandedView: 'none' | 'tasks' | 'teammates'
  footerSelection: FooterItem | null
  coordinatorTaskIndex: number
  
  // MCP和插件
  mcp: { clients, tools, commands, resources, pluginReconnectKey }
  plugins: { enabled, disabled, commands, errors }
  
  // 任务管理
  tasks: { [taskId: string]: TaskState }
  agentNameRegistry: Map<string, AgentId>
  foregroundedTaskId?: string
  viewingAgentTaskId?: string
  
  // 团队协作
  teamContext?: { teamName, teammates, selfAgentId, ... }
  inbox: { messages }
  workerSandboxPermissions: { queue, selectedIndex }
  
  // 远程功能
  replBridge*: 10+ 远程桥接相关字段
  remoteConnectionStatus: 'connecting' | 'connected' | ...
  ultraplan*: 5+ Ultraplan相关字段
  
  // 工具状态
  tungstenPanel*: Tmux面板状态
  bagel*: WebBrowser工具状态
  computerUseMcpState: 计算机使用MCP状态
  replContext: REPL工具VM上下文
  
  // 推测执行
  speculation: SpeculationState
  promptSuggestion: { text, promptId, shownAt, ... }
  
  // 其他
  thinkingEnabled: boolean
  notifications: { current, queue }
  elicitation: { queue }
  sessionHooks: SessionHooksState
  activeOverlays: ReadonlySet<string>
}>
```

## 3. onChangeAppState (171行) - 状态同步中枢

```typescript
export function onChangeAppState({ newState, oldState }): void {
  // 1. permission_mode 变更同步到 CCR 和 SDK
  if (prevMode !== newMode) {
    notifySessionMetadataChanged({ permission_mode: newExternal, ... })
    notifyPermissionModeChanged(newMode)
  }
  
  // 2. mainLoopModel 持久化
  if (newState.mainLoopModel === null) {
    updateSettingsForSource('userSettings', { model: undefined })
    setMainLoopModelOverride(null)
  }
  
  // 3. expandedView 持久化
  if (newState.expandedView !== oldState.expandedView) {
    saveGlobalConfig({ showExpandedTodos, showSpinnerTree })
  }
  
  // 4. settings 变更清除认证缓存
  if (newState.settings !== oldState.settings) {
    clearApiKeyHelperCache()
    clearAwsCredentialsCache()
    clearGcpCredentialsCache()
  }
}
```

**关键设计：** 单一变更处理点，所有副作用集中管理。

## 4. Selectors (76行) - 计算状态

```typescript
export function getViewedTeammateTask(appState): InProcessTeammateTaskState | undefined
export function getActiveAgentForInput(appState): ActiveAgentForInput
// ActiveAgentForInput = 'leader' | 'viewed' | 'named_agent'
```

## 5. TeamViewHelpers (141行) - 队友视图管理

```typescript
// 进入队友视图
export function enterTeammateView(taskId, setAppState): void {
  // 1. 记录分析事件
  // 2. 如果切换队友，释放旧的
  // 3. 设置 retain=true 防止任务被驱逐
  // 4. 设置 viewingAgentTaskId
}

// 退出队友视图
export function stopOrDismissAgent(taskId, setAppState): void {
  // running → abort
  // terminal → evictAfter=0 (立即隐藏)
  // viewingThis → 退出到 leader
}
```

**关键字段：**
- `retain: true` - 阻止任务被驱逐
- `evictAfter: timestamp` - 延迟驱逐时间
- `PANEL_GRACE_MS = 30_000` - 终端任务30秒宽限期

## 6. 全局状态 (bootstrap/state.ts - 1758行)

### 6.1 核心字段分类

```typescript
type State = {
  // 会话管理
  sessionId: SessionId
  parentSessionId: SessionId | undefined
  sessionProjectDir: string | null
  
  // 性能追踪
  totalCostUSD: number
  totalAPIDuration: number
  totalToolDuration: number
  modelUsage: { [modelName: string]: ModelUsage }
  
  // 模型配置
  mainLoopModelOverride: ModelSetting | undefined
  initialMainLoopModel: ModelSetting
  
  // Beta Header Latches (会话级持久化)
  afkModeHeaderLatched: boolean | null
  fastModeHeaderLatched: boolean | null
  cacheEditingHeaderLatched: boolean | null
  thinkingClearLatched: boolean | null
  
  // 技能追踪 (用于Compaction保留)
  invokedSkills: Map<`${agentId}:${skillName}`, SkillInfo>
  
  // Telemetry
  meter: Meter | null
  eventLogger: Logger | null
  sessionCounter: AttributedCounter | null
}
```

### 6.2 Beta Header Latches 机制

```typescript
// 一旦触发，保持激活直到 /clear 或 /compact
export function setAfkModeHeaderLatched(v: boolean): void {
  STATE.afkModeHeaderLatched = v
}

export function clearBetaHeaderLatches(): void {
  STATE.afkModeHeaderLatched = null
  STATE.fastModeHeaderLatched = null
  STATE.cacheEditingHeaderLatched = null
  STATE.thinkingClearLatched = null
}
```

**目的：** 防止频繁切换导致Prompt Cache失效。

### 6.3 Scroll Drain Suspension

```typescript
// 滚动时暂停后台任务，150ms无滚动后恢复
let scrollDraining = false
let scrollDrainTimer: ReturnType<typeof setTimeout>

export function markScrollActivity(): void {
  scrollDraining = true
  clearTimeout(scrollDrainTimer)
  scrollDrainTimer = setTimeout(() => {
    scrollDraining = false
  }, SCROLL_DRAIN_IDLE_MS) // 150ms
}

export async function waitForScrollIdle(): Promise<void> {
  while (scrollDraining) {
    await new Promise(r => setTimeout(r, SCROLL_DRAIN_IDLE_MS))
  }
}
```

## 7. Session切换机制

```typescript
const sessionSwitched = createSignal<[id: SessionId]>()

export function switchSession(sessionId: SessionId, projectDir: string | null): void {
  STATE.planSlugCache.delete(STATE.sessionId) // 清理旧slug
  STATE.sessionId = sessionId
  STATE.sessionProjectDir = projectDir
  sessionSwitched.emit(sessionId) // 触发订阅者
}

export const onSessionSwitch = sessionSwitched.subscribe
```

## 8. 深度理解

### 8.1 Immutable Store模式

```typescript
setState: (updater) => {
  const prev = state
  const next = updater(prev)
  if (Object.is(next, prev)) return // 无变化则跳过
  state = next
  onChange?.({ newState: next, oldState: prev })
  for (const listener of listeners) listener()
}
```

### 8.2 双重状态系统

| 特性 | 全局状态 (bootstrap/state.ts) | 响应式状态 (state/*.ts) |
|------|------------------------------|------------------------|
| 用途 | 运行时数据、指标、会话 | UI状态、任务、MCP |
| 更新方式 | 直接赋值 | setState()函数 |
| 通知 | 手动触发 | 自动订阅 |
| 持久化 | 否 | 可通过onChange持久化 |

### 8.3 teamContext vs agentId

```typescript
// teamContext: 团队协作的共享上下文
teamContext?: {
  teamName: string
  teammates: { [teammateId]: { tmuxSessionName, cwd, ... } }
  selfAgentId: string  // Swarm成员的自身ID
}

// toolUseContext.agentId: 进程内子agent的标识
```

### 8.4 Speculation状态

推测执行用于预测用户意图：
```typescript
speculation: {
  status: 'active'
  messagesRef: { current: Message[] }  // 可变引用避免数组复制
  writtenPathsRef: { current: Set<string> }  // 写入路径追踪
  boundary: CompletionBoundary | null
  isPipelined: boolean  // 是否流水线执行
}
```

## 9. 关键设计决策

1. **Object.is相等性检查** - 避免无意义更新
2. **单一变更处理点** - onChangeAppState集中管理副作用
3. **Beta Header Latches** - 会话级持久化防止Cache抖动
4. **Scroll Drain Suspension** - 滚动时暂停后台任务
5. **teamContext隔离** - 团队上下文与agentId分离
6. **slowOperations TTL** - 10秒TTL + 稳定引用模式
7. **DeepImmutable包装** - 防止意外修改响应式状态

## 10. 文件清单

```
src/
├── state/
│   ├── AppStateStore.ts      # 569行 - AppState类型定义
│   ├── store.ts              # 34行 - Store模式实现
│   ├── onChangeAppState.ts   # 171行 - 状态变更副作用
│   ├── selectors.ts          # 76行 - 计算状态选择器
│   └── teammateViewHelpers.ts # 141行 - 队友视图辅助
└── bootstrap/
    └── state.ts              # 1758行 - 全局状态管理
```

## 11. 理解深度评估

**预估理解度：** ~90%

**核心掌握：**
- ✅ Store模式实现原理
- ✅ AppState完整结构
- ✅ 双层状态架构
- ✅ onChangeAppState副作用处理
- ✅ Beta Header Latches机制
- ✅ Scroll Drain Suspension
- ✅ Session切换机制

**需要深入：**
- 🔶 具体工具状态字段的使用场景
- 🔶 Speculation与推测执行的完整流程
