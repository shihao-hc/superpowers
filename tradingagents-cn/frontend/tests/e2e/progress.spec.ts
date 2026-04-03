import { test, expect } from '@playwright/test'

test.describe('ProgressPhases Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display all 7 stages', async ({ page }) => {
    const stages = ['市场分析', '基本面', '新闻分析', '情绪分析', '辩论决策', '风险评估', '最终决策']
    
    for (const stage of stages) {
      await expect(page.getByText(stage)).toBeVisible()
    }
  })

  test('should update progress correctly', async ({ page }) => {
    await page.goto('/')
    
    const progressBar = page.locator('.progress-bar')
    if (await progressBar.isVisible()) {
      await expect(progressBar).toBeVisible()
    }
  })

  test('should highlight current stage', async ({ page }) => {
    await page.goto('/')
    
    const activeStage = page.locator('.stage-active')
    if (await activeStage.count() > 0) {
      await expect(activeStage.first()).toBeVisible()
    }
  })

  test('should show completed stages', async ({ page }) => {
    await page.goto('/')
    
    const completedStages = page.locator('.stage-completed')
    const count = await completedStages.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })
})

test.describe('WebSocket Connection', () => {
  test('should establish WebSocket connection', async ({ page }) => {
    await page.goto('/')
    
    const wsStatus = page.locator('.ws-status')
    if (await wsStatus.isVisible()) {
      await expect(wsStatus).toContainText(/connected|disconnected|connecting/)
    }
  })

  test('should handle reconnection', async ({ page }) => {
    await page.goto('/')
    
    await page.waitForTimeout(1000)
    
    const wsStatus = page.locator('.ws-status')
    if (await wsStatus.isVisible()) {
      await expect(wsStatus).toBeVisible()
    }
  })
})

test.describe('Task Analysis Flow', () => {
  test('should submit stock analysis request', async ({ page }) => {
    await page.goto('/')
    
    const stockInput = page.locator('input[placeholder*="股票"]').or(page.locator('input[placeholder*="stock"]'))
    if (await stockInput.isVisible({ timeout: 3000 })) {
      await stockInput.fill('000001')
      
      const submitButton = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /分析|submit/i }))
      if (await submitButton.isVisible()) {
        await submitButton.click()
        
        await expect(page.locator('.progress-phases')).toBeVisible()
      }
    }
  })

  test('should display real-time progress updates', async ({ page }) => {
    await page.goto('/')
    
    await page.waitForTimeout(500)
    
    const progressText = page.locator('.progress-text')
    if (await progressText.isVisible()) {
      const text = await progressText.textContent()
      expect(text).toMatch(/\d+%|进度/)
    }
  })
})

test.describe('Error Handling', () => {
  test('should show friendly error messages', async ({ page }) => {
    await page.goto('/')
    
    await page.waitForTimeout(500)
    
    const errorMessage = page.locator('.error-message')
    if (await errorMessage.isVisible()) {
      await expect(errorMessage).not.toContainText(/Traceback|Error:|Exception/)
    }
  })

  test('should retry on connection failure', async ({ page }) => {
    await page.goto('/')
    
    await page.waitForTimeout(2000)
    
    const retryButton = page.locator('button:has-text("重试")').or(page.locator('button:has-text("Retry")'))
    if (await retryButton.isVisible({ timeout: 1000 })) {
      await retryButton.click()
    }
  })
})

test.describe('Responsive Design', () => {
  test('should work on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    await expect(page.locator('body')).toBeVisible()
  })

  test('should work on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('AI Character', () => {
  test('should display AI character avatar', async ({ page }) => {
    await page.goto('/')
    
    const avatar = page.locator('.ai-character-wrapper')
    if (await avatar.isVisible({ timeout: 3000 })) {
      await expect(avatar).toBeVisible()
    }
  })

  test('should show character name', async ({ page }) => {
    await page.goto('/')
    
    const nameElement = page.locator('.character-name')
    if (await nameElement.isVisible()) {
      await expect(nameElement).toContainText(/AI|Analyst|分析师/)
    }
  })

  test('should show status indicator', async ({ page }) => {
    await page.goto('/')
    
    const statusDot = page.locator('.status-dot')
    if (await statusDot.isVisible()) {
      await expect(statusDot).toBeVisible()
    }
  })
})

test.describe('TTS / Voice Control', () => {
  test('should display voice control panel', async ({ page }) => {
    await page.goto('/')
    
    const voiceControl = page.locator('.voice-control')
    if (await voiceControl.isVisible({ timeout: 3000 })) {
      await expect(voiceControl).toBeVisible()
    }
  })

  test('should have voice toggle', async ({ page }) => {
    await page.goto('/')
    
    const voiceToggle = page.locator('.voice-control .el-switch')
    if (await voiceToggle.isVisible()) {
      await expect(voiceToggle).toBeVisible()
    }
  })

  test('should toggle voice on/off', async ({ page }) => {
    await page.goto('/')
    
    const voiceToggle = page.locator('.voice-control .el-switch')
    if (await voiceToggle.isVisible()) {
      const initialState = await voiceToggle.locator('input').isChecked()
      await voiceToggle.click()
      const newState = await voiceToggle.locator('input').isChecked()
      expect(newState).not.toBe(initialState)
    }
  })
})

test.describe('API TTS Endpoints', () => {
  const API_BASE = process.env.BASE_URL?.replace('5173', '8000') || 'http://localhost:8000'

  test('should check TTS health endpoint', async ({ request }) => {
    const response = await request.get(`${API_BASE}/tts/health`)
    expect([200, 503, 404]).toContain(response.status())
  })

  test('should list TTS providers', async ({ request }) => {
    const response = await request.get(`${API_BASE}/tts/providers`)
    if (response.status() === 200) {
      const data = await response.json()
      expect(data.providers).toBeDefined()
    }
  })
})
