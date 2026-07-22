# Analytics 分析系统深度分析

## 概览

Analytics 模块负责事件日志记录、功能开关管理和遥测数据收集。采用多后端架构，支持 Datadog 和内部 1P 事件日志。

## 核心文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `analytics/index.ts` | 173 | 公共 API，事件队列管理 |
| `analytics/sink.ts` | 114 | Sink 实现，事件路由 |
| `analytics/growthbook.ts` | 1155 | 功能开关管理 |
| `analytics/firstPartyEventLogger.ts` | 449 | 1P 事件日志 (OpenTelemetry) |
| `analytics/datadog.ts` | 307 | Datadog 集成 |
| `analytics/metadata.ts` | ~200 | 事件元数据 |
| `analytics/config.ts` | ~100 | 配置管理 |

---

## 架构设计

### 核心概念

```
logEvent(eventName, metadata)
         │
         ▼
    [Event Queue]  ← 初始化前的事件暂存
         │
         ▼
    [Analytics Sink] ← attachAnalyticsSink()
         │
         ├──→ [Datadog]     ← 外部用户
         │
         └──→ [1P Logger]   ← 内部遥测 (OpenTelemetry)
```

### 无循环依赖设计

```typescript
// index.ts 没有任何依赖
// 事件在 sink 附加前入队，之后通过 queueMicrotask 异步刷新
export function logEvent(eventName, metadata) {
  if (sink === null) {
    eventQueue.push({ eventName, metadata, async: false })
    return
  }
  sink.logEvent(eventName, metadata)
}
```

---

## GrowthBook 功能开关系统

### 核心特性

```typescript
// 三层缓存
remoteEvalFeatureValues  // 内存 (最快)
  ↓ fallback
cachedGrowthBookFeatures  // 磁盘 (持久化)
  ↓ fallback
defaultValue  // 默认值
```

### 读取模式

```typescript
// 1. 阻塞模式 - 等待初始化
await getFeatureValue_DEPRECATED('feature', false)

// 2. 非阻塞模式 - 可能过期
getFeatureValue_CACHED_MAY_BE_STALE('feature', false)

// 3. 安全检查 - 等待重初始化
await checkSecurityRestrictionGate('security_gate')

// 4. 快读慢路径 - 缓存true直接返回
await checkGate_CACHED_OR_BLOCKING('feature')
```

### 用户属性

```typescript
type GrowthBookUserAttributes = {
  id: string              // deviceId
  sessionId: string
  deviceID: string
  platform: 'win32' | 'darwin' | 'linux'
  apiBaseUrlHost?: string // 企业代理
  organizationUUID?: string
  accountUUID?: string
  userType?: string
  subscriptionType?: string
  rateLimitTier?: string
  firstTokenTime?: number
  email?: string
  appVersion?: string
  github?: GitHubActionsMetadata
}
```

### 覆盖优先级

```typescript
// 1. 环境变量 (测试用)
CLAUDE_INTERNAL_FC_OVERRIDES='{"feature": true}'

// 2. 用户配置覆盖 (/config Gates)
growthBookOverrides

// 3. 远程评估值 (GrowthBook 服务器)
remoteEvalFeatureValues

// 4. 磁盘缓存
cachedGrowthBookFeatures

// 5. 默认值
```

### 周期性刷新

```typescript
// 普通构建: 6小时
// Ant 构建: 20分钟
const GROWTHBOOK_REFRESH_INTERVAL_MS = 
  USER_TYPE === 'ant' ? 20 * 60 * 1000 : 6 * 60 * 60 * 1000
```

---

## Datadog 集成

### 事件白名单

```typescript
const DATADOG_ALLOWED_EVENTS = new Set([
  'tengu_api_error', 'tengu_api_success',
  'tengu_compact_failed', 'tengu_init',
  'tengu_tool_use_*', 'tengu_oauth_*',
  'tengu_session_file_read', 'tengu_started',
  // ...
])
```

### 基数控制

```typescript
// 1. 工具名称规范化
if (toolName.startsWith('mcp__')) {
  toolName = 'mcp'  // 降低基数
}

// 2. 模型名称简化
const shortName = getCanonicalName(model)
allData.model = MODEL_COSTS[shortName] ? shortName : 'other'

// 3. 版本号截断
version = version.replace(
  /^(\d+\.\d+\.\d+-dev\.\d{8})\.t\d+\.sha[a-f0-9]+$/, '$1'
)
```

### 用户桶

```typescript
// 用于告警而不直接暴露用户 ID
const getUserBucket = memoize(() => {
  const hash = sha256(userId)
  return parseInt(hash.slice(0, 8), 16) % 30
})
```

---

## 1P 事件日志 (OpenTelemetry)

### 架构

```typescript
// 独立于客户 OTLP 的内部日志
const firstPartyEventLoggerProvider = new LoggerProvider({
  resource: { 'service.name': 'claude-code' },
  processors: [
    new BatchLogRecordProcessor(exporter, {
      scheduledDelayMillis: 10000,
      maxExportBatchSize: 200,
      maxQueueSize: 8192,
    })
  ]
})
```

### 事件结构

```typescript
{
  body: eventName,
  attributes: {
    event_id: uuid,
    core_metadata: { /* model, betas */ },
    user_metadata: { /* session, device */ },
    event_metadata: { /* 原始事件数据 */ }
  }
}
```

---

## Proto 字段处理

```typescript
// _PROTO_* 字段只发给 1P 事件日志
// Datadog 收到前会被剥离

export function stripProtoFields(metadata) {
  let result = undefined
  for (const key in metadata) {
    if (key.startsWith('_PROTO_')) {
      if (result === undefined) {
        result = { ...metadata }
      }
      delete result[key]
    }
  }
  return result ?? metadata
}
```

---

## 采样配置

```typescript
// 通过 GrowthBook 动态配置
type EventSamplingConfig = {
  [eventName: string]: {
    sample_rate: number  // 0-1
  }
}

function shouldSampleEvent(eventName) {
  const config = getEventSamplingConfig()
  const eventConfig = config[eventName]
  
  if (!eventConfig) return null  // 100%
  
  if (sampleRate <= 0) return 0    // 丢弃
  if (sampleRate >= 1) return null  // 全量
  return Math.random() < sampleRate ? sampleRate : 0
}
```

---

## Kill Switch

```typescript
// 本地禁用开关
export function isSinkKilled(sink: 'datadog' | 'firstParty'): boolean

// 配置禁用
export function isAnalyticsDisabled(): boolean
```

---

## 实验曝光日志

```typescript
// 特征被访问时记录实验分配
function logExposureForFeature(feature: string) {
  const expData = experimentDataByFeature.get(feature)
  if (expData) {
    logGrowthBookExperimentTo1P({
      experimentId: expData.experimentId,
      variationId: expData.variationId,
      userAttributes: getUserAttributes(),
    })
  }
}
```

---

## 关键设计模式

### 1. Sink 队列

```typescript
// 初始化前的事件暂存
const eventQueue: QueuedEvent[] = []
if (sink === null) {
  eventQueue.push({ eventName, metadata, async: false })
  return
}
sink.logEvent(eventName, metadata)
```

### 2. Memory-Disk 双缓存

```typescript
// Memory: processRemoteEvalPayload()
remoteEvalFeatureValues.clear()
for (const [key, feature] of Object.entries(transformedFeatures)) {
  const v = 'value' in feature ? feature.value : feature.defaultValue
  remoteEvalFeatureValues.set(key, v)
}

// Disk: syncRemoteEvalToDisk()
const fresh = Object.fromEntries(remoteEvalFeatureValues)
saveGlobalConfig(c => ({
  ...c,
  cachedGrowthBookFeatures: fresh
}))
```

### 3. Auth 变化重初始化

```typescript
// GrowthBook 客户端创建后无法更新 auth headers
// 必须销毁重建
export function refreshGrowthBookAfterAuthChange() {
  resetGrowthBook()
  reinitializingPromise = initializeGrowthBook()
    .catch(error => logError(error))
    .finally(() => { reinitializingPromise = null })
}
```

### 4. 1P 事件日志重建

```typescript
// 配置变化时重建
async function reinitialize1PEventLoggingIfConfigChanged() {
  const oldProvider = firstPartyEventLoggerProvider
  firstPartyEventLogger = null  // 先置空，防止并发问题
  
  await oldProvider.forceFlush()  // 刷新缓冲区
  // ... 初始化新 provider
}
```

---

## 与其他模块的交互

```
Analytics
    │
    ├── index.ts ──> 公共 API
    │
    ├── sink.ts ──> Datadog + 1P 路由
    │
    ├── growthbook.ts ──> 功能开关
    │       │
    │       └── config.ts ──> 本地配置
    │
    ├── datadog.ts ──> 外部遥测
    │
    └── firstPartyEventLogger.ts ──> OpenTelemetry
            │
            └── metadata.ts ──> 事件元数据
```

---

## 关键洞察

1. **无循环依赖**: index.ts 完全独立，事件暂存直到 sink 附加
2. **多层缓存**: Memory → Disk → Default，平衡性能和可靠性
3. **基数控制**: Datadog 通过规范化名称降低基数
4. **隐私保护**: 用户 ID 哈希到桶，不直接暴露
5. **实验追踪**: 访问时记录曝光，确保数据完整性
6. **Auth 变化处理**: GrowthBook 客户端不可更新 auth，必须重建
7. **Proto 字段隔离**: 敏感字段只发 1P 内部日志
8. **采样控制**: 通过 GrowthBook 动态配置事件采样率
