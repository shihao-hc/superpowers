import { ref, computed, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { 
  WebSocketMessage, 
  WebSocketStatusData, 
  WebSocketCompletedData,
  PHASE_LABELS 
} from '@/types'

export interface RealtimeProgressOptions {
  taskId?: string
  autoConnect?: boolean
  onComplete?: (data: any) => void
  onError?: (error: string) => void
  onProgress?: (progress: number) => void
}

const DEFAULT_PHASE_LABELS: Record<string, string> = {
  'data_collection': '数据收集',
  'data-collection': '数据收集',
  'analysis': '专家分析',
  'expert_analysis': '专家分析',
  'debate': '辩论决策',
  'debate_decision': '辩论决策',
  'risk_assessment': '风险评估',
  'risk-evaluation': '风险评估',
  'trading_plan': '交易计划',
  'completed': '已完成',
  'running': '分析中',
}

export function useRealtimeProgress(options: RealtimeProgressOptions = {}) {
  const progress = ref(0)
  const phase = ref('')
  const phaseLabel = ref('')
  const status = ref<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')
  const message = ref('')
  const result = ref<any>(null)
  const error = ref<string | null>(null)
  const ws = ref<WebSocket | null>(null)
  const currentTaskId = ref<string | null>(options.taskId || null)

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  const maxReconnectAttempts = 3

  const isConnected = computed(() => status.value === 'connected')
  const isAnalyzing = computed(() => 
    status.value === 'connected' && progress.value > 0 && progress.value < 1
  )
  const progressPercentage = computed(() => Math.round(progress.value * 100))

  const getPhaseLabel = (key: string): string => {
    return DEFAULT_PHASE_LABELS[key] || key || '分析中'
  }

  const updatePhaseFromProgress = (progressVal: number) => {
    if (progressVal >= 1) {
      phase.value = 'completed'
      phaseLabel.value = '已完成'
    } else if (progressVal >= 0.75) {
      phase.value = 'risk_assessment'
      phaseLabel.value = '风险评估'
    } else if (progressVal >= 0.5) {
      phase.value = 'debate'
      phaseLabel.value = '辩论决策'
    } else if (progressVal >= 0.25) {
      phase.value = 'analysis'
      phaseLabel.value = '专家分析'
    } else {
      phase.value = 'data_collection'
      phaseLabel.value = '数据收集'
    }
  }

  const connect = (taskId: string) => {
    if (ws.value) {
      disconnect()
    }

    const safeId = taskId.replace(/[^a-zA-Z0-9-_]/g, '')
    currentTaskId.value = safeId
    status.value = 'connecting'
    error.value = null

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/${safeId}`
    
    try {
      ws.value = new WebSocket(url)

      ws.value.onopen = () => {
        status.value = 'connected'
        reconnectAttempts = 0
        message.value = '已连接到实时分析'
      }

      ws.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleMessage(data)
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }

      ws.value.onerror = () => {
        status.value = 'error'
        error.value = '连接失败'
        attemptReconnect()
      }

      ws.value.onclose = (e) => {
        if (e.code !== 1000) {
          status.value = 'disconnected'
          attemptReconnect()
        } else {
          status.value = 'disconnected'
        }
      }
    } catch (e) {
      status.value = 'error'
      error.value = '创建连接失败'
    }
  }

  const handleMessage = (msg: WebSocketMessage) => {
    switch (msg.type) {
      case 'status':
        const statusData = msg.data as WebSocketStatusData
        if (statusData) {
          progress.value = statusData.progress || 0
          if (statusData.phase) {
            phase.value = statusData.phase
            phaseLabel.value = getPhaseLabel(statusData.phase)
          } else {
            updatePhaseFromProgress(statusData.progress || 0)
          }
          message.value = statusData.message || phaseLabel.value
        }
        options.onProgress?.(progress.value)
        break

      case 'report':
        message.value = '生成分析报告中...'
        phaseLabel.value = '生成报告'
        break

      case 'completed':
        const completedData = msg.data as WebSocketCompletedData
        progress.value = 1
        phase.value = 'completed'
        phaseLabel.value = '已完成'
        message.value = '分析完成'
        result.value = completedData?.response || msg.data
        status.value = 'connected'
        ElMessage.success('分析完成！')
        options.onComplete?.(result.value)
        break

      case 'error':
        error.value = msg.error || '未知错误'
        phaseLabel.value = '出错了'
        status.value = 'error'
        ElMessage.error(msg.error || '分析失败')
        options.onError?.(error.value)
        break

      case 'websocket_connected':
        console.log('WebSocket connected:', msg)
        break

      case 'pong':
        break

      default:
        console.log('Unknown message type:', msg.type)
    }
  }

  const attemptReconnect = () => {
    if (reconnectAttempts < maxReconnectAttempts && currentTaskId.value) {
      reconnectAttempts++
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000)
      message.value = `${Math.round(delay / 1000)}秒后重连...`
      reconnectTimer = setTimeout(() => {
        if (currentTaskId.value && status.value !== 'connected') {
          connect(currentTaskId.value)
        }
      }, delay)
    }
  }

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws.value) {
      ws.value.close(1000)
      ws.value = null
    }
    status.value = 'disconnected'
  }

  const reset = () => {
    disconnect()
    progress.value = 0
    phase.value = ''
    message.value = ''
    result.value = null
    error.value = null
    currentTaskId.value = null
    reconnectAttempts = 0
  }

  let pingTimer: ReturnType<typeof setInterval> | null = null
  const PING_INTERVAL = 30000

  const startPing = () => {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      if (ws.value && ws.value.readyState === WebSocket.OPEN) {
        ws.value.send(JSON.stringify({ type: 'ping' }))
      }
    }, PING_INTERVAL)
  }

  const stopPing = () => {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    progress,
    phase,
    phaseLabel,
    status,
    message,
    result,
    error,
    isConnected,
    isAnalyzing,
    progressPercentage,
    connect,
    disconnect,
    reset,
    getPhaseLabel,
  }
}
