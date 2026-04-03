<template>
  <div class="paper-trade">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <div class="header-left">
          <h1>📝 模拟交易</h1>
          <p>零风险练习量化交易，积累实战经验</p>
        </div>
        <div class="header-right">
          <el-button type="primary" @click="refreshPortfolio">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </div>
    </div>

    <!-- Portfolio Summary -->
    <div class="portfolio-summary">
      <div class="summary-card total">
        <div class="card-icon">💰</div>
        <div class="card-content">
          <div class="card-label">总资产</div>
          <div class="card-value">¥{{ formatNumber(portfolio.total_value) }}</div>
        </div>
      </div>
      <div class="summary-card cash">
        <div class="card-icon">💵</div>
        <div class="card-content">
          <div class="card-label">可用现金</div>
          <div class="card-value">¥{{ formatNumber(portfolio.cash) }}</div>
        </div>
      </div>
      <div class="summary-card pnl" :class="portfolio.pnl >= 0 ? 'positive' : 'negative'">
        <div class="card-icon">{{ portfolio.pnl >= 0 ? '📈' : '📉' }}</div>
        <div class="card-content">
          <div class="card-label">浮动盈亏</div>
          <div class="card-value">
            {{ portfolio.pnl >= 0 ? '+' : '' }}¥{{ formatNumber(portfolio.pnl) }}
            <span class="pnl-percent">({{ portfolio.pnl >= 0 ? '+' : '' }}{{ portfolio.pnl_percent }}%)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Left: Trading Panel -->
      <div class="trading-section">
        <!-- Order Form -->
        <div class="order-card">
          <h3>📊 下单交易</h3>
          <div class="order-form">
            <div class="form-row">
              <el-input v-model="orderForm.ticker" placeholder="股票代码" @keyup.enter="placeOrder">
                <template #prepend>股票</template>
              </el-input>
            </div>
            <div class="form-row">
              <el-radio-group v-model="orderForm.action">
                <el-radio-button value="buy">
                  <span class="action-buy">买入</span>
                </el-radio-button>
                <el-radio-button value="sell">
                  <span class="action-sell">卖出</span>
                </el-radio-button>
              </el-radio-group>
            </div>
            <div class="form-row">
              <el-input-number 
                v-model="orderForm.quantity" 
                :min="100" 
                :step="100"
                placeholder="数量"
                style="width: 100%"
              />
            </div>
            <div class="form-row">
              <el-input-number 
                v-model="orderForm.price" 
                :precision="2" 
                :step="0.01"
                placeholder="价格（可选）"
                style="width: 100%"
              />
            </div>
            <div class="form-actions">
              <el-button 
                type="primary" 
                size="large" 
                @click="placeOrder"
                :disabled="!orderForm.ticker"
              >
                {{ orderForm.action === 'buy' ? '💰 买入' : '📤 卖出' }}
              </el-button>
            </div>
          </div>
        </div>

        <!-- Risk Control -->
        <div class="risk-card">
          <h3>🛡️ 风险控制</h3>
          <div class="risk-settings">
            <div class="risk-item">
              <div class="risk-label">止损线</div>
              <el-input-number v-model="riskSettings.stopLoss" :min="1" :max="20" :step="1" />
              <span class="risk-unit">%</span>
            </div>
            <div class="risk-item">
              <div class="risk-label">止盈线</div>
              <el-input-number v-model="riskSettings.takeProfit" :min="5" :max="50" :step="5" />
              <span class="risk-unit">%</span>
            </div>
            <div class="risk-item">
              <div class="risk-label">单票仓位</div>
              <el-input-number v-model="riskSettings.maxPosition" :min="10" :max="100" :step="10" />
              <span class="risk-unit">%</span>
            </div>
          </div>
          <div class="risk-tips">
            <p>💡 建议设置5%止损线，控制下行风险</p>
          </div>
        </div>
      </div>

      <!-- Right: Positions & History -->
      <div class="positions-section">
        <!-- Positions -->
        <div class="positions-card">
          <h3>📈 当前持仓</h3>
          <el-table :data="portfolio.positions" style="width: 100%">
            <el-table-column prop="ticker" label="代码" width="100" />
            <el-table-column prop="name" label="名称" width="120" />
            <el-table-column prop="quantity" label="数量" width="80" />
            <el-table-column prop="cost" label="成本" width="100">
              <template #default="scope">¥{{ scope.row.cost.toFixed(2) }}</template>
            </el-table-column>
            <el-table-column prop="current" label="现价" width="100">
              <template #default="scope">¥{{ scope.row.current.toFixed(2) }}</template>
            </el-table-column>
            <el-table-column label="盈亏" width="120">
              <template #default="scope">
                <span :class="getPnlClass(scope.row)">
                  {{ getPnl(scope.row) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="scope">
                <el-button size="small" type="danger" @click="sellPosition(scope.row)">
                  卖出
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- Trade History -->
        <div class="history-card">
          <h3>📜 交易历史</h3>
          <el-table :data="orders" style="width: 100%">
            <el-table-column prop="order_id" label="订单号" width="120">
              <template #default="scope">
                {{ scope.row.order_id.substring(0, 12) }}...
              </template>
            </el-table-column>
            <el-table-column prop="ticker" label="代码" width="100" />
            <el-table-column prop="action" label="方向" width="80">
              <template #default="scope">
                <el-tag :type="scope.row.action === 'buy' ? 'success' : 'danger'" size="small">
                  {{ scope.row.action === 'buy' ? '买入' : '卖出' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="80" />
            <el-table-column prop="price" label="价格" width="100">
              <template #default="scope">¥{{ scope.row.price.toFixed(2) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="scope">
                <el-tag type="success" size="small">{{ scope.row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="filled_at" label="时间" width="160">
              <template #default="scope">
                {{ formatTime(scope.row.filled_at) }}
              </template>
            </el-table-column>
          </el-table>
          
          <!-- Stats -->
          <div class="trade-stats">
            <div class="stat-item">
              <span class="stat-label">总交易次数</span>
              <span class="stat-value">{{ orders.length }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">胜率</span>
              <span class="stat-value">{{ (winRate * 100).toFixed(0) }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { paperTradeAPI } from '../api'

// State
const portfolio = ref({
  cash: 100000,
  total_value: 100000,
  pnl: 0,
  pnl_percent: 0,
  positions: []
})

const orders = ref([])
const winRate = ref(0)

const orderForm = ref({
  ticker: '',
  action: 'buy',
  quantity: 100,
  price: null
})

const riskSettings = ref({
  stopLoss: 5,
  takeProfit: 10,
  maxPosition: 30
})

// Methods
const formatNumber = (num) => {
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}

const getPnl = (position) => {
  const pnl = (position.current - position.cost) * position.quantity
  const percent = ((position.current - position.cost) / position.cost * 100).toFixed(2)
  return `${pnl >= 0 ? '+' : ''}¥${pnl.toFixed(2)} (${pnl >= 0 ? '+' : ''}${percent}%)`
}

const getPnlClass = (position) => {
  const pnl = (position.current - position.cost) * position.quantity
  return pnl >= 0 ? 'pnl-positive' : 'pnl-negative'
}

const refreshPortfolio = async () => {
  try {
    const result = await paperTradeAPI.getPortfolio()
    portfolio.value = result.portfolio
    
    const historyResult = await paperTradeAPI.getHistory()
    orders.value = historyResult.orders
    winRate.value = historyResult.win_rate
    
    ElMessage.success('数据已刷新')
  } catch (error) {
    console.error('Failed to refresh:', error)
  }
}

const placeOrder = async () => {
  if (!orderForm.value.ticker) {
    ElMessage.warning('请输入股票代码')
    return
  }
  
  try {
    const result = await paperTradeAPI.placeOrder(
      orderForm.value.ticker,
      orderForm.value.action,
      orderForm.value.quantity,
      orderForm.value.price
    )
    
    orders.value.unshift(result.order)
    
    const actionText = orderForm.value.action === 'buy' ? '买入' : '卖出'
    ElMessage.success(`${actionText}委托已提交`)
    
    // Reset form
    orderForm.value.ticker = ''
    orderForm.value.quantity = 100
    orderForm.value.price = null
  } catch (error) {
    ElMessage.error('下单失败')
  }
}

const sellPosition = (position) => {
  orderForm.value.ticker = position.ticker
  orderForm.value.action = 'sell'
  orderForm.value.quantity = position.quantity
  orderForm.value.price = position.current
}

// Load data on mount
onMounted(() => {
  refreshPortfolio()
})
</script>

<style scoped>
.paper-trade {
  padding: 24px;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  min-height: calc(100vh - 104px);
}

.page-header {
  margin-bottom: 24px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left h1 {
  margin: 0 0 4px 0;
  font-size: 28px;
  color: #f8fafc;
}

.header-left p {
  margin: 0;
  color: #94a3b8;
}

.portfolio-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.summary-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.summary-card.positive {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.1);
}

.summary-card.negative {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
}

.card-icon {
  font-size: 32px;
}

.card-label {
  color: #94a3b8;
  font-size: 14px;
  margin-bottom: 4px;
}

.card-value {
  color: #f8fafc;
  font-size: 24px;
  font-weight: 700;
}

.pnl-percent {
  font-size: 16px;
  opacity: 0.8;
}

.main-content {
  display: flex;
  gap: 24px;
}

.trading-section {
  width: 350px;
}

.positions-section {
  flex: 1;
}

.order-card, .risk-card, .positions-card, .history-card {
  background: rgba(30, 41, 59, 0.5);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.order-card h3, .risk-card h3, .positions-card h3, .history-card h3 {
  color: #f8fafc;
  margin: 0 0 16px 0;
}

.order-form .form-row {
  margin-bottom: 16px;
}

.form-actions {
  text-align: center;
}

.risk-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.risk-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.risk-label {
  width: 80px;
  color: #94a3b8;
}

.risk-unit {
  color: #94a3b8;
}

.risk-tips {
  margin-top: 16px;
  padding: 12px;
  background: rgba(14, 165, 233, 0.1);
  border-radius: 8px;
}

.risk-tips p {
  margin: 0;
  color: #0ea5e9;
  font-size: 13px;
}

.trade-stats {
  display: flex;
  gap: 24px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.stat-item {
  display: flex;
  gap: 8px;
}

.stat-label {
  color: #94a3b8;
}

.stat-value {
  color: #f8fafc;
  font-weight: 600;
}

.pnl-positive {
  color: #10b981;
}

.pnl-negative {
  color: #ef4444;
}

.action-buy {
  color: #10b981;
}

.action-sell {
  color: #ef4444;
}

/* Responsive */
@media (max-width: 1024px) {
  .main-content {
    flex-direction: column;
  }
  
  .trading-section {
    width: 100%;
  }
  
  .portfolio-summary {
    flex-direction: column;
  }
}
</style>