import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AnalysisResponse, WebSocketMessage } from '@/types'

export interface TaskState {
  taskId: string
  company: string
  tradeDate: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  createdAt: string
  completedAt?: string
  error?: string
  response?: AnalysisResponse
}

export const useTaskStore = defineStore('task', () => {
  const currentTask = ref<TaskState | null>(null)
  const taskHistory = ref<TaskState[]>([])
  const wsConnection = ref<{ connected: boolean; taskId: string | null }>({
    connected: false,
    taskId: null,
  })
  const ws = ref<WebSocket | null>(null)

  const isAnalyzing = computed(() => {
    return currentTask.value?.status === 'pending' || currentTask.value?.status === 'running'
  })

  const progressPercentage = computed(() => {
    if (!currentTask.value) return 0
    return Math.round(currentTask.value.progress * 100)
  })

  const phaseInfo = computed(() => {
    const progress = progressPercentage.value
    if (progress >= 100) return { phase: 'completed', label: '已完成' }
    if (progress >= 75) return { phase: 'risk_assessment', label: '风险评估' }
    if (progress >= 50) return { phase: 'debate', label: '辩论决策' }
    if (progress >= 25) return { phase: 'analysis', label: '专家分析' }
    return { phase: 'data_collection', label: '数据收集' }
  })

  function createTask(company: string, tradeDate?: string): TaskState {
    const now = new Date().toISOString()
    return {
      taskId: '',
      company,
      tradeDate: tradeDate || now.split('T')[0],
      status: 'pending',
      progress: 0,
      createdAt: now,
    }
  }

  function setCurrentTask(task: TaskState | null) {
    currentTask.value = task
  }

  function updateProgress(progress: number) {
    if (currentTask.value) {
      currentTask.value.progress = Math.min(progress, 1)
    }
  }

  function updateStatus(status: TaskState['status']) {
    if (currentTask.value) {
      currentTask.value.status = status
      if (status === 'completed' || status === 'failed') {
        currentTask.value.completedAt = new Date().toISOString()
      }
    }
  }

  function setError(error: string) {
    if (currentTask.value) {
      currentTask.value.status = 'failed'
      currentTask.value.error = error
      currentTask.value.completedAt = new Date().toISOString()
    }
  }

  function connectWebSocket(taskId: string) {
    disconnectWebSocket()
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws.value = new WebSocket(`${protocol}//${window.location.host}/ws/${taskId}`)
    wsConnection.value = { connected: true, taskId }

    ws.value.onopen = () => {
      console.log('WebSocket connected')
    }

    ws.value.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        handleWebSocketMessage(message)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    ws.value.onerror = (error) => {
      console.error('WebSocket error:', error)
      setError('WebSocket 连接失败')
    }

    ws.value.onclose = () => {
      wsConnection.value = { connected: false, taskId: null }
    }
  }

  function disconnectWebSocket() {
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    wsConnection.value = { connected: false, taskId: null }
  }

  function handleWebSocketMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'status':
        updateProgress(message.data?.progress || 0)
        break

      case 'completed':
        if (currentTask.value && message.data?.response) {
          currentTask.value.response = message.data.response as AnalysisResponse
          currentTask.value.progress = 1
          currentTask.value.status = 'completed'
          currentTask.value.completedAt = new Date().toISOString()
          addToHistory(currentTask.value)
        }
        break

      case 'error':
        setError(message.error || '未知错误')
        break
    }
  }

  function addToHistory(task: TaskState) {
    const existing = taskHistory.value.findIndex(t => t.taskId === task.taskId)
    if (existing >= 0) {
      taskHistory.value[existing] = { ...task }
    } else {
      taskHistory.value.unshift({ ...task })
    }
    if (taskHistory.value.length > 50) {
      taskHistory.value.pop()
    }
  }

  function loadHistory() {
    return taskHistory.value
  }

  function clearHistory() {
    taskHistory.value = []
  }

  return {
    currentTask,
    taskHistory,
    wsConnection,
    isAnalyzing,
    progressPercentage,
    phaseInfo,
    createTask,
    setCurrentTask,
    updateProgress,
    updateStatus,
    setError,
    connectWebSocket,
    disconnectWebSocket,
    handleWebSocketMessage,
    addToHistory,
    loadHistory,
    clearHistory,
  }
})
