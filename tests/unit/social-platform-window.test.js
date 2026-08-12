jest.mock('discord.js', () => {
  class MockClient {}
  return {
    Client: MockClient,
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4, DirectMessages: 8 },
    EmbedBuilder: class {}
  };
}, { virtual: true });

describe('SocialPlatformIntegration browser export', () => {
  it('attaches classes to window in browser environment', () => {
    global.window = {};
    const module = require('../../src/social/SocialPlatformIntegration');
    expect(global.window.DiscordIntegration).toBeDefined();
    expect(global.window.TelegramIntegration).toBeDefined();
    expect(global.window.SocialPlatformManager).toBeDefined();
    expect(module.DiscordIntegration).toBeDefined();
    delete global.window;
  });

  it('skips discord.js init when window is defined', async () => {
    global.window = {};
    const { DiscordIntegration } = require('../../src/social/SocialPlatformIntegration');
    const d = new DiscordIntegration({ token: 't' });
    await d.init();
    expect(d.client).toBeNull();
    expect(d.DISCORD_AVAILABLE).toBe(false);
    delete global.window;
  });
});
