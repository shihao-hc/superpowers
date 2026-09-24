const { BrowserAgent } = require('../../src/agent/BrowserAgent');

describe('BrowserAgent hand extensions (graceful degradation without browser)', () => {
  let agent;

  beforeEach(() => {
    agent = new BrowserAgent({ headless: true });
  });

  it('waitForText returns structured failure before init', async () => {
    const r = await agent.waitForText('x');
    expect(r.success).toBe(false);
    expect(r.error).toContain('Browser not initialized');
  });

  it('waitForURL returns structured failure before init', async () => {
    const r = await agent.waitForURL('x');
    expect(r.success).toBe(false);
  });

  it('scrollToBottom returns structured failure before init', async () => {
    const r = await agent.scrollToBottom();
    expect(r.success).toBe(false);
  });

  it('newTab returns structured failure before init', async () => {
    const r = await agent.newTab('https://example.com');
    expect(r.success).toBe(false);
  });

  it('switchTab/closeTab handle out-of-range gracefully', async () => {
    const sw = await agent.switchTab(5);
    expect(sw.success).toBe(false);
    expect(sw.error).toContain('越界');
    const cl = await agent.closeTab();
    expect(cl.success).toBe(false);
  });
});