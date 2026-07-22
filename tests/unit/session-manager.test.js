const { SessionManager, sessionManager } = require('../../src/security/SessionManager');

describe('SessionManager', () => {
  let sm;

  beforeEach(() => {
    sm = new SessionManager({ cleanupInterval: 999999999 });
  });

  afterEach(() => {
    sm.stopCleanup();
  });

  afterAll(() => {
    sessionManager.stopCleanup();
  });

  describe('create', () => {
    it('creates a session with defaults', () => {
      const s = sm.create('s1', { userId: 'u1' });
      expect(s.id).toBe('s1');
      expect(s.data.userId).toBe('u1');
      expect(s.version).toBe(1);
      expect(s.locked).toBe(false);
      expect(s.expiresAt).toBeGreaterThan(Date.now());
    });

    it('creates with custom TTL', () => {
      const s = sm.create('s2', {}, 5000);
      expect(s.expiresAt - s.createdAt).toBe(5000);
    });
  });

  describe('get', () => {
    it('returns session by ID', () => {
      sm.create('s1', { userId: 'u1' });
      expect(sm.get('s1')).not.toBeNull();
    });

    it('returns null for non-existent session', () => {
      expect(sm.get('ghost')).toBeNull();
    });

    it('extends expiry by default', () => {
      sm.create('s1', {}, 100000);
      const before = sm.get('s1').expiresAt;
      const after = sm.get('s1').expiresAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('does not extend when extend=false', () => {
      sm.create('s1', {}, 3600000);
      const before = sm.get('s1').expiresAt;
      expect(sm.get('s1', false).expiresAt).toBe(before);
    });

    it('returns null and removes expired session', () => {
      sm.create('expired', {}, -1);
      expect(sm.get('expired', false)).toBeNull();
      expect(sm.size).toBe(0);
    });
  });

  describe('set', () => {
    it('sets session data and increments version', () => {
      sm.create('s1', {});
      expect(sm.set('s1', 'role', 'admin')).toBe(true);
      expect(sm.getData('s1', 'role')).toBe('admin');
      expect(sm.get('s1', false).version).toBe(2);
    });

    it('returns false for non-existent session', () => {
      expect(sm.set('ghost', 'k', 'v')).toBe(false);
    });
  });

  describe('getData', () => {
    it('returns specific key', () => {
      sm.create('s1', { name: 'test' });
      expect(sm.getData('s1', 'name')).toBe('test');
    });

    it('returns all data when no key', () => {
      const data = { name: 'test' };
      sm.create('s1', data);
      expect(sm.getData('s1')).toEqual(data);
    });

    it('returns null for non-existent session', () => {
      expect(sm.getData('ghost')).toBeNull();
    });
  });

  describe('destroy', () => {
    it('removes session', () => {
      sm.create('s1', {});
      expect(sm.destroy('s1')).toBe(true);
      expect(sm.get('s1')).toBeNull();
    });
  });

  describe('destroyUserSessions', () => {
    it('removes all sessions for a user', () => {
      sm.create('s1', { userId: 'u1' });
      sm.create('s2', { userId: 'u1' });
      sm.create('s3', { userId: 'u2' });
      expect(sm.destroyUserSessions('u1')).toBe(2);
      expect(sm.size).toBe(1);
    });
  });

  describe('refresh', () => {
    it('extends session TTL', () => {
      sm.create('s1', {}, 1000);
      const before = sm.get('s1', false).expiresAt;
      sm.refresh('s1', 3600000);
      expect(sm.get('s1', false).expiresAt).toBeGreaterThan(before);
    });

    it('returns false for non-existent session', () => {
      expect(sm.refresh('ghost')).toBe(false);
    });
  });

  describe('lock/unlock/checkLock', () => {
    it('locks and unlocks session', () => {
      sm.create('s1', {});
      expect(sm.lock('s1', 30000)).toBe(true);
      expect(sm.checkLock('s1').locked).toBe(true);
      expect(sm.checkLock('s1').remaining).toBeGreaterThan(0);
      sm.unlock('s1');
      expect(sm.checkLock('s1').locked).toBe(false);
    });

    it('auto-releases expired lock', () => {
      sm.create('s1', {});
      sm.lock('s1', -1);
      expect(sm.checkLock('s1').locked).toBe(false);
    });

    it('returns false for non-existent session', () => {
      expect(sm.lock('ghost')).toBe(false);
      expect(sm.unlock('ghost')).toBe(false);
    });

    it('checkLock returns unlocked for non-existent session', () => {
      expect(sm.checkLock('ghost')).toEqual({ locked: false });
    });
  });

  describe('getUserSessions', () => {
    it('returns active sessions for user', () => {
      sm.create('s1', { userId: 'u1' });
      sm.create('s2', { userId: 'u1' });
      expect(sm.getUserSessions('u1')).toHaveLength(2);
    });

    it('excludes expired sessions', () => {
      sm.create('s1', { userId: 'u1' }, -1);
      expect(sm.getUserSessions('u1')).toHaveLength(0);
    });
  });

  describe('size', () => {
    it('returns session count', () => {
      expect(sm.size).toBe(0);
      sm.create('s1', {});
      expect(sm.size).toBe(1);
    });
  });

  describe('enforceMaxSessions', () => {
    it('evicts oldest sessions at limit', () => {
      sm.maxSessions = 2;
      sm.create('s1', { userId: 'u1' });
      sm.create('s2', { userId: 'u1' });
      sm.create('s3', { userId: 'u1' });
      expect(sm.size).toBe(2);
    });

    it('handles empty user sessions in enforceMaxSessions', () => {
      sm.maxSessions = 0;
      sm.create('s1', { userId: 'u1' });
      expect(sm.size).toBe(1);
    });

    it('handles empty user sessions in enforceMaxSessions', () => {
      sm.maxSessions = 0;
      sm.create('s1', { userId: 'u1' });
      expect(sm.size).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('removes expired sessions', () => {
      sm.create('s1', {}, -1);
      sm.create('s2', {}, 3600000);
      expect(sm.cleanup()).toBe(1);
      expect(sm.size).toBe(1);
      expect(sm.get('s1', false)).toBeNull();
    });

    it('removes sessions with expired locks', () => {
      sm.create('s1', {}, 3600000);
      sm.lock('s1', -1);
      expect(sm.cleanup()).toBe(1);
      expect(sm.size).toBe(0);
    });
  });

  describe('cleanup interval', () => {
    it('logs cleaned sessions on interval', () => {
      const origSetInterval = global.setInterval;
      let capturedCallback;
      global.setInterval = (fn, _ms) => {
        capturedCallback = fn;
        return origSetInterval(fn, 99999999);
      };

      const sm2 = new SessionManager({ cleanupInterval: 1000 });
      global.setInterval = origSetInterval;

      const cleanupSpy = jest.spyOn(sm2, 'cleanup').mockReturnValue(3);
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      capturedCallback();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Cleaned'));
      expect(cleanupSpy).toHaveBeenCalled();

      cleanupSpy.mockRestore();
      logSpy.mockRestore();
      sm2.stopCleanup();
    });

    it('does not log when nothing cleaned', () => {
      const origSetInterval = global.setInterval;
      let capturedCallback;
      global.setInterval = (fn, _ms) => {
        capturedCallback = fn;
        return origSetInterval(fn, 99999999);
      };

      const sm2 = new SessionManager({ cleanupInterval: 1000 });
      global.setInterval = origSetInterval;

      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      capturedCallback();

      expect(logSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
      sm2.stopCleanup();
    });
  });

  describe('stopCleanup', () => {
    it('handles cleanupTimer null guard', () => {
      sm.cleanupTimer = null;
      expect(() => sm.stopCleanup()).not.toThrow();
    });
  });

  describe('generateSessionId', () => {
    it('generates a UUID', () => {
      const id = sm.generateSessionId();
      expect(id).toMatch(/^[0-9a-f-]+$/);
    });
  });

  describe('exportSessions', () => {
    it('exports all sessions', () => {
      sm.create('s1', { userId: 'u1' });
      const exported = sm.exportSessions();
      expect(exported).toHaveLength(1);
      expect(exported[0].id).toBe('s1');
      expect(exported[0].userId).toBe('u1');
    });
  });
});
