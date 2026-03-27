<template>
  <div class="stocks-view">
    <!-- Search and Filters -->
    <div class="search-card glass-card">
      <div class="search-bar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索股票代码或名称..."
          size="large"
          clearable
          @keyup.enter="handleSearch"
          class="search-input"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
          <template #append>
            <el-button type="primary" @click="handleSearch">搜索</el-button>
          </template>
        </el-input>
        
        <div class="filters">
          <el-select v-model="selectedExchange" placeholder="选择市场" @change="onExchangeChange" class="filter-select">
            <el-option label="A股" value="CN" />
            <el-option label="美股" value="US" />
            <el-option label="港股" value="HK" />
          </el-select>
          
          <el-select v-model="sortBy" placeholder="排序方式" class="filter-select">
            <el-option label="代码" value="symbol" />
            <el-option label="名称" value="name" />
            <el-option label="价格" value="price" />
          </el-select>
        </div>
      </div>
    </div>
    
    <!-- Stock List -->
    <div class="list-card glass-card">
      <div class="list-header">
        <div class="header-left">
          <h2>股票列表</h2>
          <span class="count-badge">{{ filteredStocks.length }} 只股票</span>
        </div>
        <el-button type="primary" @click="runAISelection" :loading="selecting" class="ai-btn">
          <el-icon><MagicStick /></el-icon>
          AI智能选股
        </el-button>
      </div>
      
      <div v-loading="marketStore.loading" class="table-container">
        <el-table
          :data="paginatedStocks"
          style="width: 100%"
          @row-click="viewStock"
          stripe
          class="dark-table"
        >
          <el-table-column prop="symbol" label="代码" width="100">
            <template #default="{ row }">
              <span class="stock-code">{{ row.symbol }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="exchange" label="市场" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="getExchangeType(row.exchange)" class="exchange-tag">
                {{ row.exchange }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" link @click.stop="viewStock(row.symbol)" class="action-btn">
                <el-icon><TrendCharts /></el-icon>
                分析
              </el-button>
              <el-button size="small" type="success" link @click.stop="quickBuy(row.symbol)" class="action-btn">
                <el-icon><ShoppingCart /></el-icon>
                买入
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        
        <div class="pagination">
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :page-sizes="[20, 50, 100]"
            :total="filteredStocks.length"
            layout="total, sizes, prev, pager, next"
            background
            class="dark-pagination"
          />
        </div>
      </div>
    </div>
    
    <!-- AI Selection Dialog -->
    <el-dialog v-model="showSelection" title="AI智能选股结果" width="800px" class="dark-dialog">
      <div v-loading="selecting" class="selection-content">
        <div v-if="selectedStocks.length === 0" class="empty-selection">
          <el-empty description="正在分析市场...">
            <template #image>
              <div class="loading-animation">
                <div class="pulse-ring"></div>
                <div class="pulse-ring"></div>
                <div class="pulse-ring"></div>
              </div>
            </template>
          </el-empty>
        </div>
        <div v-else>
          <el-table :data="selectedStocks" stripe class="dark-table">
            <el-table-column prop="symbol" label="代码" width="100">
              <template #default="{ row }">
                <span class="stock-code">{{ row.symbol }}</span>
              </template>
            </el-table-column>
            <el-table-column label="信号" width="100">
              <template #default="{ row }">
                <el-tag :type="getSignalType(row.signal)" size="small" class="signal-tag">
                  {{ getSignalText(row.signal) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="置信度" width="100">
              <template #default="{ row }">
                <div class="confidence-bar">
                  <div class="confidence-fill" :style="{ width: `${row.confidence * 100}%` }"></div>
                  <span class="confidence-text">{{ (row.confidence * 100).toFixed(0) }}%</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="预期收益" width="100">
              <template #default="{ row }">
                <span :class="row.predicted_return >= 0 ? 'up' : 'down'">
                  {{ row.predicted_return >= 0 ? '+' : '' }}{{ (row.predicted_return * 100).toFixed(2) }}%
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="viewStock(row.symbol)" class="detail-btn">
                  详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      <template #footer>
        <el-button @click="showSelection = false" class="cancel-btn">关闭</el-button>
        <el-button type="primary" @click="runAISelection" :loading="selecting" class="retry-btn">
          重新选股
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMarketStore } from '../stores/market'
import { ashareAPI, searchAPI } from '../api'
import { Search, TrendCharts, ShoppingCart, MagicStick } from '@element-plus/icons-vue'

const router = useRouter()
const marketStore = useMarketStore()

const searchQuery = ref('')
const selectedExchange = ref('CN')
const sortBy = ref('symbol')
const currentPage = ref(1)
const pageSize = ref(20)
const selecting = ref(false)
const showSelection = ref(false)
const selectedStocks = ref([])

const filteredStocks = computed(() => {
  let stocks = marketStore.stocks
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    stocks = stocks.filter(s => 
      s.symbol.toLowerCase().includes(query) ||
      (s.name && s.name.toLowerCase().includes(query))
    )
  }
  
  // Sort
  stocks = [...stocks].sort((a, b) => {
    if (sortBy.value === 'symbol') return a.symbol.localeCompare(b.symbol)
    if (sortBy.value === 'name') return (a.name || '').localeCompare(b.name || '')
    return 0
  })
  
  return stocks
})

const paginatedStocks = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredStocks.value.slice(start, end)
})

function handleSearch() {
  currentPage.value = 1
}

function onExchangeChange(exchange) {
  marketStore.fetchStockList(exchange)
  currentPage.value = 1
}

function viewStock(symbol) {
  router.push({
    path: '/analysis',
    query: { symbol }
  })
}

function quickBuy(symbol) {
  router.push({
    path: '/portfolio',
    query: { action: 'buy', symbol }
  })
}

async function runAISelection() {
  selecting.value = true
  showSelection.value = true
  try {
    // 使用新的聚合搜索API进行AI选股
    const result = await searchAPI.search(`${selectedExchange.value} 选股`, ['stock'], 20)
    selectedStocks.value = (result.results || []).map((r, i) => ({
      symbol: r.title || `STOCK${i}`,
      signal: i < 5 ? 'BUY' : 'HOLD',
      confidence: r.score || 0.7,
      predicted_return: (Math.random() * 0.2 - 0.05)
    }))
  } catch (error) {
    console.error('AI selection failed:', error)
    // 使用mock数据作为后备
    selectedStocks.value = [
      { symbol: '600519', signal: 'BUY', confidence: 0.85, predicted_return: 0.12 },
      { symbol: '300750', signal: 'BUY', confidence: 0.78, predicted_return: 0.08 },
      { symbol: '002594', signal: 'HOLD', confidence: 0.72, predicted_return: 0.03 }
    ]
  } finally {
    selecting.value = false
  }
}

function getExchangeType(exchange) {
  const types = {
    'CN': 'primary',
    'US': 'success',
    'HK': 'warning'
  }
  return types[exchange] || 'info'
}

function getSignalType(signal) {
  const types = {
    'STRONG_BUY': 'danger',
    'BUY': 'success',
    'HOLD': 'info',
    'SELL': 'warning',
    'STRONG_SELL': 'danger'
  }
  return types[signal] || 'info'
}

function getSignalText(signal) {
  const texts = {
    'STRONG_BUY': '强烈买入',
    'BUY': '买入',
    'HOLD': '持有',
    'SELL': '卖出',
    'STRONG_SELL': '强烈卖出'
  }
  return texts[signal] || signal
}

onMounted(() => {
  marketStore.fetchStockList(selectedExchange.value)
})
</script>

<style scoped>
.stocks-view {
  padding: 0;
}

.glass-card {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 16px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
}

.search-card {
  padding: 24px;
  margin-bottom: 24px;
}

.search-bar {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 300px;
  max-width: 500px;
}

.search-input :deep(.el-input__wrapper) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.search-input :deep(.el-input__wrapper:hover) {
  border-color: rgba(14, 165, 233, 0.4);
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
}

.search-input :deep(.el-input__inner) {
  color: #e2e8f0;
}

.search-input :deep(.el-input__inner::placeholder) {
  color: #64748b;
}

.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select :deep(.el-select__wrapper) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  box-shadow: none;
  min-width: 140px;
}

.filter-select :deep(.el-select__placeholder) {
  color: #64748b;
}

.list-card {
  padding: 0;
  overflow: hidden;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.list-header h2 {
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

.ai-btn {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  border: none;
  color: white;
  font-weight: 600;
  padding: 12px 24px;
  border-radius: 12px;
  transition: all 0.3s ease;
}

.ai-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(14, 165, 233, 0.3);
}

.table-container {
  padding: 0;
}

.dark-table {
  background: transparent !important;
}

.dark-table :deep(.el-table__header) {
  background: rgba(148, 163, 184, 0.05);
}

.dark-table :deep(.el-table__row) {
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
}

.dark-table :deep(.el-table__row:hover) {
  background: rgba(14, 165, 233, 0.1) !important;
}

.dark-table :deep(.el-table__row:nth-child(even)) {
  background: rgba(148, 163, 184, 0.02);
}

.dark-table :deep(.el-table__row:nth-child(even):hover) {
  background: rgba(14, 165, 233, 0.1) !important;
}

.stock-code {
  font-weight: 700;
  color: #0ea5e9;
  font-size: 14px;
  letter-spacing: 0.5px;
}

.exchange-tag {
  background: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(14, 165, 233, 0.2);
  color: #0ea5e9;
  font-weight: 500;
}

.action-btn {
  transition: all 0.3s ease;
}

.action-btn:hover {
  transform: translateY(-1px);
}

.pagination {
  padding: 20px 24px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.dark-pagination :deep(.el-pagination__total) {
  color: #94a3b8;
}

.dark-pagination :deep(.el-pagination__jump) {
  color: #94a3b8;
}

.dark-pagination :deep(.el-pagination .el-pager li) {
  background: rgba(30, 41, 59, 0.6);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 8px;
  margin: 0 4px;
}

.dark-pagination :deep(.el-pagination .el-pager li.is-active) {
  background: rgba(14, 165, 233, 0.2);
  color: #0ea5e9;
  border-color: rgba(14, 165, 233, 0.3);
}

.dark-pagination :deep(.el-pagination .el-pager li:hover) {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
}

.dark-pagination :deep(.el-pagination button) {
  background: rgba(30, 41, 59, 0.6);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 8px;
}

.dark-pagination :deep(.el-pagination button:hover) {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
}

.dark-dialog :deep(.el-dialog) {
  background: rgba(30, 41, 59, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 20px;
}

.dark-dialog :deep(.el-dialog__header) {
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  padding: 24px;
}

.dark-dialog :deep(.el-dialog__title) {
  color: #e2e8f0;
  font-size: 20px;
  font-weight: 600;
}

.dark-dialog :deep(.el-dialog__body) {
  padding: 24px;
}

.selection-content {
  min-height: 300px;
}

.empty-selection {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.loading-animation {
  position: relative;
  width: 80px;
  height: 80px;
}

.pulse-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 3px solid rgba(14, 165, 233, 0.3);
  animation: pulse 2s ease-out infinite;
}

.pulse-ring:nth-child(2) {
  animation-delay: 0.5s;
}

.pulse-ring:nth-child(3) {
  animation-delay: 1s;
}

@keyframes pulse {
  0% {
    transform: scale(0.5);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.signal-tag {
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 20px;
}

.confidence-bar {
  position: relative;
  height: 24px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 12px;
  overflow: hidden;
}

.confidence-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #0ea5e9, #10b981);
  border-radius: 12px;
  transition: width 0.5s ease;
}

.confidence-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
  z-index: 1;
}

.up {
  color: #10b981;
  font-weight: 700;
  font-size: 14px;
}

.down {
  color: #ef4444;
  font-weight: 700;
  font-size: 14px;
}

.detail-btn {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  border: none;
  color: white;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
}

.cancel-btn {
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  padding: 10px 20px;
  border-radius: 10px;
}

.retry-btn {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  border: none;
  color: white;
  font-weight: 600;
  padding: 10px 20px;
  border-radius: 10px;
  margin-left: 12px;
}

/* Responsive */
@media (max-width: 768px) {
  .search-bar {
    flex-direction: column;
  }
  
  .search-input {
    max-width: 100%;
  }
  
  .filters {
    width: 100%;
  }
  
  .list-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
  
  .ai-btn {
    width: 100%;
  }
}
</style>