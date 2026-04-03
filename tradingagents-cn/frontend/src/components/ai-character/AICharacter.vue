<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

export interface AICharacterProps {
  name?: string
  avatar?: string
  status?: 'idle' | 'thinking' | 'speaking' | 'analyzing'
  expression?: 'neutral' | 'happy' | 'concerned' | 'excited' | 'thinking'
  size?: 'small' | 'medium' | 'large'
  showName?: boolean
  animated?: boolean
}

const props = withDefaults(defineProps<AICharacterProps>(), {
  name: 'AI Analyst',
  avatar: '',
  status: 'idle',
  expression: 'neutral',
  size: 'medium',
  showName: true,
  animated: true
})

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'statusChange', status: string): void
}>()

const isAnimating = ref(false)
const currentExpression = ref(props.expression)
const speechBubble = ref('')
const isSpeaking = ref(false)

const sizeClass = computed(() => `avatar-${props.size}`)
const statusClass = computed(() => `status-${props.status}`)

const expressions = {
  neutral: { eyes: '◕ ◕', mouth: '—', color: '#4A90D9' },
  happy: { eyes: '◕ ◕', mouth: '‿', color: '#52C41A' },
  concerned: { eyes: '◔ ◔', mouth: '—', color: '#FAAD14' },
  excited: { eyes: '◕ ◕', mouth: '◡', color: '#722ED1' },
  thinking: { eyes: '◔ ◑', mouth: '—', color: '#1890FF' }
}

const currentFace = computed(() => expressions[currentExpression.value] || expressions.neutral)

watch(() => props.expression, (newExpr) => {
  currentExpression.value = newExpr
})

watch(() => props.status, (newStatus) => {
  if (newStatus === 'speaking') {
    isSpeaking.value = true
    if (props.animated) {
      startSpeakingAnimation()
    }
  } else {
    isSpeaking.value = false
    isAnimating.value = false
  }
  emit('statusChange', newStatus)
})

function startSpeakingAnimation() {
  if (!props.animated) return
  isAnimating.value = true
  
  let mouthIndex = 0
  const mouths = ['—', '◡', '‿', '◡']
  
  const interval = setInterval(() => {
    if (!isSpeaking.value) {
      clearInterval(interval)
      isAnimating.value = false
      return
    }
    mouthIndex = (mouthIndex + 1) % mouths.length
  }, 150)
}

function handleClick() {
  emit('click')
}

defineExpose({
  setExpression,
  speak,
  stopSpeaking
})

function setExpression(expr: 'neutral' | 'happy' | 'concerned' | 'excited' | 'thinking') {
  currentExpression.value = expr
}

function speak(text: string, duration: number = 3000) {
  speechBubble.value = text
  isSpeaking.value = true
  
  if (props.animated) {
    startSpeakingAnimation()
  }
  
  setTimeout(() => {
    speechBubble.value = ''
    isSpeaking.value = false
    isAnimating.value = false
  }, duration)
}

function stopSpeaking() {
  speechBubble.value = ''
  isSpeaking.value = false
  isAnimating.value = false
}
</script>

<template>
  <div 
    class="ai-character-wrapper"
    :class="[sizeClass, statusClass]"
    @click="handleClick"
  >
    <div class="ai-character" :class="{ animated: props.animated }">
      <div class="avatar-container">
        <div 
          class="avatar-ring"
          :style="{ borderColor: currentFace.color }"
          :class="{ pulsing: isSpeaking }"
        ></div>
        
        <div class="avatar-face" :class="{ speaking: isSpeaking }">
          <div 
            class="avatar-body"
            :style="{ backgroundColor: currentFace.color }"
          >
            <div class="avatar-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
            </div>
          </div>
          
          <div class="avatar-eyes">
            <span class="eye left">{{ currentFace.eyes.split(' ')[0] }}</span>
            <span class="eye right">{{ currentFace.eyes.split(' ')[1] }}</span>
          </div>
          
          <div 
            class="avatar-mouth"
            :class="{ 
              speaking: isSpeaking && props.animated,
              'mouth-small': size === 'small',
              'mouth-large': size === 'large'
            }"
          >
            {{ currentFace.mouth }}
          </div>
        </div>
        
        <div class="status-indicator">
          <span class="status-dot" :class="statusClass"></span>
        </div>
      </div>
      
      <Transition name="bubble">
        <div v-if="speechBubble" class="speech-bubble">
          {{ speechBubble }}
        </div>
      </Transition>
    </div>
    
    <div v-if="showName" class="character-name">
      {{ name }}
    </div>
    
    <div class="character-status">
      <span class="status-text">{{ status }}</span>
    </div>
  </div>
</template>

<style scoped>
.ai-character-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.avatar-small { --avatar-size: 48px; }
.avatar-medium { --avatar-size: 80px; }
.avatar-large { --avatar-size: 120px; }

.ai-character {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.avatar-container {
  position: relative;
  width: var(--avatar-size);
  height: var(--avatar-size);
}

.avatar-ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 3px solid;
  transition: border-color 0.3s ease;
}

.avatar-ring.pulsing {
  animation: pulse-ring 1.5s ease-in-out infinite;
}

@keyframes pulse-ring {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
}

.avatar-face {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(145deg, #f0f0f0, #e0e0e0);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: transform 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.avatar-face.speaking {
  animation: bob 0.3s ease-in-out infinite;
}

@keyframes bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.avatar-body {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.3s ease;
}

.avatar-icon {
  color: white;
  opacity: 0.3;
}

.avatar-eyes {
  position: absolute;
  top: 35%;
  display: flex;
  gap: calc(var(--avatar-size) * 0.15);
  font-size: calc(var(--avatar-size) * 0.15);
  font-weight: bold;
  z-index: 2;
}

.eye {
  transition: transform 0.2s ease;
}

.status-thinking .eye {
  animation: look-around 2s ease-in-out infinite;
}

@keyframes look-around {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}

.avatar-mouth {
  position: absolute;
  bottom: 25%;
  font-size: calc(var(--avatar-size) * 0.12);
  transition: all 0.15s ease;
  z-index: 2;
}

.avatar-mouth.speaking {
  animation: speak-mouth 0.15s ease-in-out infinite alternate;
}

@keyframes speak-mouth {
  0% { transform: scaleY(0.5); }
  100% { transform: scaleY(1.2); }
}

.status-indicator {
  position: absolute;
  bottom: -2px;
  right: -2px;
}

.status-dot {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid white;
  transition: background-color 0.3s ease;
}

.status-dot.status-idle { background-color: #8c8c8c; }
.status-dot.status-thinking { background-color: #1890ff; animation: blink 1s ease-in-out infinite; }
.status-dot.status-speaking { background-color: #52c41a; animation: blink 0.5s ease-in-out infinite; }
.status-dot.status-analyzing { background-color: #faad14; animation: spin 2s linear infinite; }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.speech-bubble {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-size: 0.875rem;
  max-width: 200px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 10;
}

.speech-bubble::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid white;
}

.bubble-enter-active, .bubble-leave-active {
  transition: all 0.3s ease;
}

.bubble-enter-from, .bubble-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

.character-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: #333;
}

.character-status {
  font-size: 0.75rem;
  color: #999;
  text-transform: capitalize;
}
</style>
