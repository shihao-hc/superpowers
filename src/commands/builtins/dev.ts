/**
 * Built-in Commands - Development Operations
 */

import type { Command, CommandParams, CommandResult } from '../index.js';

export const testCommand: Command = {
  name: 'test',
  aliases: ['t'],
  description: 'Run tests',
  priority: 10,
  patterns: [/^\/(test|t)(?!-\w)/i],
  execute: async (params: CommandParams): Promise<CommandResult> => {
    try {
      const { execSync } = require('child_process');
      const testCmd = params.flags.watch ? 'npm run test:watch' : 'npm test';
      const output = execSync(testCmd, {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        maxBuffer: 50 * 1024 * 1024
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Test failed: ${error}` };
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
      const output = execSync('npm run lint', {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        maxBuffer: 50 * 1024 * 1024
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Lint failed: ${error}` };
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
      const output = execSync('npm run build', {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        maxBuffer: 50 * 1024 * 1024
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Build failed: ${error}` };
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
      const { execSync } = require('child_process');
      execSync('npm run dev', {
        encoding: 'utf8',
        cwd: params.context.workingDirectory,
        stdio: 'inherit'
      });
      return { success: true, output: 'Development server started' };
    } catch (error) {
      return { success: false, error: `Failed to start dev server: ${error}` };
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
      const output = execSync('npm run format', {
        encoding: 'utf8',
        cwd: params.context.workingDirectory
      });
      return { success: true, output: output || 'Code formatted' };
    } catch (error) {
      return { success: false, error: `Format failed: ${error}` };
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
      const output = execSync('npm run typecheck', {
        encoding: 'utf8',
        cwd: params.context.workingDirectory
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: `Type check failed: ${error}` };
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
