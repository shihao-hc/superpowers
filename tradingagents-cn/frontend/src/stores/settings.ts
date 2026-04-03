import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface UserSettings {
  llmProvider: string
  deepseekModel: string
  openaiModel: string
  dashscopeModel: string
  riskPreference: string
  maxPosition: number
  enableCache: boolean
  cacheTtl: number
  enableDebate: boolean
  maxDebateRounds: number
  alertEnabled: boolean
  dingtalkWebhook: string
  wechatWebhook: string
}

export interface ThemeSettings {
  mode: 'light' | 'dark' | 'auto'
  primaryColor: string
  compactMode: boolean
}

const STORAGE_KEY = 'tradingagents_settings'
const THEME_KEY = 'tradingagents_theme'

const DEFAULT_SETTINGS: UserSettings = {
  llmProvider: 'deepseek',
  deepseekModel: 'deepseek-chat',
  openaiModel: 'gpt-4o',
  dashscopeModel: 'qwen-plus',
  riskPreference: 'moderate',
  maxPosition: 10,
  enableCache: true,
  cacheTtl: 3600,
  enableDebate: true,
  maxDebateRounds: 2,
  alertEnabled: false,
  dingtalkWebhook: '',
  wechatWebhook: '',
}

const DEFAULT_THEME: ThemeSettings = {
  mode: 'light',
  primaryColor: '#409EFF',
  compactMode: false,
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<UserSettings>(loadSettings())
  const theme = ref<ThemeSettings>(loadTheme())
  const isLoaded = ref(false)
  const isDirty = ref(false)

  function loadSettings(): UserSettings {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
    return { ...DEFAULT_SETTINGS }
  }

  function loadTheme(): ThemeSettings {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved) {
        return { ...DEFAULT_THEME, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.error('Failed to load theme:', e)
    }
    return { ...DEFAULT_THEME }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
      isDirty.value = false
    } catch (e) {
      console.error('Failed to save settings:', e)
    }
  }

  function saveTheme() {
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(theme.value))
      applyTheme()
    } catch (e) {
      console.error('Failed to save theme:', e)
    }
  }

  function resetSettings() {
    settings.value = { ...DEFAULT_SETTINGS }
    saveSettings()
  }

  function resetTheme() {
    theme.value = { ...DEFAULT_THEME }
    saveTheme()
  }

  function updateSettings(partial: Partial<UserSettings>) {
    settings.value = { ...settings.value, ...partial }
    isDirty.value = true
  }

  function updateTheme(partial: Partial<ThemeSettings>) {
    theme.value = { ...theme.value, ...partial }
    saveTheme()
  }

  function applyTheme() {
    const root = document.documentElement
    if (theme.value.mode === 'dark') {
      root.classList.add('dark')
    } else if (theme.value.mode === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
    } else {
      root.classList.remove('dark')
    }
    root.style.setProperty('--el-color-primary', theme.value.primaryColor)
    if (theme.value.compactMode) {
      root.classList.add('compact')
    } else {
      root.classList.remove('compact')
    }
  }

  function markLoaded() {
    isLoaded.value = true
  }

  function initialize() {
    applyTheme()
    markLoaded()
  }

  watch(settings, () => {
    if (isLoaded.value) {
      isDirty.value = true
    }
  }, { deep: true })

  return {
    settings,
    theme,
    isLoaded,
    isDirty,
    saveSettings,
    saveTheme,
    resetSettings,
    resetTheme,
    updateSettings,
    updateTheme,
    applyTheme,
    initialize,
  }
})
