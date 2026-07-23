/**
 * Session Memory Compaction
 * 会话级别的记忆压缩和摘要
 */

import type { Message } from './index.js';

export interface SessionMemory {
  sessionId: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  tasks: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionCompactResult {
  memory: SessionMemory;
  originalMessageCount: number;
  compactedMessageCount: number;
}

export class SessionCompaction {
  private memories: Map<string, SessionMemory> = new Map();

  async compact(
    sessionId: string,
    messages: Message[],
    options: SessionCompactOptions = {}
  ): Promise<SessionCompactResult> {
    const originalCount = messages.length;

    const existingMemory = this.memories.get(sessionId);
    const previousSummary = existingMemory?.summary || '';

    const keyPoints = this.extractKeyPoints(messages);
    const decisions = this.extractDecisions(messages);
    const tasks = this.extractTasks(messages);

    const summary = await options.summarizeFn?.(messages, previousSummary) 
      || this.generateSummary(messages);

    const memory: SessionMemory = {
      sessionId,
      summary,
      keyPoints,
      decisions,
      tasks,
      createdAt: existingMemory?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    this.memories.set(sessionId, memory);

    return {
      memory,
      originalMessageCount: originalCount,
      compactedMessageCount: this.countSummaryMessages(memory)
    };
  }

  private extractKeyPoints(messages: Message[]): string[] {
    const keyPoints: string[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      if (content.includes('important:') || content.includes('key:')) {
        const cleaned = content.replace(/important:|key:/gi, '').trim();
        if (!seen.has(cleaned) && cleaned.length > 10) {
          keyPoints.push(cleaned);
          seen.add(cleaned);
        }
      }
    }

    return keyPoints.slice(0, 10);
  }

  private extractDecisions(messages: Message[]): string[] {
    const decisions: string[] = [];

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      if (content.includes('decided:') || content.includes('decision:')) {
        const cleaned = content.replace(/decided:|decision:/gi, '').trim();
        if (cleaned.length > 5) {
          decisions.push(cleaned);
        }
      }
    }

    return decisions.slice(0, 5);
  }

  private extractTasks(messages: Message[]): string[] {
    const tasks: string[] = [];

    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      
      if (content.includes('task:') || content.includes('todo:')) {
        const cleaned = content.replace(/task:|todo:/gi, '').trim();
        if (cleaned.length > 5) {
          tasks.push(cleaned);
        }
      }
    }

    return tasks.slice(0, 10);
  }

  private generateSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    const firstUser = userMessages[0];
    const firstTopic = firstUser 
      ? (typeof firstUser.content === 'string' ? firstUser.content.slice(0, 100) : 'Complex interaction')
      : 'No user messages';

    return `Session with ${userMessages.length} user messages and ${assistantMessages.length} assistant responses. Started with: ${firstTopic}`;
  }

  private countSummaryMessages(memory: SessionMemory): number {
    return 1 + memory.keyPoints.length + memory.decisions.length + memory.tasks.length;
  }

  getMemory(sessionId: string): SessionMemory | undefined {
    return this.memories.get(sessionId);
  }

  updateMemory(sessionId: string, updates: Partial<SessionMemory>): void {
    const existing = this.memories.get(sessionId);
    if (existing) {
      this.memories.set(sessionId, { ...existing, ...updates, updatedAt: Date.now() });
    }
  }

  deleteMemory(sessionId: string): boolean {
    return this.memories.delete(sessionId);
  }

  getAllMemories(): SessionMemory[] {
    return Array.from(this.memories.values());
  }

  clear(): void {
    this.memories.clear();
  }
}

export interface SessionCompactOptions {
  summarizeFn?: (messages: Message[], previousSummary: string) => Promise<string>;
  maxKeyPoints?: number;
  maxTasks?: number;
}

export const globalSessionCompaction = new SessionCompaction();
