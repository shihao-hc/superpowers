<template>
  <div class="portfolio-analytics">
    <el-row :gutter="20">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="metric-card glass-card">
          <div class="metric-icon returns-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 6l-9.5 9.5-5-5L1 18"/>
              <path d="M17 6h6v6"/>
            </svg>
          </div>
          <div class="metric-value" :class="performance.total_return >= 0 ? 'up' : 'down'">
            {{ performance.total_return >= 0 ? '+' : '' }}{{ performance.total_return.toFixed(2) }}
          </div>
          <div class="metric-label">总收益 (¥)</div>
          <div class="metric-sub" :class="performance.total_return_pct >= 0 ? 'up' : 'down'">
            {{ performance.total_return_pct >= 0 ? '+' : '' }}{{ performance.total_return_pct.toFixed(2) }}%
          </div>
        </div>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6">
        <div class="metric-card glass-card">
          <div class="metric-icon sharpe-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M2 12h20"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <div class="metric-value">{{ performance.sharpe_ratio.toFixed(2) }}</div>
          <div class="metric-label">夏普比率</div>
          <div class="metric-sub">风险调整收益</div>
        </div>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6">
        <div class="metric-card glass-card">
          <div class="metric-icon drawdown-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3v18h18"/>
              <path d="M7 14l4-4 4 4 5-5"/>
            </svg>
          </div>
          <div class="metric-value down">-{{ performance.max_drawdown.toFixed(2) }}%</div>
          <div class="metric-label">最大回撤</div>
          <div class="metric-sub">历史最大</div>
        </div>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6">
        <div class="metric-card glass-card">
          <div class="metric-icon winrate-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 7h-9"/>
              <path d="M14 17H5"/>
              <circle cx="17" cy="17" r="3"/>
              <circle cx="7" cy="7" r="3"/>
            </svg>
          </div>
          <div class="metric-value up">{{ performance.win_rate.toFixed(1) }}%</div>
          <div class="metric-label">胜率</div>
          <div class="metric-sub">盈利交易占比</div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :xs="24" :lg="14">
        <div class="glass-card chart-card">
          <div class="card-header">
            <h3>权益曲线</h3>
            <div class="chart-legend">
              <span class="legend-item equity">
                <span class="legend-dot"></span>
                权益
              </span>
              <span class="legend-item drawdown">
                <span class="legend-dot"></span>
                回撤
              </span>
            </div>
          </div>
          <div class="chart-container" ref="chartContainer">
            <svg class="equity-chart" :viewBox="`0 0 ${chartWidth} ${chartHeight}`" preserveAspectRatio="none">
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="rgba(16, 185, 129, 0.3)"/>
                  <stop offset="100%" stop-color="rgba(16, 185, 129, 0)"/>
                </linearGradient>
                <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="rgba(239, 68, 68, 0.3)"/>
                  <stop offset="100%" stop-color="rgba(239, 68, 68, 0)"/>
                </linearGradient>
              </defs>
              <path :d="equityAreaPath" fill="url(#equityGradient)"/>
              <path :d="equityLinePath" fill="none" stroke="#10b981" stroke-width="2"/>
              <path :d="drawdownAreaPath" fill="url(#drawdownGradient)"/>
              <path :d="drawdownLinePath" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,2"/>
              <g class="grid-lines">
                <line v-for="i in 5" :key="'h'+i" :x1="padding.left" :y1="padding.top + (chartHeight - padding.top - padding.bottom) * (i-1) / 4" :x2="chartWidth - padding.right" :y2="padding.top + (chartHeight - padding.top - padding.bottom) * (i-1) / 4" stroke="rgba(148, 163, 184, 0.1)" stroke-dasharray="2,2"/>
              </g>
            </svg>
          </div>
        </div>
      </el-col>
      
      <el-col :xs="24" :lg="10">
        <div class="glass-card allocation-card">
          <div class="card-header">
            <h3>持仓分布</h3>
          </div>
          <div class="allocation-chart">
            <svg viewBox="0 0 200 200" class="pie-chart">
              <g :transform="`translate(${pieCenter}, ${pieCenter})`">
                <path
                  v-for="(segment, index) in pieSegments"
                  :key="index"
                  :d="segment.path"
                  :fill="segment.color"
                  class="pie-segment"
                  @mouseenter="hoveredSegment = index"
                  @mouseleave="hoveredSegment = null"
                />
              </g>
            </svg>
            <div class="allocation-legend">
              <div
                v-for="(item, index) in allocationItems"
                :key="index"
                class="legend-row"
                @mouseenter="hoveredSegment = index"
                @mouseleave="hoveredSegment = null"
              >
                <span class="legend-color" :style="{ backgroundColor: pieColors[index] }"></span>
                <span class="legend-label">{{ item.symbol }}</span>
                <span class="legend-value">{{ item.value.toFixed(1) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :xs="24" :md="12">
        <div class="glass-card stats-card">
          <div class="card-header">
            <h3>交易统计</h3>
          </div>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">盈利因子</span>
              <span class="stat-value">{{ performance.profit_factor.toFixed(2) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">交易次数</span>
              <span class="stat-value">{{ performance.total_trades }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">平均收益</span>
              <span class="stat-value" :class="performance.avg_trade_return >= 0 ? 'up' : 'down'">
                {{ performance.avg_trade_return >= 0 ? '+' : '' }}{{ performance.avg_trade_return.toFixed(2) }}%
              </span>
            </div>
          </div>
        </div>
      </el-col>
      
      <el-col :xs="24" :md="12">
        <div class="glass-card stats-card">
          <div class="card-header">
            <h3>Top 持仓</h3>
          </div>
          <div class="top-positions">
            <div v-for="pos in topPositions" :key="pos.symbol" class="position-row">
              <span class="pos-symbol">{{ pos.symbol }}</span>
              <span class="pos-pnl" :class="pos.unrealized_pnl >= 0 ? 'up' : 'down'">
                {{ pos.unrealized_pnl >= 0 ? '+' : '' }}{{ pos.unrealized_pnl.toFixed(0) }}
              </span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { usePortfolioStore } from '../stores/portfolio'

const portfolioStore = usePortfolioStore()

const chartContainer = ref(null)
const chartWidth = ref(600)
const chartHeight = 280
const padding = { top: 20, right: 20, bottom: 30, left: 60 }
const hoveredSegment = ref(null)

const pieColors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
const pieCenter = 70
const pieRadius = 60

const performance = computed(() => {
  if (portfolioStore.analytics?.performance) {
    return portfolioStore.analytics.performance
  }
  return {
    total_return: 0,
    total_return_pct: 0,
    sharpe_ratio: 1.5,
    max_drawdown: 5.0,
    win_rate: 55.0,
    profit_factor: 1.8,
    total_trades: 90,
    avg_trade_return: 0.65
  }
})

const equityCurve = computed(() => portfolioStore.equityCurve || [])

const topPositions = computed(() => {
  if (portfolioStore.analytics?.top_positions) {
    return portfolioStore.analytics.top_positions.slice(0, 5)
  }
  return []
})

const holdingsAllocation = computed(() => portfolioStore.holdingsAllocation || {})

const allocationItems = computed(() => {
  return Object.entries(holdingsAllocation.value).map(([symbol, value]) => ({
    symbol,
    value
  }))
})

const equityLinePath = computed(() => {
  if (!equityCurve.value.length) return ''
  
  const values = equityCurve.value.map(p => p.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1
  
  const chartW = chartWidth.value - padding.left - padding.right
  const chartH = chartHeight - padding.top - padding.bottom
  
  const points = values.map((v, i) => {
    const x = padding.left + (i / (values.length - 1)) * chartW
    const y = padding.top + chartH - ((v - minVal) / range) * chartH
    return `${x},${y}`
  })
  
  return `M${points.join(' L')}`
})

const equityAreaPath = computed(() => {
  if (!equityCurve.value.length) return ''
  
  const values = equityCurve.value.map(p => p.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1
  
  const chartW = chartWidth.value - padding.left - padding.right
  const chartH = chartHeight - padding.top - padding.bottom
  
  const points = values.map((v, i) => {
    const x = padding.left + (i / (values.length - 1)) * chartW
    const y = padding.top + chartH - ((v - minVal) / range) * chartH
    return `${x},${y}`
  })
  
  const lastX = padding.left + chartW
  const bottomY = padding.top + chartH
  
  return `M${padding.left},${bottomY} L${points.join(' L')} L${lastX},${bottomY} Z`
})

const drawdownLinePath = computed(() => {
  if (!equityCurve.value.length) return ''
  
  const drawdowns = equityCurve.value.map(p => p.drawdown)
  const maxDD = Math.max(...drawdowns, 1)
  
  const chartW = chartWidth.value - padding.left - padding.right
  const chartH = chartHeight - padding.top - padding.bottom
  
  const points = drawdowns.map((dd, i) => {
    const x = padding.left + (i / (drawdowns.length - 1)) * chartW
    const y = padding.top + chartH - (dd / maxDD) * chartH
    return `${x},${y}`
  })
  
  return `M${points.join(' L')}`
})

const drawdownAreaPath = computed(() => {
  if (!equityCurve.value.length) return ''
  
  const drawdowns = equityCurve.value.map(p => p.drawdown)
  const maxDD = Math.max(...drawdowns, 1)
  
  const chartW = chartWidth.value - padding.left - padding.right
  const chartH = chartHeight - padding.top - padding.bottom
  
  const points = drawdowns.map((dd, i) => {
    const x = padding.left + (i / (drawdowns.length - 1)) * chartW
    const y = padding.top + chartH - (dd / maxDD) * chartH
    return `${x},${y}`
  })
  
  const lastX = padding.left + chartW
  const bottomY = padding.top + chartH
  
  return `M${padding.left},${bottomY} L${points.join(' L')} L${lastX},${bottomY} Z`
})

const pieSegments = computed(() => {
  const items = allocationItems.value
  if (!items.length) return []
  
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total === 0) return []
  
  let currentAngle = -90
  return items.map((item, index) => {
    const angle = (item.value / total) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle
    
    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180
    
    const x1 = Math.cos(startRad) * pieRadius
    const y1 = Math.sin(startRad) * pieRadius
    const x2 = Math.cos(endRad) * pieRadius
    const y2 = Math.sin(endRad) * pieRadius
    
    const largeArc = angle > 180 ? 1 : 0
    
    const path = `M 0 0 L ${x1} ${y1} A ${pieRadius} ${pieRadius} 0 ${largeArc} 1 ${x2} ${y2} Z`
    
    return { path, color: pieColors[index % pieColors.length] }
  })
})

function updateChartSize() {
  if (chartContainer.value) {
    chartWidth.value = chartContainer.value.offsetWidth
  }
}

onMounted(async () => {
  updateChartSize()
  window.addEventListener('resize', updateChartSize)
  
  await portfolioStore.fetchAnalytics(90)
})
</script>

<style scoped>
.portfolio-analytics {
  padding: 0;
}

.glass-card {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 12px;
  padding: 20px;
  height: 100%;
}

.metric-card {
  text-align: center;
  padding: 24px 16px;
}

.metric-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.metric-icon svg {
  width: 24px;
  height: 24px;
}

.returns-icon {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.sharpe-icon {
  background: rgba(14, 165, 233, 0.15);
  color: #0ea5e9;
}

.drawdown-icon {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.winrate-icon {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 4px;
}

.metric-label {
  font-size: 14px;
  color: #94a3b8;
}

.metric-sub {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.card-header h3 {
  color: #e2e8f0;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.chart-card {
  height: 340px;
}

.chart-container {
  width: 100%;
  height: 280px;
}

.equity-chart {
  width: 100%;
  height: 100%;
}

.chart-legend {
  display: flex;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-item.equity .legend-dot {
  background: #10b981;
}

.legend-item.drawdown .legend-dot {
  background: #ef4444;
}

.allocation-card {
  height: 340px;
}

.allocation-chart {
  display: flex;
  align-items: center;
  gap: 24px;
  height: calc(100% - 60px);
}

.pie-chart {
  width: 160px;
  height: 160px;
  flex-shrink: 0;
}

.pie-segment {
  transition: opacity 0.2s ease;
  cursor: pointer;
}

.pie-segment:hover {
  opacity: 0.8;
}

.allocation-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.legend-row:hover {
  background: rgba(15, 23, 42, 0.6);
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.legend-label {
  flex: 1;
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 500;
}

.legend-value {
  color: #94a3b8;
  font-size: 14px;
  font-weight: 600;
}

.stats-card {
  min-height: 180px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 8px;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #e2e8f0;
}

.top-positions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.position-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 8px;
}

.pos-symbol {
  color: #e2e8f0;
  font-weight: 600;
}

.pos-pnl {
  font-weight: 700;
  font-size: 14px;
}

.up {
  color: #10b981;
}

.down {
  color: #ef4444;
}

@media (max-width: 768px) {
  .allocation-chart {
    flex-direction: column;
  }
  
  .pie-chart {
    margin: 0 auto;
  }
  
  .allocation-legend {
    width: 100%;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
