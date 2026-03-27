import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/stock/pool'
  },
  // 选股系统 Stock System (/stock)
  {
    path: '/stock',
    redirect: '/stock/pool',
    children: [
      {
        path: 'pool',
        name: 'StockPool',
        component: () => import('../views/StocksView.vue'),
        meta: { title: '选股池', system: 'stock' }
      },
      {
        path: 'analysis',
        name: 'StockAnalysis',
        component: () => import('../views/AnalysisView.vue'),
        meta: { title: 'AI分析', system: 'stock' }
      },
      {
        path: 'backtest',
        name: 'StockBacktest',
        component: () => import('../views/BacktestView.vue'),
        meta: { title: '回测中心', system: 'stock' }
      },
      {
        path: 'chat',
        name: 'StockChat',
        component: () => import('../views/ChatView.vue'),
        meta: { title: 'AI助手', system: 'stock' }
      }
    ]
  },
  // 交易系统 Trade System (/trade)
  {
    path: '/trade',
    redirect: '/trade/portfolio',
    children: [
      {
        path: 'portfolio',
        name: 'TradePortfolio',
        component: () => import('../views/PortfolioView.vue'),
        meta: { title: '持仓视图', system: 'trade' }
      },
      {
        path: 'orders',
        name: 'TradeOrders',
        component: () => import('../views/DashboardView.vue'),
        meta: { title: '订单管理', system: 'trade' }
      },
      {
        path: 'chat',
        name: 'TradeChat',
        component: () => import('../views/ChatView.vue'),
        meta: { title: '交易助手', system: 'trade' }
      }
    ]
  },
  // 监控中心 Monitor Center (/monitor)
  {
    path: '/monitor',
    redirect: '/monitor/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'MonitorDashboard',
        component: () => import('../views/DashboardView.vue'),
        meta: { title: '监控仪表盘', system: 'monitor' }
      },
      {
        path: 'alerts',
        name: 'MonitorAlerts',
        component: () => import('../views/SettingsView.vue'),
        meta: { title: '告警列表', system: 'monitor' }
      },
      {
        path: 'health',
        name: 'MonitorHealth',
        component: () => import('../views/SettingsView.vue'),
        meta: { title: '系统健康', system: 'monitor' }
      }
    ]
  },
  // 旧路由兼容重定向
  {
    path: '/dashboard',
    redirect: '/trade/portfolio'
  },
  {
    path: '/stocks',
    redirect: '/stock/pool'
  },
  {
    path: '/analysis',
    redirect: '/stock/analysis'
  },
  {
    path: '/agent',
    redirect: '/stock/chat'
  },
  {
    path: '/portfolio',
    redirect: '/trade/portfolio'
  },
  {
    path: '/backtest',
    redirect: '/stock/backtest'
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { title: '设置' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title || '拾号金融'} - ShiHao Finance`
  next()
})

export default router
