<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

export interface ChatBubbleProps {
  message?: string
  sender?: 'ai' | 'user' | 'system'
  type?: 'normal' | 'analysis' | 'warning' | 'success' | 'error'
  avatar?: string
  showAvatar?: boolean
  typing?: boolean
  typewriterSpeed?: number
  autoHide?: number
  position?: 'top' | 'bottom' | 'left' | 'right'
  theme?: 'light' | 'dark' | 'glass'
}

const props = withDefaults(defineProps<ChatBubbleProps>(), {
  message: '',
  sender: 'ai',
  type: 'normal',
  showAvatar: true,
  typing: false,
  typewriterSpeed: 30,
  autoHide: 0,
  position: 'bottom',
  theme: 'glass'
})

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'close'): void
  (e: 'typingStart'): void
  (e: 'typingEnd'): void
}>()

const displayedText = ref('')
const isTyping = ref(false)
const showBubble = ref(false)
const currentIndex = ref(0)
let typewriterInterval: ReturnType<typeof setInterval> | null = null

const senderIcons: Record<string, string> = {
  ai: '🤖',
  user: '👤',
  system: '⚙️'
}

const typeStyles: Record<string, { icon: string; color: string }> = {
  normal: { icon: '💬', color: '#1890ff' },
  analysis: { icon: '📊', color: '#52c41a' },
  warning: { icon: '⚠️', color: '#faad14' },
  success: { icon: '✅', color: '#52c41a' },
  error: { icon: '❌', color: '#ff4d4f' }
}

const currentStyle = computed(() => typeStyles[props.type] || typeStyles.normal)
const currentIcon = computed(() => senderIcons[props.sender] || senderIcons.ai)

watch(() => props.message, (newMessage) => {
  if (newMessage) {
    showBubble.value = true
    if (props.typing) {
      startTypewriter(newMessage)
    } else {
      displayedText.value = newMessage
    }
    
    if (props.autoHide > 0) {
      setTimeout(() => {
        hideBubble()
      }, props.autoHide)
    }
  }
}, { immediate: true })

function startTypewriter(text: string) {
  stopTypewriter()
  
  displayedText.value = ''
  currentIndex.value = 0
  isTyping.value = true
  emit('typingStart')
  
  typewriterInterval = setInterval(() => {
    if (currentIndex.value < text.length) {
      displayedText.value += text[currentIndex.value]
      currentIndex.value++
    } else {
      stopTypewriter()
    }
  }, props.typewriterSpeed)
}

function stopTypewriter() {
  if (typewriterInterval) {
    clearInterval(typewriterInterval)
    typewriterInterval = null
  }
  isTyping.value = false
  emit('typingEnd')
}

function skipTypewriter() {
  stopTypewriter()
  displayedText.value = props.message
}

function hideBubble() {
  showBubble.value = false
  emit('close')
}

function handleClick() {
  if (isTyping.value) {
    skipTypewriter()
  } else {
    emit('click')
  }
}

function handleClose() {
  hideBubble()
}

onUnmounted(() => {
  stopTypewriter()
})

defineExpose({
  show: () => { showBubble.value = true },
  hide: hideBubble,
  skip: skipTypewriter,
  isTyping
})
</script>

<template>
  <Transition name="bubble">
    <div 
      v-if="showBubble && displayedText"
      class="chat-bubble-container"
      :class="[
        `position-${props.position}`,
        `theme-${props.theme}`,
        `type-${props.type}`,
        `sender-${props.sender}`
      ]"
      @click="handleClick"
    >
      <!-- Avatar -->
      <div v-if="props.showAvatar" class="bubble-avatar">
        <span class="avatar-icon">{{ currentIcon }}</span>
      </div>
      
      <!-- Bubble content -->
      <div class="bubble-content">
        <!-- Header -->
        <div class="bubble-header">
          <span class="type-icon">{{ currentStyle.icon }}</span>
          <span class="sender-name">
            {{ props.sender === 'ai' ? 'AI Analyst' : props.sender === 'user' ? 'User' : 'System' }}
          </span>
          <button class="close-btn" @click.stop="handleClose">×</button>
        </div>
        
        <!-- Message -->
        <div class="bubble-message">
          <span class="message-text">{{ displayedText }}</span>
          <span v-if="isTyping" class="typing-cursor">|</span>
        </div>
        
        <!-- Footer -->
        <div class="bubble-footer">
          <span class="timestamp">{{ new Date().toLocaleTimeString() }}</span>
          <span v-if="isTyping" class="typing-indicator">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </span>
          <span v-else-if="props.typing" class="skip-hint">Click to skip</span>
        </div>
      </div>
      
      <!-- Decorations -->
      <div class="bubble-decoration top-left">✧</div>
      <div class="bubble-decoration top-right">✧</div>
      <div class="bubble-decoration bottom-left">✧</div>
      <div class="bubble-decoration bottom-right">✧</div>
    </div>
  </Transition>
</template>

<style scoped>
.chat-bubble-container {
  position: relative;
  display: flex;
  gap: 10px;
  max-width: 400px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 15px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  cursor: pointer;
  animation: bubble-appear 0.3s ease-out;
}

@keyframes bubble-appear {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Themes */
.theme-glass {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.theme-dark {
  background: rgba(30, 30, 30, 0.95);
  color: white;
}

.theme-light {
  background: white;
  border: 1px solid #e8e8e8;
}

/* Type styles */
.type-warning { border-left: 4px solid #faad14; }
.type-success { border-left: 4px solid #52c41a; }
.type-error { border-left: 4px solid #ff4d4f; }
.type-analysis { border-left: 4px solid #1890ff; }

/* Avatar */
.bubble-avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #7DD3FC, #38BDF8);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(56, 189, 248, 0.3);
}

.avatar-icon {
  font-size: 20px;
}

/* Content */
.bubble-content {
  flex: 1;
  min-width: 0;
}

.bubble-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.type-icon {
  font-size: 14px;
}

.sender-name {
  flex: 1;
  font-weight: 600;
  font-size: 12px;
  color: #666;
}

.theme-dark .sender-name {
  color: #aaa;
}

.close-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #999;
  font-size: 16px;
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #333;
}

/* Message */
.bubble-message {
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.message-text {
  color: #333;
}

.theme-dark .message-text {
  color: #eee;
}

.typing-cursor {
  animation: blink 0.7s infinite;
  color: #1890ff;
  font-weight: bold;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Footer */
.bubble-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  font-size: 11px;
  color: #999;
}

.typing-indicator {
  display: flex;
  gap: 3px;
}

.typing-indicator .dot {
  width: 4px;
  height: 4px;
  background: #1890ff;
  border-radius: 50%;
  animation: typing-bounce 0.6s infinite;
}

.typing-indicator .dot:nth-child(2) { animation-delay: 0.1s; }
.typing-indicator .dot:nth-child(3) { animation-delay: 0.2s; }

@keyframes typing-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.skip-hint {
  color: #1890ff;
  font-size: 10px;
}

/* Decorations */
.bubble-decoration {
  position: absolute;
  font-size: 8px;
  color: #FFD700;
  opacity: 0.5;
}

.bubble-decoration.top-left { top: 5px; left: 5px; }
.bubble-decoration.top-right { top: 5px; right: 5px; }
.bubble-decoration.bottom-left { bottom: 5px; left: 5px; }
.bubble-decoration.bottom-right { bottom: 5px; right: 5px; }

/* Positions */
.position-top {
  transform-origin: bottom center;
}

.position-bottom {
  transform-origin: top center;
}

/* Transitions */
.bubble-enter-active {
  transition: all 0.3s ease;
}

.bubble-leave-active {
  transition: all 0.2s ease;
}

.bubble-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.9);
}

.bubble-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.9);
}
</style>
