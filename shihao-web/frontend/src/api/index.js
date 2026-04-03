import axios from 'axios'
import { ElMessage } from 'element-plus'

// API base URL - points to Python backend
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  response => response.data,
  error => {
    const message = error.response?.data?.detail || error.message || '请求失败'
    ElMessage.error(message)
    return Promise.reject(error)
  }
)

// ============== 健康检查 ==============
export const healthAPI = {
  check: () => api.get('/health'),
  detailed: () => api.get('/health/detailed')
}

// ============== 1. 多引擎聚合搜索 ==============
export const searchAPI = {
  // 搜索
  search: (query, engines = null, limit = 10) =>
    api.post('/api/v3/search', { query, engines, limit }),
  // 获取可用引擎
  getEngines: () => api.get('/api/v3/search/engines')
}

// ============== 2. 政策监控 ==============
export const policyAPI = {
  // 获取政策事件
  getEvents: (days = 7, minImpact = 0.1) =>
    api.get('/api/v3/policy/events', { params: { days, min_impact: minImpact } }),
  // 获取影响行业
  getSectors: () => api.get('/api/v3/policy/sectors')
}

// ============== 3. 股票分析 ==============
export const analysisAPI = {
  // 综合分析
  analyze: (ticker, includeFundamental = true, includeTechnical = true) =>
    api.get(`/api/v3/analysis/${ticker}`, { 
      params: { include_fundamental: includeFundamental, include_technical: includeTechnical } 
    }),
  // 基本面分析
  getFundamental: (ticker) => api.get(`/api/v3/analysis/${ticker}/fundamental`),
  // 技术面分析
  getTechnical: (ticker) => api.get(`/api/v3/analysis/${ticker}/technical`)
}

// ============== 4. 每日复盘 ==============
export const reviewAPI = {
  // 每日复盘
  getDaily: (date = null) => api.get('/api/v3/review/daily', { params: { date } }),
  // 每周复盘
  getWeekly: () => api.get('/api/v3/review/weekly')
}

// ============== 5. 量化知识库 ==============
export const knowledgeAPI = {
  // 获取条目
  getItems: (type = null, limit = 20) =>
    api.get('/api/v3/knowledge/items', { params: { type, limit } }),
  // 添加条目
  addItem: (item) => api.post('/api/v3/knowledge/items', item),
  // 语义搜索
  search: (query, limit = 10) =>
    api.get('/api/v3/knowledge/search', { params: { query, limit } })
}

// ============== 6. A股数据源 ==============
export const ashareAPI = {
  // 获取股票列表
  getTickers: (market = 'ALL') =>
    api.get('/api/v3/data/ashare/tickers', { params: { market } }),
  // 日K线数据
  getDaily: (ticker, startDate = null, endDate = null) =>
    api.get(`/api/v3/data/ashare/${ticker}/daily`, { 
      params: { start_date: startDate, end_date: endDate } 
    }),
  // 实时行情
  getRealtime: (ticker) => api.get(`/api/v3/data/ashare/realtime/${ticker}`)
}

// ============== 7. 高频数据源 ==============
export const highfreqAPI = {
  // Tick数据
  getTicks: (ticker, date = null, limit = 100) =>
    api.get(`/api/v3/data/highfreq/${ticker}/ticks`, { params: { date, limit } }),
  // 分钟K线
  getMinuteBars: (ticker, date = null, interval = 1) =>
    api.get(`/api/v3/data/highfreq/${ticker}/minute`, { params: { date, interval } }),
  // 订单簿
  getOrderBook: (ticker, depth = 5) =>
    api.get(`/api/v3/data/highfreq/${ticker}/orderbook`, { params: { depth } })
}

// ============== 8. 策略回测 ==============
export const backtestAPI = {
  // 运行回测
  run: (config) => api.post('/api/v3/backtest/run', config),
  // 获取策略列表
  getStrategies: () => api.get('/api/v3/backtest/strategies'),
  // 历史记录
  getHistory: (limit = 20) => api.get('/api/v3/backtest/history', { params: { limit } })
}

// ============== 9. 自选股监控 ==============
export const watchlistAPI = {
  // 获取列表
  getList: () => api.get('/api/v3/watchlist'),
  // 创建列表
  create: (name, tickers, description = '') =>
    api.post('/api/v3/watchlist', { name, tickers, description }),
  // 获取详情
  getDetail: (name) => api.get(`/api/v3/watchlist/${name}`),
  // 添加股票
  addItem: (name, ticker, targetPrice = null) =>
    api.post(`/api/v3/watchlist/${name}/items`, null, { 
      params: { ticker, target_price: targetPrice } 
    }),
  // 添加告警
  addAlert: (watchlistName, ticker, alertType, threshold) =>
    api.post('/api/v3/watchlist/alerts', { 
      watchlist_name: watchlistName, ticker, alert_type: alertType, threshold 
    }),
  // 检查告警
  checkAlerts: (watchlistName = 'default') =>
    api.get('/api/v3/watchlist/alerts/check', { params: { watchlist_name: watchlistName } })
}

// ============== 模块状态 ==============
export const modulesAPI = {
  getStatus: () => api.get('/api/v3/modules/status')
}

// ============== 兼容旧API (保留) ==============
export const marketAPI = {
  getList: (exchange) => ashareAPI.getTickers(exchange),
  getOHLCV: (symbol, days = 90) => ashareAPI.getDaily(symbol)
}

export const predictionAPI = {
  predict: (symbol) => analysisAPI.analyze(symbol),
  select: (exchange = 'CN', limit = 20) => searchAPI.search(exchange, ['stock'], limit)
}

export const portfolioAPI = {
  get: () => watchlistAPI.getList(),
  getPosition: (symbol) => watchlistAPI.getDetail(symbol)
}

export const tradingAPI = {
  execute: (data) => api.post('/api/v3/watchlist', data),
  getOrder: (orderId) => api.get(`/api/v3/watchlist/${orderId}`)
}

export const riskAPI = {
  getMetrics: () => api.get('/api/v3/review/daily'),
  getAlerts: () => watchlistAPI.checkAlerts()
}

export const xaiAPI = {
  explain: (symbol) => analysisAPI.getTechnical(symbol),
  getImportance: () => knowledgeAPI.getItems('factor')
}

// ============== 12. AI Agent ==============
export const agentAPI = {
  // Agent状态
  getStatus: () => api.get('/api/agent/status'),
  
  // 核心记忆
  getCoreMemory: () => api.get('/api/agent/memory/core'),
  updateCoreMemory: (block, value) => api.put('/api/agent/memory/core', { block, value }),
  
  // 会话记忆
  searchMemory: (query, userId = 'user', limit = 10) => 
    api.post('/api/agent/memory/search', { query, user_id: userId, limit }),
  
  // 触发分析
  analyze: (tickers, context = null) => 
    api.post('/api/agent/analyze', { tickers, context }),
  
  // 发送通知
  sendNotification: (title, content, priority = 'normal', channels = ['telegram']) =>
    api.post('/api/agent/notifications/send', { title, content, priority, channels })
}

// ============== 13. 数据同步 ==============
export const syncAPI = {
  // 同步历史记录
  syncHistory: (history) => api.post('/api/v3/sync/history', { history }),
  
  // 获取云端历史记录
  getSyncedHistory: (userId) => api.get(`/api/v3/sync/history/${userId}`)
}

// ============== 14. AI策略生成 ==============
export const strategyAPI = {
  // 生成策略
  generate: (ticker, type = 'trend', riskLevel = 'medium') => 
    api.post('/api/v3/strategy/generate', { ticker, type, risk_level: riskLevel }),
  
  // 获取策略模板
  getTemplates: () => api.get('/api/v3/strategy/templates')
}

// ============== 15. 风险控制 ==============
export const riskControlAPI = {
  // 分析风险
  analyze: (positions) => api.post('/api/v3/risk/analyze', { positions }),
  
  // 设置预警
  setAlert: (ticker, type, threshold) => 
    api.post('/api/v3/risk/set-alert', { ticker, type, threshold })
}

// ============== 16. 模拟交易 ==============
export const paperTradeAPI = {
  // 下单
  placeOrder: (ticker, action, quantity, price = null) => 
    api.post('/api/v3/paper/order', { ticker, action, quantity, price }),
  
  // 获取持仓
  getPortfolio: () => api.get('/api/v3/paper/portfolio'),
  
  // 获取历史
  getHistory: () => api.get('/api/v3/paper/history')
}

// ============== 17. 策略市场 ==============
export const marketplaceAPI = {
  // 获取策略列表
  getStrategies: () => api.get('/api/v3/marketplace/strategies')
}

// ============== 18. 组合分析 ==============
export const portfolioAnalyticsAPI = {
  // 获取组合分析数据
  getAnalytics: (days = 90) => api.get('/api/portfolio/analytics', { params: { days } })
}

export default api
