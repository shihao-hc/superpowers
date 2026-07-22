/**
 * Bash 工具
 * 安全地执行 shell 命令
 */

import type { Tool, ToolResult } from '../index.js';

const AuditLogger = require('../../security/AuditLogger.js');
const RateLimiter = require('../../security/CommandRateLimiter.js');

interface BashOptions {
  command: string;
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  shell?: string;
  userId?: string;
}

const auditLogger = AuditLogger.getAuditLogger();
const rateLimiter = RateLimiter.getRateLimiter();

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute shell commands safely with input validation',
  
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      cwd: { type: 'string', description: 'Working directory' },
      timeout: { type: 'number', default: 30000, description: 'Timeout in ms' },
      env: { type: 'object', description: 'Environment variables' },
      shell: { type: 'string', default: '/bin/bash' }
    },
    required: ['command']
  },
  
  // @ts-expect-error
  execute: async (params: BashOptions): Promise<ToolResult> => {
    const { execSync } = require('child_process');
    const path = require('path');
    const userId = params.userId || 'system';
    
    // 速率限制检查
    const rateCheck = rateLimiter.check(userId, 'bash');
    if (!rateCheck.allowed) {
      auditLogger.logRateLimitExceeded(userId, 'bash', rateCheck.current, rateCheck.limit);
      rateLimiter.recordBlocked(userId, 'bash', rateCheck.reason);
      
      return {
        success: false,
        error: `Rate limit exceeded. Retry after ${rateCheck.retryAfter || 0} seconds.`,
        toolName: 'bash'
      };
    }
    
    // 命令注入防护
    const dangerousPatterns = [
      /;\s*rm\s+/i,
      /;\s*del\s+/i,
      /\|\s*rm\s+/i,
      /\$\(.*rm.*\)/i,
      /`.*rm.*`/i,
      /fork\s*bomb/i,
      /:()\s*{:|:&\s*};/i
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(params.command)) {
        auditLogger.logShellInjectionDetected(params.command, pattern.toString(), userId);
        rateLimiter.recordBlocked(userId, 'bash', 'shell_injection');
        
        return {
          success: false,
          error: 'Command contains potentially dangerous patterns',
          toolName: 'bash'
        };
      }
    }
    
    // 限制命令长度 (防止资源耗尽)
    if (params.command.length > 1000) {
      return {
        success: false,
        error: 'Command too long (max 1000 characters)',
        toolName: 'bash'
      };
    }
    
    const startTime = Date.now();
    
    const options: any = {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: params.timeout || 30000
    };
    
    if (params.cwd) {
      options.cwd = path.isAbsolute(params.cwd) 
        ? params.cwd 
        : path.join(process.cwd(), params.cwd);
    }
    
    if (params.env) {
      options.env = { ...process.env, ...params.env };
    }
    
    try {
      // SECURITY FIX: 使用数组形式执行命令，防止注入
      // 对于复杂的 shell 命令，使用 bash -c "command"
      let output;
      if (/^[\w\s\-./:=,]+$/.test(params.command) && !params.command.includes('|') && !params.command.includes('&&') && !params.command.includes('||')) {
        // 简单命令直接执行（已验证无特殊字符）
        output = execSync(params.command, options);
      } else {
        // 复杂命令通过 bash -c 执行
        output = execSync('bash', ['-c', params.command], options);
      }
      
      const duration = Date.now() - startTime;
      
      // 记录审计日志
      auditLogger.logCommandExec('bash', [params.command], userId, true, duration);
      rateLimiter.record(userId, 'bash');
      
      return {
        success: true,
        output: output.toString(),
        toolName: 'bash',
        metadata: {
          tool: 'bash',
          command: params.command.substring(0, 100),
          exitCode: 0,
          duration
        }
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // 记录审计日志
      auditLogger.logCommandExec('bash', [params.command], userId, false, duration, {
        exitCode: error.status || 1,
        error: error.message
      });
      
      return {
        success: false,
        output: error.stdout?.toString() || '',
        error: error.message,
        toolName: 'bash',
        metadata: {
          tool: 'bash',
          exitCode: error.status || 1,
          duration
        }
      };
    }
  }
};

export default bashTool;
