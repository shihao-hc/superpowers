# MCP 模块深度分析

## 概述

MCP (Model Context Protocol) 是 Claude Code 的外部工具集成系统，支持通过标准化协议连接外部 MCP 服务器。

## 核心架构

### 1. 连接类型 (Transport Types)

```typescript
// client.ts:100-220
type ServerType = 'stdio' | 'sse' | 'http' | 'ws' | 'sdk' | 'claudeai-proxy' | 'sse-ide' | 'ws-ide'
```

| 类型 | 用途 | 特点 |
|------|------|------|
| stdio | 本地进程 | 标准输入输出，SIGINT→SIGTERM→SIGKILL 优雅关闭 |
| sse | 远程 SSE | Server-Sent Events，支持自动重连 |
| http | HTTP | StreamableHTTP，支持 OAuth |
| ws | WebSocket | 实时双向通信 |
| sdk | 内置 | 同进程运行 |
| claudeai-proxy | Claude.ai | Claude.ai MCP 代理 |

### 2. 连接流程 (connectToServer)

```typescript
// client.ts: 核心连接函数
async function connectToServer(
  name: string,
  serverRef: ScopedMcpServerConfig,
  serverStats?: ServerStats
): Promise<MCPServerConnection>
```

**关键步骤：**
1. **Transport 创建** - 根据 serverRef.type 创建对应的 Transport
2. **Stderr 捕获** - stdio 模式下捕获子进程 stderr (最多 64MB)
3. **Client 初始化** - 创建 MCP Client，设置 capabilities
4. **ListRoots 处理** - 注入当前工作目录给服务器
5. **连接超时** - Promise.race 实现，支持 401 重试
6. **错误处理** - 终端错误累积触发重连

### 3. 错误恢复机制

```typescript
// client.ts: 1216-1402
let consecutiveConnectionErrors = 0
const MAX_ERRORS_BEFORE_RECONNECT = 3

// 终端错误类型
const isTerminalConnectionError = (msg: string): boolean => {
  return msg.includes('ECONNRESET') ||
         msg.includes('ETIMEDOUT') ||
         msg.includes('EPIPE') ||
         msg.includes('EHOSTUNREACH') ||
         msg.includes('ECONNREFUSED')
}
```

**重连策略：**
- 终端错误累积到阈值 → 关闭 transport → 清理缓存 → 下次调用重建连接
- Session 过期 (404 + -32001) → 自动重连获取新 session ID

### 4. 工具管理 (fetchToolsForClient)

```typescript
// client.ts: 1743-1998
export const fetchToolsForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<Tool[]> => {
    const result = await client.client.request(
      { method: 'tools/list' },
      ListToolsResultSchema,
    )
    return toolsToProcess.map(tool => ({
      ...MCPTool,
      name: buildMcpToolName(client.name, tool.name),
      mcpInfo: { serverName: client.name, toolName: tool.name },
      isMcp: true,
      // 关键：annotation 映射
      isConcurrencySafe() { return tool.annotations?.readOnlyHint ?? false },
      isDestructive() { return tool.annotations?.destructiveHint ?? false },
      isOpenWorld() { return tool.annotations?.openWorldHint ?? false },
      // 权限检查返回 passthrough (MCP 需要用户授权)
      async checkPermissions() {
        return { behavior: 'passthrough', suggestions: [...] }
      },
      // 工具调用核心
      async call(args, context, _canUseTool, parentMessage, onProgress) {
        const result = await callMCPToolWithUrlElicitationRetry({...})
        return { data: result.content, mcpMeta: {...} }
      }
    }))
  },
  (client) => client.name,
  MCP_FETCH_CACHE_SIZE = 20
)
```

**工具 Annotation 映射：**
| MCP Annotation | Claude Code 行为 |
|----------------|------------------|
| readOnlyHint | isConcurrencySafe, isReadOnly |
| destructiveHint | isDestructive |
| openWorldHint | isOpenWorld |
| title | userFacingName 显示名 |

### 5. 工具调用 (callMCPTool)

```typescript
// client.ts: 3029-3245
async function callMCPTool({ client, tool, args, meta, signal, onProgress }) {
  // 1. 超时控制 (Promise.race)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  })

  // 2. 调用 MCP SDK
  const result = await Promise.race([
    client.callTool({ name: tool, arguments: args, _meta: meta }, schema, { signal }),
    timeoutPromise
  ])

  // 3. 进度跟踪 (每30秒)
  progressInterval = setInterval(() => logDebug(...), 30000)

  // 4. 结果处理
  return { content: processMCPResult(result), _meta, structuredContent }

  // 5. 错误恢复
  // - 401 → McpAuthError (token 过期)
  // - 404 + -32001 → McpSessionExpiredError (session 过期，清缓存重试)
  // - AbortError → 返回 undefined
}
```

### 6. URL Elicitation 处理

```typescript
// client.ts: 2813-3027
// MCP 工具可能返回 -32042 (UrlElicitationRequired) 错误
// 需要用户授权打开 URL

for (let attempt = 0; ; attempt++) {
  try {
    return await callToolFn({...})
  } catch (error) {
    if (error.code !== ErrorCode.UrlElicitationRequired) throw error
    if (attempt >= MAX_URL_ELICITATION_RETRIES) throw error

    // 1. 运行 elicitation hooks
    const hookResponse = await runElicitationHooks(serverName, elicitation, signal)
    if (hookResponse?.action !== 'accept') return hookResponse

    // 2. REPL 模式：队列式交互
    // Phase 1: consent (accept 继续等待，decline/cancel 拒绝)
    // Phase 2: waiting (retry 重新尝试，cancel 取消)

    // 3. 重试工具调用
  }
}
```

### 7. 资源订阅 (Resources)

```typescript
// client.ts: 2000-2031
export const fetchResourcesForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<ServerResource[]> => {
    const result = await client.client.request(
      { method: 'resources/list' },
      ListResourcesResultSchema,
    )
    return result.resources?.map(resource => ({ ...resource, server: client.name })) ?? []
  }
)
```

### 8. 提示命令 (Prompts)

```typescript
// client.ts: 2033-2107
export const fetchCommandsForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<Command[]> => {
    const result = await client.client.request(
      { method: 'prompts/list' },
      ListPromptsResultSchema,
    )
    return promptsToProcess.map(prompt => ({
      type: 'prompt',
      name: 'mcp__' + normalizeNameForMCP(client.name) + '__' + prompt.name,
      async getPromptForCommand(args) {
        const result = await connectedClient.client.getPrompt({ name: prompt.name, arguments: {...} })
        return result.messages.map(m => transformResultContent(m.content, serverName))
      }
    }))
  }
)
```

### 9. 内容转换 (transformResultContent)

```typescript
// client.ts: 2478-2591
// 处理 MCP 返回的各种内容类型
switch (resultContent.type) {
  case 'text': return [{ type: 'text', text: resultContent.text }]
  case 'audio': 
    // base64 → persistBlobToTextBlock → 返回文件路径
  case 'image':
    // base64 → resize → base64 返回给 API
  case 'resource':
    // 资源引用 → 获取实际内容 → 转换
  case 'resource_link':
    // 资源链接 → 返回链接文本
}
```

### 10. 大结果处理 (processMCPResult)

```typescript
// client.ts: 2720-2799
// 当结果超过阈值时，持久化到文件
if (mcpContentNeedsTruncation(content)) {
  if (contentContainsImages) {
    return truncateMcpContentIfNeeded(content) // 图片不持久化
  }
  const persistId = `mcp-${server}-${tool}-${timestamp}`
  const persistResult = await persistToolResult(contentStr, persistId)
  if (!isPersistError(persistResult)) {
    return getLargeOutputInstructions(filepath, size, formatDescription)
  }
}
```

## OAuth 认证 (auth.ts)

### 1. ClaudeAuthProvider

```typescript
// auth.ts: 实现 MCP SDK 的 OAuthProvider 接口
export class ClaudeAuthProvider implements OAuthClientProvider {
  async loadDiscoveryMetadata(): Promise<OAuthDiscoveryState | undefined>
  async loadClientCredentials(): Promise<OAuthClientInformation | undefined>
  async loadTokens(): Promise<OAuthTokens | undefined>
  async storeTokens(tokens: OAuthTokens): Promise<void>
  async refreshTokens(): Promise<OAuthTokens>
  async revokeTokens(): Promise<void>
}
```

### 2. Token 管理

```typescript
// auth.ts: Token 持久化到安全存储
const serverKey = getServerKey(serverName, serverConfig)
const hash = sha256(configJson).substring(0, 16)
getSecureStorage().read()?.mcpOAuth?.[serverKey]
```

### 3. 错误规范化

```typescript
// auth.ts: 处理 Slack 等非标准错误码
const NONSTANDARD_INVALID_GRANT_ALIASES = new Set([
  'invalid_refresh_token',
  'expired_refresh_token',
  'token_expired',
])
// 统一映射到 invalid_grant
```

## 并发控制 (getMcpToolsCommandsAndResources)

```typescript
// client.ts: 2226-2403
// 本地服务器 (stdio/sdk) 低并发，远程服务器高并发
await Promise.all([
  processBatched(localServers, getMcpServerConnectionBatchSize(), processServer),
  processBatched(remoteServers, getRemoteMcpServerConnectionBatchSize(), processServer),
])
```

## 缓存策略

| 缓存 | Key | 大小 | 清理时机 |
|------|-----|------|----------|
| connectToServer | serverRef hash | 无限制 | onclose / clearServerCache |
| fetchToolsForClient | server name | 20 | onclose |
| fetchResourcesForClient | server name | 20 | onclose |
| fetchCommandsForClient | server name | 20 | onclose |

## 关键设计模式

### 1. Promise.race 超时
```typescript
await Promise.race([
  client.callTool(...),
  new Promise((_, reject) => setTimeout(() => reject(), timeoutMs))
])
```

### 2. 错误累积重连
```typescript
if (isTerminalConnectionError(error.message)) {
  consecutiveConnectionErrors++
  if (consecutiveConnectionErrors >= MAX_ERRORS_BEFORE_RECONNECT) {
    closeTransportAndRejectPending('max consecutive terminal errors')
  }
}
```

### 3. 双阶段 Elicitation
- Phase 1: consent (等待用户决定)
- Phase 2: waiting (等待用户打开 URL 后重试)

## 安全考虑

1. **URL Elicitation** - 用户必须显式授权打开外部 URL
2. **OAuth Token** - 存储在安全存储，sha256 hash 作为 key
3. **Token Revocation** - RFC 7009 标准
4. **敏感参数过滤** - state, nonce, code_verifier 等不记录日志
5. **Stderr 限制** - 最多 64MB 防止内存溢出
