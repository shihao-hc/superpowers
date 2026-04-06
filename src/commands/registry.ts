/**
 * Command Registry
 * 命令注册和管理
 */

import { EventEmitter } from 'events';
import type { Command, CommandResult, CommandParams, CommandCategory } from './index.js';

export interface CommandRegistration {
  command: Command;
  enabled: boolean;
  registeredAt: number;
  usageCount: number;
}

export class CommandRegistry extends EventEmitter {
  private commands: Map<string, CommandRegistration> = new Map();
  private categories: Map<CommandCategory, Set<string>> = new Map();
  private aliases: Map<string, string> = new Map();

  constructor() {
    super();
    this.initCategories();
  }

  private initCategories(): void {
    const categories: CommandCategory[] = [
      'file', 'git', 'search', 'dev', 'ai', 'system', 'custom'
    ];
    for (const cat of categories) {
      this.categories.set(cat, new Set());
    }
  }

  register(command: Command, category?: CommandCategory): void {
    if (this.commands.has(command.name)) {
      throw new Error(`Command ${command.name} is already registered`);
    }

    const registration: CommandRegistration = {
      command,
      enabled: true,
      registeredAt: Date.now(),
      usageCount: 0
    };

    this.commands.set(command.name, registration);

    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias, command.name);
      }
    }

    const cmdCategory = category || this.detectCategory(command);
    this.categories.get(cmdCategory)?.add(command.name);

    this.emit('command:registered', { name: command.name, category: cmdCategory });
  }

  unregister(name: string): boolean {
    const registration = this.commands.get(name);
    if (!registration) return false;

    for (const alias of registration.command.aliases || []) {
      this.aliases.delete(alias);
    }

    this.commands.delete(name);
    this.emit('command:unregistered', { name });
    return true;
  }

  get(name: string): Command | undefined {
    const resolved = this.resolveName(name);
    return this.commands.get(resolved)?.command;
  }

  has(name: string): boolean {
    return this.commands.has(name) || this.aliases.has(name);
  }

  private resolveName(name: string): string {
    if (this.commands.has(name)) return name;
    const aliased = this.aliases.get(name);
    if (aliased && this.commands.has(aliased)) return aliased;
    return name;
  }

  getAll(): Command[] {
    return Array.from(this.commands.values())
      .filter(r => r.enabled)
      .map(r => r.command);
  }

  getByCategory(category: CommandCategory): Command[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names)
      .map(name => this.commands.get(name)?.command)
      .filter((c): c is Command => c !== undefined);
  }

  find(input: string): Command | undefined {
    const trimmed = input.trim();

    if (trimmed.startsWith('/')) {
      const name = trimmed.slice(1).split(/\s/)[0].toLowerCase();
      return this.get(name);
    }

    for (const [_, registration] of this.commands) {
      if (registration.command.shouldTrigger?.(trimmed)) {
        return registration.command;
      }
    }

    return undefined;
  }

  match(input: string): Command | undefined {
    const cmd = this.find(input);
    if (cmd) {
      this.incrementUsage(cmd.name);
    }
    return cmd;
  }

  enable(name: string): boolean {
    const registration = this.commands.get(name);
    if (!registration) return false;
    
    registration.enabled = true;
    this.emit('command:enabled', { name });
    return true;
  }

  disable(name: string): boolean {
    const registration = this.commands.get(name);
    if (!registration) return false;
    
    registration.enabled = false;
    this.emit('command:disabled', { name });
    return true;
  }

  isEnabled(name: string): boolean {
    const registration = this.commands.get(name);
    return registration?.enabled ?? false;
  }

  private incrementUsage(name: string): void {
    const registration = this.commands.get(name);
    if (registration) {
      registration.usageCount++;
    }
  }

  private detectCategory(command: Command): CommandCategory {
    const name = command.name.toLowerCase();
    const desc = command.description.toLowerCase();

    if (name.includes('read') || name.includes('write') || name.includes('edit') || name.includes('file')) {
      return 'file';
    }
    if (name.includes('git') || name.includes('commit') || name.includes('branch')) {
      return 'git';
    }
    if (name.includes('search') || name.includes('grep') || name.includes('find')) {
      return 'search';
    }
    if (name.includes('test') || name.includes('build') || name.includes('lint')) {
      return 'dev';
    }
    if (name.includes('ask') || name.includes('explain')) {
      return 'ai';
    }
    if (name.includes('shell') || name.includes('env') || name.includes('config')) {
      return 'system';
    }

    return 'custom';
  }

  getStats(): CommandStats {
    const all = Array.from(this.commands.values());
    return {
      total: all.length,
      enabled: all.filter(r => r.enabled).length,
      byCategory: this.getCategoryStats(),
      topUsed: this.getTopUsed(5)
    };
  }

  private getCategoryStats(): Record<CommandCategory, number> {
    const stats: Record<string, number> = {};
    for (const [category, names] of this.categories) {
      stats[category] = names.size;
    }
    return stats as Record<CommandCategory, number>;
  }

  private getTopUsed(n: number): { name: string; usageCount: number }[] {
    return Array.from(this.commands.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, n)
      .map(r => ({ name: r.command.name, usageCount: r.usageCount }));
  }

  clear(): void {
    this.commands.clear();
    this.aliases.clear();
    this.initCategories();
  }

  size(): number {
    return this.commands.size;
  }
}

export interface CommandStats {
  total: number;
  enabled: number;
  byCategory: Record<CommandCategory, number>;
  topUsed: { name: string; usageCount: number }[];
}

export const globalCommandRegistry = new CommandRegistry();
