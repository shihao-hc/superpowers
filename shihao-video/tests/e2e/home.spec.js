const { test, expect } = require('@playwright/test');

test.describe('首页功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('页面标题正确', async ({ page }) => {
    await expect(page).toHaveTitle(/拾号-影视/);
  });

  test('导航栏显示正常', async ({ page }) => {
    const brand = page.locator('.navbar-brand');
    await expect(brand).toBeVisible();
    await expect(brand).toContainText('拾号-影视');
  });

  test('分类导航加载正确', async ({ page }) => {
    const categoryNav = page.locator('.category-nav');
    await expect(categoryNav).toBeVisible();
    
    const allBtn = page.locator('.category-btn').first();
    await expect(allBtn).toBeVisible();
    await expect(allBtn).toContainText('全部');
  });

  test('视频列表加载成功', async ({ page }) => {
    await page.waitForSelector('.video-card', { timeout: 15000 });
    const cards = page.locator('.video-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('点击视频卡片跳转详情页', async ({ page }) => {
    await page.waitForSelector('.video-card', { timeout: 15000 });
    const firstCard = page.locator('.video-card').first();
    const link = firstCard.locator('a');
    await link.click();
    await expect(page).toHaveURL(/\/detail\.html\?id=/);
  });

  test('搜索功能正常工作', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    if (await searchInput.isVisible()) {
      await searchInput.fill('流浪地球');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      
      const cards = page.locator('.video-card');
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('分类切换功能', async ({ page }) => {
    await page.waitForSelector('.category-btn', { timeout: 10000 });
    const categoryBtns = page.locator('.category-btn');
    const btnCount = await categoryBtns.count();
    
    if (btnCount > 1) {
      await categoryBtns.nth(1).click();
      await page.waitForTimeout(1000);
      await expect(categoryBtns.nth(1)).toHaveClass(/active/);
    }
  });

  test('跳过链接可访问', async ({ page }) => {
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toHaveAttribute('href', '#mainContent');
  });
});

test.describe('首页响应式测试', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('移动端搜索按钮显示', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const searchToggle = page.locator('.search-toggle');
    if (await searchToggle.isVisible()) {
      await searchToggle.click();
      const searchInput = page.locator('#searchInput');
      await expect(searchInput).toBeVisible();
    }
  });
});
