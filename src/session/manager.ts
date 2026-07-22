/**
 * Session Manager - 会话管理
 * 
 * 管理对话会话的创建、存储和恢复
 */

// @ts-expect-error - Cannot find module '../messages/types.js'
import type { Message } from '../messages/types.js';

export interface SessionMetadata {
  id: string;
  firstPrompt: string;
  createdAt: number;
  updatedAt: number;
  cwd: string;
  customTitle?: string;
  tag?: string;
}

export interface Session {
  id: string;
  metadata: SessionMetadata;
  messages: Message[];
}

const SESSION_PREFIX = 'session_';

function generateSessionId(): string {
  return `${SESSION_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

export class SessionManager {
  private currentSession: Session | null = null;
  private sessions: Map<string, Session> = new Map();
  private listeners: Set<(session: Session) => void> = new Set();

  createSession(cwd: string, firstPrompt?: string): Session {
    const id = generateSessionId();
    const now = Date.now();

    const session: Session = {
      id,
      metadata: {
        id,
        firstPrompt: firstPrompt || '',
        createdAt: now,
        updatedAt: now,
        cwd,
      },
      messages: [],
    };

    this.sessions.set(id, session);
    this.currentSession = session;
    this.notifyListeners();

    return session;
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  setCurrentSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.currentSession = session;
      this.notifyListeners();
      return true;
    }
    return false;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  addMessage(message: Message): void {
    if (!this.currentSession) return;

    this.currentSession.messages.push(message);
    this.currentSession.metadata.updatedAt = Date.now();
    this.notifyListeners();
  }

  addMessages(messages: Message[]): void {
    if (!this.currentSession) return;

    this.currentSession.messages.push(...messages);
    this.currentSession.metadata.updatedAt = Date.now();
    this.notifyListeners();
  }

  getMessages(): Message[] {
    return this.currentSession?.messages || [];
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted && this.currentSession?.id === sessionId) {
      this.currentSession = null;
      this.notifyListeners();
    }
    return deleted;
  }

  updateMetadata(updates: Partial<SessionMetadata>): void {
    if (!this.currentSession) return;
    Object.assign(this.currentSession.metadata, updates);
    this.currentSession.metadata.updatedAt = Date.now();
    this.notifyListeners();
  }

  subscribe(listener: (session: Session) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    if (!this.currentSession) return;
    for (const listener of this.listeners) {
      try {
        listener(this.currentSession);
      } catch (error) {
        console.error('[SessionManager] Listener error:', error);
      }
    }
  }

  exportSession(): string | null {
    if (!this.currentSession) return null;
    return JSON.stringify(this.currentSession, null, 2);
  }

  importSession(data: string): Session | null {
    try {
      const session = JSON.parse(data) as Session;
      if (!session.id || !session.metadata || !Array.isArray(session.messages)) {
        throw new Error('Invalid session format');
      }
      this.sessions.set(session.id, session);
      this.currentSession = session;
      this.notifyListeners();
      return session;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.sessions.clear();
    this.currentSession = null;
    this.notifyListeners();
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}

export const globalSessionManager = new SessionManager();

export function createSessionManager(): SessionManager {
  return new SessionManager();
}
