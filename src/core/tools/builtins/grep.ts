/**
 * Grep 命令工具
 * 基于 Claude Code 源码分析
 */

import type { Tool, ToolResult } from '../index.js';

interface GrepOptions {
  pattern: string;
  path?: string;
  recursive?: boolean;
  ignoreCase?: boolean;
  wholeWord?: boolean;
  lineNumbers?: boolean;
  context?: number;
  maxCount?: number;
  include?: string[];
  exclude?: string[];
  extensions?: string[];
}

export const grepTool: Tool = {
  name: 'grep',
  description: 'Search for patterns in files',
  
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (regex supported)' },
      path: { type: 'string', description: 'Directory or file to search' },
      recursive: { type: 'boolean', default: true, description: 'Search recursively' },
      ignoreCase: { type: 'boolean', default: false },
      wholeWord: { type: 'boolean', default: false },
      lineNumbers: { type: 'boolean', default: true },
      context: { type: 'number', default: 0, description: 'Lines of context before/after' },
      maxCount: { type: 'number', default: 100, description: 'Max matches per file' },
      include: { type: 'array', items: { type: 'string' }, description: 'File patterns to include' },
      exclude: { type: 'array', items: { type: 'string' }, description: 'File patterns to exclude' }
    },
    required: ['pattern']
  },
  
  // @ts-expect-error
  execute: async (params: GrepOptions): Promise<ToolResult> => {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    
    // 安全验证：检查 pattern 是否包含危险字符
    const dangerousPattern = /[;&|`$<>!{}[\]\\]/;
    if (dangerousPattern.test(params.pattern)) {
      return {
        success: false,
        error: 'Search pattern contains invalid characters',
        toolName: 'grep'
      };
    }
    
    // 限制 pattern 长度
    if (params.pattern.length > 1000) {
      return {
        success: false,
        error: 'Search pattern too long (max 1000 characters)',
        toolName: 'grep'
      };
    }
    
    const args: string[] = ['grep', '-n'];
    
    if (params.ignoreCase) args.push('-i');
    if (params.wholeWord) args.push('-w');
    if (params.recursive !== false) args.push('-r');
    if (params.maxCount) args.push(`--max-count=${params.maxCount}`);
    if (params.context! > 0) args.push(`--context=${params.context}`);
    
    if (params.include?.length) {
      params.include.forEach(pattern => {
        args.push('--include=' + pattern);
      });
    }
    
    if (params.exclude?.length) {
      params.exclude.forEach(pattern => {
        args.push('--exclude=' + pattern);
      });
    }
    
    // 使用正则表达式
    args.push('-E');
    args.push(params.pattern);
    
    if (params.path) {
      args.push(params.path);
    } else {
      args.push('.');
    }
    
    try {
      // ✅ 使用数组形式避免 shell 注入
      const output = execSync('grep', args, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        cwd: process.cwd(),
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      return {
        success: true,
        output,
        toolName: 'grep',
        metadata: {
          tool: 'grep',
          pattern: params.pattern,
          matches: output.split('\n').filter((l: any) => l).length
        }
      };
    } catch (error: any) {
      if (error.status === 1) {
        // grep 返回 1 表示没有匹配
        return {
          success: true,
          output: '',
          toolName: 'grep',
          metadata: { tool: 'grep', pattern: params.pattern, matches: 0 }
        };
      }
      
      return {
        success: false,
        error: error.message,
        toolName: 'grep'
      };
    }
  }
};

export default grepTool;
