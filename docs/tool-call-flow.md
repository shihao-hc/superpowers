# Claude Code 工具调用完整流程

## 流程概览

```
用户输入 (例如: "读取 package.json")
    ↓
模型推理生成 tool_use 块
    ↓
runTools() [toolOrchestration.ts:19]
    ↓
partitionToolCalls() - 按并发安全分组
    ↓
┌─────────────────────────────────────┐
│ 并发安全工具 (Read, Glob, Grep...)  │ → runToolsConcurrently() [并行]
│ 非并发安全工具 (Bash, Write...)     │ → runToolsSerially() [串行]
└─────────────────────────────────────┘
    ↓
runToolUse() [toolExecution.ts:337]
    ↓
findToolByName() - 查找工具定义
    ↓
┌─────────────────────────────────────┐
│ 找不到工具?                         │
│ → 返回 "No such tool available" 错误│
└─────────────────────────────────────┘
    ↓
检查中止信号 [toolExecution.ts:415]
    ↓
streamedCheckPermissionsAndCallTool() [toolExecution.ts:492]
    ↓
checkPermissionsAndCallTool() [toolExecution.ts:599]
    │
    ├─→ 1. Zod 输入验证 [toolExecution.ts:615]
    │       inputSchema.safeParse(input)
    │
    ├─→ 2. 工具自定义验证 [toolExecution.ts:683]
    │       tool.validateInput?.()
    │
    ├─→ 3. PreToolUse Hooks [toolExecution.ts:800]
    │       runPreToolUseHooks()
    │
    ├─→ 4. 权限决策 [toolExecution.ts:921]
    │       resolveHookPermissionDecision()
    │       ├── allow → 继续执行
    │       ├── deny → 返回拒绝消息
    │       └── ask → 显示权限对话框
    │
    └─→ 5. 工具执行 [toolExecution.ts:1207]
            tool.call()
            │
            ├─→ 进度报告 (onProgress)
            │
            ├─→ 结果处理
            │       mapToolResultToToolResultBlockParam()
            │
            └─→ PostToolUse Hooks
```

## 关键文件索引

| 文件 | 职责 | 关键函数 |
|------|------|----------|
| `tools.ts` | 工具注册 | `getAllBaseTools()`, `getTools()`, `assembleToolPool()` |
| `toolOrchestration.ts` | 执行编排 | `runTools()`, `partitionToolCalls()`, `runToolsConcurrently()`, `runToolsSerially()` |
| `toolExecution.ts` | 执行引擎 | `runToolUse()`, `checkPermissionsAndCallTool()`, `streamedCheckPermissionsAndCallTool()` |
| `Tool.ts` | 工具接口 | `buildTool()`, `Tool` 接口定义 |
| `BashTool.tsx` | Bash工具 | `BashTool.call()`, `bashToolHasPermission()` |

## 权限检查流程 (详细)

```
权限检查入口
    ↓
resolveHookPermissionDecision() [toolExecution.ts:921]
    ↓
┌─────────────────────────────────────────┐
│ 1. hookPermissionResult?               │
│    → 使用 hook 结果                   │
├─────────────────────────────────────────┤
│ 2. canUseTool() 权限模式检查           │
│    ├── default: ask                  │
│    ├── dontAsk: deny                │
│    ├── bypassPermissions: allow     │
│    ├── auto: 分类器自动决策        │
│    └── plan: deny                 │
├─────────────────────────────────────────┤
│ 3. 工具 checkPermissions()             │
│    ├── BashTool: bashToolHasPermission() │
│    └── FileEditTool: checkReadOnlyConstraints() │
├─────────────────────────────────────────┤
│ 4. 规则匹配                           │
│    ├── alwaysAllowRules ✓ → allow   │
│    ├── alwaysDenyRules ✓ → deny    │
│    └── 其他 → ask (显示对话框)      │
└─────────────────────────────────────────┘
```

## BashTool 详细流程

```
BashTool.call() [BashTool.tsx:624]
    │
    ├─→ _simulatedSedEdit? → applySedEdit() 直接写入
    │
    ├─→ runShellCommand() 异步生成器
    │       │
    │       ├─→ 沙箱检查
    │       ├─→ 超时处理
    │       ├─→ 输出累积
    │       └─→ 进度报告
    │
    ├─→ trackGitOperations() Git操作追踪
    │
    ├─→ interpretCommandResult() 语义解释
    │
    ├─→ 大输出持久化 (>30K chars → 磁盘)
    │
    └─→ mapToolResultToToolResultBlockParam()
            │
            ├─→ 图像处理
            ├─→ 错误格式化
            └─→ 背景任务信息
```

## 关键设计模式

### 1. 异步生成器模式
```typescript
// runToolUse 返回异步生成器，逐个产出消息更新
async function* runToolUse(toolUse, ...) {
  yield { message: progressMessage }
  yield { message: resultMessage }
}
```

### 2. 并发安全分组
```typescript
// partitionToolCalls 根据 isConcurrencySafe 分组
// 并发安全的工具可以并行执行
// 非并发安全的工具必须串行执行
```

### 3. 防御性编程
```typescript
// 过滤内部字段
if ('_simulatedSedEdit' in processedInput) {
  delete processedInput._simulatedSedEdit
}

// 输入克隆避免污染
const backfilledClone = { ...processedInput }
tool.backfillObservableInput?.(backfilledClone)
```

### 4. 失败关闭默认值
```typescript
// buildTool 提供的默认值
isConcurrencySafe: () => false,  // 默认不安全
isReadOnly: () => false,         // 默认会写入
checkPermissions: () => allow     // 默认允许
```

## 遥测集成

| 事件 | 时机 |
|------|------|
| `tengu_tool_use_start` | 工具开始执行 |
| `tengu_tool_use_progress` | 进度更新 |
| `tengu_tool_use_success` | 工具成功 |
| `tengu_tool_use_error` | 工具失败 |
| `tengu_tool_use_cancelled` | 工具取消 |
| `tengu_tool_use_can_use_tool_allowed` | 权限允许 |
| `tengu_tool_use_can_use_tool_rejected` | 权限拒绝 |

## 性能考虑

1. **并发执行**: 最多 10 个并发安全工具同时执行
2. **串行执行**: 非并发安全工具必须等待前一个完成
3. **大输出持久化**: 超过 30K chars 的结果写入磁盘
4. **进度报告阈值**: BashTool 2 秒后开始显示进度

---

## 深入理解：输入回填机制 (Input Backfill)

### 问题背景
- 工具结果需要嵌入模型输入的路径（如 "File created at: {path}"）
- 工具内部可能会对路径进行 expandPath 等转换
- 这个转换不应该影响最终结果的路径显示

### 解决方案：Backfilled Clone
```typescript
// 克隆输入对象
const backfilledClone = { ...processedInput }
// 工具内部可以修改克隆对象
tool.backfillObservableInput?.(backfilledClone)
// 结果中使用原始的 callInput 而非转换后的
```

### _simulatedSedEdit 安全过滤
```typescript
// 防御性编程：过滤内部字段
if ('_simulatedSedEdit' in processedInput) {
  // _simulatedSedEdit 是权限系统注入的内部字段
  // 如果模型直接提供，则删除以防止注入攻击
  const { _simulatedSedEdit: _, ...rest } = processedInput
  processedInput = rest
}
```

---

## 深入理解：上下文修改器模式 (Context Modifier)

### 用途
工具执行后可能需要更新 ToolUseContext（如添加新工具、更新状态）

### 实现方式
```typescript
// 返回值包含 contextModifier
{
  message: userMessage,
  contextModifier: {
    toolUseID: "xxx",
    modifyContext: (context) => ({ ...context, newState: true })
  }
}
```

### 批处理上下文修改
```typescript
// 并发执行时，收集所有修改器
const queuedContextModifiers: Record<string, ((context) => context)[]> = {}

// 执行完成后，按 toolUseID 顺序应用
for (const block of blocks) {
  const modifiers = queuedContextModifiers[block.id]
  for (const modifier of modifiers) {
    currentContext = modifier(currentContext)
  }
}
```

---

## 深入理解：流式进度报告

### Stream 类封装
```typescript
// 创建流
const stream = new Stream<MessageUpdateLazy>()

// 生产者：异步执行工具，产出结果
checkPermissionsAndCallTool(...).then(results => {
  for (const result of results) {
    stream.enqueue(result)  // 产出消息
  }
}).catch(error => {
  stream.error(error)  // 产出错误
}).finally(() => {
  stream.done()  // 关闭流
})

return stream  // 返回流供消费者使用
```

### 进度事件 vs 最终结果
- **ProgressMessage**: 工具执行过程中的进度更新
- **最终消息**: 工具执行完成后的结果

---

## 深入理解：MCP 工具特殊处理

### MCP Auth 错误处理
```typescript
// MCP 服务器需要重新授权时
if (error instanceof McpAuthError) {
  toolUseContext.setAppState(prevState => {
    // 更新客户端状态为 'needs-auth'
    // UI 会显示该服务器需要重新授权
    return { ...prevState, mcp: { ... } }
  })
}
```

### MCP 工具结果处理差异
```typescript
// MCP 工具结果通过 updatedMCPToolOutput hook 更新
if ('updatedMCPToolOutput' in hookResult) {
  if (isMcpTool(tool)) {
    toolOutput = hookResult.updatedMCPToolOutput
  }
}
```

---

## 深入理解：遥测与可观测性

### 工具参数日志（可选）
```typescript
// OTEL_LOG_TOOL_DETAILS 环境变量控制
if (isToolDetailsLoggingEnabled()) {
  toolParameters = {
    bash_command: commandParts[0],
    full_command: bashInput.command,
    dangerouslyDisableSandbox: bashInput.dangerouslyDisableSandbox,
  }
}
```

### 工具内容事件
```typescript
// 记录 Read/Edit/Write 工具的具体内容
if (tool.name === FILE_READ_TOOL_NAME && 'content' in result.data) {
  contentAttributes.file_path = String(processedInput.file_path)
  contentAttributes.content = String(result.data.content)
}
```

### 错误分类（抗混淆）
```typescript
// 压缩/混淆构建会丢失 error.constructor.name
// 使用 errno code 和 telemetryMessage 替代
if (error instanceof TelemetrySafeError) {
  return error.telemetryMessage.slice(0, 200)
}
const errnoCode = getErrnoCode(error)
if (typeof errnoCode === 'string') {
  return `Error:${errnoCode}`  // ENOENT, EACCES, etc.
}
```

---

## 深入理解：PreToolUse Hook 执行流程

### 顺序执行与并发
```typescript
const preToolHookStart = Date.now()
for await (const hookResult of runPreToolUseHooks(...)) {
  // 按注册顺序逐个执行
  // 可以 yield 多个消息
  // 可以修改 processedInput
}

if (preToolHookDurationMs >= SLOW_PHASE_LOG_THRESHOLD_MS) {
  logForDebugging(`Slow PreToolUse hooks: ${preToolHookDurationMs}ms`)
}
```

### Hook 返回值类型
- **message**: 插入到对话的消息
- **updatedInput**: 修改后的输入
- **contextModifier**: 修改上下文
- **shouldContinue**: 是否继续执行

---

## 深入理解：Structured Output 工具结果

### 工具返回结构化数据
```typescript
// 工具返回 result.structured_output 时
if (typeof result === 'object' && 'structured_output' in result) {
  resultingMessages.push({
    message: createAttachmentMessage({
      type: 'structured_output',
      data: result.structured_output,
    }),
  })
}
```

---

## 核心设计原则总结

1. **防御性编程**: 过滤内部字段、克隆输入、失败关闭默认值
2. **渐进式复杂度**: 并发安全工具并行执行，非并发安全工具串行执行
3. **流式处理**: 异步生成器支持进度报告和实时结果
4. **Hook 扩展点**: PreToolUse、PostToolUse 允许外部拦截和修改
5. **权限分层**: 规则匹配 → 分类器 → 用户确认
6. **可观测性**: 全链路遥测事件、OTEL 日志、错误分类
