/**
 * Built-in Commands - File Operations
 */

import type { Command, CommandParams, CommandResult } from '../index.js';

export const readCommand: Command = {
  name: 'read',
  aliases: ['r'],
  description: 'Read file contents',
  priority: 10,
  patterns: [/^\/read\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    const filePath = params.args[0];
    if (!filePath) {
      return { success: false, error: 'Usage: /read <file-path>' };
    }

    try {
      const fs = require('fs');
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, output: content };
    } catch (error) {
      return { success: false, error: `Failed to read file: ${error}` };
    }
  }
};

export const writeCommand: Command = {
  name: 'write',
  aliases: ['w'],
  description: 'Write content to file',
  priority: 10,
  patterns: [/^\/write\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    if (params.args.length < 2) {
      return { success: false, error: 'Usage: /write <file-path> <content>' };
    }

    const [filePath, ...contentParts] = params.args;
    const content = contentParts.join(' ');

    try {
      const fs = require('fs');
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, output: `Written to ${filePath}` };
    } catch (error) {
      return { success: false, error: `Failed to write file: ${error}` };
    }
  }
};

export const editCommand: Command = {
  name: 'edit',
  aliases: ['e'],
  description: 'Edit file content',
  priority: 10,
  patterns: [/^\/edit\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    if (params.args.length < 3) {
      return { success: false, error: 'Usage: /edit <file-path> <old-text> <new-text>' };
    }

    const [filePath, oldText, newText] = params.args;

    try {
      const fs = require('fs');
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(oldText, newText);
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, output: `Edited ${filePath}` };
    } catch (error) {
      return { success: false, error: `Failed to edit file: ${error}` };
    }
  }
};

export const deleteCommand: Command = {
  name: 'delete',
  aliases: ['del', 'rm'],
  description: 'Delete file or directory',
  priority: 10,
  patterns: [/^\/(delete|del|rm)\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    const filePath = params.args[0];
    if (!filePath) {
      return { success: false, error: 'Usage: /delete <file-path>' };
    }

    try {
      const fs = require('fs');
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        fs.rmdirSync(filePath, { recursive: true });
      } else {
        fs.unlinkSync(filePath);
      }
      
      return { success: true, output: `Deleted ${filePath}` };
    } catch (error) {
      return { success: false, error: `Failed to delete: ${error}` };
    }
  }
};

export const globCommand: Command = {
  name: 'glob',
  aliases: ['find'],
  description: 'Find files matching pattern',
  priority: 10,
  patterns: [/^\/(glob|find)\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    const pattern = params.args[0];
    if (!pattern) {
      return { success: false, error: 'Usage: /glob <pattern>' };
    }

    try {
      const { globSync } = require('glob');
      const files = globSync(pattern, { cwd: params.context.workingDirectory });
      return { success: true, output: files.join('\n'), data: files };
    } catch (error) {
      return { success: false, error: `Failed to find files: ${error}` };
    }
  }
};

export const fileCommands: Command[] = [
  readCommand,
  writeCommand,
  editCommand,
  deleteCommand,
  globCommand
];
