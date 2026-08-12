jest.mock('playwright', () => {
  throw new Error('Cannot find module playwright');
});

const { BrowserAgent } = require('../../src/agent/BrowserAgent');

describe('BrowserAgent init - playwright missing', () => {
  it('should throw a helpful error when playwright is not installed', async () => {
    const agent = new BrowserAgent();
    await expect(agent.init()).rejects.toThrow('Playwright not installed');
  });
});
