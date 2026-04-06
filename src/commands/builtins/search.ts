/**
 * Built-in Commands - Search Operations
 */

import type { Command, CommandParams, CommandResult } from '../index.js';

export const grepCommand: Command = {
  name: 'grep',
  aliases: ['search', 'find'],
  description: 'Search for pattern in files',
  priority: 10,
  patterns: [/^\/(grep|search|find)\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    const pattern = params.args[0];
    if (!pattern) {
      return { success: false, error: 'Usage: /grep <pattern> [path]' };
    }

    const path = params.args[1] || '.';
    const flags = params.flags;

    try {
      const { execSync } = require('child_process');
      let cmd = `grep -r "${pattern}" "${path}"`;
      
      if (flags.i) cmd += ' -i';
      if (flags.n) cmd += ' -n';
      if (flags.l) cmd += ' -l';
      
      const output = execSync(cmd, { 
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        maxBuffer: 10 * 1024 * 1024
      });
      
      return { success: true, output, data: output.split('\n') };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('grep:')) {
        return { success: false, error: 'No matches found' };
      }
      return { success: false, error: `Search failed: ${errMsg}` };
    }
  }
};

export const findCommand: Command = {
  name: 'find',
  aliases: ['locate'],
  description: 'Find files by name',
  priority: 10,
  patterns: [/^\/find\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    const name = params.args[0];
    if (!name) {
      return { success: false, error: 'Usage: /find <filename>' };
    }

    try {
      const { execSync } = require('child_process');
      const output = execSync(`find . -name "${name}"`, {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        maxBuffer: 10 * 1024 * 1024
      });
      
      return { success: true, output: output || 'No files found', data: output.split('\n') };
    } catch (error) {
      return { success: false, error: 'No files found' };
    }
  }
};

export const replaceCommand: Command = {
  name: 'replace',
  aliases: ['sed'],
  description: 'Replace text in files',
  priority: 10,
  patterns: [/^\/replace\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    if (params.args.length < 3) {
      return { success: false, error: 'Usage: /replace <old> <new> [file]' };
    }

    const [oldText, newText, file] = params.args;

    try {
      const fs = require('fs');
      const path = file || '.';
      const files = fs.readdirSync(path);
      
      let modifiedCount = 0;
      for (const f of files) {
        if (f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.js')) {
          const filePath = `${path}/${f}`;
          let content = fs.readFileSync(filePath, 'utf8');
          if (content.includes(oldText)) {
            content = content.split(oldText).join(newText);
            fs.writeFileSync(filePath, content);
            modifiedCount++;
          }
        }
      }
      
      return { success: true, output: `Modified ${modifiedCount} files` };
    } catch (error) {
      return { success: false, error: `Replace failed: ${error}` };
    }
  }
};

export const searchCommands: Command[] = [
  grepCommand,
  findCommand,
  replaceCommand
];
