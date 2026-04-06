/**
 * Built-in Commands - Git Operations
 */

import type { Command, CommandParams, CommandResult } from '../index.js';

export const gitStatusCommand: Command = {
  name: 'git-status',
  aliases: ['gs', 'status'],
  description: 'Show git status',
  priority: 10,
  patterns: [/^\/(git-status|gs|status)(?!-\w)/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { execSync } = require('child_process');
      const output = execSync('git status', { 
        encoding: 'utf8',
        cwd: params.context.workingDirectory 
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: 'Not a git repository or git not installed' };
    }
  }
};

export const gitCommitCommand: Command = {
  name: 'commit',
  aliases: ['ci'],
  description: 'Commit changes with message',
  priority: 10,
  patterns: [/^\/(commit|ci)\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    const message = params.args.join(' ');
    if (!message) {
      return { success: false, error: 'Usage: /commit <message>' };
    }

    // 安全验证：检查消息是否包含潜在的注入字符
    if (/[;&|`$<>]/.test(message)) {
      return { success: false, error: 'Commit message contains invalid characters' };
    }

    try {
      const { execSync } = require('child_process');
      const output = execSync('git', ['commit', '-m', message], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output: output || 'Commit successful' };
    } catch (error) {
      return { success: false, error: `Commit failed: ${error}` };
    }
  }
};

export const gitPushCommand: Command = {
  name: 'push',
  aliases: ['git-push'],
  description: 'Push to remote',
  priority: 10,
  patterns: [/^\/(push|git-push)$/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { execSync } = require('child_process');
      const output = execSync('git push', {
        encoding: 'utf8',
        cwd: params.context.workingDirectory
      });
      return { success: true, output: output || 'Push successful' };
    } catch (error) {
      return { success: false, error: `Push failed: ${error}` };
    }
  }
};

export const gitPullCommand: Command = {
  name: 'pull',
  aliases: ['git-pull'],
  description: 'Pull from remote',
  priority: 10,
  patterns: [/^\/(pull|git-pull)$/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { execSync } = require('child_process');
      const output = execSync('git pull', {
        encoding: 'utf8',
        cwd: params.context.workingDirectory
      });
      return { success: true, output: output || 'Pull successful' };
    } catch (error) {
      return { success: false, error: `Pull failed: ${error}` };
    }
  }
};

export const gitBranchCommand: Command = {
  name: 'branch',
  aliases: ['git-branch'],
  description: 'List, create, or delete branches',
  priority: 10,
  patterns: [/^\/(branch|git-branch)(\s+.*)?$/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    // 安全验证：检查参数
    const branchArgs = params.args.filter(arg => !/[;&|`$<>]/.test(arg));
    
    try {
      const { execSync } = require('child_process');
      const output = execSync('git', ['branch', ...branchArgs], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Branch command failed: ${error}` };
    }
  }
};

export const gitDiffCommand: Command = {
  name: 'diff',
  aliases: ['git-diff'],
  description: 'Show changes between commits',
  priority: 10,
  patterns: [/^\/(diff|git-diff)(\s+.*)?$/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    // 安全验证：检查参数
    const diffArgs = params.args.filter(arg => !/[;&|`$<>]/.test(arg));
    
    try {
      const { execSync } = require('child_process');
      const output = execSync('git', ['diff', ...diffArgs], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output: output || 'No changes' };
    } catch (error) {
      return { success: false, error: `Diff failed: ${error}` };
    }
  }
};

export const gitLogCommand: Command = {
  name: 'log',
  aliases: ['git-log'],
  description: 'Show commit logs',
  priority: 10,
  patterns: [/^\/(log|git-log)(\s+.*)?$/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    // 安全验证：检查参数
    const logArgs = params.args.filter(arg => !/[;&|`$<>]/.test(arg));
    if (logArgs.length === 0) logArgs.push('-10');
    
    try {
      const { execSync } = require('child_process');
      const output = execSync('git', ['log', ...logArgs], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Log failed: ${error}` };
    }
  }
};

export const gitCheckoutCommand: Command = {
  name: 'checkout',
  aliases: ['git-checkout'],
  description: 'Switch branches or restore files',
  priority: 10,
  patterns: [/^\/(checkout|git-checkout)\s+.+/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    const branch = params.args[0];
    if (!branch) {
      return { success: false, error: 'Usage: /checkout <branch>' };
    }

    // 安全验证：检查分支名
    if (/[;&|`$<>]/.test(branch)) {
      return { success: false, error: 'Branch name contains invalid characters' };
    }

    try {
      const { execSync } = require('child_process');
      const output = execSync('git', ['checkout', branch], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output: output || `Switched to ${branch}` };
    } catch (error) {
      return { success: false, error: `Checkout failed: ${error}` };
    }
  }
};

export const gitCommands: Command[] = [
  gitStatusCommand,
  gitCommitCommand,
  gitPushCommand,
  gitPullCommand,
  gitBranchCommand,
  gitDiffCommand,
  gitLogCommand,
  gitCheckoutCommand
];
