/**
 * 命令系统 - 基于 Claude Code 命令架构
 * 
 * 支持 85+ 内置命令
 */

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  priority: number;
  patterns: RegExp[];
  execute: (params: CommandParams) => Promise<CommandResult>;
  shouldTrigger?: (input: string) => boolean;
}

export interface CommandParams {
  input: string;
  args: string[];
  flags: Record<string, string | boolean>;
  context: CommandContext;
}

export interface CommandContext {
  workingDirectory: string;
  userId?: string;
  sessionId?: string;
}

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  data?: unknown;
}

export type CommandCategory = 
  | 'file'
  | 'git'
  | 'search'
  | 'dev'
  | 'ai'
  | 'system'
  | 'custom';

/**
 * 命令注册表
 */
export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private aliases: Map<string, string> = new Map();

  /**
   * 注册命令
   */
  register(command: Command): void {
    if (this.commands.has(command.name)) {
      console.warn(`Command ${command.name} is already registered`);
      return;
    }

    this.commands.set(command.name, command);

    // 注册别名
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias, command.name);
      }
    }

    // 注册模式
    for (const pattern of command.patterns) {
      this.commands.set(`pattern:${pattern}`, command);
    }
  }

  /**
   * 批量注册
   */
  registerMany(commands: Command[]): void {
    for (const cmd of commands) {
      this.register(cmd);
    }
  }

  /**
   * 获取命令
   */
  get(name: string): Command | undefined {
    const actualName = this.aliases.get(name) ?? name;
    return this.commands.get(actualName);
  }

  /**
   * 获取所有命令
   */
  getAll(): Command[] {
    return Array.from(this.commands.values())
      .filter(cmd => !cmd.name.startsWith('pattern:'));
  }

  /**
   * 按优先级获取
   */
  getByPriority(): Command[] {
    return this.getAll().sort((a, b) => b.priority - a.priority);
  }

  /**
   * 按类别获取
   */
  getByCategory(category: CommandCategory): Command[] {
    const categoryCommands: Record<CommandCategory, string[]> = {
      file: ['read', 'edit', 'write', 'delete', 'mkdir', 'mv', 'cp'],
      git: ['commit', 'push', 'pull', 'branch', 'checkout', 'diff', 'status', 'log', 'stash'],
      search: ['grep', 'search', 'find', 'glob', 'rg'],
      dev: ['test', 'lint', 'build', 'run', 'debug', 'format', 'typecheck'],
      ai: ['ask', 'explain', 'review', 'refactor', 'optimize'],
      system: ['shell', 'env', 'config', 'exit', 'clear', 'help'],
      custom: [],
    };

    const names = categoryCommands[category];
    return this.getAll().filter(cmd => names.includes(cmd.name));
  }

  /**
   * 通过模式匹配
   */
  match(input: string): Command | undefined {
    for (const cmd of this.getByPriority()) {
      // 检查模式
      for (const pattern of cmd.patterns) {
        if (pattern.test(input)) {
          return cmd;
        }
      }

      // 检查 shouldTrigger
      if (cmd.shouldTrigger?.(input)) {
        return cmd;
      }

      // 检查别名
      if (cmd.aliases?.some(a => input.startsWith(`/${a}`))) {
        return cmd;
      }

      // 检查名称
      if (input.startsWith(`/${cmd.name}`)) {
        return cmd;
      }
    }

    return undefined;
  }

  /**
   * 搜索命令
   */
  search(query: string): Command[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(cmd =>
      cmd.name.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery) ||
      cmd.aliases?.some(a => a.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 删除命令
   */
  unregister(name: string): boolean {
    const cmd = this.commands.get(name);
    if (cmd) {
      // 清除别名
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          this.aliases.delete(alias);
        }
      }

      // 清除模式
      for (const pattern of cmd.patterns) {
        this.commands.delete(`pattern:${pattern}`);
      }

      return this.commands.delete(name);
    }
    return false;
  }

  /**
   * 获取统计
   */
  getStats(): {
    total: number;
    byCategory: Record<CommandCategory, number>;
  } {
    const stats = {
      total: this.getAll().length,
      byCategory: {
        file: 0,
        git: 0,
        search: 0,
        dev: 0,
        ai: 0,
        system: 0,
        custom: 0,
      } as Record<CommandCategory, number>,
    };

    for (const category of Object.keys(stats.byCategory) as CommandCategory[]) {
      stats.byCategory[category] = this.getByCategory(category).length;
    }

    return stats;
  }
}

/**
 * 命令解析器
 */
export class CommandParser {
  /**
   * 解析命令输入
   */
  parse(input: string): {
    command: string;
    args: string[];
    flags: Record<string, string | boolean>;
    raw: string;
  } {
    const trimmed = input.trim();
    
    // 提取命令
    const commandMatch = trimmed.match(/^\/(\w+)/);
    const command = commandMatch?.[1] ?? '';
    
    // 提取参数和标志
    const rest = trimmed.slice(command.length + 2).trim();
    const { args, flags } = this.parseArgs(rest);
    
    return {
      command,
      args,
      flags,
      raw: trimmed,
    };
  }

  /**
   * 解析参数和标志
   */
  private parseArgs(input: string): {
    args: string[];
    flags: Record<string, string | boolean>;
  } {
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};
    
    // 简单的空格分隔解析（支持引号）
    const tokens = input.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    
    for (const token of tokens) {
      if (token.startsWith('--')) {
        // 标志
        const [, key, value] = token.match(/^--([^=]+)(?:=(.*))?/) ?? [];
        if (key) {
          flags[key] = value ?? true;
        }
      } else if (token.startsWith('-')) {
        // 短标志
        const key = token.slice(1);
        flags[key] = true;
      } else {
        // 参数
        args.push(token.replace(/^"|"$/g, ''));
      }
    }
    
    return { args, flags };
  }
}

/**
 * 命令执行器
 */
export class CommandExecutor {
  private registry: CommandRegistry;
  private parser: CommandParser;

  constructor(registry: CommandRegistry) {
    this.registry = registry;
    this.parser = new CommandParser();
  }

  /**
   * 执行命令
   */
  async execute(
    input: string,
    context: CommandContext
  ): Promise<CommandResult> {
    const parsed = this.parser.parse(input);
    
    if (!parsed.command) {
      return {
        success: false,
        error: 'No command specified',
      };
    }

    const command = this.registry.get(parsed.command);
    
    if (!command) {
      return {
        success: false,
        error: `Command not found: ${parsed.command}`,
      };
    }

    try {
      const result = await command.execute({
        input,
        args: parsed.args,
        flags: parsed.flags,
        context,
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// 内置命令定义
export const BUILTIN_COMMANDS: Command[] = [
  // 文件操作
  {
    name: 'read',
    aliases: ['r'],
    description: 'Read file contents',
    priority: 10,
    patterns: [/^\/read\s+.+/, /^\/r\s+.+/],
    execute: async ({ args }) => ({ success: true, output: `Reading: ${args.join(' ')}` }),
  },
  {
    name: 'edit',
    aliases: ['e'],
    description: 'Edit file contents',
    priority: 10,
    patterns: [/^\/edit\s+.+/, /^\/e\s+.+/],
    execute: async ({ args }) => ({ success: true, output: `Editing: ${args.join(' ')}` }),
  },
  {
    name: 'write',
    aliases: ['w'],
    description: 'Write file contents',
    priority: 10,
    patterns: [/^\/write\s+.+/, /^\/w\s+.+/],
    execute: async ({ args }) => ({ success: true, output: `Writing: ${args.join(' ')}` }),
  },
  {
    name: 'delete',
    aliases: ['rm', 'del'],
    description: 'Delete file',
    priority: 10,
    patterns: [/^\/delete\s+.+/, /^\/(rm|del)\s+.+/],
    execute: async ({ args }) => ({ success: true, output: `Deleting: ${args.join(' ')}` }),
  },

  // Git 命令
  {
    name: 'commit',
    aliases: ['ci'],
    description: 'Commit changes',
    priority: 10,
    patterns: [/^\/commit(\s.*)?$/, /^\/ci(\s.*)?$/],
    execute: async ({ args }) => ({ success: true, output: `Committing: ${args.join(' ')}` }),
  },
  {
    name: 'push',
    aliases: ['git-push'],
    description: 'Push to remote',
    priority: 10,
    patterns: [/^\/push(\s.*)?$/, /^\/git-push(\s.*)?$/],
    execute: async ({ args }) => ({ success: true, output: `Pushing: ${args.join(' ')}` }),
  },
  {
    name: 'pull',
    aliases: ['git-pull'],
    description: 'Pull from remote',
    priority: 10,
    patterns: [/^\/pull(\s.*)?$/, /^\/git-pull(\s.*)?$/],
    execute: async ({ args }) => ({ success: true, output: `Pulling: ${args.join(' ')}` }),
  },
  {
    name: 'branch',
    aliases: ['br'],
    description: 'List/create branches',
    priority: 10,
    patterns: [/^\/branch(\s.*)?$/, /^\/br(\s.*)?$/],
    execute: async ({ args }) => ({ success: true, output: `Branching: ${args.join(' ')}` }),
  },

  // 开发命令
  {
    name: 'test',
    aliases: ['t'],
    description: 'Run tests',
    priority: 10,
    patterns: [/^\/test(\s.*)?$/, /^\/t(\s.*)?$/],
    execute: async ({ args }) => ({ success: true, output: `Running tests: ${args.join(' ')}` }),
  },
  {
    name: 'lint',
    aliases: ['l'],
    description: 'Run linter',
    priority: 10,
    patterns: [/^\/lint(\s.*)?$/, /^\/l(\s.*)?$/],
    execute: async ({ args }) => ({ success: true, output: `Running linter: ${args.join(' ')}` }),
  },
  {
    name: 'build',
    aliases: ['b'],
    description: 'Build project',
    priority: 10,
    patterns: [/^\/build(\s.*)?$/, /^\/b(\s.*)?$/],
    execute: async ({ args }) => ({ success: true, output: `Building: ${args.join(' ')}` }),
  },

  // AI 命令
  {
    name: 'ask',
    aliases: ['a'],
    description: 'Ask AI a question',
    priority: 5,
    patterns: [/^\/ask\s+.+/, /^\/a\s+.+/],
    execute: async ({ args }) => ({ success: true, output: `Asking: ${args.join(' ')}` }),
  },
  {
    name: 'explain',
    aliases: ['exp'],
    description: 'Explain code',
    priority: 5,
    patterns: [/^\/explain\s+.+/, /^\/exp\s+.+/],
    execute: async ({ args }) => ({ success: true, output: `Explaining: ${args.join(' ')}` }),
  },
  {
    name: 'review',
    aliases: ['rv'],
    description: 'Review code',
    priority: 5,
    patterns: [/^\/review(\s.*)?$/, /^\/rv(\s.*)?$/],
    execute: async ({ args }) => ({ success: true, output: `Reviewing: ${args.join(' ')}` }),
  },

  // 系统命令
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show help',
    priority: 1,
    patterns: [/^\/help$/, /^\/h$/, /^\/\?$/],
    execute: async () => ({ success: true, output: 'Available commands...' }),
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit session',
    priority: 1,
    patterns: [/^\/exit$/, /^\/quit$/, /^\/q$/],
    execute: async () => ({ success: true, output: 'Exiting...' }),
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear screen',
    priority: 1,
    patterns: [/^\/clear$/, /^\/cls$/],
    execute: async () => ({ success: true, output: 'Screen cleared' }),
  },
];
