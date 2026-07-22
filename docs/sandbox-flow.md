# Sandbox 模块深度分析

## 概述

**模块**: sandbox (沙箱隔离系统)  
**核心文件**: `utils/sandbox/sandbox-adapter.ts` (985行)  
**依赖**: `@anthropic-ai/sandbox-runtime` (bubblewrap)  
**平台支持**: macOS, Linux, WSL2

---

## 1. 核心架构

### 1.1 适配器模式

```typescript
// sandbox-adapter.ts 是 Claude Code 和 sandbox-runtime 之间的桥梁
export const SandboxManager: ISandboxManager = {
  // Claude Code 自定义实现
  initialize,
  isSandboxingEnabled,
  setSandboxSettings,
  // 转发到 base sandbox-runtime
  getFsReadConfig: BaseSandboxManager.getFsReadConfig,
  getFsWriteConfig: BaseSandboxManager.getFsWriteConfig,
  // ...
}
```

### 1.2 集成关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
├─────────────────────────────────────────────────────────────────┤
│  BashTool.shouldUseSandbox() → 判断是否使用沙箱                  │
│  Shell.ts.wrapWithSandbox() → 包装命令                          │
│  bashPermissions.ts → 权限检查集成                               │
├─────────────────────────────────────────────────────────────────┤
│              SandboxManager (sandbox-adapter.ts)                 │
│  • 路径解析 (//path, /path, ~/path)                             │
│  • 配置转换 (settings → SandboxRuntimeConfig)                   │
│  • Git worktree 支持                                            │
│  • 安全防护 (settings.json, .claude/skills, 裸仓库)              │
│  • 设置订阅 (settings 变更 → 动态更新配置)                       │
├─────────────────────────────────────────────────────────────────┤
│              @anthropic-ai/sandbox-runtime                       │
│  • Bubblewrap (bwrap) 进程隔离                                  │
│  • 文件系统限制 (ro-bind, deny-write)                           │
│  • 网络限制 (allowedDomains, deniedDomains)                      │
│  • 违规检测和报告                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 路径解析系统

### 2.1 Claude Code 特定路径模式

```typescript
// resolvePathPatternForSandbox() - 权限规则路径解析
export function resolvePathPatternForSandbox(
  pattern: string,
  source: SettingSource,
): string {
  // //path → /path (绝对路径，CC特定约定)
  if (pattern.startsWith('//')) {
    return pattern.slice(1)
  }

  // /path → $SETTINGS_DIR/path (相对于设置文件目录)
  if (pattern.startsWith('/') && !pattern.startsWith('//')) {
    const root = getSettingsRootPathForSource(source)
    return resolve(root, pattern.slice(1))
  }

  // ~/path, ./path, path → 透传到 sandbox-runtime 处理
  return pattern
}
```

### 2.2 sandbox.filesystem 设置路径解析

```typescript
// resolveSandboxFilesystemPath() - 标准路径语义
// Fix #30067: 用户期望 /path = 绝对路径，不是设置相对路径
export function resolveSandboxFilesystemPath(
  pattern: string,
  source: SettingSource,
): string {
  if (pattern.startsWith('//')) return pattern.slice(1) // 兼容旧语法
  return expandPath(pattern, getSettingsRootPathForSource(source))
}
```

---

## 3. 配置转换 (convertToSandboxRuntimeConfig)

### 3.1 核心流程

```typescript
export function convertToSandboxRuntimeConfig(
  settings: SettingsJson,
): SandboxRuntimeConfig {
  return {
    network: {
      allowedDomains,    // 从 WebFetch 规则提取
      deniedDomains,
      allowUnixSockets,
      allowAllUnixSockets,
      allowLocalBinding,
      httpProxyPort,
      socksProxyPort,
    },
    filesystem: {
      denyRead,
      allowRead,
      allowWrite,
      denyWrite,
    },
    ignoreViolations,
    enableWeakerNestedSandbox,
    enableWeakerNetworkIsolation,
    ripgrep,
  }
}
```

### 3.2 网络域提取

```typescript
// 从权限规则提取 WebFetch 域名
for (const ruleString of permissions.allow || []) {
  const rule = permissionRuleValueFromString(ruleString)
  if (rule.toolName === WEB_FETCH_TOOL_NAME && 
      rule.ruleContent?.startsWith('domain:')) {
    allowedDomains.push(rule.ruleContent.substring('domain:'.length))
  }
}
```

---

## 4. 安全防护机制

### 4.1 关键文件保护

```typescript
// 阻止写入 settings.json 文件
const settingsPaths = SETTING_SOURCES.map(source =>
  getSettingsFilePathForSource(source),
).filter((p): p is string => p !== undefined)
denyWrite.push(...settingsPaths)
denyWrite.push(getManagedSettingsDropInDir())

// 阻止写入 .claude/skills 目录 (与 commands/agents 同等权限)
denyWrite.push(resolve(originalCwd, '.claude', 'skills'))
denyWrite.push(resolve(cwd, '.claude', 'skills'))
```

### 4.2 裸 Git 仓库攻击防护

**攻击向量**: 攻击者在 cwd 中创建裸仓库结构 (HEAD, objects, refs)，当 Claude 的非沙箱 git 运行时可绕过沙箱。

**防护策略**:
```typescript
// bareGitRepoScrubPaths - 跟踪不存在的裸仓库文件
const bareGitRepoFiles = ['HEAD', 'objects', 'refs', 'hooks', 'config']

// 如果文件存在 → denyWrite (ro-bind)
// 如果文件不存在 → 事后清理 scrubBareGitRepoFiles()
for (const p of bareGitRepoScrubPaths) {
  try {
    rmSync(p, { recursive: true }) // 清理 planted 文件
  } catch {
    // ENOENT 正常
  }
}
```

### 4.3 Git Worktree 支持

```typescript
// 检测 git worktree 并解析主仓库路径
async function detectWorktreeMainRepoPath(cwd: string): Promise<string | null> {
  const gitContent = await readFile(join(cwd, '.git'), { encoding: 'utf8' })
  const gitdirMatch = gitContent.match(/^gitdir:\s*(.+)$/m)
  // gitdir: /path/to/main/repo/.git/worktrees/name
  // 提取主仓库路径
}
```

---

## 5. 设置管理系统

### 5.1 沙箱启用检查

```typescript
function isSandboxingEnabled(): boolean {
  if (!isSupportedPlatform()) return false          // macOS/Linux/WSL2
  if (checkDependencies().errors.length > 0) return false
  if (!isPlatformInEnabledList()) return false     // enabledPlatforms 设置
  return getSandboxEnabledSetting()                 // sandbox.enabled
}
```

### 5.2 动态配置更新

```typescript
// 设置变更订阅 → 自动更新沙箱配置
settingsSubscriptionCleanup = settingsChangeDetector.subscribe(() => {
  const settings = getSettings_DEPRECATED()
  const newConfig = convertToSandboxRuntimeConfig(settings)
  BaseSandboxManager.updateConfig(newConfig)
})

// 同步刷新配置
function refreshConfig(): void {
  const settings = getSettings_DEPRECATED()
  const newConfig = convertToSandboxRuntimeConfig(settings)
  BaseSandboxManager.updateConfig(newConfig)
}
```

### 5.3 不可用原因报告

```typescript
function getSandboxUnavailableReason(): string | undefined {
  if (!getSandboxEnabledSetting()) return undefined
  if (!isSupportedPlatform()) return `${platform} is not supported`
  if (!isPlatformInEnabledList()) return `${platform} not in enabledPlatforms`
  const deps = checkDependencies()
  if (deps.errors.length > 0) {
    return `dependencies missing: ${deps.errors.join(', ')}`
  }
}
```

---

## 6. 命令排除系统

### 6.1 shouldUseSandbox 决策

```typescript
export function shouldUseSandbox(input: Partial<SandboxInput>): boolean {
  if (!SandboxManager.isSandboxingEnabled()) return false
  
  // dangerouslyDisableSandbox + allowUnsandboxedCommands → 不沙箱
  if (input.dangerouslyDisableSandbox && 
      SandboxManager.areUnsandboxedCommandsAllowed()) {
    return false
  }
  
  // 排除命令列表 → 不沙箱
  if (containsExcludedCommand(input.command)) {
    return false
  }
  
  return true
}
```

### 6.2 排除命令匹配

```typescript
// 支持多种匹配模式: exact, prefix, wildcard
function containsExcludedCommand(command: string): boolean {
  const subcommands = splitCommand_DEPRECATED(command) // && 分割
  for (const subcommand of subcommands) {
    for (const pattern of userExcludedCommands) {
      const rule = bashPermissionRule(pattern)
      // 支持 strip env vars 和 wrapper commands 后匹配
      const candidates = applyFixpoint(stripEnvVars, stripWrappers)
      if (matchRule(rule, candidates)) return true
    }
  }
  return false
}
```

---

## 7. 与权限系统集成

### 7.1 bashPermissions.ts 集成

```typescript
// permissions.ts
import { SandboxManager } from '../sandbox/sandbox-adapter.js'

// 沙箱启用时自动允许 Bash 命令
if (SandboxManager.isSandboxingEnabled() &&
    SandboxManager.isAutoAllowBashIfSandboxedEnabled()) {
  // 自动允许 (沙箱提供安全边界)
}
```

### 7.2 HTTP Hook 代理集成

```typescript
// execHttpHook.ts
if (SandboxManager.isSandboxingEnabled()) {
  await SandboxManager.waitForNetworkInitialization()
  const proxyPort = SandboxManager.getProxyPort()
  // 通过沙箱代理转发 HTTP 请求
}
```

---

## 8. 关键设计模式

### 8.1 Memoization 缓存

```typescript
const checkDependencies = memoize((): SandboxDependencyCheck => {
  return BaseSandboxManager.checkDependencies({ command: rgPath, args: rgArgs })
})

const isSupportedPlatform = memoize((): boolean => {
  return BaseSandboxManager.isSupportedPlatform()
})
```

### 8.2 循环依赖解决

```typescript
// permissions.ts 导入 SandboxManager
// bashPermissions.ts 导入 permissions.ts
// 为避免循环依赖，本地复制 permissionRuleValueFromString()
function permissionRuleValueFromString(ruleString: string): PermissionRuleValue {
  // 本地实现，不依赖 permissions.ts
}
```

### 8.3 平台特定处理

```typescript
// PowerShell 在沙箱中的特殊处理
const isSandboxedPowerShell = shouldUseSandbox && shellType === 'powershell'
const sandboxBinShell = isSandboxedPowerShell ? '/bin/sh' : binShell
```

---

## 9. ISandboxManager 接口

```typescript
export interface ISandboxManager {
  // 生命周期
  initialize(sandboxAskCallback?: SandboxAskCallback): Promise<void>
  refreshConfig(): void
  reset(): Promise<void>
  
  // 状态查询
  isSandboxingEnabled(): boolean
  isSandboxEnabledInSettings(): boolean
  isSupportedPlatform(): boolean
  isPlatformInEnabledList(): boolean
  isSandboxRequired(): boolean
  areUnsandboxedCommandsAllowed(): boolean
  isAutoAllowBashIfSandboxedEnabled(): boolean
  areSandboxSettingsLockedByPolicy(): boolean
  
  // 配置获取
  checkDependencies(): SandboxDependencyCheck
  getFsReadConfig(): FsReadRestrictionConfig
  getFsWriteConfig(): FsWriteRestrictionConfig
  getNetworkRestrictionConfig(): NetworkRestrictionConfig
  getExcludedCommands(): string[]
  getIgnoreViolations(): IgnoreViolationsConfig | undefined
  
  // 沙箱包装
  wrapWithSandbox(command: string, ...): Promise<string>
  cleanupAfterCommand(): void
  
  // 网络初始化
  waitForNetworkInitialization(): Promise<boolean>
  getProxyPort(): number | undefined
  getSocksProxyPort(): number | undefined
}
```

---

## 10. 理解程度

| 维度 | 程度 | 说明 |
|------|------|------|
| 架构 | 90% | 适配器模式，bwrap 集成 |
| 设计模式 | 90% | Memoization, 设置订阅, 循环依赖解决 |
| 代码细节 | 85% | 路径解析，配置转换，安全防护 |
| 安全 | 95% | 裸仓库防护，settings.json 阻止 |
| 集成 | 90% | Permissions, Shell, Hooks 集成 |

---

## 11. 关键洞察

### 11.1 深度洞察

1. **bwrap 限制**
   - 不支持 glob 模式 → Linux glob 警告
   - 创建 0-byte 挂载点文件 → 事后清理

2. **配置层叠**
   - policySettings > flagSettings > localSettings
   - allowManagedDomainsOnly 策略隔离

3. **平台差异**
   - macOS: 沙箱日志自动启用
   - Linux/WSL: 需要额外配置
   - WSL1 不支持

4. **安全边界**
   - excludedCommands 是便利功能，不是安全边界
   - 真正安全边界是沙箱权限系统

### 11.2 最佳实践

1. 启用沙箱时设置 allowUnsandboxedCommands: false
2. 使用 policySettings 锁定沙箱配置
3. 定期检查 checkDependencies() 错误

---

## 12. 相关文件

| 文件 | 行数 | 用途 |
|------|------|------|
| sandbox-adapter.ts | 985 | 适配器核心 |
| sandbox-ui-utils.ts | 12 | UI 工具 |
| shouldUseSandbox.ts | 153 | 沙箱决策 |
| Shell.ts | 474 | 命令包装 |
| bashPermissions.ts | 2621 | 权限集成 |
| sandbox-toggle/* | 50+ | 命令界面 |
