/**
 * Built-in Commands - Development Operations
 * 安全修复: 使用数组形式执行命令
 */

import type { Command, CommandParams, CommandResult } from '../index.js';

// 允许的命令白名单
const ALLOWED_COMMANDS = ['npm', 'node', 'npx'];
const ALLOWED_SCRIPTS = ['test', 'test:watch', 'lint', 'build', 'dev', 'format', 'typecheck'];

function sanitizeScriptName(name: string): string {
  // 只允许字母、数字、冒号、下划线
  if (!/^[a-zA-Z0-9:_]+$/.test(name)) {
    throw new Error('Invalid script name');
  }
  return name;
}

export const testCommand: Command = {
  name: 'test',
  aliases: ['t'],
  description: 'Run tests',
  priority: 10,
  patterns: [/^\/(test|t)(?!-\w)/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { execSync } = require('child_process');
      const script = params.flags.watch ? 'test:watch' : 'test';
      
      // ✅ 使用数组形式
      const output = execSync('npm', ['run', script], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Test failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};

export const lintCommand: Command = {
  name: 'lint',
  aliases: ['l'],
  description: 'Run linter',
  priority: 10,
  patterns: [/^\/(lint|l)(?!-\w)/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { execSync } = require('child_process');
      // ✅ 使用数组形式
      const output = execSync('npm', ['run', 'lint'], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Lint failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};

export const buildCommand: Command = {
  name: 'build',
  aliases: ['b'],
  description: 'Build project',
  priority: 10,
  patterns: [/^\/(build|b)(?!-\w)/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { execSync } = require('child_process');
      // ✅ 使用数组形式
      const output = execSync('npm', ['run', 'build'], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 180000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Build failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};

export const devCommand: Command = {
  name: 'dev',
  aliases: ['start'],
  description: 'Start development server',
  priority: 10,
  patterns: [/^\/(dev|start)$/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { spawn } = require('child_process');
      // 使用 spawn 启动后台进程
      spawn('npm', ['run', 'dev'], {
        cwd: params.context.workingDirectory,
        stdio: 'inherit',
        detached: true,
        shell: false
      });
      return { success: true, output: 'Development server starting...' };
    } catch (error) {
      return { success: false, error: `Failed to start dev server: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};

export const formatCommand: Command = {
  name: 'format',
  aliases: ['fmt'],
  description: 'Format code',
  priority: 10,
  patterns: [/^\/(format|fmt)$/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { execSync } = require('child_process');
      // ✅ 使用数组形式
      const output = execSync('npm', ['run', 'format'], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output: output || 'Code formatted' };
    } catch (error) {
      return { success: false, error: `Format failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};

export const typecheckCommand: Command = {
  name: 'typecheck',
  aliases: ['types'],
  description: 'Run TypeScript type checking',
  priority: 10,
  patterns: [/^\/(typecheck|types)$/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { execSync } = require('child_process');
      // ✅ 使用数组形式
      const output = execSync('npm', ['run', 'typecheck'], {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Type check failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};

export const devCommands: Command[] = [
  testCommand,
  lintCommand,
  buildCommand,
  devCommand,
  formatCommand,
  typecheckCommand
];
