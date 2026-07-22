# Services 核心模块深度分析

## 概述

本目录覆盖 Claude Code 的核心服务模块，包括 VCR 录制回放、语音输入、LSP 集成、团队内存同步、成本追踪、自动记忆提取、提示系统和远程托管设置等。

---

## 1. VCR (录制/回放)

### 1.1 核心功能
**文件**: `services/vcr.ts` (406行)

```typescript
export async function withVCR(
  messages: Message[],
  f: () => Promise<...[]>,
): Promise<...[]>
```

### 1.2 关键设计

| 设计 | 说明 |
|------|------|
| Fixture 管理 | 基于 SHA1 哈希的测试固件缓存 |
| 脱水/水合 | 规范化路径 ([CWD], [CONFIG_HOME]) |
| 跨平台兼容 | Windows 双反斜杠处理 |
| 成本追踪 | 录制回放时累加 API 成本 |

### 1.3 核心流程

```typescript
// 录制模式: 调用 f() → 写入 fixture
// 回放模式: 读取 fixture → 返回缓存结果
const filename = `fixtures/${hash}.json`
if (cached) return cached.output  // 回放
else {
  const result = await f()
  await writeFile(filename, result)  // 录制
  return result
}
```

### 1.4 脱水模式

```typescript
function dehydrateValue(s: string): string {
  return s
    .replace(/num_files="\d+"/g, 'num_files="[NUM]"')
    .replace(/duration_ms="\d+"/g, 'duration_ms="[DURATION]"')
    .replaceAll(configHome, '[CONFIG_HOME]')
    .replaceAll(cwd, '[CWD]')
}
```

---

## 2. Voice (语音输入)

### 2.1 核心功能
**文件**: `services/voice.ts` (525行)

音频录制，支持多种后端：
- **Native**: cpal (CoreAudio/AudioUnit)
- **Linux Fallback**: arecord (ALSA), SoX

### 2.2 关键设计

| 特性 | 说明 |
|------|------|
| 延迟加载 | 避免启动冻结 (~1s warm, ~8s cold) |
| 静默检测 | 2秒无活动自动停止 |
| 采样率 | 16kHz, 16-bit, mono |
| WSL 支持 | 通过 PulseAudio RDP pipes |

### 2.3 权限探测

```typescript
// 完整录制探测，信任结果而非 TCC API
export async function requestMicrophonePermission(): Promise<boolean> {
  const started = await startRecording(
    _chunk => {},  // 丢弃数据
    () => {},
    { silenceDetection: false },
  )
  if (started) { stopRecording(); return true }
  return false
}
```

### 2.4 多后端优先级

```
1. Native (cpal) - macOS/Linux/Windows
2. arecord (ALSA) - Linux with audio device
3. SoX rec - Linux fallback
```

---

## 3. LSP (语言服务器协议)

### 3.1 核心功能
**文件**: `services/lsp/manager.ts` (289行)

LSP 服务器管理，支持诊断、悬停、跳转定义等。

### 3.2 单例模式

```typescript
let lspManagerInstance: LSPServerManager | undefined
let initializationState: InitializationState = 'not-started' | 'pending' | 'success' | 'failed'

export function getLspServerManager(): LSPServerManager | undefined {
  if (initializationState === 'failed') return undefined
  return lspManagerInstance
}
```

### 3.3 Generation 计数器

```typescript
// 防止过时初始化 promise 更新状态
let initializationGeneration = 0
initializationPromise = lspManagerInstance.initialize()
  .then(() => {
    if (currentGeneration === initializationGeneration) {
      initializationState = 'success'
    }
  })
```

### 3.4 重初始化

```typescript
// 插件刷新后重新初始化
export function reinitializeLspServerManager(): void {
  // 关闭旧实例
  void lspManagerInstance?.shutdown()
  // 重置状态
  lspManagerInstance = undefined
  initializationState = 'not-started'
  // 重新初始化
  initializeLspServerManager()
}
```

---

## 4. Team Memory Sync (团队内存同步)

### 4.1 核心功能
**文件**: `services/teamMemorySync/index.ts` (1256行)

团队内存文件在本地和服务器之间同步。

### 4.2 API 契约

```
GET  /api/claude_code/team_memory?repo={owner/repo}  → 完整数据
GET  /api/claude_code/team_memory?repo={owner/repo}&view=hashes → 仅哈希
PUT  /api/claude_code/team_memory?repo={owner/repo}  → 上传条目
```

### 4.3 同步语义

| 操作 | 语义 |
|------|------|
| Pull | 服务器覆盖本地 (server wins per-key) |
| Push | Delta 上传 (仅哈希不同的键) |
| 删除 | 不传播，Pull 会恢复 |

### 4.4 冲突解决

```typescript
// 412 冲突时探测服务器哈希
const probe = await fetchTeamMemoryHashes(state, repoSlug)
if (probe.success) {
  // 刷新 serverChecksums，重试 delta
  for (const [key, hash] of Object.entries(probe.entryChecksums)) {
    state.serverChecksums.set(key, hash)
  }
}
```

### 4.5 安全扫描

```typescript
// PSR M22174: 上传前扫描凭证
const secretMatches = scanForSecrets(content)
if (secretMatches.length > 0) {
  skippedSecrets.push({ path: relPath, ruleId, label })
  return // 跳过此文件
}
```

### 4.6 批处理

```typescript
// 按字节大小分批上传
export function batchDeltaByBytes(delta: Record<string, string>): Array<Record<string, string>> {
  const MAX_PUT_BODY_BYTES = 200_000
  // 贪心装箱 + 排序确保确定性
}
```

---

## 5. Cost Tracker (成本追踪)

### 5.1 核心功能
**文件**: `cost-tracker.ts` (323行)

API 调用成本和用量追踪。

### 5.2 关键指标

```typescript
interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
}
```

### 5.3 会话恢复

```typescript
export function restoreCostStateForSession(sessionId: string): boolean {
  const data = getStoredSessionCosts(sessionId)
  if (!data) return false
  setCostStateForRestore(data)
  return true
}
```

### 5.4 模型成本计算

```typescript
function addToTotalModelUsage(cost: number, usage: Usage, model: string): ModelUsage {
  const modelUsage = getUsageForModel(model) ?? { ...zero }
  modelUsage.inputTokens += usage.input_tokens
  modelUsage.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0
  // ...
  return modelUsage
}
```

---

## 6. Extract Memories (记忆提取)

### 6.1 核心功能
**文件**: `services/extractMemories/extractMemories.ts` (615行)

从会话中提取持久记忆，写入 auto-memory 目录。

### 6.2 Forked Agent 模式

```typescript
// 使用 Forked Agent 共享父 prompt cache
const result = await runForkedAgent({
  promptMessages: [createUserMessage({ content: userPrompt })],
  cacheSafeParams,
  canUseTool,
  querySource: 'extract_memories',
  maxTurns: 5,  // 硬限制防止验证陷阱
})
```

### 6.3 工具权限

```typescript
export function createAutoMemCanUseTool(memoryDir: string): CanUseToolFn {
  return async (tool, input) => {
    if (tool.name === FILE_READ_TOOL_NAME) return allow
    if (tool.name === BASH_TOOL_NAME && tool.isReadOnly(input)) return allow
    if (tool.name === FILE_EDIT_TOOL_NAME && isAutoMemPath(filePath)) return allow
    return deny
  }
}
```

### 6.4 互斥机制

```typescript
// 主 agent 已写记忆时跳过 forked agent
if (hasMemoryWritesSince(messages, lastMemoryMessageUuid)) {
  logEvent('tengu_extract_memories_skipped_direct_write', ...)
  return
}
```

---

## 7. Tips System (提示系统)

### 7.1 核心功能
**文件**: `services/tips/ipScheduler.ts` (58行)

根据会话历史调度用户提示。

### 7.2 选择算法

```typescript
export function selectTipWithLongestTimeSinceShown(availableTips: Tip[]): Tip | undefined {
  const tipsWithSessions = availableTips.map(tip => ({
    tip,
    sessions: getSessionsSinceLastShown(tip.id),
  }))
  tipsWithSessions.sort((a, b) => b.sessions - a.sessions)
  return tipsWithSessions[0]?.tip  // 最久未显示的
}
```

---

## 8. Remote Managed Settings (远程托管设置)

### 8.1 核心功能
**文件**: `services/remoteManagedSettings/index.ts` (638行)

企业客户的远程托管设置管理。

### 8.2 资格检查

```typescript
// API 用户: 全部有资格
// OAuth 用户: 仅 Enterprise/C4E/Team 订阅者
export function isRemoteManagedSettingsEligible(): boolean {
  // 检查订阅类型和 API 来源
}
```

### 8.3 Checksum 验证

```typescript
// HTTP ETag 缓存验证
export function computeChecksumFromSettings(settings: SettingsJson): string {
  const sorted = sortKeysDeep(settings)
  const normalized = jsonStringify(sorted)  // 无空格
  return `sha256:${createHash('sha256').update(normalized).digest('hex')}`
}
```

### 8.4 后台轮询

```typescript
// 1小时轮询间隔
const POLLING_INTERVAL_MS = 60 * 60 * 1000
pollingIntervalId = setInterval(() => {
  void pollRemoteSettings()
}, POLLING_INTERVAL_MS)
```

---

## 9. Rate Limit Messages (速率限制消息)

### 9.1 核心功能
**文件**: `services/rateLimitMessages.ts` (344行)

集中管理所有速率限制相关消息。

### 9.2 限制类型

| 类型 | 说明 |
|------|------|
| seven_day | 周限额 |
| five_hour | 会话限额 |
| seven_day_opus | Opus 周限额 |
| seven_day_sonnet | Sonnet 周限额 |
| overage | 超额使用 |

### 9.3 消息优先级

```
ERROR: limits.status === 'rejected'
WARNING: limits.status === 'allowed_warning' && utilization >= 70%
```

---

## 10. Auto Dream (自动梦境)

### 10.1 核心功能
**文件**: `services/autoDream/autoDream.ts` (324行)

基于时间/会话触发的后台记忆整合。

### 10.2 门控顺序

```
1. Time: hours >= minHours (默认24h)
2. Sessions: sessions >= minSessions (默认5)
3. Lock: 防止并发整合
```

### 10.3 扫描节流

```typescript
// 时间门通过但会话门不通过时，限制扫描频率
const SESSION_SCAN_INTERVAL_MS = 10 * 60 * 1000  // 10分钟
if (sinceScanMs < SESSION_SCAN_INTERVAL_MS) return
```

### 10.4 进度观察

```typescript
function makeDreamProgressWatcher(taskId, setAppState) {
  return msg => {
    // 提取文本块用于显示
    // 收集 Edit/Write 路径用于完成消息
    addDreamTurn(taskId, { text, toolUseCount }, touchedPaths, setAppState)
  }
}
```

---

## 11. Forked Agent (分叉代理)

### 11.1 核心功能
**文件**: `utils/forkedAgent.ts` (689行)

运行分叉代理查询循环，共享父 prompt cache。

### 11.2 Cache Safe Params

```typescript
export type CacheSafeParams = {
  systemPrompt: SystemPrompt        // 必须匹配父请求
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  toolUseContext: ToolUseContext
  forkContextMessages: Message[]
}
```

### 11.3 状态隔离

```typescript
// 克隆文件状态缓存防止干扰
cloneFileStateCache(context.toolUseContext)

// 克隆内容替换状态
cloneContentReplacementState(context)
```

### 11.4 使用追踪

```typescript
// 累积所有 API 调用的使用量
accumulateUsage(result.totalUsage, usage)

// 日志事件
logEvent('tengu_fork_agent_query', {
  forkLabel,
  inputTokens: result.totalUsage.input_tokens,
  cacheHitPct: calculateCacheHitPct(result.totalUsage),
})
```

---

## 理解程度总结

| 模块 | 文件数 | 核心概念 | 理解 |
|------|--------|----------|------|
| VCR | 1 | Fixture, 脱水/水合 | 90% |
| Voice | 1 | 多后端, 延迟加载 | 85% |
| LSP | 1 | 单例, Generation 计数器 | 85% |
| Team Memory | 4 | Delta 上传, 冲突解决 | 90% |
| Cost Tracker | 1 | 会话恢复, 模型成本 | 85% |
| Extract Memories | 2 | Forked Agent, 工具权限 | 90% |
| Tips | 2 | 调度算法 | 80% |
| Remote Settings | 3 | Checksum, 后台轮询 | 85% |
| Rate Limit | 1 | 多类型消息 | 85% |
| Auto Dream | 4 | 门控顺序, 扫描节流 | 90% |
| Forked Agent | 1 | Cache Safe, 状态隔离 | 95% |
