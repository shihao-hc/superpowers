/**
 * ShiHao Command Service
 * 基于 Claude Code 命令系统架构
 * 
 * Claude Code 特性:
 * - 3种命令类型: prompt, local, localjsx
 * - 命令别名
 * - 可用性检查 (claude-ai, console)
 * - 动态启用/禁用
 * - 条件加载 (Dead Code Elimination)
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class CommandService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.commands = new Map();
    this.aliases = new Map();
    
    // 可用性检查
    this.availabilityCheck = options.availabilityCheck || (() => true);
    
    // 命令加载器
    this.loaders = {
      builtin: this._loadBuiltinCommands.bind(this),
      skill: this._loadSkillCommands.bind(this),
      plugin: this._loadPluginCommands.bind(this),
      mcp: this._loadMCPCommands.bind(this)
    };
    
    // 已加载的来源
    this.loadedSources = new Set();
  }
  
  // 注册命令
  register(command) {
    if (!command.name) {
      throw new Error('Command must have a name');
    }
    
    // 验证命令类型
    if (!['prompt', 'local', 'localjsx'].includes(command.type)) {
      throw new Error(`Invalid command type: ${command.type}`);
    }
    
    // 验证必需字段
    if (command.type === 'prompt' && !command.getPromptForCommand) {
      throw new Error('Prompt command must have getPromptForCommand');
    }
    
    if (command.type === 'local' && !command.handler) {
      throw new Error('Local command must have handler');
    }
    
    if (command.type === 'localjsx' && !command.component) {
      throw new Error('LocalJSX command must have component');
    }
    
    const cmd = {
      name: command.name,
      description: command.description || '',
      aliases: command.aliases || [],
      type: command.type,
      availability: command.availability || null,
      isEnabled: command.isEnabled || (() => true),
      isHidden: command.isHidden || false,
      source: command.source || 'builtin',
      loadedFrom: command.loadedFrom || 'builtin',
      ...command
    };
    
    this.commands.set(cmd.name, cmd);
    
    // 注册别名
    for (const alias of cmd.aliases) {
      this.aliases.set(alias, cmd.name);
    }
    
    this.emit('commandRegistered', { name: cmd.name, type: cmd.type });
    
    return cmd;
  }
  
  // 批量注册
  registerMany(commands) {
    return commands.map(cmd => this.register(cmd));
  }
  
  // 注销命令
  unregister(name) {
    const command = this.commands.get(name);
    if (!command) return false;
    
    // 移除别名
    for (const alias of command.aliases) {
      this.aliases.delete(alias);
    }
    
    this.commands.delete(name);
    this.emit('commandUnregistered', { name });
    
    return true;
  }
  
  // 获取命令
  get(name) {
    // 检查别名
    const actualName = this.aliases.get(name) || name;
    return this.commands.get(actualName);
  }
  
  // 获取所有命令
  getAll(options = {}) {
    const commands = [];
    
    for (const [, cmd] of this.commands) {
      // 检查是否隐藏
      if (options.includeHidden !== true && cmd.isHidden) {
        continue;
      }
      
      // 检查启用状态
      if (!cmd.isEnabled()) {
        continue;
      }
      
      // 检查可用性
      if (cmd.availability && !this._checkAvailability(cmd)) {
        continue;
      }
      
      commands.push(cmd);
    }
    
    return commands;
  }
  
  // 按类型获取
  getByType(type) {
    return this.getAll().filter(cmd => cmd.type === type);
  }
  
  // 检查命令是否存在
  has(name) {
    return this.aliases.has(name) || this.commands.has(name);
  }
  
  // 执行命令
  async execute(name, args = {}, context = {}) {
    const command = this.get(name);
    
    if (!command) {
      throw new Error(`Command not found: ${name}`);
    }
    
    // 检查启用状态
    if (!command.isEnabled()) {
      throw new Error(`Command disabled: ${name}`);
    }
    
    // 检查可用性
    if (command.availability && !this._checkAvailability(command)) {
      throw new Error(`Command not available: ${name}`);
    }
    
    this.emit('commandExecuting', { name, args });
    
    try {
      let result;
      
      switch (command.type) {
        case 'prompt':
          result = await command.getPromptForCommand(args, context);
          break;
        case 'local':
          result = await command.handler(args, context);
          break;
        case 'localjsx':
          result = command.component;
          break;
        default:
          throw new Error(`Unknown command type: ${command.type}`);
      }
      
      this.emit('commandExecuted', { name, result });
      return result;
      
    } catch (error) {
      this.emit('commandError', { name, error: error.message });
      throw error;
    }
  }
  
  // 检查可用性
  _checkAvailability(command) {
    if (!command.availability || command.availability.length === 0) {
      return true;
    }
    
    return command.availability.some(a => {
      switch (a) {
        case 'claude-ai':
          return this.availabilityCheck.isClaudeAI();
        case 'console':
          return this.availabilityCheck.isConsole();
        default:
          return false;
      }
    });
  }
  
  // 加载内置命令
  async _loadBuiltinCommands() {
    if (this.loadedSources.has('builtin')) return;
    
    // 默认命令
    const builtinCommands = [
      {
        name: 'help',
        description: '显示帮助信息',
        type: 'prompt',
        aliases: ['h', '?'],
        getPromptForCommand: async (args, context) => {
          const commands = this.getAll();
          return commands.map(c => `/${c.name}: ${c.description}`).join('\n');
        }
      },
      {
        name: 'status',
        description: '显示系统状态',
        type: 'local',
        aliases: ['st'],
        handler: async (args, context) => {
          return {
            status: 'running',
            uptime: process.uptime(),
            memory: process.memoryUsage()
          };
        }
      },
      {
        name: 'compact',
        description: '压缩当前对话上下文',
        type: 'local',
        aliases: ['c'],
        handler: async (args, context) => {
          this.emit('compactRequested', args);
          return { success: true, message: 'Compact triggered' };
        }
      }
    ];
    
    this.registerMany(builtinCommands);
    this.loadedSources.add('builtin');
  }
  
  // 加载技能命令
  async _loadSkillCommands(skillDir) {
    if (!skillDir || this.loadedSources.has('skill:' + skillDir)) return;
    
    try {
      const files = fs.readdirSync(skillDir);
      const commandFiles = files.filter(f => 
        f.endsWith('.js') || f.endsWith('.ts')
      );
      
      for (const file of commandFiles) {
        try {
          const cmdPath = path.join(skillDir, file);
          const cmd = require(cmdPath);
          
          if (cmd.default) {
            this.register({
              ...cmd.default,
              loadedFrom: 'skill',
              source: skillDir
            });
          }
        } catch (e) {
          console.warn(`[CommandService] Failed to load skill command ${file}:`, e.message);
        }
      }
      
      this.loadedSources.add('skill:' + skillDir);
      
    } catch (error) {
      console.warn('[CommandService] Failed to load skill commands:', error.message);
    }
  }
  
  // 加载插件命令
  async _loadPluginCommands() {
    if (this.loadedSources.has('plugin')) return;
    // 插件命令加载逻辑
    this.loadedSources.add('plugin');
  }
  
  // 加载 MCP 命令
  async _loadMCPCommands(mcpTools) {
    if (!mcpTools) return;
    
    for (const tool of mcpTools) {
      this.register({
        name: tool.name,
        description: tool.description || `MCP tool: ${tool.name}`,
        type: 'local',
        isMcp: true,
        loadedFrom: 'mcp',
        handler: async (args, context) => {
          if (context.mcpClient) {
            return context.mcpClient.callTool(tool.name, args);
          }
          throw new Error('MCP client not available');
        }
      });
    }
  }
  
  // 加载所有命令
  async loadAll(options = {}) {
    await this._loadBuiltinCommands();
    
    if (options.skillDir) {
      await this._loadSkillCommands(options.skillDir);
    }
    
    if (options.mcpTools) {
      await this._loadMCPCommands(options.mcpTools);
    }
    
    this.emit('allLoaded', { 
      commandCount: this.commands.size 
    });
  }
  
  // 获取命令统计
  getStats() {
    const commands = this.getAll();
    
    return {
      total: this.commands.size,
      enabled: commands.length,
      byType: {
        prompt: commands.filter(c => c.type === 'prompt').length,
        local: commands.filter(c => c.type === 'local').length,
        localjsx: commands.filter(c => c.type === 'localjsx').length
      },
      bySource: commands.reduce((acc, c) => {
        acc[c.loadedFrom] = (acc[c.loadedFrom] || 0) + 1;
        return acc;
      }, {}),
      mcpCommands: commands.filter(c => c.isMcp).length
    };
  }
}

module.exports = { CommandService };
