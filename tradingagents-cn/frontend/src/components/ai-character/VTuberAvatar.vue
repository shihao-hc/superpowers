<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

export interface VTuberAvatarProps {
  name?: string
  character?: 'cat' | 'fox' | 'angel' | 'custom'
  theme?: 'light' | 'dark' | 'ocean' | 'starlight'
  size?: 'small' | 'medium' | 'large' | 'full'
  status?: 'idle' | 'thinking' | 'speaking' | 'analyzing' | 'excited' | 'concerned'
  expression?: 'neutral' | 'happy' | 'wink' | 'blush' | 'surprised' | 'sleepy' | 'angry'
  showCompanion?: boolean
  companionType?: 'cat' | 'star' | 'crystal'
  animated?: boolean
  enablePhysics?: boolean
}

const props = withDefaults(defineProps<VTuberAvatarProps>(), {
  name: 'AI Analyst',
  character: 'cat',
  theme: 'ocean',
  size: 'large',
  status: 'idle',
  expression: 'neutral',
  showCompanion: true,
  companionType: 'cat',
  animated: true,
  enablePhysics: true
})

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'statusChange', status: string): void
  (e: 'speechStart', text: string): void
  (e: 'speechEnd'): void
}>()

const avatarRef = ref<HTMLElement | null>(null)
const isSpeaking = ref(false)
const currentExpression = ref(props.expression)
const speechText = ref('')
const showSpeechBubble = ref(false)
const mousePosition = ref({ x: 0, y: 0 })
const headTilt = ref(0)
const blinkState = ref(false)
const breathPhase = ref(0)
const earWiggle = ref(false)

// Theme colors
const themes = {
  light: {
    primary: '#FFB7C5',
    secondary: '#FFE4E8',
    accent: '#FF8FAB',
    glow: 'rgba(255, 183, 197, 0.5)'
  },
  dark: {
    primary: '#8B5CF6',
    secondary: '#C4B5FD',
    accent: '#A78BFA',
    glow: 'rgba(139, 92, 246, 0.5)'
  },
  ocean: {
    primary: '#7DD3FC',
    secondary: '#BAE6FD',
    accent: '#38BDF8',
    glow: 'rgba(125, 211, 252, 0.5)'
  },
  starlight: {
    primary: '#FCD34D',
    secondary: '#FEF3C7',
    accent: '#FBBF24',
    glow: 'rgba(252, 211, 77, 0.5)'
  }
}

const currentTheme = computed(() => themes[props.theme])

// Character styles based on type
const characterStyles = {
  cat: { ears: 'pointed', tail: true, whiskers: true },
  fox: { ears: 'pointed', tail: 'fluffy', whiskers: true },
  angel: { ears: 'human', wings: true, halo: true },
  custom: { ears: 'pointed', tail: true, whiskers: false }
}

const currentCharacter = computed(() => characterStyles[props.character])

// Expression configurations
const expressions = {
  neutral: {
    eyes: { left: '◕', right: '◕', y: 0, scale: 1 },
    mouth: '‿',
    blush: false,
    sparkle: false
  },
  happy: {
    eyes: { left: '◠', right: '◠', y: 0, scale: 1.1 },
    mouth: '◡',
    blush: true,
    sparkle: true
  },
  wink: {
    eyes: { left: '‿', right: '◕', y: 0, scale: 1 },
    mouth: '◡',
    blush: true,
    sparkle: false
  },
  blush: {
    eyes: { left: '◕', right: '◕', y: 2, scale: 0.9 },
    mouth: '‿',
    blush: true,
    sparkle: true
  },
  surprised: {
    eyes: { left: '◉', right: '◉', y: -2, scale: 1.3 },
    mouth: '○',
    blush: false,
    sparkle: false
  },
  sleepy: {
    eyes: { left: '−', right: '−', y: 3, scale: 1 },
    mouth: '‿',
    blush: false,
    sparkle: false
  },
  angry: {
    eyes: { left: '▼', right: '▼', y: -1, scale: 0.9 },
    mouth: '︵',
    blush: false,
    sparkle: false
  }
}

const currentFace = computed(() => expressions[currentExpression.value] || expressions.neutral)

// Status-based expressions
watch(() => props.status, (newStatus) => {
  const statusExpressionMap: Record<string, keyof typeof expressions> = {
    'idle': 'neutral',
    'thinking': 'sleepy',
    'speaking': 'happy',
    'analyzing': 'surprised',
    'excited': 'happy',
    'concerned': 'angry'
  }
  
  if (statusExpressionMap[newStatus]) {
    currentExpression.value = statusExpressionMap[newStatus]
  }
  
  isSpeaking.value = newStatus === 'speaking'
  emit('statusChange', newStatus)
})

watch(() => props.expression, (newExpr) => {
  currentExpression.value = newExpr
})

// Physics simulation for hair/ears
let animationFrameId: number | null = null

function startPhysicsLoop() {
  if (!props.enablePhysics || !props.animated) return
  
  let time = 0
  const animate = () => {
    time += 0.02
    
    // Breathing animation
    breathPhase.value = Math.sin(time * 2) * 3
    
    // Head tilt based on mouse
    if (props.enablePhysics) {
      headTilt.value = mousePosition.value.x * 5
    }
    
    // Blinking
    if (Math.random() < 0.005) {
      blinkState.value = true
      setTimeout(() => { blinkState.value = false }, 150)
    }
    
    animationFrameId = requestAnimationFrame(animate)
  }
  animate()
}

function stopPhysicsLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

// Mouse tracking for physics
function handleMouseMove(e: MouseEvent) {
  if (!avatarRef.value || !props.enablePhysics) return
  
  const rect = avatarRef.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  
  mousePosition.value = {
    x: (e.clientX - centerX) / rect.width,
    y: (e.clientY - centerY) / rect.height
  }
}

// Speech functions
function speak(text: string, duration?: number) {
  speechText.value = text
  showSpeechBubble.value = true
  isSpeaking.value = true
  currentExpression.value = 'happy'
  earWiggle.value = true
  
  emit('speechStart', text)
  
  const autoHideDuration = duration || Math.max(2000, text.length * 80)
  
  setTimeout(() => {
    showSpeechBubble.value = false
    isSpeaking.value = false
    earWiggle.value = false
    currentExpression.value = 'neutral'
    emit('speechEnd')
  }, autoHideDuration)
}

function stopSpeaking() {
  showSpeechBubble.value = false
  isSpeaking.value = false
  earWiggle.value = false
  currentExpression.value = 'neutral'
}

function setExpression(expr: keyof typeof expressions) {
  currentExpression.value = expr
}

// Click handler
function handleClick() {
  emit('click')
  // Add a little bounce animation
  earWiggle.value = true
  setTimeout(() => { earWiggle.value = false }, 300)
}

onMounted(() => {
  startPhysicsLoop()
  window.addEventListener('mousemove', handleMouseMove)
})

onUnmounted(() => {
  stopPhysicsLoop()
  window.removeEventListener('mousemove', handleMouseMove)
})

defineExpose({
  speak,
  stopSpeaking,
  setExpression,
  isSpeaking,
  currentExpression
})
</script>

<template>
  <div 
    ref="avatarRef"
    class="vtuber-avatar"
    :class="[
      `size-${props.size}`,
      `theme-${props.theme}`,
      `character-${props.character}`,
      { 
        'is-speaking': isSpeaking,
        'is-animated': props.animated,
        'physics-enabled': props.enablePhysics
      }
    ]"
    @click="handleClick"
  >
    <!-- Background glow effect -->
    <div class="avatar-glow" :style="{ background: currentTheme.glow }"></div>
    
    <!-- Main avatar container -->
    <div class="avatar-container" :style="{ transform: `translateX(${headTilt}px) rotate(${headTilt * 0.5}deg)` }">
      
      <!-- Hair back layer -->
      <div class="hair-back">
        <div class="hair-strand left-1"></div>
        <div class="hair-strand left-2"></div>
        <div class="hair-strand right-1"></div>
        <div class="hair-strand right-2"></div>
      </div>
      
      <!-- Cat ears (if character is cat/fox) -->
      <div v-if="currentCharacter.ears === 'pointed'" class="ears">
        <div class="ear left" :class="{ 'wiggle': earWiggle }">
          <div class="ear-inner"></div>
          <div class="ear-star">✦</div>
        </div>
        <div class="ear right" :class="{ 'wiggle': earWiggle }">
          <div class="ear-inner"></div>
          <div class="ear-star">✦</div>
        </div>
      </div>
      
      <!-- Angel halo -->
      <div v-if="currentCharacter.halo" class="halo"></div>
      
      <!-- Face -->
      <div class="face" :style="{ transform: `translateY(${breathPhase}px)` }">
        
        <!-- Hair front layer -->
        <div class="hair-front">
          <div class="bangs left"></div>
          <div class="bangs center"></div>
          <div class="bangs right"></div>
        </div>
        
        <!-- Eyes -->
        <div class="eyes" :class="{ 'blinking': blinkState }">
          <div class="eye left" :style="{ transform: `translateY(${currentFace.eyes.y}px) scale(${currentFace.eyes.scale})` }">
            <span class="eye-shape">{{ currentFace.eyes.left }}</span>
            <div v-if="currentFace.sparkle" class="sparkle">✧</div>
          </div>
          <div class="eye right" :style="{ transform: `translateY(${currentFace.eyes.y}px) scale(${currentFace.eyes.scale})` }">
            <span class="eye-shape">{{ currentFace.eyes.right }}</span>
            <div v-if="currentFace.sparkle" class="sparkle">✧</div>
          </div>
        </div>
        
        <!-- Blush -->
        <div v-if="currentFace.blush" class="blush">
          <div class="blush-mark left"></div>
          <div class="blush-mark right"></div>
        </div>
        
        <!-- Nose -->
        <div class="nose">•</div>
        
        <!-- Mouth -->
        <div class="mouth" :class="{ 'speaking': isSpeaking }">
          {{ currentFace.mouth }}
        </div>
        
        <!-- Angel wings -->
        <div v-if="currentCharacter.wings" class="wings">
          <div class="wing left"></div>
          <div class="wing right"></div>
        </div>
      </div>
      
      <!-- Outfit/Body -->
      <div class="outfit" :style="{ background: `linear-gradient(180deg, ${currentTheme.primary}, ${currentTheme.secondary})` }">
        <div class="collar">
          <div class="gem" :style="{ background: currentTheme.accent }"></div>
        </div>
      </div>
      
      <!-- Tail (if applicable) -->
      <div v-if="currentCharacter.tail" class="tail" :class="{ 'fluffy': currentCharacter.tail === 'fluffy' }">
        <div class="tail-tip"></div>
      </div>
      
      <!-- Companion -->
      <div v-if="props.showCompanion" class="companion" :class="`companion-${props.companionType}`">
        <div v-if="props.companionType === 'cat'" class="companion-cat">
          <div class="companion-body">🐱</div>
        </div>
        <div v-else-if="props.companionType === 'star'" class="companion-star">⭐</div>
        <div v-else class="companion-crystal">💎</div>
      </div>
    </div>
    
    <!-- Speech bubble -->
    <Transition name="bubble">
      <div v-if="showSpeechBubble" class="speech-bubble">
        <div class="bubble-content">
          {{ speechText }}
        </div>
        <div class="bubble-tail"></div>
      </div>
    </Transition>
    
    <!-- Status indicator -->
    <div class="status-badge" :class="`status-${props.status}`">
      <span class="status-dot"></span>
      <span class="status-text">{{ props.status }}</span>
    </div>
    
    <!-- Name plate -->
    <div class="name-plate">
      <span class="name">{{ props.name }}</span>
      <div class="name-decoration">✧</div>
    </div>
  </div>
</template>

<style scoped>
.vtuber-avatar {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

/* Sizes */
.size-small { --avatar-scale: 0.5; --avatar-size: 120px; }
.size-medium { --avatar-scale: 0.75; --avatar-size: 200px; }
.size-large { --avatar-scale: 1; --avatar-size: 300px; }
.size-full { --avatar-scale: 1.2; --avatar-size: 400px; }

/* Glow effect */
.avatar-glow {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.6;
  z-index: -1;
  transition: all 0.3s ease;
}

.is-speaking .avatar-glow {
  animation: glow-pulse 1s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

/* Avatar container */
.avatar-container {
  position: relative;
  width: var(--avatar-size);
  height: var(--avatar-size);
  transition: transform 0.1s ease-out;
}

/* Hair */
.hair-back {
  position: absolute;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.hair-strand {
  position: absolute;
  width: 30%;
  height: 70%;
  background: linear-gradient(180deg, #FFE4B5 0%, #FFDAB9 100%);
  border-radius: 50% 50% 30% 30%;
}

.hair-strand.left-1 { left: -5%; top: 20%; transform: rotate(-15deg); }
.hair-strand.left-2 { left: 0%; top: 35%; transform: rotate(-25deg); height: 80%; }
.hair-strand.right-1 { right: -5%; top: 20%; transform: rotate(15deg); }
.hair-strand.right-2 { right: 0%; top: 35%; transform: rotate(25deg); height: 80%; }

.is-animated .hair-strand {
  animation: hair-sway 4s ease-in-out infinite;
}

@keyframes hair-sway {
  0%, 100% { transform: rotate(var(--rotation, 0deg)); }
  50% { transform: rotate(calc(var(--rotation, 0deg) + 5deg)); }
}

/* Ears */
.ears {
  position: absolute;
  top: -15%;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 25%;
  z-index: 10;
}

.ear {
  width: 35%;
  height: 50%;
  background: linear-gradient(180deg, #FFE4B5 0%, #FFDAB9 100%);
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
  position: relative;
  transition: transform 0.2s ease;
}

.ear.left { transform: rotate(-15deg); }
.ear.right { transform: rotate(15deg); }

.ear.wiggle.left { animation: ear-wiggle-left 0.3s ease-in-out; }
.ear.wiggle.right { animation: ear-wiggle-right 0.3s ease-in-out; }

@keyframes ear-wiggle-left {
  0%, 100% { transform: rotate(-15deg); }
  50% { transform: rotate(-25deg); }
}

@keyframes ear-wiggle-right {
  0%, 100% { transform: rotate(15deg); }
  50% { transform: rotate(25deg); }
}

.ear-inner {
  position: absolute;
  top: 30%;
  left: 25%;
  width: 50%;
  height: 50%;
  background: #FFB7C5;
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
}

.ear-star {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #FFD700;
  text-shadow: 0 0 5px #FFD700;
}

/* Halo */
.halo {
  position: absolute;
  top: -10%;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 15%;
  border: 3px solid #FFD700;
  border-radius: 50%;
  box-shadow: 0 0 15px #FFD700;
  animation: halo-float 3s ease-in-out infinite;
}

@keyframes halo-float {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(-5px); }
}

/* Face */
.face {
  position: absolute;
  width: 100%;
  height: 70%;
  top: 15%;
  background: linear-gradient(180deg, #FFF5EE 0%, #FFEEE4 100%);
  border-radius: 45% 45% 40% 40%;
  z-index: 5;
  transition: transform 0.1s ease;
}

/* Hair front */
.hair-front {
  position: absolute;
  width: 100%;
  height: 40%;
  top: -5%;
  z-index: 1;
}

.bangs {
  position: absolute;
  background: linear-gradient(180deg, #FFE4B5 0%, #FFDAB9 100%);
}

.bangs.left { left: 10%; top: 20%; width: 25%; height: 80%; border-radius: 50%; transform: rotate(-20deg); }
.bangs.center { left: 35%; top: 0%; width: 30%; height: 90%; border-radius: 50% 50% 30% 30%; }
.bangs.right { right: 10%; top: 20%; width: 25%; height: 80%; border-radius: 50%; transform: rotate(20deg); }

/* Eyes */
.eyes {
  position: absolute;
  top: 35%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 20%;
  z-index: 2;
}

.eye {
  width: 25%;
  height: 30%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: transform 0.1s ease;
}

.eye-shape {
  font-size: calc(var(--avatar-size) * 0.12);
  color: #4A90D9;
  text-shadow: 0 0 10px rgba(74, 144, 217, 0.5);
}

.blinking .eye-shape {
  transform: scaleY(0.1);
}

.sparkle {
  position: absolute;
  top: 10%;
  right: 10%;
  font-size: 10px;
  color: #FFD700;
  animation: sparkle-twinkle 0.5s ease-in-out infinite;
}

@keyframes sparkle-twinkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

/* Blush */
.blush {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  display: flex;
  justify-content: space-between;
}

.blush-mark {
  width: 20%;
  height: 8px;
  background: rgba(255, 182, 193, 0.6);
  border-radius: 50%;
  filter: blur(3px);
}

/* Nose */
.nose {
  position: absolute;
  top: 55%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 8px;
  color: #D4A574;
  z-index: 2;
}

/* Mouth */
.mouth {
  position: absolute;
  top: 62%;
  left: 50%;
  transform: translateX(-50%);
  font-size: calc(var(--avatar-size) * 0.06);
  color: #FF8FAB;
  z-index: 2;
  transition: all 0.1s ease;
}

.mouth.speaking {
  animation: mouth-move 0.2s ease-in-out infinite alternate;
}

@keyframes mouth-move {
  0% { transform: translateX(-50%) scaleY(0.8); }
  100% { transform: translateX(-50%) scaleY(1.2); }
}

/* Wings */
.wings {
  position: absolute;
  top: 60%;
  width: 120%;
  left: -10%;
  display: flex;
  justify-content: space-between;
  z-index: 0;
}

.wing {
  width: 25%;
  height: 40%;
  background: linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(200,200,255,0.6) 100%);
  border-radius: 50% 50% 20% 20%;
  animation: wing-flap 2s ease-in-out infinite;
}

.wing.left { transform: rotate(-20deg); }
.wing.right { transform: rotate(20deg); animation-delay: 0.5s; }

@keyframes wing-flap {
  0%, 100% { transform: rotate(var(--rotation, 0deg)) translateY(0); }
  50% { transform: rotate(var(--rotation, 0deg)) translateY(-5px); }
}

/* Outfit */
.outfit {
  position: absolute;
  width: 80%;
  height: 25%;
  bottom: 0;
  left: 10%;
  border-radius: 30% 30% 0 0;
  z-index: 1;
}

.collar {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  width: 40%;
  height: 30%;
  background: rgba(255,255,255,0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gem {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 10px currentColor;
  animation: gem-glow 2s ease-in-out infinite;
}

@keyframes gem-glow {
  0%, 100% { box-shadow: 0 0 5px currentColor; }
  50% { box-shadow: 0 0 15px currentColor; }
}

/* Tail */
.tail {
  position: absolute;
  bottom: 5%;
  right: -15%;
  width: 40%;
  height: 50%;
  background: linear-gradient(180deg, #FFE4B5 0%, #FFDAB9 100%);
  border-radius: 50% 80% 50% 80%;
  transform-origin: left center;
  animation: tail-wag 1.5s ease-in-out infinite;
}

.tail.fluffy { filter: blur(2px); }

@keyframes tail-wag {
  0%, 100% { transform: rotate(-10deg); }
  50% { transform: rotate(10deg); }
}

/* Companion */
.companion {
  position: absolute;
  top: 5%;
  right: 15%;
  z-index: 20;
  animation: companion-bounce 2s ease-in-out infinite;
}

@keyframes companion-bounce {
  0%, 100% { transform: translateY(0) rotate(-5deg); }
  50% { transform: translateY(-5px) rotate(5deg); }
}

.companion-cat {
  font-size: 24px;
}

/* Speech bubble */
.speech-bubble {
  position: absolute;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border-radius: 15px;
  padding: 10px 15px;
  max-width: 200px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  z-index: 30;
  animation: bubble-float 2s ease-in-out infinite;
}

@keyframes bubble-float {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(-5px); }
}

.bubble-content {
  font-size: 14px;
  color: #333;
  text-align: center;
}

.bubble-tail {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 10px solid white;
}

/* Status badge */
.status-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 10px;
  padding: 5px 12px;
  background: rgba(255,255,255,0.9);
  border-radius: 15px;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #8c8c8c;
}

.status-idle .status-dot { background: #8c8c8c; }
.status-thinking .status-dot { background: #1890ff; animation: pulse-dot 1s infinite; }
.status-speaking .status-dot { background: #52c41a; animation: pulse-dot 0.5s infinite; }
.status-analyzing .status-dot { background: #faad14; animation: pulse-dot 0.75s infinite; }
.status-excited .status-dot { background: #722ed1; animation: pulse-dot 0.5s infinite; }
.status-concerned .status-dot { background: #ff4d4f; animation: pulse-dot 1s infinite; }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

/* Name plate */
.name-plate {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
  padding: 5px 15px;
  background: linear-gradient(135deg, v-bind('currentTheme.primary'), v-bind('currentTheme.accent'));
  border-radius: 20px;
  color: white;
  font-weight: 600;
  font-size: 14px;
  box-shadow: 0 2px 10px v-bind('currentTheme.glow');
}

.name-decoration {
  animation: spin-slow 4s linear infinite;
}

@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Transitions */
.bubble-enter-active, .bubble-leave-active {
  transition: all 0.3s ease;
}

.bubble-enter-from, .bubble-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px) scale(0.9);
}
</style>
