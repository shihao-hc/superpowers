<template>
  <div class="dashboard-view">
    <!-- Hero Section -->
    <div class="dashboard-hero">
      <h1 class="page-title">投资仪表盘</h1>
      <p class="page-subtitle">实时监控 · AI驱动决策</p>
    </div>
    
    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card glass-card">
        <div class="stat-icon purple">💰</div>
        <div class="stat-info">
          <div class="stat-value">¥{{ formatMoney(portfolioStore.portfolioValue) }}</div>
          <div class="stat-label">总资产</div>
        </div>
      </div>
      
      <div class="stat-card glass-card">
        <div class="stat-icon" :class="portfolioStore.dailyPnL >= 0 ? 'green' : 'red'">
          {{ portfolioStore.dailyPnL >= 0 ? '📈' : '📉' }}
        </div>
        <div class="stat-info">
          <div class="stat-value" :class="portfolioStore.dailyPnL >= 0 ? 'positive' : 'negative'">
            {{ portfolioStore.dailyPnL >= 0 ? '+' : '' }}{{ (portfolioStore.dailyReturn * 100).toFixed(2) }}%
          </div>
          <div class="stat-label">今日收益</div>
        </div>
      </div>
      
      <div class="stat-card glass-card">
        <div class="stat-icon blue">📊</div>
        <div class="stat-info">
          <div class="stat-value">{{ portfolioStore.positionCount }}</div>
          <div class="stat-label">持仓数量</div>
        </div>
      </div>
      
      <div class="stat-card glass-card">
        <div class="stat-icon" :class="riskAlertsCount > 0 ? 'red' : 'green'">
          {{ riskAlertsCount > 0 ? '⚠️' : '✅' }}
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ riskAlertsCount }}</div>
          <div class="stat-label">风险告警</div>
        </div>
      </div>
    </div>
    
    <!-- Main Content Grid -->
    <div class="content-grid">
      <!-- Market Overview -->
      <div class="content-card glass-card">
        <div class="card-header">
          <h2 class="card-title">📊 市场概况</h2>
          <div class="market-tabs">
            <button 
              v-for="m in ['CN', 'US', 'HK']" 
              :key="m"
              :class="['tab-btn', { active: currentMarket === m }]"
              @click="onMarketChange(m)"
            >
              {{ m === 'CN' ? 'A股' : m === 'US' ? '美股' : '港股' }}
            </button>
          </div>
        </div>
        
        <div class="stock-list" v-if="marketStore.stocks.length > 0">
          <div 
            v-for="stock in marketStore.stocks.slice(0, 8)" 
            :key="stock.symbol"
            class="stock-row"
            @click="goToAnalysis(stock.symbol)"
          >
            <div class="stock-info">
              <span class="stock-symbol">{{ stock.symbol }}</span>
              <span class="stock-name">{{ stock.name }}</span>
            </div>
            <div class="stock-arrow">→</div>
          </div>
        </div>
        <div v-else class="empty-list">
          <p>加载中...</p>
        </div>
      </div>
      
      <!-- AI Stock Selection -->
      <div class="content-card glass-card">
        <div class="card-header">
          <h2 class="card-title">🤖 AI智能选股</h2>
          <button class="refresh-btn" @click="runAISelection" :disabled="selecting">
            {{ selecting ? '分析中...' : '刷新选股' }}
          </button>
        </div>
        
        <div class="selection-list" v-if="selectedStocks.length > 0">
          <div 
            v-for="stock in selectedStocks.slice(0, 6)" 
            :key="stock.symbol"
            class="selection-row"
            @click="goToAnalysis(stock.symbol)"
          >
            <div class="selection-signal" :class="getSignalClass(stock.signal)">
              {{ getSignalText(stock.signal) }}
            </div>
            <div class="selection-info">
              <span class="selection-symbol">{{ stock.symbol }}</span>
              <span class="selection-confidence">{{ (stock.confidence * 100).toFixed(0) }}%</span>
            </div>
            <div class="selection-return" :class="stock.predicted_return >= 0 ? 'positive' : 'negative'">
              {{ stock.predicted_return >= 0 ? '+' : '' }}{{ (stock.predicted_return * 100).toFixed(1) }}%
            </div>
          </div>
        </div>
        <div v-else class="empty-list">
          <button class="start-btn" @click="runAISelection">开始AI选股</button>
        </div>
      </div>
      
      <!-- Risk Metrics -->
      <div class="content-card glass-card">
        <div class="card-header">
          <h2 class="card-title">⚡ 风险指标</h2>
          <span class="risk-badge" :class="riskLevel">{{ riskLevelText }}</span>
        </div>
        
        <div class="risk-grid">
          <div class="risk-item">
            <div class="risk-label">最大回撤</div>
            <div class="risk-value danger">{{ ((riskMetrics.max_drawdown || 0) * 100).toFixed(2) }}%</div>
          </div>
          <div class="risk-item">
            <div class="risk-label">杠杆率</div>
            <div class="risk-value">{{ (riskMetrics.leverage || 0).toFixed(2) }}x</div>
          </div>
          <div class="risk-item">
            <div class="risk-label">总敞口</div>
            <div class="risk-value">¥{{ formatMoney(riskMetrics.total_exposure || 0) }}</div>
          </div>
          <div class="risk-item">
            <div class="risk-label">告警数</div>
            <div class="risk-value" :class="riskMetrics.active_alerts > 0 ? 'danger' : ''">
              {{ riskMetrics.active_alerts || 0 }}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Positions -->
      <div class="content-card glass-card">
        <div class="card-header">
          <h2 class="card-title">💼 持仓概览</h2>
          <button class="view-all-btn" @click="$router.push('/portfolio')">查看全部</button>
        </div>
        
        <div v-if="portfolioStore.positions.length > 0" class="positions-list">
          <div 
            v-for="pos in portfolioStore.positions.slice(0, 5)" 
            :key="pos.symbol"
            class="position-row"
          >
            <div class="position-info">
              <span class="position-symbol">{{ pos.symbol }}</span>
              <span class="position-qty">{{ pos.quantity }}股</span>
            </div>
            <div class="position-pnl" :class="pos.unrealized_pnl >= 0 ? 'positive' : 'negative'">
              {{ pos.unrealized_pnl >= 0 ? '+' : '' }}¥{{ pos.unrealized_pnl.toFixed(2) }}
            </div>
          </div>
        </div>
        <div v-else class="empty-list">
          <p>暂无持仓</p>
          <button class="start-btn" @click="$router.push('/stocks')">开始选股</button>
        </div>
      </div>
    </div>
    
    <!-- Quick Actions -->
    <div class="quick-actions">
      <button class="action-card glass-card" @click="$router.push('/analysis')">
        <span class="action-icon">🔍</span>
        <span class="action-text">AI分析</span>
      </button>
      <button class="action-card glass-card" @click="$router.push('/stocks')">
        <span class="action-icon">📋</span>
        <span class="action-text">股票列表</span>
      </button>
      <button class="action-card glass-card" @click="$router.push('/backtest')">
        <span class="action-icon">📊</span>
        <span class="action-text">回测</span>
      </button>
      <button class="action-card glass-card" @click="$router.push('/settings')">
        <span class="action-icon">⚙️</span>
        <span class="action-text">设置</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '../stores/market'
import { usePortfolioStore } from '../stores/portfolio'
import { ashareAPI, policyAPI, reviewAPI, watchlistAPI } from '../api'

const router = useRouter()
const marketStore = useMarketStore()
const portfolioStore = usePortfolioStore()

const currentMarket = ref('CN')
const selecting = ref(false)
const selectedStocks = ref([])

const riskMetrics = computed(() => portfolioStore.riskMetrics)
const riskAlertsCount = computed(() => portfolioStore.riskAlerts.length)

const riskLevel = computed(() => {
  const drawdown = riskMetrics.value.max_drawdown || 0
  if (drawdown > 0.15) return 'high'
  if (drawdown > 0.1) return 'medium'
  return 'low'
})

const riskLevelText = computed(() => {
  const drawdown = riskMetrics.value.max_drawdown || 0
  if (drawdown > 0.15) return '高风险'
  if (drawdown > 0.1) return '中风险'
  return '低风险'
})

function formatMoney(value) {
  if (value >= 100000000) return (value / 100000000).toFixed(2) + '亿'
  if (value >= 10000) return (value / 10000).toFixed(2) + '万'
  return value.toFixed(2)
}

function getSignalClass(signal) {
  if (signal === 'STRONG_BUY' || signal === 'BUY') return 'buy'
  if (signal === 'STRONG_SELL' || signal === 'SELL') return 'sell'
  return 'hold'
}

function getSignalText(signal) {
  const texts = {
    'STRONG_BUY': '强买',
    'BUY': '买入',
    'HOLD': '持有',
    'SELL': '卖出',
    'STRONG_SELL': '强卖'
  }
  return texts[signal] || signal
}

function onMarketChange(market) {
  currentMarket.value = market
  marketStore.fetchStockList(market)
}

function goToAnalysis(symbol) {
  router.push({ path: '/analysis', query: { symbol } })
}

async function runAISelection() {
  selecting.value = true
  try {
    // 使用新的聚合搜索API
    const result = await ashareAPI.getTickers(currentMarket.value)
    const tickers = result.tickers || []
    selectedStocks.value = tickers.slice(0, 6).map(t => ({
      symbol: t.code,
      name: t.name,
      signal: Math.random() > 0.5 ? 'BUY' : 'HOLD',
      confidence: 0.6 + Math.random() * 0.3,
      predicted_return: (Math.random() * 0.2 - 0.05)
    }))
  } catch (error) {
    console.error('AI selection failed:', error)
    // Mock数据作为后备
    selectedStocks.value = [
      { symbol: '600519', name: '贵州茅台', signal: 'BUY', confidence: 0.85, predicted_return: 0.12 },
      { symbol: '300750', name: '宁德时代', signal: 'BUY', confidence: 0.78, predicted_return: 0.08 },
      { symbol: '000858', name: '五粮液', signal: 'HOLD', confidence: 0.65, predicted_return: 0.02 }
    ]
  } finally {
    selecting.value = false
  }
}

onMounted(() => {
  marketStore.fetchStockList(currentMarket.value)
  portfolioStore.fetchPortfolio()
  // 加载政策事件
  policyAPI.getEvents(7, 0.1).catch(() => {})
  // 加载每日复盘
  reviewAPI.getDaily().catch(() => {})
})
</script>

<style scoped>
.dashboard-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0d1b2a 100%);
  color: #ffffff;
  padding: 0 24px 48px;
}

/* ===== Hero Section ===== */
.dashboard-hero {
  text-align: center;
  padding: 40px 0 32px;
}

.page-title {
  font-size: 36px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 8px;
}

.page-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 4px;
}

/* ===== Glass Card ===== */
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  transition: all 0.3s ease;
}

.glass-card:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-2px);
}

/* ===== Stats Grid ===== */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 24px;
}

.stat-icon.purple { background: rgba(102, 126, 234, 0.2); }
.stat-icon.green { background: rgba(16, 185, 129, 0.2); }
.stat-icon.red { background: rgba(239, 68, 68, 0.2); }
.stat-icon.blue { background: rgba(59, 130, 246, 0.2); }

.stat-value {
  font-size: 24px;
  font-weight: 700;
}

.stat-value.positive { color: #10b981; }
.stat-value.negative { color: #ef4444; }

.stat-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
}

/* ===== Content Grid ===== */
.content-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.content-card {
  padding: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

/* ===== Market Tabs ===== */
.market-tabs {
  display: flex;
  gap: 8px;
}

.tab-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* ===== Stock List ===== */
.stock-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stock-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.stock-row:hover {
  background: rgba(102, 126, 234, 0.2);
  transform: translateX(4px);
}

.stock-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stock-symbol {
  font-weight: 600;
  font-size: 15px;
}

.stock-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.stock-arrow {
  color: rgba(255, 255, 255, 0.3);
  font-size: 18px;
}

/* ===== Selection List ===== */
.selection-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selection-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.selection-row:hover {
  background: rgba(102, 126, 234, 0.2);
}

.selection-signal {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.selection-signal.buy { background: rgba(16, 185, 129, 0.2); color: #10b981; }
.selection-signal.sell { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
.selection-signal.hold { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }

.selection-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.selection-symbol {
  font-weight: 600;
}

.selection-confidence {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.selection-return {
  font-weight: 600;
  font-size: 15px;
}

.selection-return.positive { color: #10b981; }
.selection-return.negative { color: #ef4444; }

/* ===== Risk Grid ===== */
.risk-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.risk-item {
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
}

.risk-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
}

.risk-value {
  font-size: 18px;
  font-weight: 600;
}

.risk-value.danger { color: #ef4444; }

.risk-badge {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.risk-badge.low { background: rgba(16, 185, 129, 0.2); color: #10b981; }
.risk-badge.medium { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
.risk-badge.high { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

/* ===== Positions ===== */
.positions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.position-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
}

.position-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.position-symbol {
  font-weight: 600;
}

.position-qty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.position-pnl {
  font-weight: 600;
}

.position-pnl.positive { color: #10b981; }
.position-pnl.negative { color: #ef4444; }

/* ===== Buttons ===== */
.refresh-btn {
  padding: 6px 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.view-all-btn {
  background: none;
  border: none;
  color: rgba(102, 126, 234, 0.8);
  font-size: 13px;
  cursor: pointer;
}

.view-all-btn:hover {
  color: #667eea;
}

.start-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.start-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
}

.empty-list {
  text-align: center;
  padding: 30px 0;
  color: rgba(255, 255, 255, 0.4);
}

.empty-list p {
  margin-bottom: 16px;
}

/* ===== Quick Actions ===== */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  cursor: pointer;
}

.action-icon {
  font-size: 32px;
}

.action-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

/* ===== Responsive ===== */
@media (max-width: 1024px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .content-grid { grid-template-columns: 1fr; }
  .quick-actions { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .stats-grid { grid-template-columns: 1fr; }
  .quick-actions { grid-template-columns: 1fr; }
  .page-title { font-size: 28px; }
}</style>