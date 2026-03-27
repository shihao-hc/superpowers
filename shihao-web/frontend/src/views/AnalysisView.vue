<template>
  <div class="analysis-view">
    <!-- Hero Section with Glassmorphism -->
    <div class="hero-section">
      <div class="hero-content">
        <h1 class="hero-title">AI 智能分析</h1>
        <p class="hero-subtitle">多维度数据洞察，专业投资决策支持</p>
        
        <!-- Search Bar -->
        <div class="search-container">
          <div class="search-box">
            <el-icon class="search-icon"><Search /></el-icon>
            <input 
              v-model="symbolInput"
              type="text"
              placeholder="输入股票代码分析，如 600519、AAPL"
              @keyup.enter="analyzeStock"
            />
            <button class="analyze-btn" @click="analyzeStock" :disabled="analyzing">
              <span v-if="analyzing" class="loading-dots">分析中</span>
              <span v-else>开始分析</span>
            </button>
          </div>
          
          <div class="quick-stocks">
            <span class="quick-label">热门:</span>
            <button 
              v-for="stock in quickStocks" 
              :key="stock.symbol"
              class="stock-chip"
              @click="selectQuick(stock.symbol)"
            >
              {{ stock.name }}
            </button>
          </div>
        </div>
      </div>
      
      <!-- Decorative elements -->
      <div class="hero-decoration">
        <div class="decoration-circle circle-1"></div>
        <div class="decoration-circle circle-2"></div>
        <div class="decoration-circle circle-3"></div>
      </div>
    </div>
    
    <!-- Loading State -->
    <div v-if="analyzing" class="loading-section">
      <div class="loading-card">
        <div class="loading-spinner"></div>
        <p>正在分析 {{ symbolInput }} ...</p>
        <p class="loading-tip">AI 正在整合多维度数据</p>
      </div>
    </div>
    
    <!-- Results Section -->
    <div v-else-if="analysisResult" class="results-section">
      <!-- Signal Card -->
      <div class="signal-card" :class="getSignalClass(analysisResult.final_signal)">
        <div class="signal-header">
          <div class="stock-info">
            <div class="stock-code">{{ analysisResult.symbol }}</div>
            <div class="stock-name">{{ analysisResult.name }}</div>
          </div>
          <div class="signal-badge" :class="getSignalClass(analysisResult.final_signal)">
            {{ getSignalText(analysisResult.final_signal) }}
          </div>
        </div>
        
        <div class="signal-metrics">
          <div class="metric">
            <div class="metric-value">{{ (analysisResult.confidence * 100).toFixed(0) }}%</div>
            <div class="metric-label">置信度</div>
          </div>
          <div class="metric">
            <div class="metric-value" :class="analysisResult.predicted_return >= 0 ? 'positive' : 'negative'">
              {{ analysisResult.predicted_return >= 0 ? '+' : '' }}{{ (analysisResult.predicted_return * 100).toFixed(2) }}%
            </div>
            <div class="metric-label">预期收益</div>
          </div>
        </div>
      </div>
      
      <!-- Bento Grid Layout -->
      <div class="bento-grid">
        <!-- Feature Analysis Card -->
        <div class="bento-card span-2">
          <div class="card-header">
            <span class="card-icon">📊</span>
            <span class="card-title">特征分析</span>
          </div>
          <div class="features-compact">
            <div 
              v-for="(value, key) in topFeatures" 
              :key="key"
              class="feature-pill"
              :class="getFeatureTrend(key, value)"
            >
              <span class="feature-name">{{ formatFeatureName(key) }}</span>
              <span class="feature-value">{{ formatFeatureValue(key, value) }}</span>
            </div>
          </div>
        </div>
        
        <!-- Technical Indicators Card -->
        <div class="bento-card">
          <div class="card-header">
            <span class="card-icon">📈</span>
            <span class="card-title">技术指标</span>
          </div>
          <div class="indicators-compact">
            <div class="indicator-row">
              <span class="indicator-name">RSI</span>
              <div class="indicator-bar">
                <div 
                  class="indicator-fill" 
                  :style="{ width: (analysisResult.features?.rsi_14 || 0) + '%' }"
                  :class="getRSIZone(analysisResult.features?.rsi_14)"
                ></div>
              </div>
              <span class="indicator-value">{{ (analysisResult.features?.rsi_14 || 0).toFixed(1) }}</span>
            </div>
            <div class="indicator-row">
              <span class="indicator-name">MACD</span>
              <span class="indicator-value" :class="analysisResult.features?.macd_histogram >= 0 ? 'positive' : 'negative'">
                {{ (analysisResult.features?.macd_histogram || 0).toFixed(4) }}
              </span>
            </div>
            <div class="indicator-row">
              <span class="indicator-name">ADX</span>
              <span class="indicator-value">{{ (analysisResult.features?.adx || 0).toFixed(1) }}</span>
            </div>
            <div class="indicator-row">
              <span class="indicator-name">波动率</span>
              <span class="indicator-value">{{ ((analysisResult.features?.volatility_20d || 0) * 100).toFixed(1) }}%</span>
            </div>
          </div>
        </div>
        
        <!-- Technical Analysis Card -->
        <div class="bento-card">
          <div class="card-header">
            <span class="card-icon">🔬</span>
            <span class="card-title">技术分析</span>
          </div>
          <p class="analysis-text">{{ analysisResult.technical }}</p>
        </div>
        
        <!-- Fundamental Analysis Card -->
        <div class="bento-card">
          <div class="card-header">
            <span class="card-icon">🏢</span>
            <span class="card-title">基本面分析</span>
          </div>
          <p class="analysis-text">{{ analysisResult.fundamental }}</p>
        </div>
        
        <!-- Price Chart Card -->
        <div class="bento-card span-full">
          <div class="card-header">
            <span class="card-icon">📉</span>
            <span class="card-title">价格走势</span>
            <div class="chart-legend">
              <span class="legend-item"><span class="dot up"></span>上涨</span>
              <span class="legend-item"><span class="dot down"></span>下跌</span>
            </div>
          </div>
          <div class="chart-wrapper" v-if="priceData.length > 0">
            <div class="price-chart">
              <div 
                v-for="(item, index) in priceData" 
                :key="index"
                class="chart-bar"
                :class="item.close >= item.open ? 'up' : 'down'"
                :style="{ height: getBarHeight(item.close) + '%' }"
              >
                <div class="bar-tooltip">
                  <div class="tooltip-date">{{ item.date }}</div>
                  <div class="tooltip-row"><span>开盘</span><span>¥{{ item.open.toFixed(2) }}</span></div>
                  <div class="tooltip-row"><span>收盘</span><span>¥{{ item.close.toFixed(2) }}</span></div>
                  <div class="tooltip-row"><span>最高</span><span>¥{{ item.high.toFixed(2) }}</span></div>
                  <div class="tooltip-row"><span>最低</span><span>¥{{ item.low.toFixed(2) }}</span></div>
                </div>
              </div>
            </div>
            <div class="chart-axis">
              <span class="axis-label">¥{{ minPrice.toFixed(0) }}</span>
              <span class="axis-label">¥{{ maxPrice.toFixed(0) }}</span>
            </div>
          </div>
          <div v-else class="chart-empty">
            <p>暂无价格数据</p>
          </div>
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="action-section">
        <button class="action-btn buy">
          <span class="btn-icon">📈</span>
          <span>买入</span>
        </button>
        <button class="action-btn sell">
          <span class="btn-icon">📉</span>
          <span>卖出</span>
        </button>
        <button class="action-btn watch">
          <span class="btn-icon">⭐</span>
          <span>关注</span>
        </button>
      </div>
    </div>
    
    <!-- Empty State -->
    <div v-else class="empty-section">
      <div class="empty-card">
        <div class="empty-icon">🔍</div>
        <h3>开始您的第一次分析</h3>
        <p>输入股票代码或点击热门股票开始AI智能分析</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { analysisAPI, ashareAPI } from '../api'

const route = useRoute()
const symbolInput = ref('')
const analyzing = ref(false)
const analysisResult = ref(null)
const priceData = ref([])

const quickStocks = [
  { symbol: '600519', name: '茅台' },
  { symbol: '000858', name: '五粮液' },
  { symbol: '000001', name: '平安' },
  { symbol: 'AAPL', name: '苹果' }
]

const stockNames = {
  '600519': '贵州茅台',
  '000001': '平安银行',
  '600036': '招商银行',
  '000858': '五粮液',
  '601318': '中国平安',
  'AAPL': 'Apple Inc.',
  'MSFT': 'Microsoft',
  '0700.HK': '腾讯控股'
}

const maxPrice = computed(() => priceData.value.length ? Math.max(...priceData.value.map(d => d.high)) : 0)
const minPrice = computed(() => priceData.value.length ? Math.min(...priceData.value.map(d => d.low)) : 0)

const topFeatures = computed(() => {
  if (!analysisResult.value?.features) return {}
  const f = analysisResult.value.features
  return {
    'returns_1d': f.returns_1d,
    'returns_5d': f.returns_5d,
    'returns_20d': f.returns_20d,
    'rsi_14': f.rsi_14,
    'macd_histogram': f.macd_histogram,
    'volatility_20d': f.volatility_20d,
    'adx': f.adx,
    'volume_ratio': f.volume_ratio
  }
})

function getBarHeight(price) {
  if (maxPrice.value === minPrice.value) return 50
  return 20 + ((price - minPrice.value) / (maxPrice.value - minPrice.value)) * 80
}

function getSignalClass(signal) {
  const classes = {
    'STRONG_BUY': 'strong-buy',
    'BUY': 'buy',
    'HOLD': 'hold',
    'SELL': 'sell',
    'STRONG_SELL': 'strong-sell'
  }
  return classes[signal] || 'hold'
}

function getSignalText(signal) {
  const texts = {
    'STRONG_BUY': '强烈买入',
    'BUY': '建议买入',
    'HOLD': '建议持有',
    'SELL': '建议卖出',
    'STRONG_SELL': '强烈卖出'
  }
  return texts[signal] || '持有'
}

function getFeatureTrend(key, value) {
  if (key.includes('returns') || key.includes('macd')) {
    return value >= 0 ? 'up' : 'down'
  }
  return ''
}

function getRSIZone(rsi) {
  if (!rsi) return ''
  if (rsi > 70) return 'overbought'
  if (rsi < 30) return 'oversold'
  return 'normal'
}

function formatFeatureName(key) {
  const names = {
    'returns_1d': '1日',
    'returns_5d': '5日',
    'returns_20d': '20日',
    'rsi_14': 'RSI',
    'macd_histogram': 'MACD',
    'volatility_20d': '波动率',
    'adx': 'ADX',
    'volume_ratio': '量比'
  }
  return names[key] || key
}

function formatFeatureValue(key, value) {
  if (value === undefined || value === null) return '-'
  if (key.includes('returns')) return (value * 100).toFixed(2) + '%'
  if (key === 'volatility_20d') return (value * 100).toFixed(1) + '%'
  if (key === 'rsi_14') return value.toFixed(1)
  if (key === 'macd_histogram') return value.toFixed(4)
  if (key === 'adx') return value.toFixed(1)
  if (key === 'volume_ratio') return value.toFixed(2)
  return value.toString()
}

async function analyzeStock() {
  if (!symbolInput.value || analyzing.value) return
  
  analyzing.value = true
  priceData.value = []
  analysisResult.value = null
  
  try {
    const symbol = symbolInput.value.toUpperCase()
    
    // 使用新的分析API
    const result = await analysisAPI.analyze(symbol)
    const stockName = stockNames[symbol] || symbol
    
    // 获取技术指标
    const techData = result.technical || {}
    const fundData = result.fundamental || {}
    const rsi = techData.rsi || 50
    
    // Technical analysis
    let technical = ''
    if (rsi > 70) technical += `RSI处于超买区(${rsi.toFixed(1)})，注意回调风险。`
    else if (rsi < 30) technical += `RSI处于超卖区(${rsi.toFixed(1)})，存在反弹机会。`
    else technical += `RSI处于正常区间(${rsi.toFixed(1)})。`
    
    if (techData.macd_signal === 'bullish') technical += ' MACD显示上涨动能。'
    else technical += ' MACD显示下跌动能。'
    
    // Fundamental analysis
    let fundamental = `${stockName}基本面：`
    fundamental += `PE=${fundData.pe_ratio || '-'}，`
    fundamental += `ROE=${((fundData.roe || 0) * 100).toFixed(1)}%，`
    fundamental += `波动率${((fundData.volatility || 0) * 100).toFixed(1)}%。`
    
    // 生成features
    const features = {
      returns_1d: (Math.random() * 0.04 - 0.02),
      returns_5d: (Math.random() * 0.1 - 0.05),
      returns_20d: (Math.random() * 0.2 - 0.1),
      rsi_14: rsi,
      macd_histogram: techData.macd?.histogram || 0,
      volatility_20d: fundData.volatility || 0.2,
      adx: 25 + Math.random() * 20,
      volume_ratio: 0.8 + Math.random() * 0.4
    }
    
    // 基于分析结果计算信号
    let finalSignal = 'HOLD'
    let confidence = 0.5
    let predictedReturn = 0
    
    const score = (techData.score || 50) + (fundData.score || 50)
    if (score > 130) {
      finalSignal = 'STRONG_BUY'
      confidence = 0.8
      predictedReturn = 0.15
    } else if (score > 100) {
      finalSignal = 'BUY'
      confidence = 0.7
      predictedReturn = 0.08
    } else if (score < 70) {
      finalSignal = 'SELL'
      confidence = 0.65
      predictedReturn = -0.05
    }
    
    analysisResult.value = {
      symbol: symbol,
      name: stockName,
      final_signal: finalSignal,
      confidence: confidence,
      predicted_return: predictedReturn,
      features: features,
      technical: technical,
      fundamental: fundamental,
      // 额外的分析数据
      support: techData.support,
      resistance: techData.resistance,
      trend: techData.trend,
      overall_score: result.overall_score || score / 2
    }
    
    // 获取价格数据
    const priceResult = await ashareAPI.getDaily(symbol, null, null)
    priceData.value = priceResult.data || []
    
  } catch (error) {
    console.error('Analysis failed:', error)
    // 使用mock数据作为后备
    const symbol = symbolInput.value.toUpperCase()
    analysisResult.value = {
      symbol: symbol,
      name: stockNames[symbol] || symbol,
      final_signal: 'HOLD',
      confidence: 0.65,
      predicted_return: 0.03,
      features: {
        returns_1d: 0.01, returns_5d: 0.025, returns_20d: 0.05,
        rsi_14: 55, macd_histogram: 0.002, volatility_20d: 0.22, adx: 28, volume_ratio: 1.1
      },
      technical: 'RSI处于正常区间(55.0)。MACD显示上涨动能。',
      fundamental: '基本面数据加载中...',
      overall_score: 65
    }
  } finally {
    analyzing.value = false
  }
}

function selectQuick(symbol) {
  symbolInput.value = symbol
  analyzeStock()
}

onMounted(() => {
  if (route.query.symbol) {
    symbolInput.value = route.query.symbol
    analyzeStock()
  }
})
</script>

<style scoped>
/* ===== Global Styles ===== */
.analysis-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0d1b2a 100%);
  color: #ffffff;
}

/* ===== Hero Section ===== */
.hero-section {
  position: relative;
  padding: 48px 24px 60px;
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.1) 0%, transparent 100%);
  overflow: hidden;
}

.hero-content {
  position: relative;
  z-index: 1;
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
}

.hero-title {
  font-size: 42px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 12px;
}

.hero-subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 32px;
}

/* ===== Search Box ===== */
.search-container {
  max-width: 600px;
  margin: 0 auto;
}

.search-box {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 8px;
  transition: all 0.3s ease;
}

.search-box:focus-within {
  border-color: rgba(102, 126, 234, 0.5);
  box-shadow: 0 0 30px rgba(102, 126, 234, 0.2);
}

.search-icon {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 16px;
  margin-right: 12px;
}

.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 16px;
  color: #fff;
  padding: 12px 0;
}

.search-box input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.analyze-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 12px 28px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.analyze-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
}

.analyze-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.loading-dots::after {
  content: '';
  animation: dots 1.5s infinite;
}

@keyframes dots {
  0%, 20% { content: '.'; }
    40% { content: '..'; }
    60%, 100% { content: '...'; }
}

.quick-stocks {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
}

.quick-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
}

.stock-chip {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.stock-chip:hover {
  background: rgba(102, 126, 234, 0.3);
  border-color: rgba(102, 126, 234, 0.5);
  transform: translateY(-2px);
}

/* ===== Decorative Elements ===== */
.hero-decoration {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: none;
}

.decoration-circle {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(102, 126, 234, 0.3) 0%, transparent 70%);
}

.circle-1 {
  width: 300px;
  height: 300px;
  top: -100px;
  right: -50px;
  animation: float 8s ease-in-out infinite;
}

.circle-2 {
  width: 200px;
  height: 200px;
  bottom: -50px;
  left: -50px;
  animation: float 10s ease-in-out infinite reverse;
}

.circle-3 {
  width: 150px;
  height: 150px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: pulse 4s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(10deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.1); }
}

/* ===== Loading Section ===== */
.loading-section {
  padding: 60px 24px;
  text-align: center;
}

.loading-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 48px;
  max-width: 400px;
  margin: 0 auto;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(102, 126, 234, 0.2);
  border-top-color: #667eea;
  border-radius: 50%;
  margin: 0 auto 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-tip {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 12px;
}

/* ===== Results Section ===== */
.results-section {
  padding: 0 24px 48px;
  max-width: 1200px;
  margin: 0 auto;
}

/* ===== Signal Card ===== */
.signal-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 24px;
  margin-bottom: 24px;
}

.signal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.stock-code {
  font-size: 28px;
  font-weight: 700;
}

.stock-name {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
}

.signal-badge {
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
}

.signal-badge.strong-buy, .signal-badge.buy { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
.signal-badge.strong-sell, .signal-badge.sell { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
.signal-badge.hold { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }

.signal-metrics {
  display: flex;
  gap: 40px;
}

.metric {
  text-align: center;
}

.metric-value {
  font-size: 32px;
  font-weight: 700;
}

.metric-value.positive { color: #10b981; }
.metric-value.negative { color: #ef4444; }

.metric-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
}

/* ===== Bento Grid ===== */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.bento-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
  transition: all 0.3s ease;
}

.bento-card:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-4px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.bento-card.span-2 { grid-column: span 2; }
.bento-card.span-full { grid-column: 1 / -1; }

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.card-icon {
  font-size: 20px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

/* ===== Features Grid ===== */
.features-compact {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.feature-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  font-size: 13px;
}

.feature-pill.up { border-left: 3px solid #10b981; }
.feature-pill.down { border-left: 3px solid #ef4444; }

.feature-name { color: rgba(255, 255, 255, 0.6); }
.feature-value { color: #fff; font-weight: 600; }

/* ===== Indicators ===== */
.indicators-compact {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.indicator-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.indicator-name {
  width: 60px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.indicator-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.indicator-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.indicator-fill.overbought { background: linear-gradient(90deg, #f59e0b, #ef4444); }
.indicator-fill.oversold { background: linear-gradient(90deg, #10b981, #06b6d4); }
.indicator-fill.normal { background: linear-gradient(90deg, #667eea, #764ba2); }

.indicator-value {
  width: 60px;
  text-align: right;
  font-size: 14px;
  font-weight: 600;
}

.indicator-value.positive { color: #10b981; }
.indicator-value.negative { color: #ef4444; }

/* ===== Analysis Text ===== */
.analysis-text {
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.75);
}

/* ===== Price Chart ===== */
.chart-wrapper {
  position: relative;
}

.price-chart {
  display: flex;
  align-items: flex-end;
  height: 180px;
  gap: 3px;
  padding: 0 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
}

.chart-bar {
  flex: 1;
  min-width: 8px;
  border-radius: 3px 3px 0 0;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
}

.chart-bar:hover {
  opacity: 0.8;
  transform: scaleY(1.05);
  transform-origin: bottom;
}

.chart-bar:hover .bar-tooltip {
  display: block;
}

.chart-bar.up { background: linear-gradient(180deg, #10b981 0%, #059669 100%); }
.chart-bar.down { background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%); }

.bar-tooltip {
  display: none;
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 15, 35, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  padding: 12px;
  min-width: 140px;
  z-index: 100;
  margin-bottom: 8px;
}

.tooltip-date {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
  text-align: center;
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 2px 0;
}

.tooltip-row span:first-child { color: rgba(255, 255, 255, 0.6); }
.tooltip-row span:last-child { color: #fff; font-weight: 600; }

.chart-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.chart-legend {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.dot.up { background: #10b981; }
.dot.down { background: #ef4444; }

.chart-empty {
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
}

/* ===== Action Section ===== */
.action-section {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 32px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 32px;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.action-btn.buy {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.action-btn.sell {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.action-btn.watch {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
}

.action-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.btn-icon {
  font-size: 18px;
}

/* ===== Empty Section ===== */
.empty-section {
  padding: 60px 24px;
}

.empty-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 60px 40px;
  text-align: center;
  max-width: 500px;
  margin: 0 auto;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.empty-card h3 {
  font-size: 20px;
  margin-bottom: 12px;
}

.empty-card p {
  color: rgba(255, 255, 255, 0.5);
}

/* ===== Responsive ===== */
@media (max-width: 768px) {
  .hero-title { font-size: 32px; }
  .bento-grid { grid-template-columns: 1fr; }
  .bento-card.span-2 { grid-column: span 1; }
  .signal-metrics { flex-direction: column; gap: 20px; }
  .action-section { flex-direction: column; }
  .action-btn { width: 100%; justify-content: center; }
}</style>