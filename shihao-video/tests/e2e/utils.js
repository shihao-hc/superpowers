const { test, expect } = require('@playwright/test');

exports.testUtils = {
  async waitForVideoList(page) {
    await page.waitForSelector('.video-card', { timeout: 15000 });
  },

  async getFirstVideoId(page) {
    await this.waitForVideoList(page);
    const firstCard = page.locator('.video-card').first();
    const link = await firstCard.locator('a').getAttribute('href');
    const match = link.match(/id=(\d+)/);
    return match ? match[1] : null;
  },

  async clearLocalStorage(page) {
    await page.evaluate(() => localStorage.clear());
  },

  async setViewportForMobile(page) {
    await page.setViewportSize({ width: 375, height: 812 });
  },

  async setViewportForDesktop(page) {
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
};

exports.apiUtils = {
  async fetchVideoList(apiUrl, page = 1, limit = 20) {
    const url = `${apiUrl}?ac=detail&t=${Date.now()}`;
    const response = await fetch(url);
    return response.json();
  },

  async fetchCategories(apiUrl) {
    const url = `${apiUrl}?ac=category&t=${Date.now()}`;
    const response = await fetch(url);
    return response.json();
  }
};
