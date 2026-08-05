const mockBrowserAgent = jest.fn();

class MockBrowserAgent {
  constructor(...args) {
    return mockBrowserAgent(...args);
  }
}

jest.mock('../../src/agent/BrowserAgent', () => ({
  BrowserAgent: MockBrowserAgent,
}));

const { DynamicScraper } = require('../../src/agent/DynamicScraper');

const makeEl = (overrides = {}) => ({
  content: undefined,
  textContent: 'Element Text',
  src: 'http://cdn.example.com/video.mp4',
  poster: 'http://cdn.example.com/poster.jpg',
  duration: 120,
  alt: 'image alt',
  href: 'http://example.com/link',
  querySelector: jest.fn().mockReturnValue(null),
  ...overrides,
});

const makeElementList = (els) => {
  const list = [...els];
  list[0] = list[0] || undefined;
  list.item = (i) => list[i];
  return list;
};

const setupDom = () => {
  const videoEl = makeEl();
  const titleEl = makeEl({ content: 'Meta Title' });
  const authorEl = makeEl();
  const imgEl = makeEl({ src: 'http://cdn.example.com/img.jpg' });
  const linkEl = makeEl({ href: 'http://example.com/link' });

  global.document = {
    querySelector: jest.fn((sel) => (sel === 'video' ? videoEl : null)),
    querySelectorAll: jest.fn((sel) => {
      if (sel.includes('title')) return makeElementList([titleEl]);
      if (sel.includes('author') || sel.includes('user') || sel.includes('nickname')) {
        return makeElementList([authorEl]);
      }
      if (sel === 'img') return makeElementList([imgEl]);
      if (sel === 'a[href]') return makeElementList([linkEl]);
      return makeElementList([]);
    }),
    body: {
      innerText: 'Page content text',
      innerHTML: '<div>Page html</div>',
    },
  };
  global.window = {
    scrollBy: jest.fn(),
  };
  return { videoEl, titleEl, authorEl, imgEl, linkEl };
};

const makeBrowser = () => ({
  init: jest.fn().mockResolvedValue(),
  close: jest.fn().mockResolvedValue(),
  setMobileMode: jest.fn().mockResolvedValue(),
  _validateUrl: jest.fn(),
  page: {
    goto: jest.fn().mockResolvedValue(),
    waitForTimeout: jest.fn().mockResolvedValue(),
    evaluate: jest.fn().mockResolvedValue({}),
    click: jest.fn().mockResolvedValue(),
  },
});

describe('DynamicScraper', () => {
  beforeEach(() => {
    mockBrowserAgent.mockReset();
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
  });

  describe('constructor', () => {
    test('sets default options', () => {
      const ds = new DynamicScraper();
      expect(ds.options.timeout).toBe(30000);
      expect(ds.options.screenshotDir).toBe('./screenshots');
      expect(ds.options.headless).toBe(true);
      expect(ds.options.stealth).toBe(true);
    });

    test('honors custom options and nullish handling', () => {
      const ds = new DynamicScraper({
        timeout: 10000,
        headless: false,
        stealth: false,
        screenshotDir: '/tmp/shots',
      });
      expect(ds.options.timeout).toBe(10000);
      expect(ds.options.headless).toBe(false);
      expect(ds.options.stealth).toBe(false);
      expect(ds.options.screenshotDir).toBe('/tmp/shots');
    });

    test('registers all six platforms', () => {
      const ds = new DynamicScraper();
      expect(Object.keys(ds.platforms)).toEqual([
        'douyin', 'bilibili', 'xiaohongshu', 'weibo', 'youtube', 'twitter',
      ]);
    });
  });

  describe('_detectPlatform', () => {
    let ds;
    beforeEach(() => {
      ds = new DynamicScraper();
    });

    test('detects douyin', () => {
      const r = ds._detectPlatform('https://www.douyin.com/video/123');
      expect(r.name).toBe('douyin');
      expect(r.config.mobileRequired).toBe(true);
    });

    test('detects bilibili short link', () => {
      const r = ds._detectPlatform('https://b23.tv/abc');
      expect(r.name).toBe('bilibili');
    });

    test('detects xiaohongshu', () => {
      const r = ds._detectPlatform('https://www.xiaohongshu.com/explore/123');
      expect(r.name).toBe('xiaohongshu');
    });

    test('detects weibo', () => {
      const r = ds._detectPlatform('https://m.weibo.cn/status/123');
      expect(r.name).toBe('weibo');
    });

    test('detects youtube', () => {
      const r = ds._detectPlatform('https://www.youtube.com/watch?v=abc');
      expect(r.name).toBe('youtube');
    });

    test('detects twitter', () => {
      const r = ds._detectPlatform('https://x.com/user/status/123');
      expect(r.name).toBe('twitter');
    });

    test('returns null for unknown platform', () => {
      expect(ds._detectPlatform('https://example.com/foo')).toBeNull();
    });
  });

  describe('init', () => {
    test('creates browser if not present', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper({ timeout: 5000, screenshotDir: '/x', headless: false, stealth: true });
      await ds.init();
      expect(mockBrowserAgent).toHaveBeenCalledWith({
        timeout: 5000,
        screenshotDir: '/x',
        headless: false,
        stealth: true,
      });
      expect(browser.init).toHaveBeenCalled();
    });

    test('reuses existing browser', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      await ds.init();
      await ds.init();
      expect(mockBrowserAgent).toHaveBeenCalledTimes(1);
    });
  });

  describe('scrape', () => {
    test('scrapes with detected platform config', async () => {
      const browser = makeBrowser();
      browser.page.evaluate.mockResolvedValue({ title: 'A Video' });
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      const result = await ds.scrape('https://www.douyin.com/video/1');
      expect(browser.setMobileMode).toHaveBeenNthCalledWith(1, true);
      expect(browser.setMobileMode).toHaveBeenNthCalledWith(2, false);
      expect(browser._validateUrl).toHaveBeenCalledWith('https://www.douyin.com/video/1');
      expect(browser.page.goto).toHaveBeenCalledWith('https://www.douyin.com/video/1', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      expect(browser.page.waitForTimeout).toHaveBeenCalledWith(5000);
      expect(result.platform).toBe('douyin');
      expect(result.title).toBe('A Video');
      expect(result.url).toBe('https://www.douyin.com/video/1');
      expect(result.timestamp).toBeDefined();
    });

    test('scrapes unknown platform with default config', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      const result = await ds.scrape('https://example.com/page');
      expect(browser.setMobileMode).not.toHaveBeenCalled();
      expect(browser.page.waitForTimeout).toHaveBeenCalledWith(3000);
      expect(result.platform).toBe('unknown');
    });

    test('calls init when browser missing', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      const initSpy = jest.spyOn(ds, 'init');
      await ds.scrape('https://www.youtube.com/watch?v=x');
      expect(initSpy).toHaveBeenCalled();
      expect(browser.page.waitForTimeout).toHaveBeenCalledWith(3000);
    });

    test('runs interactions when options.interact provided', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      const interactSpy = jest.spyOn(ds, '_interact').mockResolvedValue();
      await ds.scrape('https://example.com', { interact: [{ type: 'scroll' }] });
      expect(interactSpy).toHaveBeenCalledWith([{ type: 'scroll' }]);
    });
  });

  describe('_interact', () => {
    test('handles scroll action', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      ds.browser = browser;
      await ds._interact([{ type: 'scroll', y: 200, delay: 300 }]);
      expect(browser.page.evaluate).toHaveBeenCalled();
      expect(browser.page.waitForTimeout).toHaveBeenCalledWith(300);
    });

    test('scroll uses default y and delay', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      ds.browser = browser;
      await ds._interact([{ type: 'scroll' }]);
      expect(browser.page.evaluate).toHaveBeenCalledWith(expect.any(Function), 500);
      expect(browser.page.waitForTimeout).toHaveBeenCalledWith(1000);
    });

    test('handles click action', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      ds.browser = browser;
      await ds._interact([{ type: 'click', selector: '#btn', delay: 200 }]);
      expect(browser.page.click).toHaveBeenCalledWith('#btn');
      expect(browser.page.waitForTimeout).toHaveBeenCalledWith(200);
    });

    test('handles wait action', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      ds.browser = browser;
      await ds._interact([{ type: 'wait', duration: 1500 }]);
      expect(browser.page.waitForTimeout).toHaveBeenCalledWith(1500);
    });

    test('ignores unknown action types', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      ds.browser = browser;
      await expect(ds._interact([{ type: 'unknown' }])).resolves.toBeUndefined();
    });
  });

  describe('_extract', () => {
    beforeEach(() => {
      setupDom();
    });

    test('extracts video when selector present', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      browser.page.evaluate.mockImplementation((fn, arg) => fn(arg));
      const ds = new DynamicScraper();
      ds.browser = browser;
      const data = await ds._extract('douyin', { video: 'video' }, {});
      expect(data.video).toEqual({
        src: 'http://cdn.example.com/video.mp4',
        poster: 'http://cdn.example.com/poster.jpg',
        duration: 120,
      });
    });

    test('extracts video when extractVideo option set', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      browser.page.evaluate.mockImplementation((fn, arg) => fn(arg));
      const ds = new DynamicScraper();
      ds.browser = browser;
      const data = await ds._extract('youtube', null, { extractVideo: true });
      expect(data.video).toEqual({
        src: 'http://cdn.example.com/video.mp4',
        poster: 'http://cdn.example.com/poster.jpg',
        duration: 120,
      });
    });

    test('video missing on page produces undefined video', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      browser.page.evaluate.mockImplementation((fn, arg) => fn(arg));
      global.document.querySelector.mockImplementation(() => null);
      const ds = new DynamicScraper();
      ds.browser = browser;
      const data = await ds._extract('douyin', { video: 'video' }, {});
      expect(data.video).toBeUndefined();
    });

    test('extracts title when selector present', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      browser.page.evaluate.mockImplementation((fn, arg) => fn(arg));
      const ds = new DynamicScraper();
      ds.browser = browser;
      const data = await ds._extract('bilibili', { title: 'h1' }, {});
      expect(data.title).toBe('Meta Title');
    });

    test('extracts content and html', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      browser.page.evaluate.mockImplementation((fn, arg) => fn(arg));
      const ds = new DynamicScraper();
      ds.browser = browser;
      const data = await ds._extract('weibo', { content: '.content' }, { extractHTML: true });
      expect(data.content).toEqual({
        text: 'Page content text',
        html: '<div>Page html</div>',
      });
    });

    test('extracts author when selector present', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      browser.page.evaluate.mockImplementation((fn, arg) => fn(arg));
      const ds = new DynamicScraper();
      ds.browser = browser;
      const data = await ds._extract('douyin', { author: '[class*=author]' }, {});
      expect(data.author).toBe('Element Text');
    });

    test('extracts images when option set', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      browser.page.evaluate.mockImplementation((fn, arg) => fn(arg));
      const ds = new DynamicScraper();
      ds.browser = browser;
      const data = await ds._extract('xiaohongshu', null, { extractImages: true });
      expect(data.images).toEqual([
        { src: 'http://cdn.example.com/img.jpg', alt: 'image alt' },
      ]);
    });

    test('extracts links when option set', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      browser.page.evaluate.mockImplementation((fn, arg) => fn(arg));
      const ds = new DynamicScraper();
      ds.browser = browser;
      const data = await ds._extract('twitter', null, { extractLinks: true });
      expect(data.links).toEqual([{ text: 'Element Text', href: 'http://example.com/link' }]);
    });

    test('passes selectors to evaluate', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      browser.page.evaluate.mockImplementation((fn, arg) => fn(arg));
      const ds = new DynamicScraper();
      ds.browser = browser;
      const selectors = { title: 'h1' };
      await ds._extract('bilibili', selectors, {});
      expect(browser.page.evaluate).toHaveBeenCalledWith(expect.any(Function), selectors);
    });
  });

  describe('scrapeMultiple', () => {
    test('returns success results', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      jest.spyOn(ds, 'scrape').mockResolvedValue({ url: 'http://a.com', platform: 'unknown' });
      const results = await ds.scrapeMultiple(['http://a.com', 'http://b.com']);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ success: true, url: 'http://a.com' });
    });

    test('captures errors per url', async () => {
      const ds = new DynamicScraper();
      jest.spyOn(ds, 'scrape').mockImplementation((url) => {
        if (url === 'http://bad.com') {
          return Promise.reject(new Error('navigation failed'));
        }
        return Promise.resolve({ url, platform: 'unknown' });
      });
      const results = await ds.scrapeMultiple(['http://ok.com', 'http://bad.com']);
      expect(results[0].success).toBe(true);
      expect(results[1]).toEqual({
        success: false,
        url: 'http://bad.com',
        error: 'navigation failed',
      });
    });
  });

  describe('close', () => {
    test('closes and nulls browser', async () => {
      const browser = makeBrowser();
      mockBrowserAgent.mockReturnValue(browser);
      const ds = new DynamicScraper();
      ds.browser = browser;
      await ds.close();
      expect(browser.close).toHaveBeenCalled();
      expect(ds.browser).toBeNull();
    });

    test('no-op when browser is null', async () => {
      const ds = new DynamicScraper();
      await expect(ds.close()).resolves.toBeUndefined();
    });
  });
});
