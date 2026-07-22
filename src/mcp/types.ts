export type MCPServerConfig = {
  type: 'stdio' | 'sse' | 'http' | 'ws' | 'sdk'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  name?: string
}

export type MCPServerStatus = 
  | 'pending'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'needs-auth'

export interface MCPServerConnection {
  id: string
  name: string
  status: MCPServerStatus
  config: MCPServerConfig
  capabilities?: MCPServerCapabilities
  serverInfo?: {
    name: string
    version: string
  }
  instructions?: string
  lastConnected?: number
  lastError?: string
}

export interface MCPServerCapabilities {
  tools?: boolean
  resources?: boolean
  prompts?: boolean
}

export interface MCPTool {
  name: string
  description?: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export interface MCPResource {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export interface MCPPrompt {
  name: string
  description?: string
  arguments?: {
    name: string
    description?: string
    required?: boolean
  }[]
}

export interface MCPToolCallResult {
  content: MCPToolResultContent[]
  isError?: boolean
}

export type MCPToolResultContent = 
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType?: string }
  | { type: 'resource'; resource: MCPResource }

export interface MCPClientOptions {
  name?: string
  timeout?: number
  onToolCall?: (tool: string, args: Record<string, unknown>) => Promise<MCPToolCallResult>
  onProgress?: (message: string) => void
}

export type MCPTransport = 
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> }
  | { type: 'ws'; url: string; headers?: Record<string, string> }
  | { type: 'sdk'; name: string }
