# Claude Code Permissions 模块深度学习总结

## 1. 核心文件

| 文件 | 行数 | 描述 |
|------|------|------|
| `bashPermissions.ts` | 2621 | Bash 权限检查核心实现 |
| `readOnlyValidation.ts` | 1990 | 只读命令验证系统 |
| `pathValidation.ts` | 1303 | 路径约束检查 |
| `permissions.ts` | 1486 | 权限决策核心 |

---

## 1.1 bashToolHasPermission 完整流程 (精读版)

这是 Claude Code 权限系统的核心函数 (2621行)，完整流程如下：

```typescript
// bashPermissions.ts:1663-2557
async function bashToolHasPermission(input, context, getCommandSubcommandPrefixFn) {
  
  // ========== 阶段0: AST 安全解析 ==========
  // 替代 shell-quote pre-check 的新方案
  let astRoot = await parseCommandRaw(input.command)
  let astResult = parseForSecurityFromAst(input.command, astRoot)
  
  // Shadow 模式: 并行运行新旧解析器对比结果
  if (feature('TREE_SITTER_BASH_SHADOW')) {
    // 记录 divergence 并强制使用旧解析器
    logEvent('tengu_tree_sitter_shadow', {...})
    astResult = { kind: 'parse-unavailable' }
  }
  
  // AST 结果处理
  if (astResult.kind === 'too-complex') {
    // 复杂度超限 → 直接询问
    // 但仍检查 deny 规则 (不能降级)
    const earlyExit = checkEarlyExitDeny(input, context)
    if (earlyExit !== null) return earlyExit
    return { behavior: 'ask', pendingClassifierCheck: ... }
  }
  
  if (astResult.kind === 'simple') {
    // 语义检查: eval, source, exec 等危险命令
    const sem = checkSemantics(astResult.commands)
    if (!sem.ok) {
      // 检查每个子命令的 deny 规则
      const earlyExit = checkSemanticsDeny(input, context, astResult.commands)
      if (earlyExit !== null) return earlyExit
      return { behavior: 'ask' }
    }
    // 保存解析结果供后续使用
    astSubcommands = astResult.commands.map(c => c.text)
    astRedirects = astResult.commands.flatMap(c => c.redirects)
    astCommands = astResult.commands
  }
  
  // ========== 阶段1: 沙箱自动允许检查 ==========
  if (SandboxManager.isSandboxingEnabled() && 
      SandboxManager.isAutoAllowBashIfSandboxedEnabled() &&
      shouldUseSandbox(input)) {
    const result = checkSandboxAutoAllow(input, context)
    if (result.behavior !== 'passthrough') return result
  }
  
  // ========== 阶段2: 精确匹配检查 ==========
  const exactMatchResult = bashToolCheckExactMatchPermission(input, context)
  if (exactMatchResult.behavior === 'deny') return exactMatchResult
  
  // ========== 阶段3: Haiku 分类器检查 ==========
  // 并行运行 deny/ask 分类器
  const [denyResult, askResult] = await Promise.all([
    classifyBashCommand(command, cwd, denyDescriptions, 'deny', signal),
    classifyBashCommand(command, cwd, askDescriptions, 'ask', signal),
  ])
  
  // Deny 高置信度 → deny
  if (denyResult?.matches && denyResult.confidence === 'high') {
    return { behavior: 'deny', message: ... }
  }
  
  // Ask 高置信度 → ask (带建议)
  if (askResult?.matches && askResult.confidence === 'high') {
    return { behavior: 'ask', suggestions: ..., pendingClassifierCheck: ... }
  }
  
  // ========== 阶段4: 命令操作符检查 ==========
  // 检查 |, >, &&, || 等操作符
  const operatorResult = await checkCommandOperatorPermissions(input, ...)
  if (operatorResult.behavior === 'allow') {
    // 仍需验证原始命令的重定向和危险模式
    const safetyResult = await bashCommandIsSafeAsync(input.command)
    if (safetyResult?.behavior !== 'passthrough') {
      return { behavior: 'ask', pendingClassifierCheck: ... }
    }
    // 检查路径约束
    const pathResult = checkPathConstraints(input, cwd, context, ...)
    if (pathResult.behavior !== 'passthrough') return pathResult
  }
  if (operatorResult.behavior === 'ask') return operatorResult
  
  // ========== 阶段5: 复合命令处理 ==========
  // 分割子命令 (AST 或 splitCommand)
  const { subcommands, astCommandsByIdx } = filterCdCwdSubcommands(
    rawSubcommands, astCommands, cwd, cwdMingw
  )
  
  // CC-643: 子命令上限检查
  if (astSubcommands === null && subcommands.length > MAX_SUBCOMMANDS_FOR_SECURITY_CHECK) {
    return { behavior: 'ask' }
  }
  
  // 多个 cd 命令 → 询问
  if (cdCommands.length > 1) return { behavior: 'ask' }
  
  // 关键安全: cd + git 组合阻止
  if (compoundCommandHasCd && hasGitCommand) {
    return { behavior: 'ask', reason: 'compound commands with cd and git' }
  }
  
  // ========== 阶段6: 子命令级权限检查 ==========
  const subcommandPermissionDecisions = subcommands.map((cmd, i) =>
    bashToolCheckPermission(cmd, context, compoundCommandHasCd, astCommandsByIdx[i])
  )
  
  // Deny 优先
  const deniedSubresult = subcommandPermissionDecisions.find(_ => _.behavior === 'deny')
  if (deniedSubresult) return { behavior: 'deny' }
  
  // 检查原始命令的重定向
  const pathResult = checkPathConstraints(input, cwd, context, compoundCommandHasCd, astRedirects, astCommands)
  if (pathResult.behavior === 'deny') return pathResult
  
  // 单个子命令 ask → 直接返回
  if (askSubresult !== undefined && nonAllowCount === 1) {
    return { ...askSubresult, pendingClassifierCheck: ... }
  }
  
  // 全部 allow → allow
  if (subcommandPermissionDecisions.every(_ => _.behavior === 'allow') && 
      !hasPossibleCommandInjection) {
    return { behavior: 'allow', decisionReason: { type: 'subcommandResults', reasons: ... } }
  }
  
  // ========== 阶段7: 收集建议规则 ==========
  // GH-11380: 限制建议规则数量
  const collectedRules = ...
  const cappedRules = Array.from(collectedRules.values()).slice(0, MAX_SUGGESTED_RULES_FOR_COMPOUND)
  
  return { 
    behavior: askSubresult !== undefined ? 'ask' : 'passthrough',
    suggestions: { type: 'addRules', rules: cappedRules },
    pendingClassifierCheck: ...
  }
}
```

---

## 1.2 关键设计: Shadow Testing

```typescript
// bashPermissions.ts:1701-1739
// Shadow 模式: 同时运行新旧解析器，对比结果
if (feature('TREE_SITTER_BASH_SHADOW')) {
  // 1. 记录 tree-sitter 的判断
  const available = astResult.kind !== 'parse-unavailable'
  const tooComplex = astResult.kind === 'too-complex'
  const semanticFail = astResult.kind === 'simple' && !checkSemantics(astResult.commands).ok
  
  // 2. 对比新旧解析器的子命令分割结果
  const tsSubs = astResult.commands?.map(c => c.text)
  const legacySubs = splitCommand(input.command)
  const subsDiffer = tsSubs !== undefined && 
    (tsSubs.length !== legacySubs.length || tsSubs.some((s, i) => s !== legacySubs[i]))
  
  // 3. 记录分歧事件
  logEvent('tengu_tree_sitter_shadow', { available, tooComplex, semanticFail, subsDiffer, ... })
  
  // 4. 强制使用旧解析器 (shadow 模式只观察)
  astResult = { kind: 'parse-unavailable' }
  astRoot = null
}
```

---

## 1.3 关键设计: 推测性分类器检查

```typescript
// bashPermissions.ts:1483-1545
// 提前启动分类器检查，与其他操作并行运行
const speculativeChecks = new Map<string, Promise<ClassifierResult>>()

export function startSpeculativeClassifierCheck(command, context, signal, isNonInteractive) {
  const promise = classifyBashCommand(command, cwd, descriptions, 'allow', signal, isNonInteractive)
  promise.catch(() => {}) // 防止未处理的 rejection
  speculativeChecks.set(command, promise)
  return true
}

// 后续消费结果
export function consumeSpeculativeClassifierCheck(command) {
  const promise = speculativeChecks.get(command)
  if (promise) speculativeChecks.delete(command)
  return promise
}
```

---

## 1.4 安全修复历史

| 修复 | 描述 |
|------|------|
| CC-643 | 子命令数量上限 (50) 防止 CPU 冻结 |
| GH-11380 | 建议规则数量上限 (5) |
| GH-28784 | 复合命令中单个子命令 ask 不应短路 |
| HackerOne #3543050 | 安全环境变量限制防止 allow 规则绕过 |
| 沙箱逃逸 | cd+git 组合阻止 |
| 命令注入 | AST parse 替代 shell-quote |
| 路径约束 | Deny 规则检查在路径约束之前 |

## 2. bashToolHasPermission 核心流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                    bashToolHasPermission (入口)                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. AST 解析 (tree-sitter)                                           │
│    - too-complex → 自动询问                                          │
│    - simple → checkSemantics() 检查危险命令                          │
│    - parse-unavailable → 降级到 shell-quote                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. 精确匹配检查 (exact match)                                        │
│    - bashToolCheckExactMatchPermission()                             │
│    - 匹配 deny → deny                                               │
│    - 匹配 ask → ask                                                 │
│    - 匹配 allow → allow                                             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. 规则匹配 (prefix/wildcard)                                       │
│    - filterRulesByContentsMatchingInput()                            │
│    - stripSafeWrappers() 剥离安全包装器                              │
│    - stripAllLeadingEnvVars() 剥离所有环境变量 (deny规则)            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. 分类器检查 (Haiku)                                               │
│    - startSpeculativeClassifierCheck() 并行启动                      │
│    - executeAsyncClassifierCheck() 异步执行                           │
│    - 高置信度 deny → deny                                           │
│    - 高置信度 allow → 自动批准                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. 路径约束检查                                                      │
│    - checkPathConstraints()                                          │
│    - validateOutputRedirections() 检查重定向                         │
│    - cd+重定向 阻止                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. 复合命令处理                                                      │
│    - splitCommand() 分割子命令                                       │
│    - 检查每个子命令的权限                                             │
│    - 拒绝优先于询问                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. 只读验证                                                          │
│    - checkReadOnlyConstraints()                                       │
│    - isCommandSafeViaFlagParsing() 标志解析                           │
│    - 只读命令自动允许                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                         最终决策: allow/deny/ask/passthrough
```

## 3. 关键安全特性

### 3.1 命令注入防护

```typescript
// AST 解析检测复杂命令
if (astResult.kind === 'too-complex') {
  return { behavior: 'ask' }
}

// 危险命令语义检查
if (!sem.ok) {
  // eval, source, exec 等
  return { behavior: 'ask' }
}
```

### 3.2 路径约束

```typescript
// 支持的路径命令
export type PathCommand = 'cd' | 'ls' | 'find' | 'mkdir' | 'touch' | 'rm' | 'cp' | ...;

// 路径提取器
export const PATH_EXTRACTORS = {
  cd: args => args.join(' '),  // 特殊处理
  ls: args => filterOutFlags(args),
  find: args => /* 复杂逻辑 */,
  rm: filterOutFlags,
  // ...
}
```

### 3.3 只读命令白名单

```typescript
// 命令配置系统
type CommandConfig = {
  safeFlags: Record<string, FlagArgType>  // 安全标志定义
  regex?: RegExp                          // 额外正则验证
  additionalCommandIsDangerousCallback?: (rawCommand, args) => boolean
}

// 示例: git 只读命令
const GIT_READ_ONLY_COMMANDS = {
  'git status': { safeFlags: { '--short': 'none', '--porcelain': 'none' } },
  'git diff': { safeFlags: { '--stat': 'none', '--no-color': 'none' } },
  // ...
}
```

### 3.4 危险命令阻止

```typescript
// 危险删除路径
export function isDangerousRemovalPath(path: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => 
    minimatch(path, pattern, { dot: true })
  )
}

// 危险模式
const DANGEROUS_PATTERNS = [
  '/',
  '/bin/*',
  '/boot/*',
  '/dev/*',
  '/etc/*',
  '/lib/*',
  '/sbin/*',
  '/sys/*',
  '/usr/*',
  '/var/*',
  '/*'
]
```

## 4. 沙箱逃逸防护

### 4.1 cd+git 组合阻止

```typescript
// 防止: cd /malicious/dir && git status
if (compoundCommandHasCd && hasGitCommand) {
  return { behavior: 'ask' }
}
```

### 4.2 裸仓库攻击阻止

```typescript
// 检测裸仓库结构
export function isCurrentDirectoryBareGitRepo(): boolean {
  // 检查当前目录是否有 git 内部文件
  // hooks/, objects/, refs/
}
```

### 4.3 git 内部路径写入阻止

```typescript
// 防止: mkdir hooks && echo malicious > hooks/pre-commit && git status
const GIT_INTERNAL_PATTERNS = [
  /^HEAD$/,
  /^objects(?:\/|$)/,
  /^refs(?:\/|$)/,
  /^hooks(?:\/|$)/,
]
```

## 5. 权限决策优先级

```
1. Deny 规则 (精确/前缀/通配符) ──────────────────→ deny
     │
2. Ask 规则 ──────────────────────────────────────→ ask
     │
3. 危险命令 (eval, source, exec) ─────────────────→ ask
     │
4. 路径约束违规 ──────────────────────────────────→ ask
     │
5. 允许规则 (精确/前缀/通配符) ────────────────────→ allow
     │
6. 只读命令 ──────────────────────────────────────→ allow
     │
7. 其他 ──────────────────────────────────────────→ passthrough (询问用户)
```

## 6. 核心设计模式

### 6.1 stripSafeWrappers 两阶段剥离

```typescript
// Phase 1: 剥离安全环境变量
while (stripped !== previousStripped) {
  if (envVarMatch && isSafeEnvVar(varName)) {
    stripped = stripped.replace(ENV_VAR_PATTERN, '')
  }
}

// Phase 2: 剥离包装器 (不在 env var 之后)
while (stripped !== previousStripped) {
  for (const pattern of SAFE_WRAPPER_PATTERNS) {
    stripped = stripped.replace(pattern, '')
  }
}
```

### 6.2 推测性分类器检查

```typescript
// 并行启动，不阻塞主流程
export function startSpeculativeClassifierCheck(command, context, signal) {
  const promise = classifyBashCommand(command, cwd, descriptions, 'allow', signal)
  speculativeChecks.set(command, promise)
  return true
}

// 后续消费结果
export function consumeSpeculativeClassifierCheck(command) {
  return speculativeChecks.get(command)
}
```

### 6.3 CC-643 子命令上限

```typescript
// 防止复杂命令导致的 CPU 冻结
export const MAX_SUBCOMMANDS_FOR_SECURITY_CHECK = 50

if (subcommands.length > MAX_SUBCOMMANDS_FOR_SECURITY_CHECK) {
  return { behavior: 'ask' }
}
```

## 7. 关键安全注释

### 7.1 DCE Cliff

```typescript
// bashPermissions.ts:81-87
// DCE cliff: Bun's feature() evaluator has a per-function complexity budget.
// bashToolHasPermission is right at the limit.
// Keep aliases as top-level const rebindings instead.
const bashCommandIsSafeAsync = bashCommandIsSafeAsync_DEPRECATED
```

### 7.2 安全环境变量

```typescript
// 安全的: NODE_ENV, PYTHONPATH, PATH
// 不安全的: LD_PRELOAD, PYTHONPATH, NODE_OPTIONS

const SAFE_ENV_VARS = new Set([
  'NODE_ENV',      // ✓ 环境名称
  'GOOS',          // ✓ 目标平台
  'RUST_BACKTRACE',// ✓ 日志级别
  // ...
])

const ANT_ONLY_SAFE_ENV_VARS = new Set([
  'KUBECONFIG',    // 配置文件指针
  'DOCKER_HOST',   // Docker 端点
  // ...
])
```

### 7.3 xargs 危险标志

```typescript
// -i 和 -e 使用 GNU getopt 可选参数语义
// -iX 等于 -i X (可选参数)
// 但 shell-quote 解析为 ['', 'X'] 而非参数值
```

## 8. 理解程度评估

| 维度 | 理解度 | 说明 |
|------|--------|------|
| 架构 | 90% | 完整理解权限系统的架构和流程 |
| 设计模式 | 85% | 理解了多种安全模式和防御机制 |
| 代码细节 | 75% | 精读了核心文件实现 |
| 安全机制 | 90% | 深入理解了安全防护措施 |

## 9. 关键学习点

1. **Deny > Ask > Allow** 优先级保证安全
2. **AST 解析** 优于正则表达式解析
3. **沙箱多层防护** (cd+git, 裸仓库, UNC路径)
4. **白名单优于黑名单** (标志解析)
5. **推测性执行** 提高用户体验
6. **复杂度上限** 防止 DoS 攻击
