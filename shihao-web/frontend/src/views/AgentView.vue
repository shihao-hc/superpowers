<template>
  <div class="agent-view">
    <div class="agent-header">
      <h1>🤖 AI Agent 控制面板</h1>
      <div class="agent-status-badge" :class="agentStore.status">
        <span class="status-dot"></span>
        {{ agentStore.status === 'active' ? '运行中' : '未激活' }}
      </div>
    </div>

    <!-- 核心状态卡片 -->
    <div class="status-cards">
      <div class="status-card">
        <div class="card-icon">🧠</div>
        <div class="card-content">
          <div class="card-title">核心记忆</div>
          <div class="card-value">{{ agentStore.memoryBlocks.length }} 个记忆块</div>
        </div>
      </div>
      
      <div class="status-card">
        <div class="card-icon">🔗</div>
        <div class="card-content">
          <div class="card-title">LLM</div>
          <div class="card-value">{{ agentStore.llmProvider }}/{{ agentStore.llmModel }}</div>
        </div>
      </div>
      
      <div class="status-card">
        <div class="card-icon">📊</div>
        <div class="card-content">
          <div class="card-title">分析任务</div>
          <div class="card-value">{{ agentStore.analysisTasks.length }} 个任务</div>
        </div>
      </div>
      
      <div class="status-card">
        <div class="card-icon">🔔</div>
        <div class="card-content">
          <div class="card-title">通知</div>
          <div class="card-value">{{ agentStore.notifications.length }} 条</div>
        </div>
      </div>
      
      <div class="status-card">
        <div class="card-icon">🔧</div>
        <div class="card-content">
          <div class="card-title">工具总数</div>
          <div class="card-value">39 个</div>
        </div>
      </div>
      
      <div class="status-card highlight">
        <div class="card-icon">👑</div>
        <div class="card-content">
          <div class="card-title">总负责AI</div>
          <div class="card-value">已激活</div>
        </div>
      </div>
    </div>

    <!-- Agent团队展示 - 新架构 -->
    <div class="agent-team-section">
      <div class="section-header">
        <h2>🎯 AI交易Agent团队 - 优化架构</h2>
        <el-tag type="success">1个总负责AI | 7个专业Agent | 39+金融工具</el-tag>
      </div>
      
      <!-- 总负责AI -->
      <div class="chief-ai-section">
        <div class="chief-ai-card">
          <div class="chief-icon">👑</div>
          <div class="chief-info">
            <div class="chief-title">AI投资主管 (Chief AI Officer)</div>
            <div class="chief-desc">总负责AI - 与用户直接对接，任务分解与调度，结果整合呈现</div>
            <div class="chief-capabilities">
              <el-tag type="success">用户对接</el-tag>
              <el-tag type="success">任务调度</el-tag>
              <el-tag type="success">结果整合</el-tag>
              <el-tag type="success">智能汇报</el-tag>
            </div>
          </div>
          <el-button type="primary" @click="startChatWithChief">
            开始对话
          </el-button>
        </div>
      </div>
      
      <!-- 专业Agent团队 -->
      <div class="specialist-section">
        <h3>专业Agent团队</h3>
        <div class="agent-grid">
          <div class="agent-card" v-for="agent in specialistAgents" :key="agent.id">
            <div class="agent-icon">{{ agent.icon }}</div>
            <div class="agent-info">
              <div class="agent-name">{{ agent.name }}</div>
              <div class="agent-role">{{ agent.role }}</div>
              <div class="agent-tools">
                <el-tag v-for="tool in agent.tools.slice(0, 3)" :key="tool" size="small" type="info">
                  {{ tool }}
                </el-tag>
                <el-tag v-if="agent.tools.length > 3" size="small" type="warning">
                  +{{ agent.tools.length - 3 }} 更多
                </el-tag>
              </div>
            </div>
            <el-button size="small" type="primary" plain @click="useAgent(agent)">
              调用
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 系统能力展示 -->
    <div class="system-capabilities-section">
      <div class="section-header">
        <h2>🚀 系统新能力</h2>
        <el-tag type="success">v1.2.0 全部升级完成</el-tag>
      </div>
      
      <div class="capabilities-grid">
        <div 
          class="capability-card" 
          :class="{ active: cap.status === 'active' }"
          v-for="cap in systemCapabilities" 
          :key="cap.name"
        >
          <div class="capability-icon">{{ cap.icon }}</div>
          <div class="capability-info">
            <div class="capability-name">{{ cap.name }}</div>
            <div class="capability-desc">{{ cap.description }}</div>
          </div>
          <div class="capability-status"></div>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧: 核心记忆 -->
      <div class="memory-panel">
        <div class="panel-header">
          <h2>核心记忆 (Core Memory)</h2>
          <el-button type="primary" size="small" @click="refreshMemory">
            刷新
          </el-button>
        </div>
        
        <el-tabs v-model="activeTab">
          <el-tab-pane label="人格" name="persona">
            <div class="memory-content">
              <p>{{ agentStore.coreMemory.persona || '加载中...' }}</p>
              <el-button size="small" type="warning" @click="editMemory('persona')">
                编辑
              </el-button>
            </div>
          </el-tab-pane>
          
          <el-tab-pane label="风险配置" name="risk_profile">
            <div class="memory-content">
              <p>{{ agentStore.coreMemory.risk_profile || '加载中...' }}</p>
              <el-button size="small" type="warning" @click="editMemory('risk_profile')">
                编辑
              </el-button>
            </div>
          </el-tab-pane>
          
          <el-tab-pane label="用户偏好" name="user_preferences">
            <div class="memory-content">
              <p>{{ agentStore.coreMemory.user_preferences || '加载中...' }}</p>
              <el-button size="small" type="warning" @click="editMemory('user_preferences')">
                编辑
              </el-button>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 右侧: 操作面板 -->
      <div class="action-panel">
        <!-- 记忆搜索 -->
        <div class="action-section">
          <h3>🔍 记忆搜索</h3>
          <el-input
            v-model="searchQuery"
            placeholder="输入关键词搜索记忆..."
            @keyup.enter="doSearch"
          >
            <template #append>
              <el-button @click="doSearch">搜索</el-button>
            </template>
          </el-input>
          
          <div v-if="agentStore.searchResults.length > 0" class="search-results">
            <div v-for="(result, index) in agentStore.searchResults" :key="index" class="result-item">
              <p>{{ result.text }}</p>
              <span class="score">相关度: {{ (result.score || 0).toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <!-- 触发分析 -->
        <div class="action-section">
          <h3>📈 触发AI分析</h3>
          <el-input
            v-model="analyzeTickers"
            placeholder="输入股票代码，如: 600519,300750"
          />
          <el-button 
            type="success" 
            @click="triggerAnalyze"
            :loading="agentStore.analysisLoading"
          >
            开始分析
          </el-button>
          
          <div v-if="agentStore.analysisTasks.length > 0" class="task-list">
            <div v-for="task in agentStore.analysisTasks" :key="task.id" class="task-item">
              <span>{{ task.tickers?.join(', ') }}</span>
              <el-tag :type="task.status === 'completed' ? 'success' : task.status === 'error' ? 'danger' : 'warning'">
                {{ task.status }}
              </el-tag>
            </div>
            <div v-if="latestResult" class="analysis-result">
              <h4>Analysis Result</h4>
              <pre>{{ latestResult }}</pre>
            </div>
          </div>
        </div>

        <!-- 发送通知 -->
        <div class="action-section">
          <h3>🔔 发送通知</h3>
          <el-input v-model="notifyTitle" placeholder="标题" />
          <el-input v-model="notifyContent" type="textarea" placeholder="内容" rows="2" />
          <el-select v-model="notifyPriority" placeholder="优先级">
            <el-option label="低" value="low" />
            <el-option label="普通" value="normal" />
            <el-option label="高" value="high" />
            <el-option label="紧急" value="critical" />
          </el-select>
          <el-button type="primary" @click="sendNotify">发送</el-button>
        </div>
      </div>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑记忆" width="500px">
      <el-input
        v-model="editValue"
        type="textarea"
        :rows="6"
      />
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMemory">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '../stores/agent'
import { ElMessage } from 'element-plus'

const agentStore = useAgentStore()

const latestResult = computed(() => {
  const tasks = agentStore.analysisTasks
  if (tasks.length === 0) return null
  const latest = tasks[tasks.length - 1]
  return latest.result || latest.message || null
})

// 总负责AI
const chiefAI = ref({
  id: 'portfolio_manager',
  name: 'AI投资主管',
  fullName: 'AI投资主管 (Chief AI Officer)',
  role: '总负责AI - 用户对接与任务调度',
  icon: '👑',
  capabilities: ['用户对接', '任务分解', 'Agent调度', '结果整合', '智能汇报']
})

// 专业Agent团队
const specialistAgents = ref([
  { id: 'market_analyst', name: '首席市场分析师', role: '多市场分析', icon: '📊', source: 'TradingAgents-CN', tools: ['A股数据', '港股数据', '美股数据', '技术指标', '板块分析', '政策监控'], toolCount: 6 },
  { id: 'research_analyst', name: '深度研究分析师', role: '价值投资', icon: '🔍', source: 'china-stock-analysis', tools: ['财务报表', '估值计算', '选股筛选', '基本面分析', '知识搜索'], toolCount: 5 },
  { id: 'risk_manager', name: '风险管理总监', role: '风险预警', icon: '🛡️', source: 'stock-monitor-skill', tools: ['风险指标', '组合分析', '股票监控', '实时报价', '技术指标'], toolCount: 5 },
  { id: 'trade_executor', name: '交易执行专家', role: '订单执行', icon: '⚡', source: 'Lean/Tauric', tools: ['交易API', '实时报价', '风险校验', '执行策略'], toolCount: 4 },
  { id: 'news_analyst', name: '财经新闻分析师', role: '舆情分析', icon: '📰', source: 'daily_stock_analysis', tools: ['新闻舆情', '政策监控', '实时报价', '情感反馈'], toolCount: 4 },
  { id: 'backtest_analyst', name: '量化回测专家', role: '策略回测', icon: '📈', source: 'Lean', tools: ['回测引擎', 'A股数据', '风险指标', '绩效分析'], toolCount: 4 },
  { id: 'data_analyst', name: '金融数据分析师', role: '数据获取', icon: '💾', source: 'akshare', tools: ['A股/港股/美股', '财务数据', '实时行情', '指数数据', '概念热度', '资金流向'], toolCount: 11 },
])

// 系统能力
const systemCapabilities = ref([
  { name: '通信日志', icon: '📝', description: 'Agent间实时通信记录', status: 'active' },
  { name: '任务追踪', icon: '📊', description: '任务进度实时追踪', status: 'active' },
  { name: '工具缓存', icon: '💾', description: '智能工具调用缓存', status: 'active' },
  { name: '向量记忆', icon: '🧠', description: '语义记忆增强', status: 'active' },
  { name: '对话管理', icon: '💬', description: '多轮对话上下文管理', status: 'active' },
  { name: '反馈学习', icon: '📚', description: '用户反馈学习机制', status: 'active' },
  { name: '自进化', icon: '🧬', description: 'Agent自进化能力', status: 'active' },
  { name: '模板系统', icon: '📋', description: '自定义Agent模板', status: 'active' },
  { name: '市场生态', icon: '🏪', description: 'Agent市场生态系统', status: 'active' },
])

function startChatWithChief() {
  // Navigate to chat or emit event
  ElMessage.success('正在连接AI投资主管...')
}

function useAgent(agent) {
  analyzeTickers.value = ''
  ElMessage.success(`已选择 ${agent.name}，请在上方输入股票代码开始分析`)
}

const activeTab = ref('persona')
const searchQuery = ref('')
const analyzeTickers = ref('')
const notifyTitle = ref('')
const notifyContent = ref('')
const notifyPriority = ref('normal')
const editDialogVisible = ref(false)
const editBlock = ref('')
const editValue = ref('')

onMounted(async () => {
  try {
    await agentStore.initialize()
  } catch (error) {
    ElMessage.error('Agent初始化失败: ' + error.message)
  }
})

onUnmounted(() => {
  agentStore.cleanup()
})

async function refreshMemory() {
  try {
    await agentStore.fetchCoreMemory()
    ElMessage.success('记忆已刷新')
  } catch (error) {
    ElMessage.error('刷新失败')
  }
}

function editMemory(block) {
  editBlock.value = block
  editValue.value = agentStore.coreMemory[block] || ''
  editDialogVisible.value = true
}

async function saveMemory() {
  try {
    await agentStore.updateCoreMemory(editBlock.value, editValue.value)
    ElMessage.success('保存成功')
    editDialogVisible.value = false
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

async function doSearch() {
  if (!searchQuery.value) return
  try {
    await agentStore.searchMemory(searchQuery.value)
  } catch (error) {
    ElMessage.error('搜索失败')
  }
}

async function triggerAnalyze() {
  if (!analyzeTickers.value) return
  const tickers = analyzeTickers.value.split(',').map(t => t.trim()).filter(t => t)
  try {
    await agentStore.triggerAnalysis(tickers)
    ElMessage.success('分析任务已启动')
    analyzeTickers.value = ''
  } catch (error) {
    ElMessage.error('启动失败')
  }
}

async function sendNotify() {
  if (!notifyTitle.value || !notifyContent.value) return
  try {
    await agentStore.sendNotification(notifyTitle.value, notifyContent.value, notifyPriority.value)
    ElMessage.success('通知已发送')
    notifyTitle.value = ''
    notifyContent.value = ''
  } catch (error) {
    ElMessage.error('发送失败')
  }
}
</script>

<style scoped>
.agent-view {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

/* 总负责AI区域 */
.chief-ai-section {
  margin-bottom: 24px;
}

.chief-ai-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 24px;
  border-radius: 16px;
  color: white;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
}

.chief-icon {
  font-size: 48px;
}

.chief-info {
  flex: 1;
}

.chief-title {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 8px;
}

.chief-desc {
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 12px;
}

.chief-capabilities {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chief-capabilities .el-tag {
  background: rgba(255,255,255,0.2);
  border: none;
  color: white;
}

/* 专业Agent区域 */
.specialist-section {
  margin-top: 20px;
}

.specialist-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #374151;
}

/* 系统能力区域 */
.system-capabilities-section {
  margin-top: 24px;
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.capabilities-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.capability-card {
  background: #f9fafb;
  padding: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #e5e7eb;
}

.capability-card.active {
  border-color: #10b981;
  background: #ecfdf5;
}

.capability-icon {
  font-size: 24px;
}

.capability-info {
  flex: 1;
}

.capability-name {
  font-weight: bold;
  font-size: 14px;
}

.capability-desc {
  font-size: 12px;
  color: #6b7280;
}

.capability-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
}

.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.agent-header h1 {
  margin: 0;
  font-size: 24px;
}

.agent-status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: bold;
}

.agent-status-badge.active {
  background: #10b981;
  color: white;
}

.agent-status-badge.inactive {
  background: #6b7280;
  color: white;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: white;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.status-card {
  background: white;
  padding: 16px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.card-icon {
  font-size: 32px;
}

.card-title {
  font-size: 12px;
  color: #6b7280;
}

.card-value {
  font-size: 14px;
  font-weight: bold;
}

.main-content {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
}

.memory-panel {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
}

.memory-content {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  margin-top: 12px;
}

.memory-content p {
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
}

.action-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.action-section {
  background: white;
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.action-section h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
}

.action-section .el-input,
.action-section .el-select {
  margin-bottom: 12px;
  width: 100%;
}

.action-section .el-button {
  width: 100%;
  margin-bottom: 12px;
}

.search-results,
.task-list {
  margin-top: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.result-item,
.task-item {
  padding: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.result-item p,
.task-item span {
  margin: 0 0 4px 0;
  font-size: 14px;
}

.score {
  font-size: 12px;
  color: #6b7280;
}

.task-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.analysis-result {
  margin-top: 12px;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 8px;
  border-left: 4px solid #3b82f6;
}

.analysis-result h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #60a5fa;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}

.analysis-result pre {
  margin: 0;
  font-size: 13px;
  font-family: 'Microsoft YaHei', 'PingFang SC', 'Segoe UI', sans-serif;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 8px;
  line-height: 1.6;
}

.agent-team-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h2 {
  margin: 0;
  font-size: 18px;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.agent-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 16px;
  border-radius: 12px;
  color: white;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.agent-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.agent-icon {
  font-size: 28px;
}

.agent-info {
  flex: 1;
}

.agent-name {
  font-weight: bold;
  font-size: 14px;
}

.agent-role {
  font-size: 12px;
  opacity: 0.9;
  margin-bottom: 8px;
}

.agent-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.agent-tools .el-tag {
  font-size: 10px;
}

.agent-card .el-button {
  width: 100%;
}
</style>