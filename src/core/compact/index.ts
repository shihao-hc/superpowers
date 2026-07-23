/**
 * 上下文压缩系统 - 基于 Claude Code 源码
 * 
 * Claude Code 常量:
 * - AUTOCOMPACT_BUFFER_TOKENS = 13000
 * - WARNING_THRESHOLD_BUFFER_TOKENS = 20000
 * - ERROR_THRESHOLD_BUFFER_TOKENS = 20000
 * - POST_COMPACT_TOKEN_BUDGET = 50000
 * - POST_COMPACT_MAX_TOKENS_PER_FILE = 5000
 * - POST_COMPACT_MAX_TOKENS_PER_SKILL = 5000
 * - POST_COMPACT_SKILLS_TOKEN_BUDGET = 25000
 */

import type { Message } from '../agent-loop/types.js';
export type { CompactType, CompactCheckResult, CompactConfig, CompactResult, CompactionRecord } from './types.js';

export interface ContextManagerConfig {
  maxTokens: number;
  warningThreshold?: number;
  errorThreshold?: number;
  autoCompactBuffer?: number;
}

export class ContextManager {
  private config: Required<ContextManagerConfig>;
  private compactCount: number = 0;
  private lastCompactTurn: number = 0;

  constructor(config: ContextManagerConfig) {
    this.config = {
      maxTokens: config.maxTokens,
      warningThreshold: config.warningThreshold ?? 20000,
      errorThreshold: config.errorThreshold ?? 5000,
      autoCompactBuffer: config.autoCompactBuffer ?? 13000,
    };
  }

  /**
   * 检查并执行压缩
   */
  async checkAndCompact(
    messages: Message[],
    tokenBudget: { getRemaining: () => number }
  ): Promise<{
    didCompact: boolean;
    messages: Message[];
    beforeTokens: number;
    afterTokens: number;
  }> {
    const remaining = tokenBudget.getRemaining();
    const checkResult = this.shouldCompact(remaining);

    if (!checkResult.shouldCompact) {
      return {
        didCompact: false,
        messages,
        beforeTokens: this.estimateTokens(messages),
        afterTokens: this.estimateTokens(messages),
      };
    }

    // 执行压缩
    const result = await this.compact(messages, checkResult.type);
    this.compactCount++;
    
    return {
      didCompact: true,
      messages: result.messages,
      beforeTokens: result.beforeTokens,
      afterTokens: result.afterTokens,
    };
  }

  /**
   * 检查是否应该压缩
   */
  shouldCompact(remainingTokens: number): CompactCheckResult {
    // 错误阈值 - 必须压缩
    if (remainingTokens < this.config.errorThreshold) {
      return {
        shouldCompact: true,
        type: 'auto',
        reason: 'Token budget critically low',
      };
    }

    // 警告阈值 - 考虑压缩
    if (remainingTokens < this.config.warningThreshold) {
      return {
        shouldCompact: true,
        type: 'micro',
        reason: 'Token budget warning threshold',
      };
    }

    // 自动压缩缓冲区
    if (remainingTokens < this.config.autoCompactBuffer) {
      return {
        shouldCompact: true,
        type: 'auto',
        reason: 'Auto compact buffer reached',
      };
    }

    return { shouldCompact: false, type: 'auto' };
  }

  /**
   * 执行压缩
   */
  async compact(
    messages: Message[],
    type: CompactType
  ): Promise<{
    messages: Message[];
    beforeTokens: number;
    afterTokens: number;
  }> {
    const beforeTokens = this.estimateTokens(messages);
    
    let result: Message[];
    
    switch (type) {
      case 'micro':
        result = this.microCompact(messages);
        break;
      case 'partial':
        result = await this.partialCompact(messages);
        break;
      case 'session':
        result = await this.sessionCompact(messages);
        break;
      case 'auto':
      default:
        result = await this.autoCompact(messages);
        break;
    }

    const afterTokens = this.estimateTokens(result);
    
    return {
      messages: result,
      beforeTokens,
      afterTokens,
    };
  }

  /**
   * 微压缩 - 轻量级压缩
   */
  private microCompact(messages: Message[]): Message[] {
    // 只压缩工具结果，保留其他消息
    return messages.map(msg => {
      if (msg.type === 'tool_result') {
        // 简化工具结果
        return this.simplifyToolResult(msg);
      }
      return msg;
    });
  }

  /**
   * 自动压缩 - 完整压缩
   */
  private async autoCompact(messages: Message[]): Promise<Message[]> {
    // 1. 移除图片
    const stripped = this.stripImages(messages);
    
    // 2. 分组消息
    const groups = this.groupByApiRound(stripped);
    
    // 3. 生成摘要
    const summary = await this.generateSummary(groups);
    
    // 4. 构建压缩后的消息
    return [
      this.createBoundaryMarker('Auto Compact'),
      ...summary,
      ...this.getRecentMessages(groups, 10), // 保留最近10条
    ];
  }

  /**
   * 部分压缩 - 只压缩部分消息
   */
  private async partialCompact(messages: Message[]): Promise<Message[]> {
    const threshold = Math.floor(messages.length / 2);
    const older = messages.slice(0, threshold);
    const recent = messages.slice(threshold);
    
    // 只对旧消息生成摘要
    const summary = await this.generateSummary([older]);
    
    return [
      this.createBoundaryMarker('Partial Compact'),
      ...summary,
      ...recent,
    ];
  }

  /**
   * 会话压缩 - 提取关键信息
   */
  private async sessionCompact(messages: Message[]): Promise<Message[]> {
    // 提取关键决策、文件修改、错误等
    const keyMessages = this.extractKeyInformation(messages);
    
    return [
      this.createBoundaryMarker('Session Memory Compact'),
      ...keyMessages,
    ];
  }

  /**
   * 移除图片
   */
  private stripImages(messages: Message[]): Message[] {
    return messages.map(msg => ({
      ...msg,
      content: msg.content.filter(c => c.type !== 'image'),
    }));
  }

  /**
   * 按 API 轮次分组
   */
  private groupByApiRound(messages: Message[]): Message[][] {
    const groups: Message[][] = [];
    let currentGroup: Message[] = [];
    
    for (const msg of messages) {
      currentGroup.push(msg);
      
      // 用户消息结束一轮
      if (msg.type === 'user') {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  /**
   * 获取最近的消息
   */
  private getRecentMessages(groups: Message[][], count: number): Message[] {
    const flat = groups.flat();
    return flat.slice(-count);
  }

  /**
   * 生成摘要
   */
  private async generateSummary(groups: Message[][]): Promise<Message[]> {
    // TODO: 调用 LLM 生成摘要
    // 这里返回简化的摘要
    const totalMessages = groups.flat().length;
    
    return [{
      type: 'user',
      content: [{
        type: 'text',
        text: `[${totalMessages} messages collapsed by context compression]`,
      }],
    }];
  }

  /**
   * 提取关键信息
   */
  private extractKeyInformation(messages: Message[]): Message[] {
    return messages.filter(msg => {
      // 保留决策、错误、文件修改等
      const content = JSON.stringify(msg.content);
      return (
        content.includes('decision') ||
        content.includes('error') ||
        content.includes('ERROR') ||
        content.includes('file') ||
        content.includes('modified')
      );
    });
  }

  /**
   * 简化工具结果
   */
  private simplifyToolResult(msg: Message): Message {
    return {
      ...msg,
      content: [{
        type: 'text',
        text: '[Tool result simplified]',
      }],
    };
  }

  /**
   * 创建边界标记
   */
  private createBoundaryMarker(type: string): Message {
    return {
      type: 'system',
      content: [{
        type: 'text',
        text: `--- ${type} boundary ---`,
      }],
    };
  }

  /**
   * 估算 Token 数
   */
  private estimateTokens(messages: Message[]): number {
    // 简单的估算：1 token ≈ 4 字符
    const content = JSON.stringify(messages);
    return Math.ceil(content.length / 4);
  }

  /**
   * 获取压缩统计
   */
  getStats(): {
    compactCount: number;
    lastCompactTurn: number;
    config: Required<ContextManagerConfig>;
  } {
    return {
      compactCount: this.compactCount,
      lastCompactTurn: this.lastCompactTurn,
      config: this.config,
    };
  }
}
