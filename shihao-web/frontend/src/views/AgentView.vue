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
    </div>

    <!-- Agent团队展示 -->
    <div class="agent-team-section">
      <div class="section-header">
        <h2>🎯 AI交易Agent团队</h2>
        <el-tag type="success">8个专业Agent | 20+金融工具</el-tag>
      </div>
      
      <div class="agent-grid">
        <div class="agent-card" v-for="agent in tradingAgents" :key="agent.id">
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
              <el-tag :type="task.status === 'completed' ? 'success' : 'warning'">
                {{ task.status }}
              </el-tag>
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
import { ref, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '../stores/agent'
import { ElMessage } from 'element-plus'

const agentStore = useAgentStore()

const tradingAgents = ref([
  { id: 'portfolio_manager', name: '投资组合总经理', role: '团队协调者', icon: '👔', source: 'TradingAgents-CN', tools: ['任务分配', '决策协调', '风险控制'] },
  { id: 'market_analyst', name: '首席市场分析师', role: '多市场分析', icon: '📊', source: 'TradingAgents-CN', tools: ['A股数据', '港股数据', '美股数据', '板块分析', '政策监控'] },
  { id: 'research_analyst', name: '深度研究分析师', role: '价值投资', icon: '🔍', source: 'china-stock-analysis', tools: ['财务报表', '估值计算', '选股筛选', '基本面分析'] },
  { id: 'risk_manager', name: '风险管理总监', role: '风险预警', icon: '🛡️', source: 'stock-monitor-skill', tools: ['风险指标', '组合分析', '股票监控', '实时报价'] },
  { id: 'trade_executor', name: '交易执行专家', role: '订单执行', icon: '⚡', source: 'Lean/Tauric', tools: ['交易API', '实时报价', '风险校验'] },
  { id: 'news_analyst', name: '财经新闻分析师', role: '舆情分析', icon: '📰', source: 'daily_stock_analysis', tools: ['新闻舆情', '政策监控', '实时报价'] },
  { id: 'backtest_analyst', name: '量化回测专家', role: '策略回测', icon: '📈', source: 'Lean', tools: ['回测引擎', 'A股数据', '风险指标'] },
  { id: 'data_analyst', name: '金融数据分析师', role: '数据获取', icon: '💾', source: 'akshare', tools: ['A股/港股/美股', '财务数据', '实时行情', '指数数据'] },
])

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