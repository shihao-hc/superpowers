/**
 * Find 工具
 * 查找文件和目录
 */

import type { Tool, ToolResult } from '../index.js';

interface FindOptions {
  pattern: string;
  path?: string;
  type?: 'f' | 'd' | 'any';
  maxDepth?: number;
  ignoreHidden?: boolean;
  extensions?: string[];
}

export const findTool: Tool = {
  name: 'find',
  description: 'Find files and directories by pattern',
  
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Pattern to match (glob or regex)' },
      path: { type: 'string', description: 'Starting directory' },
      type: { type: 'string', enum: ['f', 'd', 'any'], default: 'any', description: 'File or directory' },
      maxDepth: { type: 'number', default: 10, description: 'Maximum directory depth' },
      ignoreHidden: { type: 'boolean', default: true },
      extensions: { type: 'array', items: { type: 'string' } }
    },
    required: ['pattern']
  },
  
  // @ts-expect-error
  execute: async (params: FindOptions): Promise<ToolResult> => {
    const fs = require('fs');
    const path = require('path');
    
    const rootPath = params.path 
      ? path.join(process.cwd(), params.path)
      : process.cwd();
    
    const results: string[] = [];
    
    // 将 glob 模式转换为正则
    const globToRegex = (pattern: string): RegExp => {
      const escaped = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(escaped, 'i');
    };
    
    const regex = params.extensions 
      ? new RegExp(`\\.(${params.extensions.map(e => e.replace('.', '')).join('|')})$`, 'i')
      : globToRegex(params.pattern);
    
    const walk = (dir: string, depth: number) => {
      if (depth > (params.maxDepth || 10)) return;
      
      let entries;
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return; // 跳过无权限目录
      }
      
      for (const entry of entries) {
        // 跳过隐藏文件
        if (params.ignoreHidden && entry.startsWith('.')) continue;
        
        const fullPath = path.join(dir, entry);
        
        try {
          const stat = fs.statSync(fullPath);
          const isDir = stat.isDirectory();
          const isFile = stat.isFile();
          
          // 检查匹配
          if (
            (params.type === 'f' && isFile) ||
            (params.type === 'd' && isDir) ||
            params.type === 'any'
          ) {
            if (regex.test(entry)) {
              results.push(path.relative(process.cwd(), fullPath));
            }
          }
          
          // 递归处理目录
          if (isDir) {
            walk(fullPath, depth + 1);
          }
        } catch {
          // 跳过无法访问的文件
        }
      }
    };
    
    try {
      walk(rootPath, 0);
      
      return {
        success: true,
        output: results.join('\n') || 'No matches found',
        toolName: 'find',
        metadata: {
          tool: 'find',
          pattern: params.pattern,
          matches: results.length,
          results
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        toolName: 'find'
      };
    }
  }
};

export default findTool;
