# Hooks 模块深度分析

## 概述

Hooks 是用户定义的脚本，在 Claude Code 生命周期的各个时间点执行。支持多种类型：命令、提示、Agent、HTTP 回调。

## Hook 事件类型

```typescript
// coreTypes.ts:25-53
export const HOOK_EVENTS = [
  'PreToolUse',           // 工具执行前
  'PostToolUse',          // 工具执行后
  'PostToolUseFailure',   // 工具执行失败后
  'Notification',         // 通知
  'UserPromptSubmit',     // 用户提交提示前
  'SessionStart',         // 会话开始
  'SessionEnd',           // 会话结束
  'Stop',                 // 停止前
  'StopFailure',          // 停止失败
  'SubagentStart',        // 子 Agent 启动
  'SubagentStop',         // 子 Agent 停止
  'PreCompact',           // Compact 前
  'PostCompact',          // Compact 后
  'PermissionRequest',    // 权限请求
  'PermissionDenied',     // 权限被拒绝
  'Setup',               // 设置
  'TeammateIdle',        // 队友空闲
  'TaskCreated',         // 任务创建
  'TaskCompleted',       // 任务完成
  'Elicitation',        // URL 采集
  'ElicitationResult',  // URL 采集结果
  'ConfigChange',       // 配置变更
  'WorktreeCreate',    // Worktree 创建
  'WorktreeRemove',    // Worktree 删除
  'InstructionsLoaded', // 指令加载
  'CwdChanged',        // 工作目录变更
  'FileChanged',       // 文件变更
]
```

## Hook 类型

### 1. Command Hook

```typescript
// hooks.ts:747-1335
type CommandHook = {
  type: 'command'
  command: string
  shell?: 'bash' | 'powershell'
  timeout?: number
  async?: boolean
  asyncRewake?: boolean
  if?: string  // 条件执行，如 "Bash(git *)"
}
```

### 2. HTTP Hook

```typescript
type HttpHook = {
  type: 'http'
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeout?: number
  if?: string
}
```

### 3. Callback Hook

```typescript
// hooks.ts:211-226
type HookCallback = {
  type: 'callback'
  callback: (input, toolUseID, abort, hookIndex, context?) => Promise<HookJSONOutput>
  timeout?: number
  internal?: boolean
}
```

### 4. Function Hook

```typescript
type FunctionHook = {
  type: 'function'
  fn: (input, toolUseID, abort) => Promise<HookJSONOutput>
  timeout?: number
}
```

## 核心架构

### 1. Hook 配置加载

```typescript
// hooks.ts:1492-1566
function getHooksConfig(appState, sessionId, hookEvent) {
  // 1. 从快照加载配置
  const hooks = [...getHooksConfigFromSnapshot()?.[hookEvent] ?? []]

  // 2. 添加注册钩子 (SDK callbacks + plugin hooks)
  const registeredHooks = getRegisteredHooks()?.[hookEvent]
  if (registeredHooks) {
    hooks.push(...registeredHooks)
  }

  // 3. 合并会话钩子 (session hooks + function hooks)
  const sessionHooks = getSessionHooks(appState, sessionId, hookEvent)
  hooks.push(...sessionHooks)

  return hooks
}
```

### 2. Hook 匹配

```typescript
// hooks.ts:1603-1874
export async function getMatchingHooks(
  appState, sessionId, hookEvent, hookInput, tools?
): Promise<MatchedHook[]> {
  // 1. 获取所有 Hook 配置
  const hookMatchers = getHooksConfig(appState, sessionId, hookEvent)

  // 2. Pattern 匹配
  const matchQuery = getMatchQuery(hookInput)  // 如工具名、源等
  const filteredMatchers = hookMatchers.filter(m =>
    !m.matcher || matchesPattern(matchQuery, m.matcher)
  )

  // 3. 去重 (按 pluginRoot 命名空间)
  const uniqueHooks = deduplicate(filteredMatchers)

  // 4. 条件过滤 (if conditions)
  const ifMatcher = prepareIfConditionMatcher(hookInput, tools)
  return uniqueHooks.filter(h => {
    if (!h.hook.if) return true
    return ifMatcher?.(h.hook.if)
  })
}

// Pattern 匹配逻辑
function matchesPattern(matchQuery: string, matcher: string): boolean {
  if (!matcher || matcher === '*') return true
  
  // 简单字符串或管道分隔
  if (/^[a-zA-Z0-9_|]+$/.test(matcher)) {
    if (matcher.includes('|')) {
      return matcher.split('|').includes(matchQuery)
    }
    return matchQuery === matcher
  }
  
  // 正则表达式
  return new RegExp(matcher).test(matchQuery)
}
```

### 3. Hook 执行 (execCommandHook)

```typescript
// hooks.ts:747-1335
async function execCommandHook(hook, hookEvent, hookName, jsonInput, signal, hookId) {
  // 1. Shell 选择 (bash 或 powershell)
  const shellType = hook.shell ?? DEFAULT_HOOK_SHELL
  const isPowerShell = shellType === 'powershell'

  // 2. Windows POSIX 路径转换
  const toHookPath = isWindows && !isPowerShell
    ? windowsPathToPosixPath
    : (p) => p

  // 3. 环境变量构建
  const envVars = {
    ...subprocessEnv(),
    CLAUDE_PROJECT_DIR: toHookPath(projectDir),
    CLAUDE_PLUGIN_ROOT: pluginRoot ? toHookPath(pluginRoot) : undefined,
    CLAUDE_ENV_FILE: await getHookEnvFilePath(hookEvent, hookIndex),
  }

  // 4. Spawn 进程
  if (isPowerShell) {
    child = spawn(pwshPath, buildPowerShellArgs(command), {...})
  } else {
    child = spawn(command, [], { shell: isWindows ? gitBashPath : true, ... })
  }

  // 5. 异步 Hook 检测
  if (hook.async || hook.asyncRewake || stdout.startsWith('{"async":true')) {
    return executeInBackground({ processId, hookId, shellCommand, ... })
  }

  // 6. 同步等待结果
  return await Promise.race([childClosePromise, stdinWritePromise, childErrorPromise])
}
```

### 4. 异步 Hook 执行

```typescript
// hooks.ts:184-265
function executeInBackground({ processId, hookId, shellCommand, asyncResponse, ... }) {
  // 注册到 AsyncHookRegistry
  registerPendingAsyncHook({
    processId, hookId, asyncResponse, hookEvent, hookName, command, shellCommand, pluginId
  })

  // asyncRewake: 退出码 2 时发送 task-notification
  shellCommand.result.then(async result => {
    emitHookResponse({ hookId, hookName, output: stdout + stderr, exitCode: result.code })
    if (result.code === 2) {
      enqueuePendingNotification({
        value: wrapInSystemReminder(`Stop hook blocking error: ${stderr || stdout}`),
        mode: 'task-notification'
      })
    }
  })

  return true
}
```

### 5. Hook 输出处理

```typescript
// hooks.ts:489-737
function processHookJSONOutput({ json, command, hookName, toolUseID, hookEvent, ... }) {
  // 通用字段处理
  if (json.continue === false) result.preventContinuation = true
  if (json.decision === 'block') result.blockingError = { blockingError: json.reason, command }
  if (json.systemMessage) result.systemMessage = json.systemMessage

  // Hook 特定输出
  switch (json.hookSpecificOutput?.hookEventName) {
    case 'PreToolUse':
      // permissionDecision: 'allow' | 'deny' | 'ask'
      // updatedInput: 修改后的工具输入
      result.updatedInput = json.hookSpecificOutput.updatedInput
      break
    case 'UserPromptSubmit':
      result.additionalContext = json.hookSpecificOutput.additionalContext
      break
    case 'SessionStart':
      result.initialUserMessage = json.hookSpecificOutput.initialUserMessage
      result.watchPaths = json.hookSpecificOutput.watchPaths
      break
    case 'PostToolUse':
      result.additionalContext = json.hookSpecificOutput.additionalContext
      result.updatedMCPToolOutput = json.hookSpecificOutput.updatedMCPToolOutput
      break
    case 'PermissionDenied':
      result.retry = json.hookSpecificOutput.retry
      break
  }

  return result
}
```

## Hook 输出 Schema

```typescript
// hooks.ts:50-166
{
  continue?: boolean,                    // 是否继续
  suppressOutput?: boolean,              // 隐藏 stdout
  stopReason?: string,                  // 停止原因
  decision?: 'approve' | 'block',       // 权限决策
  reason?: string,                       // 决策原因
  systemMessage?: string,                // 系统消息
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse' | 'UserPromptSubmit' | 'SessionStart' | ...,
    permissionDecision?: 'allow' | 'deny' | 'ask',
    updatedInput?: Record<string, unknown>,    // 修改工具输入
    additionalContext?: string,          // 附加上下文
    updatedMCPToolOutput?: unknown,      // 修改 MCP 输出
    watchPaths?: string[],               // 监控路径
    initialUserMessage?: string,          // 初始消息
    retry?: boolean,                     // 重试标志
  }
}
```

## 安全机制

### 1. 工作区信任检查

```typescript
// hooks.ts:286-296
export function shouldSkipHookDueToTrust(): boolean {
  // 非交互模式 (SDK) 不需要信任
  if (!getIsNonInteractiveSession()) return false
  // 交互模式需要信任对话框
  return !checkHasTrustDialogAccepted()
}
```

### 2. 管理 Hooks 限制

```typescript
// hooks.ts:1515-1527
const managedOnly = shouldAllowManagedHooksOnly()
if (managedOnly && 'pluginRoot' in matcher) {
  continue  // 跳过 plugin hooks
}
```

### 3. HTTP Hook URL 白名单

```typescript
// settings/types.ts:484-487
allowedHttpHookUrls?: string[]  // URL 模式白名单
```

## 关键设计模式

### 1. AsyncLocalStorage 会话隔离

```typescript
// sessionHooks.ts
// 每个会话的 hooks 独立存储，防止跨会话污染
const sessionHooks = getSessionHooks(appState, sessionId, hookEvent)
```

### 2. CLI_ENV_FILE 环境变量注入

```typescript
// hooks.ts:919-926
if (['SessionStart', 'Setup', 'CwdChanged', 'FileChanged'].includes(hookEvent)) {
  envVars.CLAUDE_ENV_FILE = await getHookEnvFilePath(hookEvent, hookIndex)
}
// Hook 可以写环境变量到文件，下一个命令自动加载
```

### 3. 双阶段权限检查

```typescript
// 1. 配置阶段: if conditions 快速过滤
// 2. 执行阶段: prepareIfConditionMatcher 深度检查
const ifMatcher = await prepareIfConditionMatcher(hookInput, tools)
if (ifMatcher(h.hook.if)) return true
```

## 性能优化

### 1. 快速路径: 无条件 Hook

```typescript
// hooks.ts:1723-1729
if (matchedHooks.every(m => m.hook.type === 'callback' || m.hook.type === 'function')) {
  return matchedHooks  // 跳过去重
}
```

### 2. 事件存在性检查

```typescript
// hooks.ts:1582-1593
function hasHookForEvent(hookEvent, appState, sessionId): boolean {
  if (getHooksConfigFromSnapshot()?.[hookEvent]) return true
  if (getRegisteredHooks()?.[hookEvent]) return true
  if (appState?.sessionHooks.get(sessionId)?.hooks[hookEvent]) return true
  return false
}
```

### 3. Hook 超时控制

```typescript
const TOOL_HOOK_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000  // 10 分钟
const SESSION_END_HOOK_TIMEOUT_MS_DEFAULT = 1500       // 1.5 秒
```

## 集成点

### 1. Tool 执行 (PreToolUse/PostToolUse)

```typescript
// toolExecution.ts
const hooks = await getMatchingHooks(appState, sessionId, 'PreToolUse', hookInput, tools)
for (const hook of hooks) {
  const result = await execHook(hook, hookInput)
  if (result.updatedInput) hookInput.input = result.updatedInput
}
```

### 2. Query 生命周期

```typescript
// query.ts
// SessionStart → PreToolUse → PostToolUse → PreCompact → PostCompact → SessionEnd
```

### 3. MCP Elicitation

```typescript
// hooks.ts:674-706
case 'Elicitation':
  if (json.hookSpecificOutput.action === 'decline') {
    result.blockingError = { blockingError: 'Elicitation denied by hook', command }
  }
```

## 调试技巧

```bash
# Hook 诊断日志
logForDiagnosticsNoPII('info', 'hook_spawn_started', {
  hook_event_name: hookEvent,
  index: hookIndex
})

# 进度间隔
const stopProgressInterval = startHookProgressInterval({ hookId, hookName, ... })
stopProgressInterval()  // 清理
```
