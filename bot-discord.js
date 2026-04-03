require('dotenv').config();

const path = require('path');
const ROOT_DIR = path.resolve(__dirname, '..');
const DiscordBot = require(path.resolve(ROOT_DIR, 'src/social/DiscordBot'));

const { PersonalityManager } = require(path.resolve(ROOT_DIR, 'src/personality/PersonalityManager'));
const ChatAgent = require(path.resolve(ROOT_DIR, 'src/agents/ChatAgent'));
const RouterAgent = require(path.resolve(ROOT_DIR, 'src/agents/RouterAgent'));
const MemoryAgent = require(path.resolve(ROOT_DIR, 'src/agents/MemoryAgent'));
const MediaAgent = require(path.resolve(ROOT_DIR, 'src/agents/MediaAgent'));
const GameAgent = require(path.resolve(ROOT_DIR, 'src/agents/GameAgent'));

const pm = new PersonalityManager(path.resolve(ROOT_DIR, 'data/personalities.json'));
pm.loadSync();

const chat = new ChatAgent(pm, { defaultModel: 'llama3.2' });
const memory = new MemoryAgent();
const media = new MediaAgent();
const game = new GameAgent();
const router = new RouterAgent(pm, chat, memory, media, game);

const bot = new DiscordBot({
  token: process.env.DISCORD_BOT_TOKEN,
  prefix: process.env.DISCORD_PREFIX || '!',
  agents: { router, pm, memory }
});

bot.registerCommand({
  name: 'help',
  description: '显示帮助信息',
  execute: async (message) => {
    await message.reply(`
可用命令：
!help - 显示帮助
!ping - 检查机器人状态
!personality [name] - 切换人格
!memory - 查看记忆统计
![message] - 和 AI 聊天
    `);
  }
});

bot.registerCommand({
  name: 'ping',
  description: '检查状态',
  execute: async (message) => {
    await message.reply(`机器人运行中！延迟: ${Date.now() - message.createdTimestamp}ms`);
  }
});

bot.registerCommand({
  name: 'personality',
  description: '切换人格',
  execute: async (message, args) => {
    const name = args[0];
    if (!name) {
      const current = pm.activeName;
      await message.reply(`当前人格: ${current}`);
      return;
    }
    
    const success = pm.setActive(name);
    if (success) {
      memory.remember('personality_switch', { to: name, at: new Date().toISOString() });
      await message.reply(`已切换到 ${name}`);
    } else {
      await message.reply(`人格 ${name} 不存在`);
    }
  }
});

bot.registerCommand({
  name: 'memory',
  description: '查看记忆统计',
  execute: async (message) => {
    const stats = memory.getStats();
    await message.reply(`记忆统计：共 ${stats.total} 条记录`);
  }
});

bot.start().catch(console.error);

process.on('SIGINT', () => {
  bot.stop();
  process.exit();
});
