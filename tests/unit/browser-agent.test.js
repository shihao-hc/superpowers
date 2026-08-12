const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('../../src/utils/SSRFValidator', () => ({
  validateURL: jest.fn(() => ({ allowed: true }))
}));

jest.mock('playwright', () => ({
  chromium: { launch: jest.fn() }
}));

const { BrowserAgent } = require('../../src/agent/BrowserAgent');
const { validateURL } = require('../../src/utils/SSRFValidator');
const { chromium } = require('playwright');

function createMocks() {
  const mockPage = {
    setDefaultTimeout: jest.fn(),
    addInitScript: jest.fn(),
    goto: jest.fn().mockResolvedValue(),
    waitForSelector: jest.fn().mockResolvedValue(),
    click: jest.fn().mockResolvedValue(),
    fill: jest.fn().mockResolvedValue(),
    $$: jest.fn().mockResolvedValue([]),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
    evaluate: jest.fn().mockResolvedValue(),
    goBack: jest.fn().mockResolvedValue(),
    goForward: jest.fn().mockResolvedValue(),
    waitForLoadState: jest.fn().mockResolvedValue(),
    waitForTimeout: jest.fn().mockResolvedValue(),
    $$eval: jest.fn().mockResolvedValue(0),
    url: jest.fn().mockReturnValue('https://example.com'),
    title: jest.fn().mockResolvedValue('Test Page'),
    content: jest.fn().mockResolvedValue('<html></html>'),
    close: jest.fn().mockResolvedValue(),
    setViewportSize: jest.fn().mockResolvedValue(),
    setExtraHTTPHeaders: jest.fn().mockResolvedValue(),
    waitForEvent: jest.fn(),
    waitForNavigation: jest.fn().mockResolvedValue(),
    waitForFunction: jest.fn().mockResolvedValue()
  };

  const mockContext = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn().mockResolvedValue()
  };

  const mockBrowser = {
    newContext: jest.fn().mockResolvedValue(mockContext),
    close: jest.fn().mockResolvedValue()
  };

  return { mockPage, mockContext, mockBrowser };
}

let mockPage;
let mockContext;
let mockBrowser;

beforeEach(() => {
  jest.clearAllMocks();
  const mocks = createMocks();
  mockPage = mocks.mockPage;
  mockContext = mocks.mockContext;
  mockBrowser = mocks.mockBrowser;
  chromium.launch.mockResolvedValue(mockBrowser);
  fs.existsSync.mockReturnValue(true);
  validateURL.mockReturnValue({ allowed: true });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.document;
  delete global.window;
  delete global.navigator;
});

describe('BrowserAgent', () => {
  describe('constructor', () => {
    it('should set default options', () => {
      const agent = new BrowserAgent();
      expect(agent.timeout).toBe(30000);
      expect(agent.screenshotDir).toBe('./screenshots');
      expect(agent.isHeadless).toBe(true);
      expect(agent.viewport).toEqual({ width: 1280, height: 720 });
      expect(agent._stealthMode).toBe(true);
      expect(agent._platform).toBe('desktop');
      expect(agent.browser).toBeNull();
      expect(agent.page).toBeNull();
      expect(agent.context).toBeNull();
    });

    it('should accept custom options', () => {
      const agent = new BrowserAgent({
        timeout: 10000,
        screenshotDir: '/tmp/screens',
        headless: false,
        viewport: { width: 1920, height: 1080 },
        stealth: false,
        platform: 'mobile'
      });
      expect(agent.timeout).toBe(10000);
      expect(agent.screenshotDir).toBe('/tmp/screens');
      expect(agent.isHeadless).toBe(false);
      expect(agent.viewport).toEqual({ width: 1920, height: 1080 });
      expect(agent._stealthMode).toBe(false);
      expect(agent._platform).toBe('mobile');
    });
  });

  describe('init', () => {
    it('should launch browser and create page', async () => {
      const agent = new BrowserAgent({ headless: true, stealth: true });
      const result = await agent.init();

      expect(result).toBe(agent);
      expect(chromium.launch).toHaveBeenCalledWith({
        headless: true,
        args: expect.arrayContaining([
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-features=IsolateOrigins,site-per-process'
        ])
      });
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(30000);
      expect(mockPage.addInitScript).toHaveBeenCalledTimes(1);
    });

    it('should create screenshot directory when missing', async () => {
      fs.existsSync.mockReturnValue(false);
      const agent = new BrowserAgent({ screenshotDir: './custom-screens' });
      await agent.init();

      expect(fs.mkdirSync).toHaveBeenCalledWith('./custom-screens', { recursive: true });
    });

    it('should skip stealth mode when disabled', async () => {
      const agent = new BrowserAgent({ stealth: false });
      await agent.init();

      expect(mockPage.addInitScript).not.toHaveBeenCalled();
    });

    it('should skip stealth args when disabled', async () => {
      const agent = new BrowserAgent({ stealth: false });
      await agent.init();

      expect(chromium.launch).toHaveBeenCalledWith({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox'
        ]
      });
    });
  });

  describe('_getContextOptions', () => {
    it('should return desktop context options by default', () => {
      const agent = new BrowserAgent();
      const opts = agent._getContextOptions();
      expect(opts.viewport).toEqual({ width: 1280, height: 720 });
      expect(opts.locale).toBe('zh-CN');
      expect(opts.timezoneId).toBe('Asia/Shanghai');
      expect(opts.userAgent).toContain('Windows NT');
      expect(opts.isMobile).toBeUndefined();
    });

    it('should return mobile context options when platform is mobile', () => {
      const agent = new BrowserAgent({ platform: 'mobile' });
      const opts = agent._getContextOptions();
      expect(opts.viewport).toEqual({ width: 375, height: 812 });
      expect(opts.isMobile).toBe(true);
      expect(opts.hasTouch).toBe(true);
      expect(opts.userAgent).toContain('iPhone');
    });
  });

  describe('_applyStealth', () => {
    it('should add init script with anti-detection', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      expect(mockPage.addInitScript).toHaveBeenCalledTimes(1);
      const scriptFn = mockPage.addInitScript.mock.calls[0][0];
      expect(scriptFn).toBeInstanceOf(Function);
    });

    it('should execute the anti-detection script body', async () => {
      global.navigator = {};
      global.window = {};
      mockPage.addInitScript.mockImplementation((fn) => {
        fn();
        return Promise.resolve();
      });

      const agent = new BrowserAgent();
      await agent.init();

      expect(global.navigator.webdriver).toBe(false);
      expect(global.navigator.plugins).toHaveLength(5);
      expect(global.navigator.languages).toEqual(['zh-CN', 'zh', 'en']);
      expect(global.window.chrome).toEqual({ runtime: {} });
    });
  });

  describe('setMobileMode', () => {
    it('should throw when not initialized', async () => {
      const agent = new BrowserAgent();
      await expect(agent.setMobileMode()).rejects.toThrow('Browser not initialized');
    });

    it('should switch to mobile mode', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockContext.newPage.mockResolvedValue(mockPage);
      const result = await agent.setMobileMode(true);

      expect(result).toEqual({ success: true, mobile: true });
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 375, height: 812 });
      expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalled();
    });

    it('should switch to desktop mode without setting mobile headers', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.setMobileMode(false);
      expect(result).toEqual({ success: true, mobile: false });
      expect(mockPage.setViewportSize).not.toHaveBeenCalled();
      expect(mockPage.setExtraHTTPHeaders).not.toHaveBeenCalled();
    });
  });

  describe('_validateUrl', () => {
    it('should pass through valid URL', () => {
      validateURL.mockReturnValue({ allowed: true });
      const agent = new BrowserAgent();
      expect(agent._validateUrl('https://example.com')).toBe('https://example.com');
      expect(validateURL).toHaveBeenCalledWith('https://example.com', {
        allowPrivate: false, allowLoopback: false
      });
    });

    it('should throw for blocked URL', () => {
      validateURL.mockReturnValue({ allowed: false, reason: 'Blocked by SSRF check' });
      const agent = new BrowserAgent();
      expect(() => agent._validateUrl('http://169.254.169.254')).toThrow('Blocked by SSRF check');
    });
  });

  describe('navigation methods', () => {
    it('goto should navigate and return url', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.goto('https://example.com');
      expect(result).toEqual({ success: true, url: 'https://example.com' });
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'domcontentloaded' });
    });

    it('goto should throw when not initialized', async () => {
      const agent = new BrowserAgent();
      await expect(agent.goto('https://example.com')).rejects.toThrow('Browser not initialized');
    });

    it('back should navigate back', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.back();
      expect(result).toEqual({ success: true });
      expect(mockPage.goBack).toHaveBeenCalled();
    });

    it('back should throw when not initialized', async () => {
      const agent = new BrowserAgent();
      await expect(agent.back()).rejects.toThrow('Browser not initialized');
    });

    it('forward should navigate forward', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.forward();
      expect(result).toEqual({ success: true });
      expect(mockPage.goForward).toHaveBeenCalled();
    });

    it('forward should throw when not initialized', async () => {
      const agent = new BrowserAgent();
      await expect(agent.forward()).rejects.toThrow('Browser not initialized');
    });

    it('url should return current url', async () => {
      const agent = new BrowserAgent();
      await agent.init();
      mockPage.url.mockReturnValue('https://example.com/page');

      expect(await agent.url()).toBe('https://example.com/page');
    });

    it('url should return null when no page', async () => {
      const agent = new BrowserAgent();
      expect(await agent.url()).toBeNull();
    });

    it('title should return page title', async () => {
      const agent = new BrowserAgent();
      await agent.init();
      mockPage.title.mockResolvedValue('My Page');

      expect(await agent.title()).toBe('My Page');
    });

    it('title should return null when no page', async () => {
      const agent = new BrowserAgent();
      expect(await agent.title()).toBeNull();
    });
  });

  describe('interaction methods', () => {
    it('click should wait and click selector', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.click('#button');
      expect(result).toEqual({ success: true, selector: '#button' });
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#button', { timeout: 5000 });
      expect(mockPage.click).toHaveBeenCalledWith('#button');
    });

    it('click should throw when not initialized', async () => {
      const agent = new BrowserAgent();
      await expect(agent.click('#btn')).rejects.toThrow('Browser not initialized');
    });

    it('type should fill text in selector', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.type('#input', 'hello');
      expect(result).toEqual({ success: true, selector: '#input', text: 'hello' });
      expect(mockPage.fill).toHaveBeenCalledWith('#input', 'hello');
    });

    it('fillForm should fill multiple fields', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.fillForm({ '#name': 'Alice', '#email': 'a@b.com' });
      expect(result).toEqual({ success: true, fields: 2 });
      expect(mockPage.fill).toHaveBeenCalledWith('#name', 'Alice');
      expect(mockPage.fill).toHaveBeenCalledWith('#email', 'a@b.com');
    });

    it('submitForm with selector should click submit inside form', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      await agent.submitForm('#myForm');
      expect(mockPage.click).toHaveBeenCalledWith('#myForm [type="submit"]');
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle');
    });

    it('submitForm without selector should click first submit', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      await agent.submitForm();
      expect(mockPage.click).toHaveBeenCalledWith('[type="submit"]');
    });
  });

  describe('extract', () => {
    it('should extract textContent by default', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const handles = [
        { textContent: jest.fn().mockResolvedValue('  Item 1  '), getAttribute: jest.fn() },
        { textContent: jest.fn().mockResolvedValue('Item 2'), getAttribute: jest.fn() },
        { textContent: jest.fn().mockResolvedValue(null), getAttribute: jest.fn() }
      ];
      mockPage.$$.mockResolvedValue(handles);

      const result = await agent.extract('.item');
      expect(result).toEqual(['Item 1', 'Item 2']);
    });

    it('should extract href attribute', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const handles = [
        { textContent: jest.fn(), getAttribute: jest.fn().mockResolvedValue('/page1') },
        { textContent: jest.fn(), getAttribute: jest.fn().mockResolvedValue(null) }
      ];
      mockPage.$$.mockResolvedValue(handles);

      const result = await agent.extract('a', 'href');
      expect(result).toEqual(['/page1']);
    });

    it('should extract custom attribute', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const handles = [
        { textContent: jest.fn(), getAttribute: jest.fn().mockResolvedValue('42') }
      ];
      mockPage.$$.mockResolvedValue(handles);

      const result = await agent.extract('.item', 'data-id');
      expect(result).toEqual(['42']);
      expect(handles[0].getAttribute).toHaveBeenCalledWith('data-id');
    });

    it('should return empty array when no elements match', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.$$.mockResolvedValue([]);
      expect(await agent.extract('.nonexistent')).toEqual([]);
    });
  });

  describe('getElements', () => {
    it('should return element count', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.$$.mockResolvedValue([1, 2, 3]);
      expect(await agent.getElements('div')).toBe(3);
    });
  });

  describe('screenshot', () => {
    it('should take screenshot without saving', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.screenshot.mockResolvedValue(Buffer.from('image-data'));
      jest.spyOn(Date, 'now').mockReturnValue(1234567890);

      const result = await agent.screenshot();
      expect(result).toBe(Buffer.from('image-data').toString('base64'));
      expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: false, type: 'png' });
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should save screenshot to disk when save option is set', async () => {
      const agent = new BrowserAgent({ screenshotDir: '/screens' });
      await agent.init();

      mockPage.screenshot.mockResolvedValue(Buffer.from('img'));
      const result = await agent.screenshot({ save: true, filename: 'test.png' });
      expect(result).toBe(Buffer.from('img').toString('base64'));
      expect(fs.writeFileSync).toHaveBeenCalledWith(path.join('/screens', 'test.png'), Buffer.from('img'));
    });

    it('screenshotFullPage should call screenshot with fullPage true', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const spy = jest.spyOn(agent, 'screenshot');
      await agent.screenshotFullPage();
      expect(spy).toHaveBeenCalledWith({ fullPage: true });
    });
  });

  describe('scroll', () => {
    it('should scroll down', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.scroll('down', 400);
      expect(result).toEqual({ success: true, direction: 'down', amount: 400 });
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('should scroll up', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.scroll('up', 300);
      expect(result).toEqual({ success: true, direction: 'up', amount: 300 });
    });

    it('should execute the scroll evaluate callback', async () => {
      const scrollBy = jest.fn();
      global.window = { scrollBy };
      mockPage.evaluate.mockImplementation((fn, arg) => {
        fn(arg);
        return Promise.resolve();
      });

      const agent = new BrowserAgent();
      await agent.init();

      await agent.scroll('down', 400);
      await agent.scroll('up', 300);
      await agent.scroll();
      expect(scrollBy).toHaveBeenCalledWith(0, 400);
      expect(scrollBy).toHaveBeenCalledWith(0, -300);
      expect(scrollBy).toHaveBeenCalledWith(0, 500);
    });

    it('scrollToLoad without selector should scroll maxScrolls times', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.scrollToLoad(null, 5);
      expect(result.success).toBe(true);
      expect(result.scrolls).toBe(5);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(5);
      expect(mockPage.waitForTimeout).toHaveBeenCalledTimes(5);
    });

    it('scrollToLoad with selector should stop when count stops increasing', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.$$eval
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(5);

      const result = await agent.scrollToLoad('.item', 10);
      expect(result.success).toBe(true);
      expect(result.scrolls).toBe(2);
    });

    it('should execute scrollToLoad evaluate and $$eval callbacks', async () => {
      const scrollBy = jest.fn();
      global.window = { innerHeight: 900, scrollBy };
      mockPage.evaluate.mockImplementation((fn) => {
        fn();
        return Promise.resolve();
      });
      mockPage.$$eval
        .mockImplementationOnce((sel, fn) => Promise.resolve(fn([{}, {}])))
        .mockImplementationOnce((sel, fn) => Promise.resolve(fn([{}, {}, {}])))
        .mockImplementationOnce((sel, fn) => Promise.resolve(fn([{}, {}, {}, {}])));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.scrollToLoad('.item', 3);
      expect(result.scrolls).toBe(3);
      expect(scrollBy).toHaveBeenCalledWith(0, 900);
      expect(mockPage.$$eval).toHaveBeenCalledTimes(3);
    });
  });

  describe('video methods', () => {
    it('extractVideoUrl should return video data', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.evaluate.mockResolvedValue({
        videos: [{ src: 'https://example.com/vid.mp4', type: 'video/mp4', poster: '' }],
        dynamicUrls: ['https://example.com/playlist.m3u8']
      });

      const result = await agent.extractVideoUrl();
      expect(result.videoSources).toHaveLength(1);
      expect(result.potentialVideoUrls).toContain('https://example.com/playlist.m3u8');
      expect(result.allUrls).toContain('https://example.com/vid.mp4');
    });

    it('should execute extractVideoUrl evaluate callback', async () => {
      const videos = [
        { src: 'https://example.com/a.mp4', type: 'video/mp4', poster: 'a.jpg', querySelector: () => null },
        { src: '', type: '', poster: '', querySelector: (sel) => (sel === 'source' ? { src: 'https://example.com/b.webm', type: 'video/webm' } : null) }
      ];
      const scripts = [
        { textContent: 'var playAddr = "https://example.com/stream.mp4";' },
        { textContent: 'no urls here' },
        { textContent: null }
      ];
      global.document = {
        querySelectorAll: (sel) => {
          if (sel === 'video') return videos;
          if (sel === 'script') return scripts;
          return [];
        }
      };
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.extractVideoUrl();
      expect(result.videoSources).toEqual([
        { src: 'https://example.com/a.mp4', type: 'video/mp4', poster: 'a.jpg' },
        { src: 'https://example.com/b.webm', type: 'video/webm', poster: '' }
      ]);
      expect(result.potentialVideoUrls).toEqual(['https://example.com/stream.mp4']);
      expect(result.allUrls).toEqual([
        'https://example.com/a.mp4',
        'https://example.com/b.webm',
        'https://example.com/stream.mp4'
      ]);
    });

    it('handleShortVideo should return video info when video exists', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.evaluate.mockResolvedValue({
        hasVideo: true,
        src: 'https://example.com/vid.mp4',
        poster: '',
        duration: 30,
        currentTime: 0
      });

      const result = await agent.handleShortVideo();
      expect(result.hasVideo).toBe(true);
      expect(result.src).toBe('https://example.com/vid.mp4');
    });

    it('handleShortVideo should return no video when absent', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.evaluate.mockResolvedValue({ hasVideo: false });
      const result = await agent.handleShortVideo();
      expect(result.hasVideo).toBe(false);
    });

    it('should execute handleShortVideo callback with video, parent and title', async () => {
      const title = { textContent: '  Great Title  ' };
      const video = {
        src: 'https://example.com/vid.mp4',
        poster: 'p.jpg',
        duration: 30,
        currentTime: 5,
        querySelector: () => null,
        closest: () => ({ querySelector: () => title })
      };
      global.document = { querySelector: () => video };
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.handleShortVideo();
      expect(result).toEqual({
        hasVideo: true,
        src: 'https://example.com/vid.mp4',
        poster: 'p.jpg',
        duration: 30,
        currentTime: 5,
        title: 'Great Title'
      });
    });

    it('should execute handleShortVideo callback without parent using source fallback', async () => {
      const video = {
        src: '',
        poster: '',
        duration: 0,
        currentTime: 0,
        querySelector: () => ({ src: 'https://example.com/source.webm' }),
        closest: () => null
      };
      global.document = { querySelector: () => video };
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.handleShortVideo();
      expect(result.src).toBe('https://example.com/source.webm');
      expect(result.title).toBeUndefined();
    });

    it('should execute handleShortVideo callback with parent but no title', async () => {
      const video = {
        src: 'https://example.com/vid.mp4',
        poster: '',
        duration: 30,
        currentTime: 5,
        querySelector: () => null,
        closest: () => ({ querySelector: () => null })
      };
      global.document = { querySelector: () => video };
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.handleShortVideo();
      expect(result.hasVideo).toBe(true);
      expect(result.title).toBeUndefined();
    });

    it('should execute handleShortVideo callback when no video present', async () => {
      global.document = { querySelector: () => null };
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.handleShortVideo();
      expect(result).toEqual({ hasVideo: false });
    });

    it('waitForVideoLoad should return success when video is ready', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.waitForFunction.mockResolvedValue(true);
      const result = await agent.waitForVideoLoad(5000);
      expect(result).toEqual({ success: true, loaded: true });
    });

    it('waitForVideoLoad should return failure on timeout', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.waitForFunction.mockRejectedValue(new Error('timeout'));
      const result = await agent.waitForVideoLoad(5000);
      expect(result).toEqual({ success: false, reason: 'video_load_timeout' });
    });

    it('should execute waitForVideoLoad polling callback', async () => {
      global.document = { querySelector: () => ({ readyState: 4 }) };
      mockPage.waitForFunction.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.waitForVideoLoad(5000);
      expect(result).toEqual({ success: true, loaded: true });
    });
  });

  describe('network methods', () => {
    it('waitForNetworkIdle should resolve with success', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.waitForNetworkIdle(10000);
      expect(result).toEqual({ success: true });
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 10000 });
    });

    it('waitForNetworkIdle should handle timeout gracefully', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.waitForLoadState.mockRejectedValue(new Error('Navigation timeout'));
      const result = await agent.waitForNetworkIdle(1000);
      expect(result).toEqual({ success: false, reason: 'timeout', message: 'Navigation timeout' });
    });

    it('waitForSelector should wait with custom timeout', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.waitForSelector('.my-element', 3000);
      expect(result).toEqual({ success: true, selector: '.my-element' });
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.my-element', { timeout: 3000 });
    });

    it('waitForNavigation should wait and return url', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.url.mockReturnValue('https://example.com/new-page');
      const result = await agent.waitForNavigation(5000);
      expect(result).toEqual({ success: true, url: 'https://example.com/new-page' });
      expect(mockPage.waitForNavigation).toHaveBeenCalledWith({ timeout: 5000 });
    });
  });

  describe('page content methods', () => {
    it('getPageContent should return html', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.content.mockResolvedValue('<html><body>Hello</body></html>');
      expect(await agent.getPageContent()).toBe('<html><body>Hello</body></html>');
    });

    it('getPageText should return body text', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.evaluate.mockResolvedValue('Hello World');
      expect(await agent.getPageText()).toBe('Hello World');
    });

    it('should execute getPageText evaluate callback', async () => {
      global.document = { body: { innerText: 'Hello World' } };
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      expect(await agent.getPageText()).toBe('Hello World');
    });

    it('evaluate should delegate to page.evaluate', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const fn = () => document.title;
      mockPage.evaluate.mockResolvedValue('Test');
      expect(await agent.evaluate(fn)).toBe('Test');
      expect(mockPage.evaluate).toHaveBeenCalledWith(fn);
    });
  });

  describe('download', () => {
    it('should download file to specified path', async () => {
      const agent = new BrowserAgent({ screenshotDir: '/screens' });
      await agent.init();

      const mockDownload = { saveAs: jest.fn().mockResolvedValue() };
      mockPage.waitForEvent.mockResolvedValue(mockDownload);

      const result = await agent.download('https://example.com/file.zip', '/downloads/file.zip');
      expect(result).toEqual({ success: true, path: '/downloads/file.zip' });
      expect(mockPage.waitForEvent).toHaveBeenCalledWith('download');
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com/file.zip');
      expect(mockDownload.saveAs).toHaveBeenCalledWith('/downloads/file.zip');
    });

    it('should create target directory if missing', async () => {
      const agent = new BrowserAgent({ screenshotDir: '/screens' });
      await agent.init();

      const mockDownload = { saveAs: jest.fn().mockResolvedValue() };
      mockPage.waitForEvent.mockResolvedValue(mockDownload);
      fs.existsSync.mockReturnValueOnce(false);

      await agent.download('https://example.com/file.zip', '/new-dir/file.zip');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/new-dir', { recursive: true });
    });
  });

  describe('page management', () => {
    it('newPage should create a new page', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      const newMockPage = { url: jest.fn() };
      mockContext.newPage.mockResolvedValue(newMockPage);

      const page = await agent.newPage();
      expect(page).toBe(newMockPage);
    });

    it('newPage should throw when not initialized', async () => {
      const agent = new BrowserAgent();
      await expect(agent.newPage()).rejects.toThrow('Browser not initialized');
    });

    it('closePage should close and nullify page', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      await agent.closePage();
      expect(mockPage.close).toHaveBeenCalled();
      expect(agent.page).toBeNull();
    });

    it('closePage should be safe when page is null', async () => {
      const agent = new BrowserAgent();
      await agent.closePage();
    });

    it('close should close everything', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      await agent.close();
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
      expect(agent.page).toBeNull();
      expect(agent.context).toBeNull();
      expect(agent.browser).toBeNull();
    });

    it('close should be safe when nothing is initialized', async () => {
      const agent = new BrowserAgent();
      await agent.close();
    });
  });

  describe('isConnected / getStatus', () => {
    it('isConnected should return false when not initialized', () => {
      const agent = new BrowserAgent();
      expect(agent.isConnected()).toBe(false);
    });

    it('isConnected should return true when initialized', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      expect(agent.isConnected()).toBe(true);
    });

    it('getStatus should return connection status', async () => {
      const agent = new BrowserAgent({ viewport: { width: 1280, height: 720 } });
      await agent.init();

      const status = agent.getStatus();
      expect(status.connected).toBe(true);
      expect(status.url).toBe('https://example.com');
      expect(status.viewport).toEqual({ width: 1280, height: 720 });
    });

    it('getStatus should return null url when disconnected', () => {
      const agent = new BrowserAgent();
      const status = agent.getStatus();
      expect(status.connected).toBe(false);
      expect(status.url).toBeNull();
    });
  });

  describe('scrapeDynamicPage', () => {
    it('should auto-init when page is null', async () => {
      mockPage.content.mockResolvedValue('<html></html>');
      mockPage.title.mockResolvedValue('Dynamic Page');
      mockPage.evaluate
        .mockResolvedValueOnce('body text')
        .mockResolvedValueOnce({
          videos: [{ src: 'https://example.com/v.mp4', type: 'video/mp4', poster: '' }],
          dynamicUrls: []
        })
        .mockResolvedValueOnce([{ src: 'https://example.com/img.jpg', alt: '', loading: 'lazy' }]);

      const agent = new BrowserAgent();
      const result = await agent.scrapeDynamicPage('https://example.com', {
        waitTime: 1000,
        scrollCount: 2,
        extractVideos: true,
        extractImages: true
      });

      expect(result.url).toBe('https://example.com');
      expect(result.content.html).toBe('<html></html>');
      expect(result.content.title).toBe('Dynamic Page');
      expect(result.videos.videoSources).toHaveLength(1);
    });

    it('should skip video extraction when disabled', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.content.mockResolvedValue('<html></html>');
      mockPage.title.mockResolvedValue('Test');
      mockPage.evaluate
        .mockResolvedValueOnce('body text')
        .mockResolvedValueOnce([{ src: 'https://example.com/img.jpg', alt: '', loading: 'eager' }]);

      const result = await agent.scrapeDynamicPage('https://example.com', { extractVideos: false });
      expect(result.videos).toEqual([]);
    });

    it('should skip image extraction when disabled', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.content.mockResolvedValue('<html></html>');
      mockPage.title.mockResolvedValue('Test');
      mockPage.evaluate
        .mockResolvedValueOnce('body text')
        .mockResolvedValueOnce({
          videos: [],
          dynamicUrls: []
        });

      await agent.scrapeDynamicPage('https://example.com', { extractImages: false });
    });

    it('should auto-init and execute scrapeDynamicPage DOM callbacks', async () => {
      const imgs = [
        { src: 'https://example.com/a.jpg', alt: 'A', loading: 'lazy' },
        { src: 'data:image/png;base64,xxxx', alt: '', loading: 'eager' },
        { src: '', alt: '', loading: '' }
      ];
      global.window = { innerHeight: 900, scrollBy: jest.fn() };
      global.document = {
        body: { innerText: 'Scraped text' },
        querySelectorAll: (sel) => (sel === 'img' ? imgs : [])
      };
      mockPage.content.mockResolvedValue('<html></html>');
      mockPage.title.mockResolvedValue('Test');
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      const result = await agent.scrapeDynamicPage('https://example.com');

      expect(result.content.text).toBe('Scraped text');
      expect(result.images).toEqual([{ src: 'https://example.com/a.jpg', alt: 'A', loading: 'lazy' }]);
      expect(result.videos.videoSources).toEqual([]);
      expect(global.window.scrollBy).toHaveBeenCalledWith(0, 900);
    });
  });

  describe('scrapeDouyin', () => {
    function douyinDom({ video = null, metaTags = [], author = null, scripts = [], href = 'https://www.douyin.com/video/123' } = {}) {
      global.window = { location: { href } };
      global.document = {
        querySelector: (sel) => {
          if (sel === 'video') return video;
          return author ? author : null;
        },
        querySelectorAll: (sel) => {
          if (sel === 'meta') return metaTags;
          if (sel === 'script') return scripts;
          return [];
        }
      };
    }

    it('should scrape douyin page with mobile mode', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.evaluate.mockResolvedValue({
        url: 'https://www.douyin.com/video/123',
        title: 'Test Video',
        description: 'A test',
        author: 'Creator',
        videoUrl: 'https://example.com/video.mp4',
        coverUrl: 'https://example.com/cover.jpg'
      });

      const result = await agent.scrapeDouyin('https://www.douyin.com/video/123');

      expect(result.title).toBe('Test Video');
      expect(result.author).toBe('Creator');
      expect(result.videoUrl).toBe('https://example.com/video.mp4');
      expect(mockPage.goto).toHaveBeenCalledWith('https://www.douyin.com/video/123', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    });

    it('should handle non-douyin URL without mobile mode', async () => {
      const agent = new BrowserAgent();
      await agent.init();

      mockPage.evaluate.mockResolvedValue({
        url: 'https://other.com/video/123',
        title: '', description: '', author: '', videoUrl: '', coverUrl: ''
      });

      const setMobileSpy = jest.spyOn(agent, 'setMobileMode');
      await agent.scrapeDouyin('https://other.com/video/123');
      expect(setMobileSpy).toHaveBeenCalledWith(false);
    });

    it('should auto-init when page is null', async () => {
      const video = {
        src: 'https://example.com/v.mp4',
        poster: '',
        querySelector: () => null
      };
      douyinDom({ video, metaTags: [], author: null, scripts: [], href: 'https://www.douyin.com/video/9' });
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      const result = await agent.scrapeDouyin('https://www.douyin.com/video/9');
      expect(result.videoUrl).toBe('https://example.com/v.mp4');
      expect(result.url).toBe('https://www.douyin.com/video/9');
    });

    it('should execute scrapeDouyin callback with full metadata', async () => {
      const video = {
        src: 'https://example.com/video.mp4',
        poster: 'https://example.com/cover.jpg',
        querySelector: () => null
      };
      douyinDom({
        video,
        metaTags: [
          { name: 'title', content: 'Video Title', getAttribute: () => null },
          { name: 'og', content: 'OG Title', getAttribute: (a) => (a === 'property' ? 'og:title' : null) },
          { name: 'description', content: 'A description', getAttribute: () => null },
          { name: 'ogdesc', content: 'OG Desc', getAttribute: (a) => (a === 'property' ? 'og:description' : null) },
          { name: 'none', content: 'x', getAttribute: () => null }
        ],
        author: { textContent: '  Creator  ' },
        scripts: [
          { textContent: 'var playAddr : "https://example.com/play.mp4";' },
          { textContent: null }
        ]
      });
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.scrapeDouyin('https://www.douyin.com/video/123');
      expect(result.url).toBe('https://www.douyin.com/video/123');
      expect(result.title).toBe('OG Title');
      expect(result.description).toBe('OG Desc');
      expect(result.author).toBe('Creator');
      expect(result.videoUrl).toBe('https://example.com/play.mp4');
      expect(result.coverUrl).toBe('https://example.com/cover.jpg');
    });

    it('should execute scrapeDouyin callback with source fallback', async () => {
      const video = {
        src: '',
        poster: 'https://example.com/poster.jpg',
        querySelector: () => ({ src: 'https://example.com/source.webm' })
      };
      douyinDom({
        video,
        metaTags: [
          { name: 'other', content: 'y', getAttribute: () => null }
        ],
        author: null,
        scripts: [{ textContent: 'var x = 1;' }],
        href: 'https://v.douyin.com/abc/'
      });
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.scrapeDouyin('https://v.douyin.com/abc/');
      expect(result.videoUrl).toBe('https://example.com/source.webm');
      expect(result.author).toBe('');
      expect(result.title).toBe('');
    });

    it('should execute scrapeDouyin callback with poster fallback', async () => {
      const video = {
        src: '',
        poster: 'https://example.com/poster.jpg',
        querySelector: () => null
      };
      douyinDom({ video, metaTags: [], author: null, scripts: [] });
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.scrapeDouyin('https://www.douyin.com/video/3');
      expect(result.videoUrl).toBe('https://example.com/poster.jpg');
      expect(result.coverUrl).toBe('https://example.com/poster.jpg');
    });

    it('should execute scrapeDouyin callback without video', async () => {
      douyinDom({ video: null, metaTags: [], author: null, scripts: [] });
      mockPage.evaluate.mockImplementation((fn) => Promise.resolve(fn()));

      const agent = new BrowserAgent();
      await agent.init();

      const result = await agent.scrapeDouyin('https://www.douyin.com/video/4');
      expect(result.videoUrl).toBe('');
      expect(result.coverUrl).toBe('');
      expect(result.author).toBe('');
    });
  });

  describe('guard checks - throw when not initialized', () => {
    const methods = [
      ['goto', 'https://example.com'],
      ['click', '#btn'],
      ['type', '#input', 'text'],
      ['extract', '.item'],
      ['screenshot', {}],
      ['scroll', 'down'],
      ['waitForSelector', '.x'],
      ['waitForNetworkIdle'],
      ['scrollToLoad', '.x'],
      ['extractVideoUrl'],
      ['handleShortVideo'],
      ['waitForVideoLoad'],
      ['evaluate', () => {}],
      ['getPageContent'],
      ['getPageText'],
      ['download', 'url', '/path'],
      ['fillForm', {}],
      ['submitForm'],
      ['getElements', 'div'],
      ['waitForNavigation']
    ];

    methods.forEach(([method, ...args]) => {
      it(`${method} should throw when not initialized`, async () => {
        const agent = new BrowserAgent();
        await expect(agent[method](...args)).rejects.toThrow('Browser not initialized');
      });
    });
  });
});
