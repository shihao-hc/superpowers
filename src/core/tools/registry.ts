/**
 * Tool Registry
 * 工具注册表管理
 */

import type { Tool, ToolContext, ValidationResult } from './index.js';
import { EventEmitter } from 'events';

export interface ToolMetadata {
  name: string;
  description: string;
  category: ToolCategory;
  tags: string[];
  version?: string;
  author?: string;
}

export type ToolCategory = 
  | 'file'
  | 'git'
  | 'search'
  | 'shell'
  | 'web'
  | 'ai'
  | 'system'
  | 'custom';

export interface ToolRegistration {
  tool: Tool;
  metadata: ToolMetadata;
  enabled: boolean;
  registeredAt: number;
}

export class ToolRegistry extends EventEmitter {
  private tools: Map<string, ToolRegistration> = new Map();
  private categories: Map<ToolCategory, Set<string>> = new Map();
  private aliases: Map<string, string> = new Map();

  constructor() {
    super();
    this.initCategories();
  }

  private initCategories(): void {
    const categories: ToolCategory[] = [
      'file', 'git', 'search', 'shell', 'web', 'ai', 'system', 'custom'
    ];
    for (const cat of categories) {
      this.categories.set(cat, new Set());
    }
  }

  register(tool: Tool, metadata?: Partial<ToolMetadata>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered`);
    }

    const fullMetadata: ToolMetadata = {
      name: tool.name,
      description: tool.description,
      category: metadata?.category || 'custom',
      tags: metadata?.tags || [],
      version: metadata?.version,
      author: metadata?.author
    };

    const registration: ToolRegistration = {
      tool,
      metadata: fullMetadata,
      enabled: true,
      registeredAt: Date.now()
    };

    this.tools.set(tool.name, registration);
    this.categories.get(fullMetadata.category)?.add(tool.name);

    if (metadata?.tags) {
      for (const tag of metadata.tags) {
        this.emit('tool:tagged', { tool: tool.name, tag });
      }
    }

    this.emit('tool:registered', { name: tool.name, metadata: fullMetadata });
  }

  registerAlias(alias: string, toolName: string): void {
    if (!this.tools.has(toolName)) {
      throw new Error(`Tool ${toolName} does not exist`);
    }
    this.aliases.set(alias, toolName);
  }

  unregister(name: string): boolean {
    const registration = this.tools.get(name);
    if (!registration) return false;

    this.categories.get(registration.metadata.category)?.delete(name);
    this.tools.delete(name);
    this.emit('tool:unregistered', { name });

    return true;
  }

  get(name: string): Tool | undefined {
    const resolved = this.resolveName(name);
    return this.tools.get(resolved)?.tool;
  }

  getRegistration(name: string): ToolRegistration | undefined {
    const resolved = this.resolveName(name);
    return this.tools.get(resolved);
  }

  has(name: string): boolean {
    const resolved = this.resolveName(name);
    return this.tools.has(resolved);
  }

  private resolveName(name: string): string {
    if (this.tools.has(name)) return name;
    const aliased = this.aliases.get(name);
    if (aliased && this.tools.has(aliased)) return aliased;
    return name;
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values())
      .filter(r => r.enabled)
      .map(r => r.tool);
  }

  getByCategory(category: ToolCategory): Tool[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names)
      .map(name => this.tools.get(name)?.tool)
      .filter((t): t is Tool => t !== undefined);
  }

  filter(predicate: (tool: Tool) => boolean): Tool[] {
    return this.getAll().filter(predicate);
  }

  search(query: string): Tool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery)
    );
  }

  enable(name: string): boolean {
    const registration = this.tools.get(name);
    if (!registration) return false;
    
    registration.enabled = true;
    this.emit('tool:enabled', { name });
    return true;
  }

  disable(name: string): boolean {
    const registration = this.tools.get(name);
    if (!registration) return false;
    
    registration.enabled = false;
    this.emit('tool:disabled', { name });
    return true;
  }

  isEnabled(name: string): boolean {
    const registration = this.tools.get(name);
    return registration?.enabled ?? false;
  }

  validate(name: string, input: unknown): ValidationResult {
    const tool = this.get(name);
    if (!tool) {
      return { valid: false, errors: [`Tool ${name} not found`] };
    }

    if (tool.validateInput) {
      return tool.validateInput(input, {} as ToolContext);
    }

    return { valid: true, errors: [] };
  }

  getStats(): ToolStats {
    const all = Array.from(this.tools.values());
    return {
      total: all.length,
      enabled: all.filter(r => r.enabled).length,
      byCategory: this.getCategoryStats(),
      byTag: this.getTagStats()
    };
  }

  private getCategoryStats(): Record<ToolCategory, number> {
    const stats: Record<string, number> = {};
    for (const [category, names] of this.categories) {
      stats[category] = names.size;
    }
    return stats as Record<ToolCategory, number>;
  }

  private getTagStats(): Record<string, number> {
    const tagCounts: Record<string, number> = {};
    for (const reg of this.tools.values()) {
      for (const tag of reg.metadata.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    return tagCounts;
  }

  clear(): void {
    this.tools.clear();
    this.aliases.clear();
    this.initCategories();
  }

  size(): number {
    return this.tools.size;
  }
}

export interface ToolStats {
  total: number;
  enabled: number;
  byCategory: Record<ToolCategory, number>;
  byTag: Record<string, number>;
}

export const globalToolRegistry = new ToolRegistry();
