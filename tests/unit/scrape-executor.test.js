const DynamicScraper = require('../../src/agent/DynamicScraper');
DynamicScraper.DynamicScraper.prototype.init = jest.fn().mockResolvedValue();
DynamicScraper.DynamicScraper.prototype.scrape = jest.fn().mockResolvedValue({ title: '测试页', content: '网页内容' });
DynamicScraper.DynamicScraper.prototype.close = jest.fn().mockResolvedValue();

const { ScrapeExecutor, isSafeUrl } = require('../../src/skills/executors/ScrapeExecutor');

describe('ScrapeExecutor', () => {
  describe('isSafeUrl (SSRF protection)', () => {
    const safe = ['http://example.com', 'https://www.example.com/page'];
    const blocked = ['http://localhost:8080', 'http://127.0.0.1', 'http://10.0.0.1', 'http://192.168.1.1', 'http://172.16.0.1', 'file:///etc/passwd', 'ftp://example.com', 'not-a-url', 'http://0.0.0.0', 'http://[::1]'];
    it('allows public http(s) URLs', () => {
      safe.forEach((u) => expect(isSafeUrl(u)).toBe(true));
    });
    it('blocks internal/private/non-http URLs', () => {
      blocked.forEach((u) => expect(isSafeUrl(u)).toBe(false));
    });
  });

  describe('execute', () => {
    beforeEach(() => { DynamicScraper.DynamicScraper.prototype.scrape.mockClear(); });

    it('scrapes a public URL', async () => {
      const r = await ScrapeExecutor.execute({ url: 'https://example.com' });
      expect(r.type).toBe('scrape');
      expect(r.data.title).toBe('测试页');
      expect(DynamicScraper.DynamicScraper.prototype.scrape).toHaveBeenCalledWith('https://example.com', {});
    });

    it('rejects internal URLs with SSRF error', async () => {
      await expect(ScrapeExecutor.execute({ url: 'http://localhost:8080' })).rejects.toThrow('SSRF');
      expect(DynamicScraper.DynamicScraper.prototype.scrape).not.toHaveBeenCalled();
    });

    it('throws when url missing', async () => {
      await expect(ScrapeExecutor.execute({})).rejects.toThrow('url');
    });

    it('throws on non-string url', async () => {
      await expect(ScrapeExecutor.execute({ url: 123 })).rejects.toThrow('url');
    });
  });
});