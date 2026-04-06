/**
 * Micro Compaction
 * 轻量级上下文压缩，针对单个对话轮次
 */

import type { Message } from './index.js';

export interface MicroCompactConfig {
  maxMessagesToKeep: number;
  preserveSystemMessages: boolean;
  preserveLastN: number;
}

export interface MicroCompactResult {
  messages: Message[];
  removedCount: number;
  removedTokens: number;
}

export class MicroCompaction {
  private config: MicroCompactConfig;

  constructor(config: Partial<MicroCompactConfig> = {}) {
    this.config = {
      maxMessagesToKeep: config.maxMessagesToKeep || 50,
      preserveSystemMessages: config.preserveSystemMessages ?? true,
      preserveLastN: config.preserveLastN || 5
    };
  }

  compact(messages: Message[]): MicroCompactResult {
    const preCount = messages.length;

    const systemMessages = this.config.preserveSystemMessages
      ? messages.filter(m => m.role === 'system')
      : [];

    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const lastN = nonSystemMessages.splice(-this.config.preserveLastN);

    const middleMessages = nonSystemMessages.slice(-this.config.maxMessagesToKeep);

    const compacted = [
      ...systemMessages,
      ...middleMessages,
      ...lastN
    ];

    const removedCount = preCount - compacted.length;

    return {
      messages: compacted,
      removedCount,
      removedTokens: Math.ceil(removedCount * 50)
    };
  }

  compactByTokens(messages: Message[], maxTokens: number): MicroCompactResult {
    let result: MicroCompactResult = {
      messages,
      removedCount: 0,
      removedTokens: 0
    };

    while (this.estimateTokens(result.messages) > maxTokens && result.messages.length > 10) {
      result = {
        messages: this.compact(result.messages).messages,
        removedCount: result.removedCount + 1,
        removedTokens: result.removedTokens + 50
      };
    }

    return result;
  }

  private estimateTokens(messages: Message[]): number {
    return messages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : JSON.stringify(msg.content);
      return sum + Math.ceil(content.length / 4);
    }, 0);
  }

  stripImages(messages: Message[]): Message[] {
    return messages.map(msg => {
      if (typeof msg.content === 'object' && !Array.isArray(msg.content)) {
        const content = msg.content as Record<string, unknown>;
        if (content && 'type' in content) {
          return msg;
        }
      }
      return msg;
    });
  }
}

export const defaultMicroCompactConfig: MicroCompactConfig = {
  maxMessagesToKeep: 50,
  preserveSystemMessages: true,
  preserveLastN: 5
};
