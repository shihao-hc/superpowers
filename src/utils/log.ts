export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
  context?: Record<string, unknown>
}

type Listener = (entry: LogEntry) => void

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const MAX_IN_MEMORY_LOGS = 1000
let inMemoryLogs: LogEntry[] = []
let errorLog: Array<{ error: string; timestamp: string }> = []
let errorLogSink: ErrorLogSink | null = null
const listeners = new Set<Listener>()
let minLogLevel: LogLevel = 'info'

export interface ErrorLogSink {
  logError: (error: Error) => void
  getErrorsPath: () => string
}

export function setMinLogLevel(level: LogLevel): void {
  minLogLevel = level
}

export function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLogLevel]
}

function addToMemory(entry: LogEntry): void {
  inMemoryLogs.push(entry)
  if (inMemoryLogs.length > MAX_IN_MEMORY_LOGS) {
    inMemoryLogs.shift()
  }

  if (entry.level === 'error') {
    errorLog.push({
      error: entry.message,
      timestamp: new Date(entry.timestamp).toISOString(),
    })
    if (errorLog.length > MAX_IN_MEMORY_LOGS) {
      errorLog.shift()
    }
  }

  for (const listener of listeners) {
    listener(entry)
  }
}

export function log(
  message: string,
  level: LogLevel = 'info',
  context?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    level,
    message,
    timestamp: Date.now(),
    context,
  }

  addToMemory(entry)

  const levelStr = level.toUpperCase().padEnd(5)
  const time = new Date(entry.timestamp).toISOString()

  if (process.env.NODE_ENV !== 'test') {
    const output = context
      ? `${time} [${levelStr}] ${message} ${JSON.stringify(context)}`
      : `${time} [${levelStr}] ${message}`

    switch (level) {
      case 'error':
        console.error(output)
        break
      case 'warn':
        console.warn(output)
        break
      default:
        console.log(output)
    }
  }
}

export function debug(message: string, context?: Record<string, unknown>): void {
  log(message, 'debug', context)
}

export function info(message: string, context?: Record<string, unknown>): void {
  log(message, 'info', context)
}

export function warn(message: string, context?: Record<string, unknown>): void {
  log(message, 'warn', context)
}

export function error(
  message: string | Error,
  context?: Record<string, unknown>,
): void {
  const errorObj = message instanceof Error ? message : new Error(message)
  const entry: LogEntry = {
    level: 'error',
    message: errorObj.stack || errorObj.message,
    timestamp: Date.now(),
    context,
  }

  addToMemory(entry)

  if (errorLogSink) {
    errorLogSink.logError(errorObj)
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error(errorObj.stack || errorObj.message)
  }
}

export function getInMemoryLogs(level?: LogLevel): LogEntry[] {
  if (level) {
    return inMemoryLogs.filter(log => log.level === level)
  }
  return [...inMemoryLogs]
}

export function getInMemoryErrors(): { error: string; timestamp: string }[] {
  return [...errorLog]
}

export function clearInMemoryLogs(): void {
  inMemoryLogs = []
}

export function clearInMemoryErrors(): void {
  errorLog = []
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function attachErrorLogSink(sink: ErrorLogSink): void {
  errorLogSink = sink
}

export function logError(err: unknown): void {
  error(toError(err))
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}
