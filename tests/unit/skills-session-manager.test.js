const { SessionManager } = require('../../src/skills/agent/SessionManager');

describe('SessionManager (skills/agent)', () => {
  let sm;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1000000);
    sm = new SessionManager({ cleanupInterval: 9999999, sessionTimeout: 5000 });
  });

  afterEach(() => {
    sm.stopCleanupTimer();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('sets defaults', () => {
      const d = new SessionManager();
      expect(d.maxSessions).toBe(1000);
      expect(d.sessionTimeout).toBe(3600000);
      expect(d.maxHistoryLength).toBe(100);
      expect(d.cleanupInterval).toBe(300000);
      d.stopCleanupTimer();
    });

    it('accepts custom options', () => {
      const custom = new SessionManager({ maxSessions: 10, sessionTimeout: 5000, maxHistoryLength: 5 });
      expect(custom.maxSessions).toBe(10);
      expect(custom.sessionTimeout).toBe(5000);
      expect(custom.maxHistoryLength).toBe(5);
      custom.stopCleanupTimer();
    });
  });

  describe('getSession', () => {
    it('creates session when id is null', () => {
      const session = sm.getSession(null);
      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session_/);
      expect(sm.sessions.size).toBe(1);
    });

    it('creates session when id is empty string', () => {
      const session = sm.getSession('');
      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session_/);
    });

    it('returns existing session', () => {
      const s1 = sm.getSession('s1');
      const s2 = sm.getSession('s1');
      expect(s2).toBe(s1);
      expect(sm.sessions.size).toBe(1);
    });

    it('increments accessCount on each access', () => {
      const s = sm.getSession('s1');
      expect(s.accessCount).toBe(1);
      sm.getSession('s1');
      expect(s.accessCount).toBe(2);
    });

    it('updates lastAccessed on each access', () => {
      const s = sm.getSession('s1');
      const before = s.lastAccessed;
      jest.advanceTimersByTime(1000);
      sm.getSession('s1');
      expect(s.lastAccessed).toBeGreaterThan(before);
    });

    it('cleans up old sessions when over maxSessions', () => {
      sm.maxSessions = 2;
      const expired = sm.getSession('expired');
      expired.lastAccessed = 0;
      sm.getSession('s2');
      sm.getSession('s3');
      expect(sm.sessions.has('expired')).toBe(false);
      expect(sm.sessions.has('s2')).toBe(true);
      expect(sm.sessions.has('s3')).toBe(true);
    });

    it('passes options to _createSession', () => {
      const s = sm.getSession('s1', { userId: 'u1', locale: 'en' });
      expect(s.userId).toBe('u1');
      expect(s.metadata.locale).toBe('en');
    });
  });

  describe('_createSession', () => {
    it('creates a session with all default fields', () => {
      const s = sm.getSession('s1');
      expect(s.id).toBe('s1');
      expect(s.createdAt).toBe(1000000);
      expect(s.lastAccessed).toBe(1000000);
      expect(s.accessCount).toBe(1);
      expect(s.userId).toBeNull();
      expect(s.conversationId).toBeNull();
      expect(s.context).toEqual({});
      expect(s.history).toEqual([]);
      expect(s.skillStates).toBeInstanceOf(Map);
      expect(s.metadata).toEqual({ userAgent: null, ipAddress: null, locale: 'zh-CN', timezone: 'UTC' });
      expect(s.executionQueue).toEqual([]);
      expect(s.activeExecutions).toBeInstanceOf(Map);
      expect(s.results).toBeInstanceOf(Map);
      expect(s.preferences.autoExecuteSkills).toBe(true);
      expect(s.preferences.requireConfirmation).toBe(false);
      expect(s.preferences.maxConcurrentExecutions).toBe(3);
      expect(s.preferences.outputFormat).toBe('text');
    });

    it('accepts all option overrides', () => {
      const s = sm.getSession('s1', {
        userId: 'u1',
        conversationId: 'c1',
        context: { foo: 'bar' },
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
        locale: 'en',
        timezone: 'Asia/Shanghai',
        autoExecuteSkills: false,
        requireConfirmation: true,
        maxConcurrentExecutions: 5,
        outputFormat: 'json'
      });
      expect(s.userId).toBe('u1');
      expect(s.conversationId).toBe('c1');
      expect(s.context).toEqual({ foo: 'bar' });
      expect(s.metadata.userAgent).toBe('test-agent');
      expect(s.metadata.ipAddress).toBe('127.0.0.1');
      expect(s.metadata.locale).toBe('en');
      expect(s.metadata.timezone).toBe('Asia/Shanghai');
      expect(s.preferences.autoExecuteSkills).toBe(false);
      expect(s.preferences.requireConfirmation).toBe(true);
      expect(s.preferences.maxConcurrentExecutions).toBe(5);
      expect(s.preferences.outputFormat).toBe('json');
    });
  });

  describe('updateContext', () => {
    it('merges context', () => {
      sm.getSession('s1', { context: { a: 1 } });
      sm.updateContext('s1', { b: 2 });
      expect(sm.sessions.get('s1').context).toEqual({ a: 1, b: 2 });
    });

    it('overwrites existing keys', () => {
      sm.getSession('s1', { context: { a: 1 } });
      sm.updateContext('s1', { a: 2 });
      expect(sm.sessions.get('s1').context).toEqual({ a: 2 });
    });
  });

  describe('addToHistory', () => {
    it('adds a history entry', () => {
      sm.getSession('s1');
      const entry = sm.addToHistory('s1', { type: 'user', content: 'hello' });
      expect(entry.id).toMatch(/^hist_/);
      expect(entry.type).toBe('user');
      expect(entry.content).toBe('hello');
      expect(entry.metadata).toEqual({});
      expect(entry.skillName).toBeNull();
      expect(entry.executionId).toBeNull();
    });

    it('stores entry in session history', () => {
      sm.getSession('s1');
      sm.addToHistory('s1', { type: 'user', content: 'hello' });
      expect(sm.sessions.get('s1').history).toHaveLength(1);
    });

    it('trims history when over maxHistoryLength', () => {
      sm.maxHistoryLength = 3;
      sm.getSession('s1');
      for (let i = 0; i < 5; i++) {
        sm.addToHistory('s1', { type: 'user', content: `msg${i}` });
      }
      expect(sm.sessions.get('s1').history).toHaveLength(3);
      expect(sm.sessions.get('s1').history[0].content).toBe('msg2');
    });
  });

  describe('getHistory', () => {
    beforeEach(() => {
      sm.getSession('s1');
      for (let i = 0; i < 10; i++) {
        sm.addToHistory('s1', { type: i < 5 ? 'user' : 'assistant', content: `msg${i}` });
      }
    });

    it('returns last N entries by default', () => {
      const history = sm.getHistory('s1');
      expect(history).toHaveLength(10);
    });

    it('respects limit option', () => {
      const history = sm.getHistory('s1', { limit: 3 });
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('msg7');
    });

    it('respects offset option', () => {
      const history = sm.getHistory('s1', { limit: 3, offset: 5 });
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('msg2');
    });

    it('filters by type', () => {
      const history = sm.getHistory('s1', { types: ['user'] });
      expect(history).toHaveLength(5);
      history.forEach(e => expect(e.type).toBe('user'));
    });

    it('returns empty array when no history', () => {
      const sm2 = new SessionManager();
      sm2.getSession('s2');
      expect(sm2.getHistory('s2')).toEqual([]);
      sm2.stopCleanupTimer();
    });
  });

  describe('updateSkillState', () => {
    it('creates initial skill state', () => {
      sm.getSession('s1');
      const state = sm.updateSkillState('s1', 'testSkill', {});
      expect(state.executions).toBe(0);
      expect(state.successes).toBe(0);
      expect(state.failures).toBe(0);
      expect(state.lastExecution).toBeNull();
      expect(state.lastError).toBeNull();
      expect(state.averageDuration).toBe(0);
      expect(state.totalDuration).toBe(0);
    });

    it('updates existing skill state', () => {
      sm.getSession('s1');
      sm.updateSkillState('s1', 'testSkill', { executions: 5 });
      const state = sm.updateSkillState('s1', 'testSkill', { successes: 3 });
      expect(state.executions).toBe(5);
      expect(state.successes).toBe(3);
    });

    it('returns updated state', () => {
      sm.getSession('s1');
      const state = sm.updateSkillState('s1', 's1', { lastExecution: Date.now() });
      expect(state.lastExecution).toBe(1000000);
    });
  });

  describe('recordSkillExecution', () => {
    it('updates skill state counts on success', () => {
      sm.getSession('s1');
      sm.recordSkillExecution('s1', 'testSkill', 'exec1', { success: true, duration: 100 });
      const state = sm.sessions.get('s1').skillStates.get('testSkill');
      expect(state.executions).toBe(1);
      expect(state.successes).toBe(1);
      expect(state.failures).toBe(0);
    });

    it('updates skill state counts on failure', () => {
      sm.getSession('s1');
      sm.recordSkillExecution('s1', 'testSkill', 'exec1', { success: false, duration: 50, error: 'fail' });
      const state = sm.sessions.get('s1').skillStates.get('testSkill');
      expect(state.executions).toBe(1);
      expect(state.successes).toBe(0);
      expect(state.failures).toBe(1);
      expect(state.lastError).toBe('fail');
    });

    it('calculates average duration', () => {
      sm.getSession('s1');
      sm.recordSkillExecution('s1', 'testSkill', 'exec1', { success: true, duration: 100 });
      sm.recordSkillExecution('s1', 'testSkill', 'exec2', { success: true, duration: 200 });
      const state = sm.sessions.get('s1').skillStates.get('testSkill');
      expect(state.totalDuration).toBe(300);
      expect(state.averageDuration).toBe(150);
    });

    it('stores execution result', () => {
      sm.getSession('s1');
      sm.recordSkillExecution('s1', 'testSkill', 'exec1', { success: true });
      const result = sm.sessions.get('s1').results.get('exec1');
      expect(result.skillName).toBe('testSkill');
      expect(result.executionId).toBe('exec1');
      expect(result.result.success).toBe(true);
    });

    it('adds history entry', () => {
      sm.getSession('s1');
      sm.recordSkillExecution('s1', 'testSkill', 'exec1', { success: true, duration: 100 });
      const history = sm.sessions.get('s1').history;
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('skill_result');
      expect(history[0].skillName).toBe('testSkill');
    });

    it('adds skill_error history entry on failure', () => {
      sm.getSession('s1');
      sm.recordSkillExecution('s1', 'testSkill', 'exec1', { success: false, error: 'err' });
      expect(sm.sessions.get('s1').history[0].type).toBe('skill_error');
    });
  });

  describe('addToExecutionQueue', () => {
    it('adds entry with generated id', () => {
      sm.getSession('s1');
      const entry = sm.addToExecutionQueue('s1', { skillName: 'testSkill' });
      expect(entry.id).toMatch(/^queue_/);
      expect(entry.skillName).toBe('testSkill');
      expect(entry.priority).toBe('normal');
    });

    it('sorts by priority (high first)', () => {
      sm.getSession('s1');
      sm.addToExecutionQueue('s1', { skillName: 'low', priority: 'low' });
      sm.addToExecutionQueue('s1', { skillName: 'high', priority: 'high' });
      sm.addToExecutionQueue('s1', { skillName: 'normal', priority: 'normal' });
      const queue = sm.sessions.get('s1').executionQueue;
      expect(queue[0].skillName).toBe('high');
      expect(queue[1].skillName).toBe('normal');
      expect(queue[2].skillName).toBe('low');
    });
  });

  describe('getNextFromQueue', () => {
    it('returns next queue entry', () => {
      sm.getSession('s1');
      sm.addToExecutionQueue('s1', { skillName: 'test' });
      const next = sm.getNextFromQueue('s1');
      expect(next.skillName).toBe('test');
    });

    it('returns null when queue is empty', () => {
      sm.getSession('s1');
      expect(sm.getNextFromQueue('s1')).toBeNull();
    });

    it('returns null when at max concurrent executions', () => {
      sm.getSession('s1');
      sm.sessions.get('s1').preferences.maxConcurrentExecutions = 1;
      sm.markExecutionActive('s1', 'e1', { skillName: 'running' });
      sm.addToExecutionQueue('s1', { skillName: 'waiting' });
      expect(sm.getNextFromQueue('s1')).toBeNull();
    });

    it('removes entry from queue', () => {
      sm.getSession('s1');
      sm.addToExecutionQueue('s1', { skillName: 'test' });
      sm.getNextFromQueue('s1');
      expect(sm.sessions.get('s1').executionQueue).toHaveLength(0);
    });
  });

  describe('markExecutionActive', () => {
    it('adds execution to active map', () => {
      sm.getSession('s1');
      const active = sm.markExecutionActive('s1', 'e1', { skillName: 'test' });
      expect(active.status).toBe('running');
      expect(active.startedAt).toBe(1000000);
      expect(sm.sessions.get('s1').activeExecutions.size).toBe(1);
    });
  });

  describe('completeExecution', () => {
    it('marks execution completed on success', () => {
      sm.getSession('s1');
      sm.markExecutionActive('s1', 'e1', { skillName: 'test' });
      jest.advanceTimersByTime(500);
      const exec = sm.completeExecution('s1', 'e1', { success: true });
      expect(exec.status).toBe('completed');
      expect(exec.duration).toBe(500);
    });

    it('marks execution failed on failure', () => {
      sm.getSession('s1');
      sm.markExecutionActive('s1', 'e1', { skillName: 'test' });
      jest.advanceTimersByTime(200);
      const exec = sm.completeExecution('s1', 'e1', { success: false });
      expect(exec.status).toBe('failed');
      expect(exec.duration).toBe(200);
    });

    it('removes execution from active map', () => {
      sm.getSession('s1');
      sm.markExecutionActive('s1', 'e1', { skillName: 'test' });
      sm.completeExecution('s1', 'e1', { success: true });
      expect(sm.sessions.get('s1').activeExecutions.size).toBe(0);
    });

    it('handles unknown executionId gracefully', () => {
      sm.getSession('s1');
      const exec = sm.completeExecution('s1', 'ghost', { success: true });
      expect(exec).toBeUndefined();
    });
  });

  describe('getSessionStats', () => {
    it('returns stats with all fields', () => {
      sm.getSession('s1');
      sm.addToHistory('s1', { type: 'user', content: 'hi' });
      sm.addToExecutionQueue('s1', { skillName: 'test' });
      sm.recordSkillExecution('s1', 'testSkill', 'e1', { success: true, duration: 100 });
      const stats = sm.getSessionStats('s1');
      expect(stats.sessionId).toBe('s1');
      expect(stats.duration).toBeGreaterThanOrEqual(0);
      expect(stats.historyLength).toBe(2);
      expect(stats.queueLength).toBe(1);
      expect(stats.activeExecutions).toBe(0);
      expect(stats.totalResults).toBe(1);
      expect(stats.skillStats.testSkill).toBeDefined();
      expect(stats.skillStats.testSkill.executions).toBe(1);
    });
  });

  describe('clearHistory', () => {
    it('clears session history', () => {
      sm.getSession('s1');
      sm.addToHistory('s1', { type: 'user', content: 'hi' });
      sm.clearHistory('s1');
      expect(sm.sessions.get('s1').history).toHaveLength(0);
    });
  });

  describe('clearResults', () => {
    it('clears session results', () => {
      sm.getSession('s1');
      sm.recordSkillExecution('s1', 'test', 'e1', { success: true });
      sm.clearResults('s1');
      expect(sm.sessions.get('s1').results.size).toBe(0);
    });
  });

  describe('deleteSession', () => {
    it('removes session and returns true', () => {
      sm.getSession('s1');
      expect(sm.deleteSession('s1')).toBe(true);
      expect(sm.sessions.has('s1')).toBe(false);
    });

    it('returns false for non-existent session', () => {
      expect(sm.deleteSession('ghost')).toBe(false);
    });
  });

  describe('getActiveSessions', () => {
    it('returns only active sessions', () => {
      const expired = sm.getSession('expired');
      expired.lastAccessed = 0;
      jest.advanceTimersByTime(6000);
      sm.getSession('active1');
      sm.getSession('active2');
      const active = sm.getActiveSessions();
      expect(active).toHaveLength(2);
      expect(active.map(s => s.id)).toEqual(expect.arrayContaining(['active1', 'active2']));
    });

    it('returns empty array when no active sessions', () => {
      const s = sm.getSession('old');
      s.lastAccessed = 0;
      jest.advanceTimersByTime(6000);
      expect(sm.getActiveSessions()).toHaveLength(0);
    });
  });

  describe('exportSession', () => {
    it('converts Maps to arrays', () => {
      sm.getSession('s1');
      sm.recordSkillExecution('s1', 'test', 'e1', { success: true });
      const exported = sm.exportSession('s1');
      expect(Array.isArray(exported.skillStates)).toBe(true);
      expect(Array.isArray(exported.results)).toBe(true);
      expect(Array.isArray(exported.activeExecutions)).toBe(true);
    });
  });

  describe('importSession', () => {
    it('restores Maps from arrays', () => {
      sm.getSession('s1');
      sm.recordSkillExecution('s1', 'test', 'e1', { success: true });
      const exported = sm.exportSession('s1');
      const sm2 = new SessionManager();
      const imported = sm2.importSession(exported);
      expect(imported.skillStates).toBeInstanceOf(Map);
      expect(imported.results).toBeInstanceOf(Map);
      expect(imported.activeExecutions).toBeInstanceOf(Map);
      expect(imported.id).toBe('s1');
      sm2.stopCleanupTimer();
    });

    it('handles empty session data', () => {
      const sm2 = new SessionManager();
      const imported = sm2.importSession({ id: 'new' });
      expect(imported.skillStates).toBeInstanceOf(Map);
      expect(imported.skillStates.size).toBe(0);
      sm2.stopCleanupTimer();
    });
  });

  describe('_cleanupOldSessions', () => {
    it('removes expired sessions', () => {
      const fresh = sm.getSession('fresh');
      const old = sm.getSession('old');
      old.lastAccessed = 0;
      jest.advanceTimersByTime(6000);
      fresh.lastAccessed = Date.now();
      const count = sm._cleanupOldSessions();
      expect(count).toBe(1);
      expect(sm.sessions.has('old')).toBe(false);
      expect(sm.sessions.has('fresh')).toBe(true);
    });

    it('returns 0 when no expired sessions', () => {
      sm.getSession('fresh');
      expect(sm._cleanupOldSessions()).toBe(0);
    });
  });

  describe('_generateSessionId', () => {
    it('generates unique IDs', () => {
      const id1 = sm._generateSessionId();
      const id2 = sm._generateSessionId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^session_/);
    });
  });

  describe('cleanup timer integration', () => {
    it('fires _cleanupOldSessions on interval', () => {
      const spy = jest.spyOn(sm, '_cleanupOldSessions');
      jest.advanceTimersByTime(10000000);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('does not fire after timer is stopped', () => {
      const spy = jest.spyOn(sm, '_cleanupOldSessions');
      sm.stopCleanupTimer();
      jest.advanceTimersByTime(10000000);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('stopCleanupTimer', () => {
    it('stops cleanup interval', () => {
      sm.stopCleanupTimer();
      expect(sm.cleanupTimer).toBeNull();
    });
  });
});
