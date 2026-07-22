export class ClaudeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class AbortError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'AbortError'
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    e instanceof AbortError ||
    (e instanceof Error && e.name === 'AbortError')
  )
}

export class ConfigParseError extends Error {
  filePath: string
  defaultConfig: unknown

  constructor(message: string, filePath: string, defaultConfig: unknown) {
    super(message)
    this.name = 'ConfigParseError'
    this.filePath = filePath
    this.defaultConfig = defaultConfig
  }
}

export class ShellError extends Error {
  constructor(
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly code: number,
    public readonly interrupted: boolean,
  ) {
    super('Shell command failed')
    this.name = 'ShellError'
  }
}

export class TelemetrySafeError extends Error {
  readonly telemetryMessage: string

  constructor(message: string, telemetryMessage?: string) {
    super(message)
    this.name = 'TelemetrySafeError'
    this.telemetryMessage = telemetryMessage ?? message
  }
}

export function hasExactErrorMessage(error: unknown, message: string): boolean {
  return error instanceof Error && error.message === message
}

export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function getErrnoCode(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'code' in e && typeof e.code === 'string') {
    return e.code
  }
  return undefined
}

export function isENOENT(e: unknown): boolean {
  return getErrnoCode(e) === 'ENOENT'
}

export function getErrnoPath(e: unknown): string | undefined {
  if (e && typeof e === 'object' && 'path' in e && typeof e.path === 'string') {
    return e.path
  }
  return undefined
}

export function shortErrorStack(e: unknown, maxFrames = 5): string {
  if (!(e instanceof Error)) return String(e)
  if (!e.stack) return e.message
  const lines = e.stack.split('\n')
  const header = lines[0] ?? e.message
  const frames = lines.slice(1).filter(l => l.trim().startsWith('at '))
  if (frames.length <= maxFrames) return e.stack
  return [header, ...frames.slice(0, maxFrames)].join('\n')
}

export function isFsInaccessible(e: unknown): e is NodeJS.ErrnoException {
  const code = getErrnoCode(e)
  return (
    code === 'ENOENT' ||
    code === 'EACCES' ||
    code === 'EPERM' ||
    code === 'ENOTDIR' ||
    code === 'ELOOP'
  )
}

export class ToolExecutionError extends Error {
  toolName: string
  toolInput?: Record<string, unknown>

  constructor(message: string, toolName: string, toolInput?: Record<string, unknown>) {
    super(message)
    this.name = 'ToolExecutionError'
    this.toolName = toolName
    this.toolInput = toolInput
  }
}

export class PermissionDeniedError extends Error {
  toolName: string

  constructor(toolName: string) {
    super(`Permission denied for tool: ${toolName}`)
    this.name = 'PermissionDeniedError'
    this.toolName = toolName
  }
}

export class SessionNotFoundError extends Error {
  sessionId: string

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`)
    this.name = 'SessionNotFoundError'
    this.sessionId = sessionId
  }
}

export class MCPServerError extends Error {
  serverName: string

  constructor(message: string, serverName: string) {
    super(message)
    this.name = 'MCPServerError'
    this.serverName = serverName
  }
}
