import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { watchlistAPI, reviewAPI } from '../api'

export const usePortfolioStore = defineStore('portfolio', () => {
  // State
  const positions = ref([])
  const portfolioValue = ref(1000000) // Mock初始资金
  const cash = ref(500000) // Mock可用资金
  const totalPnL = ref(0)
  const riskMetrics = ref({
    max_drawdown: 0.05,
    leverage: 1.0,
    daily_pnl: 15000,
    daily_return: 0.015
  })
  const riskAlerts = ref([])
  const trades = ref([])
  const loading = ref(false)

  // Getters
  const positionCount = computed(() => positions.value.length)
  const profitPositions = computed(() => 
    positions.value.filter(p => (p.unrealized_pnl || 0) > 0)
  )
  const lossPositions = computed(() => 
    positions.value.filter(p => (p.unrealized_pnl || 0) < 0)
  )
  const dailyPnL = computed(() => riskMetrics.value.daily_pnl || 0)
  const dailyReturn = computed(() => riskMetrics.value.daily_return || 0)

  // Actions
  async function fetchPortfolio() {
    loading.value = true
    try {
      const response = await watchlistAPI.getList()
      
      // 使用自选股数据作为持仓（mock）
      const watchlists = response.watchlists || []
      positions.value = [
        { symbol: '600519', name: '贵州茅台', quantity: 100, avg_price: 1750, current_price: 1876.5, unrealized_pnl: 12650 },
        { symbol: '300750', name: '宁德时代', quantity: 500, avg_price: 180, current_price: 195.5, unrealized_pnl: 7750 },
        { symbol: '000858', name: '五粮液', quantity: 200, avg_price: 145, current_price: 152.3, unrealized_pnl: 1460 }
      ]
      
      totalPnL.value = positions.value.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0)
      portfolioValue.value = 1000000 + totalPnL.value
      
      return { positions: positions.value, portfolioValue: portfolioValue.value }
    } catch (error) {
      console.error('Failed to fetch portfolio:', error)
      // Mock数据
      positions.value = [
        { symbol: '600519', name: '贵州茅台', quantity: 100, avg_price: 1750, current_price: 1876.5, unrealized_pnl: 12650 },
        { symbol: '300750', name: '宁德时代', quantity: 500, avg_price: 180, current_price: 195.5, unrealized_pnl: 7750 }
      ]
      return { positions: positions.value, portfolioValue: 1000000 }
    } finally {
      loading.value = false
    }
  }

  async function executeTrade(tradeData) {
    loading.value = true
    try {
      // 使用watchlist API模拟交易
      const response = { status: 'filled', order_id: 'ORD' + Date.now() }
      
      trades.value.unshift({
        ...tradeData,
        order_id: response.order_id,
        status: response.status,
        timestamp: new Date().toISOString()
      })
      
      await fetchPortfolio()
      return response
    } catch (error) {
      console.error('Trade execution failed:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function fetchRiskMetrics() {
    try {
      const response = await reviewAPI.getDaily()
      riskMetrics.value = {
        max_drawdown: response.risk_metrics?.max_drawdown || 0.05,
        leverage: 1.0,
        daily_pnl: response.portfolio_performance?.total_pnl || 15000,
        daily_return: response.portfolio_performance?.daily_return || 0.015,
        var_95: response.risk_metrics?.var_95 || 0.025,
        sharpe_ratio: response.risk_metrics?.sharpe_ratio || 1.45
      }
      return riskMetrics.value
    } catch (error) {
      console.error('Failed to fetch risk metrics:', error)
      return riskMetrics.value
    }
  }

  async function fetchRiskAlerts() {
    try {
      const response = await watchlistAPI.checkAlerts('default')
      riskAlerts.value = (response.alerts || []).map(a => ({
        message: `${a.ticker} 触发 ${a.type} 告警`,
        level: 'warning',
        timestamp: new Date().toISOString()
      }))
      return riskAlerts.value
    } catch (error) {
      console.error('Failed to fetch risk alerts:', error)
      return []
    }
  }

  function clearData() {
    positions.value = []
    portfolioValue.value = 0
    cash.value = 0
    totalPnL.value = 0
    riskMetrics.value = {}
    riskAlerts.value = []
    trades.value = []
  }

  return {
    // State
    positions,
    portfolioValue,
    cash,
    totalPnL,
    riskMetrics,
    riskAlerts,
    trades,
    loading,
    // Getters
    positionCount,
    profitPositions,
    lossPositions,
    dailyPnL,
    dailyReturn,
    // Actions
    fetchPortfolio,
    executeTrade,
    fetchRiskMetrics,
    fetchRiskAlerts,
    clearData
  }
})
