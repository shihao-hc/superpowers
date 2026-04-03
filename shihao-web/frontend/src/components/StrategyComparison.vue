<template>
  <div class="strategy-comparison">
    <div class="section-header">
      <h3>策略对比分析</h3>
      <div class="header-actions">
        <el-select v-model="timeRange" size="small" class="time-select">
          <el-option label="近1月" value="1m" />
          <el-option label="近3月" value="3m" />
          <el-option label="近6月" value="6m" />
          <el-option label="近1年" value="1y" />
          <el-option label="全部" value="all" />
        </el-select>
      </div>
    </div>

    <el-row :gutter="20" class="strategy-cards">
      <el-col :xs="24" :sm="12" :lg="6" v-for="strategy in strategies" :key="strategy.id">
        <div class="strategy-card glass-card" :class="{ selected: selectedStrategy === strategy.id }" @click="selectStrategy(strategy.id)">
          <div class="strategy-header">
            <div class="strategy-icon" :class="`strategy-${strategy.risk}`">
              <svg v-if="strategy.type === 'momentum'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              <svg v-else-if="strategy.type === 'mean_reversion'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"/>
                <path d="M18 9l-5 5-4-4-3 3"/>
              </svg>
              <svg v-else-if="strategy.type === 'value'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <div class="strategy-info">
              <h4>{{ strategy.name }}</h4>
              <span class="strategy-type">{{ getTypeLabel(strategy.type) }}</span>
            </div>
          </div>
          
          <div class="strategy-metrics">
            <div class="metric">
              <span class="metric-label">收益率</span>
              <span class="metric-value" :class="strategy.totalReturn >= 0 ? 'up' : 'down'">
                {{ strategy.totalReturn >= 0 ? '+' : '' }}{{ (strategy.totalReturn * 100).toFixed(2) }}%
              </span>
            </div>
            <div class="metric">
              <span class="metric-label">胜率</span>
              <span class="metric-value">{{ (strategy.winRate * 100).toFixed(1) }}%</span>
            </div>
            <div class="metric">
              <span class="metric-label">夏普比率</span>
              <span class="metric-value">{{ strategy.sharpeRatio.toFixed(2) }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">最大回撤</span>
              <span class="metric-value" :class="getDrawdownClass(strategy.maxDrawdown)">
                {{ (strategy.maxDrawdown * 100).toFixed(2) }}%
              </span>
            </div>
          </div>
          
          <div class="strategy-bar">
            <div class="bar-fill" :style="{ width: `${Math.min(strategy.score, 100)}%` }" :class="`bar-${strategy.risk}`"></div>
          </div>
          <div class="strategy-score">
            <span>综合评分</span>
            <span class="score-value">{{ strategy.score.toFixed(0) }}</span>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="comparison-section">
      <div class="section-header">
        <h3>对比详情</h3>
      </div>
      
      <div class="comparison-table glass-card">
        <el-table :data="comparisonData" stripe class="dark-table">
          <el-table-column prop="metric" label="指标" width="150" />
          <el-table-column v-for="strategy in activeStrategies" :key="strategy.id" :label="strategy.name" min-width="150">
            <template #default="{ row }">
              <span :class="getValueClass(row[strategy.id])">
                {{ formatValue(row[strategy.id], row.format) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div class="chart-section" v-if="selectedStrategy">
      <div class="section-header">
        <h3>收益曲线对比</h3>
      </div>
      
      <div class="chart-container glass-card">
        <div class="chart-legend">
          <div v-for="strategy in activeStrategies" :key="strategy.id" class="legend-item" :class="{ active: selectedStrategy === strategy.id }">
            <span class="legend-color" :style="{ background: strategy.color }"></span>
            <span>{{ strategy.name }}</span>
          </div>
        </div>
        <div class="chart-area">
          <svg viewBox="0 0 800 300" class="chart-svg">
            <defs>
              <linearGradient v-for="strategy in activeStrategies" :key="`grad-${strategy.id}`" :id="`gradient-${strategy.id}`" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" :style="{ stopColor: strategy.color, stopOpacity: 0.3 }"/>
                <stop offset="100%" :style="{ stopColor: strategy.color, stopOpacity: 0 }"/>
              </linearGradient>
            </defs>
            
            <line v-for="(tick, i) in yAxisTicks" :key="`y-${i}`" 
              :x1="50" :y1="getY(tick)" :x2="780" :y2="getY(tick)"
              stroke="rgba(148, 163, 184, 0.1)" stroke-dasharray="4,4"/>
            <text v-for="(tick, i) in yAxisTicks" :key="`yl-${i}`" 
              :x="45" :y="getY(tick) + 4" fill="#64748b" font-size="10" text-anchor="end">
              {{ (tick * 100).toFixed(0) }}%
            </text>
            
            <line x1="50" y1="20" x2="50" y2="260" stroke="rgba(148, 163, 184, 0.2)"/>
            <line x1="50" y1="260" x2="780" y2="260" stroke="rgba(148, 163, 184, 0.2)"/>
            
            <g v-for="strategy in activeStrategies" :key="`path-${strategy.id}`">
              <path :d="getAreaPath(strategy)" :fill="`url(#gradient-${strategy.id})`" :opacity="selectedStrategy === strategy.id ? 1 : 0.3"/>
              <path :d="getLinePath(strategy)" fill="none" :stroke="strategy.color" 
                :stroke-width="selectedStrategy === strategy.id ? 2.5 : 1.5"
                :opacity="selectedStrategy === strategy.id ? 1 : 0.5"/>
            </g>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const timeRange = ref('6m')
const selectedStrategy = ref('momentum_001')

const strategies = ref([
  {
    id: 'momentum_001',
    name: '趋势追踪',
    type: 'momentum',
    risk: 'medium',
    totalReturn: 0.285,
    winRate: 0.62,
    sharpeRatio: 1.85,
    maxDrawdown: 0.125,
    score: 82,
    color: '#0ea5e9',
    data: [0, 0.02, 0.05, 0.03, 0.08, 0.12, 0.10, 0.15, 0.18, 0.22, 0.20, 0.25, 0.28]
  },
  {
    id: 'mean_reversion_001',
    name: '均值回归',
    type: 'mean_reversion',
    risk: 'low',
    totalReturn: 0.185,
    winRate: 0.71,
    sharpeRatio: 1.52,
    maxDrawdown: 0.082,
    score: 78,
    color: '#10b981',
    data: [0, 0.01, -0.01, 0.02, 0.04, 0.06, 0.05, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18]
  },
  {
    id: 'value_001',
    name: '价值投资',
    type: 'value',
    risk: 'low',
    totalReturn: 0.152,
    winRate: 0.68,
    sharpeRatio: 1.38,
    maxDrawdown: 0.098,
    score: 75,
    color: '#f59e0b',
    data: [0, 0.01, 0.02, 0.02, 0.03, 0.05, 0.06, 0.08, 0.10, 0.11, 0.13, 0.14, 0.15]
  },
  {
    id: 'hybrid_001',
    name: '混合策略',
    type: 'hybrid',
    risk: 'medium',
    totalReturn: 0.235,
    winRate: 0.65,
    sharpeRatio: 1.68,
    maxDrawdown: 0.105,
    score: 80,
    color: '#8b5cf6',
    data: [0, 0.015, 0.03, 0.025, 0.06, 0.09, 0.08, 0.12, 0.15, 0.18, 0.17, 0.21, 0.23]
  }
])

const activeStrategies = computed(() => strategies.value.slice(0, 3))

const comparisonData = computed(() => [
  { metric: '累计收益率', momentum_001: 0.285, mean_reversion_001: 0.185, value_001: 0.152, format: 'percent' },
  { metric: '年化收益率', momentum_001: 0.456, mean_reversion_001: 0.298, value_001: 0.245, format: 'percent' },
  { metric: '波动率', momentum_001: 0.228, mean_reversion_001: 0.156, value_001: 0.142, format: 'percent' },
  { metric: '夏普比率', momentum_001: 1.85, mean_reversion_001: 1.52, value_001: 1.38, format: 'ratio' },
  { metric: '胜率', momentum_001: 0.62, mean_reversion_001: 0.71, value_001: 0.68, format: 'percent' },
  { metric: '盈亏比', momentum_001: 1.45, mean_reversion_001: 1.28, value_001: 1.22, format: 'ratio' },
  { metric: '最大回撤', momentum_001: -0.125, mean_reversion_001: -0.082, value_001: -0.098, format: 'percent' },
  { metric: '交易频率', momentum_001: 48, mean_reversion_001: 126, value_001: 24, format: 'number' },
])

const yAxisTicks = [0.3, 0.2, 0.1, 0, -0.1]

function getTypeLabel(type) {
  const labels = {
    momentum: '趋势型',
    mean_reversion: '回归型',
    value: '价值型',
    hybrid: '混合型'
  }
  return labels[type] || type
}

function getDrawdownClass(drawdown) {
  if (Math.abs(drawdown) > 0.15) return 'danger'
  if (Math.abs(drawdown) > 0.10) return 'warning'
  return ''
}

function getValueClass(value) {
  if (typeof value === 'number') {
    if (value < 0) return 'down'
    if (value > 0.2) return 'up'
  }
  return ''
}

function formatValue(value, format) {
  if (format === 'percent') {
    return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
  }
  if (format === 'ratio') {
    return value.toFixed(2)
  }
  return value.toString()
}

function selectStrategy(id) {
  selectedStrategy.value = selectedStrategy.value === id ? null : id
}

function getY(value) {
  const range = 0.4
  return 260 - ((value + 0.1) / range) * 240
}

function getLinePath(strategy) {
  const points = strategy.data.map((v, i) => {
    const x = 50 + (i / (strategy.data.length - 1)) * 730
    const y = getY(v)
    return `${i === 0 ? 'M' : 'L'}${x},${y}`
  })
  return points.join(' ')
}

function getAreaPath(strategy) {
  const linePath = getLinePath(strategy)
  const lastX = 50 + 730
  return `${linePath} L${lastX},260 L50,260 Z`
}
</script>

<style scoped>
.strategy-comparison {
  padding: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h3 {
  color: #e2e8f0;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time-select {
  width: 120px;
}

.strategy-cards {
  margin-bottom: 24px;
}

.strategy-card {
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.strategy-card:hover {
  transform: translateY(-4px);
  border-color: rgba(14, 165, 233, 0.3);
}

.strategy-card.selected {
  border-color: rgba(14, 165, 233, 0.5);
  background: rgba(14, 165, 233, 0.1);
}

.strategy-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.strategy-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.strategy-icon svg {
  width: 22px;
  height: 22px;
}

.strategy-icon.strategy-low {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.strategy-icon.strategy-medium {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.strategy-icon.strategy-high {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.strategy-info h4 {
  color: #e2e8f0;
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.strategy-type {
  font-size: 12px;
  color: #64748b;
}

.strategy-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metric-value {
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
}

.metric-value.up {
  color: #10b981;
}

.metric-value.down {
  color: #ef4444;
}

.metric-value.warning {
  color: #f59e0b;
}

.metric-value.danger {
  color: #ef4444;
}

.strategy-bar {
  height: 6px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease;
}

.bar-fill.bar-low {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.bar-fill.bar-medium {
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
}

.bar-fill.bar-high {
  background: linear-gradient(90deg, #ef4444, #f87171);
}

.strategy-score {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #64748b;
}

.score-value {
  font-weight: 700;
  font-size: 18px;
  color: #0ea5e9;
}

.comparison-section {
  margin-bottom: 24px;
}

.comparison-table {
  padding: 20px;
}

.dark-table {
  background: transparent !important;
}

.dark-table :deep(.el-table__header) {
  background: rgba(148, 163, 184, 0.05);
}

.dark-table :deep(.el-table__row) {
  background: transparent;
}

.dark-table :deep(.el-table__row:hover) {
  background: rgba(14, 165, 233, 0.1) !important;
}

.chart-section {
  margin-bottom: 24px;
}

.chart-container {
  padding: 20px;
}

.chart-legend {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.3s ease;
}

.legend-item.active {
  color: #e2e8f0;
  font-weight: 600;
}

.legend-color {
  width: 16px;
  height: 4px;
  border-radius: 2px;
}

.chart-area {
  width: 100%;
  overflow: hidden;
}

.chart-svg {
  width: 100%;
  height: auto;
}

@media (max-width: 768px) {
  .strategy-metrics {
    grid-template-columns: 1fr;
  }
  
  .chart-legend {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
