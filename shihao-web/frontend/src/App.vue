<template>
  <!-- Heart Animation Background -->
  <div class="heart-bg">
    <canvas ref="heartCanvas" class="heart-canvas"></canvas>
  </div>
  
  <el-container class="app-container">
    <!-- Header -->
    <el-header class="app-header">
      <div class="header-content">
        <div class="logo" @click="goHome">
          <div class="logo-icon">拾</div>
          <span class="logo-text">拾号金融</span>
        </div>
        
        <!-- 系统切换导航 -->
        <div class="system-tabs">
          <div 
            class="system-tab" 
            :class="{ active: currentSystem === 'stock' }"
            @click="switchSystem('stock')"
          >
            <span class="tab-icon">📊</span>
            <span class="tab-label">选股系统</span>
          </div>
          <div 
            class="system-tab" 
            :class="{ active: currentSystem === 'trade' }"
            @click="switchSystem('trade')"
          >
            <span class="tab-icon">💹</span>
            <span class="tab-label">交易系统</span>
          </div>
          <div 
            class="system-tab" 
            :class="{ active: currentSystem === 'monitor' }"
            @click="switchSystem('monitor')"
          >
            <span class="tab-icon">📡</span>
            <span class="tab-label">监控中心</span>
          </div>
        </div>
        
        <div class="header-actions">
          <!-- 深色模式切换 -->
          <el-tooltip content="深色模式" placement="bottom">
            <el-button 
              :icon="isDark ? Sunny : Moon" 
              circle 
              @click="toggleDarkMode"
            />
          </el-tooltip>
          <!-- AI助手按钮 -->
          <el-button type="primary" :icon="ChatDotRound" @click="openAIChat">
            AI助手
          </el-button>
          <el-badge :value="riskAlertsCount" :hidden="riskAlertsCount === 0" type="danger">
            <el-button :icon="Bell" circle @click="showRiskAlerts" />
          </el-badge>
          <el-button :icon="Refresh" circle @click="refreshData" :loading="loading" />
        </div>
      </div>
    </el-header>
    
    <!-- 主体区域：侧边栏 + 主内容 -->
    <div class="app-body">
      <!-- 侧边栏 -->
      <aside class="app-sidebar" v-if="showSidebar">
        <el-menu
          :default-active="activeMenu"
          router
          class="sidebar-menu"
        >
          <template v-for="item in sidebarMenus" :key="item.path">
            <el-menu-item :index="item.path">
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </el-menu-item>
          </template>
        </el-menu>
      </aside>
      
      <!-- Main Content -->
      <el-main class="app-main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </div>
    
    <!-- Risk Alerts Drawer -->
    <el-drawer
      v-model="showAlerts"
      title="风险告警"
      direction="rtl"
      size="400px"
    >
      <div v-if="riskAlerts.length === 0" class="no-alerts">
        <el-icon :size="48"><CircleCheck /></el-icon>
        <p>暂无风险告警</p>
      </div>
      <el-timeline v-else>
        <el-timeline-item
          v-for="(alert, index) in riskAlerts"
          :key="index"
          :type="getAlertType(alert.level)"
          :timestamp="formatTime(alert.timestamp)"
          placement="top"
        >
          <el-card shadow="never">
            <h4>{{ alert.message }}</h4>
            <p class="alert-level">级别: {{ alert.level }}</p>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </el-drawer>
    
    <!-- System Status Footer -->
    <el-footer class="app-footer">
      <div class="footer-content">
        <div class="status-item">
          <span class="status-dot" :class="systemStatus.data"></span>
          <span>数据源</span>
        </div>
        <div class="status-item">
          <span class="status-dot" :class="systemStatus.model"></span>
          <span>模型</span>
        </div>
        <div class="status-item">
          <span class="status-dot" :class="systemStatus.trading"></span>
          <span>交易</span>
        </div>
        <div class="version">v2.0.0</div>
      </div>
    </el-footer>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePortfolioStore } from './stores/portfolio'
import { healthAPI } from './api'
import {
  DataBoard,
  TrendCharts,
  DataAnalysis,
  Wallet,
  Timer,
  Setting,
  Bell,
  Refresh,
  CircleCheck,
  MagicStick,
  ChatDotRound,
  List,
  Odometer,
  Warning,
  Connection,
  Sunny,
  Moon
} from '@element-plus/icons-vue'

const isDark = ref(false)

const toggleDarkMode = () => {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'dark') {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
})

const route = useRoute()
const router = useRouter()
const portfolioStore = usePortfolioStore()

const loading = ref(false)
const showAlerts = ref(false)
const currentSystem = ref('stock')
const systemStatus = ref({
  data: 'ok',
  model: 'ok',
  trading: 'ok'
})

const sidebarMenus = computed(() => {
  const menus = {
    stock: [
      { path: '/stock/ai-assistant', label: 'AI助手', icon: 'ChatDotRound' },
      { path: '/stock/pool', label: '选股池', icon: 'List' },
      { path: '/stock/analysis', label: 'AI分析', icon: 'DataAnalysis' },
      { path: '/stock/strategy-generator', label: '策略生成', icon: 'Aim' },
      { path: '/stock/paper-trade', label: '模拟交易', icon: 'Money' },
      { path: '/stock/backtest', label: '回测中心', icon: 'Timer' },
      { path: '/stock/agent-panel', label: 'Agent面板', icon: 'MagicStick' },
    ],
    trade: [
      { path: '/trade/portfolio', label: '持仓视图', icon: 'Wallet' },
      { path: '/trade/orders', label: '订单管理', icon: 'List' },
      { path: '/trade/chat', label: '交易助手', icon: 'ChatDotRound' },
    ],
    monitor: [
      { path: '/monitor/dashboard', label: '监控仪表盘', icon: 'Odometer' },
      { path: '/monitor/alerts', label: '告警列表', icon: 'Warning' },
      { path: '/monitor/health', label: '系统健康', icon: 'Connection' },
    ]
  }
  return menus[currentSystem.value] || []
})

const showSidebar = computed(() => {
  return ['stock', 'trade', 'monitor'].includes(currentSystem.value)
})

const activeMenu = computed(() => route.path)
const riskAlertsCount = computed(() => portfolioStore.riskAlerts.length)

function switchSystem(system) {
  currentSystem.value = system
  const defaultRoutes = {
    stock: '/stock/ai-assistant',
    trade: '/trade/portfolio',
    monitor: '/monitor/dashboard'
  }
  router.push(defaultRoutes[system])
}

function openAIChat() {
  const chatRoutes = {
    stock: '/stock/ai-assistant',
    trade: '/trade/chat',
    monitor: '/stock/ai-assistant'
  }
  router.push(chatRoutes[currentSystem.value])
}

watch(() => route.path, (path) => {
  if (path.startsWith('/stock')) currentSystem.value = 'stock'
  else if (path.startsWith('/trade')) currentSystem.value = 'trade'
  else if (path.startsWith('/monitor')) currentSystem.value = 'monitor'
}, { immediate: true })

async function checkSystemHealth() {
  try {
    const health = await healthAPI.detailed()
    systemStatus.value = {
      data: health.components?.data_manager?.status === 'healthy' ? 'ok' : 'warning',
      model: 'ok',
      trading: health.components?.trading_engine?.status === 'ok' ? 'ok' : 'warning'
    }
  } catch (error) {
    systemStatus.value = {
      data: 'error',
      model: 'error',
      trading: 'error'
    }
  }
}

async function refreshData() {
  loading.value = true
  try {
    await Promise.all([
      portfolioStore.fetchPortfolio(),
      portfolioStore.fetchRiskAlerts(),
      checkSystemHealth()
    ])
  } finally {
    loading.value = false
  }
}

function showRiskAlerts() {
  showAlerts.value = true
}

function goHome() {
  router.push('/dashboard')
}

function getAlertType(level) {
  const types = {
    info: 'info',
    warning: 'warning',
    critical: 'danger',
    emergency: 'danger'
  }
  return types[level] || 'info'
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// Heart Animation
const heartCanvas = ref(null)
let heartAnimId = null
let particles = []
let time = 0

function heartX(t) {
  return 16 * Math.pow(Math.sin(t), 3)
}

function heartY(t) {
  return -(
    13 * Math.cos(t) - 
    5 * Math.cos(2 * t) - 
    2 * Math.cos(3 * t) - 
    Math.cos(4 * t)
  )
}

function initHeartAnimation() {
  const canvas = heartCanvas.value
  if (!canvas) return
  
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const centerX = canvas.width / 2
  const centerY = canvas.height / 2
  const scale = Math.min(canvas.width, canvas.height) / 25
  
  particles = []
  for (let i = 0; i < 300; i++) {
    const t = Math.random() * Math.PI * 2
    const baseX = heartX(t) * scale + centerX
    const baseY = heartY(t) * scale + centerY
    const scatter = Math.random() * 40
    const angle = Math.random() * Math.PI * 2
    
    particles.push({
      x: baseX + Math.cos(angle) * scatter,
      y: baseY + Math.sin(angle) * scatter,
      baseX: baseX,
      baseY: baseY,
      size: Math.random() * 4 + 1,
      speed: Math.random() * 0.03 + 0.01,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random() * 40 + 330
    })
  }
  
  animateHeart(ctx, canvas, scale, centerX, centerY)
}

function animateHeart(ctx, canvas, scale, centerX, centerY) {
  time += 0.02
  
  // Semi-transparent clear for trail effect
  ctx.fillStyle = 'rgba(15, 23, 42, 0.08)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  
  // Draw heart outline with glow
  const pulse = Math.sin(time * 2) * 0.3 + 0.7
  
  // Glow effect
  ctx.shadowBlur = 40
  ctx.shadowColor = 'rgba(255, 100, 150, 1)'
  
  ctx.strokeStyle = `rgba(255, 105, 180, ${0.9 * pulse})`
  ctx.lineWidth = 4
  ctx.beginPath()
  for (let t = 0; t <= Math.PI * 2; t += 0.01) {
    const x = heartX(t) * scale + centerX
    const y = heartY(t) * scale + centerY
    if (t === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.closePath()
  ctx.stroke()
  
  // Reset shadow for particles
  ctx.shadowBlur = 0
  
  // Update and draw particles
  particles.forEach(p => {
    p.phase += p.speed
    p.x = p.baseX + Math.sin(p.phase) * 15
    p.y = p.baseY + Math.cos(p.phase * 0.7) * 12
    
    const alpha = 0.6 + Math.sin(p.phase) * 0.3
    ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${alpha})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
    
    // Add glow to larger particles
    if (p.size > 2.5) {
      ctx.shadowBlur = 10
      ctx.shadowColor = `hsla(${p.hue}, 100%, 65%, 0.5)`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  })
  
  heartAnimId = requestAnimationFrame(() => 
    animateHeart(ctx, canvas, scale, centerX, centerY)
  )
}

function handleResize() {
  if (heartCanvas.value) {
    heartCanvas.value.width = window.innerWidth
    heartCanvas.value.height = window.innerHeight
  }
}

onMounted(() => {
  refreshData()
  // Check health every 60 seconds
  setInterval(checkSystemHealth, 60000)
  // Start heart animation
  initHeartAnimation()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (heartAnimId) {
    cancelAnimationFrame(heartAnimId)
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<style>
:root {
  --primary-color: #0ea5e9;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --danger-color: #ef4444;
  --header-height: 64px;
  --footer-height: 40px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* Heart Background Animation */
.heart-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.heart-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: #e2e8f0;
  min-height: 100vh;
}

.app-container {
  min-height: 100vh;
  background: rgba(15, 23, 42, 0.65);
  position: relative;
  z-index: 1;
}

.app-header {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
  height: var(--header-height);
  padding: 0;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 24px;
  max-width: 1800px;
  margin: 0 auto;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.logo:hover {
  opacity: 0.8;
  transform: translateY(-1px);
}

.logo-icon {
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 800;
  font-size: 20px;
  box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3);
}

.logo-text {
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.5px;
}

.system-tabs {
  display: flex;
  gap: 4px;
  background: rgba(15, 23, 42, 0.8);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.system-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  color: #64748b;
  font-weight: 500;
}

.system-tab:hover {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
}

.system-tab.active {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  color: white;
}

.tab-icon {
  font-size: 16px;
}

.tab-label {
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.header-actions .el-button {
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  transition: all 0.3s ease;
}

.header-actions .el-button:hover {
  background: rgba(14, 165, 233, 0.1);
  border-color: rgba(14, 165, 233, 0.3);
  color: #0ea5e9;
}

.app-main {
  margin-top: var(--header-height);
  margin-bottom: var(--footer-height);
  padding: 24px;
  min-height: calc(100vh - var(--header-height) - var(--footer-height));
  max-width: 1800px;
  margin-left: auto;
  margin-right: auto;
}

.app-body {
  display: flex;
  margin-top: var(--header-height);
}

.app-sidebar {
  width: 200px;
  background: rgba(30, 41, 59, 0.8);
  border-right: 1px solid rgba(148, 163, 184, 0.1);
  padding-top: 16px;
  position: fixed;
  top: var(--header-height);
  bottom: var(--footer-height);
  left: 0;
  overflow-y: auto;
}

.sidebar-menu {
  border: none;
  background: transparent;
}

.sidebar-menu .el-menu-item {
  color: #94a3b8;
  margin: 4px 8px;
  border-radius: 8px;
}

.sidebar-menu .el-menu-item:hover {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
}

.sidebar-menu .el-menu-item.is-active {
  background: rgba(14, 165, 233, 0.2);
  color: #0ea5e9;
}

.app-main:has(+ .app-sidebar) {
  margin-left: 200px;
}

.app-footer {
  height: var(--footer-height);
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(20px);
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  height: 100%;
  font-size: 12px;
  color: #64748b;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 10px currentColor;
}

.status-dot.ok {
  background: #10b981;
  color: #10b981;
}

.status-dot.warning {
  background: #f59e0b;
  color: #f59e0b;
}

.status-dot.error {
  background: #ef4444;
  color: #ef4444;
}

.version {
  margin-left: 24px;
  padding-left: 24px;
  border-left: 1px solid rgba(148, 163, 184, 0.2);
  color: #475569;
}

.no-alerts {
  text-align: center;
  padding: 40px;
  color: #64748b;
}

.no-alerts p {
  margin-top: 16px;
}

.alert-level {
  font-size: 12px;
  color: #64748b;
  margin-top: 8px;
}

/* Dark Element Plus overrides */
:deep(.el-card) {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 16px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
  color: #e2e8f0;
}

:deep(.el-card__header) {
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  padding: 16px 20px;
}

:deep(.el-card__body) {
  padding: 20px;
}

:deep(.el-table) {
  background: transparent;
  color: #e2e8f0;
  border: none;
}

:deep(.el-table tr) {
  background: transparent;
}

:deep(.el-table th.el-table__cell) {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
  border: none;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

:deep(.el-table td.el-table__cell) {
  border: none;
  color: #e2e8f0;
}

:deep(.el-table__row:hover > td.el-table__cell) {
  background: rgba(14, 165, 233, 0.1) !important;
}

:deep(.el-input__wrapper) {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  box-shadow: none;
}

:deep(.el-input__inner) {
  color: #e2e8f0;
}

:deep(.el-input__inner::placeholder) {
  color: #64748b;
}

:deep(.el-select__wrapper) {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  box-shadow: none;
}

:deep(.el-button--primary) {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  border: none;
  color: white;
  font-weight: 600;
  transition: all 0.3s ease;
}

:deep(.el-button--primary:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3);
}

:deep(.el-drawer) {
  background: rgba(30, 41, 59, 0.95);
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(148, 163, 184, 0.1);
}

:deep(.el-drawer__header) {
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  margin-bottom: 0;
}

:deep(.el-drawer__title) {
  color: #e2e8f0;
  font-weight: 600;
}

:deep(.el-drawer__body) {
  color: #e2e8f0;
}

:deep(.el-dialog) {
  background: rgba(30, 41, 59, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 16px;
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  padding: 20px 24px;
}

:deep(.el-dialog__title) {
  color: #e2e8f0;
  font-weight: 600;
}

:deep(.el-dialog__body) {
  padding: 24px;
}

:deep(.el-pagination) {
  --el-pagination-bg-color: rgba(30, 41, 59, 0.8);
  --el-pagination-text-color: #94a3b8;
  --el-pagination-button-bg-color: rgba(30, 41, 59, 0.8);
  --el-pagination-hover-color: #0ea5e9;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .header-content {
    padding: 0 16px;
  }
  
  .nav-menu {
    display: none;
  }
  
  .logo-text {
    display: none;
  }
  
  .app-main {
    padding: 16px;
  }
}

/* Dark Mode */
:root {
  --bg-primary: rgba(15, 23, 42, 0.65);
  --bg-secondary: rgba(30, 41, 59, 0.8);
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --border-color: #334155;
}

.dark {
  --bg-primary: rgba(15, 23, 42, 0.75);
  --bg-secondary: rgba(30, 41, 59, 0.9);
  --text-primary: #f1f5f9;
  --text-secondary: #cbd5e1;
  --border-color: #475569;
}

html:not(.dark) {
  --bg-primary: rgba(248, 250, 252, 0.75);
  --bg-secondary: rgba(255, 255, 255, 0.9);
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --border-color: #e2e8f0;
}

.app-container {
  background: var(--bg-primary);
}

.dark body {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: var(--text-primary);
}

html:not(.dark) body {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  color: var(--text-primary);
}
</style>