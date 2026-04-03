<template>
  <div class="lightweight-bg">
    <canvas ref="canvasRef" class="bg-canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref(null)
let animationId = null
let ctx = null
let stars = []
let roses = []

// Lightweight configuration
const config = {
  starCount: 100,
  roseCount: 5
}

// Simple Star
class Star {
  constructor(w, h) {
    this.x = Math.random() * w
    this.y = Math.random() * h
    this.size = Math.random() * 2 + 0.5
    this.twinkle = Math.random() * 0.03 + 0.01
    this.brightness = Math.random() * 0.8 + 0.2
    this.phase = Math.random() * Math.PI * 2
    this.color = this.getRandomColor()
  }

  getRandomColor() {
    const colors = [
      'rgba(255, 255, 255,',      // white
      'rgba(255, 228, 225,',      // misty rose
      'rgba(255, 182, 193,',      // light pink
      'rgba(173, 216, 230,',      // light blue
      'rgba(255, 223, 186,',      // peach
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  update() {
    this.phase += this.twinkle
    this.brightness = 0.2 + Math.sin(this.phase) * 0.6
  }

  draw(ctx) {
    ctx.save()
    ctx.fillStyle = this.color + this.brightness + ')'
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
    
    // Glow effect for larger stars
    if (this.size > 1.2) {
      ctx.shadowBlur = 8
      ctx.shadowColor = this.color + '0.5)'
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.size * 0.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

// Pixel Rose
class PixelRose {
  constructor(w, h) {
    this.x = Math.random() * w
    this.y = Math.random() * h
    this.size = Math.random() * 25 + 15
    this.opacity = Math.random() * 0.4 + 0.1
    this.phase = Math.random() * Math.PI * 2
    this.speed = Math.random() * 0.015 + 0.005
    this.rotation = Math.random() * Math.PI * 2
    this.rotSpeed = (Math.random() - 0.5) * 0.004
    
    // Rose pixel pattern
    this.pattern = [
      [0,0,1,1,1,0,0],
      [0,1,1,1,1,1,0],
      [1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1],
      [0,1,1,1,1,1,0],
      [0,0,1,1,1,0,0],
      [0,0,0,1,0,0,0]
    ]
    
    this.color = this.getRandomColor()
  }

  getRandomColor() {
    const colors = [
      [255, 107, 107],  // coral
      [255, 182, 193],  // pink
      [255, 105, 180],  // hot pink
      [255, 160, 122],  // salmon
      [220, 20, 60],    // crimson
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  update() {
    this.phase += this.speed
    this.rotation += this.rotSpeed
  }

  draw(ctx) {
    const pulse = 0.7 + Math.sin(this.phase) * 0.3
    const size = this.size * pulse
    const pixelSize = size / 7
    const alpha = this.opacity * pulse
    
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    
    // Draw glow first
    ctx.shadowBlur = 15
    ctx.shadowColor = `rgba(${this.color[0]}, ${this.color[1]}, ${this.color[2]}, 0.3)`
    
    // Draw pixelated rose
    ctx.fillStyle = `rgba(${this.color[0]}, ${this.color[1]}, ${this.color[2]}, ${alpha})`
    
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (this.pattern[i][j]) {
          const x = (j - 3.5) * pixelSize
          const y = (i - 3.5) * pixelSize
          ctx.fillRect(x, y, pixelSize * 0.8, pixelSize * 0.8)
        }
      }
    }
    
    ctx.restore()
  }
}

function init() {
  const canvas = canvasRef.value
  if (!canvas) return
  
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  ctx = canvas.getContext('2d')
  
  stars = []
  for (let i = 0; i < config.starCount; i++) {
    stars.push(new Star(canvas.width, canvas.height))
  }
  
  roses = []
  for (let i = 0; i < config.roseCount; i++) {
    roses.push(new PixelRose(canvas.width, canvas.height))
  }
  
  animate()
}

function animate() {
  if (!ctx || !canvasRef.value) return
  
  // Clear canvas with transparency
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  
  // Draw stars
  stars.forEach(star => {
    star.update()
    star.draw(ctx)
  })
  
  // Draw roses
  roses.forEach(rose => {
    rose.update()
    rose.draw(ctx)
  })
  
  animationId = requestAnimationFrame(animate)
}

function handleResize() {
  if (canvasRef.value) {
    canvasRef.value.width = window.innerWidth
    canvasRef.value.height = window.innerHeight
  }
}

onMounted(() => {
  init()
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
.lightweight-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  background: transparent;
}

.bg-canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: transparent;
}
</style>