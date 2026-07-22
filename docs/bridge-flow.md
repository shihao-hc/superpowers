# Bridge 模块深度分析

## 概述

Bridge 模块是 Claude Code 的 Remote Control 核心，负责将本地 CLI 会话桥接到 claude.ai 云端服务。支持远程控制、实时协作、镜像模式等功能。

## 核心架构

### 双协议栈设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code CLI                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐           ┌─────────────────────────────┐  │
│  │   initReplBridge │           │       bridgeMain.ts        │  │
│  │   (REPL 模式)    │           │     (Standalone 模式)      │  │
│  └────────┬─────────┘           └──────────────┬──────────────┘  │
│           │                                     │                │
│           │    ┌───────────────────────────────┘                │
│           │    │                                                │
│           ▼    ▼                                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Bridge Core                              ││
│  │  ┌─────────────────┐     ┌──────────────────────────────┐  ││
│  │  │ remoteBridgeCore│     │    initBridgeCore (v1)       │  ││
│  │  │  (env-less v2) │     │      (env-based v1)          │  ││
│  │  └────────┬────────┘     └──────────────┬───────────────┘  ││
│  └───────────┼─────────────────────────────┼─────────────────┘ │
│              │                             │                    │
│  ┌───────────▼─────────────────────────────▼───────────────────┐ │
│  │                    Transport Layer                          │ │
│  │  ┌────────────────────┐    ┌───────────────────────────┐  │ │
│  │  │  SSETransport      │    │  HybridTransport (v1)      │  │ │
│  │  │  + CCRClient (v2)  │    │  WS reads + POST writes   │  │ │
│  │  └─────────┬──────────┘    └───────────────────────────┘  │ │
│  └────────────┼───────────────────────────────────────────────┘ │
│               │                                                    │
└───────────────┼────────────────────────────────────────────────────┘
                ▼
        ┌────────────────┐
        │   claude.ai    │
        │   Remote API   │
        └────────────────┘
```

### v1 vs v2 协议对比

| 特性 | v1 (env-based) | v2 (env-less) |
|------|-----------------|---------------|
| 会话创建 | Environments API | POST /v1/code/sessions |
| 凭证获取 | register → poll → ack → heartbeat | POST /bridge → worker_jwt |
| 传输层 | HybridTransport | SSETransport + CCRClient |
| 重连 | poll loop | 401 恢复 + 主动刷新 |
| 适用场景 | daemon/print | REPL 模式 |

## 核心文件分析

### types.ts (~262 行)

#### 关键类型

```typescript
// 会话超时默认 24 小时
export const DEFAULT_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000

// 会话活动类型
export type SessionActivityType = 'tool_start' | 'text' | 'result' | 'error'

// 桥接配置
export type BridgeConfig = {
  dir: string                    // 工作目录
  machineName: string            // 机器名
  branch: string                 // Git 分支
  gitRepoUrl: string | null      // Git 仓库 URL
  maxSessions: number            // 最大会话数
  spawnMode: SpawnMode            //  spawn模式
  bridgeId: string               // 桥接实例 ID
  workerType: BridgeWorkerType   // worker 类型
  environmentId: string           // 环境 ID
  reuseEnvironmentId?: string    // 重用环境 ID
}

// 会话句柄
export type SessionHandle = {
  sessionId: string
  done: Promise<SessionDoneStatus>
  kill(): void
  forceKill(): void
  activities: SessionActivity[]  // 活动环形缓冲区
  currentActivity: SessionActivity | null
  accessToken: string           // 入口令牌
  lastStderr: string[]          // 错误环形缓冲区
  writeStdin(data: string): void
  updateAccessToken(token: string): void
}

// 桥接 API 客户端
export type BridgeApiClient = {
  registerBridgeEnvironment(config: BridgeConfig): Promise<{...}>
  pollForWork(...): Promise<WorkResponse | null>
  acknowledgeWork(...): Promise<void>
  stopWork(...): Promise<void>
  deregisterEnvironment(...): Promise<void>
  sendPermissionResponseEvent(...): Promise<void>
  archiveSession(...): Promise<void>
  reconnectSession(...): Promise<void>
  heartbeatWork(...): Promise<{...}>
}
```

### bridgeEnabled.ts (~202 行)

#### 功能开关

```typescript
// 主开关：需要 claude.ai 订阅 + GrowthBook gate
export function isBridgeEnabled(): boolean {
  return feature('BRIDGE_MODE')
    ? isClaudeAISubscriber() &&
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_ccr_bridge', false)
    : false
}

// 阻塞式检查（用于权限门）
export async function isBridgeEnabledBlocking(): Promise<boolean>

// 诊断消息
export async function getBridgeDisabledReason(): Promise<string | null>

// v2 REPL 桥接开关
export function isEnvLessBridgeEnabled(): boolean {
  return feature('BRIDGE_MODE')
    ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_bridge_repl_v2', false)
    : false
}

// CSE (cse_*) 兼容开关
export function isCseShimEnabled(): boolean

// 自动连接默认
export function getCcrAutoConnectDefault(): boolean

// 镜像模式
export function isCcrMirrorEnabled(): boolean
```

**架构发现**: 
- 使用 **Positive ternary pattern** 确保外部构建消除未使用字符串
- GrowthBook 缓存支持快速路径（已缓存）和慢速路径（首次加载）
- 跨进程回退通过 `bridgeOauthDeadExpiresAt` 实现

### bridgeMessaging.ts (~461 行)

#### 消息处理核心

```typescript
// 入口消息路由
export function handleIngressMessage(
  data: string,
  recentPostedUUIDs: BoundedUUIDSet,  // 回声去重
  recentInboundUUIDs: BoundedUUIDSet,   // 重投递去重
  onInboundMessage?: (msg: SDKMessage) => void,
  onPermissionResponse?: (response: SDKControlResponse) => void,
  onControlRequest?: (request: SDKControlRequest) => void,
): void
```

**去重策略**:
1. `recentPostedUUIDs`: 我们发送的消息 UUID，回声检测
2. `recentInboundUUIDs`: 已转发的入站消息，重投递检测

#### 服务器控制请求处理

```typescript
export function handleServerControlRequest(
  request: SDKControlRequest,
  handlers: ServerControlRequestHandlers,
): void

// 支持的控制类型:
case 'initialize':      // 会话初始化
case 'set_model':       // 模型切换
case 'set_max_thinking_tokens': // 思考令牌数
case 'set_permission_mode': // 权限模式
case 'interrupt':       // 中断
```

#### BoundedUUIDSet (环形缓冲区)

```typescript
export class BoundedUUIDSet {
  private readonly capacity: number
  private readonly ring: (string | undefined)[]
  private readonly set = new Set<string>()
  private writeIdx = 0

  add(uuid: string): void {
    if (this.set.has(uuid)) return
    // 驱逐最旧的条目
    const evicted = this.ring[this.writeIdx]
    if (evicted !== undefined) {
      this.set.delete(evicted)
    }
    this.ring[this.writeIdx] = uuid
    this.set.add(uuid)
    this.writeIdx = (this.writeIdx + 1) % this.capacity
  }
}
```

**特点**:
- **O(1) 内存**: 固定容量，不随消息数增长
- **FIFO 驱逐**: 按时间顺序驱逐最旧条目
- **外部排序依赖**: 依赖外部 hook 的 lastWrittenIndexRef 作为主去重

### jwtUtils.ts (~256 行)

#### Token 刷新调度器

```typescript
export function createTokenRefreshScheduler({
  getAccessToken,
  onRefresh,
  label,
  refreshBufferMs = 5 * 60 * 1000, // 5 分钟
}): {
  schedule: (sessionId: string, token: string) => void
  scheduleFromExpiresIn: (sessionId: string, expiresInSeconds: number) => void
  cancel: (sessionId: string) => void
  cancelAll: () => void
}
```

**Generation 计数器模式**:

```typescript
const generations = new Map<string, number>()

function doRefresh(sessionId: string, gen: number): Promise<void> {
  // ...
  // 如果代已变更，跳过刷新
  if (generations.get(sessionId) !== gen) {
    return
  }
  // ...
}
```

**防止重复刷新的机制**:
1. 调度时递增 generation
2. 取消时递增 generation
3. 异步刷新前检查 generation 是否匹配

### remoteBridgeCore.ts (~1008 行)

#### v2 Env-less 初始化流程

```typescript
export async function initEnvLessBridgeCore(
  params: EnvLessBridgeParams,
): Promise<ReplBridgeHandle | null> {
  // 1. 创建会话: POST /v1/code/sessions
  const createdSessionId = await createCodeSession(...)

  // 2. 获取桥接凭证: POST /v1/code/sessions/{id}/bridge
  const credentials = await fetchRemoteCredentials(...)

  // 3. 构建 v2 传输层: SSETransport + CCRClient
  const transport = await createV2ReplTransport(...)

  // 4. JWT 刷新调度器 (5 分钟前刷新)
  const refresh = createTokenRefreshScheduler(...)

  // 5. 传输回调接线
  wireTransportCallbacks()

  // 6. 连接
  transport.connect()
}
```

#### 401 恢复流程

```typescript
async function recoverFromAuthFailure(): Promise<void> {
  // 同步声明锁，防止竞态
  if (authRecoveryInFlight) return
  authRecoveryInFlight = true

  // 刷新 OAuth 令牌
  if (onAuth401) await onAuth401(stale ?? '')

  // 重新获取凭证
  const fresh = await fetchRemoteCredentials(...)

  // 重建传输层
  await rebuildTransport(fresh, 'auth_401_recovery')

  authRecoveryInFlight = false
}
```

**关键设计**:
- `authRecoveryInFlight` 同步声明，在任何 await 之前
- 防止 laptop wake 和主动刷新同时触发导致重复 /bridge 调用

#### 传输层重建

```typescript
async function rebuildTransport(
  fresh: RemoteCredentials,
  cause: Exclude<ConnectCause, 'initial'>,
): Promise<void> {
  // 1. 启动刷新门，队列写入
  flushGate.start()

  // 2. 获取序列号，准备 SSE 续传
  const seq = transport.getLastSequenceNum()

  // 3. 关闭旧传输
  transport.close()

  // 4. 创建新传输（续传序列号）
  transport = await createV2ReplTransport({
    initialSequenceNum: seq,
    ...
  })

  // 5. 重新连接
  wireTransportCallbacks()
  transport.connect()

  // 6. 刷新门排空
  drainFlushGate()
}
```

### replBridgeTransport.ts (~370 行)

#### v1/v2 传输适配器

```typescript
// v1 适配器: 包装 HybridTransport
export function createV1ReplTransport(hybrid: HybridTransport): ReplBridgeTransport

// v2 适配器: 包装 SSETransport + CCRClient
export async function createV2ReplTransport(opts: {...}): Promise<ReplBridgeTransport>
```

**v2 架构**:

```typescript
const sse = new SSETransport(sseUrl, {...})
const ccr = new CCRClient(sse, new URL(sessionUrl), {
  heartbeatIntervalMs: opts.heartbeatIntervalMs,
  heartbeatJitterFraction: opts.heartbeatJitterFraction,
  onEpochMismatch: () => {
    ccr.close()
    sse.close()
    onCloseCb?.(4090) // Epoch 不匹配码
  }
})
```

**状态报告**:

```typescript
reportState(state: SessionState): void
// 'idle' | 'running' | 'requires_action'
// 用于 claude.ai 会话列表显示
```

### initReplBridge.ts (~569 行)

#### 初始化流程

```typescript
export async function initReplBridge(
  options?: InitBridgeOptions,
): Promise<ReplBridgeHandle | null> {
  // 1. Runtime gate 检查
  if (!(await isBridgeEnabledBlocking())) return null

  // 2. OAuth 检查 (跨进程回退)
  if (!getBridgeAccessToken()) return null

  // 3. 策略检查
  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_control')) return null

  // 4. 派生标题
  let title = deriveTitle(initialMessages)
  // 优先级: explicit → /rename → message → generated slug

  // 5. v1/v2 分支
  if (isEnvLessBridgeEnabled() && !perpetual) {
    return initEnvLessBridgeCore({...})
  }
  return initBridgeCore({...}) // v1 路径
}
```

#### 标题派生策略

```typescript
// 第一次用户消息: 快速占位符
if (userMessageCount === 1 && !hasTitle) {
  const placeholder = deriveTitle(text) // 截取第一句
  patch(placeholder, bridgeSessionId, 1)
  generateAndPatch(text, bridgeSessionId) // Haiku 生成异步升级
}

// 第三次用户消息: 完整对话
else if (userMessageCount === 3) {
  const input = extractConversationText(getMessagesAfterCompactBoundary(msgs))
  generateAndPatch(input, bridgeSessionId)
}
```

**标题最大长度**: 50 字符

### sessionRunner.ts (~550 行)

#### 会话生成器

```typescript
export function createSessionSpawner(deps: SessionSpawnerDeps): SessionSpawner {
  return {
    spawn(opts: SessionSpawnOpts, dir: string): SessionHandle {
      // 构建 CLI 参数
      const args = [
        '--print',
        '--sdk-url', opts.sdkUrl,
        '--session-id', opts.sessionId,
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--replay-user-messages',
      ]

      // 设置环境变量
      const env: NodeJS.ProcessEnv = {
        CLAUDE_CODE_SESSION_ACCESS_TOKEN: opts.accessToken,
        CLAUDE_CODE_ENVIRONMENT_KIND: 'bridge',
        ...(opts.useCcrV2 && {
          CLAUDE_CODE_USE_CCR_V2: '1',
          CLAUDE_CODE_WORKER_EPOCH: String(opts.workerEpoch),
        }),
      }

      // 启动子进程
      const child = spawn(deps.execPath, args, {
        cwd: dir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      })
    }
  }
}
```

#### NDJSON 解析

```typescript
// 从子进程 stdout 解析活动
function extractActivities(line: string, sessionId: string): SessionActivity[] {
  const parsed = jsonParse(line)
  switch (parsed.type) {
    case 'assistant':
      // 解析 tool_use 块
      for (const block of content) {
        if (b.type === 'tool_use') {
          activities.push({
            type: 'tool_start',
            summary: toolSummary(name, input),
            timestamp: now,
          })
        }
      }
      break
    case 'result':
      // 解析结果
      break
  }
}
```

#### Token 刷新

```typescript
updateAccessToken(token: string): void {
  handle.accessToken = token
  // 通过 stdin 发送环境变量更新
  handle.writeStdin(
    jsonStringify({
      type: 'update_environment_variables',
      variables: { CLAUDE_CODE_SESSION_ACCESS_TOKEN: token },
    }) + '\n'
  )
}
```

### bridgeMain.ts (~3000 行)

#### 独立桥接循环

```typescript
export async function runBridgeLoop(
  config: BridgeConfig,
  environmentId: string,
  environmentSecret: string,
  api: BridgeApiClient,
  spawner: SessionSpawner,
  logger: BridgeLogger,
  signal: AbortSignal,
): Promise<void> {
  // 活动会话映射
  const activeSessions = new Map<string, SessionHandle>()
  const sessionWorkIds = new Map<string, string>()
  const sessionIngressTokens = new Map<string, string>()

  // 容量唤醒
  const capacityWake = createCapacityWake(loopSignal)

  // 轮询循环
  while (!loopSignal.aborted) {
    // 1. 心跳所有活动工作项
    const heartbeatResult = await heartbeatActiveWorkItems()

    // 2. 轮询新工作
    const work = await api.pollForWork(
      environmentId,
      environmentSecret,
      loopSignal,
      reclaimOlderThanMs,
    )

    // 3. 处理工作
    if (work) {
      await handleWork(work)
    }

    // 4. 清理完成会话
    await cleanupCompletedSessions()
  }
}
```

#### 回退配置

```typescript
const DEFAULT_BACKOFF: BackoffConfig = {
  connInitialMs: 2_000,      // 连接初始重试
  connCapMs: 120_000,        // 连接最大重试 (2 分钟)
  connGiveUpMs: 600_000,     // 连接放弃 (10 分钟)
  generalInitialMs: 500,     // 通用初始重试
  generalCapMs: 30_000,       // 通用最大重试
  generalGiveUpMs: 600_000,  // 通用放弃
}
```

#### 多会话管理

```typescript
// 支持三种 spawn 模式
export type SpawnMode = 
  | 'single-session'  // 单会话
  | 'worktree'       // Git worktree 隔离
  | 'same-dir'       // 共享目录

// 会话超时看门狗
const sessionTimers = new Map<string, ReturnType<typeof setTimeout>>()
```

## 关键架构模式

### 1. FlushGate 模式

```typescript
class FlushGate<T> {
  private queue: T[] = []
  private active = false

  start(): void { this.active = true }
  
  enqueue(...items: T[]): boolean {
    if (!this.active) return false
    this.queue.push(...items)
    return true
  }
  
  end(): T[] {
    this.active = false
    return this.queue.splice(0)
  }
}
```

**用途**: 在传输层重建期间队列消息，保证顺序

### 2. Epoch 版本控制

```typescript
// 每次 /bridge 调用服务端递增 epoch
// 客户端必须重建传输层以使用新 epoch
// 409 错误码表示 epoch 不匹配
```

### 3. 跨进程回退

```typescript
// 检测死 token，避免重复 401
if (
  cfg.bridgeOauthDeadExpiresAt != null &&
  cfg.bridgeOauthDeadFailCount >= 3 &&
  getClaudeAIOAuthTokens()?.expiresAt === cfg.bridgeOauthDeadExpiresAt
) {
  return null // 跳过
}
```

### 4. CSR 安全

```typescript
// v2 使用 worker JWT（非 OAuth）
// JWT 验证 session_id claim
// 避免 OAuth 令牌泄露到用户配置的 MCP 服务器
```

## 消息类型

### SDKMessage 流向

```
REPL/CLI 内部
    ↓
toSDKMessages() 转换
    ↓
bridge.writeMessages()
    ↓
transport.writeBatch()
    ↓
CCRClient.writeEvent()
    ↓
POST /worker/events
    ↓
claude.ai 服务器
```

### 入站消息处理

```
SSETransport 接收
    ↓
handleIngressMessage()
    ↓
BoundedUUIDSet 去重
    ↓
onInboundMessage() (用户消息)
    或
handleServerControlRequest() (控制请求)
```

## 错误处理

### 错误分类

| 错误类型 | 处理策略 |
|---------|---------|
| 401 JWT 过期 | 刷新 OAuth + 重建传输层 |
| 409 Epoch 不匹配 | 重建传输层 + 轮询恢复 |
| 410 环境过期 | 致命错误 |
| 5xx 服务器错误 | 指数退避重试 |
| 网络超时 | 退避重试 |

### 关闭序列

```typescript
async function teardown(): Promise<void> {
  // 1. 取消刷新门
  flushGate.drop()

  // 2. 发送结果消息
  transport.reportState('idle')
  transport.write(makeResultMessage(sessionId))

  // 3. 归档会话
  await archiveSession(...)

  // 4. 关闭传输
  transport.close()

  // 5. 发送遥测
  logEvent('tengu_bridge_repl_teardown', {...})
}
```

## 安全考虑

1. **Token 隔离**: v2 使用 worker JWT 而非 OAuth
2. **Session 校验**: JWT 验证 session_id claim
3. **环境变量清理**: 子进程不继承桥接 OAuth token
4. **Path traversal 防护**: `safeFilenameId()` 清理会话 ID
5. **权限检查**: `allow_remote_control` 策略

## 性能优化

1. **批量写入**: `SerialBatchEventUploader` 内部批量
2. **序列号续传**: SSE 重连时从断点继续
3. **心跳抖动**: `heartbeatJitterFraction` 防止惊群
4. **容量唤醒**: 会话完成时立即唤醒轮询

## GrowthBook 功能开关

| 开关 | 默认值 | 用途 |
|------|--------|------|
| `tengu_ccr_bridge` | false | 主开关 |
| `tengu_bridge_repl_v2` | false | v2 env-less |
| `tengu_cobalt_harbor` | false | 自动连接 |
| `tengu_ccr_mirror` | false | 镜像模式 |
| `tengu_ccr_bridge_multi_session` | false | 多会话 |
| `tengu_bridge_repl_v2_cse_shim_enabled` | true | CSE 兼容 |

## 总结

Bridge 模块展示了复杂的分布式系统架构：

1. **双协议栈设计** - v1 环境 API vs v2 直接桥接
2. **传输层抽象** - 统一接口支持多种传输实现
3. **Token 管理** - Generation 计数器防止竞态
4. **消息去重** - O(1) 环形缓冲区
5. **优雅关闭** - FlushGate 保证消息顺序
6. **容错恢复** - 指数退避 + 401/409 特定处理
