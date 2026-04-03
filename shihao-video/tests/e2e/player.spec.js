const { test, expect } = require('@playwright/test');

test.describe('播放器功能测试', () => {
  test('播放器页面加载', async ({ page }) => {
    await page.goto('/player.html');
    await page.waitForLoadState('networkidle');
    
    const playerWrapper = page.locator('.player-wrapper');
    await expect(playerWrapper).toBeVisible();
  });

  test('视频元素存在', async ({ page }) => {
    await page.goto('/player.html');
    const video = page.locator('#videoPlayer');
    await expect(video).toBeVisible();
  });

  test('控制栏按钮显示', async ({ page }) => {
    await page.goto('/player.html');
    
    const playBtn = page.locator('#playBtn');
    await expect(playBtn).toBeVisible();
    
    const pauseBtn = page.locator('#pauseBtn');
    await expect(pauseBtn).toBeVisible();
    
    const fullscreenBtn = page.locator('#fullscreenBtn');
    await expect(fullscreenBtn).toBeVisible();
  });

  test('播放/暂停按钮状态切换', async ({ page }) => {
    await page.goto('/player.html');
    
    const playBtn = page.locator('#playBtn');
    await expect(playBtn).toBeVisible();
  });

  test('进度条显示', async ({ page }) => {
    await page.goto('/player.html');
    
    const progressBar = page.locator('.progress-bar');
    await expect(progressBar).toBeVisible();
  });

  test('时间显示正常', async ({ page }) => {
    await page.goto('/player.html');
    
    const timeDisplay = page.locator('#timeDisplay');
    await expect(timeDisplay).toBeVisible();
    const text = await timeDisplay.textContent();
    expect(text).toMatch(/\d+:\d+/);
  });

  test('加载提示显示', async ({ page }) => {
    await page.goto('/player.html');
    
    const loadingIndicator = page.locator('#loadingIndicator');
    await expect(loadingIndicator).toBeVisible();
  });

  test('键盘快捷键响应', async ({ page }) => {
    await page.goto('/player.html');
    await page.waitForLoadState('networkidle');
    
    await page.keyboard.press('f');
    await page.waitForTimeout(500);
  });

  test('返回按钮有效', async ({ page }) => {
    await page.goto('/player.html');
    await page.waitForLoadState('networkidle');
    
    const backBtn = page.locator('.back-btn');
    await expect(backBtn).toBeVisible();
  });
});

test.describe('播放器响应式测试', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('移动端控制栏适配', async ({ page }) => {
    await page.goto('/player.html');
    
    const controlButtons = page.locator('.control-buttons');
    await expect(controlButtons).toBeVisible();
    
    const leftControls = page.locator('.control-left');
    const rightControls = page.locator('.control-right');
    await expect(leftControls).toBeVisible();
    await expect(rightControls).toBeVisible();
  });
});
