<template>
  <div class="unified-ai-view">
    <!-- Header -->
    <div class="unified-header">
      <div class="header-content">
        <div class="header-left">
          <h1>🤖 AI 投资助手</h1>
          <p>一站式股票分析、投资咨询、智能决策</p>
        </div>
        <div class="header-right">
          <div class="history-actions">
            <el-button @click="startNewSession" plain>
              <el-icon><Refresh /></el-icon>
              新对话
            </el-button>
            <el-button @click="showHistoryDialog = true">
              <el-icon><ChatLineSquare /></el-icon>
              历史记录
            </el-button>
            <el-button @click="showSettingsDialog = true">
              <el-icon><Setting /></el-icon>
              设置
            </el-button>
            <el-button @click="syncHistoryToCloud" plain>
              ☁️ 同步
            </el-button>
          </div>
          <div class="agent-status">
            <span class="status-dot" :class="agentStatus"></span>
            <span class="status-text">{{ agentStatusText }}</span>
          </div>
          <el-button type="primary" @click="refreshAgentStatus" :loading="refreshingStatus">
            <el-icon><Refresh /></el-icon>
            刷新状态
          </el-button>
        </div>
      </div>
      
      <!-- Market Ticker -->
      <div class="market-ticker" v-if="marketData && marketData.indices">
        <div class="ticker-item" v-for="index in marketData.indices" :key="index.name">
          <span class="ticker-name">{{ index.name }}</span>
          <span class="ticker-value">{{ index.value.toFixed(2) }}</span>
          <span class="ticker-change" :class="index.change >= 0 ? 'positive' : 'negative'">
            {{ index.change >= 0 ? '+' : '' }}{{ index.change.toFixed(2) }}%
          </span>
        </div>
      </div>
    </div>

    <!-- History Dialog -->
    <el-dialog 
      v-model="showHistoryDialog" 
      title="对话历史" 
      width="500px"
      :close-on-click-modal="true"
    >
      <div class="history-list" v-if="chatHistory.length > 0">
        <div 
          class="history-item" 
          v-for="session in chatHistory" 
          :key="session.id"
          @click="loadSession(session)"
        >
          <div class="history-item-content">
            <div class="history-title">{{ session.title }}</div>
            <div class="history-meta">
              <span class="history-messages">{{ session.messageCount }} 条消息</span>
              <span class="history-time">{{ formatHistoryDate(session.timestamp) }}</span>
            </div>
          </div>
          <el-button 
            type="danger" 
            text 
            @click.stop="deleteSession(session.id)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
      <div class="history-empty" v-else>
        <p>暂无历史记录</p>
        <p class="hint">开始对话后，记录将自动保存</p>
      </div>
      <template #footer>
        <el-button @click="clearAllHistory" type="danger" plain :disabled="chatHistory.length === 0">
          清空历史
        </el-button>
        <el-button @click="showHistoryDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- Settings Dialog -->
    <el-dialog 
      v-model="showSettingsDialog" 
      title="个性化设置" 
      width="600px"
      :close-on-click-modal="true"
    >
      <div class="settings-content">
        <!-- Analysis Settings -->
        <div class="settings-section">
          <h4>📊 分析设置</h4>
          <div class="setting-item">
            <div class="setting-label">默认分析类型</div>
            <el-select v-model="userSettings.defaultAnalysisType" placeholder="选择分析类型">
              <el-option label="综合分析" value="comprehensive" />
              <el-option label="基本面为主" value="fundamental" />
              <el-option label="技术面为主" value="technical" />
            </el-select>
          </div>
          <div class="setting-item">
            <div class="setting-label">自动分析</div>
            <el-switch v-model="userSettings.autoAnalyze" />
            <div class="setting-hint">输入股票代码时自动开始分析</div>
          </div>
          <div class="setting-item">
            <div class="setting-label">显示投资信号</div>
            <el-switch v-model="userSettings.showSignals" />
            <div class="setting-hint">在分析结果中显示买卖信号</div>
          </div>
        </div>

        <!-- Display Settings -->
        <div class="settings-section">
          <h4>🖥️ 显示设置</h4>
          <div class="setting-item">
            <div class="setting-label">紧凑模式</div>
            <el-switch v-model="userSettings.compactMode" />
            <div class="setting-hint">减小间距，显示更多内容</div>
          </div>
          <div class="setting-item">
            <div class="setting-label">字体大小</div>
            <el-radio-group v-model="userSettings.fontSize">
              <el-radio-button value="small">小</el-radio-button>
              <el-radio-button value="medium">中</el-radio-button>
              <el-radio-button value="large">大</el-radio-button>
            </el-radio-group>
          </div>
          <div class="setting-item">
            <div class="setting-label">消息分组</div>
            <el-switch v-model="userSettings.messageGrouping" />
            <div class="setting-hint">将连续消息合并显示</div>
          </div>
        </div>

        <!-- Notification Settings -->
        <div class="settings-section">
          <h4>🔔 通知设置</h4>
          <div class="setting-item">
            <div class="setting-label">声音提醒</div>
            <el-switch v-model="userSettings.soundEnabled" />
            <div class="setting-hint">收到新消息时播放提示音</div>
          </div>
          <div class="setting-item">
            <div class="setting-label">桌面通知</div>
            <el-switch v-model="userSettings.desktopNotification" />
            <div class="setting-hint">需要浏览器授权</div>
          </div>
          <div class="setting-item">
            <div class="setting-label">价格预警阈值 (%)</div>
            <el-input-number 
              v-model="userSettings.alertThreshold" 
              :min="1" 
              :max="20"
              :step="1"
            />
            <div class="setting-hint">价格波动超过此值时提醒</div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="resetSettings" type="danger" plain>重置默认</el-button>
        <el-button @click="showSettingsDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSettings">保存设置</el-button>
      </template>
    </el-dialog>

    <!-- Main Content -->
    <div class="unified-content">
      <!-- Left: Chat Area -->
      <div class="chat-section">
        <div class="chat-container">
          <!-- Messages -->
          <div class="chat-messages" ref="messagesContainer">
            <div v-if="messages.length === 0" class="welcome-section">
              <div class="welcome-icon">🎯</div>
              <h2>欢迎使用 AI 投资助手</h2>
              <p>我可以帮您分析股票、解答投资疑问、提供市场洞察</p>
              
              <!-- Quick Actions -->
              <div class="quick-actions">
                <div class="action-group">
                  <h4>📊 快速分析</h4>
                  <div class="action-buttons">
                    <el-button 
                      v-for="stock in quickStocks" 
                      :key="stock.symbol"
                      @click="analyzeStock(stock.symbol)"
                      type="primary"
                      plain
                    >
                      {{ stock.name }}
                    </el-button>
                  </div>
                </div>
                
                <div class="action-group">
                  <h4>💬 常见问题</h4>
                  <div class="action-buttons">
                    <el-button 
                      v-for="action in quickQuestions" 
                      :key="action.prompt"
                      @click="sendQuickQuestion(action.prompt)"
                      type="success"
                      plain
                    >
                      {{ action.label }}
                    </el-button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Message List -->
            <div 
              v-for="(msg, index) in messages" 
              :key="index" 
              class="message"
              :class="msg.role"
            >
              <div class="message-avatar">
                <span v-if="msg.role === 'user'">👤</span>
                <span v-else>🤖</span>
              </div>
              <div class="message-content">
                <div class="message-header">
                  <span class="sender-name">{{ msg.role === 'user' ? '您' : 'AI 助手' }}</span>
                  <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
                <div class="message-body" v-html="formatMessage(msg.content)"></div>
                
                <!-- Analysis Results in Message -->
                <div v-if="msg.analysisResult" class="analysis-results">
                  <div class="result-card" v-for="(result, i) in msg.analysisResult" :key="i">
                    <div class="result-header">
                      <span class="result-title">{{ result.title }}</span>
                      <el-tag :type="result.signal === 'BUY' ? 'success' : result.signal === 'SELL' ? 'danger' : 'info'" size="small">
                        {{ result.signal }}
                      </el-tag>
                    </div>
                    <div class="result-content">
                      <p>{{ result.content }}</p>
                    </div>
                    <div class="result-actions">
                      <el-button size="small" @click="viewDetailedAnalysis(result.symbol)">
                        详细分析
                      </el-button>
                      <el-button size="small" type="primary" @click="addToWatchlist(result.symbol)">
                        加入自选
                      </el-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Input Area -->
          <div class="chat-input-area">
            <div class="input-container">
              <div class="input-wrapper">
                <el-input
                  v-model="userInput"
                  type="textarea"
                  :rows="2"
                  placeholder="输入股票代码、问题或指令... (如：分析600519，最近市场怎么样？)"
                  @keyup.enter.exact="sendMessage"
                  :disabled="sending"
                />
                <el-button 
                  class="voice-btn" 
                  :type="isListening ? 'danger' : 'default'"
                  @click="toggleVoiceInput"
                  :disabled="!voiceSupported"
                  circle
                >
                  <el-icon>
                    <Microphone v-if="!isListening" />
                    <VideoPause v-else />
                  </el-icon>
                </el-button>
              </div>
              <div class="input-actions">
                <el-button @click="analyzeCurrentStock" :disabled="!currentStock || sending">
                  分析当前股票
                </el-button>
                <el-button @click="toggleChart" v-if="analysisData">
                  <el-icon><TrendCharts /></el-icon>
                  {{ showChart ? '隐藏图表' : '显示图表' }}
                </el-button>
                <el-button type="primary" @click="sendMessage" :loading="sending" :disabled="!userInput.trim()">
                  发送
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Analysis Panel -->
      <div class="analysis-section">
        <!-- Stock Search -->
        <div class="search-panel">
          <h3>📈 股票分析</h3>
          <div class="search-input">
            <el-input
              v-model="stockSearch"
              placeholder="输入股票代码或名称"
              @keyup.enter="searchStock"
            >
              <template #append>
                <el-button @click="searchStock">搜索</el-button>
              </template>
            </el-input>
          </div>
          
          <!-- Quick Stock Buttons -->
          <div class="quick-stock-buttons">
            <el-button 
              v-for="stock in quickStocks" 
              :key="stock.symbol"
              size="small"
              @click="selectStock(stock)"
              :type="currentStock === stock.symbol ? 'primary' : 'default'"
            >
              {{ stock.name }}
            </el-button>
          </div>
        </div>

        <!-- Analysis Results -->
        <div class="analysis-results-panel" v-if="analysisData">
          <div class="stock-header">
            <h3>{{ analysisData.name }} ({{ analysisData.symbol }})</h3>
            <div class="stock-price">
              ¥{{ analysisData.price }}
              <span :class="analysisData.change >= 0 ? 'positive' : 'negative'">
                {{ analysisData.change >= 0 ? '+' : '' }}{{ analysisData.change }}%
              </span>
            </div>
          </div>

          <!-- Analysis Tabs -->
          <el-tabs v-model="analysisTab" class="analysis-tabs">
            <el-tab-pane label="综合分析" name="overview">
              <div class="analysis-overview">
                <div class="signal-card" :class="analysisData.signal?.toLowerCase()">
                  <div class="signal-title">投资信号</div>
                  <div class="signal-value">{{ analysisData.signal || '中性' }}</div>
                  <div class="signal-confidence">置信度: {{ analysisData.confidence || 0 }}%</div>
                </div>
                
                <div class="analysis-metrics">
                  <div class="metric-item">
                    <div class="metric-label">市盈率</div>
                    <div class="metric-value">{{ analysisData.pe || 'N/A' }}</div>
                  </div>
                  <div class="metric-item">
                    <div class="metric-label">市净率</div>
                    <div class="metric-value">{{ analysisData.pb || 'N/A' }}</div>
                  </div>
                  <div class="metric-item">
                    <div class="metric-label">股息率</div>
                    <div class="metric-value">{{ analysisData.dividendYield || 'N/A' }}%</div>
                  </div>
                </div>
              </div>
            </el-tab-pane>
            
            <el-tab-pane label="基本面" name="fundamental">
              <div class="fundamental-analysis">
                <div class="fund-item" v-for="(value, key) in analysisData.fundamental" :key="key">
                  <div class="fund-label">{{ formatFundamentalLabel(key) }}</div>
                  <div class="fund-value">{{ value }}</div>
                </div>
              </div>
            </el-tab-pane>
            
            <el-tab-pane label="技术面" name="technical">
              <div class="technical-analysis">
                <div class="tech-item" v-for="(value, key) in analysisData.technical" :key="key">
                  <div class="tech-label">{{ formatTechnicalLabel(key) }}</div>
                  <div class="tech-value" :class="getTechnicalTrend(key, value)">{{ value }}</div>
                </div>
              </div>
            </el-tab-pane>
            
            <el-tab-pane label="图表" name="chart">
              <div class="chart-container" v-if="chartData">
                <div class="chart-header">
                  <h4>{{ chartData.title }}</h4>
                </div>
                <div class="chart-placeholder">
                  <div class="chart-bars">
                    <div 
                      v-for="(label, index) in chartData.labels" 
                      :key="index"
                      class="chart-bar-container"
                    >
                      <div 
                        class="chart-bar"
                        :style="{ height: (chartData.datasets[0].data[index] / 2000 * 100) + '%' }"
                      ></div>
                      <span class="chart-label">{{ label }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="chart-empty">
                <p>请先分析一只股票</p>
              </div>
            </el-tab-pane>
          </el-tabs>

          <!-- Action Buttons -->
          <div class="analysis-actions">
            <el-button type="primary" @click="addToConversation">
              添加到对话
            </el-button>
            <el-button @click="exportAnalysis">
              导出报告
            </el-button>
            <el-button type="success" @click="addToWatchlist(currentStock)">
              加入自选
            </el-button>
          </div>
        </div>

        <!-- Agent Status Panel -->
        <div class="agent-status-panel">
          <h3>🤖 Agent 状态</h3>
          <div class="status-grid">
            <div class="status-item">
              <div class="status-label">总负责AI</div>
              <div class="status-value">
                <span class="status-dot active"></span>
                AI投资主管
              </div>
            </div>
            <div class="status-item">
              <div class="status-label">专业Agent</div>
              <div class="status-value">7个在线</div>
            </div>
            <div class="status-item">
              <div class="status-label">工具总数</div>
              <div class="status-value">39个</div>
            </div>
            <div class="status-item">
              <div class="status-label">系统能力</div>
              <div class="status-value">9项启用</div>
            </div>
          </div>
          
          <!-- Agent Quick Actions -->
          <div class="agent-quick-actions">
            <el-button size="small" @click="showAgentPanel">
              查看Agent面板
            </el-button>
            <el-button size="small" @click="showSystemStatus">
              系统状态
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, ChatLineSquare, Delete, Setting, Microphone, VideoPause, TrendCharts } from '@element-plus/icons-vue'
import { searchAPI, analysisAPI, agentAPI, syncAPI } from '../api'
import { chatSocket, marketSocket, agentSocket } from '../services/websocket'

const route = useRoute()
const router = useRouter()

// Refs
const messagesContainer = ref(null)
const userInput = ref('')
const sending = ref(false)
const messages = ref([])
const stockSearch = ref('')
const currentStock = ref('')
const analysisData = ref(null)
const analysisTab = ref('overview')
const agentStatus = ref('active')
const refreshingStatus = ref(false)

// WebSocket state
const wsConnected = ref(false)
const marketData = ref({
  indices: [
    { name: '上证指数', value: 3050.12, change: 0.85 },
    { name: '深证成指', value: 9876.34, change: 1.23 },
    { name: '创业板指', value: 1890.56, change: 2.15 }
  ]
})

// Voice recognition state
const isListening = ref(false)
const voiceSupported = ref(false)
let recognition = null

// Chart state
const showChart = ref(false)
const chartData = ref(null)

// History management
const chatHistory = ref([])
const showHistoryDialog = ref(false)
const currentSessionId = ref('')

// Quick data
const quickStocks = ref([
  { symbol: '600519', name: '贵州茅台' },
  { symbol: '300750', name: '宁德时代' },
  { symbol: '000858', name: '五粮液' },
  { symbol: '601318', name: '中国平安' },
  { symbol: '000001', name: '平安银行' }
])

const quickQuestions = ref([
  { label: '市场分析', prompt: '请分析一下当前市场整体情况' },
  { label: '热点板块', prompt: '最近有哪些热点板块值得关注？' },
  { label: '投资建议', prompt: '对于新手投资者，有什么建议？' },
  { label: '风险提示', prompt: '当前市场有哪些风险需要注意？' }
])

// Computed
const agentStatusText = ref('运行中')

// ==================== History Management ====================
const HISTORY_STORAGE_KEY = 'ai_assistant_history'

// Load history from localStorage
const loadHistory = () => {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (stored) {
      chatHistory.value = JSON.parse(stored)
    }
  } catch (error) {
    console.error('Failed to load history:', error)
    chatHistory.value = []
  }
}

// Save current session to history
const saveToHistory = () => {
  if (messages.value.length === 0) return
  
  const session = {
    id: currentSessionId.value || generateSessionId(),
    title: generateSessionTitle(),
    messages: [...messages.value],
    timestamp: new Date().toISOString(),
    messageCount: messages.value.length
  }
  
  // Find existing session or add new
  const existingIndex = chatHistory.value.findIndex(s => s.id === session.id)
  if (existingIndex >= 0) {
    chatHistory.value[existingIndex] = session
  } else {
    chatHistory.value.unshift(session)
  }
  
  // Keep only last 50 sessions
  if (chatHistory.value.length > 50) {
    chatHistory.value = chatHistory.value.slice(0, 50)
  }
  
  // Save to localStorage
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(chatHistory.value))
  } catch (error) {
    console.error('Failed to save history:', error)
  }
}

// Generate unique session ID
const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Generate session title from first message
const generateSessionTitle = () => {
  if (messages.value.length === 0) return '新对话'
  const firstMessage = messages.value[0]
  if (firstMessage.role === 'user') {
    const content = firstMessage.content
    return content.length > 20 ? content.substring(0, 20) + '...' : content
  }
  return '新对话'
}

// Load session from history
const loadSession = (session) => {
  messages.value = [...session.messages]
  currentSessionId.value = session.id
  showHistoryDialog.value = false
  nextTick(() => scrollToBottom())
  ElMessage.success('已加载历史会话')
}

// Delete session from history
const deleteSession = (sessionId) => {
  const index = chatHistory.value.findIndex(s => s.id === sessionId)
  if (index >= 0) {
    chatHistory.value.splice(index, 1)
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(chatHistory.value))
      ElMessage.success('已删除历史记录')
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }
}

// Clear all history
const clearAllHistory = () => {
  chatHistory.value = []
  localStorage.removeItem(HISTORY_STORAGE_KEY)
  ElMessage.success('已清空所有历史记录')
}

// Start new session
const startNewSession = () => {
  if (messages.value.length > 0) {
    saveToHistory()
  }
  messages.value = []
  currentSessionId.value = generateSessionId()
  analysisData.value = null
  ElMessage.success('已开始新对话')
}

// Format date for history
const formatHistoryDate = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ==================== End History Management ====================

// ==================== User Preferences ====================
const SETTINGS_STORAGE_KEY = 'ai_assistant_settings'
const showSettingsDialog = ref(false)

const userSettings = ref({
  // Analysis preferences
  defaultAnalysisType: 'comprehensive', // comprehensive, fundamental, technical
  autoAnalyze: false,
  showSignals: true,
  
  // Display preferences
  compactMode: false,
  fontSize: 'medium', // small, medium, large
  messageGrouping: true,
  
  // Notification preferences
  soundEnabled: true,
  desktopNotification: false,
  alertThreshold: 3, // percentage
  
  // Quick stocks customization
  customQuickStocks: []
})

// Load settings from localStorage
const loadSettings = () => {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      userSettings.value = { ...userSettings.value, ...parsed }
    }
    applySettings()
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}

// Save settings to localStorage
const saveSettings = () => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(userSettings.value))
    applySettings()
    ElMessage.success('设置已保存')
    showSettingsDialog.value = false
  } catch (error) {
    console.error('Failed to save settings:', error)
    ElMessage.error('保存设置失败')
  }
}

// Apply settings to UI
const applySettings = () => {
  // Apply font size
  const fontSizeMap = {
    small: '14px',
    medium: '16px',
    large: '18px'
  }
  document.documentElement.style.setProperty('--chat-font-size', fontSizeMap[userSettings.value.fontSize] || '16px')
  
  // Apply compact mode
  if (userSettings.value.compactMode) {
    document.documentElement.classList.add('compact-mode')
  } else {
    document.documentElement.classList.remove('compact-mode')
  }
}

// Reset settings to default
const resetSettings = () => {
  userSettings.value = {
    defaultAnalysisType: 'comprehensive',
    autoAnalyze: false,
    showSignals: true,
    compactMode: false,
    fontSize: 'medium',
    messageGrouping: true,
    soundEnabled: true,
    desktopNotification: false,
    alertThreshold: 3,
    customQuickStocks: []
  }
  saveSettings()
  ElMessage.success('已重置为默认设置')
}

// Add custom quick stock
const addCustomQuickStock = (stock) => {
  if (stock && stock.symbol && stock.name) {
    const exists = userSettings.value.customQuickStocks.find(s => s.symbol === stock.symbol)
    if (!exists) {
      userSettings.value.customQuickStocks.push(stock)
      saveSettings()
    }
  }
}

// Remove custom quick stock
const removeCustomQuickStock = (symbol) => {
  const index = userSettings.value.customQuickStocks.findIndex(s => s.symbol === symbol)
  if (index >= 0) {
    userSettings.value.customQuickStocks.splice(index, 1)
    saveSettings()
  }
}

// Get all quick stocks (default + custom)
const getAllQuickStocks = () => {
  const defaultStocks = quickStocks.value
  const customStocks = userSettings.value.customQuickStocks
  return [...defaultStocks, ...customStocks]
}

// ==================== End User Preferences ====================

// Methods
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const formatMessage = (content) => {
  if (!content) return ''
  return content.replace(/\n/g, '<br>')
}

const formatFundamentalLabel = (key) => {
  const labels = {
    pe: '市盈率',
    pb: '市净率',
    roe: '净资产收益率',
    roa: '总资产收益率',
    debtRatio: '资产负债率',
    currentRatio: '流动比率',
    grossMargin: '毛利率',
    netMargin: '净利率'
  }
  return labels[key] || key
}

const formatTechnicalLabel = (key) => {
  const labels = {
    ma5: '5日均线',
    ma20: '20日均线',
    ma60: '60日均线',
    rsi: 'RSI指标',
    macd: 'MACD',
    kdj: 'KDJ'
  }
  return labels[key] || key
}

const getTechnicalTrend = (key, value) => {
  // Simplified trend detection
  if (typeof value === 'string') {
    if (value.includes('↑') || value.includes('金叉')) return 'positive'
    if (value.includes('↓') || value.includes('死叉')) return 'negative'
  }
  return ''
}

// Send message
const sendMessage = async () => {
  if (!userInput.value.trim() || sending.value) return
  
  const userMessage = {
    role: 'user',
    content: userInput.value.trim(),
    timestamp: new Date()
  }
  
  messages.value.push(userMessage)
  userInput.value = ''
  sending.value = true
  
  await nextTick()
  scrollToBottom()
  
  try {
    // Check if it's a stock analysis request
    const stockCode = extractStockCode(userMessage.content)
    if (stockCode) {
      await analyzeStock(stockCode, true)
    } else {
      // General question - simulate AI response
      const aiResponse = await simulateAIResponse(userMessage.content)
      messages.value.push(aiResponse)
    }
  } catch (error) {
    ElMessage.error('发送失败: ' + error.message)
  } finally {
    sending.value = false
    await nextTick()
    scrollToBottom()
  }
}

const extractStockCode = (text) => {
  // Extract stock codes like 600519, 000001, etc.
  const match = text.match(/\b(6\d{5}|0\d{5}|3\d{5})\b/)
  return match ? match[1] : null
}

const simulateAIResponse = async (question) => {
  try {
    // Use search API to get relevant information
    const searchResult = await searchAPI.search(question, null, 5)
    
    let response = ''
    if (searchResult.results && searchResult.results.length > 0) {
      // Build response from search results
      const stockResults = searchResult.results.filter(r => r.type === 'stock')
      const policyResults = searchResult.results.filter(r => r.type === 'policy')
      
      if (stockResults.length > 0) {
        response += '根据搜索结果，找到以下相关股票：\n'
        stockResults.forEach(stock => {
          response += `• ${stock.title}: ${stock.content}\n`
        })
      }
      
      if (policyResults.length > 0) {
        response += '\n相关政策信息：\n'
        policyResults.forEach(policy => {
          response += `• ${policy.title}: ${policy.content}\n`
        })
      }
    }
    
    if (!response) {
      // Fallback to keyword-based responses
      if (question.includes('市场') || question.includes('大盘')) {
        response = '根据当前市场分析，A股市场整体呈现震荡格局。建议关注政策导向和业绩确定性强的板块。'
      } else if (question.includes('热点') || question.includes('板块')) {
        response = '近期热点板块包括：新能源、人工智能、半导体等。建议关注相关龙头企业的投资机会。'
      } else if (question.includes('风险')) {
        response = '当前市场主要风险包括：地缘政治风险、经济复苏不及预期、流动性收紧等。建议做好仓位管理。'
      } else {
        response = '感谢您的提问。作为AI投资助手，我可以帮您分析具体股票、解答投资疑问。请告诉我您想了解的具体内容。'
      }
    }
    
    return {
      role: 'assistant',
      content: response,
      timestamp: new Date()
    }
  } catch (error) {
    console.error('Search API error:', error)
    // Fallback responses
    let response = ''
    if (question.includes('市场') || question.includes('大盘')) {
      response = '根据当前市场分析，A股市场整体呈现震荡格局。建议关注政策导向和业绩确定性强的板块。'
    } else if (question.includes('热点') || question.includes('板块')) {
      response = '近期热点板块包括：新能源、人工智能、半导体等。建议关注相关龙头企业的投资机会。'
    } else if (question.includes('风险')) {
      response = '当前市场主要风险包括：地缘政治风险、经济复苏不及预期、流动性收紧等。建议做好仓位管理。'
    } else {
      response = '感谢您的提问。作为AI投资助手，我可以帮您分析具体股票、解答投资疑问。请告诉我您想了解的具体内容。'
    }
    
    return {
      role: 'assistant',
      content: response,
      timestamp: new Date()
    }
  }
}

// Analyze stock
const analyzeStock = async (symbol, addToChat = false) => {
  currentStock.value = symbol
  stockSearch.value = symbol
  
  try {
    ElMessage.info(`正在分析 ${symbol}...`)
    
    // Call analysis API
    const result = await analysisAPI.analyze(symbol)
    
    // Transform API result to our format
    // Backend returns: ticker, fundamental, technical, valuation, signals, overall_score, recommendation
    analysisData.value = {
      symbol: result.ticker || symbol,
      name: getStockName(result.ticker || symbol),
      price: result.valuation?.intrinsic_value || 'N/A',
      change: 0,
      signal: mapRecommendationToSignal(result.recommendation),
      confidence: result.overall_score || 0,
      pe: result.fundamental?.pe_ratio || 'N/A',
      pb: result.fundamental?.pb_ratio || 'N/A',
      dividendYield: result.fundamental?.dividend_yield || 'N/A',
      fundamental: {
        roe: result.fundamental?.roe ? `${(result.fundamental.roe * 100).toFixed(1)}%` : 'N/A',
        roa: result.fundamental?.roa ? `${(result.fundamental.roa * 100).toFixed(1)}%` : 'N/A',
        debtRatio: result.fundamental?.debt_to_equity ? `${(result.fundamental.debt_to_equity * 100).toFixed(1)}%` : 'N/A',
        grossMargin: result.fundamental?.gross_margin ? `${(result.fundamental.gross_margin * 100).toFixed(1)}%` : 'N/A'
      },
      technical: {
        ma5: result.technical?.trend === 'upward' ? '↑' : result.technical?.trend === 'downward' ? '↓' : '→',
        ma20: result.technical?.trend === 'upward' ? '↑' : result.technical?.trend === 'downward' ? '↓' : '→',
        rsi: result.technical?.rsi || 'N/A',
        macd: result.technical?.macd_signal === 'bullish' ? '金叉' : result.technical?.macd_signal === 'bearish' ? '死叉' : '中性'
      },
      signals: result.signals || [],
      valuation: result.valuation || {}
    }
    
    if (addToChat) {
      // Add analysis result to chat
      const analysisMessage = {
        role: 'assistant',
        content: `【${analysisData.value.name} 分析结果】\n投资信号: ${analysisData.value.signal}\n置信度: ${analysisData.value.confidence}分\n建议: ${result.recommendation || '中性'}\n${result.signals ? '关键信号: ' + result.signals.join(', ') : ''}`,
        timestamp: new Date(),
        analysisResult: [{
          symbol: symbol,
          title: `${analysisData.value.name} (${symbol})`,
          signal: analysisData.value.signal,
          content: `综合评分: ${analysisData.value.confidence}分, ${result.recommendation || '中性'}建议`
        }]
      }
      messages.value.push(analysisMessage)
    }
    
    ElMessage.success('分析完成')
  } catch (error) {
    console.error('Analysis API error:', error)
    // Use mock data as fallback
    analysisData.value = {
      symbol: symbol,
      name: getStockName(symbol),
      price: (Math.random() * 100 + 50).toFixed(2),
      change: (Math.random() * 10 - 5).toFixed(2),
      signal: ['BUY', 'HOLD', 'SELL'][Math.floor(Math.random() * 3)],
      confidence: Math.floor(Math.random() * 30 + 70),
      pe: (Math.random() * 30 + 10).toFixed(2),
      pb: (Math.random() * 5 + 1).toFixed(2),
      dividendYield: (Math.random() * 3).toFixed(2),
      fundamental: {
        roe: '15.2%',
        roa: '8.5%',
        debtRatio: '45.3%',
        grossMargin: '35.6%'
      },
      technical: {
        ma5: '↑',
        ma20: '↑',
        rsi: '58',
        macd: '金叉'
      },
      signals: ['RSI中性', 'MACD金叉'],
      valuation: {
        intrinsic_value: 1950,
        margin_of_safety: 0.05
      }
    }
    
    if (addToChat) {
      const analysisMessage = {
        role: 'assistant',
        content: `【${analysisData.value.name} 分析结果】(模拟数据)\n投资信号: ${analysisData.value.signal}\n置信度: ${analysisData.value.confidence}分\n关键信号: ${analysisData.value.signals.join(', ')}`,
        timestamp: new Date(),
        analysisResult: [{
          symbol: symbol,
          title: `${analysisData.value.name} (${symbol})`,
          signal: analysisData.value.signal,
          content: `综合评分: ${analysisData.value.confidence}分 (模拟数据)`
        }]
      }
      messages.value.push(analysisMessage)
    }
    
    ElMessage.warning('API暂时不可用，使用模拟数据')
  }
}

// Map recommendation to signal
const mapRecommendationToSignal = (recommendation) => {
  const signalMap = {
    '买入': 'BUY',
    '增持': 'BUY',
    '持有': 'HOLD',
    '减持': 'SELL',
    '卖出': 'SELL'
  }
  return signalMap[recommendation] || 'HOLD'
}

const getStockName = (symbol) => {
  const names = {
    '600519': '贵州茅台',
    '300750': '宁德时代',
    '000858': '五粮液',
    '601318': '中国平安',
    '000001': '平安银行'
  }
  return names[symbol] || symbol
}

const searchStock = () => {
  if (stockSearch.value.trim()) {
    analyzeStock(stockSearch.value.trim())
  }
}

const selectStock = (stock) => {
  analyzeStock(stock.symbol)
}

const sendQuickQuestion = (prompt) => {
  userInput.value = prompt
  sendMessage()
}

const analyzeCurrentStock = () => {
  if (currentStock.value) {
    analyzeStock(currentStock.value, true)
  }
}

const viewDetailedAnalysis = (symbol) => {
  router.push(`/stock/analysis?symbol=${symbol}`)
}

const addToWatchlist = (symbol) => {
  ElMessage.success(`已将 ${symbol} 加入自选股`)
}

const addToConversation = () => {
  if (analysisData.value) {
    const message = {
      role: 'assistant',
      content: `【${analysisData.value.name} 分析摘要】\n信号: ${analysisData.value.signal}\n置信度: ${analysisData.value.confidence}%\n价格: ¥${analysisData.value.price}`,
      timestamp: new Date()
    }
    messages.value.push(message)
    nextTick(() => scrollToBottom())
  }
}

const exportAnalysis = () => {
  ElMessage.info('导出功能开发中...')
}

const showAgentPanel = () => {
  router.push('/stock/agent-panel')
}

const showSystemStatus = () => {
  router.push('/monitor/dashboard')
}

const refreshAgentStatus = async () => {
  refreshingStatus.value = true
  try {
    await agentAPI.getStatus()
    agentStatus.value = 'active'
    agentStatusText.value = '运行中'
    ElMessage.success('状态已刷新')
  } catch (error) {
    agentStatus.value = 'error'
    agentStatusText.value = '异常'
  } finally {
    refreshingStatus.value = false
  }
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// Initialize WebSocket connections
const initWebSocket = () => {
  // Chat WebSocket
  chatSocket.connect({
    onOpen: () => {
      wsConnected.value = true
      console.log('[Chat] WebSocket connected')
    },
    onMessage: (data) => {
      if (data.type === 'response') {
        messages.value.push({
          role: 'assistant',
          content: data.content,
          timestamp: new Date(data.timestamp)
        })
        nextTick(() => scrollToBottom())
      }
    },
    onClose: () => {
      wsConnected.value = false
      console.log('[Chat] WebSocket disconnected')
    }
  })
  
  // Market WebSocket
  marketSocket.connect({
    onMessage: (data) => {
      if (data.type === 'market_update') {
        marketData.value = data.data
      }
    }
  })
  
  // Agent WebSocket
  agentSocket.connect({
    onMessage: (data) => {
      if (data.type === 'agent_status') {
        agentStatus.value = data.data.status === 'active' ? 'active' : 'error'
      } else if (data.type === 'agent_update') {
        agentStatusText.value = `运行中 (${data.data.activeTasks}个任务)`
      }
    }
  })
}

// Cleanup WebSocket connections
const cleanupWebSocket = () => {
  chatSocket.disconnect()
  marketSocket.disconnect()
  agentSocket.disconnect()
}

// Initialize voice recognition
const initVoiceRecognition = () => {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    voiceSupported.value = true
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'zh-CN'
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      userInput.value = transcript
      isListening.value = false
    }
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      isListening.value = false
      ElMessage.error('语音识别失败')
    }
    
    recognition.onend = () => {
      isListening.value = false
    }
  }
}

// Toggle voice recognition
const toggleVoiceInput = () => {
  if (!voiceSupported.value) {
    ElMessage.warning('您的浏览器不支持语音识别')
    return
  }
  
  if (isListening.value) {
    recognition.stop()
    isListening.value = false
  } else {
    recognition.start()
    isListening.value = true
    ElMessage.info('正在聆听...')
  }
}

// Generate chart data from analysis
const generateChartData = () => {
  if (!analysisData.value) return
  
  chartData.value = {
    title: `${analysisData.value.name} 价格走势`,
    labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
    datasets: [
      {
        label: '收盘价',
        data: [1800, 1850, 1900, 1880, 1920, analysisData.value.price],
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)'
      }
    ]
  }
}

// Toggle chart display
const toggleChart = () => {
  showChart.value = !showChart.value
  if (showChart.value && analysisData.value) {
    generateChartData()
  }
}

// Sync history to cloud
const syncHistoryToCloud = async () => {
  try {
    await syncAPI.syncHistory(chatHistory.value)
    ElMessage.success('历史记录已同步到云端')
  } catch (error) {
    console.error('Sync failed:', error)
    ElMessage.error('同步失败')
  }
}

// Load history from cloud
const loadHistoryFromCloud = async () => {
  try {
    const result = await syncAPI.getSyncedHistory('user')
    if (result.history && result.history.length > 0) {
      // Merge with local history
      const merged = [...chatHistory.value, ...result.history]
      // Remove duplicates
      const unique = merged.filter((session, index, self) =>
        index === self.findIndex(s => s.id === session.id)
      )
      chatHistory.value = unique
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(unique))
      ElMessage.success('已从云端加载历史记录')
    }
  } catch (error) {
    console.error('Load from cloud failed:', error)
    ElMessage.error('从云端加载失败')
  }
}

// Check for symbol in URL and load history
onMounted(() => {
  // Load user settings
  loadSettings()
  
  // Load chat history
  loadHistory()
  
  // Generate new session ID
  currentSessionId.value = generateSessionId()
  
  // Initialize WebSocket
  initWebSocket()
  
  // Initialize voice recognition
  initVoiceRecognition()
  
  // Check for symbol in URL
  const symbol = route.query.symbol
  if (symbol) {
    analyzeStock(symbol)
  }
})

// Cleanup on unmount
onUnmounted(() => {
  cleanupWebSocket()
  if (recognition) {
    recognition.stop()
  }
})

// Watch for route changes
watch(() => route.query.symbol, (newSymbol) => {
  if (newSymbol) {
    analyzeStock(newSymbol)
  }
})

// Auto-save history when messages change
watch(() => messages.value.length, (newLength) => {
  if (newLength > 0) {
    // Debounce save
    if (window._saveHistoryTimeout) {
      clearTimeout(window._saveHistoryTimeout)
    }
    window._saveHistoryTimeout = setTimeout(() => {
      saveToHistory()
    }, 2000)
  }
})
</script>

<style scoped>
.unified-ai-view {
  height: calc(100vh - 104px);
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
}

.unified-header {
  background: rgba(30, 41, 59, 0.9);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  padding: 16px 24px;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1800px;
  margin: 0 auto;
}

.header-left h1 {
  margin: 0 0 4px 0;
  font-size: 24px;
  color: #f8fafc;
}

.header-left p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.agent-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 20px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  animation: pulse 2s infinite;
}

.status-dot.error {
  background: #ef4444;
}

.status-text {
  color: #10b981;
  font-size: 14px;
  font-weight: 500;
}

.unified-content {
  flex: 1;
  display: flex;
  gap: 24px;
  padding: 24px;
  overflow: hidden;
  max-width: 1800px;
  margin: 0 auto;
  width: 100%;
}

.chat-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  overflow: hidden;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.welcome-section {
  text-align: center;
  padding: 40px 20px;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.welcome-section h2 {
  color: #f8fafc;
  margin: 0 0 8px 0;
  font-size: 24px;
}

.welcome-section p {
  color: #94a3b8;
  margin: 0 0 32px 0;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 600px;
  margin: 0 auto;
}

.action-group h4 {
  color: #e2e8f0;
  margin: 0 0 12px 0;
  font-size: 16px;
  text-align: left;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.message.user .message-avatar {
  background: rgba(14, 165, 233, 0.2);
}

.message-content {
  flex: 1;
  max-width: 70%;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 16px;
  padding: 16px;
}

.message.user .message-content {
  background: rgba(14, 165, 233, 0.2);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.sender-name {
  font-weight: 600;
  color: #f8fafc;
}

.message-time {
  font-size: 12px;
  color: #64748b;
}

.message-body {
  color: #e2e8f0;
  line-height: 1.6;
  white-space: pre-wrap;
}

.analysis-results {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  padding: 16px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.result-title {
  font-weight: 600;
  color: #f8fafc;
}

.result-content {
  color: #94a3b8;
  font-size: 14px;
  margin-bottom: 12px;
}

.result-actions {
  display: flex;
  gap: 8px;
}

.chat-input-area {
  padding: 16px 24px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(30, 41, 59, 0.5);
}

.input-container {
  max-width: 100%;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}

.analysis-section {
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-panel, .analysis-results-panel, .agent-status-panel {
  background: rgba(30, 41, 59, 0.5);
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  padding: 20px;
}

.search-panel h3, .agent-status-panel h3 {
  color: #f8fafc;
  margin: 0 0 16px 0;
  font-size: 18px;
}

.search-input {
  margin-bottom: 12px;
}

.quick-stock-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.analysis-results-panel {
  flex: 1;
  overflow-y: auto;
}

.stock-header {
  margin-bottom: 16px;
}

.stock-header h3 {
  color: #f8fafc;
  margin: 0 0 8px 0;
  font-size: 20px;
}

.stock-price {
  font-size: 24px;
  font-weight: 700;
  color: #f8fafc;
}

.stock-price .positive {
  color: #10b981;
  font-size: 16px;
  margin-left: 8px;
}

.stock-price .negative {
  color: #ef4444;
  font-size: 16px;
  margin-left: 8px;
}

.analysis-tabs {
  margin-bottom: 16px;
}

.analysis-overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.signal-card {
  background: rgba(15, 23, 42, 0.6);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}

.signal-card.buy {
  border: 1px solid rgba(16, 185, 129, 0.5);
  background: rgba(16, 185, 129, 0.1);
}

.signal-card.sell {
  border: 1px solid rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.1);
}

.signal-card.hold {
  border: 1px solid rgba(245, 158, 11, 0.5);
  background: rgba(245, 158, 11, 0.1);
}

.signal-title {
  color: #94a3b8;
  font-size: 14px;
  margin-bottom: 8px;
}

.signal-value {
  color: #f8fafc;
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 8px;
}

.signal-confidence {
  color: #94a3b8;
  font-size: 14px;
}

.analysis-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.metric-item {
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.metric-label {
  color: #94a3b8;
  font-size: 12px;
  margin-bottom: 4px;
}

.metric-value {
  color: #f8fafc;
  font-size: 18px;
  font-weight: 600;
}

.fundamental-analysis, .technical-analysis {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fund-item, .tech-item {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
}

.fund-label, .tech-label {
  color: #94a3b8;
}

.fund-value, .tech-value {
  color: #f8fafc;
  font-weight: 500;
}

.tech-value.positive {
  color: #10b981;
}

.tech-value.negative {
  color: #ef4444;
}

.analysis-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-status-panel {
  margin-top: auto;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.status-item {
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  padding: 12px;
}

.status-label {
  color: #94a3b8;
  font-size: 12px;
  margin-bottom: 4px;
}

.status-value {
  color: #f8fafc;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-quick-actions {
  display: flex;
  gap: 8px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: rgba(30, 41, 59, 0.5);
}

::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}

/* Responsive */
@media (max-width: 1200px) {
  .unified-content {
    flex-direction: column;
  }
  
  .analysis-section {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }
  
  .search-panel, .analysis-results-panel, .agent-status-panel {
    flex: 1;
    min-width: 300px;
  }
}

@media (max-width: 768px) {
  .unified-header {
    padding: 12px 16px;
  }
  
  .header-left h1 {
    font-size: 18px;
  }
  
  .header-left p {
    font-size: 12px;
  }
  
  .header-content {
    flex-direction: column;
    gap: 12px;
  }
  
  .header-right {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .history-actions {
    flex-wrap: wrap;
  }
  
  .history-actions .el-button {
    flex: 1;
    min-width: auto;
  }
  
  .agent-status {
    padding: 6px 12px;
    font-size: 12px;
  }
  
  .unified-content {
    padding: 12px;
    gap: 12px;
  }
  
  .chat-section {
    height: 60vh;
    min-height: 400px;
  }
  
  .chat-messages {
    padding: 12px;
  }
  
  .welcome-section {
    padding: 20px 10px;
  }
  
  .welcome-icon {
    font-size: 48px;
  }
  
  .welcome-section h2 {
    font-size: 20px;
  }
  
  .welcome-section p {
    font-size: 14px;
  }
  
  .quick-actions {
    gap: 16px;
  }
  
  .action-group h4 {
    font-size: 14px;
  }
  
  .action-buttons {
    flex-wrap: wrap;
  }
  
  .action-buttons .el-button {
    flex: 1;
    min-width: 100px;
  }
  
  .message-content {
    max-width: 85%;
  }
  
  .analysis-results-panel {
    min-width: auto;
  }
  
  .analysis-section {
    flex-direction: column;
  }
  
  .search-panel, .analysis-results-panel, .agent-status-panel {
    min-width: auto;
    width: 100%;
  }
  
  .status-grid {
    grid-template-columns: 1fr;
  }
  
  .agent-quick-actions {
    flex-direction: column;
  }
  
  .agent-quick-actions .el-button {
    width: 100%;
  }
  
  .setting-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .setting-label {
    min-width: auto;
  }
  
  .setting-hint {
    margin-left: 0;
  }
}

@media (max-width: 480px) {
  .header-left h1 {
    font-size: 16px;
  }
  
  .header-right {
    flex-direction: column;
    align-items: stretch;
  }
  
  .history-actions {
    flex-direction: column;
  }
  
  .history-actions .el-button {
    width: 100%;
  }
  
  .agent-status {
    justify-content: center;
  }
  
  .chat-section {
    height: 50vh;
    min-height: 350px;
  }
  
  .stock-header h3 {
    font-size: 16px;
  }
  
  .stock-price {
    font-size: 20px;
  }
  
  .signal-value {
    font-size: 24px;
  }
  
  .analysis-metrics {
    grid-template-columns: 1fr;
  }
}

/* History Dialog Styles */
.history-actions {
  display: flex;
  gap: 8px;
}

.history-list {
  max-height: 400px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.history-item:hover {
  background: rgba(14, 165, 233, 0.2);
  transform: translateX(4px);
}

.history-item-content {
  flex: 1;
}

.history-title {
  color: #f8fafc;
  font-weight: 500;
  margin-bottom: 4px;
}

.history-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #94a3b8;
}

.history-messages {
  color: #0ea5e9;
}

.history-time {
  color: #64748b;
}

.history-empty {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
}

.history-empty p {
  margin: 0 0 8px 0;
}

.history-empty .hint {
  font-size: 12px;
  color: #64748b;
}

/* Settings Dialog Styles */
.settings-content {
  max-height: 500px;
  overflow-y: auto;
}

.settings-section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.settings-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.settings-section h4 {
  color: #f8fafc;
  margin: 0 0 16px 0;
  font-size: 16px;
}

.setting-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.05);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  min-width: 150px;
  color: #e2e8f0;
  font-weight: 500;
}

.setting-hint {
  width: 100%;
  margin-top: 4px;
  margin-left: 162px;
  font-size: 12px;
  color: #64748b;
}

/* Voice Input Styles */
.input-wrapper {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.input-wrapper .el-textarea {
  flex: 1;
}

.voice-btn {
  flex-shrink: 0;
  margin-bottom: 2px;
}

.voice-btn.el-button--danger {
  animation: pulse-voice 1s infinite;
}

@keyframes pulse-voice {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Chart Styles */
.chart-container {
  padding: 16px;
}

.chart-header {
  margin-bottom: 16px;
}

.chart-header h4 {
  color: #f8fafc;
  margin: 0;
  font-size: 16px;
}

.chart-placeholder {
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  padding: 20px;
  min-height: 200px;
}

.chart-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 150px;
  gap: 8px;
}

.chart-bar-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.chart-bar {
  width: 100%;
  max-width: 40px;
  background: linear-gradient(180deg, #0ea5e9, #10b981);
  border-radius: 4px 4px 0 0;
  min-height: 10px;
  transition: height 0.3s ease;
}

.chart-label {
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.chart-empty {
  text-align: center;
  padding: 40px;
  color: #94a3b8;
}

/* Market Data Ticker */
.market-ticker {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow-x: auto;
}

.ticker-item {
  display: flex;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}

.ticker-name {
  color: #94a3b8;
  font-size: 12px;
}

.ticker-value {
  color: #f8fafc;
  font-weight: 500;
}

.ticker-change {
  font-size: 12px;
}

.ticker-change.positive {
  color: #10b981;
}

.ticker-change.negative {
  color: #ef4444;
}
</style>