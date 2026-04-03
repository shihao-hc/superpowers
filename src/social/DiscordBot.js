const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class DiscordBot {
  constructor(options = {}) {
    this.token = options.token || process.env.DISCORD_BOT_TOKEN;
    this.clientId = options.clientId || process.env.DISCORD_CLIENT_ID;
    this.prefix = options.prefix || '!';
    this.client = null;
    this.commands = new Collection();
    this.slashCommands = [];
    this.agents = options.agents || {};
    this.enabled = false;
    this.typingUsers = new Map();
    this.embedColors = {
      primary: 0x5865F2,
      success: 0x57F287,
      warning: 0xFEE75C,
      danger: 0xED4245,
      info: 0x7289DA
    };
    this.TYPING_TIMEOUT = 30000;
    this.MEMORY_RATE_LIMIT = 10;
    this.MEMORY_RATE_WINDOW = 60000;
    this.userMemoryCounts = new Map();
    this.MAX_MESSAGE_LENGTH = 1800;
    this.MAX_MEMORY_KEY_LENGTH = 100;
    this.MAX_MEMORY_VALUE_LENGTH = 500;
    this.MAX_CHAT_LENGTH = 500;
  }

  sanitizeInput(text, maxLength = 1800) {
    if (!text) return '';
    return String(text).substring(0, maxLength).trim();
  }

  async start() {
    if (!this.token) {
      console.log('[DiscordBot] No token configured, bot disabled');
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageReactions
      ]
    });

    this.client.on('ready', async () => {
      console.log(`[DiscordBot] Logged in as ${this.client.user.tag}`);
      this.enabled = true;
      await this.registerSlashCommands();
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await this.handleButton(interaction);
      } else if (interaction.isSelectMenu()) {
        await this.handleSelectMenu(interaction);
      }
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      const userId = message.author.id;
      const userRecord = this.typingUsers.get(userId);
      if (userRecord && Date.now() < userRecord.expiresAt) {
        await message.channel.send({ 
          embeds: [this.createEmbed('提示', '你已经有一个问题在处理中了哦~', 'warning')] 
        }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
        return;
      }
      
      if (!message.content.startsWith(this.prefix)) return;

      this.typingUsers.set(userId, { expiresAt: Date.now() + this.TYPING_TIMEOUT });
      
      const rawContent = this.sanitizeInput(message.content, this.MAX_MESSAGE_LENGTH + this.prefix.length);
      const args = rawContent.slice(this.prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      await this.handleCommand(message, commandName, args);
      this.typingUsers.delete(userId);
    });

    this.client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) return;
      await this.handleReaction(reaction, user, 'add');
    });

    this.client.on('messageReactionRemove', async (reaction, user) => {
      if (user.bot) return;
      await this.handleReaction(reaction, user, 'remove');
    });

    this.client.on('error', (error) => {
      console.error('[DiscordBot] Error:', error.message);
    });

    await this.client.login(this.token);
    
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [userId, record] of this.typingUsers.entries()) {
        if (now >= record.expiresAt) {
          this.typingUsers.delete(userId);
          cleaned++;
        }
      }
      if (cleaned > 0) console.log(`[DiscordBot] Cleaned up ${cleaned} typing records`);
    }, 60000);
  }

  createEmbed(title, description, color = 'primary', fields = []) {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(this.embedColors[color] || this.embedColors.primary)
      .setTimestamp();
    
    if (fields.length > 0) {
      embed.addFields(fields.map(f => ({ name: f.name, value: f.value, inline: f.inline || false })));
    }
    
    return embed;
  }

  createButton(id, label, style = 'primary', emoji = null) {
    const styleMap = {
      'primary': ButtonStyle.Primary,
      'secondary': ButtonStyle.Secondary,
      'success': ButtonStyle.Success,
      'danger': ButtonStyle.Danger,
      'link': ButtonStyle.Link
    };
    const buttonStyle = styleMap[style.toLowerCase()] || ButtonStyle.Primary;
    
    const button = new ButtonBuilder()
      .setCustomId(String(id).substring(0, 100))
      .setLabel(String(label).substring(0, 80))
      .setStyle(buttonStyle);
    if (emoji) button.setEmoji(emoji);
    return button;
  }

  createActionRow(components) {
    return new ActionRowBuilder().addComponents(components);
  }

  async registerSlashCommands() {
    if (!this.clientId) {
      console.log('[DiscordBot] No client ID for slash commands');
      return;
    }

    this.slashCommands = [
      {
        name: 'help',
        description: '显示帮助信息',
        options: [{
          name: 'command',
          type: 3,
          description: '查看特定命令的帮助',
          required: false
        }]
      },
      {
        name: 'ping',
        description: '检查机器人延迟'
      },
      {
        name: 'status',
        description: '显示系统状态'
      },
      {
        name: 'chat',
        description: '与AI聊天',
        options: [{
          name: 'message',
          type: 3,
          description: '你想说的话',
          required: true
        }]
      },
      {
        name: 'personality',
        description: '管理人格',
        options: [{
          name: 'action',
          type: 3,
          description: '操作类型',
          required: true,
          choices: [
            { name: '列表', value: 'list' },
            { name: '切换', value: 'switch' },
            { name: '当前', value: 'current' }
          ]
        }, {
          name: 'name',
          type: 3,
          description: '人格名称（切换时使用）',
          required: false
        }]
      },
      {
        name: 'memory',
        description: '记忆管理',
        options: [{
          name: 'action',
          type: 3,
          description: '操作类型',
          required: true,
          choices: [
            { name: '记住', value: 'remember' },
            { name: '回忆', value: 'recall' },
            { name: '列表', value: 'list' },
            { name: '搜索', value: 'search' },
            { name: '统计', value: 'stats' },
            { name: '清空', value: 'clear' }
          ]
        }, {
          name: 'key',
          type: 3,
          description: '记忆键名',
          required: false
        }, {
          name: 'value',
          type: 3,
          description: '记忆值（记住时使用）',
          required: false
        }, {
          name: 'query',
          type: 3,
          description: '搜索关键词',
          required: false
        }]
      },
      {
        name: 'game',
        description: '游戏控制',
        options: [{
          name: 'action',
          type: 3,
          description: '操作类型',
          required: true,
          choices: [
            { name: '状态', value: 'status' },
            { name: '连接', value: 'connect' },
            { name: '断开', value: 'disconnect' },
            { name: '命令', value: 'command' }
          ]
        }, {
          name: 'command',
          type: 3,
          description: '游戏命令',
          required: false
        }]
      },
      {
        name: 'roll',
        description: '掷骰子',
        options: [{
          name: 'dice',
          type: 3,
          description: '骰子格式 (如: 2d6)',
          required: false
        }]
      },
      {
        name: '8ball',
        description: 'Magic 8 Ball',
        options: [{
          name: 'question',
          type: 3,
          description: '你的问题',
          required: true
        }]
      },
      {
        name: 'avatar',
        description: '获取用户头像',
        options: [{
          name: 'user',
          type: 6,
          description: '用户',
          required: false
        }]
      },
      {
        name: 'userinfo',
        description: '获取用户信息',
        options: [{
          name: 'user',
          type: 6,
          description: '用户',
          required: false
        }]
      },
      {
        name: 'serverinfo',
        description: '获取服务器信息'
      },
      {
        name: 'poll',
        description: '创建投票',
        options: [{
          name: 'question',
          type: 3,
          description: '投票问题',
          required: true
        }, {
          name: 'options',
          type: 3,
          description: '选项（用逗号分隔，最多10个）',
          required: true
        }]
      }
    ];

    const rest = new REST({ version: '10' }).setToken(this.token);

    try {
      await rest.put(
        Routes.applicationCommands(this.clientId),
        { body: this.slashCommands }
      );
      console.log('[DiscordBot] Slash commands registered');
    } catch (error) {
      console.error('[DiscordBot] Failed to register slash commands:', error.message);
    }
  }

  async handleSlashCommand(interaction) {
    const { commandName } = interaction;
    
    const ADMIN_COMMANDS = ['personality', 'memory', 'game'];
    const GAME_COMMANDS = ['game'];
    
    if (ADMIN_COMMANDS.includes(commandName)) {
      const action = interaction.options.getString('action');
      if (GAME_COMMANDS.includes(commandName) && ['connect', 'disconnect'].includes(action)) {
        if (!this.isAdmin(interaction)) {
          await interaction.reply({
            embeds: [this.createEmbed('权限不足', '只有管理员才能执行此操作', 'danger')],
            ephemeral: true
          });
          return;
        }
      }
      if (action === 'clear' || action === 'switch') {
        if (!this.isAdmin(interaction)) {
          await interaction.reply({
            embeds: [this.createEmbed('权限不足', '只有管理员才能执行此操作', 'danger')],
            ephemeral: true
          });
          return;
        }
      }
    }

    try {
      switch (commandName) {
        case 'help':
          await this.cmdHelp(interaction);
          break;
        case 'ping':
          await this.cmdPing(interaction);
          break;
        case 'status':
          await this.cmdStatus(interaction);
          break;
        case 'chat':
          await this.cmdChat(interaction);
          break;
        case 'personality':
          await this.cmdPersonality(interaction);
          break;
        case 'memory':
          await this.cmdMemory(interaction);
          break;
        case 'game':
          await this.cmdGame(interaction);
          break;
        case 'roll':
          await this.cmdRoll(interaction);
          break;
        case '8ball':
          await this.cmd8Ball(interaction);
          break;
        case 'avatar':
          await this.cmdAvatar(interaction);
          break;
        case 'userinfo':
          await this.cmdUserInfo(interaction);
          break;
        case 'serverinfo':
          await this.cmdServerInfo(interaction);
          break;
        case 'poll':
          await this.cmdPoll(interaction);
          break;
      }
    } catch (error) {
      console.error(`[DiscordBot] Command error: ${error.message}`);
      await interaction.reply({ 
        embeds: [this.createEmbed('错误', '执行命令时出错了', 'danger')],
        ephemeral: true 
      });
    }
  }

  isAdmin(interaction) {
    const adminRoleIds = (process.env.DISCORD_ADMIN_ROLES || '').split(',').filter(r => r.trim());
    if (adminRoleIds.length === 0) return true;
    
    const member = interaction.member;
    if (!member) return false;
    
    if (member.permissions?.has('Administrator')) return true;
    
    return member.roles?.cache?.some(role => adminRoleIds.includes(role.id)) || false;
  }

  async cmdHelp(interaction) {
    const command = interaction.options.getString('command');
    
    const helpData = {
      general: {
        title: '📚 通用命令',
        commands: [
          '`/help [command]` - 显示帮助',
          '`/ping` - 检查延迟',
          '`/status` - 系统状态',
          '`/avatar [user]` - 获取头像',
          '`/userinfo [user]` - 用户信息',
          '`/serverinfo` - 服务器信息'
        ]
      },
      fun: {
        title: '🎮 娱乐命令',
        commands: [
          '`/roll [dice]` - 掷骰子 (如: 2d6)',
          '`/8ball <question>` - 魔法8球',
          '`/poll <question> <options>` - 创建投票'
        ]
      },
      ai: {
        title: '🤖 AI 命令',
        commands: [
          '`/chat <message>` - 与AI聊天',
          '`/personality list` - 查看人格列表',
          '`/personality switch <name>` - 切换人格',
          '`/personality current` - 当前人格',
          '`/memory stats` - 记忆统计',
          '`/memory search <query>` - 搜索记忆',
          '`/memory clear` - 清空记忆'
        ]
      },
      game: {
        title: '🎮 游戏命令',
        commands: [
          '`/game status` - 游戏状态',
          '`/game connect` - 连接游戏',
          '`/game disconnect` - 断开游戏',
          '`/game command <cmd>` - 发送游戏命令'
        ]
      }
    };

    if (command) {
      for (const category of Object.values(helpData)) {
        const found = category.commands.find(c => c.includes(`/${command}`));
        if (found) {
          await interaction.reply({
            embeds: [this.createEmbed(`帮助: /${command}`, found, 'info')],
            ephemeral: true
          });
          return;
        }
      }
      await interaction.reply({
        embeds: [this.createEmbed('帮助', `未找到命令: /${command}`, 'warning')],
        ephemeral: true
      });
      return;
    }

    const embed = this.createEmbed('🤖 UltraWork AI 帮助菜单', '选择一个分类查看命令');
    
    for (const cat of Object.values(helpData)) {
      embed.addFields({ 
        name: cat.title, 
        value: cat.commands.join('\n'), 
        inline: true 
      });
    }

    await interaction.reply({ embeds: [embed] });
  }

  async cmdPing(interaction) {
    const ping = Date.now() - interaction.createdTimestamp;
    const apiPing = this.client.ws.ping;
    
    const embed = this.createEmbed('🏓 Pong!', '', 'success', [
      { name: '延迟', value: `${ping}ms`, inline: true },
      { name: 'API延迟', value: `${apiPing}ms`, inline: true }
    ]);
    
    await interaction.reply({ embeds: [embed] });
  }

  async cmdStatus(interaction) {
    const router = this.agents.router;
    const memory = this.agents.memory;
    const pm = this.agents.pm;
    
    const fields = [
      { name: '状态', value: '🟢 在线', inline: true },
      { name: '服务器', value: `${this.client.guilds.cache.size} 个`, inline: true }
    ];
    
    if (router) {
      fields.push({ name: 'AI引擎', value: 'Ollama', inline: true });
    }
    
    if (pm) {
      fields.push({ name: '当前人格', value: pm.activeName || '未知', inline: true });
    }
    
    if (memory && memory.getStats) {
      const stats = memory.getStats();
      fields.push({ name: '记忆条目', value: `${stats.count || 0}`, inline: true });
    }
    
    await interaction.reply({
      embeds: [this.createEmbed('📊 系统状态', '', 'info', fields)]
    });
  }

  async cmdChat(interaction) {
    const message = this.sanitizeInput(interaction.options.getString('message'), this.MAX_CHAT_LENGTH);
    
    await interaction.deferReply();
    
    try {
      const router = this.agents.router;
      if (router) {
        const result = await router.routeMessage(message);
        await interaction.editReply({
          embeds: [this.createEmbed('💬 AI 回复', result.reply || '...', 'primary')]
        });
      } else {
        await interaction.editReply({
          embeds: [this.createEmbed('错误', 'AI未配置', 'danger')]
        });
      }
    } catch (error) {
      await interaction.editReply({
        embeds: [this.createEmbed('错误', error.message, 'danger')]
      });
    }
  }

  async cmdPersonality(interaction) {
    const action = interaction.options.getString('action');
    const name = interaction.options.getString('name');
    const pm = this.agents.pm;
    
    if (!pm) {
      await interaction.reply({
        embeds: [this.createEmbed('错误', '人格系统未配置', 'danger')],
        ephemeral: true
      });
      return;
    }
    
    switch (action) {
      case 'list': {
        const personalities = Object.keys(pm.personalities || {});
        const list = personalities.map(p => {
          const isActive = p === pm.activeName;
          return `${isActive ? '🟢' : '⚪'} **${p}**`;
        }).join('\n');
        
        await interaction.reply({
          embeds: [this.createEmbed('👥 人格列表', list, 'info')]
        });
        break;
      }
      
      case 'switch': {
        if (!name) {
          await interaction.reply({
            embeds: [this.createEmbed('错误', '请指定人格名称', 'warning')],
            ephemeral: true
          });
          return;
        }
        
        const success = pm.setActive(name);
        if (success) {
          await interaction.reply({
            embeds: [this.createEmbed('✅ 已切换', `当前人格: **${name}**`, 'success')]
          });
        } else {
          await interaction.reply({
            embeds: [this.createEmbed('错误', `未找到人格: ${name}`, 'danger')],
            ephemeral: true
          });
        }
        break;
      }
      
      case 'current': {
        const current = pm.getCurrentPersonality?.() || pm.active;
        const mood = pm.getMood?.() || 'unknown';
        
        await interaction.reply({
          embeds: [this.createEmbed('👤 当前人格', 
            `**名称**: ${pm.activeName}\n**心情**: ${mood}\n**描述**: ${current?.description || '无'}`, 
            'info'
          )]
        });
        break;
      }
    }
  }

  async cmdMemory(interaction) {
    const action = interaction.options.getString('action');
    const query = this.sanitizeInput(interaction.options.getString('query'), 200);
    const key = this.sanitizeInput(interaction.options.getString('key'), this.MAX_MEMORY_KEY_LENGTH);
    const value = this.sanitizeInput(interaction.options.getString('value'), this.MAX_MEMORY_VALUE_LENGTH);
    const memory = this.agents.memory;
    
    if (!memory) {
      await interaction.reply({
        embeds: [this.createEmbed('错误', '记忆系统未配置', 'danger')],
        ephemeral: true
      });
      return;
    }
    
    switch (action) {
      case 'remember': {
        const keyName = key;
        const keyValue = value;
        if (!keyName) {
          await interaction.reply({
            embeds: [this.createEmbed('错误', '请提供记忆键名', 'warning')],
            ephemeral: true
          });
          return;
        }
        memory.remember(`discord_${interaction.user.id}_${keyName}`, {
          value: keyValue || '',
          user: interaction.user.tag,
          createdAt: new Date().toISOString()
        });
        await interaction.reply({
          embeds: [this.createEmbed('✅ 已记住', `**${keyName}**: ${keyValue || '(空)'}`, 'success')]
        });
        break;
      }
      
      case 'recall': {
        if (!key) {
          await interaction.reply({
            embeds: [this.createEmbed('错误', '请提供记忆键名', 'warning')],
            ephemeral: true
          });
          return;
        }
        let result = memory.retrieve(`discord_${interaction.user.id}_${key}`);
        if (!result && this.isAdmin(interaction)) {
          result = memory.retrieve(`discord_all_${key}`) || memory.retrieve(key);
        }
        if (result) {
          const displayValue = typeof result === 'object' ? result.value : result;
          await interaction.reply({
            embeds: [this.createEmbed('📝 回忆', `**${key}**: ${displayValue}`, 'info')]
          });
        } else {
          await interaction.reply({
            embeds: [this.createEmbed('❌ 未找到', `没有找到记忆: ${key}`, 'warning')],
            ephemeral: true
          });
        }
        break;
      }
      
      case 'list': {
        const all = memory.dump?.() || {};
        const userKeys = Object.keys(all).filter(k => k.startsWith(`discord_${interaction.user.id}_`));
        const displayKeys = userKeys.slice(0, 10).map(k => k.replace(`discord_${interaction.user.id}_`, '')).join(', ') || '无';
        await interaction.reply({
          embeds: [this.createEmbed('📋 我的记忆', `共 ${userKeys.length} 条记忆\n${displayKeys}`, 'info')]
        });
        break;
      }
      
      case 'search': {
        if (!query) {
          await interaction.reply({
            embeds: [this.createEmbed('错误', '请提供搜索关键词', 'warning')],
            ephemeral: true
          });
          return;
        }
        
        const results = memory.list?.({ query, pageSize: 10 }) || { entries: [] };
        if (results.entries.length === 0) {
          await interaction.reply({
            embeds: [this.createEmbed('搜索结果', '没有找到相关记忆', 'info')]
          });
        } else {
          const list = results.entries.slice(0, 5).map(e => `• ${e[0]}`).join('\n');
          await interaction.reply({
            embeds: [this.createEmbed('🔍 搜索结果', list, 'info')]
          });
        }
        break;
      }
      
      case 'stats': {
        const stats = memory.getStats?.() || { count: 0 };
        await interaction.reply({
          embeds: [this.createEmbed('📊 记忆统计', `**总条目**: ${stats.count || 0}`, 'info')]
        });
        break;
      }
      
      case 'clear': {
        if (!this.isAdmin(interaction)) {
          await interaction.reply({
            embeds: [this.createEmbed('权限不足', '只有管理员才能清空记忆', 'danger')],
            ephemeral: true
          });
          return;
        }
        memory.remember?.('__cleared__', Date.now());
        await interaction.reply({
          embeds: [this.createEmbed('✅ 已清空', '记忆已清空', 'success')]
        });
        break;
      }
    }
  }

  async cmdGame(interaction) {
    const action = interaction.options.getString('action');
    const command = interaction.options.getString('command');
    const game = this.agents.game;
    
    switch (action) {
      case 'status': {
        if (game && game.getStatus) {
          const status = game.getStatus();
          await interaction.reply({
            embeds: [this.createEmbed('🎮 游戏状态', 
              `**连接**: ${status.connected ? '🟢 已连接' : '🔴 未连接'}\n**血量**: ${status.health || 0}/20`,
              'info'
            )]
          });
        } else {
          await interaction.reply({
            embeds: [this.createEmbed('游戏', '游戏模块未启用', 'warning')]
          });
        }
        break;
      }
      
      case 'command': {
        if (!command) {
          await interaction.reply({
            embeds: [this.createEmbed('错误', '请提供命令', 'warning')],
            ephemeral: true
          });
          return;
        }
        
        await interaction.reply({
          embeds: [this.createEmbed('⏳ 执行中', `正在执行: ${command}`, 'info')]
        });
        break;
      }
      
      default:
        await interaction.reply({
          embeds: [this.createEmbed('🎮 游戏控制', 
            '`/game status` - 状态\n`/game connect` - 连接\n`/game disconnect` - 断开\n`/game command <cmd>` - 命令',
            'info'
          )]
        });
    }
  }

  async cmdRoll(interaction) {
    const diceStr = interaction.options.getString('dice') || '1d6';
    const match = diceStr.match(/^(\d+)d(\d+)$/);
    
    if (!match) {
      const roll = Math.floor(Math.random() * 6) + 1;
      await interaction.reply({
        embeds: [this.createEmbed('🎲 掷骰子', `你掷出了 **${roll}** !`, 'success')]
      });
      return;
    }
    
    const count = Math.min(parseInt(match[1]), 100);
    const sides = Math.min(parseInt(match[2]), 1000);
    
    const rolls = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }
    
    const total = rolls.reduce((a, b) => a + b, 0);
    const rollList = count <= 10 ? rolls.join(', ') : `${rolls.slice(0, 5).join(', ')}... (+${count - 5}个)`;
    
    await interaction.reply({
      embeds: [this.createEmbed('🎲 掷骰子', 
        `**${diceStr}**\n\n结果: ${rollList}\n\n**总计: ${total}**`,
        'success'
      )]
    });
  }

  async cmd8Ball(interaction) {
    const question = interaction.options.getString('question');
    const answers = [
      '是的，绝对是。', '不是。', '可能吧...', '很有可能！',
      '不太确定', '问得好，我选择沉默', '看起来是这样',
      '别指望了', '肯定的！', '绝对不会', '也许是？', '我的答案是肯定的'
    ];
    
    const answer = answers[Math.floor(Math.random() * answers.length)];
    
    await interaction.reply({
      embeds: [this.createEmbed('🎱 Magic 8 Ball', 
        `**问题**: ${question}\n\n**回答**: ${answer}`,
        'info'
      )]
    });
  }

  async cmdAvatar(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    
    const embed = this.createEmbed(`${user.username} 的头像`, '', 'info')
      .setImage(user.displayAvatarURL({ size: 512, dynamic: true }))
      .setThumbnail(user.displayAvatarURL({ size: 128, dynamic: true }));
    
    await interaction.reply({ embeds: [embed] });
  }

  async cmdUserInfo(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild?.members.fetch(user.id);
    
    const fields = [
      { name: '用户名', value: user.username, inline: true },
      { name: 'ID', value: user.id, inline: true },
      { name: '加入Discord', value: new Date(user.createdTimestamp).toLocaleDateString('zh-CN'), inline: true }
    ];
    
    if (member) {
      fields.push({ name: '加入服务器', value: new Date(member.joinedTimestamp).toLocaleDateString('zh-CN'), inline: true });
      fields.push({ name: '昵称', value: member.nickname || '无', inline: true });
      fields.push({ name: '角色', value: member.roles.cache.map(r => r.name).filter(n => n !== '@everyone').join(', ') || '无', inline: false });
    }
    
    const embed = this.createEmbed(`${user.username} 的信息`, '', 'info', fields)
      .setThumbnail(user.displayAvatarURL({ size: 128, dynamic: true }));
    
    await interaction.reply({ embeds: [embed] });
  }

  async cmdServerInfo(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        embeds: [this.createEmbed('错误', '只能在服务器中使用', 'danger')],
        ephemeral: true
      });
      return;
    }
    
    const fields = [
      { name: '服务器名', value: guild.name, inline: true },
      { name: '成员数', value: `${guild.memberCount}`, inline: true },
      { name: '创建时间', value: new Date(guild.createdTimestamp).toLocaleDateString('zh-CN'), inline: true },
      { name: '频道数', value: `${guild.channels.cache.size}`, inline: true },
      { name: '角色数', value: `${guild.roles.cache.size}`, inline: true },
      { name: 'Emoji数', value: `${guild.emojis.cache.size}`, inline: true }
    ];
    
    const embed = this.createEmbed(`📊 ${guild.name}`, '', 'info', fields)
      .setThumbnail(guild.iconURL({ size: 128, dynamic: true }));
    
    await interaction.reply({ embeds: [embed] });
  }

  async cmdPoll(interaction) {
    const question = interaction.options.getString('question');
    const optionsStr = interaction.options.getString('options');
    const options = optionsStr.split(',').map(o => o.trim()).slice(0, 10);
    
    if (options.length < 2) {
      await interaction.reply({
        embeds: [this.createEmbed('错误', '至少需要2个选项', 'warning')],
        ephemeral: true
      });
      return;
    }
    
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const pollText = options.map((opt, i) => `${emojis[i]} ${opt}`).join('\n');
    
    const embed = this.createEmbed('📊 投票', 
      `**${question}**\n\n${pollText}\n\n*由 ${interaction.user} 创建*`,
      'info'
    );
    
    const row = new ActionRowBuilder().addComponents(
      options.slice(0, 5).map((_, i) => this.createButton(`poll_${i}`, '', 'success', emojis[i])),
      options.slice(5, 10).map((_, i) => this.createButton(`poll_${i + 5}`, '', 'success', emojis[i + 5]))
    );
    
    await interaction.reply({ embeds: [embed], components: [row] });
  }

  async handleButton(interaction) {
    const [type, ...args] = interaction.customId.split('_');
    
    if (type === 'poll') {
      await interaction.reply({
        embeds: [this.createEmbed('✅ 已投票', `你选择了选项 ${parseInt(args[0]) + 1}`, 'success')],
        ephemeral: true
      });
    }
  }

  async handleSelectMenu(interaction) {
    await interaction.reply({
      content: `你选择了: ${interaction.values.join(', ')}`,
      ephemeral: true
    });
  }

  async handleReaction(reaction, user, action) {
    // 可以添加反应处理逻辑
  }

  async handleCommand(message, commandName, args) {
    const memory = this.agents.memory;
    const pm = this.agents.pm;
    
    if (commandName === 'remember' || commandName === 'r') {
      if (!memory) {
        await message.reply('记忆系统未配置');
        return;
      }
      const key = args[0];
      const value = args.slice(1).join(' ');
      if (!key) {
        await message.reply('用法: !remember <key> <value>');
        return;
      }
      memory.remember(`discord_${message.author.id}_${key}`, {
        value: value || '',
        user: message.author.tag,
        createdAt: new Date().toISOString()
      });
      await message.reply(`✅ 已记住: ${key}`);
      return;
    }
    
    if (commandName === 'recall' || commandName === 'rc') {
      if (!memory) {
        await message.reply('记忆系统未配置');
        return;
      }
      const key = args[0];
      if (!key) {
        await message.reply('用法: !recall <key>');
        return;
      }
      const result = memory.retrieve(`discord_${message.author.id}_${key}`) || 
                     memory.retrieve(`discord_all_${key}`) ||
                     memory.retrieve(key);
      if (result) {
        const value = typeof result === 'object' ? result.value : result;
        await message.reply(`📝 **${key}**: ${value}`);
      } else {
        await message.reply(`❌ 未找到记忆: ${key}`);
      }
      return;
    }
    
    if (commandName === 'forget') {
      if (!memory) {
        await message.reply('记忆系统未配置');
        return;
      }
      const key = args[0];
      if (!key) {
        await message.reply('用法: !forget <key>');
        return;
      }
      memory.remove(`discord_${message.author.id}_${key}`);
      memory.remove(`discord_all_${key}`);
      memory.remove(key);
      await message.reply(`🗑️ 已忘记: ${key}`);
      return;
    }
    
    if (commandName === 'memories' || commandName === 'mlist') {
      if (!memory) {
        await message.reply('记忆系统未配置');
        return;
      }
      const stats = memory.getStats?.() || { count: 0 };
      const all = memory.dump?.() || {};
      const userKeys = Object.keys(all).filter(k => k.startsWith(`discord_${message.author.id}_`));
      await message.reply(`📊 记忆统计:\n- 总条目: ${stats.count || 0}\n- 你的记忆: ${userKeys.length}`);
      return;
    }
    
    if (commandName === 'setglobal' && this.isAdmin(message)) {
      if (!memory || !args[0] || !args[1]) {
        await message.reply('用法: !setglobal <key> <value>');
        return;
      }
      memory.remember(`discord_all_${args[0]}`, {
        value: args.slice(1).join(' '),
        user: message.author.tag,
        createdAt: new Date().toISOString()
      });
      await message.reply(`✅ 已设置全局记忆: ${args[0]}`);
      return;
    }
    
    if (commandName === 'personality' || commandName === 'p') {
      if (!pm) {
        await message.reply('人格系统未配置');
        return;
      }
      
      const sub = args[0]?.toLowerCase();
      
      if (sub === 'list' || sub === 'ls') {
        const personalities = Object.keys(pm.personalities || {});
        const list = personalities.map(p => {
          const isActive = p === pm.activeName;
          return `${isActive ? '🟢' : '⚪'} **${p}**`;
        }).join('\n');
        await message.reply({ embeds: [this.createEmbed('👥 人格列表', list, 'info')] });
        return;
      }
      
      if (sub === 'switch' || sub === 'set') {
        const name = args[1];
        if (!name) {
          await message.reply('用法: !personality switch <name>');
          return;
        }
        const success = pm.setActive(name);
        if (success) {
          await message.reply(`✅ 已切换到人格: **${name}**`);
        } else {
          await message.reply(`❌ 未找到人格: ${name}`);
        }
        return;
      }
      
      if (sub === 'current' || sub === 'now') {
        const mood = pm.getMood?.() || 'unknown';
        await message.reply(`当前人格: **${pm.activeName}** | 心情: ${mood}`);
        return;
      }
      
      await message.reply('用法:\n!personality list - 查看列表\n!personality switch <name> - 切换\n!personality current - 当前人格');
      return;
    }
    
    const command = this.commands.get(commandName);
    if (command) {
      try {
        await command.execute(message, args, this.agents);
      } catch (error) {
        console.error(`[DiscordBot] Command error: ${error.message}`);
        await message.reply('执行命令时出错');
      }
    } else {
      await this.handleChat(message, args.join(' '));
    }
  }
  
  isAdmin(message) {
    if (!message.member) return false;
    if (message.member.permissions?.has('Administrator')) return true;
    const adminRoleIds = (process.env.DISCORD_ADMIN_ROLES || '').split(',').filter(r => r.trim());
    return message.member.roles?.cache?.some(role => adminRoleIds.includes(role.id)) || false;
  }

  registerCommand(name, command) {
    this.commands.set(name, command);
  }

  async handleChat(message, text) {
    if (!text) {
      await message.reply('请输入内容');
      return;
    }

    const sanitizedText = this.sanitizeInput(text, this.MAX_CHAT_LENGTH);
    if (!sanitizedText) {
      await message.reply('输入无效');
      return;
    }

    try {
      const router = this.agents.router;
      const memory = this.agents.memory;
      
      if (memory) {
        const now = Date.now();
        const userRecord = this.userMemoryCounts.get(message.author.id) || { count: 0, windowStart: now };
        if (now - userRecord.windowStart > this.MEMORY_RATE_WINDOW) {
          userRecord.count = 0;
          userRecord.windowStart = now;
        }
        if (userRecord.count < this.MEMORY_RATE_LIMIT) {
          memory.remember(`discord_chat_${message.author.id}_${now}`, {
            user: message.author.tag,
            content: sanitizedText,
            guild: message.guild?.name,
            channel: message.channel.name,
            timestamp: new Date().toISOString()
          });
          userRecord.count++;
          this.userMemoryCounts.set(message.author.id, userRecord);
        }
      }
      
      if (router) {
        const result = await router.routeMessage(sanitizedText);
        const reply = this.sanitizeInput(result.reply, this.MAX_MESSAGE_LENGTH);
        await message.reply(reply || '好的');
      } else {
        await message.reply('AI 未配置');
      }
    } catch (error) {
      console.error('[DiscordBot] Chat error:', error.message);
      await message.reply('处理消息时出错');
    }
  }

  async sendDM(userId, content) {
    if (!this.client) return;
    try {
      const user = await this.client.users.fetch(userId);
      if (user) {
        await user.send(content);
      }
    } catch (error) {
      console.error('[DiscordBot] DM error:', error.message);
    }
  }

  async broadcast(content, channelId = null) {
    if (!this.client) return;
    
    try {
      if (channelId) {
        const channel = await this.client.channels.fetch(channelId);
        if (channel) await channel.send(content);
      } else {
        for (const guild of this.client.guilds.cache.values()) {
          if (guild.systemChannel) {
            await guild.systemChannel.send(content);
          }
        }
      }
    } catch (error) {
      console.error('[DiscordBot] Broadcast error:', error.message);
    }
  }

  async sendToChannel(channelId, embed) {
    if (!this.client) return;
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel) {
        if (typeof embed === 'string') {
          await channel.send(embed);
        } else {
          await channel.send({ embeds: [embed] });
        }
      }
    } catch (error) {
      console.error('[DiscordBot] Send error:', error.message);
    }
  }

  notifyGameEvent(eventType, data) {
    const gameChannelId = process.env.DISCORD_GAME_CHANNEL;
    if (!gameChannelId) return;
    
    const eventMessages = {
      'hurt': `🎮 **游戏事件**: 机器人在游戏中受伤了！当前血量: ${data.health || 0}/20`,
      'died': `💀 **游戏事件**: 呜呜...机器人在游戏中死掉了...`,
      'playerJoined': `👋 **游戏事件**: 玩家 ${data.player} 加入了服务器`,
      'playerLeft': `👋 **游戏事件**: 玩家 ${data.player} 离开了服务器`,
      'connected': `🟢 **游戏事件**: 机器人已连接到游戏服务器`,
      'disconnected': `🔴 **游戏事件**: 机器人已断开与游戏服务器的连接`,
      'lowHealth': `⚠️ **警告**: 机器人血量过低 (${data.health}/20)！`,
      'foundTreasure': `💎 **游戏事件**: 发现珍宝！`
    };
    
    const message = eventMessages[eventType];
    if (message) {
      const embed = this.createEmbed('🎮 游戏联动', message, 
        eventType === 'died' || eventType === 'lowHealth' ? 'danger' : 
        eventType === 'connected' ? 'success' : 'info'
      );
      this.sendToChannel(gameChannelId, embed);
    }
  }

  setupGameNotifications(gameAgent) {
    if (!gameAgent) return;
    
    gameAgent.on?.('hurt', (data) => {
      this.notifyGameEvent('hurt', data);
    });
    
    gameAgent.on?.('died', (data) => {
      this.notifyGameEvent('died', data);
    });
    
    gameAgent.on?.('playerJoined', (data) => {
      this.notifyGameEvent('playerJoined', data);
    });
    
    gameAgent.on?.('playerLeft', (data) => {
      this.notifyGameEvent('playerLeft', data);
    });
    
    gameAgent.on?.('connected', () => {
      this.notifyGameEvent('connected');
    });
    
    gameAgent.on?.('disconnected', () => {
      this.notifyGameEvent('disconnected');
    });
    
    console.log('[DiscordBot] Game notifications enabled');
  }

  stop() {
    if (this.client) {
      this.client.destroy();
      this.enabled = false;
      console.log('[DiscordBot] Bot stopped');
    }
  }

  getStatus() {
    return {
      enabled: this.enabled,
      connected: this.client?.readyAt ? true : false,
      guilds: this.client?.guilds.cache.size || 0,
      commands: this.slashCommands.length
    };
  }
}

module.exports = DiscordBot;
