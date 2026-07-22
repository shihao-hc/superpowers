# Skills 模块深度分析

## 概览

Skills 是 Claude Code 的可扩展指令系统，允许用户通过 Markdown 文件定义自定义技能，为模型提供特定领域的指导和工作流程。

## 核心架构

### 1. 技能加载系统 (`loadSkillsDir.ts`)

```
┌─────────────────────────────────────────────────────────────┐
│                      技能加载入口                             │
│                  getSkillDirCommands(cwd)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
   Managed Dir    User Dir      Project Dirs    Legacy Commands
   (.claude/)    (~/skills)     (./skills)      (/commands/)
        │              │              │              │
        └──────────────┴──────┬───────┴──────────────┘
                               ▼
                    loadSkillsFromSkillsDir()
                               │
                    ┌──────────┴──────────┐
                    │  parseFrontmatter() │
                    │  createSkillCommand()│
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │  Deduplication       │
                    │  (realpath)          │
                    └─────────────────────┘
```

### 2. 技能来源 (LoadedFrom)

```typescript
type LoadedFrom =
  | 'commands_DEPRECATED'  // 旧版 /commands/ 目录
  | 'skills'              // /skills/ 目录格式
  | 'plugin'              // 插件提供
  | 'managed'             // 策略管理
  | 'bundled'             // 内置技能
  | 'mcp'                 // MCP 服务器提供
```

### 3. 技能发现机制

#### 静态发现 (启动时)
- **Managed skills**: `~/.claude/skills/`
- **User skills**: `~/.config/claude-code/skills/` (Unix) / `%APPDATA%/claude-code/skills/` (Windows)
- **Project skills**: `./.claude/skills/` (向上遍历到 home)
- **Additional dirs**: `--add-dir` 指定目录下的 `.claude/skills/`

#### 动态发现 (运行时)
```typescript
// discoverSkillDirsForPaths() - 文件操作时触发
async function discoverSkillDirsForPaths(filePaths: string[], cwd: string) {
  // 1. 从文件路径向上遍历到 cwd
  // 2. 查找每个目录下的 .claude/skills/
  // 3. 跳过 gitignored 目录
  // 4. 返回新发现的目录列表
}
```

### 4. 条件技能 (Conditional Skills)

当技能指定 `paths` frontmatter 时，它变成"条件技能"：

```yaml
---
name: api-review
paths:
  - src/api/**
  - **/*.proto
---
```

**激活机制**:
```typescript
function activateConditionalSkillsForPaths(filePaths: string[], cwd: string) {
  for (const [name, skill] of conditionalSkills) {
    const skillIgnore = ignore().add(skill.paths)
    for (const filePath of filePaths) {
      const relativePath = relative(cwd, filePath)
      if (skillIgnore.ignores(relativePath)) {
        dynamicSkills.set(name, skill)
        conditionalSkills.delete(name)
        // 激活！
      }
    }
  }
}
```

### 5. 去重机制

使用 `realpath()` 解析符号链接，防止同一文件被多次加载：

```typescript
async function getFileIdentity(filePath: string): Promise<string | null> {
  return await realpath(filePath)  // 解析符号链接
}

// 去重逻辑
const fileIds = await Promise.all(skills.map(s => getFileIdentity(s.filePath)))
const seenFileIds = new Map<string, SettingSource>()
for (const entry of allSkills) {
  if (seenFileIds.has(fileId)) {
    // 跳过重复
    continue
  }
  seenFileIds.set(fileId, entry.skill.source)
}
```

### 6. 技能命令结构

```typescript
interface Command {
  type: 'prompt'  // 提示类型命令
  name: string
  description: string
  hasUserSpecifiedDescription: boolean
  allowedTools?: string[]           // 允许的工具白名单
  argumentHint?: string             // 参数提示
  argNames?: string[]               // 参数名列表
  whenToUse?: string                // 使用场景描述
  version?: string
  model?: string                   // 模型覆盖
  disableModelInvocation?: boolean  // 禁用模型调用
  userInvocable?: boolean           // 用户可调用
  context?: 'inline' | 'fork'      // 执行上下文
  agent?: string                    // 指定 agent
  effort?: EffortValue              // 工作量级别
  paths?: string[]                  // 条件路径
  contentLength: number
  isHidden: boolean
  progressMessage: string
  source: 'bundled' | 'builtin' | 'plugin' | ...
  loadedFrom: LoadedFrom
  hooks?: HooksSettings             // Hook 配置
  skillRoot?: string                // 技能根目录
  isEnabled?: () => boolean         // 启用检查
  getPromptForCommand(args, context): Promise<ContentBlockParam[]>
}
```

## 内置技能系统

### 注册机制 (`bundledSkills.ts`)

```typescript
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  const command: Command = {
    type: 'prompt',
    name: definition.name,
    // ... 各种属性
    getPromptForCommand: definition.getPromptForCommand,
  }
  bundledSkills.push(command)
}
```

### 文件提取功能

内置技能可以包含需要提取到磁盘的参考文件：

```typescript
const definition = {
  name: 'my-skill',
  files: {
    'schema.json': '{"type": "object"}',
    'templates/template.md': '# Template',
  },
  async getPromptForCommand(args, context) {
    // 首次调用时自动提取 files 到磁盘
    // 并在 prompt 中添加 "Base directory for this skill: ..."
    return [{ type: 'text', text: '...' }]
  }
}
```

**安全机制**:
- `O_NOFOLLOW | O_EXCL` 防止符号链接攻击
- 路径遍历检查 (`..` 禁止)
- `0o700/0o600` 权限限制

## 技能执行

### SkillTool (`SkillTool.ts`)

```typescript
const SkillTool = buildTool({
  name: 'Skill',
  
  async validateInput({ skill }, context) {
    // 1. 规范化名称 (去除前导 /)
    // 2. 检查远程技能 (实验性)
    // 3. 查找命令
    // 4. 检查 disableModelInvocation
    // 5. 检查类型是 'prompt'
  },
  
  async checkPermissions({ skill, args }, context) {
    // 1. 检查 deny 规则
    // 2. 检查 allow 规则
    // 3. 安全属性自动放行
    // 4. 默认询问用户
  },
  
  async call({ skill, args }, context, canUseTool, parentMessage) {
    // Fork 模式
    if (command.context === 'fork') {
      return executeForkedSkill(command, args, context, canUseTool, parentMessage)
    }
    
    // Inline 模式
    const processedCommand = await processPromptSlashCommand(commandName, args, commands, context)
    return {
      data: { success: true, commandName },
      newMessages: processedCommand.messages,
      contextModifier: (ctx) => {
        // 更新 allowed tools
        // 应用模型覆盖
        // 应用 effort 级别
      }
    }
  }
})
```

### Fork vs Inline 执行

| 模式 | 用途 | 特点 |
|------|------|------|
| Inline | 简单技能 | 在当前 agent 中执行，快速 |
| Fork | 复杂技能 | 在子 agent 中执行，隔离的 token 预算 |

```typescript
// Fork 执行流程
async function executeForkedSkill(command, args, context, ...) {
  const { modifiedGetAppState, baseAgent, promptMessages } = 
    await prepareForkedCommandContext(command, args, context)
  
  const agentMessages: Message[] = []
  for await (const message of runAgent({
    agentDefinition: { ...baseAgent, effort: command.effort },
    promptMessages,
    toolUseContext: { ...context, getAppState: modifiedGetAppState },
    model: command.model,
  })) {
    agentMessages.push(message)
  }
  
  return extractResultText(agentMessages)
}
```

## 前端matter 解析

### 标准字段

```typescript
interface FrontmatterData {
  name?: string                    // 显示名称
  description?: string             // 描述
  when_to_use?: string            // 使用场景
  allowed_tools?: string[]         // 允许的工具
  argument_hint?: string           // 参数提示
  arguments?: string | string[]    // 参数定义
  version?: string                // 版本
  model?: string                  // 模型
  disable_model_invocation?: boolean
  user_invocable?: boolean        // 用户可调用
  context?: 'fork'                // 执行上下文
  agent?: string                  // Agent 类型
  effort?: string                 // 工作量
  shell?: FrontmatterShell        // Shell 配置
  paths?: string[]                // 条件路径
  hooks?: HooksSettings           // Hooks
}
```

## 安全机制

### 1. 安全属性白名单

```typescript
const SAFE_SKILL_PROPERTIES = new Set([
  'type', 'progressMessage', 'contentLength', 'argNames',
  'model', 'effort', 'source', 'pluginInfo', 'skillRoot',
  'context', 'agent', 'getPromptForCommand', 'paths', ...
])

function skillHasOnlySafeProperties(command: Command): boolean {
  for (const key of Object.keys(command)) {
    if (!SAFE_SKILL_PROPERTIES.has(key)) {
      const value = command[key]
      // 跳过空值
      if (value === undefined || value === null) continue
      if (Array.isArray(value) && value.length === 0) continue
      return false  // 危险属性
    }
  }
  return true
}
```

### 2. Shell 命令执行控制

```typescript
// MCP 技能禁止执行 shell 命令
if (loadedFrom !== 'mcp') {
  finalContent = await executeShellCommandsInPrompt(
    finalContent,
    { ...toolUseContext },
    `/${skillName}`,
    shell,
  )
}
```

### 3. 路径遍历防护

```typescript
function resolveSkillFilePath(baseDir: string, relPath: string): string {
  const normalized = normalize(relPath)
  if (isAbsolute(normalized) || normalized.includes('..')) {
    throw new Error('Path escapes skill dir')
  }
  return join(baseDir, normalized)
}
```

## 命令系统集成

### 优先级

```typescript
const loadAllCommands = memoize(async (cwd) => [
  ...bundledSkills,          // 1. 内置技能
  ...builtinPluginSkills,    // 2. 内置插件技能
  ...skillDirCommands,       // 3. 目录技能
  ...workflowCommands,       // 4. 工作流
  ...pluginCommands,         // 5. 插件命令
  ...pluginSkills,          // 6. 插件技能
  ...COMMANDS(),            // 7. 内置命令
])
```

### 动态技能插入

```typescript
export async function getCommands(cwd: string): Promise<Command[]> {
  const baseCommands = allCommands.filter(_ => meetsAvailabilityRequirement(_))
  const dynamicSkills = getDynamicSkills()
  
  // 插入动态技能在插件技能之后，内置命令之前
  const insertIndex = baseCommands.findIndex(c => builtInNames.has(c.name))
  return [
    ...baseCommands.slice(0, insertIndex),
    ...uniqueDynamicSkills,
    ...baseCommands.slice(insertIndex),
  ]
}
```

## 关键设计决策

### 1. Memoization 缓存

```typescript
export const getSkillDirCommands = memoize(
  async (cwd: string): Promise<Command[]> => {
    // 昂贵的磁盘 I/O 和 frontmatter 解析被缓存
  }
)
```

### 2. Signal 通知机制

```typescript
const skillsLoaded = createSignal()

export function onDynamicSkillsLoaded(callback: () => void): () => void {
  return skillsLoaded.subscribe(() => {
    try { callback() } catch (error) { logError(error) }
  })
}

// 动态技能加载后通知
export async function addSkillDirectories(dirs: string[]): Promise<void> {
  // ... 加载技能
  skillsLoaded.emit()  // 通知监听器
}
```

### 3. 循环依赖解决

```typescript
// mcpSkillBuilders.ts - 解决循环依赖
export function registerMCPSkillBuilders(b: MCPSkillBuilders): void {
  builders = b
}

// loadSkillsDir.ts 末尾注册
registerMCPSkillBuilders({
  createSkillCommand,
  parseSkillFrontmatterFields,
})

// mcpSkills.ts 使用
const { createSkillCommand } = getMCPSkillBuilders()
```

## 技能搜索 (实验性)

### Remote Skill Loader

```typescript
// 远程技能缓存到本地
const skillCacheDir = join(getManagedFilePath(), '.claude', 'skill-cache')

async function loadRemoteSkill(slug: string, url: string) {
  // 1. 检查本地缓存
  // 2. 从 GCS/S3/HTTP 下载
  // 3. 解析 SKILL.md
  // 4. 缓存到磁盘
  // 5. 返回内容
}
```

## 关键创新点

1. **三层加载**: 静态 (启动) → 动态 (文件操作) → 条件 (路径匹配)
2. **realpath 去重**: 防止符号链接导致重复加载
3. **安全属性白名单**: 防止恶意技能属性注入
4. **Signal 通知**: 解耦技能加载和消费
5. **循环依赖解决**: 通过注册表模式
6. **文件提取沙箱**: O_EXCL 防止符号链接攻击

## 文件位置

- `src/skills/loadSkillsDir.ts` - 核心加载逻辑 (1086 行)
- `src/skills/bundledSkills.ts` - 内置技能注册 (220 行)
- `src/skills/bundled/index.ts` - 内置技能初始化 (79 行)
- `src/skills/mcpSkillBuilders.ts` - MCP 技能构建器 (44 行)
- `src/tools/SkillTool/SkillTool.ts` - SkillTool 实现 (1108 行)
- `src/commands.ts` - 命令系统集成 (754 行)
