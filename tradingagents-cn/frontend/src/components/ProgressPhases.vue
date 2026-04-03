<script setup lang="ts">
import { computed } from 'vue'
import { Check, Clock, DataLine, Document, ChatDotRound, Warning, TrendCharts } from '@element-plus/icons-vue'

interface Stage {
  key: string
  label: string
  icon: any
  threshold: number
}

const props = defineProps<{
  progress: number
  currentStage?: string
  showLabel?: boolean
  size?: 'small' | 'medium' | 'large'
  compact?: boolean
}>()

const stages: Stage[] = [
  { key: 'market', label: '市场分析', icon: DataLine, threshold: 0.05 },
  { key: 'fundamentals', label: '基本面', icon: Document, threshold: 0.2 },
  { key: 'news', label: '新闻分析', icon: ChatDotRound, threshold: 0.35 },
  { key: 'sentiment', label: '情绪分析', icon: TrendCharts, threshold: 0.5 },
  { key: 'debate', label: '辩论决策', icon: ChatDotRound, threshold: 0.65 },
  { key: 'risk', label: '风险评估', icon: Warning, threshold: 0.8 },
  { key: 'decision', label: '最终决策', icon: TrendCharts, threshold: 1.0 },
]

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'small': return 'stage-icon-sm'
    case 'large': return 'stage-icon-lg'
    default: return 'stage-icon-md'
  }
})

const getStageStatus = (stage: Stage) => {
  const progressVal = props.progress / 100
  if (progressVal >= 1) return 'completed'
  if (progressVal >= stage.threshold) return 'active'
  return 'pending'
}

const isCurrentStage = (stage: Stage) => {
  return props.currentStage === stage.key
}

const getStageColor = (status: string) => {
  switch (status) {
    case 'completed': return '#67C23A'
    case 'active': return '#409EFF'
    default: return '#C0C4CC'
  }
}

const getStageIcon = (stage: Stage, status: string) => {
  if (status === 'completed') return Check
  if (status === 'active') return stage.icon
  return Clock
}
</script>

<template>
  <div :class="['progress-stages', { compact: compact }]">
    <div 
      v-for="(stage, index) in stages" 
      :key="stage.key"
      :class="['stage-item', getStageStatus(stage), { current: isCurrentStage(stage) }]"
    >
      <div class="stage-connector" v-if="index > 0">
        <div 
          class="connector-line" 
          :style="{ 
            backgroundColor: getStageColor(getStageStatus(stages[index - 1]))
          }"
        />
      </div>
      <div 
        :class="['stage-icon-wrapper', sizeClasses]"
        :style="{ borderColor: getStageColor(getStageStatus(stage)) }"
      >
        <el-icon 
          v-if="getStageStatus(stage) !== 'pending'"
          :size="size === 'small' ? 12 : size === 'large' ? 18 : 14"
          class="stage-icon"
        >
          <component :is="getStageIcon(stage, getStageStatus(stage))" />
        </el-icon>
        <span v-else class="stage-number">{{ index + 1 }}</span>
      </div>
      <div v-if="showLabel && !compact" class="stage-label">{{ stage.label }}</div>
      <div v-if="compact" class="stage-label-compact">{{ stage.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.progress-stages {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1rem 0;
  gap: 0.5rem;
}

.progress-stages.compact {
  padding: 0.5rem 0;
}

.stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  flex: 1;
  min-width: 0;
}

.stage-connector {
  position: absolute;
  top: 16px;
  right: 50%;
  width: 100%;
  height: 2px;
  z-index: 0;
}

.compact .stage-connector {
  top: 12px;
}

.connector-line {
  height: 100%;
  transition: background-color 0.3s ease;
}

.stage-icon-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  z-index: 1;
  transition: all 0.3s ease;
}

.compact .stage-icon-wrapper {
  width: 24px;
  height: 24px;
}

.stage-icon-sm .stage-icon-wrapper {
  width: 24px;
  height: 24px;
}

.stage-icon-lg .stage-icon-wrapper {
  width: 40px;
  height: 40px;
}

.stage-icon-wrapper.completed {
  background: #67C23A;
  border-color: #67C23A;
  color: white;
}

.stage-icon-wrapper.active {
  background: #409EFF;
  border-color: #409EFF;
  color: white;
  animation: pulse 2s infinite;
}

.stage-item.current .stage-icon-wrapper {
  box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.3);
}

.stage-icon-wrapper.pending {
  background: white;
  border-color: #C0C4CC;
  color: #C0C4CC;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(64, 158, 255, 0);
  }
}

.stage-icon {
  font-weight: bold;
}

.stage-number {
  font-size: 11px;
  font-weight: 600;
  color: inherit;
}

.stage-label {
  margin-top: 0.5rem;
  font-size: 12px;
  color: #606266;
  text-align: center;
  white-space: nowrap;
}

.stage-label-compact {
  margin-top: 0.25rem;
  font-size: 10px;
  color: #909399;
  text-align: center;
  white-space: nowrap;
}

.stage-item.completed .stage-label,
.stage-item.completed .stage-label-compact {
  color: #67C23A;
}

.stage-item.active .stage-label,
.stage-item.active .stage-label-compact {
  color: #409EFF;
}

@media (max-width: 768px) {
  .progress-stages {
    flex-wrap: wrap;
    justify-content: center;
    gap: 1rem;
  }
  
  .stage-item {
    flex: 0 0 auto;
    min-width: 60px;
  }
  
  .stage-connector {
    display: none;
  }
}
</style>
