/**
 * TradingAgents-CN WebSocket Composable
 * Manages WebSocket connections for real-time task progress
 */

import { ref, onUnmounted, computed } from 'vue'

export interface TaskProgress {
  taskId: string
  progress: number
  status: string
  message: string
  phase: string
  result: any | null
  error: string | null
}

export interface WebSocketOptions {
  autoReconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
  pingInterval?: number
}

const DEFAULT_OPTIONS: WebSocketOptions = {
  autoReconnect: true,
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
  pingInterval: 30000,
}

export function useTaskProgress(initialTaskId: string = '', options: WebSocketOptions = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options }
  
  const taskId = ref(initialTaskId)
  const progress = ref(0)
  const status = ref<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')
  const message = ref('')
  const phase = ref('')
  const result = ref<any | null>(null)
  const error = ref<string | null>(null)
  const ws = ref<WebSocket | null>(null)
  
  let reconnectAttempts = 0
  let pingTimer: ReturnType<typeof setInterval> | null = null

  const isConnected = computed(() => status.value === 'connected')
  const isLoading = computed(() => status.value === 'connecting' || status.value === 'connected')

  const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws/${taskId.value}`
  }

  const handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)
      
      switch (data.type) {
        case 'status':
          progress.value = (data.data?.progress || 0) * 100
          status.value = 'connected'
          message.value = data.data?.message || ''
          phase.value = data.data?.phase || ''
          break
          
        case 'completed':
          progress.value = 100
          status.value = 'connected'
          message.value = '任务完成'
          result.value = data.data?.response || data.data
          break
          
        case 'error':
          status.value = 'error'
          error.value = data.error || '未知错误'
          message.value = '发生错误'
          break
          
        case 'pong':
          // Heartbeat response
          break
          
        default:
          console.log('Unknown message type:', data.type)
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e)
    }
  }

  const startPing = () => {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      if (ws.value && ws.value.readyState === WebSocket.OPEN) {
        ws.value.send(JSON.stringify({ type: 'ping' }))
      }
    }, config.pingInterval)
  }

  const stopPing = () => {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  const connect = (newTaskId?: string) => {
    if (newTaskId) {
      taskId.value = newTaskId
    }
    
    if (!taskId.value) {
      error.value = 'Task ID is required'
      return
    }

    // Close existing connection
    disconnect()

    status.value = 'connecting'
    error.value = null

    try {
      ws.value = new WebSocket(getWebSocketUrl())
      
      ws.value.onopen = () => {
        status.value = 'connected'
        reconnectAttempts = 0
        startPing()
        console.log('WebSocket connected for task:', taskId.value)
      }

      ws.value.onmessage = handleMessage

      ws.value.onerror = (e) => {
        console.error('WebSocket error:', e)
        status.value = 'error'
        error.value = '连接失败'
      }

      ws.value.onclose = (e) => {
        status.value = 'disconnected'
        stopPing()
        console.log('WebSocket closed:', e.code, e.reason)
        
        // Auto reconnect
        if (config.autoReconnect && reconnectAttempts < (config.maxReconnectAttempts || 5)) {
          reconnectAttempts++
          setTimeout(() => {
            if (status.value === 'disconnected') {
              console.log(`Reconnecting... (${reconnectAttempts}/${config.maxReconnectAttempts})`)
              connect()
            }
          }, config.reconnectInterval)
        }
      }
    } catch (e) {
      status.value = 'error'
      error.value = '创建连接失败'
      console.error('WebSocket connection error:', e)
    }
  }

  const disconnect = () => {
    stopPing()
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
    status.value = 'disconnected'
  }

  const reset = () => {
    disconnect()
    taskId.value = ''
    progress.value = 0
    status.value = 'idle'
    message.value = ''
    phase.value = ''
    result.value = null
    error.value = null
    reconnectAttempts = 0
  }

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    // State
    taskId,
    progress,
    status,
    message,
    phase,
    result,
    error,
    
    // Computed
    isConnected,
    isLoading,
    
    // Methods
    connect,
    disconnect,
    reset,
  }
}

/**
 * Composable for multiple task progress tracking
 */
export function useMultiTaskProgress() {
  const tasks = ref<Map<string, TaskProgress>>(new Map())

  const addTask = (taskId: string) => {
    tasks.value.set(taskId, {
      taskId,
      progress: 0,
      status: 'idle',
      message: '',
      phase: '',
      result: null,
      error: null,
    })
  }

  const removeTask = (taskId: string) => {
    tasks.value.delete(taskId)
  }

  const getTask = (taskId: string) => {
    return tasks.value.get(taskId)
  }

  const updateTask = (taskId: string, update: Partial<TaskProgress>) => {
    const task = tasks.value.get(taskId)
    if (task) {
      Object.assign(task, update)
    }
  }

  const getActiveTasks = () => {
    return Array.from(tasks.value.values()).filter(
      t => t.status === 'connecting' || t.status === 'connected'
    )
  }

  return {
    tasks,
    addTask,
    removeTask,
    getTask,
    updateTask,
    getActiveTasks,
  }
}
