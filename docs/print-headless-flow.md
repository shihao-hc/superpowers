# Print/Headless 模块深度分析

## 概览

Print/Headless 模块是 Claude Code 的非交互模式核心，负责处理 SDK 协议通信、远程会话管理和 CLI 流式输出。

## 核心文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `cli/structuredIO.ts` | 859 | SDK 协议处理器，NDJSON stdio 通信 |
| `cli/remoteIO.ts` | 255 | 远程传输层，WebSocket/SSE 支持 |
| `cli/print.ts` | 5594 | Headless 模式主入口和消息循环 |
| `transports/*.ts` | ~500 | 多种传输协议实现 |

---

## StructuredIO - SDK 协议处理器

### 核心职责

```typescript
export class StructuredIO {
  readonly structuredInput: AsyncGenerator<StdinMessage | SDKMessage>
  readonly outbound = new Stream<StdoutMessage>()  // 消息输出队列
  
  private pendingRequests = new Map<string, PendingRequest<unknown>>()
  private resolvedToolUseIds = new Set<string>()  // 防重复处理
}
```

### 消息类型

```typescript
// 输入消息 (stdin)
type StdinMessage = 
  | { type: 'user'; message: SDKUserMessage }
  | { type: 'control_request'; request: SDKControlRequest }
  | { type: 'control_response'; response: SDKControlResponse }
  | { type: 'assistant' | 'system' }  // 只读，不处理

// 输出消息 (stdout)
type StdoutMessage = 
  | { type: 'user'; ... }           // 用户消息
  | { type: 'assistant'; ... }      // Assistant消息
  | { type: 'system'; ... }         // 系统事件
  | { type: 'control_request'; ... } // 权限请求
  | { type: 'result'; ... }          // 最终结果
```

### 核心流程

```
1. 读取 stdin (splitAndProcess)
   └─> 逐行解析 NDJSON
   └─> processLine() 处理各类消息

2. 处理 control_request (can_use_tool)
   └─> sendRequest() 发送到 SDK 消费者
   └─> 等待 control_response
   └─> 解析权限决策

3. 处理 control_response
   └─> 检查 request_id 匹配
   └─> 去重检查 (resolvedToolUseIds)
   └─> resolve/reject Promise
```

### 权限请求竞态

```typescript
// Hook vs SDK 消费者竞态
const hookPromise = executePermissionRequestHooksForSDK(...)  // 后台运行
const sdkPromise = this.sendRequest(...)                      // 立即发送

// Promise.race: 谁先返回就用谁
const winner = await Promise.race([hookPromise, sdkPromise])
if (winner.source === 'hook') {
  hookAbortController.abort()  // 取消 SDK 请求
  return winner.decision
}
```

### 防重复处理

```typescript
private readonly resolvedToolUseIds = new Set<string>(MAX: 1000)

// 当 control_response 到达时
if (resolvedToolUseIds.has(toolUseID)) {
  return undefined  // 忽略重复响应
}
resolvedToolUseIds.add(toolUseID)

// LRU 淘汰
if (resolvedToolUseIds.size > MAX_RESOLVED_TOOL_USE_IDS) {
  const first = resolvedToolUseIds.values().next().value
  resolvedToolUseIds.delete(first)
}
```

---

## RemoteIO - 远程传输层

### 继承关系

```typescript
export class RemoteIO extends StructuredIO {
  private transport: Transport        // SSE/WebSocket/HTTP
  private ccrClient: CCRClient       // 会话状态管理
  private keepAliveTimer             // 保活定时器
}
```

### 传输类型

```typescript
// cli/transports/
├── Transport.ts          // 基类接口
├── SSETransport.ts      // Server-Sent Events
├── WebSocketTransport.ts // WebSocket
├── HttpTransport.ts     // HTTP POST
└── transportUtils.ts    // 传输选择逻辑
```

### CCRClient 会话管理

```typescript
// CCR v2 特性
ccrClient = new CCRClient(transport, url)
ccrClient.initialize()  // 初始化

// 注册回调
setInternalEventWriter((event, payload) => 
  ccrClient.writeInternalEvent(event, payload)
)
setInternalEventReader(
  () => ccrClient.readInternalEvents(),      // 主会话事件
  () => ccrClient.readSubagentInternalEvents()  // 子Agent事件
)

// 状态上报
setCommandLifecycleListener((uuid, state) => 
  ccrClient.reportDelivery(uuid, state)
)
setSessionStateChangedListener((state, details) =>
  ccrClient.reportState(state, details)
)
```

### Keep-Alive 保活

```typescript
// 固定间隔发送 keep_alive 帧
// 防止代理和会话层 GC 空闲连接
const keepAliveIntervalMs = getPollIntervalConfig()
  .session_keepalive_interval_v2_ms  // 默认 120s

if (keepAliveIntervalMs > 0) {
  this.keepAliveTimer = setInterval(() => {
    this.write({ type: 'keep_alive' })
  }, keepAliveIntervalMs)
}
```

---

## print.ts - Headless 模式主入口

### 主函数流程

```typescript
export async function runHeadless(inputPrompt, getAppState, ...) {
  // 1. 初始化
  const structuredIO = getStructuredIO(inputPrompt, options)
  
  // 2. 加载初始消息 (支持 resume/continue)
  const { messages, turnInterruptionState } = await loadInitialMessages(...)
  
  // 3. 流式循环
  for await (const message of runHeadlessStreaming(...)) {
    // 输出到 structuredIO
    await structuredIO.write(message)
  }
  
  // 4. 根据 outputFormat 输出结果
  switch (options.outputFormat) {
    case 'json': writeToStdout(jsonStringify(lastMessage))
    case 'stream-json': // 流式输出已处理
    default: writeToStdout(lastMessage.result)  // 纯文本
  }
}
```

### 流式循环核心

```typescript
async function* runHeadlessStreaming(...): AsyncIterable<StdoutMessage> {
  let running = false
  let heldBackResult: StdoutMessage | null = null
  
  // do-while: 排空命令 → 等待Agent → 重复
  do {
    // 1. 排空 SDK 事件
    for (const event of drainSdkEvents()) {
      output.enqueue(event)
    }
    
    // 2. 排空命令队列
    runPhase = 'draining_commands'
    await drainCommandQueue()
    
    // 3. 检查后台任务
    waitingForAgents = 
      getRunningTasks(state).some(isBackgroundTask) ||
      peek(isMainThread) !== undefined
    
    if (waitingForAgents) {
      runPhase = 'waiting_for_agents'
      await waitForAgentCompletion()
    }
    
  } while (waitingForAgents)
}
```

### 命令批处理

```typescript
const drainCommandQueue = async () => {
  while ((command = dequeue(isMainThread))) {
    // 批处理: 合并连续 prompt 命令
    const batch: QueuedCommand[] = [command]
    if (command.mode === 'prompt') {
      while (canBatchWith(command, peek())) {
        batch.push(dequeue()!)
      }
    }
    
    // 合并为单个 ask() 调用
    const mergedInput = joinPromptValues(batch.map(c => c.value))
    
    // 执行 ask()
    for await (const message of ask({ prompt: mergedInput, ... })) {
      output.enqueue(message)
    }
  }
}
```

### 后台任务 Hold-back

```typescript
if (message.type === 'result') {
  // 如果有后台 Agent 运行，延迟发送结果
  if (getRunningTasks(state).some(t => isBackgroundTask(t))) {
    heldBackResult = message  // 暂存
  } else {
    heldBackResult = null
    output.enqueue(message)  // 发送
  }
}
```

### SIGINT 处理

```typescript
const sigintHandler = () => {
  if (abortController && !abortController.signal.aborted) {
    abortController.abort()  // 中止当前查询
  }
  gracefulShutdown(0)  // 优雅关闭
}
process.on('SIGINT', sigintHandler)
```

---

## 关键设计模式

### 1. Stream 队列

```typescript
readonly outbound = new Stream<StdoutMessage>()

// 任何地方都可以 enqueue
output.enqueue({ type: 'system', ... })

// drain loop 统一消费
for (const event of drainSdkEvents()) {
  output.enqueue(event)
}
```

### 2. prependedLines 插队

```typescript
// 在消息流中插入用户消息
prependUserMessage(content: string) {
  this.prependedLines.push(jsonStringify({ type: 'user', ... }))
}

// read() 重新检查
const splitAndProcess = async function* () {
  for (;;) {
    if (this.prependedLines.length > 0) {
      content = this.prependedLines.join('') + content
      this.prependedLines = []
    }
    // 处理消息...
  }
}
```

### 3. abortController 生命周期

```typescript
// 创建
abortController = createAbortController()

// 传递给 ask()
await runWithWorkload(cmd.workload, async () => {
  for await (const message of ask({ abortController, ... })) {
    // 处理消息...
  }
})

// Ctrl+C 中止
process.on('SIGINT', () => abortController.abort())
```

### 4. CCR 事件去重

```typescript
// 内部事件写入
setInternalEventWriter((eventType, payload) => 
  ccrClient.writeInternalEvent(eventType, payload)
)

// 内部事件读取 (恢复会话)
setInternalEventReader(
  () => ccrClient.readInternalEvents(),
  () => ccrClient.readSubagentInternalEvents()
)
```

---

## 输出格式

```typescript
type OutputFormat = 
  | 'text'      // 默认: 纯文本结果
  | 'json'      // JSON 格式
  | 'stream-json' // NDJSON 流式输出 (SDK模式)

// stream-json 消息类型
type SDKStreamMessage =
  | { type: 'user'; message: SDKUserMessage }
  | { type: 'assistant'; message: AssistantMessage }
  | { type: 'system'; subtype: 'status' | 'hook_*' | 'task_*' }
  | { type: 'result'; subtype: 'success' | 'error_*' }
  | { type: 'prompt_suggestion'; suggestion: string }
```

---

## 与其他模块的交互

```
print.ts (Headless)
    │
    ├── StructuredIO ──> stdio/stdin stdout
    │       │
    │       ├── can_use_tool ──> VS Code/SDK 消费者
    │       ├── hook_callback ──> SDK Hook 系统
    │       └── elicitation ──> MCP Elicitation
    │
    ├── RemoteIO ──> WebSocket/SSE/HTTP
    │       │
    │       └── CCRClient ──> claude.ai 会话管理
    │
    ├── ask() ──> QueryEngine ──> API 调用
    │
    └── output.enqueue ──> Stream 队列 ──> structuredIO.write
```

---

## 关键洞察

1. **异步生成器模式**: 整个循环基于 `AsyncIterable`，消息 yield 到外部处理
2. **命令批处理**: 连续 prompt 命令合并为单个 turn，减少 API 调用
3. **Hold-back 机制**: 后台 Agent 运行时暂存 result，直到 Agent 完成
4. **防重复处理**: `resolvedToolUseIds` Set 防止重复 control_response
5. **传输抽象**: StructuredIO (stdio) 和 RemoteIO (远程) 统一接口
6. **权限竞态**: Hook 和 SDK 消费者同时请求权限，先到先得
