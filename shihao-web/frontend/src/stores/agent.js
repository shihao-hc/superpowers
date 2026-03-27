import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { agentAPI } from '../api'

export const useAgentStore = defineStore('agent', () => {
  // State - Agent状态
  const status = ref('inactive')
  const memoryBlocks = ref([])
  const coreMemory = ref({
    persona: '',
    risk_profile: '',
    user_preferences: ''
  })
  const llmProvider = ref('')
  const llmModel = ref('')
  
  // State - 记忆搜索
  const searchResults = ref([])
  const searchLoading = ref(false)
  
  // State - 分析任务
  const analysisTasks = ref([])
  const analysisLoading = ref(false)
  
  // State - 调度任务
  const schedulerJobs = ref([])
  const schedulerRunning = ref(false)
  
  // State - 通知
  const notifications = ref([])
  
  // State - 连接状态
  const connected = ref(false)
  const wsConnection = ref(null)
  
  // Getters
  const isActive = computed(() => status.value === 'active')
  const hasMemory = computed(() => coreMemory.value.persona.length > 0)
  
  // Actions - 获取Agent状态
  async function fetchStatus() {
    try {
      const data = await agentAPI.getStatus()
      status.value = data.status
      memoryBlocks.value = data.memory_blocks
      llmProvider.value = data.llm_provider
      llmModel.value = data.llm_model
      return data
    } catch (error) {
      console.error('Failed to fetch agent status:', error)
      throw error
    }
  }
  
  // Actions - 获取核心记忆
  async function fetchCoreMemory() {
    try {
      const data = await agentAPI.getCoreMemory()
      coreMemory.value = {
        persona: data.blocks.persona?.value || '',
        risk_profile: data.blocks.risk_profile?.value || '',
        user_preferences: data.blocks.user_preferences?.value || ''
      }
      return data
    } catch (error) {
      console.error('Failed to fetch core memory:', error)
      throw error
    }
  }
  
  // Actions - 更新核心记忆
  async function updateCoreMemory(block, value) {
    try {
      const result = await agentAPI.updateCoreMemory(block, value)
      if (result.status === 'success') {
        coreMemory.value[block] = value
      }
      return result
    } catch (error) {
      console.error('Failed to update core memory:', error)
      throw error
    }
  }
  
  // Actions - 搜索记忆
  async function searchMemory(query, userId = 'user') {
    searchLoading.value = true
    try {
      const data = await agentAPI.searchMemory(query, userId)
      searchResults.value = data.results
      return data
    } catch (error) {
      console.error('Failed to search memory:', error)
      throw error
    } finally {
      searchLoading.value = false
    }
  }
  
  // Actions - 触发分析
  async function triggerAnalysis(tickers, context = null) {
    analysisLoading.value = true
    try {
      const data = await agentAPI.analyze(tickers, context)
      analysisTasks.value.push({
        id: Date.now(),
        tickers,
        status: data.status,
        message: data.message,
        result: data.result,
        timestamp: new Date()
      })
      return data
    } catch (error) {
      console.error('Failed to trigger analysis:', error)
      throw error
    } finally {
      analysisLoading.value = false
    }
  }
  
  // Actions - 发送通知
  async function sendNotification(title, content, priority = 'normal') {
    try {
      const data = await agentAPI.sendNotification(title, content, priority)
      notifications.value.push({
        id: Date.now(),
        title,
        content,
        priority,
        status: data.status,
        timestamp: new Date()
      })
      return data
    } catch (error) {
      console.error('Failed to send notification:', error)
      throw error
    }
  }
  
  // Actions - WebSocket连接
  function connectWebSocket() {
    if (wsConnection.value) {
      return
    }
    
    const wsUrl = `ws://${window.location.host}/ws/agent`
    
    try {
      wsConnection.value = new WebSocket(wsUrl)
      
      wsConnection.value.onopen = () => {
        connected.value = true
        console.log('[Agent] WebSocket connected')
      }
      
      wsConnection.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWsMessage(data)
        } catch (e) {
          console.error('[Agent] Failed to parse WS message:', e)
        }
      }
      
      wsConnection.value.onclose = () => {
        connected.value = false
        wsConnection.value = null
        console.log('[Agent] WebSocket disconnected')
      }
      
      wsConnection.value.onerror = (error) => {
        console.error('[Agent] WebSocket error:', error)
      }
    } catch (error) {
      console.error('[Agent] Failed to connect WebSocket:', error)
    }
  }
  
  // Actions - 断开WebSocket
  function disconnectWebSocket() {
    if (wsConnection.value) {
      wsConnection.value.close()
      wsConnection.value = null
      connected.value = false
    }
  }
  
  // 处理WebSocket消息
  function handleWsMessage(data) {
    switch (data.type) {
      case 'status_update':
        status.value = data.status
        break
      case 'memory_update':
        fetchCoreMemory()
        break
      case 'analysis_complete':
        const task = analysisTasks.value.find(t => t.id === data.taskId)
        if (task) {
          task.status = 'completed'
          task.result = data.result
        }
        break
      case 'notification':
        notifications.value.unshift(data.notification)
        break
    }
  }
  
  // Actions - 初始化
  async function initialize() {
    await fetchStatus()
    await fetchCoreMemory()
    connectWebSocket()
  }
  
  // Actions - 清理
  function cleanup() {
    disconnectWebSocket()
    analysisTasks.value = []
    notifications.value = []
  }
  
  return {
    // State
    status,
    memoryBlocks,
    coreMemory,
    llmProvider,
    llmModel,
    searchResults,
    searchLoading,
    analysisTasks,
    analysisLoading,
    schedulerJobs,
    schedulerRunning,
    notifications,
    connected,
    
    // Getters
    isActive,
    hasMemory,
    
    // Actions
    fetchStatus,
    fetchCoreMemory,
    updateCoreMemory,
    searchMemory,
    triggerAnalysis,
    sendNotification,
    connectWebSocket,
    disconnectWebSocket,
    initialize,
    cleanup
  }
})