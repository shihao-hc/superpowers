# Commands 命令系统深度分析

## 核心架构

Claude Code的命令系统支持多种类型的命令：

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Command Types                                                          │
│  ├─ 'local'      - 本地命令，返回文本结果                               │
│  ├─ 'local-jsx' - 本地JSX命令，渲染React组件                          │
│  └─ 'prompt'     - 提示命令，扩展为AI提示内容                          │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Command Sources                                                      │
│  ├─ 内置命令 (commands.ts) - 60+内置命令                               │
│  ├─ Skill目录 (.claude/commands/)                                      │
│  ├─ 插件命令 (plugins)                                                │
│  ├─ Bundled Skills (内置技能)                                         │
│  └─ MCP命令 (mcp commands)                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1. Command类型定义 (types/command.ts)

```typescript
export type Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)

// 本地命令
type LocalCommand = {
  type: 'local'
  supportsNonInteractive: boolean
  load: () => Promise<LocalCommandModule>
}

// 本地JSX命令
type LocalJSXCommand = {
  type: 'local-jsx'
  load: () => Promise<LocalJSXCommandModule>
}

// 提示命令（技能）
type PromptCommand = {
  type: 'prompt'
  progressMessage: string
  contentLength: number
  context?: 'inline' | 'fork'  // inline=展开到当前对话，fork=子agent
  agent?: string
  getPromptForCommand(args, context): Promise<ContentBlockParam[]>
}

// 命令基础属性
type CommandBase = {
  name: string
  aliases?: string[]
  description: string
  availability?: ('claude-ai' | 'console')[]  // 可用性要求
  isEnabled?: () => boolean
  isHidden?: boolean
  whenToUse?: string  // 使用场景描述
  disableModelInvocation?: boolean  // 禁用模型调用
  loadedFrom?: 'commands' | 'skills' | 'plugin' | 'bundled' | 'mcp'
}
```

## 2. 命令解析 (slashCommandParsing.ts)

```typescript
export type ParsedSlashCommand = {
  commandName: string
  args: string
  isMcp: boolean
}

export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmedInput = input.trim()
  if (!trimmedInput.startsWith('/')) return null
  
  const withoutSlash = trimmedInput.slice(1)
  const words = withoutSlash.split(' ')
  
  // 检查MCP命令格式: /mcp:tool (MCP) args
  if (words.length > 1 && words[1] === '(MCP)') {
    return {
      commandName: words[0] + ' (MCP)',
      args: words.slice(2).join(' '),
      isMcp: true
    }
  }
  
  return {
    commandName: words[0],
    args: words.slice(1).join(' '),
    isMcp: false
  }
}
```

## 3. 命令执行流程 (processSlashCommand.tsx)

```
用户输入 "/clear" 
    ↓
parseSlashCommand("/clear")
    ↓
findCommand("clear", commands)
    ↓
getMessagesForSlashCommand()
    ├─ 'local'命令: load() → call() → 返回文本
    ├─ 'local-jsx'命令: load() → call() → 返回ReactNode
    └─ 'prompt'命令: getPromptForCommand() → 返回ContentBlockParam[]
```

### 3.1 Fork模式执行

```typescript
async function executeForkedSlashCommand(command, args, context, ...) {
  // 准备fork上下文
  const { skillContent, modifiedGetAppState, baseAgent, promptMessages } 
    = await prepareForkedCommandContext(command, args, context)
  
  // 在后台运行子agent
  for await (const message of runAgent({
    agentDefinition,
    promptMessages,
    toolUseContext: context,
    isAsync: false,
  })) {
    agentMessages.push(message)
  }
  
  // 返回结果作为用户消息
  return {
    messages: [createUserMessage({ content: resultText })],
    shouldQuery: false
  }
}
```

## 4. 命令注册 (commands.ts)

### 4.1 命令来源优先级

```typescript
const COMMANDS = memoize((): Command[] => [
  // 1. 内置命令 (最高优先级)
  addDir, advisor, agents, branch, btw, ...
  
  // 2. Feature-gated命令
  ...(webCmd ? [webCmd] : []),
  ...(forkCmd ? [forkCmd] : []),
  ...(buddy ? [buddy] : []),
  ...(proactive ? [proactive] : []),
  ...(assistantCommand ? [assistantCommand] : []),
  ...(bridge ? [bridge] : []),
  ...(voiceCommand ? [voiceCommand] : []),
])

// 完整命令列表加载
const loadAllCommands = memoize(async (cwd: string): Promise<Command[]> => {
  const [skillDirCommands, pluginSkills, bundledSkills, builtinPluginSkills] = 
    await Promise.all([
      getSkillDirCommands(cwd),
      getPluginSkills(),
      getBundledSkills(),
      getBuiltinPluginSkillCommands(),
    ])
  
  return [
    ...bundledSkills,
    ...builtinPluginSkills,
    ...skillDirCommands,
    ...workflowCommands,
    ...pluginCommands,
    ...pluginSkills,
    ...COMMANDS(),
  ]
})
```

### 4.2 命令过滤

```typescript
// 可用性检查
export function meetsAvailabilityRequirement(cmd: Command): boolean {
  if (!cmd.availability) return true
  for (const a of cmd.availability) {
    switch (a) {
      case 'claude-ai':
        return isClaudeAISubscriber()
      case 'console':
        return !isClaudeAISubscriber() && !isUsing3PServices()
    }
  }
}

// 远程安全命令
export const REMOTE_SAFE_COMMANDS: Set<Command> = new Set([
  session, exit, clear, help, theme, color, vim, cost, usage, copy, btw, ...
])

// Bridge安全命令
export const BRIDGE_SAFE_COMMANDS: Set<Command> = new Set([
  compact, clear, cost, summary, releaseNotes, files,
])
```

## 5. 命令定义示例

### 5.1 本地命令 (clear)

```typescript
// commands/clear/index.ts
const clear = {
  type: 'local',
  name: 'clear',
  description: 'Clear conversation history and free up context',
  aliases: ['reset', 'new'],
  supportsNonInteractive: false,
  load: () => import('./clear.js'),  // 懒加载
}
```

### 5.2 本地JSX命令 (help)

```typescript
// commands/help/index.ts
const help = {
  type: 'local-jsx',
  name: 'help',
  description: 'Show help and available commands',
  load: () => import('./help.jsx'),  // 懒加载
}

// commands/help/help.tsx
export const call: LocalJSXCommandCall = async (onDone, { options: { commands } }) => {
  return <HelpV2 commands={commands} onClose={onDone} />
}
```

### 5.3 提示命令 (skills)

```typescript
// 提示命令的getPromptForCommand实现
async getPromptForCommand(args, context): Promise<ContentBlockParam[]> {
  return [{
    type: 'text',
    text: `Skill content expanded here...\n\nArgs: ${args}`
  }]
}
```

## 6. 关键设计

### 6.1 懒加载

```typescript
// 重量级命令延迟加载
const insights = {
  type: 'prompt',
  name: 'insights',
  async getPromptForCommand(args, context) {
    // 动态import避免初始加载113KB的insights.ts
    const real = (await import('./commands/insights.js')).default
    return real.getPromptForCommand(args, context)
  }
}
```

### 6.2 Feature Gating

```typescript
// 条件编译减少包大小
const voiceCommand = feature('VOICE_MODE')
  ? require('./commands/voice/index.js').default
  : null

const ultraplan = feature('ULTRAPLAN')
  ? require('./commands/ultraplan.js').default
  : null
```

### 6.3 远程安全

```typescript
// 远程模式下过滤命令
export function filterCommandsForRemoteMode(commands: Command[]): Command[] {
  return commands.filter(cmd => REMOTE_SAFE_COMMANDS.has(cmd))
}

// Bridge入站命令白名单
export function isBridgeSafeCommand(cmd: Command): boolean {
  if (cmd.type === 'local-jsx') return false  // 阻止JSX渲染
  if (cmd.type === 'prompt') return true       // 提示命令安全
  return BRIDGE_SAFE_COMMANDS.has(cmd)         // 本地命令白名单
}
```

## 7. 文件清单

```
src/
├── commands.ts                    # 754行 - 命令注册核心
├── types/
│   └── command.ts               # 216行 - Command类型定义
├── utils/
│   ├── slashCommandParsing.ts   # 60行 - 命令解析
│   └── processUserInput/
│       ├── processSlashCommand.tsx  # 922行 - 命令执行
│       └── processUserInput.ts  # 605行 - 输入处理
└── commands/
    ├── help/
    ├── clear/
    ├── compact/
    ├── commit/
    ├── model/
    ├── skills/
    └── ... (60+ 个命令目录)
```

## 8. 理解深度评估

**预估理解度：** ~90%

**核心掌握：**
- ✅ Command类型定义 (local/local-jsx/prompt)
- ✅ 命令解析流程
- ✅ 命令注册和过滤机制
- ✅ Fork模式执行
- ✅ Feature Gating

**需要深入：**
- 🔶 具体命令的实现细节
- 🔶 Skill系统的完整流程
- 🔶 MCP命令集成
