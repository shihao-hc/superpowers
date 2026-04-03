<template>
  <div class="star-rose-background" ref="containerRef">
    <canvas ref="canvasRef"></canvas>
    <div class="content-overlay">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const containerRef = ref(null)
const canvasRef = ref(null)
let animationId = null
let ctx = null
let stars = []
let roses = []
let particles = []

// Configuration
const config = {
  starCount: 150,
  roseCount: 5,
  particleCount: 50,
  colors: {
    star: ['#ffffff', '#ffe4e1', '#fff0f5', '#e6e6fa', '#f0f8ff'],
    rose: ['#ff6b6b', '#ee5a5a', '#ff8787', '#ffa8a8', '#ffc9c9'],
    particle: ['#ffd700', '#ffec8b', '#fff68f', '#ff69b4', '#ff1493']
  }
}

// Star class
class Star {
  constructor(canvas) {
    this.canvas = canvas
    this.reset()
  }

  reset() {
    this.x = Math.random() * this.canvas.width
    this.y = Math.random() * this.canvas.height
    this.size = Math.random() * 2 + 0.5
    this.twinkleSpeed = Math.random() * 0.02 + 0.01
    this.brightness = Math.random()
    this.maxBrightness = Math.random() * 0.5 + 0.5
    this.color = config.colors.star[Math.floor(Math.random() * config.colors.star.length)]
  }

  update() {
    this.brightness += this.twinkleSpeed
    if (this.brightness > this.maxBrightness || this.brightness < 0.1) {
      this.twinkleSpeed = -this.twinkleSpeed
    }
  }

  draw() {
    ctx.save()
    ctx.globalAlpha = this.brightness
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
    
    // Add glow effect
    if (this.size > 1.5) {
      ctx.globalAlpha = this.brightness * 0.3
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

// Rose class - Pixelated rose effect
class Rose {
  constructor(canvas) {
    this.canvas = canvas
    this.reset()
  }

  reset() {
    this.x = Math.random() * this.canvas.width
    this.y = Math.random() * this.canvas.height
    this.size = Math.random() * 30 + 20
    this.rotation = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() - 0.5) * 0.005
    this.pulsePhase = Math.random() * Math.PI * 2
    this.pulseSpeed = Math.random() * 0.02 + 0.01
    this.opacity = Math.random() * 0.3 + 0.1
    this.color = config.colors.rose[Math.floor(Math.random() * config.colors.rose.length)]
    this.pixels = this.generatePixelPattern()
  }

  generatePixelPattern() {
    // Generate a pixelated rose pattern
    const pattern = []
    const size = 7
    const roseShape = [
      [0, 0, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [0, 1, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 0, 0]
    ]
    
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (roseShape[i][j]) {
          pattern.push({
            x: (j - size / 2) * (this.size / size),
            y: (i - size / 2) * (this.size / size)
          })
        }
      }
    }
    return pattern
  }

  update() {
    this.rotation += this.rotationSpeed
    this.pulsePhase += this.pulseSpeed
  }

  draw() {
    const pulse = Math.sin(this.pulsePhase) * 0.2 + 0.8
    const currentSize = this.size * pulse
    
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.globalAlpha = this.opacity * pulse
    ctx.fillStyle = this.color
    
    // Draw pixelated rose
    const pixelSize = currentSize / 7
    this.pixels.forEach(pixel => {
      ctx.fillRect(
        pixel.x * pulse - pixelSize / 2,
        pixel.y * pulse - pixelSize / 2,
        pixelSize * 0.9,
        pixelSize * 0.9
      )
    })
    
    // Add glow
    ctx.globalAlpha = this.opacity * pulse * 0.3
    ctx.shadowBlur = 20
    ctx.shadowColor = this.color
    this.pixels.forEach(pixel => {
      ctx.fillRect(
        pixel.x * pulse - pixelSize / 2,
        pixel.y * pulse - pixelSize / 2,
        pixelSize * 0.9,
        pixelSize * 0.9
      )
    })
    
    ctx.restore()
  }
}

// Particle class - Shooting stars / sparkles
class Particle {
  constructor(canvas) {
    this.canvas = canvas
    this.reset()
  }

  reset() {
    this.x = Math.random() * this.canvas.width
    this.y = Math.random() * this.canvas.height
    this.vx = (Math.random() - 0.5) * 2
    this.vy = (Math.random() - 0.5) * 2 - 0.5
    this.size = Math.random() * 2 + 1
    this.life = 1
    this.decay = Math.random() * 0.01 + 0.005
    this.color = config.colors.particle[Math.floor(Math.random() * config.colors.particle.length)]
    this.trail = []
    this.maxTrail = Math.floor(Math.random() * 5) + 3
  }

  update() {
    // Store trail
    this.trail.push({ x: this.x, y: this.y })
    if (this.trail.length > this.maxTrail) {
      this.trail.shift()
    }
    
    this.x += this.vx
    this.y += this.vy
    this.life -= this.decay
    
    if (this.life <= 0 || this.y < 0 || this.y > this.canvas.height) {
      this.reset()
    }
  }

  draw() {
    ctx.save()
    
    // Draw trail
    this.trail.forEach((point, index) => {
      const alpha = (index / this.trail.length) * this.life * 0.5
      ctx.globalAlpha = alpha
      ctx.fillStyle = this.color
      ctx.beginPath()
      ctx.arc(point.x, point.y, this.size * (index / this.trail.length), 0, Math.PI * 2)
      ctx.fill()
    })
    
    // Draw main particle
    ctx.globalAlpha = this.life
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
    
    // Add sparkle
    ctx.globalAlpha = this.life * 0.5
    ctx.shadowBlur = 10
    ctx.shadowColor = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size * 1.5, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.restore()
  }
}

// Initialize
function init() {
  const canvas = canvasRef.value
  const container = containerRef.value
  
  if (!canvas || !container) return
  
  // Set canvas size
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight
  ctx = canvas.getContext('2d')
  
  // Create stars
  stars = []
  for (let i = 0; i < config.starCount; i++) {
    stars.push(new Star(canvas))
  }
  
  // Create roses
  roses = []
  for (let i = 0; i < config.roseCount; i++) {
    roses.push(new Rose(canvas))
  }
  
  // Create particles
  particles = []
  for (let i = 0; i < config.particleCount; i++) {
    particles.push(new Particle(canvas))
  }
  
  // Start animation
  animate()
}

// Animation loop
function animate() {
  if (!ctx || !canvasRef.value) return
  
  // Clear canvas with gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasRef.value.height)
  gradient.addColorStop(0, '#0a0a1a')
  gradient.addColorStop(0.5, '#0f0f2a')
  gradient.addColorStop(1, '#1a1a3a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  
  // Update and draw stars
  stars.forEach(star => {
    star.update()
    star.draw()
  })
  
  // Update and draw roses
  roses.forEach(rose => {
    rose.update()
    rose.draw()
  })
  
  // Update and draw particles
  particles.forEach(particle => {
    particle.update()
    particle.draw()
  })
  
  animationId = requestAnimationFrame(animate)
}

// Handle resize
function handleResize() {
  if (canvasRef.value && containerRef.value) {
    canvasRef.value.width = containerRef.value.clientWidth
    canvasRef.value.height = containerRef.value.clientHeight
  }
}

// Lifecycle
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
.star-rose-background {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
}

.star-rose-background canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.content-overlay {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  min-height: 100vh;
}
</style>