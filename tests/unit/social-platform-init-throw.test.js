jest.mock('discord.js', () => {
  throw new Error('Cannot find module discord.js');
}, { virtual: true });

const { DiscordIntegration } = require('../../src/social/SocialPlatformIntegration');

describe('DiscordIntegration init - discord.js missing', () => {
  it('warns and keeps unavailable when discord.js cannot be loaded', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const discord = new DiscordIntegration({ token: 'test-token' });
    await discord.init();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not available'), expect.any(String));
    expect(discord.DISCORD_AVAILABLE).toBe(false);
    warnSpy.mockRestore();
  });
});
