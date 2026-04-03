<template>
  <div class="test-page">
    <h1>Canvas 测试页面</h1>
    <p>如果您能看到下面的红色圆形，说明Canvas工作正常</p>
    <canvas ref="testCanvas" width="400" height="400" class="test-canvas"></canvas>
    <div class="heart-section">
      <h2>心形动画</h2>
      <canvas ref="heartCanvas" width="500" height="500" class="heart-canvas"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const testCanvas = ref(null)
const heartCanvas = ref(null)
let heartAnimId = null

onMounted(() => {
  // Test canvas - draw a simple circle
  if (testCanvas.value) {
    const ctx = testCanvas.value.getContext('2d')
    
    // Draw background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, 400, 400)
    
    // Draw test circle
    ctx.fillStyle = '#ff6b6b'
    ctx.beginPath()
    ctx.arc(200, 200, 80, 0, Math.PI * 2)
    ctx.fill()
    
    // Draw text
    ctx.fillStyle = '#ffffff'
    ctx.font = '20px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Canvas 工作正常!', 200, 200)
  }
  
  // Heart animation
  if (heartCanvas.value) {
    startHeartAnimation()
  }
})

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

function startHeartAnimation() {
  const canvas = heartCanvas.value
  const ctx = canvas.getContext('2d')
  const centerX = canvas.width / 2
  const centerY = canvas.height / 2 + 20
  const scale = 12
  
  let particles = []
  let time = 0
  
  // Create particles
  for (let i = 0; i < 200; i++) {
    const t = Math.random() * Math.PI * 2
    const baseX = heartX(t) * scale + centerX
    const baseY = heartY(t) * scale + centerY
    const scatter = Math.random() * 20
    const angle = Math.random() * Math.PI * 2
    
    particles.push({
      x: baseX + Math.cos(angle) * scatter,
      y: baseY + Math.sin(angle) * scatter,
      baseX: baseX,
      baseY: baseY,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 0.02 + 0.01,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random() * 30 + 340
    })
  }
  
  function animate() {
    time += 0.01
    
    // Clear with semi-transparent background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Draw heart outline
    ctx.strokeStyle = 'rgba(255, 100, 150, 0.5)'
    ctx.lineWidth = 2
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
    
    // Update and draw particles
    particles.forEach(p => {
      p.phase += p.speed
      p.x = p.baseX + Math.sin(p.phase) * 8
      p.y = p.baseY + Math.cos(p.phase * 0.7) * 6
      
      ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, 0.8)`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    })
    
    heartAnimId = requestAnimationFrame(animate)
  }
  
  animate()
}
</script>

<style scoped>
.test-page {
  padding: 40px;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  min-height: 100vh;
  color: #fff;
}

h1 {
  text-align: center;
  margin-bottom: 20px;
}

p {
  text-align: center;
  color: #94a3b8;
  margin-bottom: 30px;
}

.test-canvas {
  display: block;
  margin: 0 auto 40px;
  border: 2px solid #0ea5e9;
  border-radius: 8px;
}

.heart-section {
  text-align: center;
}

.heart-section h2 {
  margin-bottom: 20px;
}

.heart-canvas {
  display: block;
  margin: 0 auto;
  border: 2px solid #ff6b6b;
  border-radius: 8px;
}
</style>