<template>
  <div class="portfolio-view">
    <!-- Tab Navigation -->
    <el-tabs v-model="activeTab" class="portfolio-tabs">
      <el-tab-pane label="持仓管理" name="positions"></el-tab-pane>
      <el-tab-pane label="信号通知" name="signals"></el-tab-pane>
      <el-tab-pane label="策略对比" name="strategies"></el-tab-pane>
      <el-tab-pane label="组合分析" name="analytics"></el-tab-pane>
    </el-tabs>
    
    <!-- Signals Tab -->
    <div v-if="activeTab === 'signals'" class="signals-container">
      <SignalNotifications />
    </div>
    
    <!-- Strategies Tab -->
    <div v-if="activeTab === 'strategies'" class="strategies-container">
      <StrategyComparison />
    </div>
    
    <!-- Analytics Tab -->
    <div v-if="activeTab === 'analytics'">
      <PortfolioAnalytics />
    </div>
    
    <!-- Positions Tab -->
    <div v-if="activeTab === 'positions'">
    <!-- Portfolio Summary -->
    <el-row :gutter="20">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="summary-card glass-card">
          <div class="summary-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div class="summary-value">¥{{ formatMoney(portfolioStore.portfolioValue) }}</div>
          <div class="summary-label">总资产</div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="summary-card glass-card">
          <div class="summary-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
              <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"/>
            </svg>
          </div>
          <div class="summary-value">¥{{ formatMoney(portfolioStore.cash) }}</div>
          <div class="summary-label">可用资金</div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="summary-card glass-card">
          <div class="summary-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3v18h18"/>
              <path d="M18 9l-5 5-4-4-3 3"/>
            </svg>
          </div>
          <div class="summary-value" :class="portfolioStore.totalPnL >= 0 ? 'up' : 'down'">
            {{ portfolioStore.totalPnL >= 0 ? '+' : '' }}¥{{ portfolioStore.totalPnL.toFixed(2) }}
          </div>
          <div class="summary-label">浮动盈亏</div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="summary-card glass-card">
          <div class="summary-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 7h-9"/>
              <path d="M14 17H5"/>
              <circle cx="17" cy="17" r="3"/>
              <circle cx="7" cy="7" r="3"/>
            </svg>
          </div>
          <div class="summary-value">{{ portfolioStore.positionCount }}</div>
          <div class="summary-label">持仓数量</div>
        </div>
      </el-col>
    </el-row>
    
    <!-- Positions and Trading -->
    <el-row :gutter="20" style="margin-top: 24px;">
      <!-- Positions List -->
      <el-col :xs="24" :lg="14">
        <div class="glass-card positions-card">
          <div class="card-header">
            <div class="header-left">
              <h2>持仓列表</h2>
              <span class="count-badge">{{ portfolioStore.positions.length }} 只股票</span>
            </div>
            <el-button type="primary" size="small" @click="refreshPositions" :loading="loading" class="refresh-btn">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
          
          <div v-if="portfolioStore.positions.length === 0" class="empty-state">
            <el-empty description="暂无持仓">
              <template #image>
                <div class="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M20 7h-9"/>
                    <path d="M14 17H5"/>
                    <circle cx="17" cy="17" r="3"/>
                    <circle cx="7" cy="7" r="3"/>
                  </svg>
                </div>
              </template>
              <el-button type="primary" @click="$router.push('/stocks')" class="start-btn">开始选股</el-button>
            </el-empty>
          </div>
          
          <el-table v-else :data="portfolioStore.positions" stripe class="dark-table">
            <el-table-column prop="symbol" label="代码" width="100">
              <template #default="{ row }">
                <span class="symbol-link" @click="viewStock(row.symbol)">
                  {{ row.symbol }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="80" />
            <el-table-column label="成本价" width="100">
              <template #default="{ row }">
                <span class="price-value">¥{{ row.avg_price.toFixed(2) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="现价" width="100">
              <template #default="{ row }">
                <span class="price-value">¥{{ row.current_price.toFixed(2) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="市值" width="120">
              <template #default="{ row }">
                <span class="market-value">¥{{ (row.quantity * row.current_price).toFixed(2) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="盈亏" width="120">
              <template #default="{ row }">
                <div :class="row.unrealized_pnl >= 0 ? 'up' : 'down'" class="pnl-value">
                  {{ row.unrealized_pnl >= 0 ? '+' : '' }}¥{{ row.unrealized_pnl.toFixed(2) }}
                </div>
                <div class="pnl-pct" :class="getPnLPct(row) >= 0 ? 'up' : 'down'">
                  ({{ getPnLPct(row) >= 0 ? '+' : '' }}{{ getPnLPct(row).toFixed(2) }}%)
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="quickTrade('buy', row.symbol)" class="action-btn">
                  买入
                </el-button>
                <el-button size="small" type="danger" link @click="quickTrade('sell', row.symbol)" class="action-btn">
                  卖出
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      
      <!-- Trading Panel -->
      <el-col :xs="24" :lg="10">
        <div class="glass-card trading-card">
          <div class="card-header">
            <h2>交易下单</h2>
          </div>
          
          <el-form :model="orderForm" label-width="80px" class="trading-form">
            <el-form-item label="股票代码">
              <el-input v-model="orderForm.symbol" placeholder="输入股票代码" class="symbol-input">
                <template #append>
                  <el-button @click="searchStock" class="search-btn">搜索</el-button>
                </template>
              </el-input>
            </el-form-item>
            
            <el-form-item label="交易方向">
              <el-radio-group v-model="orderForm.action" size="large" class="action-group">
                <el-radio-button label="buy">
                  <span class="buy-text">买入</span>
                </el-radio-button>
                <el-radio-button label="sell">
                  <span class="sell-text">卖出</span>
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item label="数量">
              <el-input-number 
                v-model="orderForm.quantity" 
                :min="100" 
                :step="100"
                class="quantity-input"
              />
              <div class="quantity-hint">A股最小交易单位: 100股</div>
            </el-form-item>
            
            <el-form-item label="订单类型">
              <el-select v-model="orderForm.order_type" class="order-type-select">
                <el-option label="市价单" value="market" />
                <el-option label="限价单" value="limit" />
              </el-select>
            </el-form-item>
            
            <el-form-item v-if="orderForm.order_type === 'limit'" label="限价">
              <el-input-number 
                v-model="orderForm.price" 
                :precision="2" 
                :step="0.01"
                class="price-input"
              />
            </el-form-item>
            
            <el-form-item>
              <el-button 
                :type="orderForm.action === 'buy' ? 'danger' : 'success'" 
                size="large" 
                class="submit-btn"
                @click="submitOrder"
                :loading="submitting"
              >
                {{ orderForm.action === 'buy' ? '确认买入' : '确认卖出' }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>
        
        <!-- Risk Status -->
        <div class="glass-card risk-card">
          <div class="card-header">
            <h2>风险状态</h2>
          </div>
          
          <div class="risk-metrics">
            <div class="risk-item">
              <div class="risk-icon drawdown-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 3v18h18"/>
                  <path d="M18 9l-5 5-4-4-3 3"/>
                </svg>
              </div>
              <div class="risk-content">
                <span class="risk-label">最大回撤</span>
                <span class="risk-value" :class="getRiskClass('drawdown')">
                  {{ ((portfolioStore.riskMetrics.max_drawdown || 0) * 100).toFixed(2) }}%
                </span>
              </div>
            </div>
            <div class="risk-item">
              <div class="risk-icon leverage-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <div class="risk-content">
                <span class="risk-label">杠杆率</span>
                <span class="risk-value">
                  {{ (portfolioStore.riskMetrics.leverage || 0).toFixed(2) }}x
                </span>
              </div>
            </div>
            <div class="risk-item">
              <div class="risk-icon pnl-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 6l-9.5 9.5-5-5L1 18"/>
                  <path d="M17 6h6v6"/>
                </svg>
              </div>
              <div class="risk-content">
                <span class="risk-label">今日盈亏</span>
                <span class="risk-value" :class="(portfolioStore.riskMetrics.daily_pnl || 0) >= 0 ? 'up' : 'down'">
                  {{ (portfolioStore.riskMetrics.daily_pnl || 0) >= 0 ? '+' : '' }}¥{{ (portfolioStore.riskMetrics.daily_pnl || 0).toFixed(2) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
    
    <!-- Trade History -->
    <div class="glass-card history-card">
      <div class="card-header">
        <h2>交易记录</h2>
      </div>
      
      <el-table :data="portfolioStore.trades" stripe class="dark-table">
        <el-table-column prop="order_id" label="订单号" width="120" />
        <el-table-column prop="symbol" label="代码" width="100">
          <template #default="{ row }">
            <span class="symbol-link">{{ row.symbol }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="80">
          <template #default="{ row }">
            <el-tag :type="row.action === 'buy' ? 'danger' : 'success'" size="small" class="action-tag">
              {{ row.action === 'buy' ? '买入' : '卖出' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag type="success" size="small" class="status-tag">已成交</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }">
            <span class="time-value">{{ formatTime(row.timestamp) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePortfolioStore } from '../stores/portfolio'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PortfolioAnalytics from '../components/PortfolioAnalytics.vue'
import SignalNotifications from '../components/SignalNotifications.vue'
import StrategyComparison from '../components/StrategyComparison.vue'

const route = useRoute()
const router = useRouter()
const portfolioStore = usePortfolioStore()

const activeTab = ref('positions')
const loading = ref(false)
const submitting = ref(false)

const orderForm = reactive({
  symbol: '',
  action: 'buy',
  quantity: 100,
  order_type: 'market',
  price: 0
})

function formatMoney(value) {
  if (value >= 100000000) {
    return (value / 100000000).toFixed(2) + '亿'
  }
  if (value >= 10000) {
    return (value / 10000).toFixed(2) + '万'
  }
  return value.toFixed(2)
}

function getPnLPct(position) {
  if (!position.avg_price || !position.current_price) return 0
  return ((position.current_price - position.avg_price) / position.avg_price) * 100
}

function getRiskClass(type) {
  const metrics = portfolioStore.riskMetrics
  if (type === 'drawdown') {
    const drawdown = metrics.max_drawdown || 0
    if (drawdown > 0.15) return 'danger'
    if (drawdown > 0.1) return 'warning'
  }
  return ''
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN')
}

async function refreshPositions() {
  loading.value = true
  try {
    await portfolioStore.fetchPortfolio()
  } finally {
    loading.value = false
  }
}

function viewStock(symbol) {
  router.push({
    path: '/analysis',
    query: { symbol }
  })
}

function quickTrade(action, symbol) {
  orderForm.action = action
  orderForm.symbol = symbol
}

function searchStock() {
  if (orderForm.symbol) {
    router.push({
      path: '/analysis',
      query: { symbol: orderForm.symbol }
    })
  }
}

async function submitOrder() {
  if (!orderForm.symbol) {
    ElMessage.warning('请输入股票代码')
    return
  }
  
  if (orderForm.quantity <= 0) {
    ElMessage.warning('请输入有效数量')
    return
  }
  
  try {
    await ElMessageBox.confirm(
      `确认${orderForm.action === 'buy' ? '买入' : '卖出'} ${orderForm.symbol} ${orderForm.quantity} 股?`,
      '确认交易',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: orderForm.action === 'buy' ? 'warning' : 'info'
      }
    )
    
    submitting.value = true
    
    const result = await portfolioStore.executeTrade({
      symbol: orderForm.symbol,
      action: orderForm.action,
      quantity: orderForm.quantity,
      order_type: orderForm.order_type,
      price: orderForm.price
    })
    
    if (result.status === 'filled') {
      ElMessage.success('交易执行成功')
      // Reset form
      orderForm.symbol = ''
      orderForm.quantity = 100
    } else if (result.status === 'rejected') {
      ElMessage.warning(`交易被拒绝: ${result.message}`)
    }
    
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('交易执行失败')
    }
  } finally {
    submitting.value = false
  }
}

// Watch for route query changes
watch(() => route.query, (query) => {
  if (query.symbol) {
    orderForm.symbol = query.symbol
  }
  if (query.action) {
    orderForm.action = query.action
  }
}, { immediate: true })

onMounted(() => {
  portfolioStore.fetchPortfolio()
  portfolioStore.fetchRiskMetrics()
})
</script>

<style scoped>
.portfolio-view {
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

.summary-card {
  padding: 24px;
  text-align: center;
  transition: all 0.3s ease;
}

.summary-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.3);
  border-color: rgba(14, 165, 233, 0.2);
}

.summary-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  background: rgba(14, 165, 233, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0ea5e9;
}

.summary-icon svg {
  width: 24px;
  height: 24px;
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}

.summary-label {
  font-size: 14px;
  color: #94a3b8;
  font-weight: 500;
}

.positions-card, .trading-card, .risk-card, .history-card {
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

.count-badge {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.refresh-btn {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  border: none;
  color: white;
  font-weight: 600;
  padding: 10px 20px;
  border-radius: 10px;
  transition: all 0.3s ease;
}

.refresh-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3);
}

.empty-state {
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 20px;
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
  padding: 12px 24px;
  border-radius: 10px;
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

.dark-table :deep(.el-table__row:nth-child(even)) {
  background: rgba(148, 163, 184, 0.02);
}

.symbol-link {
  color: #0ea5e9;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
}

.symbol-link:hover {
  text-decoration: underline;
  color: #38bdf8;
}

.price-value {
  color: #e2e8f0;
  font-weight: 500;
}

.market-value {
  color: #e2e8f0;
  font-weight: 600;
}

.pnl-value {
  font-weight: 700;
  font-size: 14px;
}

.pnl-pct {
  font-size: 12px;
  opacity: 0.8;
}

.up {
  color: #10b981;
}

.down {
  color: #ef4444;
}

.action-btn {
  transition: all 0.3s ease;
}

.action-btn:hover {
  transform: translateY(-1px);
}

.trading-card {
  margin-bottom: 24px;
}

.trading-form {
  padding: 24px;
}

.symbol-input :deep(.el-input__wrapper) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
}

.symbol-input :deep(.el-input__inner) {
  color: #e2e8f0;
}

.search-btn {
  background: rgba(14, 165, 233, 0.1);
  border: none;
  color: #0ea5e9;
}

.action-group :deep(.el-radio-button__inner) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

.action-group :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: rgba(14, 165, 233, 0.2);
  border-color: rgba(14, 165, 233, 0.3);
  color: #0ea5e9;
}

.buy-text {
  color: #10b981;
  font-weight: 600;
}

.sell-text {
  color: #ef4444;
  font-weight: 600;
}

.quantity-input, .order-type-select, .price-input {
  width: 100%;
}

.quantity-hint {
  font-size: 12px;
  color: #64748b;
  margin-top: 8px;
}

.submit-btn {
  width: 100%;
  padding: 14px 24px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 12px;
  transition: all 0.3s ease;
}

.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(14, 165, 233, 0.3);
}

.risk-card {
  margin-bottom: 24px;
}

.risk-metrics {
  padding: 24px;
}

.risk-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 12px;
  margin-bottom: 12px;
  transition: all 0.3s ease;
}

.risk-item:last-child {
  margin-bottom: 0;
}

.risk-item:hover {
  background: rgba(15, 23, 42, 0.6);
  transform: translateX(4px);
}

.risk-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.risk-icon svg {
  width: 20px;
  height: 20px;
}

.drawdown-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.leverage-icon {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
}

.pnl-icon {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.risk-content {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.risk-label {
  font-size: 14px;
  color: #94a3b8;
  font-weight: 500;
}

.risk-value {
  font-weight: 700;
  font-size: 18px;
}

.risk-value.warning {
  color: #f59e0b;
}

.risk-value.danger {
  color: #ef4444;
}

.action-tag {
  font-weight: 600;
}

.status-tag {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.time-value {
  color: #94a3b8;
  font-size: 13px;
}

/* Responsive */
@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
  
  .refresh-btn {
    width: 100%;
  }
  
  .summary-card {
    margin-bottom: 16px;
  }
}

.portfolio-tabs {
  margin-bottom: 20px;
}

.portfolio-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.portfolio-tabs :deep(.el-tabs__nav-wrap::after) {
  background: rgba(148, 163, 184, 0.1);
}

.portfolio-tabs :deep(.el-tabs__item) {
  color: #94a3b8;
  font-size: 16px;
  font-weight: 500;
  padding: 0 24px;
  height: 50px;
  line-height: 50px;
}

.portfolio-tabs :deep(.el-tabs__item:hover) {
  color: #e2e8f0;
}

.portfolio-tabs :deep(.el-tabs__item.is-active) {
  color: #0ea5e9;
  font-weight: 600;
}

.portfolio-tabs :deep(.el-tabs__active-bar) {
  background: linear-gradient(90deg, #0ea5e9, #10b981);
  height: 3px;
  border-radius: 3px;
}
</style>