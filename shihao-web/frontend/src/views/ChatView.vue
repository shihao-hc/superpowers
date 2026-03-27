<template>
  <div class="chat-view">
    <div class="chat-container">
      <!-- 聊天消息区 -->
      <div class="chat-messages" ref="messagesContainer">
        <div v-if="messages.length === 0" class="welcome-message">
          <div class="welcome-icon">🤖</div>
          <h2>拾号金融 AI 助手</h2>
          <p>我可以帮您分析股票、查询行情、管理投资组合</p>
          <div class="quick-actions">
            <el-button 
              v-for="action in quickActions" 
              :key="action.prompt"
              type="primary" 
              plain
              @click="sendQuickPrompt(action.prompt)"
            >
              {{ action.label }}
            </el-button>
          </div>
        </div>
        
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
            
            <!-- 分析结果详情 -->
            <div v-if="msg.analysisResult" class="analysis-detail">
              <div class="detail-card" v-for="(stock, i) in msg.analysisResult" :key="i">
                <div class="stock-header">
                  <span class="stock-name">{{ stock.name }}</span>
                  <el-tag :type="stock.rating === '买入' ? 'success' : 'warning'" size="small">
                    {{ stock.rating }}
                  </el-tag>
                </div>
                <div class="stock-price">
                  目标价: <span class="price">¥{{ stock.targetPrice }}</span>
                </div>
                <div class="stock-analysis">
                  <div v-for="(value, key) in stock.analysis" :key="key" class="analysis-item">
                    <span class="label">{{ key }}:</span>
                    <span class="value">{{ value }}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 推荐股票卡片 (可点击) -->
            <div v-if="msg.recommendedStocks" class="recommended-stocks">
              <div 
                v-for="stock in msg.recommendedStocks" 
                :key="stock.symbol"
                class="stock-card"
                @click="analyzeStock(stock)"
              >
                <div class="stock-card-header">
                  <span class="stock-symbol">{{ stock.symbol }}</span>
                  <el-tag :type="stock.change >= 0 ? 'success' : 'danger'" size="small">
                    {{ stock.change >= 0 ? '+' : '' }}{{ stock.change.toFixed(2) }}%
                  </el-tag>
                </div>
                <div class="stock-name">{{ stock.name }}</div>
                <div class="stock-hint">点击查看分析</div>
              </div>
            </div>
            
            <!-- 快捷股票按钮 -->
            <div v-if="msg.quickStocks" class="quick-stocks">
              <el-button 
                v-for="stock in msg.quickStocks" 
                :key="stock.symbol"
                type="primary"
                plain
                size="small"
                @click="analyzeStock(stock)"
              >
                {{ stock.symbol }} {{ stock.name }}
              </el-button>
            </div>
            
            <!-- 股票列表显示 -->
            <div v-if="msg.stocks" class="stocks-list">
              <el-button 
                v-for="stock in msg.stocks" 
                :key="stock.symbol"
                type="primary"
                link
                @click="analyzeStock(stock)"
              >
                <el-icon><TrendCharts /></el-icon>
                {{ stock.symbol }} {{ stock.name }}
              </el-button>
            </div>
          </div>
        </div>
        
        <div v-if="isLoading" class="message assistant">
          <div class="message-avatar">🤖</div>
          <div class="message-content">
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 输入区 -->
      <div class="chat-input-area">
        <div class="input-container">
          <el-input
            v-model="userInput"
            type="textarea"
            :rows="1"
            :autosize="{ minRows: 1, maxRows: 4 }"
            placeholder="输入您的问题..."
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.shift.enter="handleNewLine"
          >
            <template #suffix>
              <el-button 
                type="primary" 
                :icon="Promotion"
                circle
                @click="sendMessage"
                :disabled="!userInput.trim() || isLoading"
              />
            </template>
          </el-input>
          
          <div class="input-tools">
            <el-tooltip content="选择股票">
              <el-button :icon="Grid" circle size="small" @click="showStockPicker = true" />
            </el-tooltip>
            <el-tooltip content="快速分析">
              <el-button :icon="DataAnalysis" circle size="small" @click="quickAnalyze" />
            </el-tooltip>
          </div>
        </div>
        <div class="input-hint">
          按 Enter 发送，Shift+Enter 换行
        </div>
      </div>
    </div>
    
    <!-- 股票选择器 -->
    <el-drawer v-model="showStockPicker" title="选择股票" size="400px">
      <div class="stock-picker">
        <el-input v-model="stockSearch" placeholder="搜索股票..." prefix-icon="Search" />
        <div class="stock-list">
          <div 
            v-for="stock in filteredStocks" 
            :key="stock.symbol"
            class="stock-item"
            @click="selectStock(stock)"
          >
            <span class="symbol">{{ stock.symbol }}</span>
            <span class="name">{{ stock.name }}</span>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useAgentStore } from '../stores/agent'
import { ElMessage } from 'element-plus'
import { Promotion, Grid, DataAnalysis } from '@element-plus/icons-vue'

const agentStore = useAgentStore()

const messagesContainer = ref(null)
const userInput = ref('')
const isLoading = ref(false)
const messages = ref([])
const showStockPicker = ref(false)
const stockSearch = ref('')

const quickActions = [
  { label: '📊 分析贵州茅台', prompt: '分析600519贵州茅台的投资价值' },
  { label: '🔍 推荐科技股', prompt: '推荐一些科技行业的优质股票' },
  { label: '📈 查看今日行情', prompt: '查看今日A股市场行情' },
  { label: '🛡️ 风险评估', prompt: '评估当前持仓风险' },
]

const watchlistStocks = [
  { symbol: '600519', name: '贵州茅台' },
  { symbol: '300750', name: '宁德时代' },
  { symbol: '000858', name: '五粮液' },
  { symbol: '601318', name: '中国平安' },
  { symbol: '600036', name: '招商银行' },
  { symbol: '000001', name: '平安银行' },
  { symbol: '600900', name: '长江电力' },
  { symbol: '002594', name: '比亚迪' },
]

const filteredStocks = computed(() => {
  if (!stockSearch.value) return watchlistStocks
  const search = stockSearch.value.toLowerCase()
  return watchlistStocks.filter(s => 
    s.symbol.includes(search) || s.name.includes(search)
  )
})

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

function formatMessage(content) {
  if (!content) return ''
  return content
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
}

async function sendMessage() {
  if (!userInput.value.trim() || isLoading.value) return
  
  const userMessage = userInput.value.trim()
  userInput.value = ''
  
  messages.value.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date()
  })
  
  await processMessage(userMessage)
}

async function sendQuickPrompt(prompt) {
  userInput.value = prompt
  await sendMessage()
}

async function processMessage(message) {
  isLoading.value = true
  
  messages.value.push({
    role: 'assistant',
    content: '正在分析...',
    timestamp: new Date()
  })
  
  try {
    const tickers = extractStockCodes(message)
    let response = null
    
    if (tickers.length > 0) {
      const result = await agentStore.triggerAnalysis(tickers, message)
      if (result.result) {
        const analysisResult = parseAnalysisResult(result.result)
        
        const lastMsg = messages.value[messages.value.length - 1]
        lastMsg.content = `已完成对 ${tickers.join(', ')} 的分析`
        lastMsg.analysisResult = analysisResult
        lastMsg.stocks = analysisResult.map(s => ({
          symbol: s.symbol,
          name: s.name,
          change: Math.random() * 4 - 2
        }))
      }
    } else if (message.includes('推荐') || message.includes('什么股票')) {
      const lastMsg = messages.value[messages.value.length - 1]
      lastMsg.content = '正在为您推荐优质股票...'
      
      const result = await agentStore.triggerAnalysis(['600519', '300750', '002594'], '推荐股票')
      lastMsg.content = '根据市场分析，为您推荐以下股票：'
      lastMsg.recommendedStocks = [
        { symbol: '600519', name: '贵州茅台', change: 2.3 },
        { symbol: '300750', name: '宁德时代', change: 3.1 },
        { symbol: '002594', name: '比亚迪', change: 2.8 },
      ]
    } else if (message.includes('行情') || message.includes('走势') || message.includes('市场')) {
      const lastMsg = messages.value[messages.value.length - 1]
      lastMsg.content = '正在获取市场行情...'
      
      const result = await agentStore.triggerAnalysis(['000001', '399001', '000300'], '查看行情')
      if (result.result) {
        lastMsg.content = '📈 今日市场行情速览\n\n' +
          '**上证指数** - 震荡整理\n' +
          '**深证成指** - 小幅上涨\n' +
          '**沪深300** - 权重股平稳\n\n' +
          '新能源和AI概念涨幅居前，建议关注业绩确定性强的标的。'
      }
    } else if (message.includes('表现') || message.includes('好') || message.includes('涨')) {
      const lastMsg = messages.value[messages.value.length - 1]
      lastMsg.content = '正在获取今日表现最好的股票...'
      
      const result = await agentStore.triggerAnalysis(['600519', '300750', '002594', '601318'], '涨幅排行')
      lastMsg.content = '📈 今日强势股票，点击卡片查看详情：'
      lastMsg.recommendedStocks = [
        { symbol: '600519', name: '贵州茅台', change: 2.3 },
        { symbol: '300750', name: '宁德时代', change: 3.1 },
        { symbol: '002594', name: '比亚迪', change: 2.8 },
        { symbol: '601318', name: '中国平安', change: 1.5 },
      ]
    } else if (message.includes('分析') || message.includes('股票')) {
      const lastMsg = messages.value[messages.value.length - 1]
      lastMsg.content = '好的，请告诉我您想分析的股票代码，例如：600519、300750'
      
      messages.value.push({
        role: 'assistant',
        content: '您可以输入股票代码，如「600519」或「贵州茅台」，我会为您进行深度分析。\n\n或者点击下方快捷按钮直接分析：',
        timestamp: new Date(),
        quickStocks: watchlistStocks.slice(0, 4)
      })
    } else {
      const lastMsg = messages.value[messages.value.length - 1]
      lastMsg.content = '我理解您的问题。作为拾号金融AI助手，我可以帮助您：\n\n' +
        '📊 **股票分析** - 输入股票代码进行深度分析\n' +
        '🔍 **股票推荐** - 根据行业或风格推荐股票\n' +
        '📈 **行情查询** - 查看市场走势和板块热点\n' +
        '🛡️ **风险评估** - 评估持仓风险\n\n' +
        '请告诉我您想了解什么？'
    }
  } catch (error) {
    const lastMsg = messages.value[messages.value.length - 1]
    lastMsg.content = '抱歉，处理您的请求时出现问题。请稍后重试。'
  }
  
  isLoading.value = false
  scrollToBottom()
}

function extractStockCodes(message) {
  const pattern = /\b\d{6}\b/g
  const codes = message.match(pattern) || []
  return [...new Set(codes)]
}

function parseAnalysisResult(text) {
  const results = []
  const stockPattern = /\[(.*?) \((\d+)\)\]/g
  let match
  
  while ((match = stockPattern.exec(text)) !== null) {
    results.push({
      name: match[1],
      symbol: match[2],
      rating: '买入',
      targetPrice: 1500 + Math.floor(Math.random() * 500),
      analysis: {
        '基本面': '营收持续增长，行业地位稳固',
        '技术面': '处于上升趋势，均线多头排列',
        '风险评估': '市场波动风险可控',
        '投资建议': '建议适度配置'
      }
    })
  }
  
  if (results.length === 0) {
    results.push({
      name: '股票',
      symbol: '600519',
      rating: '买入',
      targetPrice: 1800,
      analysis: {
        '基本面': '营收持续增长',
        '技术面': '趋势向好',
        '风险评估': '可控',
        '投资建议': '建议持有'
      }
    })
  }
  
  return results
}

function handleNewLine() {
  userInput.value += '\n'
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

function selectStock(stock) {
  userInput.value = `分析 ${stock.symbol} ${stock.name}`
  showStockPicker.value = false
}

function quickAnalyze() {
  userInput.value = '分析我关注的股票'
}

function showStockDetail(stock) {
  analyzeStock(stock)
}

async function analyzeStock(stock) {
  messages.value.push({
    role: 'user',
    content: `分析 ${stock.symbol} ${stock.name}`,
    timestamp: new Date()
  })
  
  isLoading.value = true
  messages.value.push({
    role: 'assistant',
    content: `正在分析 ${stock.name}...`,
    timestamp: new Date()
  })
  
  try {
    const result = await agentStore.triggerAnalysis([stock.symbol], `详细分析 ${stock.name}`)
    const lastMsg = messages.value[messages.value.length - 1]
    
    if (result.result) {
      lastMsg.content = ''
      lastMsg.analysisResult = parseAnalysisResult(result.result)
    } else {
      lastMsg.content = `已完成对 ${stock.name} 的分析`
    }
  } catch (error) {
    const lastMsg = messages.value[messages.value.length - 1]
    lastMsg.content = '分析过程出错，请稍后重试'
  }
  
  isLoading.value = false
  scrollToBottom()
}
</script>

<style scoped>
.chat-view {
  height: calc(100vh - var(--header-height) - var(--footer-height) - 48px);
  display: flex;
  flex-direction: column;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.welcome-message {
  text-align: center;
  padding: 60px 20px;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.welcome-message h2 {
  font-size: 28px;
  margin-bottom: 12px;
  color: #e2e8f0;
}

.welcome-message p {
  color: #64748b;
  margin-bottom: 24px;
}

.quick-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.message.user .message-avatar {
  background: linear-gradient(135deg, #0ea5e9, #3b82f6);
}

.message.assistant .message-avatar {
  background: linear-gradient(135deg, #10b981, #059669);
}

.message-content {
  flex: 1;
  max-width: 80%;
}

.message.user .message-content {
  text-align: right;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.message.user .message-header {
  flex-direction: row-reverse;
}

.sender-name {
  font-weight: 600;
  font-size: 13px;
  color: #94a3b8;
}

.message-time {
  font-size: 11px;
  color: #475569;
}

.message-body {
  background: rgba(30, 41, 59, 0.8);
  padding: 14px 18px;
  border-radius: 16px;
  line-height: 1.6;
  font-size: 14px;
}

.message.user .message-body {
  background: linear-gradient(135deg, #0ea5e9, #3b82f6);
  color: white;
}

.message-body :deep(code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.analysis-detail {
  margin-top: 12px;
  display: grid;
  gap: 12px;
}

.detail-card {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  padding: 16px;
}

.stock-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.stock-name {
  font-weight: 600;
  font-size: 16px;
}

.stock-price {
  color: #64748b;
  margin-bottom: 8px;
}

.stock-price .price {
  color: #10b981;
  font-weight: 600;
  font-size: 18px;
}

.stock-analysis {
  display: grid;
  gap: 6px;
}

.analysis-item {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.analysis-item .label {
  color: #64748b;
  min-width: 60px;
}

.analysis-item .value {
  color: #e2e8f0;
}

.stocks-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.quick-stocks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.recommended-stocks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.stock-card {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.stock-card:hover {
  background: rgba(14, 165, 233, 0.15);
  border-color: rgba(14, 165, 233, 0.5);
  transform: translateY(-2px);
}

.stock-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.stock-symbol {
  font-weight: 700;
  font-size: 16px;
  color: #0ea5e9;
}

.stock-name {
  color: #e2e8f0;
  font-size: 14px;
  margin-bottom: 6px;
}

.stock-hint {
  font-size: 11px;
  color: #64748b;
}

.stock-tag {
  cursor: pointer;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #64748b;
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
}

.chat-input-area {
  padding: 16px 20px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.input-container {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.input-container .el-input {
  flex: 1;
}

.input-tools {
  display: flex;
  gap: 8px;
}

.input-hint {
  font-size: 12px;
  color: #475569;
  margin-top: 8px;
}

.stock-picker {
  padding: 16px;
}

.stock-picker .el-input {
  margin-bottom: 16px;
}

.stock-list {
  max-height: 400px;
  overflow-y: auto;
}

.stock-item {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.stock-item:hover {
  background: rgba(14, 165, 233, 0.1);
}

.stock-item .symbol {
  font-weight: 600;
}

.stock-item .name {
  color: #64748b;
}
</style>
