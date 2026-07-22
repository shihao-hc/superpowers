/**
 * Write 工具
 * 安全地写入文件
 */

import type { Tool, ToolResult } from '../index.js';

interface WriteOptions {
  path: string;
  content: string;
  append?: boolean;
  encoding?: string;
}

export const writeTool: Tool = {
  name: 'write',
  description: 'Write content to a file safely',
  
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
      append: { type: 'boolean', default: false, description: 'Append to file' },
      encoding: { type: 'string', default: 'utf-8' }
    },
    required: ['path', 'content']
  },
  
  // @ts-expect-error
  execute: async (params: WriteOptions): Promise<ToolResult> => {
    const fs = require('fs');
    const path = require('path');
    
    const absolutePath = path.isAbsolute(params.path)
      ? params.path
      : path.join(process.cwd(), params.path);
    
    // 路径遍历防护
    if (absolutePath.includes('..')) {
      const normalized = path.normalize(absolutePath);
      if (!normalized.startsWith(process.cwd())) {
        return {
          success: false,
          error: 'Path traversal detected',
          toolName: 'write'
        };
      }
    }
    
    // 文件大小限制 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (params.content.length > maxSize) {
      return {
        success: false,
        error: `Content too large (max ${maxSize} bytes)`,
        toolName: 'write'
      };
    }
    
    try {
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      if (params.append) {
        fs.appendFileSync(absolutePath, params.content, params.encoding);
      } else {
        fs.writeFileSync(absolutePath, params.content, params.encoding);
      }
      
      const stat = fs.statSync(absolutePath);
      
      return {
        success: true,
        output: `${params.append ? 'Appended to' : 'Written to'} ${params.path} (${stat.size} bytes)`,
        toolName: 'write',
        metadata: {
          tool: 'write',
          path: params.path,
          bytes: stat.size,
          appended: params.append
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        toolName: 'write'
      };
    }
  }
};

export default writeTool;
