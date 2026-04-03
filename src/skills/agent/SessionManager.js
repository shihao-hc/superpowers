/**
 * Session Manager for Skill Execution
 * Manages session state, conversation history, and skill execution context
 */

class SessionManager {
  constructor(options = {}) {
    this.sessions = new Map();
    this.maxSessions = options.maxSessions || 1000;
    this.sessionTimeout = options.sessionTimeout || 3600000; // 1 hour
    this.maxHistoryLength = options.maxHistoryLength || 100;
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes
    
    this._startCleanupTimer();
  }

  /**
   * Create or get a session
   */
  getSession(sessionId, options = {}) {
    if (!sessionId) {
      sessionId = this._generateSessionId();
    }

    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = this._createSession(sessionId, options);
      this.sessions.set(sessionId, session);
      
      if (this.sessions.size > this.maxSessions) {
        this._cleanupOldSessions();
      }
    }

    session.lastAccessed = Date.now();
    session.accessCount++;
    
    return session;
  }

  /**
   * Create a new session
   */
  _createSession(sessionId, options) {
    return {
      id: sessionId,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      userId: options.userId || null,
      conversationId: options.conversationId || null,
      context: options.context || {},
      history: [],
      skillStates: new Map(),
      metadata: {
        userAgent: options.userAgent || null,
        ipAddress: options.ipAddress || null,
        locale: options.locale || 'zh-CN',
        timezone: options.timezone || 'UTC'
      },
      executionQueue: [],
      activeExecutions: new Map(),
      results: new Map(),
      preferences: {
        autoExecuteSkills: options.autoExecuteSkills !== false,
        requireConfirmation: options.requireConfirmation || false,
        maxConcurrentExecutions: options.maxConcurrentExecutions || 3,
        outputFormat: options.outputFormat || 'text'
      }
    };
  }

  /**
   * Update session context
   */
  updateContext(sessionId, context) {
    const session = this.getSession(sessionId);
    session.context = { ...session.context, ...context };
    session.lastAccessed = Date.now();
    return session;
  }

  /**
   * Add to conversation history
   */
  addToHistory(sessionId, entry) {
    const session = this.getSession(sessionId);
    
    const historyEntry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: entry.type, // 'user', 'assistant', 'system', 'skill_call', 'skill_result'
      content: entry.content,
      metadata: entry.metadata || {},
      skillName: entry.skillName || null,
      executionId: entry.executionId || null
    };

    session.history.push(historyEntry);
    
    if (session.history.length > this.maxHistoryLength) {
      session.history = session.history.slice(-this.maxHistoryLength);
    }

    return historyEntry;
  }

  /**
   * Get conversation history
   */
  getHistory(sessionId, options = {}) {
    const session = this.getSession(sessionId);
    const { limit = 50, offset = 0, types = null } = options;
    
    let history = session.history;
    
    if (types && types.length > 0) {
      history = history.filter(entry => types.includes(entry.type));
    }
    
    const start = Math.max(0, history.length - limit - offset);
    const end = history.length - offset;
    
    return history.slice(start, end);
  }

  /**
   * Update skill state
   */
  updateSkillState(sessionId, skillName, state) {
    const session = this.getSession(sessionId);
    
    if (!session.skillStates.has(skillName)) {
      session.skillStates.set(skillName, {
        executions: 0,
        successes: 0,
        failures: 0,
        lastExecution: null,
        lastError: null,
        averageDuration: 0,
        totalDuration: 0
      });
    }

    const skillState = session.skillStates.get(skillName);
    Object.assign(skillState, state);
    
    return skillState;
  }

  /**
   * Record skill execution
   */
  recordSkillExecution(sessionId, skillName, executionId, result) {
    const session = this.getSession(sessionId);
    
    // Update skill state
    const skillState = this.updateSkillState(sessionId, skillName, {
      lastExecution: Date.now(),
      executions: (session.skillStates.get(skillName)?.executions || 0) + 1,
      successes: (session.skillStates.get(skillName)?.successes || 0) + (result.success ? 1 : 0),
      failures: (session.skillStates.get(skillName)?.failures || 0) + (result.success ? 0 : 1)
    });

    if (result.duration) {
      skillState.totalDuration += result.duration;
      skillState.averageDuration = skillState.totalDuration / skillState.executions;
    }

    if (!result.success && result.error) {
      skillState.lastError = result.error;
    }

    // Store execution result
    session.results.set(executionId, {
      skillName,
      executionId,
      result,
      timestamp: Date.now()
    });

    // Add to history
    this.addToHistory(sessionId, {
      type: result.success ? 'skill_result' : 'skill_error',
      content: result,
      skillName,
      executionId,
      metadata: {
        duration: result.duration,
        success: result.success
      }
    });

    return { skillState, executionId };
  }

  /**
   * Add to execution queue
   */
  addToExecutionQueue(sessionId, execution) {
    const session = this.getSession(sessionId);
    
    const queueEntry = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      skillName: execution.skillName,
      parameters: execution.parameters || {},
      priority: execution.priority || 'normal',
      metadata: execution.metadata || {}
    };

    session.executionQueue.push(queueEntry);
    
    // Sort by priority
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    session.executionQueue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return queueEntry;
  }

  /**
   * Get next from execution queue
   */
  getNextFromQueue(sessionId) {
    const session = this.getSession(sessionId);
    
    if (session.executionQueue.length === 0) {
      return null;
    }

    if (session.activeExecutions.size >= session.preferences.maxConcurrentExecutions) {
      return null;
    }

    return session.executionQueue.shift();
  }

  /**
   * Mark execution as active
   */
  markExecutionActive(sessionId, executionId, execution) {
    const session = this.getSession(sessionId);
    
    session.activeExecutions.set(executionId, {
      ...execution,
      startedAt: Date.now(),
      status: 'running'
    });

    return session.activeExecutions.get(executionId);
  }

  /**
   * Complete active execution
   */
  completeExecution(sessionId, executionId, result) {
    const session = this.getSession(sessionId);
    
    const execution = session.activeExecutions.get(executionId);
    if (execution) {
      execution.completedAt = Date.now();
      execution.duration = execution.completedAt - execution.startedAt;
      execution.status = result.success ? 'completed' : 'failed';
      execution.result = result;
      
      session.activeExecutions.delete(executionId);
    }

    return execution;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId) {
    const session = this.getSession(sessionId);
    
    const skillStats = {};
    for (const [skillName, state] of session.skillStates) {
      skillStats[skillName] = { ...state };
    }

    return {
      sessionId: session.id,
      duration: Date.now() - session.createdAt,
      historyLength: session.history.length,
      queueLength: session.executionQueue.length,
      activeExecutions: session.activeExecutions.size,
      totalResults: session.results.size,
      skillStats
    };
  }

  /**
   * Clear session history
   */
  clearHistory(sessionId) {
    const session = this.getSession(sessionId);
    session.history = [];
    return session;
  }

  /**
   * Clear session results
   */
  clearResults(sessionId) {
    const session = this.getSession(sessionId);
    session.results.clear();
    return session;
  }

  /**
   * Delete session
   */
  deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    const activeSessions = [];
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccessed < this.sessionTimeout) {
        activeSessions.push({
          id: sessionId,
          lastAccessed: session.lastAccessed,
          age: now - session.createdAt,
          historyLength: session.history.length,
          activeExecutions: session.activeExecutions.size
        });
      }
    }

    return activeSessions;
  }

  /**
   * Export session data
   */
  exportSession(sessionId) {
    const session = this.getSession(sessionId);
    
    return {
      ...session,
      skillStates: Array.from(session.skillStates.entries()),
      results: Array.from(session.results.entries()),
      activeExecutions: Array.from(session.activeExecutions.entries())
    };
  }

  /**
   * Import session data
   */
  importSession(sessionData) {
    const session = {
      ...sessionData,
      skillStates: new Map(sessionData.skillStates || []),
      results: new Map(sessionData.results || []),
      activeExecutions: new Map(sessionData.activeExecutions || [])
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Generate unique session ID
   */
  _generateSessionId() {
    return `session_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup old sessions
   */
  _cleanupOldSessions() {
    const now = Date.now();
    const sessionsToDelete = [];
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccessed > this.sessionTimeout) {
        sessionsToDelete.push(sessionId);
      }
    }

    for (const sessionId of sessionsToDelete) {
      this.sessions.delete(sessionId);
    }

    if (sessionsToDelete.length > 0) {
      console.log(`[SessionManager] Cleaned up ${sessionsToDelete.length} expired sessions`);
    }

    return sessionsToDelete.length;
  }

  /**
   * Start cleanup timer
   */
  _startCleanupTimer() {
    setInterval(() => {
      this._cleanupOldSessions();
    }, this.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

module.exports = { SessionManager };