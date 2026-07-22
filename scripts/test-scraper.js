#!/usr/bin/env node

const { DynamicScraper, BrowserAgent } = require('../src/agent');

async function testBrowserAgent() {
  console.log('🧪 Testing BrowserAgent...\n');

  const browser = new BrowserAgent({ headless: true, stealth: true });

  try {
    await browser.init();
    console.log('✅ BrowserAgent initialized');

    await browser.goto('https://example.com');
    console.log('✅ Page loaded');

    const title = await browser.title();
    console.log(`✅ Title: ${title}`);

    const text = await browser.getPageText();
    console.log(`✅ Page text extracted (${text.length} chars)`);

  } catch (error) {
    console.error('❌ BrowserAgent test failed:', error.message);
  } finally {
    await browser.close();
  }
}

async function testDynamicScraper() {
  console.log('\n🧪 Testing DynamicScraper...\n');

  const scraper = new DynamicScraper({ headless: true });

  try {
    await scraper.init();
    console.log('✅ DynamicScraper initialized');

    const testUrls = [
      'https://example.com',
      'https://www.bilibili.com'
    ];

    for (const url of testUrls) {
      console.log(`\n📄 Scraping: ${url}`);
      const result = await scraper.scrape(url, {
        extractTitle: true,
        extractContent: true
      });
      console.log(`  Platform: ${result.platform}`);
      console.log(`  Title: ${result.title?.slice(0, 50) || 'N/A'}...`);
      console.log(`  Content length: ${result.content?.text?.length || 0} chars`);
    }

  } catch (error) {
    console.error('❌ DynamicScraper test failed:', error.message);
  } finally {
    await scraper.close();
  }
}

async function testPlatformDetection() {
  console.log('\n🧪 Testing Platform Detection...\n');

  const scraper = new DynamicScraper();

  const urls = [
    { url: 'https://www.douyin.com/video/123', expected: 'douyin' },
    { url: 'https://www.bilibili.com/video/BV1xx', expected: 'bilibili' },
    { url: 'https://www.xiaohongshu.com/explore/xxx', expected: 'xiaohongshu' },
    { url: 'https://weibo.com/u/123', expected: 'weibo' },
    { url: 'https://youtube.com/watch?v=xxx', expected: 'youtube' },
    { url: 'https://twitter.com/user/status/123', expected: 'twitter' },
    { url: 'https://example.com', expected: null }
  ];

  for (const { url, expected } of urls) {
    const platform = scraper._detectPlatform(url);
    const detected = platform?.name || 'unknown';
    const status = (expected === null && detected === 'unknown') || detected === expected ? '✅' : '❌';
    console.log(`${status} ${url.slice(0, 40).padEnd(40)} => ${detected}`);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Dynamic Scraper Test Suite            ║');
  console.log('╚════════════════════════════════════════╝\n');

  await testPlatformDetection();
  await testBrowserAgent();
  await testDynamicScraper();

  console.log('\n🏁 Tests completed');
}

main().catch(console.error);
