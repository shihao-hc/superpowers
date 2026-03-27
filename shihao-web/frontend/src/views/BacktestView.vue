<template>
  <div class="backtest-view">
    <!-- Backtest Configuration -->
    <div class="glass-card config-card">
      <div class="card-header">
        <div class="header-left">
          <h2>回测配置</h2>
          <span class="badge">专业版</span>
        </div>
        <el-button type="primary" @click="runBacktest" :loading="running" class="run-btn">
          <el-icon><VideoPlay /></el-icon>
          运行回测
        </el-button>
      </div>
      
      <el-form :model="config" label-width="120px" :inline="true" class="config-form">
        <el-form-item label="回测标的">
          <el-select v-model="config.symbols" multiple placeholder="选择股票" class="symbol-select">
            <el-option label="贵州茅台 (600519)" value="600519" />
            <el-option label="平安银行 (000001)" value="000001" />
            <el-option label="招商银行 (600036)" value="600036" />
            <el-option label="腾讯控股 (0700.HK)" value="0700.HK" />
            <el-option label="Apple (AAPL)" value="AAPL" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="回测周期">
          <el-date-picker
            v-model="config.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :disabled-date="disabledDate"
            class="date-picker"
          />
        </el-form-item>
        
        <el-form-item label="初始资金">
          <el-input-number v-model="config.initialCapital" :min="10000" :step="10000" class="capital-input" />
        </el-form-item>
        
        <el-form-item label="仓位大小">
          <el-select v-model="config.positionSize" class="position-select">
            <el-option label="10%" :value="0.1" />
            <el-option label="20%" :value="0.2" />
            <el-option label="30%" :value="0.3" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="止损比例">
          <el-input-number v-model="config.stopLoss" :min="0.01" :max="0.3" :step="0.01" class="ratio-input" />
        </el-form-item>
        
        <el-form-item label="止盈比例">
          <el-input-number v-model="config.takeProfit" :min="0.01" :max="0.5" :step="0.01" class="ratio-input" />
        </el-form-item>
        
        <el-form-item label="交易佣金">
          <el-input-number v-model="config.commission" :min="0" :max="0.01" :step="0.0001" class="commission-input" />
        </el-form-item>
        
        <el-form-item label="生存偏差校正">
          <el-switch v-model="config.survivorshipBias" class="bias-switch" />
        </el-form-item>
      </el-form>
    </div>
    
    <!-- Backtest Results -->
    <div v-if="result" class="results-section">
      <!-- Performance Metrics -->
      <div class="glass-card results-card">
        <div class="card-header">
          <div class="header-left">
            <h2>回测结果</h2>
            <el-tag type="success" class="status-tag">{{ result.status }}</el-tag>
          </div>
          <el-button type="primary" plain class="export-btn">导出报告</el-button>
        </div>
        
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-icon profit-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 6l-9.5 9.5-5-5L1 18"/>
                <path d="M17 6h6v6"/>
              </svg>
            </div>
            <div class="metric-value" :class="result.metrics.total_return >= 0 ? 'up' : 'down'">
              {{ (result.metrics.total_return * 100).toFixed(2) }}%
            </div>
            <div class="metric-label">总收益率</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-icon annual-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div class="metric-value" :class="result.metrics.annual_return >= 0 ? 'up' : 'down'">
              {{ (result.metrics.annual_return * 100).toFixed(2) }}%
            </div>
            <div class="metric-label">年化收益</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-icon sharpe-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <div class="metric-value">
              {{ result.metrics.sharpe_ratio.toFixed(2) }}
            </div>
            <div class="metric-label">夏普比率</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-icon drawdown-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"/>
                <path d="M18 9l-5 5-4-4-3 3"/>
              </svg>
            </div>
            <div class="metric-value danger">
              {{ (result.metrics.max_drawdown * 100).toFixed(2) }}%
            </div>
            <div class="metric-label">最大回撤</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-icon winrate-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div class="metric-value">
              {{ (result.metrics.win_rate * 100).toFixed(1) }}%
            </div>
            <div class="metric-label">胜率</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-icon trades-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 7h-9"/>
                <path d="M14 17H5"/>
                <circle cx="17" cy="17" r="3"/>
                <circle cx="7" cy="7" r="3"/>
              </svg>
            </div>
            <div class="metric-value">
              {{ result.metrics.total_trades }}
            </div>
            <div class="metric-label">交易次数</div>
          </div>
        </div>
      </div>
      
      <!-- Equity Curve Chart -->
      <div class="glass-card chart-card">
        <div class="card-header">
          <h2>权益曲线</h2>
          <div class="chart-controls">
            <el-button-group>
              <el-button size="small" :class="{ active: chartPeriod === '1M' }" @click="chartPeriod = '1M'">1M</el-button>
              <el-button size="small" :class="{ active: chartPeriod === '3M' }" @click="chartPeriod = '3M'">3M</el-button>
              <el-button size="small" :class="{ active: chartPeriod === 'YTD' }" @click="chartPeriod = 'YTD'">YTD</el-button>
              <el-button size="small" :class="{ active: chartPeriod === 'ALL' }" @click="chartPeriod = 'ALL'">ALL</el-button>
            </el-button-group>
          </div>
        </div>
        <div ref="equityChartRef" class="chart-container"></div>
      </div>
      
      <!-- Monthly Returns and Trades -->
      <el-row :gutter="20" style="margin-top: 24px;">
        <el-col :xs="24" :lg="12">
          <div class="glass-card monthly-card">
            <div class="card-header">
              <h2>月度收益</h2>
            </div>
            <div class="monthly-returns">
              <div 
                v-for="(value, month) in result.monthly_returns" 
                :key="month"
                class="month-item"
              >
                <span class="month-label">{{ month }}</span>
                <div class="month-bar-container">
                  <div 
                    class="month-bar" 
                    :style="{ 
                      width: `${Math.abs(value) * 1000}%`,
                      background: value >= 0 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #ef4444, #f87171)'
                    }"
                  ></div>
                </div>
                <span :class="['month-value', value >= 0 ? 'up' : 'down']">
                  {{ value >= 0 ? '+' : '' }}{{ (value * 100).toFixed(2) }}%
                </span>
              </div>
            </div>
          </div>
        </el-col>
        
        <el-col :xs="24" :lg="12">
          <div class="glass-card trades-card">
            <div class="card-header">
              <h2>交易记录</h2>
              <span class="trades-count">共 {{ result.trades.length }} 笔</span>
            </div>
            <el-table :data="result.trades.slice(0, 10)" stripe class="dark-table" max-height="300">
              <el-table-column prop="symbol" label="代码" width="80">
                <template #default="{ row }">
                  <span class="symbol-text">{{ row.symbol }}</span>
                </template>
              </el-table-column>
              <el-table-column label="方向" width="60">
                <template #default="{ row }">
                  <el-tag :type="row.side === 'long' ? 'success' : 'danger'" size="small" class="side-tag">
                    {{ row.side === 'long' ? '多' : '空' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="盈亏" width="100">
                <template #default="{ row }">
                  <span :class="row.pnl >= 0 ? 'up' : 'down'" class="pnl-text">
                    {{ row.pnl >= 0 ? '+' : '' }}{{ row.pnl.toFixed(2) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="持有天数" width="80">
                <template #default="{ row }">
                  <span class="days-text">{{ row.holding_days }}天</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-col>
      </el-row>
    </div>
    
    <!-- Empty State -->
    <div v-else class="glass-card empty-card">
      <el-empty description="配置参数后运行回测">
        <template #image>
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
        </template>
        <el-button type="primary" @click="runBacktest" class="start-btn">开始回测</el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { backtestAPI } from '../api'
import { ElMessage } from 'element-plus'
import { VideoPlay } from '@element-plus/icons-vue'

const running = ref(false)
const result = ref(null)
const equityChartRef = ref(null)
const chartPeriod = ref('ALL')

const config = reactive({
  symbols: ['600519'],
  dateRange: [
    new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
    new Date()
  ],
  initialCapital: 1000000,
  positionSize: 0.1,
  stopLoss: 0.1,
  takeProfit: 0.2,
  commission: 0.001,
  survivorshipBias: true
})

function disabledDate(time) {
  return time.getTime() > Date.now()
}

async function runBacktest() {
  if (config.symbols.length === 0) {
    ElMessage.warning('请选择回测标的')
    return
  }
  
  running.value = true
  
  try {
    // Simulate backtest for demo (replace with actual API call)
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Generate mock result
    result.value = {
      status: 'completed',
      metrics: {
        total_return: 0.235,
        annual_return: 0.182,
        sharpe_ratio: 1.45,
        sortino_ratio: 1.82,
        max_drawdown: -0.125,
        max_drawdown_duration: 45,
        win_rate: 0.58,
        profit_factor: 1.65,
        avg_win: 5200,
        avg_loss: -3100,
        total_trades: 86,
        winning_trades: 50,
        losing_trades: 36,
        avg_holding_days: 12,
        volatility: 0.18
      },
      monthly_returns: {
        '2025-01': 0.025,
        '2025-02': -0.012,
        '2025-03': 0.038,
        '2025-04': 0.015,
        '2025-05': -0.008,
        '2025-06': 0.042,
        '2025-07': 0.028,
        '2025-08': -0.015,
        '2025-09': 0.035,
        '2025-10': 0.018,
        '2025-11': 0.022,
        '2025-12': 0.031
      },
      trades: [
        { symbol: '600519', side: 'long', pnl: 8500, holding_days: 15 },
        { symbol: '600519', side: 'long', pnl: -2300, holding_days: 8 },
        { symbol: '600519', side: 'long', pnl: 12000, holding_days: 22 },
        { symbol: '600519', side: 'long', pnl: 5600, holding_days: 10 }
      ]
    }
    
    ElMessage.success('回测完成')
    
  } catch (error) {
    console.error('Backtest failed:', error)
    ElMessage.error('回测失败')
  } finally {
    running.value = false
  }
}

onMounted(() => {
  // Set default date range
  const end = new Date()
  const start = new Date()
  start.setFullYear(start.getFullYear() - 1)
  config.dateRange = [start, end]
})
</script>

<style scoped>
.backtest-view {
  padding: 0;
}

.glass-card {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 16px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.config-card {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-header h2 {
  color: #e2e8f0;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.badge {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.run-btn {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  border: none;
  color: white;
  font-weight: 600;
  padding: 12px 24px;
  border-radius: 12px;
  transition: all 0.3s ease;
}

.run-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(14, 165, 233, 0.3);
}

.config-form {
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.config-form :deep(.el-form-item__label) {
  color: #94a3b8;
  font-weight: 500;
}

.symbol-select, .date-picker, .capital-input, .position-select, .ratio-input, .commission-input {
  width: 100%;
}

.config-form :deep(.el-input__wrapper) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
}

.config-form :deep(.el-input__inner) {
  color: #e2e8f0;
}

.config-form :deep(.el-select__wrapper) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
}

.bias-switch {
  margin-left: 20px;
}

.results-card {
  margin-bottom: 24px;
}

.status-tag {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  color: #10b981;
  font-weight: 600;
}

.export-btn {
  background: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(14, 165, 233, 0.2);
  color: #0ea5e9;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 20px;
  padding: 24px;
}

.metric-card {
  text-align: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.05);
  transition: all 0.3s ease;
}

.metric-card:hover {
  transform: translateY(-4px);
  background: rgba(15, 23, 42, 0.6);
  border-color: rgba(14, 165, 233, 0.1);
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

.profit-icon {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.annual-icon {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
}

.sharpe-icon {
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
}

.drawdown-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.winrate-icon {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.trades-icon {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}

.metric-value.up {
  color: #10b981;
}

.metric-value.down {
  color: #ef4444;
}

.metric-value.danger {
  color: #ef4444;
}

.metric-label {
  font-size: 14px;
  color: #94a3b8;
  font-weight: 500;
}

.chart-card {
  margin-bottom: 24px;
}

.chart-controls {
  display: flex;
  gap: 8px;
}

.chart-controls :deep(.el-button-group .el-button) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  transition: all 0.3s ease;
}

.chart-controls :deep(.el-button-group .el-button.active) {
  background: rgba(14, 165, 233, 0.2);
  border-color: rgba(14, 165, 233, 0.3);
  color: #0ea5e9;
}

.chart-controls :deep(.el-button-group .el-button:hover) {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
}

.chart-container {
  height: 400px;
  width: 100%;
  padding: 24px;
}

.monthly-card, .trades-card {
  height: 100%;
}

.trades-count {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.monthly-returns {
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.month-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 10px;
  transition: all 0.3s ease;
}

.month-item:hover {
  background: rgba(15, 23, 42, 0.6);
  transform: translateX(4px);
}

.month-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
  min-width: 60px;
}

.month-bar-container {
  flex: 1;
  height: 8px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.month-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.month-value {
  font-weight: 700;
  font-size: 13px;
  min-width: 80px;
  text-align: right;
}

.dark-table {
  background: transparent !important;
}

.dark-table :deep(.el-table__header) {
  background: rgba(148, 163, 184, 0.05);
}

.dark-table :deep(.el-table__row) {
  background: transparent;
  transition: all 0.3s ease;
}

.dark-table :deep(.el-table__row:hover) {
  background: rgba(14, 165, 233, 0.1) !important;
}

.symbol-text {
  color: #0ea5e9;
  font-weight: 600;
}

.side-tag {
  font-weight: 600;
}

.pnl-text {
  font-weight: 700;
}

.days-text {
  color: #94a3b8;
}

.up {
  color: #10b981;
}

.down {
  color: #ef4444;
}

.empty-card {
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  width: 120px;
  height: 120px;
  margin: 0 auto 24px;
  color: #475569;
}

.empty-icon svg {
  width: 100%;
  height: 100%;
}

.start-btn {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  border: none;
  color: white;
  font-weight: 600;
  padding: 14px 32px;
  border-radius: 12px;
  font-size: 16px;
}

/* Responsive */
@media (max-width: 768px) {
  .config-form {
    grid-template-columns: 1fr;
  }
  
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .monthly-returns {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .card-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
  
  .run-btn {
    width: 100%;
  }
}
</style>