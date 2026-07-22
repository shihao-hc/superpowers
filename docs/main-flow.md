# Main Entry Point & Startup Flow 深度分析

## 概述

Claude Code 的启动流程从 `main.tsx` 开始，经过初始化、设置检查、CLI 参数解析，最终进入交互式 REPL 或 headless 执行模式。

## 启动流程图

```
main.tsx (入口)
    │
    ├─→ 预检查 (Node.js debugger 检测)
    │
    ├─→ run() 函数
    │       │
    │       ├─→ Commander.js 命令行解析
    │       │
    │       ├─→ preAction hook (初始化)
    │       │       │
    │       │       ├─→ MDM/Keychain 预加载等待
    │       │       ├─→ init() (配置启用、环境变量、代理设置)
    │       │       ├─→ 迁移 (runMigrations)
    │       │       └─→ 远程设置加载
    │       │
    │       └─→ action handler (主命令处理)
    │               │
    │               ├─→ CLI 参数解析
    │               │       ├─→ MCP 配置解析
    │               │       ├─→ Agent 选项
    │               │       ├─→ 权限模式
    │               │       └─→ Worktree/Tmux 选项
    │               │
    │               ├─→ setup() (交互式会话设置)
    │               │       │
    │               │       ├─→ UDS 消息服务器 (可选)
    │               │       ├─→ Teammate 快照 (可选)
    │               │       ├─→ 工作目录设置
    │               │       ├─→ Hook 配置快照
    │               │       ├─→ Worktree 创建 (可选)
    │               │       └─→ 预取 (Plugins, Skills, Context)
    │               │
    │               ├─→ showSetupScreens() (信任对话框)
    │               │
    │               └─→ launchRepl() 或 runHeadless()
    │
    └─→ REPL / Headless 执行
```

## 关键文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `main.tsx` | 4684 | 主入口、CLI 解析、启动协调 |
| `setup.ts` | 477 | 交互式会话设置 |
| `init.ts` | 340 | 初始化 (配置、代理、遥测) |
| `entrypoints/sdk/` | - | SDK 入口 |

## main.tsx 核心逻辑

### 1. 预检查 (Top-level)

```typescript
// main.tsx:266-271
// 防止调试器附加 (安全性)
if ("external" !== 'ant' && isBeingDebugged()) {
  process.exit(1)
}
```

### 2. 预加载 (Before Imports)

```typescript
// main.tsx:9-20
// 与后续导入并行执行
profileCheckpoint('main_tsx_entry')
startMdmRawRead()           // MDM 设置读取
startKeychainPrefetch()     // Keychain 预取
```

### 3. run() 函数

```typescript
// main.tsx:884-968
async function run(): Promise<CommanderCommand> {
  const program = new CommanderCommand()
  
  // preAction hook - 所有命令执行前运行
  program.hook('preAction', async thisCommand => {
    await Promise.all([
      ensureMdmSettingsLoaded(),
      ensureKeychainPrefetchCompleted()
    ])
    await init()
    runMigrations()
  })
  
  // 添加选项...
  program.option('-p, --print', 'Print response and exit')
  program.option('--model <model>', 'Model for session')
  // ...
  
  // 主 action
  program.action(async (prompt, options) => {
    // 处理 CLI 参数
    // 调用 setup()
    // 启动 REPL 或 headless
  })
}
```

### 4. CLI 选项解析

```typescript
// main.tsx:1006-1899
.action(async (prompt, options) => {
  // MCP 配置
  const mcpConfig = options.mcpConfig
  if (mcpConfig) {
    const configs = parseMcpConfig(mcpConfig)
    dynamicMcpConfig = filterMcpServersByPolicy(configs)
  }
  
  // 权限模式
  const { mode: permissionMode } = initialPermissionModeFromCLI({
    permissionModeCli,
    dangerouslySkipPermissions
  })
  
  // Worktree/Tmux
  const worktreeEnabled = worktreeOption !== undefined
  if (tmuxEnabled && !worktreeEnabled) {
    process.stderr.write('Error: --tmux requires --worktree')
    process.exit(1)
  }
  
  // Agent Swarms
  if (isAgentSwarmsEnabled()) {
    const teammateOpts = extractTeammateOptions(options)
    getTeammateUtils().setDynamicTeamContext?.(teammateOpts)
  }
})
```

## setup() 函数

```typescript
// setup.ts:56-477
export async function setup(
  cwd: string,
  permissionMode: PermissionMode,
  allowDangerouslySkipPermissions: boolean,
  worktreeEnabled: boolean,
  worktreeName: string | undefined,
  tmuxEnabled: boolean,
  customSessionId?: string,
  worktreePRNumber?: number,
): Promise<void> {
  // 1. UDS 消息服务器 (可选)
  if (feature('UDS_INBOX')) {
    await startUdsMessaging(socketPath)
  }
  
  // 2. Teammate 快照
  if (isAgentSwarmsEnabled()) {
    captureTeammateModeSnapshot()
  }
  
  // 3. 终端备份恢复
  if (!getIsNonInteractiveSession()) {
    checkAndRestoreITerm2Backup()
    checkAndRestoreTerminalBackup()
  }
  
  // 4. 设置工作目录
  setCwd(cwd)
  
  // 5. Hook 配置快照
  captureHooksConfigSnapshot()
  initializeFileChangedWatcher(cwd)
  
  // 6. Worktree 创建 (可选)
  if (worktreeEnabled) {
    const worktreeSession = await createWorktreeForSession(sessionId, slug)
    process.chdir(worktreeSession.worktreePath)
    setCwd(worktreeSession.worktreePath)
    setProjectRoot(getCwd())
  }
  
  // 7. 预取
  initSessionMemory()
  void getCommands(getProjectRoot())
  void loadPluginHooks()
  void prefetchApiKeyFromApiKeyHelperIfSafe()
  
  // 8. 遥测
  logEvent('tengu_started', {})
}
```

## init.ts 初始化

```typescript
// init.ts:57-238
export const init = memoize(async (): Promise<void> => {
  // 1. 启用配置
  enableConfigs()
  
  // 2. 应用安全环境变量
  applySafeConfigEnvironmentVariables()
  
  // 3. CA 证书
  applyExtraCACertsFromConfig()
  
  // 4. 优雅关闭设置
  setupGracefulShutdown()
  
  // 5. 遥测初始化
  initialize1PEventLogging()
  
  // 6. OAuth 账户信息
  populateOAuthAccountInfoIfNeeded()
  
  // 7. JetBrains IDE 检测
  initJetBrainsDetection()
  
  // 8. GitHub 仓库检测
  detectCurrentRepository()
  
  // 9. 远程托管设置
  if (isEligibleForRemoteManagedSettings()) {
    initializeRemoteManagedSettingsLoadingPromise()
  }
  
  // 10. mTLS 配置
  configureGlobalMTLS()
  
  // 11. 全局 HTTP 代理
  configureGlobalAgents()
  
  // 12. Anthropic API 预连接
  preconnectAnthropicApi()
  
  // 13. 上游代理 (CCR 模式)
  if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
    await initUpstreamProxy()
  }
  
  // 14. Git Bash 设置 (Windows)
  setShellIfWindows()
  
  // 15. Scratchpad 目录
  if (isScratchpadEnabled()) {
    await ensureScratchpadDir()
  }
})
```

## 关键设计模式

### 1. Memoized 初始化

```typescript
// init.ts:57
export const init = memoize(async (): Promise<void> => {
  // 确保只执行一次
})
```

### 2. 预加载并行化

```typescript
// main.tsx:12-20
// 与模块导入并行执行
startMdmRawRead()
startKeychainPrefetch()

// main.tsx:94-105
void Promise.all([
  import('../services/analytics/firstPartyEventLogger.js'),
  import('../services/analytics/growthbook.js'),
]).then(...)
```

### 3. Feature Gating

```typescript
// 使用 feature() 条件导入
if (feature('COORDINATOR_MODE')) {
  const coordinatorModeModule = require('./coordinator/coordinatorMode.js')
}

// 条件导出
if (feature('KAIROS')) {
  const assistantModule = require('./assistant/index.js')
}
```

### 4. Trust Dialog 延迟

```typescript
// main.tsx:1861-1867
// MCP 配置在信任对话框之前预加载 (只读文件)
const mcpConfigPromise = getClaudeCodeMcpConfigs(dynamicMcpConfig)

// 实际 MCP 连接在 setup() 后进行
await setup()
await prefetchAllMcpResources()
```

### 5. Workspace Trust 检查

```typescript
// hooks.ts:286-296
export function shouldSkipHookDueToTrust(): boolean {
  if (!getIsNonInteractiveSession()) {
    return false  // SDK 模式跳过
  }
  return !checkHasTrustDialogAccepted()  // 交互模式需要信任
}
```

## 启动模式

| 模式 | 触发 | 特点 |
|------|------|------|
| Interactive | 默认 | 完整 UI，信任对话框 |
| Print (-p) | `--print` | Headless，信任跳过 |
| SDK | `--sdk-url` | Stream JSON I/O |
| MCP | `mcp serve` | MCP 服务器模式 |

## 性能优化

### 1. 预取并行化
```typescript
// setup.ts:321-329
void getCommands(getProjectRoot())       // 插件命令
void loadPluginHooks()                  // 插件 Hooks
void prefetchApiKeyFromApiKeyHelperIfSafe()  // API Key
```

### 2. 延迟加载
```typescript
// init.ts:46-47
// 遥测延迟加载 ~400KB
const { initializeTelemetry } = await import(
  '../utils/telemetry/instrumentation.js'
)
```

### 3. Startup Profiler
```typescript
// main.tsx:9
profileCheckpoint('main_tsx_entry')
// 在关键路径记录时间点
profileCheckpoint('main_tsx_imports_loaded')
profileCheckpoint('preAction_start')
profileCheckpoint('action_handler_start')
```

## 安全检查

### 1. 调试器检测
```typescript
// main.tsx:232-263
function isBeingDebugged() {
  // 检查 process.execArgv 中的 --inspect
  // 检查 inspector.url()
  return hasInspectArg || hasInspectorUrl
}
if (isBeingDebugged()) process.exit(1)
```

### 2. Root 检查
```typescript
// setup.ts:401-414
if (process.getuid() === 0 && !isSandboxed) {
  process.stderr.write('--dangerously-skip-permissions cannot be used with root')
  process.exit(1)
}
```

### 3. Docker/Sandbox 检查
```typescript
// setup.ts:427-441
const [isDocker, hasInternet] = await Promise.all([
  envDynamic.getIsDocker(),
  env.hasInternetAccess(),
])
if (!isSandboxed || hasInternet) {
  // 拒绝无沙箱的 bypass 权限
}
```

## 迁移系统

```typescript
// main.tsx:325-352
const CURRENT_MIGRATION_VERSION = 11

function runMigrations(): void {
  if (getGlobalConfig().migrationVersion !== CURRENT_MIGRATION_VERSION) {
    migrateAutoUpdatesToSettings()
    migrateBypassPermissionsAcceptedToSettings()
    migrateEnableAllProjectMcpServersToSettings()
    migrateLegacyOpusToCurrent()
    // ... 更多迁移
    saveGlobalConfig({ migrationVersion: CURRENT_MIGRATION_VERSION })
  }
}
```
