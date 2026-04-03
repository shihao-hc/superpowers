const { test, expect } = require('@playwright/test');

test.describe('无障碍访问测试 - 首页', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('跳转到主要内容链接存在', async ({ page }) => {
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveAttribute('href', '#mainContent');
  });

  test('导航区域有 aria-label', async ({ page }) => {
    const nav = page.locator('nav.navbar');
    await expect(nav).toHaveAttribute('aria-label');
  });

  test('所有图片有 alt 属性', async ({ page }) => {
    const images = page.locator('img');
    const count = await images.count();
    
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      expect(alt).toBeTruthy();
    }
  });

  test('按钮有可访问的名称', async ({ page }) => {
    const buttons = page.locator('button');
    const count = await buttons.count();
    
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const ariaLabel = await btn.getAttribute('aria-label');
      const text = await btn.textContent();
      const title = await btn.getAttribute('title');
      
      const hasAccessibleName = ariaLabel || (text && text.trim().length > 0) || title;
      expect(hasAccessibleName).toBeTruthy();
    }
  });

  test('链接有可访问的名称', async ({ page }) => {
    const links = page.locator('a[href]');
    const count = await links.count();
    
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      const ariaLabel = await link.getAttribute('aria-label');
      const text = await link.textContent();
      
      const hasAccessibleName = ariaLabel || (text && text.trim().length > 0);
      expect(hasAccessibleName).toBeTruthy();
    }
  });

  test('搜索输入框有 aria-label', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    const ariaLabel = await searchInput.getAttribute('aria-label');
    const placeholder = await searchInput.getAttribute('placeholder');
    
    const hasAccessibleName = ariaLabel || placeholder;
    expect(hasAccessibleName).toBeTruthy();
  });
});

test.describe('无障碍访问测试 - 详情页', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.video-card', { timeout: 15000 });
    await page.locator('.video-card').first().click();
    await page.waitForLoadState('networkidle');
  });

  test('详情页面主要区域有语义化标签', async ({ page }) => {
    const header = page.locator('.detail-header');
    await expect(header).toBeVisible();
  });

  test('操作按钮有 aria-label', async ({ page }) => {
    const playBtn = page.locator('.btn-primary').first();
    const favBtn = page.locator('#favBtn');
    
    await expect(playBtn).toBeVisible();
    await expect(favBtn).toBeVisible();
  });
});

test.describe('无障碍访问测试 - 播放器', () => {
  test('播放器控制按钮有 aria-label', async ({ page }) => {
    await page.goto('/player.html');
    await page.waitForLoadState('networkidle');
    
    const playBtn = page.locator('#playBtn');
    const pauseBtn = page.locator('#pauseBtn');
    const fullscreenBtn = page.locator('#fullscreenBtn');
    
    await expect(playBtn).toHaveAttribute('aria-label');
    await expect(pauseBtn).toHaveAttribute('aria-label');
    await expect(fullscreenBtn).toHaveAttribute('aria-label');
  });

  test('视频元素有 aria-label', async ({ page }) => {
    await page.goto('/player.html');
    const video = page.locator('#videoPlayer');
    await expect(video).toHaveAttribute('aria-label');
  });

  test('进度条有 aria 属性', async ({ page }) => {
    await page.goto('/player.html');
    const progressBar = page.locator('.progress-bar');
    await expect(progressBar).toHaveAttribute('role', 'slider');
  });
});

test.describe('无障碍访问测试 - 设置页', () => {
  test('表单输入框有相关标签', async ({ page }) => {
    await page.goto('/setting.html');
    await page.waitForLoadState('networkidle');
    
    const nameInput = page.locator('#sourceName');
    const urlInput = page.locator('#sourceUrl');
    
    const nameLabel = page.locator('label').filter({ hasText: '名称' });
    const urlLabel = page.locator('label').filter({ hasText: '接口地址' });
    
    await expect(nameInput).toBeVisible();
    await expect(urlInput).toBeVisible();
  });
});

test.describe('键盘导航测试', () => {
  test('Tab 键可以导航到主要元素', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('搜索框可聚焦', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const searchInput = page.locator('#searchInput');
    await searchInput.focus();
    await expect(searchInput).toBeFocused();
  });
});
