<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElCard, ElButton, ElProgress, ElTag, ElEmpty, ElTooltip, ElTable, ElTableColumn } from 'element-plus'
import { TrendCharts, DataAnalysis, Clock, Wallet, Warning, Check, Close, Connection, History, Search } from '@element-plus/icons-vue'
import type { AnalysisResponse, WebSocketMessage } from '@/types'

const router = useRouter()

// 状态
const stockCode = ref('000001.SZ')
const isAnalyzing = ref(false)
const currentTask = ref<AnalysisResponse | null>(null)
const analysisHistory = ref<AnalysisResponse[]>([])
const ws = ref<WebSocket | null>(null)
const wsConnected = ref(false)
const searchQuery = ref('')

// 配置
const config = ref({
  llmProvider: 'dashscope',
  model: 'qwen-plus',
  riskLevel: 'moderate',
  maxPosition: 10,
})

const providers = [
  { label: '阿里百炼 (DashScope)', value: 'dashscope', models: ['qwen-plus', 'qwen-turbo', 'qwen-max'] },
  { label: 'DeepSeek', value: 'deepseek', models: ['deepseek-chat', 'deepseek-coder'] },
  { label: 'OpenAI', value: 'openai', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] },
  { label: 'Google Gemini', value: 'google', models: ['gemini-1.5-flash', 'gemini-1.5-pro'] },
]

const currentModels = computed(() => {
  const provider = providers.find(p => p.value === config.value.llmProvider)
  return provider?.models || []
})

// 进度计算
const progress = computed(() => {
  if (!currentTask.value) return 0
  return Math.round((currentTask.value.progress || 0) * 100)
})

// 格式化状态
const statusText = computed(() => {
  switch (currentTask.value?.status) {
    case 'pending': return '等待中'
    case 'running': return '分析中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    default: return '未开始'
  }
})

const statusType = computed(() => {
  switch (currentTask.value?.status) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'running': return 'primary'
    default: return 'info'
  }
})

// 动作颜色
const actionColor = computed(() => {
  const action = currentTask.value?.trading_plan?.action
  switch (action) {
    case 'buy': return '#67C23A'
    case 'sell': return '#F56C6C'
    default: return '#909399'
  }
})

// 开始分析
const startAnalysis = async () => {
  if (!stockCode.value) {
    ElMessage.warning('请输入股票代码')
    return
  }

  isAnalyzing.value = true
  currentTask.value = {
    task_id: '',
    status: 'pending',
    company: stockCode.value,
    trade_date: new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString(),
    progress: 0,
  }

  try {
    // 创建任务
    const response = await fetch('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: stockCode.value,
        trade_date: new Date().toISOString().split('T')[0],
        use_cache: true,
        max_debate_rounds: 2,
      }),
    })

    const task = await response.json()
    currentTask.value = task

    // 建立 WebSocket 连接
    connectWebSocket(task.task_id)
  } catch (error) {
    console.error('启动分析失败:', error)
    ElMessage.error('启动分析失败')
    isAnalyzing.value = false
  }
}

// WebSocket 连接
const connectWebSocket = (taskId: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws.value = new WebSocket(`${protocol}//${window.location.host}/ws/${taskId}`)

  ws.value.onopen = () => {
    wsConnected.value = true
    console.log('WebSocket 已连接')
  }

  ws.value.onmessage = (event) => {
    const message: WebSocketMessage = JSON.parse(event.data)
    handleWebSocketMessage(message)
  }

  ws.value.onerror = (error) => {
    console.error('WebSocket 错误:', error)
  }

  ws.value.onclose = () => {
    wsConnected.value = false
    console.log('WebSocket 已关闭')
    isAnalyzing.value = false
  }
}

// 处理 WebSocket 消息
const handleWebSocketMessage = (message: WebSocketMessage) => {
  switch (message.type) {
    case 'status':
      if (currentTask.value) {
        currentTask.value.status = message.data?.status || 'running'
        currentTask.value.progress = message.data?.progress || 0
      }
      break

    case 'report':
      if (currentTask.value && message.data) {
        currentTask.value.analyst_reports = message.data.analyst_reports
      }
      break

    case 'completed':
      if (currentTask.value && message.data) {
        currentTask.value = { ...currentTask.value, ...message.data.response }
        analysisHistory.value.unshift(currentTask.value)
        ElMessage.success('分析完成!')
      }
      break

    case 'error':
      if (currentTask.value) {
        currentTask.value.status = 'failed'
        currentTask.value.errors = [message.error || '未知错误']
      }
      ElMessage.error(message.error || '分析失败')
      break
  }
}

// 断开连接
const disconnect = () => {
  if (ws.value) {
    ws.value.close()
    ws.value = null
  }
}

// 加载历史
const loadHistory = async () => {
  try {
    const url = searchQuery.value 
      ? `/api/v1/tasks?search=${encodeURIComponent(searchQuery.value)}&page_size=10`
      : '/api/v1/tasks?page_size=10'
    const response = await fetch(url)
    const data = await response.json()
    analysisHistory.value = data.tasks || []
  } catch (error) {
    console.error('加载历史失败:', error)
  }
}

// 搜索历史
const searchHistory = () => {
  loadHistory()
}

// 加载指定任务
const loadTask = async (taskId: string) => {
  try {
    const response = await fetch(`/api/v1/tasks/${taskId}`)
    const task = await response.json()
    currentTask.value = task
  } catch (error) {
    console.error('加载任务失败:', error)
  }
}

// 组件卸载时断开连接
onUnmounted(() => {
  disconnect()
})

onMounted(() => {
  loadHistory()
})
</script>

<template>
  <div class="container">
    <!-- 头部 -->
    <header class="header">
      <div class="logo">
        <TrendCharts class="logo-icon" />
        <h1>TradingAgents-CN</h1>
      </div>
      <div class="header-actions">
        <el-tag :type="wsConnected ? 'success' : 'info'" size="small" class="ws-status">
          <Connection />
          {{ wsConnected ? '实时连接' : '未连接' }}
        </el-tag>
        <el-button @click="$router.push('/code-review')">
          代码审查
        </el-button>
        <el-button @click="$router.push('/settings')">
          设置
        </el-button>
        <el-button type="primary" @click="$router.push('/history')">
          历史记录
        </el-button>
      </div>
    </header>

    <!-- 主内容 -->
    <main class="main">
      <!-- 左侧: 输入面板 -->
      <aside class="sidebar">
        <el-card class="input-card">
          <template #header>
            <div class="card-header">
              <span>分析配置</span>
            </div>
          </template>

          <div class="form-group">
            <label>股票代码</label>
            <el-input
              v-model="stockCode"
              placeholder="如: 000001.SZ"
              :disabled="isAnalyzing"
            />
          </div>

          <div class="form-group">
            <label>LLM 提供商</label>
            <el-select v-model="config.llmProvider" :disabled="isAnalyzing" @change="config.model = currentModels[0]">
              <el-option v-for="p in providers" :key="p.value" :label="p.label" :value="p.value" />
            </el-select>
          </div>

          <div class="form-group">
            <label>模型</label>
            <el-select v-model="config.model" :disabled="isAnalyzing">
              <el-option v-for="m in currentModels" :key="m" :label="m" :value="m" />
            </el-select>
          </div>

          <div class="form-group">
            <label>风险偏好</label>
            <el-select v-model="config.riskLevel">
              <el-option label="保守" value="conservative" />
              <el-option label="均衡" value="moderate" />
              <el-option label="激进" value="aggressive" />
            </el-select>
          </div>

          <div class="form-group">
            <label>最大仓位</label>
            <el-slider v-model="config.maxPosition" :min="5" :max="30" :step="5" show-input />
          </div>

          <el-button
            type="primary"
            size="large"
            :loading="isAnalyzing"
            class="analyze-btn"
            @click="startAnalysis"
          >
            {{ isAnalyzing ? '分析中...' : '开始分析' }}
          </el-button>
        </el-card>

        <!-- 实时进度 -->
        <el-card v-if="isAnalyzing || currentTask?.status === 'completed'" class="progress-card">
          <template #header>
            <div class="card-header">
              <span>分析进度</span>
              <el-tag :type="statusType">{{ statusText }}</el-tag>
            </div>
          </template>
          <el-progress :percentage="progress" :color="statusType === 'success' ? '#67C23A' : '#409EFF'" />
          
          <!-- 历史搜索 -->
          <div class="history-search">
            <el-input 
              v-model="searchQuery" 
              placeholder="搜索股票代码..." 
              :prefix-icon="Search"
              clearable
              @keyup.enter="searchHistory"
            />
            <el-button :icon="History" @click="searchHistory">搜索</el-button>
          </div>
          
          <!-- 快速历史 -->
          <div class="quick-history" v-if="analysisHistory.length">
            <div class="quick-history-title">最近分析</div>
            <div 
              v-for="item in analysisHistory.slice(0, 5)" 
              :key="item.task_id"
              class="quick-history-item"
              @click="loadTask(item.task_id)"
            >
              <span class="ticker">{{ item.company }}</span>
              <el-tag size="small" :type="item.status === 'completed' ? 'success' : 'info'">
                {{ item.status === 'completed' ? '完成' : item.status }}
              </el-tag>
            </div>
          </div>
          
          <div class="phase-list">
            <div :class="['phase', { active: progress >= 0 }]">
              <Check v-if="progress >= 25" class="phase-icon" />
              <Clock v-else class="phase-icon" />
              <span>数据收集</span>
            </div>
            <div :class="['phase', { active: progress >= 25 }]">
              <Check v-if="progress >= 50" class="phase-icon" />
              <Clock v-else class="phase-icon" />
              <span>专家分析</span>
            </div>
            <div :class="['phase', { active: progress >= 50 }]">
              <Check v-if="progress >= 75" class="phase-icon" />
              <Clock v-else class="phase-icon" />
              <span>辩论决策</span>
            </div>
            <div :class="['phase', { active: progress >= 75 }]">
              <Check v-if="progress >= 100" class="phase-icon" />
              <Clock v-else class="phase-icon" />
              <span>风险评估</span>
            </div>
            <div :class="['phase', { active: progress >= 100 }]">
              <Check v-if="progress >= 100" class="phase-icon" />
              <Clock v-else class="phase-icon" />
              <span>交易计划</span>
            </div>
          </div>
        </el-card>
      </aside>

      <!-- 右侧: 结果面板 -->
      <section class="content">
        <!-- 分析师报告 -->
        <el-card v-if="currentTask?.analyst_reports" class="report-card">
          <template #header>
            <div class="card-header">
              <span><DataAnalysis /> 分析师报告</span>
            </div>
          </template>
          <div class="reports-grid">
            <div v-for="(report, key) in currentTask.analyst_reports" :key="key" class="report-item">
              <div class="report-title">{{ report.expert_name }}</div>
              <div class="report-content">{{ report.report }}</div>
              <div class="report-confidence">
                <span>置信度:</span>
                <el-progress :percentage="Math.round(report.confidence * 100)" :stroke-width="6" />
              </div>
            </div>
          </div>
        </el-card>

        <!-- 交易决策 -->
        <el-card v-if="currentTask?.trading_plan" class="decision-card">
          <template #header>
            <div class="card-header">
              <span><Wallet /> 最终交易决策</span>
            </div>
          </template>
          <div class="decision-content">
            <div class="action-badge" :style="{ backgroundColor: actionColor }">
              {{ currentTask.trading_plan.action?.toUpperCase() }}
            </div>
            <div class="decision-details">
              <div class="detail-row">
                <span class="label">建议仓位:</span>
                <span class="value">{{ (currentTask.trading_plan.position_size * 100).toFixed(0) }}%</span>
              </div>
              <div class="detail-row">
                <span class="label">入场区间:</span>
                <span class="value">
                  {{ currentTask.trading_plan.entry_price_range?.low }} - 
                  {{ currentTask.trading_plan.entry_price_range?.high }}
                </span>
              </div>
              <div class="detail-row">
                <span class="label">止损价:</span>
                <span class="value danger">{{ currentTask.trading_plan.stop_loss }}</span>
              </div>
              <div class="detail-row">
                <span class="label">止盈价:</span>
                <span class="value success">{{ currentTask.trading_plan.take_profit }}</span>
              </div>
              <div class="detail-row">
                <span class="label">持仓周期:</span>
                <span class="value">{{ currentTask.trading_plan.holding_period }}</span>
              </div>
              <div class="detail-row">
                <span class="label">风险等级:</span>
                <el-tag :type="currentTask.trading_plan.risk_level === 'low' ? 'success' : currentTask.trading_plan.risk_level === 'high' ? 'danger' : 'warning'">
                  {{ currentTask.trading_plan.risk_level }}
                </el-tag>
              </div>
            </div>
          </div>
          <div v-if="currentTask.trading_plan.risk_warnings?.length" class="risk-warnings">
            <Warning class="warning-icon" />
            <div class="warnings-list">
              <div v-for="(warning, idx) in currentTask.trading_plan.risk_warnings" :key="idx" class="warning-item">
                {{ warning }}
              </div>
            </div>
          </div>
        </el-card>

        <!-- 空状态 -->
        <el-empty v-if="!currentTask" description="输入股票代码开始分析">
          <template #image>
            <TrendCharts style="font-size: 64px; color: #409EFF;" />
          </template>
        </el-empty>
      </section>
    </main>
  </div>
</template>

<style scoped>
.container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-icon {
  font-size: 2rem;
  color: #667eea;
}

.logo h1 {
  margin: 0;
  font-size: 1.5rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.main {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: 1.5rem;
  padding: 1.5rem 2rem;
  max-width: 1600px;
  margin: 0 auto;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #606266;
}

.analyze-btn {
  width: 100%;
  margin-top: 1rem;
}

.phase-list {
  margin-top: 1rem;
}

.ws-status {
  display: flex;
  align-items: center;
  gap: 4px;
}

.history-search {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ebeef5;
}

.history-search .el-input {
  flex: 1;
}

.quick-history {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ebeef5;
}

.quick-history-title {
  font-size: 0.75rem;
  color: #909399;
  margin-bottom: 0.5rem;
}

.quick-history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.quick-history-item:hover {
  background: #f5f7fa;
}

.quick-history-item .ticker {
  font-weight: 600;
  color: #303133;
}

.phase {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  color: #909399;
  transition: all 0.3s;
}

.phase.active {
  color: #67C23A;
}

.phase-icon {
  width: 16px;
  height: 16px;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reports-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.report-item {
  padding: 1rem;
  background: #f5f7fa;
  border-radius: 8px;
}

.report-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #303133;
}

.report-content {
  font-size: 0.875rem;
  color: #606266;
  line-height: 1.6;
  margin-bottom: 0.5rem;
}

.report-confidence {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #909399;
}

.decision-content {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
}

.action-badge {
  padding: 1rem 2rem;
  border-radius: 8px;
  color: white;
  font-size: 1.5rem;
  font-weight: bold;
}

.decision-details {
  flex: 1;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #ebeef5;
}

.detail-row .label {
  color: #909399;
}

.detail-row .value {
  font-weight: 600;
  color: #303133;
}

.detail-row .value.danger {
  color: #f56c6c;
}

.detail-row .value.success {
  color: #67c23a;
}

.risk-warnings {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
  padding: 1rem;
  background: #fef0f0;
  border-radius: 8px;
}

.warning-icon {
  color: #f56c6c;
}

.warnings-list {
  flex: 1;
}

.warning-item {
  color: #f56c6c;
  font-size: 0.875rem;
  line-height: 1.6;
}
</style>
