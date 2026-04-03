<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

export interface VoiceControlProps {
  enabled?: boolean
  autoPlay?: boolean
  voice?: string
  rate?: string
  volume?: string
}

const props = withDefaults(defineProps<VoiceControlProps>(), {
  enabled: true,
  autoPlay: false,
  voice: 'en-US-AriaNeural',
  rate: '+0%',
  volume: '+0%'
})

const emit = defineEmits<{
  (e: 'speechStart', text: string): void
  (e: 'speechEnd', text: string): void
  (e: 'error', error: Error): void
  (e: 'voiceChange', voice: string): void
}>()

const isPlaying = ref(false)
const currentText = ref('')
const availableVoices = ref<Record<string, string[]>>({
  'en-US': ['en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural'],
  'zh-CN': ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'],
  'ja-JP': ['ja-JP-NanamiNeural'],
})

const audioElement = ref<HTMLAudioElement | null>(null)
const currentAudioUrl = ref<string | null>(null)

const selectedVoice = ref(props.voice)
const speechRate = ref(props.rate)
const speechVolume = ref(props.volume)

watch(() => props.voice, (v) => { selectedVoice.value = v })
watch(() => props.rate, (r) => { speechRate.value = r })
watch(() => props.volume, (v) => { speechVolume.value = v })

async function speak(text: string, options?: { voice?: string; rate?: string; volume?: string }) {
  if (!props.enabled || !text.trim()) return

  try {
    stop()
    
    currentText.value = text
    isPlaying.value = true
    emit('speechStart', text)

    const response = await axios.post('/tts/synthesize', {
      text,
      voice: options?.voice || selectedVoice.value,
      rate: options?.rate || speechRate.value,
      volume: options?.volume || speechVolume.value,
      provider: 'edge'
    }, {
      responseType: 'blob',
      timeout: 30000
    })

    const blob = new Blob([response.data], { type: 'audio/mpeg' })
    currentAudioUrl.value = URL.createObjectURL(blob)
    
    audioElement.value = new Audio(currentAudioUrl.value)
    
    audioElement.value.onended = () => {
      isPlaying.value = false
      currentText.value = ''
      cleanup()
      emit('speechEnd', text)
    }

    audioElement.value.onerror = (e) => {
      isPlaying.value = false
      emit('error', new Error('Audio playback failed'))
    }

    await audioElement.value.play()

  } catch (error) {
    isPlaying.value = false
    emit('error', error as Error)
    console.error('TTS Error:', error)
  }
}

async function speakStream(text: string, options?: { voice?: string }) {
  if (!props.enabled || !text.trim()) return

  try {
    const params = new URLSearchParams({
      text,
      voice: options?.voice || selectedVoice.value,
      provider: 'edge'
    })

    const audio = new Audio(`/tts/synthesize/stream?${params}`)
    
    currentText.value = text
    isPlaying.value = true
    emit('speechStart', text)

    audio.onended = () => {
      isPlaying.value = false
      currentText.value = ''
      emit('speechEnd', text)
    }

    audio.onerror = () => {
      isPlaying.value = false
      emit('error', new Error('Stream playback failed'))
    }

    await audio.play()

  } catch (error) {
    isPlaying.value = false
    emit('error', error as Error)
  }
}

function stop() {
  if (audioElement.value) {
    audioElement.value.pause()
    audioElement.value.currentTime = 0
    audioElement.value = null
  }
  cleanup()
  isPlaying.value = false
  currentText.value = ''
}

function pause() {
  if (audioElement.value && !audioElement.value.paused) {
    audioElement.value.pause()
    isPlaying.value = false
  }
}

function resume() {
  if (audioElement.value && audioElement.value.paused) {
    audioElement.value.play()
    isPlaying.value = true
  }
}

function cleanup() {
  if (currentAudioUrl.value) {
    URL.revokeObjectURL(currentAudioUrl.value)
    currentAudioUrl.value = null
  }
}

function handleVoiceChange(voice: string) {
  selectedVoice.value = voice
  emit('voiceChange', voice)
}

onUnmounted(() => {
  stop()
})

defineExpose({
  speak,
  speakStream,
  stop,
  pause,
  resume,
  isPlaying
})
</script>

<template>
  <div class="voice-control">
    <div class="voice-header">
      <span class="voice-icon">🔊</span>
      <span class="voice-label">Voice</span>
      <el-switch 
        v-model="enabled" 
        size="small"
        @change="(val: boolean) => !val && stop()"
      />
    </div>

    <Transition name="fade">
      <div v-if="enabled" class="voice-settings">
        <div class="voice-selector">
          <label>Voice</label>
          <el-select 
            v-model="selectedVoice" 
            size="small"
            placeholder="Select voice"
            @change="handleVoiceChange"
          >
            <el-option-group label="English">
              <el-option 
                v-for="v in availableVoices['en-US']" 
                :key="v" 
                :label="v" 
                :value="v"
              />
            </el-option-group>
            <el-option-group label="中文">
              <el-option 
                v-for="v in availableVoices['zh-CN']" 
                :key="v" 
                :label="v" 
                :value="v"
              />
            </el-option-group>
            <el-option-group label="日本語">
              <el-option 
                v-for="v in availableVoices['ja-JP']" 
                :key="v" 
                :label="v" 
                :value="v"
              />
            </el-option-group>
          </el-select>
        </div>

        <div class="voice-rate">
          <label>Speed</label>
          <el-slider 
            v-model="speechRate" 
            :min="-50" 
            :max="100" 
            :step="10"
            :format-tooltip="(val: number) => `${val > 0 ? '+' : ''}${val}%`"
          />
        </div>

        <div class="voice-controls">
          <el-button 
            v-if="isPlaying" 
            size="small" 
            @click="stop"
          >
            ⏹ Stop
          </el-button>
          <el-button 
            v-else-if="currentText" 
            size="small" 
            @click="speak(currentText)"
          >
            🔊 Replay
          </el-button>
        </div>

        <div v-if="isPlaying && currentText" class="now-playing">
          <div class="waveform">
            <span v-for="i in 5" :key="i" class="bar" :style="{ animationDelay: `${i * 0.1}s` }"></span>
          </div>
          <span class="playing-text">{{ currentText.slice(0, 30) }}...</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.voice-control {
  background: white;
  border-radius: 8px;
  padding: 0.75rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.voice-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.voice-icon {
  font-size: 1.25rem;
}

.voice-label {
  flex: 1;
  font-weight: 600;
  font-size: 0.875rem;
}

.voice-settings {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.voice-selector,
.voice-rate {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.voice-selector label,
.voice-rate label {
  font-size: 0.75rem;
  color: #666;
  font-weight: 500;
}

.voice-controls {
  display: flex;
  gap: 0.5rem;
}

.now-playing {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #f5f5f5;
  border-radius: 6px;
}

.waveform {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 16px;
}

.bar {
  width: 3px;
  background: #1890ff;
  border-radius: 2px;
  animation: wave 0.5s ease-in-out infinite;
}

@keyframes wave {
  0%, 100% { height: 4px; }
  50% { height: 16px; }
}

.playing-text {
  font-size: 0.75rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
