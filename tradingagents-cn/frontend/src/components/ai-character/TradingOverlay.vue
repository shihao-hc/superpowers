<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { VTuberAvatar, VoiceSync, ChatBubble } from './index'

export interface TradingOverlayProps {
  stockCode?: string
  stockName?: string
  currentPrice?: number
  priceChange?: number
  priceChangePercent?: number
  aiStatus?: 'idle' | 'analyzing' | 'thinking' | 'speaking'
  analysisPhase?: string
  confidence?: number
  recommendation?: 'buy' | 'sell' | 'hold'
  showMiniChart?: boolean
  theme?: 'dark' | 'light' | 'neon'
}

const props = withDefaults(defineProps<TradingOverlayProps>(), {
  stockCode: '',
  stockName: '',
  currentPrice: 0,
  priceChange: 0,
  priceChangePercent: 0,
  aiStatus: 'idle',
  analysisPhase: '',
  confidence: 0,
  recommendation: 'hold',
  showMiniChart: true,
  theme: 'dark'
})

const emit = defineEmits<{
  (e: 'startAnalysis'): void
  (e: 'stopAnalysis'): void
  (e: 'changeStock', code: string): void
}>()

const avatarRef = ref<InstanceType<typeof VTuberAvatar> | null>(null)
const voiceSyncRef = ref<InstanceType<typeof VoiceSync> | null>(null)
const showAnalysisPanel = ref(false)
const chatMessages = ref<Array<{ text: string; type: string }>>([])
const chartData = ref<number[]>([])

const priceDirection = computed(() => {
  if (props.priceChange > 0) return 'up'
  if (props.priceChange < 0) return 'down'
  return 'neutral'
})

const recommendationStyle = computed(() => {
  const styles = {
    buy: { color: '#52c41a', icon: '📈', text: '买入' },
    sell: { color: '#ff4d4f', icon: '📉', text: '卖出' },
    hold: { color: '#faad14', icon: '⏸️', text: '持有' }
  }
  return styles[props.recommendation]
})

const confidenceLevel = computed(() => {
  if (props.confidence >= 80) return 'high'
  if (props.confidence >= 60) return 'medium'
  return 'low'
})

// Generate mock chart data
function generateChartData() {
  const data: number[] = []
  let value = props.currentPrice || 100
  for (let i = 0; i < 30; i++) {
    value += (Math.random() - 0.5) * 5
    data.push(Math.max(0, value))
  }
  chartData.value = data
}

// Speak analysis result
function speakAnalysis(text: string) {
  if (avatarRef.value && voiceSyncRef.value) {
    voiceSyncRef.value.speak(text)
  }
  chatMessages.value.push({ text, type: 'analysis' })
}

// AI commentary based on status
function getAICommentary(): string {
  const commentaries: Record<string, string[]> = {
    idle: ['准备好了，随时为您分析！', '有什么想了解的股票吗？'],
    analyzing: ['正在分析市场数据...', '让我看看技术指标...', '收集新闻信息中...'],
    thinking: ['嗯，让我想想...', '这个情况有点复杂...', '需要考虑几个因素...'],
    speaking: ['根据我的分析...', '我建议您...', '综合来看...']
  }
  const messages = commentaries[props.aiStatus] || commentaries.idle
  return messages[Math.floor(Math.random() * messages.length)]
}

function handleStartAnalysis() {
  emit('startAnalysis')
  showAnalysisPanel.value = true
  avatarRef.value?.setExpression('thinking')
  speakAnalysis('开始分析 ' + props.stockCode)
}

function handleStopAnalysis() {
  emit('stopAnalysis')
  avatarRef.value?.setExpression('neutral')
}

function handleStockChange(event: Event) {
  const input = event.target as HTMLInputElement
  emit('changeStock', input.value)
}

onMounted(() => {
  generateChartData()
})

watch(() => props.aiStatus, (status) => {
  if (status === 'speaking') {
    const commentary = getAICommentary()
    speakAnalysis(commentary)
  }
})
</script>

<template>
  <div class="trading-overlay" :class="`theme-${props.theme}`">
    <!-- Main layout -->
    <div class="overlay-layout">
      
      <!-- Left panel: VTuber Avatar -->
      <div class="avatar-panel">
        <VTuberAvatar
          ref="avatarRef"
          name="AI Analyst"
          character="cat"
          theme="ocean"
          size="large"
          :status="props.aiStatus"
          :showCompanion="true"
          companionType="cat"
          :animated="true"
        />
        
        <!-- Voice sync visualization -->
        <VoiceSync
          ref="voiceSyncRef"
          :showWaveform="true"
          :enableLipSync="true"
        />
      </div>
      
      <!-- Center panel: Stock info & Chart -->
      <div class="info-panel">
        <!-- Stock header -->
        <div class="stock-header">
          <div class="stock-input">
            <input 
              type="text" 
              :value="props.stockCode"
              @change="handleStockChange"
              placeholder="输入股票代码"
              class="stock-code-input"
            />
          </div>
          <h2 class="stock-name">{{ props.stockName || '股票分析' }}</h2>
        </div>
        
        <!-- Price display -->
        <div class="price-display">
          <span class="current-price">{{ props.currentPrice.toFixed(2) }}</span>
          <span class="price-change" :class="priceDirection">
            <span class="arrow">{{ priceDirection === 'up' ? '↑' : priceDirection === 'down' ? '↓' : '→' }}</span>
            <span>{{ props.priceChange.toFixed(2) }}</span>
            <span class="percent">({{ props.priceChangePercent.toFixed(2) }}%)</span>
          </span>
        </div>
        
        <!-- Mini chart -->
        <div v-if="props.showMiniChart" class="mini-chart">
          <svg viewBox="0 0 300 100" class="chart-svg">
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#52c41a" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="#52c41a" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <polyline
              :points="chartData.map((v, i) => `${i * 10},${100 - (v - Math.min(...chartData)) / (Math.max(...chartData) - Math.min(...chartData)) * 80}`).join(' ')"
              fill="none"
              :stroke="priceDirection === 'up' ? '#52c41a' : priceDirection === 'down' ? '#ff4d4f' : '#faad14'"
              stroke-width="2"
            />
          </svg>
        </div>
        
        <!-- Analysis phase -->
        <div v-if="props.analysisPhase" class="analysis-phase">
          <span class="phase-label">当前阶段:</span>
          <span class="phase-value">{{ props.analysisPhase }}</span>
        </div>
        
        <!-- AI Recommendation -->
        <div class="recommendation-card" :style="{ borderColor: recommendationStyle.color }">
          <div class="rec-icon">{{ recommendationStyle.icon }}</div>
          <div class="rec-content">
            <span class="rec-label">AI 建议</span>
            <span class="rec-value" :style="{ color: recommendationStyle.color }">
              {{ recommendationStyle.text }}
            </span>
          </div>
          <div class="confidence-meter">
            <span class="conf-label">置信度</span>
            <div class="conf-bar">
              <div 
                class="conf-fill" 
                :class="confidenceLevel"
                :style="{ width: `${props.confidence}%` }"
              ></div>
            </div>
            <span class="conf-value">{{ props.confidence }}%</span>
          </div>
        </div>
      </div>
      
      <!-- Right panel: Controls & Chat -->
      <div class="control-panel">
        <!-- Action buttons -->
        <div class="action-buttons">
          <button 
            class="action-btn start-btn" 
            @click="handleStartAnalysis"
            :disabled="props.aiStatus === 'analyzing'"
          >
            <span class="btn-icon">🔍</span>
            <span>开始分析</span>
          </button>
          <button 
            class="action-btn stop-btn" 
            @click="handleStopAnalysis"
            :disabled="props.aiStatus === 'idle'"
          >
            <span class="btn-icon">⏹️</span>
            <span>停止</span>
          </button>
        </div>
        
        <!-- Status display -->
        <div class="status-display">
          <div class="status-item" :class="`status-${props.aiStatus}`">
            <span class="status-dot"></span>
            <span class="status-text">
              {{ props.aiStatus === 'idle' ? '待机' : 
                 props.aiStatus === 'analyzing' ? '分析中' : 
                 props.aiStatus === 'thinking' ? '思考中' : '播报中' }}
            </span>
          </div>
        </div>
        
        <!-- Chat history -->
        <div class="chat-history">
          <div 
            v-for="(msg, index) in chatMessages.slice(-5)" 
            :key="index"
            class="chat-item"
            :class="`type-${msg.type}`"
          >
            {{ msg.text }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Bottom bar: Quick actions -->
    <div class="bottom-bar">
      <div class="quick-stocks">
        <button class="stock-chip" @click="emit('changeStock', '000001.SZ')">平安银行</button>
        <button class="stock-chip" @click="emit('changeStock', '600519.SH')">贵州茅台</button>
        <button class="stock-chip" @click="emit('changeStock', '000858.SZ')">五粮液</button>
        <button class="stock-chip" @click="emit('changeStock', '300750.SZ')">宁德时代</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trading-overlay {
  width: 100%;
  height: 100%;
  min-height: 500px;
  border-radius: 20px;
  overflow: hidden;
}

/* Themes */
.theme-dark {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: white;
}

.theme-light {
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%);
  color: #333;
}

.theme-neon {
  background: linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 100%);
  color: #fff;
  box-shadow: 0 0 30px rgba(138, 43, 226, 0.3);
}

/* Layout */
.overlay-layout {
  display: grid;
  grid-template-columns: 300px 1fr 280px;
  gap: 20px;
  padding: 20px;
  height: calc(100% - 60px);
}

/* Avatar panel */
.avatar-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

/* Info panel */
.info-panel {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.stock-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stock-code-input {
  width: 150px;
  padding: 8px 15px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  color: inherit;
  font-size: 14px;
  outline: none;
}

.stock-name {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.price-display {
  display: flex;
  align-items: baseline;
  gap: 15px;
}

.current-price {
  font-size: 48px;
  font-weight: 700;
}

.price-change {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 18px;
}

.price-change.up { color: #52c41a; }
.price-change.down { color: #ff4d4f; }
.price-change.neutral { color: #faad14; }

.arrow {
  font-size: 24px;
}

/* Mini chart */
.mini-chart {
  height: 100px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 10px;
}

.chart-svg {
  width: 100%;
  height: 100%;
}

/* Analysis phase */
.analysis-phase {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 15px;
  background: rgba(24, 144, 255, 0.2);
  border-radius: 10px;
}

.phase-label {
  color: #999;
  font-size: 14px;
}

.phase-value {
  color: #1890ff;
  font-weight: 600;
}

/* Recommendation card */
.recommendation-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 15px;
  border: 2px solid;
}

.rec-icon {
  font-size: 40px;
}

.rec-content {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.rec-label {
  font-size: 12px;
  color: #999;
}

.rec-value {
  font-size: 24px;
  font-weight: 700;
}

.confidence-meter {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.conf-label {
  font-size: 12px;
  color: #999;
}

.conf-bar {
  width: 100px;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.conf-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.conf-fill.high { background: #52c41a; }
.conf-fill.medium { background: #faad14; }
.conf-fill.low { background: #ff4d4f; }

.conf-value {
  font-size: 14px;
  font-weight: 600;
}

/* Control panel */
.control-panel {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 15px 20px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.start-btn {
  background: linear-gradient(135deg, #52c41a, #73d13d);
  color: white;
}

.start-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(82, 196, 26, 0.4);
}

.stop-btn {
  background: linear-gradient(135deg, #ff4d4f, #ff7875);
  color: white;
}

.stop-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(255, 77, 79, 0.4);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Status display */
.status-display {
  padding: 15px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.status-idle .status-dot { background: #8c8c8c; }
.status-analyzing .status-dot { background: #1890ff; animation: pulse 1s infinite; }
.status-thinking .status-dot { background: #722ed1; animation: pulse 0.5s infinite; }
.status-speaking .status-dot { background: #52c41a; animation: pulse 0.75s infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

/* Chat history */
.chat-history {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  overflow-y: auto;
  max-height: 200px;
}

.chat-item {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.4;
}

.chat-item.type-analysis { border-left: 3px solid #52c41a; }
.chat-item.type-warning { border-left: 3px solid #faad14; }

/* Bottom bar */
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 15px 20px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.quick-stocks {
  display: flex;
  gap: 10px;
}

.stock-chip {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.stock-chip:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}
</style>
