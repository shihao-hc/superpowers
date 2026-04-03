<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { ElCard, ElButton, ElProgress, ElTag, ElMessage, ElAlert, ElTabs, ElTabPane } from 'element-plus'
import { ArrowLeft, Code, Refresh, Connection, Finished } from '@element-plus/icons-vue'

interface CodeReviewResponse {
  task_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  code: string
  language: string
  critic_arguments: string
  advocate_arguments: string
  final_verdict: string
  errors: string[]
  progress: number
}

interface WebSocketMessage {
  type: 'progress' | 'result' | 'error'
  progress?: number
  message?: string
  payload?: Partial<CodeReviewResponse>
  error?: string
}

const form = ref({
  code: '',
  language: 'python',
  filePath: '',
  llmProvider: 'dashscope',
})

const result = ref<CodeReviewResponse | null>(null)
const loading = ref(false)
const progress = ref(0)
const statusText = ref('等待提交')
const wsConnected = ref(false)

let ws: WebSocket | null = null

const languages = [
  { label: 'Python', value: 'python' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Java', value: 'java' },
  { label: 'Go', value: 'go' },
  { label: 'Rust', value: 'rust' },
  { label: 'C++', value: 'cpp' },
  { label: 'C#', value: 'csharp' },
]

const providers = [
  { label: '阿里百炼 (DashScope)', value: 'dashscope' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Google Gemini', value: 'google' },
]

const connectWebSocket = (taskId: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${window.location.host}/ws/${taskId}`)

  ws.onopen = () => {
    wsConnected.value = true
    statusText.value = '已连接，等待结果...'
  }

  ws.onmessage = (event) => {
    const msg: WebSocketMessage = JSON.parse(event.data)
    
    switch (msg.type) {
      case 'progress':
        progress.value = Math.round((msg.progress || 0) * 100)
        statusText.value = msg.message || '处理中...'
        if (result.value) {
          result.value.progress = msg.progress || 0
        }
        break
      case 'result':
        result.value = { ...result.value!, ...msg.payload } as CodeReviewResponse
        result.value!.status = 'completed'
        progress.value = 100
        statusText.value = '审查完成'
        ElMessage.success('代码审查完成!')
        ws?.close()
        break
      case 'error':
        result.value = { ...result.value!, status: 'failed', errors: [msg.error || 'Unknown error'] }
        statusText.value = '审查失败'
        ElMessage.error(msg.error || '审查失败')
        ws?.close()
        break
    }
  }

  ws.onerror = () => {
    wsConnected.value = false
    ElMessage.error('WebSocket 连接失败')
  }

  ws.onclose = () => {
    wsConnected.value = false
    loading.value = false
  }
}

const submit = async () => {
  if (!form.value.code.trim()) {
    ElMessage.warning('请输入代码')
    return
  }

  loading.value = true
  result.value = null
  progress.value = 0
  statusText.value = '任务已提交'

  try {
    const response = await fetch('/api/v1/code-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.value.code,
        language: form.value.language,
        file_path: form.value.filePath,
        llm_provider: form.value.llmProvider,
      }),
    })

    if (!response.ok) {
      throw new Error('提交失败')
    }

    const data = await response.json()
    result.value = {
      task_id: data.task_id,
      status: 'pending',
      code: form.value.code,
      language: form.value.language,
      critic_arguments: '',
      advocate_arguments: '',
      final_verdict: '',
      errors: [],
      progress: 0,
    }

    connectWebSocket(data.task_id)
  } catch (error) {
    console.error('Review failed:', error)
    ElMessage.error('提交失败')
    loading.value = false
  }
}

const disconnect = () => {
  if (ws) {
    ws.close()
    ws = null
  }
}

onUnmounted(() => {
  disconnect()
})
</script>

<template>
  <div class="review-container">
    <header class="review-header">
      <div class="header-left">
        <el-button :icon="ArrowLeft" @click="$router.push('/')">返回</el-button>
        <h2><Code /> 代码审查</h2>
      </div>
      <div class="connection-status">
        <el-tag :type="wsConnected ? 'success' : 'info'" size="small">
          <Connection />
          {{ wsConnected ? '实时连接' : '未连接' }}
        </el-tag>
      </div>
    </header>

    <div class="review-content">
      <el-card class="input-card">
        <template #header>
          <span>输入代码</span>
        </template>
        <el-form label-width="100px">
          <el-form-item label="编程语言">
            <el-select v-model="form.language" style="width: 180px">
              <el-option v-for="lang in languages" :key="lang.value" :label="lang.label" :value="lang.value" />
            </el-select>
          </el-form-item>

          <el-form-item label="LLM 提供商">
            <el-select v-model="form.llmProvider" style="width: 180px">
              <el-option v-for="p in providers" :key="p.value" :label="p.label" :value="p.value" />
            </el-select>
          </el-form-item>

          <el-form-item label="文件路径">
            <el-input v-model="form.filePath" placeholder="可选: src/main.py" style="width: 250px" />
          </el-form-item>

          <el-form-item label="代码">
            <el-input
              v-model="form.code"
              type="textarea"
              :rows="12"
              placeholder="Paste your code here..."
              style="font-family: 'Fira Code', Consolas, monospace; font-size: 13px;"
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="loading" :icon="Code" @click="submit">
              {{ loading ? '审查中...' : '开始审查' }}
            </el-button>
            <el-button :icon="Refresh" @click="form.code = ''" :disabled="loading">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card v-if="result || loading" class="progress-card">
        <template #header>
          <div class="card-header">
            <span>审查进度</span>
            <el-tag :type="result?.status === 'completed' ? 'success' : result?.status === 'failed' ? 'danger' : 'primary'">
              {{ statusText }}
            </el-tag>
          </div>
        </template>

        <el-progress :percentage="progress" :color="progress === 100 ? '#67C23A' : '#409EFF'" />

        <div class="phase-list">
          <div :class="['phase', { active: progress >= 0 }]">
            <el-tag v-if="progress >= 20" type="success" size="small">✓</el-tag>
            <el-tag v-else type="info" size="small">1</el-tag>
            <span>静态分析</span>
          </div>
          <div :class="['phase', { active: progress >= 20 }]">
            <el-tag v-if="progress >= 40" type="success" size="small">✓</el-tag>
            <el-tag v-else type="info" size="small">2</el-tag>
            <span>安全检查</span>
          </div>
          <div :class="['phase', { active: progress >= 40 }]">
            <el-tag v-if="progress >= 60" type="success" size="small">✓</el-tag>
            <el-tag v-else type="info" size="small">3</el-tag>
            <span>性能评估</span>
          </div>
          <div :class="['phase', { active: progress >= 60 }]">
            <el-tag v-if="progress >= 80" type="success" size="small">✓</el-tag>
            <el-tag v-else type="info" size="small">4</el-tag>
            <span>辩论环节</span>
          </div>
          <div :class="['phase', { active: progress >= 80 }]">
            <el-tag v-if="progress >= 100" type="success" size="small">✓</el-tag>
            <el-tag v-else type="info" size="small">5</el-tag>
            <span>裁判裁决</span>
          </div>
        </div>
      </el-card>

      <el-card v-if="result" class="result-card">
        <template #header>
          <div class="card-header">
            <span>审查结果</span>
            <el-tag v-if="result.status === 'completed'" type="success">
              <Finished /> 审查完成
            </el-tag>
            <el-tag v-else-if="result.status === 'failed'" type="danger">审查失败</el-tag>
          </div>
        </template>

        <div v-if="result.status === 'failed'" class="error-box">
          <el-alert type="error" :title="result.errors[0] || '审查失败'" show-icon />
        </div>

        <div v-else>
          <div v-if="result.final_verdict" class="verdict-section">
            <h3>最终裁决</h3>
            <el-alert :title="result.final_verdict" type="info" show-icon :closable="false" />
          </div>

          <el-tabs v-if="result.critic_arguments || result.advocate_arguments">
            <el-tab-pane label="批评者观点">
              <pre class="debate-content critic">{{ result.critic_arguments || '无' }}</pre>
            </el-tab-pane>
            <el-tab-pane label="辩护者观点">
              <pre class="debate-content advocate">{{ result.advocate_arguments || '无' }}</pre>
            </el-tab-pane>
          </el-tabs>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.review-container {
  padding: 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  background: rgba(255, 255, 255, 0.95);
  padding: 1rem 1.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
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
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.review-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 1024px) {
  .review-content {
    grid-template-columns: 1fr;
  }
}

.input-card,
.progress-card,
.result-card {
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.result-card {
  height: fit-content;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.phase-list {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.phase {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 6px;
  color: #909399;
  background: #f5f7fa;
  transition: all 0.3s;
}

.phase.active {
  color: #67c23a;
  background: #f0f9eb;
}

.verdict-section {
  margin-bottom: 1rem;
}

.verdict-section h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: #303133;
}

.debate-content {
  padding: 1rem;
  border-radius: 8px;
  white-space: pre-wrap;
  font-size: 0.875rem;
  font-family: 'Fira Code', Consolas, monospace;
  line-height: 1.6;
  max-height: 400px;
  overflow-y: auto;
}

.critic {
  background: #fef0f0;
  border-left: 4px solid #f56c6c;
}

.advocate {
  background: #f0f9eb;
  border-left: 4px solid #67c23a;
}

.error-box {
  padding: 1rem;
}
</style>
