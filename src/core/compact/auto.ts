/**
 * Auto Compaction
 * 基于 Claude Code 的自动上下文压缩
 */

import type { Message, CompactionConfig } from './index.js';

export interface AutoCompactConfig {
  bufferTokens: number;
  warningThreshold: number;
  errorThreshold: number;
  postCompactBudget: number;
}

export interface AutoCompactResult {
  boundaryMarker: SystemMessage;
  summaryMessages: UserMessage[];
  attachments: AttachmentMessage[];
  preCompactTokenCount: number;
  postCompactTokenCount: number;
}

export interface SystemMessage {
  role: 'system';
  content: string;
  timestamp: number;
}

export interface UserMessage {
  role: 'user';
  content: string;
  timestamp: number;
}

export interface AttachmentMessage {
  type: 'attachment';
  content: unknown;
  mimeType: string;
}

export class AutoCompaction {
  private config: AutoCompactConfig;
  private lastCompactTurn: number = 0;

  constructor(config: CompactionConfig) {
    this.config = {
      bufferTokens: config.autoCompactBufferTokens,
      warningThreshold: config.warningThresholdBuffer,
      errorThreshold: config.errorThresholdBuffer,
      postCompactBudget: config.postCompactTokenBudget
    };
  }

  shouldCompact(currentTokens: number, turnCount: number): boolean {
    if (currentTokens >= this.config.warningThreshold) {
      if (turnCount > this.lastCompactTurn) {
        this.lastCompactTurn = turnCount;
        return true;
      }
    }
    return false;
  }

  async compact(
    messages: Message[],
    options: AutoCompactOptions = {}
  ): Promise<AutoCompactResult> {
    const preCompactTokenCount = this.estimateTokens(messages);

    const groups = this.groupMessagesByApiRound(messages);
    const summaries = await this.generateSummaries(groups, options);

    const boundaryMarker = this.createBoundaryMarker(preCompactTokenCount, summaries.length);
    const postCompactMessages = this.buildPostCompactMessages(messages, summaries, boundaryMarker);
    const postCompactTokenCount = this.estimateTokens(postCompactMessages);

    return {
      boundaryMarker,
      summaryMessages: summaries.map(s => ({
        role: 'user' as const,
        content: s,
        timestamp: Date.now()
      })),
      attachments: this.extractAttachments(messages),
      preCompactTokenCount,
      postCompactTokenCount
    };
  }

  private groupMessagesByApiRound(messages: Message[]): Message[][] {
    const groups: Message[][] = [];
    let currentGroup: Message[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        groups.push([msg]);
      } else {
        currentGroup.push(msg);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  private async generateSummaries(
    groups: Message[][],
    options: AutoCompactOptions
  ): Promise<string[]> {
    const summaries: string[] = [];

    for (const group of groups) {
      const content = this.extractContent(group);
      if (content.length > 100) {
        const summary = await options.summarizeFn?.(content) || this.simpleSummarize(content);
        summaries.push(summary);
      }
    }

    return summaries;
  }

  private simpleSummarize(content: string): string {
    const truncated = content.slice(0, 500);
    return truncated.length < content.length ? `${truncated}...` : truncated;
  }

  private createBoundaryMarker(
    preTokens: number,
    summaryCount: number
  ): SystemMessage {
    return {
      role: 'system',
      content: `[Context compacted: ${preTokens} tokens → ${summaryCount} summaries. Previous conversation summarized.]`,
      timestamp: Date.now()
    };
  }

  private buildPostCompactMessages(
    original: Message[],
    summaries: string[],
    boundaryMarker: SystemMessage
  ): Message[] {
    const systemMessages = original.filter(m => m.role === 'system' && !this.isBoundaryMarker(m));
    const recentMessages = original.slice(-10);

    return [
      ...systemMessages,
      boundaryMarker,
      ...summaries.map(s => ({ role: 'user' as const, content: s })),
      ...recentMessages
    ];
  }

  private extractAttachments(messages: Message[]): AttachmentMessage[] {
    const attachments: AttachmentMessage[] = [];

    for (const msg of messages) {
      if (typeof msg.content === 'object' && msg.content !== null) {
        const content = msg.content as Record<string, unknown>;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (typeof item === 'object' && item !== null && 'type' in item) {
              attachments.push(item as AttachmentMessage);
            }
          }
        }
      }
    }

    return attachments;
  }

  private extractContent(messages: Message[]): string {
    return messages
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join('\n');
  }

  private isBoundaryMarker(msg: Message): boolean {
    return typeof msg.content === 'string' && msg.content.includes('[Context compacted:');
  }

  private estimateTokens(messages: Message[]): number {
    const content = this.extractContent(messages);
    return Math.ceil(content.length / 4);
  }

  getLastCompactTurn(): number {
    return this.lastCompactTurn;
  }

  reset(): void {
    this.lastCompactTurn = 0;
  }
}

export interface AutoCompactOptions {
  summarizeFn?: (content: string) => Promise<string>;
  maxSummaries?: number;
}

export const defaultAutoCompactConfig: AutoCompactConfig = {
  bufferTokens: 13000,
  warningThreshold: 20000,
  errorThreshold: 20000,
  postCompactBudget: 50000
};
