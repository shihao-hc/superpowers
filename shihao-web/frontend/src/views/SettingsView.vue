<template>
  <div class="settings-view">
    <!-- Trading Settings -->
    <div class="glass-card settings-card">
      <div class="card-header">
        <div class="header-left">
          <div class="section-icon trading-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <h2>交易设置</h2>
        </div>
      </div>
      
      <el-form :model="settings.trading" label-width="160px" class="settings-form">
        <el-form-item label="交易模式">
          <el-radio-group v-model="settings.trading.mode" class="mode-group">
            <el-radio-button label="paper">
              <span class="mode-label">模拟交易</span>
            </el-radio-button>
            <el-radio-button label="live">
              <span class="mode-label">实盘交易</span>
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="自动交易">
          <div class="switch-container">
            <el-switch v-model="settings.trading.autoTrade" class="custom-switch" />
            <span class="form-hint">开启后系统将自动执行交易信号</span>
          </div>
        </el-form-item>
        
        <el-form-item label="最大持仓数量">
          <el-input-number 
            v-model="settings.trading.maxPositions" 
            :min="1" 
            :max="50"
            class="number-input"
          />
        </el-form-item>
        
        <el-form-item label="单票最大仓位">
          <el-select v-model="settings.trading.maxPositionSize" class="position-select">
            <el-option label="10%" :value="0.1" />
            <el-option label="20%" :value="0.2" />
            <el-option label="30%" :value="0.3" />
            <el-option label="50%" :value="0.5" />
          </el-select>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- Risk Settings -->
    <div class="glass-card settings-card">
      <div class="card-header">
        <div class="header-left">
          <div class="section-icon risk-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2>风控设置</h2>
        </div>
      </div>
      
      <el-form :model="settings.risk" label-width="160px" class="settings-form">
        <el-form-item label="单日最大亏损">
          <el-select v-model="settings.risk.maxDailyLoss" class="loss-select">
            <el-option label="1%" :value="0.01" />
            <el-option label="2%" :value="0.02" />
            <el-option label="5%" :value="0.05" />
            <el-option label="10%" :value="0.1" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="最大回撤限制">
          <el-select v-model="settings.risk.maxDrawdown" class="drawdown-select">
            <el-option label="10%" :value="0.1" />
            <el-option label="15%" :value="0.15" />
            <el-option label="20%" :value="0.2" />
            <el-option label="30%" :value="0.3" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="止损比例">
          <el-input-number 
            v-model="settings.risk.stopLoss" 
            :min="0.01" 
            :max="0.2"
            :step="0.01"
            class="stop-loss-input"
          />
        </el-form-item>
        
        <el-form-item label="止盈比例">
          <el-input-number 
            v-model="settings.risk.takeProfit" 
            :min="0.05" 
            :max="0.5"
            :step="0.05"
            class="take-profit-input"
          />
        </el-form-item>
        
        <el-form-item label="黑名单管理">
          <el-select
            v-model="settings.risk.blacklist"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="添加黑名单股票"
            class="blacklist-select"
          />
        </el-form-item>
      </el-form>
    </div>
    
    <!-- Model Settings -->
    <div class="glass-card settings-card">
      <div class="card-header">
        <div class="header-left">
          <div class="section-icon model-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
          </div>
          <h2>模型设置</h2>
        </div>
      </div>
      
      <el-form :model="settings.model" label-width="160px" class="settings-form">
        <el-form-item label="AI选股模型">
          <el-select v-model="settings.model.selectionModel" class="model-select">
            <el-option label="集成模型 (推荐)" value="ensemble">
              <div class="option-content">
                <span class="option-label">集成模型</span>
                <el-tag size="small" type="success">推荐</el-tag>
              </div>
            </el-option>
            <el-option label="趋势模型" value="trend" />
            <el-option label="价值模型" value="value" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="最低置信度">
          <div class="slider-container">
            <el-slider 
              v-model="settings.model.minConfidence" 
              :min="0.5" 
              :max="0.95"
              :step="0.05"
              show-input
              class="confidence-slider"
            />
          </div>
        </el-form-item>
        
        <el-form-item label="选股周期">
          <el-select v-model="settings.model.lookbackDays" class="period-select">
            <el-option label="30天" :value="30" />
            <el-option label="90天" :value="90" />
            <el-option label="180天" :value="180" />
            <el-option label="365天" :value="365" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="自动重训练">
          <div class="switch-container">
            <el-switch v-model="settings.model.autoRetrain" class="custom-switch" />
            <span class="form-hint">定期自动重训练模型</span>
          </div>
        </el-form-item>
        
        <el-form-item v-if="settings.model.autoRetrain" label="重训练频率">
          <el-select v-model="settings.model.retrainInterval" class="interval-select">
            <el-option label="每天" value="daily" />
            <el-option label="每周" value="weekly" />
            <el-option label="每月" value="monthly" />
          </el-select>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- Data Settings -->
    <div class="glass-card settings-card">
      <div class="card-header">
        <div class="header-left">
          <div class="section-icon data-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
          </div>
          <h2>数据设置</h2>
        </div>
      </div>
      
      <el-form :model="settings.data" label-width="160px" class="settings-form">
        <el-form-item label="数据源">
          <el-checkbox-group v-model="settings.data.sources" class="source-group">
            <el-checkbox label="akshare" class="source-checkbox">AKShare (A股)</el-checkbox>
            <el-checkbox label="yfinance" class="source-checkbox">YFinance (国际市场)</el-checkbox>
            <el-checkbox label="tushare" class="source-checkbox">Tushare (备用)</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        
        <el-form-item label="实时行情">
          <div class="switch-container">
            <el-switch v-model="settings.data.realtime" class="custom-switch" />
            <span class="form-hint">开启实时行情订阅</span>
          </div>
        </el-form-item>
        
        <el-form-item label="缓存时间">
          <el-select v-model="settings.data.cacheTime" class="cache-select">
            <el-option label="5分钟" :value="300" />
            <el-option label="15分钟" :value="900" />
            <el-option label="30分钟" :value="1800" />
            <el-option label="1小时" :value="3600" />
          </el-select>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- Notification Settings -->
    <div class="glass-card settings-card">
      <div class="card-header">
        <div class="header-left">
          <div class="section-icon notification-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <h2>通知设置</h2>
        </div>
      </div>
      
      <el-form :model="settings.notification" label-width="160px" class="settings-form">
        <el-form-item label="交易通知">
          <el-switch v-model="settings.notification.trade" class="custom-switch" />
        </el-form-item>
        
        <el-form-item label="风险告警">
          <el-switch v-model="settings.notification.risk" class="custom-switch" />
        </el-form-item>
        
        <el-form-item label="模型更新">
          <el-switch v-model="settings.notification.model" class="custom-switch" />
        </el-form-item>
        
        <el-form-item label="通知方式">
          <el-checkbox-group v-model="settings.notification.channels" class="channel-group">
            <el-checkbox label="email" class="channel-checkbox">邮件</el-checkbox>
            <el-checkbox label="wechat" class="channel-checkbox">微信</el-checkbox>
            <el-checkbox label="feishu" class="channel-checkbox">飞书</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- Action Buttons -->
    <div class="action-buttons">
      <el-button type="primary" size="large" @click="saveSettings" :loading="saving" class="save-btn">
        <el-icon><Check /></el-icon>
        保存设置
      </el-button>
      <el-button size="large" @click="resetSettings" class="reset-btn">
        <el-icon><Refresh /></el-icon>
        重置默认
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Refresh } from '@element-plus/icons-vue'

const saving = ref(false)

const settings = reactive({
  trading: {
    mode: 'paper',
    autoTrade: false,
    maxPositions: 20,
    maxPositionSize: 0.2
  },
  risk: {
    maxDailyLoss: 0.05,
    maxDrawdown: 0.15,
    stopLoss: 0.1,
    takeProfit: 0.2,
    blacklist: []
  },
  model: {
    selectionModel: 'ensemble',
    minConfidence: 0.6,
    lookbackDays: 365,
    autoRetrain: true,
    retrainInterval: 'weekly'
  },
  data: {
    sources: ['akshare', 'yfinance'],
    realtime: true,
    cacheTime: 900
  },
  notification: {
    trade: true,
    risk: true,
    model: false,
    channels: ['email']
  }
})

async function saveSettings() {
  saving.value = true
  
  try {
    // Save to localStorage
    localStorage.setItem('shihao_settings', JSON.stringify(settings))
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    ElMessage.success('设置已保存')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function resetSettings() {
  try {
    await ElMessageBox.confirm(
      '确定要重置所有设置到默认值吗？',
      '重置确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    // Reset to defaults
    settings.trading.mode = 'paper'
    settings.trading.autoTrade = false
    settings.trading.maxPositions = 20
    settings.trading.maxPositionSize = 0.2
    settings.risk.maxDailyLoss = 0.05
    settings.risk.maxDrawdown = 0.15
    settings.risk.stopLoss = 0.1
    settings.risk.takeProfit = 0.2
    settings.risk.blacklist = []
    settings.model.selectionModel = 'ensemble'
    settings.model.minConfidence = 0.6
    settings.model.lookbackDays = 365
    settings.model.autoRetrain = true
    settings.model.retrainInterval = 'weekly'
    settings.data.sources = ['akshare', 'yfinance']
    settings.data.realtime = true
    settings.data.cacheTime = 900
    settings.notification.trade = true
    settings.notification.risk = true
    settings.notification.model = false
    settings.notification.channels = ['email']
    
    ElMessage.success('设置已重置')
  } catch {
    // User cancelled
  }
}

function loadSettings() {
  const saved = localStorage.getItem('shihao_settings')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      Object.assign(settings, parsed)
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.settings-view {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.glass-card {
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 16px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.settings-card {
  transition: all 0.3s ease;
}

.settings-card:hover {
  border-color: rgba(14, 165, 233, 0.2);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.section-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.section-icon svg {
  width: 24px;
  height: 24px;
}

.trading-icon {
  background: rgba(14, 165, 233, 0.1);
  color: #0ea5e9;
}

.risk-icon {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.model-icon {
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
}

.data-icon {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.notification-icon {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.card-header h2 {
  color: #e2e8f0;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.settings-form {
  padding: 24px;
}

.settings-form :deep(.el-form-item__label) {
  color: #94a3b8;
  font-weight: 500;
}

.mode-group :deep(.el-radio-button__inner) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  padding: 12px 20px;
  transition: all 0.3s ease;
}

.mode-group :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: rgba(14, 165, 233, 0.2);
  border-color: rgba(14, 165, 233, 0.3);
  color: #0ea5e9;
}

.mode-label {
  font-weight: 600;
}

.switch-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.custom-switch {
  margin-right: 8px;
}

.form-hint {
  font-size: 13px;
  color: #64748b;
  margin-left: 8px;
}

.number-input, .position-select, .loss-select, .drawdown-select, .stop-loss-input, .take-profit-input, .blacklist-select, .model-select, .period-select, .interval-select, .source-group, .cache-select, .channel-group {
  width: 100%;
}

.settings-form :deep(.el-input__wrapper) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  box-shadow: none;
}

.settings-form :deep(.el-input__inner) {
  color: #e2e8f0;
}

.settings-form :deep(.el-select__wrapper) {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  box-shadow: none;
}

.settings-form :deep(.el-checkbox__label) {
  color: #e2e8f0;
}

.settings-form :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #0ea5e9;
  border-color: #0ea5e9;
}

.slider-container {
  width: 100%;
}

.confidence-slider {
  width: 100%;
}

.source-checkbox, .channel-checkbox {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 8px;
  padding: 12px 16px;
  margin-right: 12px;
  margin-bottom: 8px;
  transition: all 0.3s ease;
}

.source-checkbox:hover, .channel-checkbox:hover {
  background: rgba(15, 23, 42, 0.6);
  border-color: rgba(14, 165, 233, 0.2);
}

.source-checkbox.is-checked, .channel-checkbox.is-checked {
  background: rgba(14, 165, 233, 0.1);
  border-color: rgba(14, 165, 233, 0.3);
}

.option-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.option-label {
  font-weight: 500;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 24px;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.save-btn {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  border: none;
  color: white;
  font-weight: 600;
  padding: 14px 32px;
  border-radius: 12px;
  font-size: 16px;
  transition: all 0.3s ease;
}

.save-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(14, 165, 233, 0.3);
}

.reset-btn {
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  font-weight: 600;
  padding: 14px 32px;
  border-radius: 12px;
  font-size: 16px;
  transition: all 0.3s ease;
}

.reset-btn:hover {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
}

/* Responsive */
@media (max-width: 768px) {
  .settings-form {
    padding: 16px;
  }
  
  .settings-form :deep(.el-form-item) {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .settings-form :deep(.el-form-item__label) {
    width: 100% !important;
    margin-bottom: 8px;
  }
  
  .action-buttons {
    flex-direction: column;
  }
  
  .save-btn, .reset-btn {
    width: 100%;
  }
}
</style>