const { test, expect } = require('@playwright/test');

test.describe('详情页功能测试', () => {
  let videoId;
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.video-card', { timeout: 15000 });
    const firstCard = page.locator('.video-card').first();
    const link = firstCard.locator('a');
    const href = await link.getAttribute('href');
    const match = href.match(/id=(\d+)/);
    if (match) {
      videoId = match[1];
    }
  });

  test('详情页加载正常', async ({ page }) => {
    if (videoId) {
      await page.goto(`/detail.html?id=${videoId}`);
      await page.waitForLoadState('networkidle');
      
      const detailPage = page.locator('.detail-page');
      await expect(detailPage).toBeVisible();
    }
  });

  test('视频标题显示', async ({ page }) => {
    if (videoId) {
      await page.goto(`/detail.html?id=${videoId}`);
      await page.waitForSelector('#videoTitle', { timeout: 15000 });
      
      const title = page.locator('#videoTitle');
      await expect(title).toBeVisible();
      const text = await title.textContent();
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test('播放按钮可点击', async ({ page }) => {
    if (videoId) {
      await page.goto(`/detail.html?id=${videoId}`);
      await page.waitForSelector('.btn-primary', { timeout: 15000 });
      
      const playBtn = page.locator('.btn-primary').first();
      await expect(playBtn).toBeEnabled();
    }
  });

  test('收藏按钮切换状态', async ({ page }) => {
    if (videoId) {
      await page.goto(`/detail.html?id=${videoId}`);
      await page.waitForSelector('#favBtn', { timeout: 15000 });
      
      const favBtn = page.locator('#favBtn');
      await favBtn.click();
      await page.waitForTimeout(500);
      
      const isFavorited = await favBtn.evaluate(el => el.classList.contains('favorited'));
      expect(isFavorited).toBeTruthy();
    }
  });

  test('返回首页链接有效', async ({ page }) => {
    if (videoId) {
      await page.goto(`/detail.html?id=${videoId}`);
      await page.waitForLoadState('networkidle');
      
      const backLink = page.locator('.navbar-brand');
      await expect(backLink).toBeVisible();
    }
  });
});

test.describe('详情页播放源测试', () => {
  test('播放源标签页切换', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.video-card', { timeout: 15000 });
    const firstCard = page.locator('.video-card').first();
    await firstCard.click();
    
    await page.waitForSelector('#sourceTabs', { timeout: 15000 });
    const tabs = page.locator('.source-tab');
    const tabCount = await tabs.count();
    
    if (tabCount > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
      await expect(tabs.nth(1)).toHaveClass(/active/);
    }
  });

  test('剧集按钮可点击', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.video-card', { timeout: 15000 });
    const firstCard = page.locator('.video-card').first();
    await firstCard.click();
    
    await page.waitForSelector('.episode-btn', { timeout: 15000 });
    const episodeBtn = page.locator('.episode-btn').first();
    await expect(episodeBtn).toBeVisible();
  });
});
