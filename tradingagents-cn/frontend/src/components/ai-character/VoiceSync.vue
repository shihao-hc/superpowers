<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import axios from 'axios'

export interface VoiceSyncProps {
  avatarRef?: any
  autoSync?: boolean
  voice?: string
  rate?: string
  showWaveform?: boolean
  enableLipSync?: boolean
}

const props = withDefaults(defineProps<VoiceSyncProps>(), {
  autoSync: true,
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: '+0%',
  showWaveform: true,
  enableLipSync: true
})

const emit = defineEmits<{
  (e: 'speechStart', text: string): void
  (e: 'speechEnd', text: string): void
  (e: 'expressionChange', expression: string): void
  (e: 'error', error: Error): void
}>()

const isPlaying = ref(false)
const currentText = ref('')
const audioContext = ref<AudioContext | null>(null)
const analyser = ref<AnalyserNode | null>(null)
const audioSource = ref<MediaElementAudioSourceNode | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const animationId = ref<number | null>(null)

// Waveform data
const waveformData = ref<number[]>(new Array(32).fill(0))
const averageVolume = ref(0)
const frequencyBands = ref({ low: 0, mid: 0, high: 0 })

// Lip sync phoneme mapping
const phonemeShapes: Record<string, string> = {
  'a': '○',
  'e': '―',
  'i': '‿',
  'o': '○',
  'u': '○',
  'm': '━',
  'b': '━',
  'p': '━',
  'f': '▽',
  'v': '▽',
  'th': '―',
  'default': '‿'
}

const currentPhoneme = ref('default')
const mouthShape = ref('‿')

// Expression triggers based on audio analysis
const expressionTriggers = {
  excitement: { threshold: 0.6, expression: 'happy' },
  question: { pattern: /\?/, expression: 'surprised' },
  exclamation: { pattern: /!/, expression: 'excited' },
  thinking: { pattern: /嗯|让我想想|考虑/, expression: 'sleepy' },
  warning: { pattern: /注意|小心|风险/, expression: 'concerned' }
}

async function speak(text: string, options?: { voice?: string; rate?: string }) {
  if (!text.trim()) return

  try {
    stop()
    
    currentText.value = text
    isPlaying.value = true
    
    // Determine expression from text
    if (props.autoSync && props.avatarRef) {
      const expression = detectExpressionFromText(text)
      if (expression) {
        props.avatarRef.setExpression(expression)
        emit('expressionChange', expression)
      }
      props.avatarRef.speak(text)
    }
    
    emit('speechStart', text)

    // Fetch audio from TTS API
    const response = await axios.post('/tts/synthesize', {
      text,
      voice: options?.voice || props.voice,
      rate: options?.rate || props.rate,
      provider: 'edge'
    }, {
      responseType: 'blob',
      timeout: 30000
    })

    const blob = new Blob([response.data], { type: 'audio/mpeg' })
    const audioUrl = URL.createObjectURL(blob)
    
    audioElement.value = new Audio(audioUrl)
    
    // Setup audio analysis
    await setupAudioAnalysis(audioElement.value)
    
    audioElement.value.onended = () => {
      handleSpeechEnd(text)
      URL.revokeObjectURL(audioUrl)
    }

    audioElement.value.onerror = (e) => {
      emit('error', new Error('Audio playback failed'))
      handleSpeechEnd(text)
    }

    await audioElement.value.play()
    
    // Start lip sync animation
    if (props.enableLipSync) {
      startLipSync()
    }

  } catch (error) {
    isPlaying.value = false
    emit('error', error as Error)
    console.error('TTS Error:', error)
  }
}

async function setupAudioAnalysis(audio: HTMLAudioElement) {
  if (!audioContext.value) {
    audioContext.value = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  
  if (!analyser.value) {
    analyser.value = audioContext.value.createAnalyser()
    analyser.value.fftSize = 64
    analyser.value.smoothingTimeConstant = 0.8
  }
  
  if (!audioSource.value) {
    audioSource.value = audioContext.value.createMediaElementSource(audio)
    audioSource.value.connect(analyser.value)
    analyser.value.connect(audioContext.value.destination)
  }
}

function startLipSync() {
  const dataArray = new Uint8Array(analyser.value!.frequencyBinCount)
  
  const animate = () => {
    if (!isPlaying.value || !analyser.value) {
      cancelAnimationFrame(animationId.value!)
      return
    }
    
    analyser.value.getByteFrequencyData(dataArray)
    
    // Calculate average volume
    const sum = dataArray.reduce((a, b) => a + b, 0)
    averageVolume.value = sum / dataArray.length / 255
    
    // Update waveform
    waveformData.value = Array.from(dataArray).slice(0, 32).map(v => v / 255)
    
    // Calculate frequency bands
    const third = Math.floor(dataArray.length / 3)
    frequencyBands.value = {
      low: average(dataArray.slice(0, third)),
      mid: average(dataArray.slice(third, third * 2)),
      high: average(dataArray.slice(third * 2))
    }
    
    // Update lip sync based on volume
    if (props.enableLipSync) {
      updateLipSync(averageVolume.value)
    }
    
    // Auto expression based on audio intensity
    if (props.autoSync && props.avatarRef && averageVolume.value > 0.5) {
      // High energy = happy/excited
      props.avatarRef.setExpression('happy')
    }
    
    animationId.value = requestAnimationFrame(animate)
  }
  
  animate()
}

function average(arr: Uint8Array | number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length / 255
}

function updateLipSync(volume: number) {
  if (volume < 0.1) {
    mouthShape.value = '‿' // Closed mouth
    currentPhoneme.value = 'silent'
  } else if (volume < 0.3) {
    mouthShape.value = '―' // Slightly open
    currentPhoneme.value = 'i'
  } else if (volume < 0.5) {
    mouthShape.value = '◡' // Medium open
    currentPhoneme.value = 'e'
  } else if (volume < 0.7) {
    mouthShape.value = '○' // Wide open
    currentPhoneme.value = 'a'
  } else {
    mouthShape.value = '◉' // Very wide
    currentPhoneme.value = 'o'
  }
}

function detectExpressionFromText(text: string): string | null {
  for (const [key, trigger] of Object.entries(expressionTriggers)) {
    if ('pattern' in trigger && trigger.pattern && trigger.pattern.test(text)) {
      return trigger.expression
    }
  }
  return null
}

function handleSpeechEnd(text: string) {
  isPlaying.value = false
  currentText.value = ''
  mouthShape.value = '‿'
  currentPhoneme.value = 'default'
  
  stopLipSync()
  
  if (props.avatarRef) {
    props.avatarRef.setExpression('neutral')
  }
  
  emit('speechEnd', text)
}

function stopLipSync() {
  if (animationId.value) {
    cancelAnimationFrame(animationId.value)
    animationId.value = null
  }
}

function stop() {
  if (audioElement.value) {
    audioElement.value.pause()
    audioElement.value.currentTime = 0
    audioElement.value = null
  }
  
  stopLipSync()
  
  isPlaying.value = false
  currentText.value = ''
  mouthShape.value = '‿'
  
  if (props.avatarRef) {
    props.avatarRef.setExpression('neutral')
  }
}

function pause() {
  if (audioElement.value && !audioElement.value.paused) {
    audioElement.value.pause()
    isPlaying.value = false
    stopLipSync()
  }
}

function resume() {
  if (audioElement.value && audioElement.value.paused) {
    audioElement.value.play()
    isPlaying.value = true
    if (props.enableLipSync) {
      startLipSync()
    }
  }
}

onUnmounted(() => {
  stop()
  if (audioContext.value) {
    audioContext.value.close()
  }
})

defineExpose({
  speak,
  stop,
  pause,
  resume,
  isPlaying,
  currentText,
  waveformData,
  averageVolume,
  mouthShape
})
</script>

<template>
  <div class="voice-sync" :class="{ 'is-playing': isPlaying }">
    <!-- Real-time waveform visualization -->
    <div v-if="props.showWaveform && isPlaying" class="waveform-container">
      <div class="waveform-bars">
        <div 
          v-for="(value, index) in waveformData" 
          :key="index"
          class="waveform-bar"
          :style="{ 
            height: `${value * 100}%`,
            animationDelay: `${index * 0.02}s`
          }"
        ></div>
      </div>
      
      <!-- Mouth visualization -->
      <div class="mouth-visual">
        <div class="mouth-shape">{{ mouthShape }}</div>
      </div>
    </div>
    
    <!-- Frequency bands (optional) -->
    <div v-if="isPlaying" class="frequency-bands">
      <div class="band low" :style="{ height: `${frequencyBands.low * 100}%` }">
        <span class="band-label">Bass</span>
      </div>
      <div class="band mid" :style="{ height: `${frequencyBands.mid * 100}%` }">
        <span class="band-label">Mid</span>
      </div>
      <div class="band high" :style="{ height: `${frequencyBands.high * 100}%` }">
        <span class="band-label">High</span>
      </div>
    </div>
    
    <!-- Volume meter -->
    <div v-if="isPlaying" class="volume-meter">
      <div class="meter-fill" :style="{ width: `${averageVolume * 100}%` }"></div>
    </div>
  </div>
</template>

<style scoped>
.voice-sync {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 10px;
}

/* Waveform */
.waveform-container {
  display: flex;
  align-items: center;
  gap: 15px;
}

.waveform-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 40px;
  padding: 5px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
}

.waveform-bar {
  width: 4px;
  min-height: 2px;
  background: linear-gradient(180deg, #7DD3FC, #38BDF8);
  border-radius: 2px;
  transition: height 0.05s ease;
  animation: bar-pulse 0.3s ease-in-out infinite alternate;
}

@keyframes bar-pulse {
  from { opacity: 0.7; }
  to { opacity: 1; }
}

/* Mouth visualization */
.mouth-visual {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.mouth-shape {
  font-size: 24px;
  color: #FF8FAB;
  animation: mouth-morph 0.1s ease;
}

@keyframes mouth-morph {
  from { transform: scale(0.9); }
  to { transform: scale(1); }
}

/* Frequency bands */
.frequency-bands {
  display: flex;
  gap: 8px;
  height: 30px;
  align-items: flex-end;
}

.band {
  width: 20px;
  border-radius: 4px 4px 0 0;
  transition: height 0.1s ease;
  position: relative;
}

.band.low { background: linear-gradient(180deg, #FF6B6B, #FF8E8E); }
.band.mid { background: linear-gradient(180deg, #4ECDC4, #6EDDD6); }
.band.high { background: linear-gradient(180deg, #FFE66D, #FFF09E); }

.band-label {
  position: absolute;
  bottom: -15px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 8px;
  color: #666;
  white-space: nowrap;
}

/* Volume meter */
.volume-meter {
  width: 100px;
  height: 6px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.meter-fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a, #faad14, #ff4d4f);
  border-radius: 3px;
  transition: width 0.05s ease;
}

/* Playing state */
.is-playing .voice-sync {
  animation: pulse-glow 1s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { filter: drop-shadow(0 0 5px rgba(125, 211, 252, 0.3)); }
  50% { filter: drop-shadow(0 0 15px rgba(125, 211, 252, 0.6)); }
}
</style>
