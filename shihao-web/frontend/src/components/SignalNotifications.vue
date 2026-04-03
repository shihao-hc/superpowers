<template>
  <div class="signal-notifications">
    <div class="section-header">
      <h3>信号通知</h3>
      <div class="header-actions">
        <el-select v-model="filterType" size="small" class="filter-select">
          <el-option label="全部" value="all" />
          <el-option label="买入信号" value="buy" />
          <el-option label="卖出信号" value="sell" />
          <el-option label="风险告警" value="risk" />
        </el-select>
        <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="badge">
          <el-button size="small" @click="markAllRead" :disabled="unreadCount === 0">
            全部已读
          </el-button>
        </el-badge>
      </div>
    </div>

    <div class="signals-list" v-if="filteredSignals.length > 0">
      <div
        v-for="signal in filteredSignals"
        :key="signal.id"
        class="signal-item glass-card"
        :class="[`signal-${signal.type}`, { unread: !signal.read }]"
        @click="handleSignalClick(signal)"
      >
        <div class="signal-icon">
          <div class="icon-wrapper" :class="`icon-${signal.type}`">
            <svg v-if="signal.type === 'buy'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
            <svg v-else-if="signal.type === 'sell'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
        </div>
        
        <div class="signal-content">
          <div class="signal-header">
            <span class="signal-symbol">{{ signal.symbol }}</span>
            <span class="signal-time">{{ formatTime(signal.timestamp) }}</span>
          </div>
          <div class="signal-message">{{ signal.message }}</div>
          <div class="signal-meta" v-if="signal.confidence">
            <span class="confidence">
              置信度: {{ (signal.confidence * 100).toFixed(0) }}%
            </span>
            <span v-if="signal.price" class="price">
              价格: ¥{{ signal.price.toFixed(2) }}
            </span>
          </div>
        </div>
        
        <div class="signal-actions">
          <el-tag v-if="signal.type === 'buy'" type="danger" size="small" class="type-tag">
            买入
          </el-tag>
          <el-tag v-else-if="signal.type === 'sell'" type="success" size="small" class="type-tag">
            卖出
          </el-tag>
          <el-tag v-else type="warning" size="small" class="type-tag">
            告警
          </el-tag>
        </div>
      </div>
    </div>
    
    <div v-else class="empty-state">
      <el-empty description="暂无信号通知" :image-size="80">
        <template #image>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </template>
      </el-empty>
    </div>
    
    <div class="signal-stats" v-if="filteredSignals.length > 0">
      <div class="stat-item">
        <span class="stat-value buy">{{ buySignals }}</span>
        <span class="stat-label">买入信号</span>
      </div>
      <div class="stat-item">
        <span class="stat-value sell">{{ sellSignals }}</span>
        <span class="stat-label">卖出信号</span>
      </div>
      <div class="stat-item">
        <span class="stat-value risk">{{ riskAlerts }}</span>
        <span class="stat-label">风险告警</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

const signals = ref([])
const filterType = ref('all')

const filteredSignals = computed(() => {
  if (filterType.value === 'all') return signals.value
  return signals.value.filter(s => s.type === filterType.value)
})

const unreadCount = computed(() => signals.value.filter(s => !s.read).length)

const buySignals = computed(() => signals.value.filter(s => s.type === 'buy').length)
const sellSignals = computed(() => signals.value.filter(s => s.type === 'sell').length)
const riskAlerts = computed(() => signals.value.filter(s => s.type === 'risk').length)

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return date.toLocaleDateString('zh-CN')
}

function handleSignalClick(signal) {
  signal.read = true
  if (signal.action) {
    ElMessage.info(`跳转到 ${signal.symbol} 分析页面`)
  }
}

function markAllRead() {
  signals.value.forEach(s => s.read = true)
}

function generateMockSignals() {
  const mockSignals = [
    { id: 1, symbol: '600519', type: 'buy', message: '茅台突破20日均线，MACD金叉，建议关注', confidence: 0.85, price: 1876.5, read: false, timestamp: new Date(Date.now() - 300000) },
    { id: 2, symbol: '300750', type: 'sell', message: '宁德时代RSI超买，接近止盈位', confidence: 0.72, price: 195.5, read: false, timestamp: new Date(Date.now() - 1800000) },
    { id: 3, symbol: '000858', type: 'risk', message: '五粮液持仓超过风险阈值20%，建议减仓', confidence: 0.90, price: 152.3, read: true, timestamp: new Date(Date.now() - 3600000) },
    { id: 4, symbol: '601318', type: 'buy', message: '中国平安MACD底部金叉，量能放大', confidence: 0.78, price: 48.2, read: true, timestamp: new Date(Date.now() - 7200000) },
    { id: 5, symbol: '002594', type: 'sell', message: '比亚迪跌破支撑位，注意止损', confidence: 0.65, price: 268.8, read: true, timestamp: new Date(Date.now() - 14400000) },
    { id: 6, symbol: '600036', type: 'buy', message: '招商银行低估值修复，机构增持', confidence: 0.82, price: 35.6, read: false, timestamp: new Date(Date.now() - 28800000) },
  ]
  return mockSignals
}

let interval = null

onMounted(() => {
  signals.value = generateMockSignals()
  
  interval = setInterval(() => {
    if (Math.random() > 0.7) {
      const newSignal = {
        id: Date.now(),
        symbol: ['600519', '300750', '000858', '601318', '002594', '600036'][Math.floor(Math.random() * 6)],
        type: ['buy', 'sell', 'risk'][Math.floor(Math.random() * 3)],
        message: '实时行情更新，信号已刷新',
        confidence: 0.6 + Math.random() * 0.3,
        price: 100 + Math.random() * 500,
        read: false,
        timestamp: new Date()
      }
      signals.value.unshift(newSignal)
      if (signals.value.length > 20) {
        signals.value.pop()
      }
    }
  }, 30000)
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
})
</script>

<style scoped>
.signal-notifications {
  padding: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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

.filter-select {
  width: 120px;
}

.signals-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 500px;
  overflow-y: auto;
}

.signal-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.signal-item:hover {
  background: rgba(30, 41, 59, 0.8);
  transform: translateX(4px);
}

.signal-item.unread {
  border-left: 3px solid #0ea5e9;
}

.signal-buy.unread {
  border-left-color: #ef4444;
}

.signal-sell.unread {
  border-left-color: #10b981;
}

.signal-risk.unread {
  border-left-color: #f59e0b;
}

.signal-icon {
  flex-shrink: 0;
}

.icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-wrapper svg {
  width: 20px;
  height: 20px;
}

.icon-buy {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.icon-sell {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.icon-risk {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.signal-content {
  flex: 1;
  min-width: 0;
}

.signal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.signal-symbol {
  color: #e2e8f0;
  font-weight: 600;
  font-size: 15px;
}

.signal-time {
  color: #64748b;
  font-size: 12px;
}

.signal-message {
  color: #94a3b8;
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 8px;
}

.signal-meta {
  display: flex;
  gap: 16px;
}

.confidence, .price {
  color: #64748b;
  font-size: 12px;
}

.signal-actions {
  flex-shrink: 0;
}

.type-tag {
  font-weight: 600;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  width: 60px;
  height: 60px;
  color: #475569;
  margin: 0 auto;
}

.signal-stats {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
}

.stat-value.buy {
  color: #ef4444;
}

.stat-value.sell {
  color: #10b981;
}

.stat-value.risk {
  color: #f59e0b;
}

.stat-label {
  font-size: 12px;
  color: #64748b;
}

.badge {
  margin-left: 8px;
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
  
  .signal-item {
    flex-direction: column;
  }
  
  .signal-actions {
    align-self: flex-end;
  }
}
</style>
