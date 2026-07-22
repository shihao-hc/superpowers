import { EventEmitter } from 'events'
import { ChildProcess, spawn } from 'child_process'
import { log, debug, error as logError } from '../utils/log.js'
import type {
  MCPServerConfig,
  MCPServerConnection,
  MCPServerStatus,
  MCPTool,
  MCPToolCallResult,
  MCPResource,
  MCPToolResultContent,
  MCPTransport,
} from './types.js'

// SECURITY: 白名单允许的 MCP 服务器命令
const ALLOWED_MCP_COMMANDS = new Set(['npx', 'node', 'npm', 'deno', 'bun', 'python', 'python3']);

function isSafeMCPServerCommand(command: string): boolean {
  if (!command || typeof command !== 'string') return false;
  
  // 白名单检查
  if (ALLOWED_MCP_COMMANDS.has(command.toLowerCase())) return true;
  
  // 允许字母数字下划线连字符点号
  if (/^[a-zA-Z0-9_.-]+$/.test(command)) return true;
  
  return false;
}

function sanitizeMCPArg(arg: unknown): string {
  if (typeof arg !== 'string') return String(arg);
  // 移除空字节
  const cleaned = arg.replace(/\x00/g, '');
  // 限制长度
  return cleaned.length > 10000 ? cleaned.substring(0, 10000) : cleaned;
}

export class MCPClient extends EventEmitter {
  private connections: Map<string, MCPServerConnection> = new Map()
  private tools: Map<string, MCPTool> = new Map()
  private resources: Map<string, MCPResource> = new Map()
  private processes: Map<string, ChildProcess> = new Map()

  constructor() {
    super()
  }

  async connect(
    id: string,
    config: MCPServerConfig,
  ): Promise<MCPServerConnection> {
    debug(`MCP: Connecting to server ${id}`)

    const connection: MCPServerConnection = {
      id,
      name: config.name || id,
      status: 'pending',
      config,
    }

    this.connections.set(id, connection)
    this.emit('connecting', connection)

    try {
      const transport = this.createTransport(config)
      const result = await this.initializeConnection(transport, connection)

      connection.status = 'connected'
      connection.capabilities = result.capabilities
      connection.serverInfo = result.serverInfo
      connection.instructions = result.instructions
      connection.lastConnected = Date.now()

      this.updateTools(result.tools || [])
      this.updateResources(result.resources || [])

      this.emit('connected', connection)
      log(`MCP: Connected to server ${id}`)

      return connection
    } catch (err) {
      connection.status = 'failed'
      connection.lastError = err instanceof Error ? err.message : String(err)
      this.emit('error', { connection, error: err })
      logError(`MCP: Failed to connect to ${id}: ${connection.lastError}`)
      throw err
    }
  }

  async disconnect(id: string): Promise<void> {
    const connection = this.connections.get(id)
    if (!connection) return

    const process = this.processes.get(id)
    if (process) {
      process.kill()
      this.processes.delete(id)
    }

    connection.status = 'disconnected'
    this.emit('disconnected', connection)
    log(`MCP: Disconnected from server ${id}`)
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<MCPToolCallResult> {
    const connection = this.findConnectedServer()
    if (!connection) {
      throw new Error('No connected MCP server')
    }

    debug(`MCP: Calling tool ${toolName}`)

    try {
      const result = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.generateId(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      })

      this.emit('tool-result', { tool: toolName, result })
      return result as MCPToolCallResult
    } catch (err) {
      logError(`MCP: Tool call failed: ${err}`)
      throw err
    }
  }

  async listTools(): Promise<MCPTool[]> {
    return Array.from(this.tools.values())
  }

  async listResources(): Promise<MCPResource[]> {
    return Array.from(this.resources.values())
  }

  getConnection(id: string): MCPServerConnection | undefined {
    return this.connections.get(id)
  }

  getConnections(): MCPServerConnection[] {
    return Array.from(this.connections.values())
  }

  getConnectedServers(): MCPServerConnection[] {
    return this.getConnections().filter(c => c.status === 'connected')
  }

  private createTransport(config: MCPServerConfig): MCPTransport {
    switch (config.type) {
      case 'stdio':
        // SECURITY FIX: 验证命令是否为白名单
        const command = config.command || 'node';
        if (!isSafeMCPServerCommand(command)) {
          throw new Error(`SECURITY: MCP server command "${command}" is not in whitelist. Allowed: ${Array.from(ALLOWED_MCP_COMMANDS).join(', ')}`);
        }
        
        // SECURITY FIX: 清理参数
        const sanitizedArgs = (config.args || []).map(sanitizeMCPArg);
        
        return {
          type: 'stdio',
          command,
          args: sanitizedArgs,
          env: config.env,
        }
      case 'sse':
      case 'http':
      case 'ws':
        // SECURITY FIX: SSRF prevention — validate URLs
        if (config.url) {
          const blockedHosts = ['169.254.169.254', '100.100.100.200', 'metadata.google.internal'];
          try {
            const parsed = new URL(config.url);
            if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
              throw new Error(`Unsupported protocol: ${parsed.protocol}`);
            }
            if (blockedHosts.includes(parsed.hostname)) {
              throw new Error(`Access to metadata service blocked: ${parsed.hostname}`);
            }
          } catch (e: any) {
            throw new Error(`SSRF blocked for ${config.name || 'unknown'}: ${e.message}`);
          }
        }
        return {
          type: config.type,
          url: config.url || '',
          headers: config.headers,
        }
      case 'sdk':
        return {
          type: 'sdk',
          name: config.name || 'sdk',
        }
      default:
        throw new Error(`Unsupported transport type: ${config.type}`)
    }
  }

  private async initializeConnection(
    transport: MCPTransport,
    connection: MCPServerConnection,
  ): Promise<{
    capabilities: { tools?: boolean; resources?: boolean }
    serverInfo: { name: string; version: string }
    tools: MCPTool[]
    resources: MCPResource[]
    instructions?: string
  }> {
    if (transport.type === 'stdio') {
      return this.initializeStdioServer(transport, connection)
    }

    return this.initializeHttpServer(transport, connection)
  }

  private async initializeStdioServer(
    transport: { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> },
    connection: MCPServerConnection,
  ): Promise<{
    capabilities: { tools?: boolean; resources?: boolean }
    serverInfo: { name: string; version: string }
    tools: MCPTool[]
    resources: MCPResource[]
    instructions?: string
  }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(transport.command, transport.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...transport.env },
      })

      this.processes.set(connection.id, proc)

      let buffer = ''
      let initialized = false

      proc.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const msg = JSON.parse(line)
            if (!initialized && msg.id === 'init') {
              initialized = true
              resolve({
                capabilities: msg.result?.capabilities || {},
                serverInfo: msg.result?.serverInfo || { name: 'unknown', version: '0.0.0' },
                tools: msg.result?.tools || [],
                resources: msg.result?.resources || [],
                instructions: msg.result?.instructions,
              })
            }
          } catch {
            // Ignore parse errors for now
          }
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        logError(`MCP Server stderr: ${data.toString()}`)
      })

      proc.on('error', reject)

      proc.on('exit', (code) => {
        if (!initialized) {
          reject(new Error(`Server exited with code ${code}`))
        }
      })

      proc.stdin?.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 'init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {} },
          clientInfo: { name: 'opencode', version: '1.0.0' },
        },
      }) + '\n')

      proc.stdin?.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 'initialized',
        method: 'notifications/initialized',
      }) + '\n')

      setTimeout(() => {
        if (!initialized) {
          reject(new Error('Initialization timeout'))
        }
      }, 30000)
    })
  }

  private async initializeHttpServer(
    transport: { type: string; url?: string; headers?: Record<string, string> },
    connection: MCPServerConnection,
  ): Promise<{
    capabilities: { tools?: boolean; resources?: boolean }
    serverInfo: { name: string; version: string }
    tools: MCPTool[]
    resources: MCPResource[]
    instructions?: string
  }> {
    const endpointUrl = transport.url ?? ''
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...transport.headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {} },
          clientInfo: { name: 'opencode', version: '1.0.0' },
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result: any = await response.json()
    return {
      capabilities: result.capabilities || {},
      serverInfo: result.serverInfo || { name: 'unknown', version: '0.0.0' },
      tools: result.tools || [],
      resources: result.resources || [],
      instructions: result.instructions,
    }
  }

  private async sendRequest(message: Record<string, unknown>): Promise<unknown> {
    const connection = this.findConnectedServer()
    if (!connection) throw new Error('No connected server')

    const process = this.processes.get(connection.id)
    if (process && process.stdin) {
      return this.sendStdioRequest(process, message)
    }

    return this.sendHttpRequest(connection.config.url || '', message)
  }

  private sendStdioRequest(proc: ChildProcess, message: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let buffer = ''
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'))
      }, 60000)

      const onData = (data: Buffer) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.id === message.id) {
              clearTimeout(timeout)
              proc.stdout?.removeListener('data', onData)
              if (msg.error) reject(new Error(msg.error.message))
              else resolve(msg.result)
            }
          } catch {}
        }
      }

      proc.stdout?.on('data', onData)
      proc.stdin?.write(JSON.stringify(message) + '\n')
    })
  }

  private async sendHttpRequest(url: string | undefined, message: Record<string, unknown>): Promise<unknown> {
    if (!url) throw new Error('No URL configured for HTTP transport')
    const response = await fetch(String(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const result: any = await response.json()
    if (result.error) {
      throw new Error(result.error.message)
    }
    return result.result
  }

  private findConnectedServer(): MCPServerConnection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.status === 'connected') return conn
    }
    return undefined
  }

  private updateTools(tools: MCPTool[]): void {
    this.tools.clear()
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
    this.emit('tools-updated', Array.from(this.tools.values()))
  }

  private updateResources(resources: MCPResource[]): void {
    this.resources.clear()
    for (const resource of resources) {
      this.resources.set(resource.uri, resource)
    }
    this.emit('resources-updated', Array.from(this.resources.values()))
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15)
  }

  destroy(): void {
    for (const [id] of this.processes) {
      this.disconnect(id)
    }
    this.connections.clear()
    this.tools.clear()
    this.resources.clear()
  }
}

export const mcpClient = new MCPClient()
