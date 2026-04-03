<template>
  <canvas 
    ref="canvasRef" 
    class="heart-canvas"
  ></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref(null)
let animationId = null
let ctx = null
let particles = []
let time = 0

// Heart shape using parametric equations
// x = 16sin³(t)
// // y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
function heartX(t) {
  return 16 * Math.pow(Math.sin(t), 3)
}

function heartY(t) {
  return -(
    13 * Math.cos(t) - 
    5 * Math.cos(2 * t) - 
    2 * Math.cos(3 * t) - 
    Math.cos(4 * t)
  )
}

// Particle class
class Particle {
  constructor(canvas) {
    this.canvas = canvas
    this.reset()
  }

  reset() {
    const centerX = this.canvas.width / 2
    const centerY = this.canvas.height / 2 - 30
    const scale = Math.min(this.canvas.width, this.canvas.height) / 35
    
    // Random point on heart curve
    const t = Math.random() * Math.PI * 2
    const baseX = heartX(t) * scale + centerX
    const baseY = heartY(t) * scale + centerY
    
    // Add scatter
    const scatter = Math.random() * 30
    const angle = Math.random() * Math.PI * 2
    
    this.x = baseX + Math.cos(angle) * scatter
    this.y = baseY + Math.sin(angle) * scatter
    this.baseX = baseX
    this.baseY = baseY
    
    this.size = Math.random() * 3 + 1
    this.speed = Math.random() * 0.02 + 0.01
    this.phase = Math.random() * Math.PI * 2
    this.life = 1
    this.decay = Math.random() * 0.003 + 0.001
    
    // Color - red/pink gradient
    const hue = Math.random() * 30 + 340 // 340-370 (red to pink)
    const lightness = Math.random() * 30 + 50
    this.color = `hsla(${hue % 360}, 100%, ${lightness}%,`
  }

  update() {
    this.phase += this.speed
    
    // Floating motion
    this.x = this.baseX + Math.sin(this.phase) * 10
    this.y = this.baseY + Math.cos(this.phase * 0.7) * 8 - (1 - this.life) * 50
    
    this.life -= this.decay
    
    if (this.life <= 0) {
      this.reset()
    }
  }

  draw(ctx) {
    ctx.save()
    ctx.fillStyle = this.color + this.life + ')'
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// Initialize
function init() {
  const canvas = canvasRef.value
  if (!canvas) return
  
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  ctx = canvas.getContext('2d')
  
  // Create particles
  particles = []
  for (let i = 0; i < 300; i++) {
    particles.push(new Particle(canvas))
  }
  
  animate()
}

// Animation loop
function animate() {
  if (!ctx || !canvasRef.value) return
  
  time += 0.01
  
  // Semi-transparent clear for trail effect
  ctx.fillStyle = 'rgba(15, 23, 42, 0.1)'
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  
  // Draw heart outline glow
  drawHeartGlow()
  
  // Update and draw particles
  particles.forEach(p => {
    p.update()
    p.draw(ctx)
  })
  
  animationId = requestAnimationFrame(animate)
}

function drawHeartGlow() {
  const canvas = canvasRef.value
  const centerX = canvas.width / 2
  const centerY = canvas.height / 2 - 30
  const scale = Math.min(canvas.width, canvas.height) / 35
  const pulse = Math.sin(time * 2) * 0.2 + 0.8
  
  ctx.save()
  ctx.strokeStyle = `rgba(255, 100, 150, ${0.3 * pulse})`
  ctx.lineWidth = 2
  ctx.shadowBlur = 20
  ctx.shadowColor = 'rgba(255, 100, 150, 0.5)'
  
  ctx.beginPath()
  for (let t = 0; t <= Math.PI * 2; t += 0.01) {
    const x = heartX(t) * scale + centerX
    const y = heartY(t) * scale + centerY
    if (t === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
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
.heart-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 9999;
  background: transparent;
}
</style>