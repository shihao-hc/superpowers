/**
 * Edit 工具
 * 智能文件编辑
 */

import type { Tool, ToolResult } from '../index.js';

interface EditOptions {
  path: string;
  oldString: string;
  newString: string;
  dryRun?: boolean;
}

export const editTool: Tool = {
  name: 'edit',
  description: 'Replace text in a file with validation',
  
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to edit' },
      oldString: { type: 'string', description: 'Text to replace' },
      newString: { type: 'string', description: 'Replacement text' },
      dryRun: { type: 'boolean', default: false, description: 'Preview without changes' }
    },
    required: ['path', 'oldString', 'newString']
  },
  
  // @ts-expect-error
  execute: async (params: EditOptions): Promise<ToolResult> => {
    const fs = require('fs');
    const path = require('path');
    
    const absolutePath = path.isAbsolute(params.path)
      ? params.path
      : path.join(process.cwd(), params.path);
    
    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        error: `File not found: ${params.path}`,
        toolName: 'edit'
      };
    }
    
    try {
      let content = fs.readFileSync(absolutePath, 'utf-8');
      
      // 检查 oldString 是否存在
      if (!content.includes(params.oldString)) {
        return {
          success: false,
          error: 'oldString not found in file',
          toolName: 'edit'
        };
      }
      
      // 检查 oldString 出现次数
      const occurrences = (content.match(new RegExp(
        params.oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'
      )) || []).length;
      
      if (occurrences > 1) {
        return {
          success: false,
          error: `oldString appears ${occurrences} times. Be more specific.`,
          toolName: 'edit'
        };
      }
      
      // 干运行模式
      if (params.dryRun) {
        const preview = content.replace(params.oldString, params.newString);
        return {
          success: true,
          output: 'Dry run - no changes made',
          toolName: 'edit',
          metadata: {
            tool: 'edit',
            dryRun: true,
            previewLength: preview.length
          }
        };
      }
      
      // 执行替换
      const newContent = content.replace(params.oldString, params.newString);
      fs.writeFileSync(absolutePath, newContent, 'utf-8');
      
      return {
        success: true,
        output: `Edited ${params.path}`,
        toolName: 'edit',
        metadata: {
          tool: 'edit',
          path: params.path,
          oldLength: params.oldString.length,
          newLength: params.newString.length,
          diff: params.newString.length - params.oldString.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        toolName: 'edit'
      };
    }
  }
};

export default editTool;
