<script setup lang="ts">
import { computed } from 'vue'
import { 
  WarningFilled, 
  CircleCheckFilled, 
  InfoFilled, 
  QuestionFilled 
} from '@element-plus/icons-vue'

interface ErrorAction {
  label: string
  handler: () => void
}

const props = defineProps<{
  type: 'error' | 'success' | 'info' | 'warning'
  title?: string
  message: string
  details?: string
  actions?: ErrorAction[]
  retry?: () => void
  dismissible?: boolean
}>()

const emit = defineEmits<{
  dismiss: []
}>()

const icons = {
  error: WarningFilled,
  success: CircleCheckFilled,
  info: InfoFilled,
  warning: QuestionFilled,
}

const typeStyles = computed(() => {
  switch (props.type) {
    case 'error':
      return {
        bg: '#FEF0F0',
        border: '#fde2e2',
        color: '#F56C6C',
        iconBg: '#f56c6c',
      }
    case 'success':
      return {
        bg: '#F0F9EB',
        border: '#e1f3d8',
        color: '#67C23A',
        iconBg: '#67c23a',
      }
    case 'warning':
      return {
        bg: '#FDF6EC',
        border: '#faecd8',
        color: '#E6A23C',
        iconBg: '#e6a23c',
      }
    case 'info':
      return {
        bg: '#EDF2FE',
        border: '#d9ecff',
        color: '#409EFF',
        iconBg: '#409eff',
      }
  }
})

const friendlyMessages: Record<string, string> = {
  'NETWORK_ERROR': '网络连接不稳定，请检查网络后重试',
  'TIMEOUT': '请求超时，请稍后重试',
  'AUTH_FAILED': '认证失败，请检查 API Key 配置',
  'RATE_LIMIT': '请求过于频繁，请稍后重试',
  'SERVER_ERROR': '服务器开小差了，我们正在修复中',
  'INVALID_PARAMS': '输入参数有误，请检查后重试',
  'WS_CONNECT_FAILED': '实时连接断开，请刷新页面重试',
  'LLM_ERROR': 'AI 服务暂时不可用，请稍后重试',
  'DATA_NOT_FOUND': '未找到相关数据，请检查股票代码',
  'UNKNOWN': '发生了一些意外，请稍后重试',
}

const getFriendlyMessage = (msg: string): string => {
  const upperMsg = msg.toUpperCase()
  for (const [key, friendly] of Object.entries(friendlyMessages)) {
    if (upperMsg.includes(key)) {
      return friendly
    }
  }
  return msg
}

const displayMessage = computed(() => {
  if (props.type === 'error') {
    return getFriendlyMessage(props.message)
  }
  return props.message
})

const dismiss = () => {
  emit('dismiss')
}
</script>

<template>
  <div 
    class="friendly-message"
    :style="{
      backgroundColor: typeStyles.bg,
      borderColor: typeStyles.border,
    }"
  >
    <div class="message-header">
      <div class="icon-wrapper" :style="{ backgroundColor: typeStyles.iconBg }">
        <el-icon :size="20" color="white">
          <component :is="icons[type]" />
        </el-icon>
      </div>
      <div class="title-content">
        <div class="message-title" :style="{ color: typeStyles.color }">
          {{ title || (type === 'error' ? '出错了' : type === 'success' ? '成功' : '提示') }}
        </div>
        <div class="message-content">{{ displayMessage }}</div>
      </div>
      <el-button 
        v-if="dismissible"
        text
        :icon="QuestionFilled"
        @click="dismiss"
        class="dismiss-btn"
      />
    </div>
    
    <div v-if="details" class="message-details">
      <pre>{{ details }}</pre>
    </div>

    <div v-if="actions?.length || retry" class="message-actions">
      <el-button 
        v-if="retry"
        type="primary"
        size="small"
        @click="retry"
      >
        重试
      </el-button>
      <el-button 
        v-for="action in actions"
        :key="action.label"
        size="small"
        @click="action.handler"
      >
        {{ action.label }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.friendly-message {
  border: 1px solid;
  border-radius: 8px;
  padding: 1rem;
  margin: 0.5rem 0;
}

.message-header {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.icon-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.title-content {
  flex: 1;
}

.message-title {
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.message-content {
  color: #606266;
  font-size: 0.875rem;
  line-height: 1.5;
}

.dismiss-btn {
  color: #909399;
}

.message-details {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  overflow-x: auto;
}

.message-details pre {
  margin: 0;
  font-size: 0.75rem;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-all;
}

.message-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}
</style>
