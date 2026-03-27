import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ashareAPI } from '../api'

export const useMarketStore = defineStore('market', () => {
  // State
  const stocks = ref([])
  const currentStock = ref(null)
  const ohlcvData = ref([])
  const loading = ref(false)
  const selectedMarket = ref('CN')
  const marketStatus = ref({
    US: { status: 'ok', count: 0 },
    CN: { status: 'ok', count: 0 },
    HK: { status: 'ok', count: 0 }
  })

  // Getters
  const stockCount = computed(() => stocks.value.length)
  const hasData = computed(() => stocks.value.length > 0)

  // Actions
  async function fetchStockList(exchange = null) {
    loading.value = true
    try {
      const targetExchange = exchange || selectedMarket.value
      const response = await ashareAPI.getTickers(targetExchange)
      
      // 转换格式: tickers -> stocks
      stocks.value = (response.tickers || []).map(t => ({
        symbol: t.code,
        name: t.name,
        exchange: t.market || targetExchange,
        sector: t.sector || ''
      }))
      
      marketStatus.value[targetExchange] = {
        status: 'ok',
        count: response.total || stocks.value.length
      }
      return stocks.value
    } catch (error) {
      console.error('Failed to fetch stock list:', error)
      // Mock数据作为后备
      stocks.value = [
        { symbol: '600519', name: '贵州茅台', exchange: 'CN', sector: '消费' },
        { symbol: '000001', name: '平安银行', exchange: 'CN', sector: '金融' },
        { symbol: '600036', name: '招商银行', exchange: 'CN', sector: '金融' },
        { symbol: '000858', name: '五粮液', exchange: 'CN', sector: '消费' },
        { symbol: '300750', name: '宁德时代', exchange: 'CN', sector: '新能源' },
        { symbol: '002594', name: '比亚迪', exchange: 'CN', sector: '汽车' },
        { symbol: '601318', name: '中国平安', exchange: 'CN', sector: '金融' },
        { symbol: '600030', name: '中信证券', exchange: 'CN', sector: '金融' }
      ]
      marketStatus.value[selectedMarket.value] = {
        status: 'mock',
        count: stocks.value.length
      }
      return stocks.value
    } finally {
      loading.value = false
    }
  }

  async function fetchOHLCV(symbol, days = 90, frequency = 'daily') {
    loading.value = true
    try {
      const response = await ashareAPI.getDaily(symbol)
      ohlcvData.value = response.data || []
      currentStock.value = { symbol, data: ohlcvData.value }
      return ohlcvData.value
    } catch (error) {
      console.error('Failed to fetch OHLCV data:', error)
      // 生成mock数据
      const mockData = []
      const basePrice = symbol === '600519' ? 1800 : 100
      for (let i = 0; i < 30; i++) {
        const date = new Date()
        date.setDate(date.getDate() - 29 + i)
        const price = basePrice * (1 + (i * 0.002) + (Math.random() - 0.5) * 0.02)
        mockData.push({
          date: date.toISOString().split('T')[0],
          open: price * 0.998,
          high: price * 1.01,
          low: price * 0.99,
          close: price,
          volume: 1000000 + Math.floor(Math.random() * 500000)
        })
      }
      ohlcvData.value = mockData
      currentStock.value = { symbol, data: ohlcvData.value }
      return ohlcvData.value
    } finally {
      loading.value = false
    }
  }

  function setMarket(market) {
    selectedMarket.value = market
    fetchStockList(market)
  }

  function clearData() {
    stocks.value = []
    currentStock.value = null
    ohlcvData.value = []
  }

  return {
    // State
    stocks,
    currentStock,
    ohlcvData,
    loading,
    selectedMarket,
    marketStatus,
    // Getters
    stockCount,
    hasData,
    // Actions
    fetchStockList,
    fetchOHLCV,
    setMarket,
    clearData
  }
})
