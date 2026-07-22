import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { toError } from './errors.js'
import { log, error as logError } from './log.js'

export interface OpenCodeConfig {
  model?: string
  temperature?: number
  maxTokens?: number
  permissions?: 'default' | 'plan' | 'bypassPermissions' | 'yolo'
  theme?: 'dark' | 'light' | 'auto'
  verbose?: boolean
  apiKey?: string
  mcpServers?: Record<string, MCPServerConfig>
  plugins?: {
    enabled: string[]
    disabled: string[]
  }
  skills?: {
    paths: string[]
    autoLoad: boolean
  }
  env?: Record<string, string>
  compact?: {
    enabled: boolean
    threshold: number
  }
}

export interface MCPServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

const DEFAULT_CONFIG: OpenCodeConfig = {
  model: undefined,
  temperature: 0.7,
  maxTokens: undefined,
  permissions: 'default',
  theme: 'auto',
  verbose: false,
  mcpServers: {},
  plugins: {
    enabled: [],
    disabled: [],
  },
  skills: {
    paths: [],
    autoLoad: true,
  },
  compact: {
    enabled: true,
    threshold: 100000,
  },
}

let globalConfig: OpenCodeConfig | null = null
let configPath: string | null = null

export function getConfigDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.'
  return join(home, '.opencode')
}

export function getConfigPath(): string {
  if (configPath) return configPath
  return join(getConfigDir(), 'config.json')
}

export function getDefaultConfig(): OpenCodeConfig {
  return { ...DEFAULT_CONFIG }
}

function ensureConfigDir(): void {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function loadConfig(): OpenCodeConfig {
  if (globalConfig) return globalConfig

  const path = getConfigPath()
  ensureConfigDir()

  try {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(content)
      globalConfig = { ...DEFAULT_CONFIG, ...parsed }
      log(`Loaded config from ${path}`, 'debug')
    } else {
      globalConfig = getDefaultConfig()
      saveConfig(globalConfig)
      log(`Created default config at ${path}`, 'info')
    }
  } catch (e) {
    logError(`Failed to load config: ${toError(e).message}`)
    globalConfig = getDefaultConfig()
  }

  return globalConfig!
}

export function saveConfig(config: OpenCodeConfig): void {
  const path = getConfigPath()
  ensureConfigDir()

  try {
    const content = JSON.stringify(config, null, 2)
    writeFileSync(path, content, 'utf-8')
    globalConfig = config
    log(`Saved config to ${path}`, 'debug')
  } catch (e) {
    logError(`Failed to save config: ${toError(e).message}`)
    throw e
  }
}

export function getGlobalConfig(): OpenCodeConfig {
  return loadConfig()
}

export function updateConfig(updates: Partial<OpenCodeConfig>): OpenCodeConfig {
  const current = loadConfig()
  const updated = { ...current, ...updates }
  saveConfig(updated)
  return updated
}

export function resetConfig(): OpenCodeConfig {
  const config = getDefaultConfig()
  saveConfig(config)
  return config
}

export function mergeConfig(
  base: OpenCodeConfig,
  overrides: Partial<OpenCodeConfig>,
): OpenCodeConfig {
  const result = { ...base }

  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key as keyof OpenCodeConfig] = {
        ...(result[key as keyof OpenCodeConfig] as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      } as any
    } else if (value !== undefined) {
      (result as any)[key] = value
    }
  }

  return result
}

export function getProjectConfig(projectPath: string): OpenCodeConfig | null {
  const projectConfigPath = join(projectPath, '.opencode.json')
  
  if (!existsSync(projectConfigPath)) {
    return null
  }

  try {
    const content = readFileSync(projectConfigPath, 'utf-8')
    return JSON.parse(content)
  } catch (e) {
    logError(`Failed to load project config: ${toError(e).message}`)
    return null
  }
}

export function setProjectConfig(
  projectPath: string,
  config: Partial<OpenCodeConfig>,
): void {
  const projectConfigPath = join(projectPath, '.opencode.json')
  const existing = getProjectConfig(projectPath) || {}
  const merged = mergeConfig(existing, config)
  writeFileSync(projectConfigPath, JSON.stringify(merged, null, 2), 'utf-8')
}

export function clearGlobalConfig(): void {
  globalConfig = null
}
