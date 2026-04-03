<script setup lang="ts">
import { reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElCard, ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElSwitch, ElButton, ElSlider, ElMessage } from 'element-plus'
import { Save, ArrowLeft } from '@element-plus/icons-vue'

const router = useRouter()

const form = reactive({
  llmProvider: 'deepseek',
  deepseekModel: 'deepseek-chat',
  openaiModel: 'gpt-4o',
  dashscopeModel: 'qwen-plus',
  riskPreference: 'moderate',
  maxPosition: 10,
  enableCache: true,
  cacheTtl: 3600,
  enableDebate: true,
  maxDebateRounds: 2,
  alertEnabled: false,
  dingtalkWebhook: '',
  wechatWebhook: '',
})

const modelsByProvider = {
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  dashscope: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
}

const save = () => {
  localStorage.setItem('tradingagents_config', JSON.stringify(form))
  ElMessage.success('Configuration saved')
}

const loadConfig = () => {
  const saved = localStorage.getItem('tradingagents_config')
  if (saved) {
    Object.assign(form, JSON.parse(saved))
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="settings-container">
    <header class="settings-header">
      <div class="header-left">
        <el-button :icon="ArrowLeft" @click="$router.push('/')">返回</el-button>
        <h2>设置</h2>
      </div>
      <el-button type="primary" :icon="Save" @click="save">保存设置</el-button>
    </header>

    <el-card class="settings-card">
      <h3>LLM 配置</h3>
      <el-form label-width="140px">
        <el-form-item label="LLM 提供商">
          <el-select v-model="form.llmProvider" style="width: 200px">
            <el-option label="DeepSeek" value="deepseek" />
            <el-option label="OpenAI" value="openai" />
            <el-option label="阿里云百炼" value="dashscope" />
          </el-select>
        </el-form-item>

        <el-form-item label="DeepSeek 模型" v-if="form.llmProvider === 'deepseek'">
          <el-select v-model="form.deepseekModel" style="width: 200px">
            <el-option v-for="m in modelsByProvider.deepseek" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>

        <el-form-item label="OpenAI 模型" v-if="form.llmProvider === 'openai'">
          <el-select v-model="form.openaiModel" style="width: 200px">
            <el-option v-for="m in modelsByProvider.openai" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>

        <el-form-item label="百炼模型" v-if="form.llmProvider === 'dashscope'">
          <el-select v-model="form.dashscopeModel" style="width: 200px">
            <el-option v-for="m in modelsByProvider.dashscope" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card">
      <h3>交易配置</h3>
      <el-form label-width="140px">
        <el-form-item label="风险偏好">
          <el-select v-model="form.riskPreference" style="width: 200px">
            <el-option label="保守" value="conservative" />
            <el-option label="均衡" value="moderate" />
            <el-option label="激进" value="aggressive" />
          </el-select>
        </el-form-item>

        <el-form-item label="最大仓位 (%)">
          <el-slider v-model="form.maxPosition" :min="5" :max="50" :step="5" style="width: 300px" />
          <span style="margin-left: 12px">{{ form.maxPosition }}%</span>
        </el-form-item>

        <el-form-item label="启用辩论">
          <el-switch v-model="form.enableDebate" />
        </el-form-item>

        <el-form-item label="辩论轮数" v-if="form.enableDebate">
          <el-slider v-model="form.maxDebateRounds" :min="1" :max="5" :step="1" style="width: 200px" />
          <span style="margin-left: 12px">{{ form.maxDebateRounds }} 轮</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card">
      <h3>缓存配置</h3>
      <el-form label-width="140px">
        <el-form-item label="启用缓存">
          <el-switch v-model="form.enableCache" />
        </el-form-item>

        <el-form-item label="缓存 TTL (秒)" v-if="form.enableCache">
          <el-input-number v-model="form.cacheTtl" :min="60" :max="86400" :step="60" />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card">
      <h3>告警配置</h3>
      <el-form label-width="140px">
        <el-form-item label="启用告警">
          <el-switch v-model="form.alertEnabled" />
        </el-form-item>

        <el-form-item label="钉钉 Webhook" v-if="form.alertEnabled">
          <el-input v-model="form.dingtalkWebhook" placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx" style="width: 400px" />
        </el-form-item>

        <el-form-item label="企业微信 Webhook" v-if="form.alertEnabled">
          <el-input v-model="form.wechatWebhook" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx" style="width: 400px" />
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.settings-container {
  padding: 1.5rem;
  background: #f5f7fa;
  min-height: 100vh;
  max-width: 800px;
  margin: 0 auto;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-left h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #303133;
}

.settings-card {
  margin-bottom: 1rem;
  border-radius: 8px;
}

.settings-card h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: #303133;
  border-bottom: 1px solid #ebeef5;
  padding-bottom: 0.5rem;
}
</style>
