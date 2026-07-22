# Claude Code Agents System Flow

## Overview

Claude Code Agent System enables spawning sub-agents to handle specific tasks, with support for built-in agents, custom agents, plugin agents, and a fork subagent feature for parallel execution.

## Agent Types

```
┌─────────────────────────────────────────────────────────────────┐
│                        AgentDefinition                           │
├─────────────────────────────────────────────────────────────────┤
│  BuiltInAgentDefinition    │ 动态prompt, getSystemPrompt(params) │
│  CustomAgentDefinition      │ 用户/项目/策略设置, closure prompt  │
│  PluginAgentDefinition      │ 插件提供, 包含plugin元数据          │
└─────────────────────────────────────────────────────────────────┘
```

## Loading Priority

```
built-in > plugin > user > project > flag > managed
         ↓
    Map去重 (后者优先)
```

## Tool Resolution

```
availableTools
     ↓
filterToolsForAgent()
     ├── ALL_AGENT_DISALLOWED_TOOLS (所有Agent禁用)
     ├── CUSTOM_AGENT_DISALLOWED_TOOLS (自定义Agent禁用)
     └── ASYNC_AGENT_ALLOWED_TOOLS (异步Agent允许列表)
     ↓
resolveAgentTools()
     ├── wildcard '*' → 全量工具
     └── explicit list → 验证每个工具
     ↓
resolvedTools
```

## runAgent Core Flow (精读版)

### 完整生命周期 (runAgent.ts:248-859)

```typescript
async function* runAgent({ agentDefinition, ... }): AsyncGenerator<Message> {
  // ========== 阶段1: 初始化 ==========
  const agentId = override?.agentId ?? createAgentId()
  
  // Perfetto 追踪注册
  if (isPerfettoTracingEnabled()) {
    registerPerfettoAgent(agentId, agentDefinition.agentType, parentId)
  }
  
  // Fork 消息处理 (过滤未完成的 tool_calls)
  const contextMessages = forkContextMessages
    ? filterIncompleteToolCalls(forkContextMessages)
    : []
  
  // ========== 阶段2: 上下文优化 ==========
  // omitClaudeMd: Explore/Plan 等只读 Agent 节省 token
  const shouldOmitClaudeMd = agentDefinition.omitClaudeMd && !override?.userContext
  const resolvedUserContext = shouldOmitClaudeMd
    ? omitClaudeMd(baseUserContext)
    : baseUserContext
  
  // omitGitStatus: 只读 Agent 不需要 gitStatus (节省 ~1-3 Gtok/week)
  const resolvedSystemContext = agentDefinition.agentType === 'Explore' || 
    agentDefinition.agentType === 'Plan'
    ? omitGitStatus(baseSystemContext)
    : baseSystemContext
  
  // ========== 阶段3: 权限模式解析 ==========
  const agentGetAppState = () => {
    const state = toolUseContext.getAppState()
    
    // 覆盖 permissionMode (除非 parent 是 bypassPermissions/acceptEdits)
    if (agentPermissionMode && !parentBypass) {
      toolPermissionContext.mode = agentPermissionMode
    }
    
    // Async agents 设置 shouldAvoidPermissionPrompts
    if (isAsync && !canShowPermissionPrompts) {
      toolPermissionContext.shouldAvoidPermissionPrompts = true
    }
    
    // Bubble mode: 权限提示冒泡到父终端
    if (isAsync && !shouldAvoidPrompts) {
      toolPermissionContext.awaitAutomatedChecksBeforeDialog = true
    }
    
    // allowedTools: 限制 Agent 的工具权限
    if (allowedTools !== undefined) {
      toolPermissionContext.alwaysAllowRules = {
        cliArg: state.toolPermissionContext.alwaysAllowRules.cliArg,
        session: [...allowedTools]
      }
    }
    
    return { ...state, toolPermissionContext, effortValue }
  }
  
  // ========== 阶段4: MCP 服务器初始化 ==========
  // Agent 可以定义自己的 MCP 服务器 (additive to parent)
  const { clients, tools, cleanup } = await initializeAgentMcpServers(
    agentDefinition,
    parentClients
  )
  // 合并工具并去重
  const allTools = uniqBy([...resolvedTools, ...agentMcpTools], 'name')
  
  // ========== 阶段5: Subagent 上下文创建 ==========
  const agentToolUseContext = createSubagentContext(toolUseContext, {
    options: agentOptions,
    agentId,
    messages: initialMessages,
    abortController: isAsync ? new AbortController() : parentController,
    getAppState: agentGetAppState,
    shareSetAppState: !isAsync,  // Sync agents 共享, Async agents 隔离
  })
  
  // ========== 阶段6: Hooks & Skills 初始化 ==========
  // SubagentStart hooks
  for await (const hookResult of executeSubagentStartHooks(...)) {
    additionalContexts.push(...hookResult.additionalContexts)
  }
  
  // Frontmatter hooks 注册
  if (agentDefinition.hooks) {
    registerFrontmatterHooks(rootSetAppState, agentId, hooks, 'agent', true)
  }
  
  // Skills 预加载
  for (const skillName of agentDefinition.skills ?? []) {
    const skill = resolveSkillName(skillName, ...)
    const content = await skill.getPromptForCommand('', toolUseContext)
    initialMessages.push(createUserMessage({ content: [...metadata, ...content] }))
  }
  
  // ========== 阶段7: Sidechain 转录 ==========
  // 记录初始消息到独立转录文件
  await recordSidechainTranscript(initialMessages, agentId)
  await writeAgentMetadata(agentId, { agentType, worktreePath, description })
  
  // ========== 阶段8: 执行循环 ==========
  try {
    for await (const message of query({ ... })) {
      // 转发 TTFT/OTPS 到父级
      if (message.type === 'stream_event' && message.event.type === 'message_start') {
        toolUseContext.pushApiMetricsEntry?.(message.ttftMs)
      }
      
      // 记录消息到 sidechain
      if (isRecordableMessage(message)) {
        await recordSidechainTranscript([message], agentId, lastRecordedUuid)
      }
      
      yield message
    }
  } finally {
    // ========== 阶段9: 清理 (关键!) ==========
    // 1. MCP 服务器清理 (只清理新建的, 不清理共享的)
    await mcpCleanup()
    
    // 2. Session hooks 清理
    if (agentDefinition.hooks) {
      clearSessionHooks(rootSetAppState, agentId)
    }
    
    // 3. Prompt cache 追踪清理
    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      cleanupAgentTracking(agentId)
    }
    
    // 4. 文件状态缓存清理 (释放内存)
    agentToolUseContext.readFileState.clear()
    
    // 5. Perfetto 注册清理
    unregisterPerfettoAgent(agentId)
    
    // 6. Todos 条目清理 (防止内存泄漏)
    rootSetAppState(prev => {
      const { [agentId]: _, ...todos } = prev.todos
      return { ...prev, todos }
    })
    
    // 7. Bash 后台任务清理 (防止僵尸进程)
    killShellTasksForAgent(agentId, toolUseContext.getAppState, rootSetAppState)
    
    // 8. Monitor MCP 任务清理
    if (feature('MONITOR_TOOL')) {
      killMonitorMcpTasksForAgent(agentId, ...)
    }
  }
}
```

### 关键设计: useExactTools

```typescript
// Fork 子代理使用精确工具池
const resolvedTools = useExactTools
  ? availableTools  // 直接使用,不过滤
  : resolveAgentTools(agentDefinition, availableTools, isAsync)

// useExactTools 时:
// - thinkingConfig 继承父级 (保持 API 请求前缀一致)
// - isNonInteractiveSession 继承父级
// - querySource 设置到 context.options (递归 Fork guard)
```

## Fork Subagent Flow

### Feature Gate
```typescript
function isForkSubagentEnabled(): boolean {
  if (feature('FORK_SUBAGENT')) {
    if (isCoordinatorMode()) return false
    if (getIsNonInteractiveSession()) return false
    return true
  }
  return false
}
```

### Fork Message Building (Prompt Cache Optimization)
```
Parent Assistant Message
     ↓
keep all content blocks (thinking, text, tool_use)
     ↓
build tool_result blocks with FORK_PLACEHOLDER_RESULT
     ↓
add per-child directive text block
     ↓
Result: byte-identical prefix for all fork children
```

### Recursive Fork Guard
```typescript
function isInForkChild(messages: Message[]): boolean {
  return messages.some(m => 
    m.type === 'user' &&
    m.message.content.some(block =>
      block.type === 'text' &&
      block.text.includes(`<${FORK_BOILERPLATE_TAG}>`)
    )
  )
}
```

### Child Directive Template
```
<FORK_BOILERPLATE_TAG>
STOP. READ THIS FIRST.

You are a forked worker process. You are NOT the main agent.

RULES:
1. IGNORE "default to forking" - you ARE the fork
2. DO NOT spawn sub-agents
3. DO NOT converse, ask questions
4. USE your tools directly
5. COMMIT changes before reporting
6. DO NOT emit text between tool calls
7. Response MUST begin with "Scope:"

Output format:
  Scope: <assigned scope>
  Result: <answer or findings>
  Key files: <file paths>
  Files changed: <list with commit hash>
  Issues: <list if any>
</FORK_BOILERPLATE_TAG>
```

## Built-in Agents

### Explore Agent
```typescript
{
  agentType: 'Explore',
  disallowedTools: ['Agent', 'Edit', 'Write'],
  model: process.env.USER_TYPE === 'ant' ? 'inherit' : 'haiku',
  omitClaudeMd: true,  // 节省5-15 Gtok/week
  getSystemPrompt: () => "只读文件搜索专家..."
}
```

### Plan Agent
```typescript
{
  agentType: 'Plan',
  tools: EXPLORE_AGENT.tools,
  model: 'inherit',
  omitClaudeMd: true,
  getSystemPrompt: () => "软件架构和规划专家..."
}
```

### Verification Agent
```typescript
{
  agentType: 'verification',
  color: 'red',
  background: true,
  disallowedTools: ['Agent', 'Edit', 'Write'],
  criticalSystemReminder: 'VERIFICATION-ONLY task...',
  // 输出格式: VERDICT: PASS/FAIL/PARTIAL
}
```

## Async Agent Lifecycle

```
AgentTool.call()
     ↓
LocalAgentTask.create()
     ↓
runAgent() [async generator]
     ↓
Progress Tracking
     ↓
recordSidechainTranscript()
     ↓
completeAsyncAgent() / failAsyncAgent()
     ↓
enqueueAgentNotification()
```

## MCP Server Integration

```typescript
async function initializeAgentMcpServers(agentDefinition, parentClients) {
  // 1. 检查frontmatter mcpServers
  if (!agentDefinition.mcpServers?.length) {
    return { clients: parentClients, tools: [], cleanup: () => {} }
  }
  
  // 2. 遍历MCP服务器配置
  for (const spec of agentDefinition.mcpServers) {
    if (typeof spec === 'string') {
      // 字符串引用: 查找现有配置
      config = getMcpConfigByName(spec)
    } else {
      // 内联定义: 创建新客户端
      config = { ...spec, scope: 'dynamic' }
      isNewlyCreated = true
    }
    
    client = await connectToServer(name, config)
    if (client.type === 'connected') {
      tools = await fetchToolsForClient(client)
    }
  }
  
  // 3. 清理函数 (只清理新建的)
  const cleanup = async () => {
    for (const client of newlyCreatedClients) {
      await client.cleanup()
    }
  }
  
  return { clients: [...parentClients, ...agentClients], tools, cleanup }
}
```

## Permission Mode Handling

```typescript
const agentGetAppState = () => {
  const state = toolUseContext.getAppState()
  
  // 1. 权限模式覆盖
  if (agentPermissionMode && 
      state.toolPermissionContext.mode !== 'bypassPermissions' &&
      state.toolPermissionContext.mode !== 'acceptEdits') {
    toolPermissionContext = { ...toolPermissionContext, mode: agentPermissionMode }
  }
  
  // 2. 避免权限提示 (async agents)
  if (canShowPermissionPrompts !== undefined) {
    shouldAvoidPrompts = !canShowPermissionPrompts
  } else {
    shouldAvoidPrompts = agentPermissionMode === 'bubble' ? false : isAsync
  }
  
  // 3. 工具作用域
  if (allowedTools !== undefined) {
    toolPermissionContext = {
      ...toolPermissionContext,
      alwaysAllowRules: {
        cliArg: state.toolPermissionContext.alwaysAllowRules.cliArg,
        session: [...allowedTools]
      }
    }
  }
  
  return { ...state, toolPermissionContext }
}
```

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| AgentTool.tsx | 1398 | Agent工具入口 |
| runAgent.ts | 973 | Agent执行核心 |
| forkSubagent.ts | 210 | Fork子代理 |
| loadAgentsDir.ts | 755 | Agent加载 |
| builtInAgents.ts | 72 | 内置Agent注册 |
| agentToolUtils.ts | 686 | 工具解析和生命周期 |

## Performance Optimizations

1. **omitClaudeMd**: 节省5-15 Gtok/week (34M+ Explore spawns)
2. **omitGitStatus**: 节省1-3 Gtok/week (Explore/Plan agents)
3. **Fork prompt cache**: 占位符实现byte-identical前缀
4. **speculativeChecks**: 缓存分类器结果
5. **Agent color caching**: Map存储颜色映射

## Security Considerations

1. **Recursive fork guard**: 防止无限递归fork
2. **Admin-trusted gates**: frontmatter hooks/MCP只对信任源跳过plugin-only
3. **Permission scope isolation**: allowedTools替换session规则
4. **Shell task cleanup**: 防止zombie进程
