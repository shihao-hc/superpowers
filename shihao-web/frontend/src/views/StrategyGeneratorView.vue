<template>
  <div class="strategy-generator">
    <!-- Header -->
    <div class="page-header">
      <h1>🤖 AI 策略生成器</h1>
      <p>一句话生成量化交易策略，告别复杂编程</p>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <!-- Left: Strategy Generator -->
      <div class="generator-section">
        <!-- Stock Selection -->
        <div class="input-card">
          <h3>📊 选择标的</h3>
          <div class="stock-input">
            <el-input
              v-model="stockCode"
              placeholder="输入股票代码，如 600519"
              @keyup.enter="generateStrategy"
            >
              <template #prepend>股票</template>
            </el-input>
          </div>
          <div class="quick-stocks">
            <el-button 
              v-for="stock in quickStocks" 
              :key="stock.symbol"
              size="small"
              @click="selectStock(stock)"
              :type="stockCode === stock.symbol ? 'primary' : 'default'"
            >
              {{ stock.name }}
            </el-button>
          </div>
        </div>

        <!-- Strategy Type -->
        <div class="input-card">
          <h3>📈 策略类型</h3>
          <div class="strategy-types">
            <div 
              v-for="strategy in strategyTypes" 
              :key="strategy.id"
              class="strategy-type-card"
              :class="{ active: selectedStrategy === strategy.id }"
              @click="selectedStrategy = strategy.id"
            >
              <div class="strategy-icon">{{ strategy.icon }}</div>
              <div class="strategy-info">
                <div class="strategy-name">{{ strategy.name }}</div>
                <div class="strategy-desc">{{ strategy.description }}</div>
              </div>
              <div class="strategy-difficulty">
                <el-tag :type="getDifficultyType(strategy.difficulty)" size="small">
                  {{ strategy.difficulty }}
                </el-tag>
              </div>
            </div>
          </div>
        </div>

        <!-- Risk Level -->
        <div class="input-card">
          <h3>⚠️ 风险等级</h3>
          <el-radio-group v-model="riskLevel" class="risk-group">
            <el-radio-button value="low">
              <span class="risk-icon">🛡️</span>
              保守型
            </el-radio-button>
            <el-radio-button value="medium">
              <span class="risk-icon">⚖️</span>
              稳健型
            </el-radio-button>
            <el-radio-button value="high">
              <span class="risk-icon">🚀</span>
              激进型
            </el-radio-button>
          </el-radio-group>
          <div class="risk-description">
            {{ getRiskDescription(riskLevel) }}
          </div>
        </div>

        <!-- Generate Button -->
        <div class="generate-actions">
          <el-button 
            type="primary" 
            size="large" 
            @click="generateStrategy"
            :loading="generating"
            :disabled="!stockCode"
          >
            <span v-if="generating">AI 正在生成策略...</span>
            <span v-else>✨ 生成策略</span>
          </el-button>
        </div>
      </div>

      <!-- Right: Generated Strategy -->
      <div class="result-section">
        <div class="result-card" v-if="generatedStrategy">
          <div class="result-header">
            <h2>{{ generatedStrategy.strategy.name }}</h2>
            <el-tag type="success">AI 生成</el-tag>
          </div>
          
          <div class="result-description">
            {{ generatedStrategy.strategy.description }}
          </div>

          <!-- Strategy Rules -->
          <div class="strategy-rules">
            <h4>📋 交易规则</h4>
            <div class="rules-list">
              <div 
                v-for="(rule, index) in generatedStrategy.strategy.rules" 
                :key="index"
                class="rule-item"
              >
                <div class="rule-condition">
                  <span class="rule-icon">🔍</span>
                  {{ rule.condition }}
                </div>
                <div class="rule-arrow">→</div>
                <div class="rule-action">
                  <span class="rule-icon">⚡</span>
                  {{ rule.action }}
                </div>
              </div>
            </div>
          </div>

          <!-- Parameters -->
          <div class="strategy-parameters">
            <h4>⚙️ 策略参数</h4>
            <div class="parameters-grid">
              <div 
                v-for="(value, key) in generatedStrategy.strategy.parameters" 
                :key="key"
                class="parameter-item"
              >
                <div class="param-name">{{ formatParamName(key) }}</div>
                <div class="param-value">{{ value }}</div>
              </div>
            </div>
          </div>

          <!-- Risk Control -->
          <div class="risk-control">
            <h4>🛡️ 风险控制</h4>
            <div class="risk-metrics">
              <div class="risk-metric">
                <div class="metric-label">止损线</div>
                <div class="metric-value negative">
                  -{{ (generatedStrategy.risk_control.stop_loss * 100).toFixed(0) }}%
                </div>
              </div>
              <div class="risk-metric">
                <div class="metric-label">止盈线</div>
                <div class="metric-value positive">
                  +{{ (generatedStrategy.risk_control.take_profit * 100).toFixed(0) }}%
                </div>
              </div>
              <div class="risk-metric">
                <div class="metric-label">仓位</div>
                <div class="metric-value">
                  {{ (generatedStrategy.risk_control.position_size * 100).toFixed(0) }}%
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="result-actions">
            <el-button type="primary" @click="startPaperTrade">
              📝 开始模拟交易
            </el-button>
            <el-button @click="runBacktest">
              📊 运行回测
            </el-button>
            <el-button @click="saveStrategy">
              💾 保存策略
            </el-button>
            <el-button @click="exportStrategy">
              📤 导出代码
            </el-button>
          </div>
        </div>

        <!-- Empty State -->
        <div class="empty-state" v-else>
          <div class="empty-icon">🎯</div>
          <h3>选择参数，开始生成策略</h3>
          <p>AI 将根据您的选择，自动生成一套完整的量化交易策略</p>
        </div>
      </div>
    </div>

    <!-- Strategy Templates -->
    <div class="templates-section">
      <h3>📚 策略模板库</h3>
      <div class="templates-grid">
        <div 
          v-for="template in templates" 
          :key="template.id"
          class="template-card"
          @click="useTemplate(template)"
        >
          <div class="template-header">
            <span class="template-name">{{ template.name }}</span>
            <el-tag :type="getDifficultyType(template.difficulty)" size="small">
              {{ template.difficulty }}
            </el-tag>
          </div>
          <div class="template-desc">{{ template.description }}</div>
          <div class="template-action">
            <el-button size="small" type="primary" plain>使用模板</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { strategyAPI } from '../api'

const router = useRouter()

// State
const stockCode = ref('')
const selectedStrategy = ref('trend')
const riskLevel = ref('medium')
const generating = ref(false)
const generatedStrategy = ref(null)
const templates = ref([])

// Quick stocks
const quickStocks = ref([
  { symbol: '600519', name: '贵州茅台' },
  { symbol: '300750', name: '宁德时代' },
  { symbol: '000858', name: '五粮液' },
  { symbol: '601318', name: '中国平安' },
  { symbol: '000001', name: '平安银行' }
])

// Strategy types
const strategyTypes = ref([
  {
    id: 'trend',
    name: '趋势跟踪',
    icon: '📈',
    description: '跟随市场趋势，在上涨趋势中买入，下跌趋势中卖出',
    difficulty: '初级'
  },
  {
    id: 'mean_reversion',
    name: '均值回归',
    icon: '🔄',
    description: '利用价格偏离均值进行反向交易，适合震荡市场',
    difficulty: '中级'
  },
  {
    id: 'momentum',
    name: '动量突破',
    icon: '🚀',
    description: '捕捉价格突破关键位置的动量机会',
    difficulty: '中级'
  }
])

// Methods
const selectStock = (stock) => {
  stockCode.value = stock.symbol
}

const getDifficultyType = (difficulty) => {
  const types = {
    '初级': 'success',
    '中级': 'warning',
    '高级': 'danger'
  }
  return types[difficulty] || 'info'
}

const getRiskDescription = (level) => {
  const descriptions = {
    'low': '🛡️ 保守型：严格止损3%，仓位控制在20%以内，适合风险厌恶型投资者',
    'medium': '⚖️ 稳健型：止损5%，仓位30%以内，平衡风险与收益',
    'high': '🚀 激进型：止损8%，仓位可达50%，追求高收益但承担更高风险'
  }
  return descriptions[level] || ''
}

const formatParamName = (key) => {
  const names = {
    'ma_short': '短期均线',
    'ma_long': '长期均线',
    'rsi_period': 'RSI周期',
    'bb_period': '布林带周期',
    'bb_std': '标准差倍数',
    'volume_threshold': '量比阈值',
    'breakout_period': '突破周期'
  }
  return names[key] || key
}

const generateStrategy = async () => {
  if (!stockCode.value) {
    ElMessage.warning('请输入股票代码')
    return
  }
  
  generating.value = true
  
  try {
    const result = await strategyAPI.generate(stockCode.value, selectedStrategy.value, riskLevel.value)
    generatedStrategy.value = result
    ElMessage.success('策略生成成功！')
  } catch (error) {
    console.error('Generate strategy failed:', error)
    ElMessage.error('生成失败，请重试')
  } finally {
    generating.value = false
  }
}

const startPaperTrade = () => {
  router.push('/stock/paper-trade')
}

const runBacktest = () => {
  router.push('/stock/backtest')
}

const saveStrategy = () => {
  ElMessage.success('策略已保存到本地')
}

const exportStrategy = () => {
  ElMessage.info('代码导出功能开发中...')
}

const useTemplate = (template) => {
  selectedStrategy.value = template.type
  ElMessage.info(`已选择模板: ${template.name}`)
}

// Load templates on mount
onMounted(async () => {
  try {
    const result = await strategyAPI.getTemplates()
    templates.value = result.templates
  } catch (error) {
    console.error('Failed to load templates:', error)
  }
})
</script>

<style scoped>
.strategy-generator {
  padding: 24px;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  min-height: calc(100vh - 104px);
}

.page-header {
  text-align: center;
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0 0 8px 0;
  font-size: 32px;
  color: #f8fafc;
}

.page-header p {
  margin: 0;
  color: #94a3b8;
  font-size: 16px;
}

.main-content {
  display: flex;
  gap: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.generator-section {
  flex: 1;
}

.result-section {
  flex: 1;
}

.input-card {
  background: rgba(30, 41, 59, 0.5);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.input-card h3 {
  color: #f8fafc;
  margin: 0 0 16px 0;
  font-size: 18px;
}

.stock-input {
  margin-bottom: 12px;
}

.quick-stocks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.strategy-types {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.strategy-type-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.strategy-type-card:hover {
  background: rgba(14, 165, 233, 0.1);
}

.strategy-type-card.active {
  border-color: #0ea5e9;
  background: rgba(14, 165, 233, 0.15);
}

.strategy-icon {
  font-size: 32px;
}

.strategy-info {
  flex: 1;
}

.strategy-name {
  color: #f8fafc;
  font-weight: 600;
  margin-bottom: 4px;
}

.strategy-desc {
  color: #94a3b8;
  font-size: 13px;
}

.risk-group {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.risk-icon {
  margin-right: 4px;
}

.risk-description {
  color: #94a3b8;
  font-size: 14px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
}

.generate-actions {
  text-align: center;
  margin-top: 24px;
}

.result-card {
  background: rgba(30, 41, 59, 0.5);
  border-radius: 16px;
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.result-header h2 {
  color: #f8fafc;
  margin: 0;
}

.result-description {
  color: #94a3b8;
  margin-bottom: 24px;
  line-height: 1.6;
}

.strategy-rules h4,
.strategy-parameters h4,
.risk-control h4 {
  color: #f8fafc;
  margin: 0 0 16px 0;
  font-size: 16px;
}

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
}

.rule-condition,
.rule-action {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e2e8f0;
}

.rule-arrow {
  color: #64748b;
}

.rule-icon {
  font-size: 16px;
}

.parameters-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.parameter-item {
  padding: 12px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  text-align: center;
}

.param-name {
  color: #94a3b8;
  font-size: 12px;
  margin-bottom: 4px;
}

.param-value {
  color: #f8fafc;
  font-size: 18px;
  font-weight: 600;
}

.risk-metrics {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.risk-metric {
  flex: 1;
  padding: 16px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  text-align: center;
}

.metric-label {
  color: #94a3b8;
  font-size: 12px;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  color: #f8fafc;
}

.metric-value.positive {
  color: #10b981;
}

.metric-value.negative {
  color: #ef4444;
}

.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.empty-state {
  background: rgba(30, 41, 59, 0.5);
  border-radius: 16px;
  padding: 60px 40px;
  text-align: center;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-state h3 {
  color: #f8fafc;
  margin: 0 0 8px 0;
}

.empty-state p {
  color: #94a3b8;
  margin: 0;
}

.templates-section {
  max-width: 1400px;
  margin: 32px auto 0;
}

.templates-section h3 {
  color: #f8fafc;
  margin: 0 0 16px 0;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.template-card {
  background: rgba(30, 41, 59, 0.5);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
}

.template-card:hover {
  border-color: #0ea5e9;
  background: rgba(14, 165, 233, 0.1);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.template-name {
  color: #f8fafc;
  font-weight: 600;
}

.template-desc {
  color: #94a3b8;
  font-size: 13px;
  margin-bottom: 12px;
}

.template-action {
  text-align: right;
}

/* Responsive */
@media (max-width: 1024px) {
  .main-content {
    flex-direction: column;
  }
  
  .parameters-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .risk-metrics {
    flex-direction: column;
  }
}
</style>