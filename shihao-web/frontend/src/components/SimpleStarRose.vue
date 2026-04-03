<template>
  <canvas 
    ref="canvasRef" 
    class="star-rose-canvas"
    :width="canvasWidth"
    :height="canvasHeight"
  ></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref(null)
const canvasWidth = ref(window.innerWidth)
const canvasHeight = ref(window.innerHeight)

let animationId = null
let ctx = null
let particles = []
let roses = []

// Initialize particles
function initParticles() {
  particles = []
  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * canvasWidth.value,
      y: Math.random() * canvasHeight.value,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.02 + 0.005,
      phase: Math.random() * Math.PI * 2,
      color: getStarColor()
    })
  }
}

function getStarColor() {
  const colors = [
    [255, 255, 255],  // white
    [255, 200, 200],  // pink
    [200, 220, 255],  // blue
    [255, 220, 180],  // orange
    [220, 255, 220],  // green
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// Initialize roses
function initRoses() {
  roses = []
  for (let i = 0; i < 4; i++) {
    roses.push({
      x: Math.random() * canvasWidth.value,
      y: Math.random() * canvasHeight.value,
      size: Math.random() * 30 + 20,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.005,
      phase: Math.random() * Math.PI * 2,
      color: getRoseColor()
    })
  }
}

function getRoseColor() {
  const colors = [
    [255, 100, 100],  // red
    [255, 150, 150],  // light red
    [255, 180, 200],  // pink
    [255, 120, 120],  // coral
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// Rose pixel pattern
const rosePattern = [
  [0, 0, 1, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 0, 0, 0]
]

function draw() {
  if (!ctx) return
  
  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
  
  // Draw particles (stars)
  particles.forEach(p => {
    p.phase += p.speed
    const alpha = 0.3 + Math.sin(p.phase) * 0.5
    
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = `rgb(${p.color[0]}, ${p.color[1]}, ${p.color[2]})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })
  
  // Draw roses
  roses.forEach(r => {
    r.phase += 0.01
    r.rotation += r.rotSpeed
    
    const pulse = 0.8 + Math.sin(r.phase) * 0.2
    const size = r.size * pulse
    const pixelSize = size / 7
    
    ctx.save()
    ctx.translate(r.x, r.y)
    ctx.rotate(r.rotation)
    ctx.globalAlpha = 0.6 * pulse
    ctx.fillStyle = `rgb(${r.color[0]}, ${r.color[1]}, ${r.color[2]})`
    
    // Draw pixelated rose
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (rosePattern[i][j]) {
          const x = (j - 3.5) * pixelSize
          const y = (i - 3.5) * pixelSize
          ctx.fillRect(x, y, pixelSize * 0.8, pixelSize * 0.8)
        }
      }
    }
    ctx.restore()
  })
  
  animationId = requestAnimationFrame(draw)
}

function handleResize() {
  canvasWidth.value = window.innerWidth
  canvasHeight.value = window.innerHeight
  initParticles()
  initRoses()
}

onMounted(() => {
  if (canvasRef.value) {
    ctx = canvasRef.value.getContext('2d')
    initParticles()
    initRoses()
    draw()
  }
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.star-rose-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.8;
}
</style>