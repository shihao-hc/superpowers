/**
 * Read 工具
 * 文件读取和内容分析
 */

import type { Tool, ToolResult } from '../index.js';

interface ReadOptions {
  path: string;
  offset?: number;
  limit?: number;
  encoding?: string;
  lines?: boolean;
}

export const readTool: Tool = {
  name: 'read',
  description: 'Read file contents with optional line limiting',
  
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
      offset: { type: 'number', default: 0, description: 'Starting line (0-indexed)' },
      limit: { type: 'number', default: 1000, description: 'Max lines to read' },
      encoding: { type: 'string', default: 'utf-8' },
      lines: { type: 'boolean', default: true, description: 'Include line numbers' }
    },
    required: ['path']
  },
  
  // @ts-expect-error
  execute: async (params: ReadOptions): Promise<ToolResult> => {
    const fs = require('fs');
    const path = require('path');
    
    const absolutePath = path.isAbsolute(params.path) 
      ? params.path 
      : path.join(process.cwd(), params.path);
    
    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${params.path}`,
        toolName: 'read'
      };
    }
    
    const stat = fs.statSync(absolutePath);
    
    if (stat.isDirectory()) {
      return {
        success: false,
        error: `Path is a directory: ${params.path}`,
        toolName: 'read'
      };
    }
    
    try {
      let content = fs.readFileSync(absolutePath, params.encoding || 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;
      
      const startLine = params.offset || 0;
      const endLine = Math.min(startLine + (params.limit || 1000), totalLines);
      
      let output: string;
      if (params.lines !== false) {
        output = lines.slice(startLine, endLine)
          .map((line: any, i: any) => `${startLine + i + 1}: ${line}`)
          .join('\n');
      } else {
        output = lines.slice(startLine, endLine).join('\n');
      }
      
      return {
        success: true,
        output,
        toolName: 'read',
        metadata: {
          tool: 'read',
          path: params.path,
          linesRead: endLine - startLine,
          totalLines,
          truncated: totalLines > endLine
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        toolName: 'read'
      };
    }
  }
};

export default readTool;
