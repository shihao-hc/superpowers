const { SecurityMiddleware } = require('../../src/security/SecurityMiddleware');

describe('SecurityMiddleware', () => {
  let sm;

  beforeEach(() => {
    sm = new SecurityMiddleware({ maxAttempts: 3, blockDuration: 10000, maxAuditLog: 50 });
  });

  afterEach(() => {
    sm.destroy();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const m = new SecurityMiddleware();
      expect(m.blockedIPs instanceof Set).toBe(true);
      expect(m.suspiciousAttempts instanceof Map).toBe(true);
      expect(m.maxAttempts).toBe(10);
      expect(m.blockDuration).toBe(3600000);
      expect(m.auditLog).toEqual([]);
      expect(m.maxAuditLog).toBe(1000);
    });

    it('should apply custom options', () => {
      expect(sm.maxAttempts).toBe(3);
      expect(sm.blockDuration).toBe(10000);
      expect(sm.maxAuditLog).toBe(50);
    });
  });

  describe('start / stop', () => {
    it('should start and stop cleanup timer', () => {
      sm.start();
      sm.stop();
    });

    it('should be idempotent', () => {
      sm.start();
      sm.start();
      sm.stop();
      sm.stop();
    });
  });

  describe('blockIP / unblockIP / isBlocked', () => {
    it('should block and unblock IP', () => {
      sm.blockIP('1.2.3.4', 'attack detected');
      expect(sm.isBlocked('1.2.3.4')).toBe(true);
      sm.unblockIP('1.2.3.4');
      expect(sm.isBlocked('1.2.3.4')).toBe(false);
    });

    it('should log to audit when blocking', () => {
      sm.blockIP('5.6.7.8', 'brute force');
      expect(sm.auditLog.length).toBe(1);
      expect(sm.auditLog[0].type).toBe('ip_blocked');
      expect(sm.auditLog[0].ip).toBe('5.6.7.8');
    });

    it('should call onBlock callback', () => {
      const onBlock = jest.fn();
      const m = new SecurityMiddleware({ onBlock });
      m.blockIP('9.9.9.9', 'test');
      expect(onBlock).toHaveBeenCalledWith({ ip: '9.9.9.9', reason: 'test' });
      m.destroy();
    });
  });

  describe('recordSuspicious', () => {
    it('should track suspicious attempts', () => {
      sm.recordSuspicious('1.1.1.1', 'sql_injection');
      const record = sm.suspiciousAttempts.get('1.1.1.1');
      expect(record.count).toBe(1);
      expect(record.actions[0].action).toBe('sql_injection');
    });

    it('should auto-block after max attempts', () => {
      sm.recordSuspicious('1.1.1.1', 'a');
      sm.recordSuspicious('1.1.1.1', 'b');
      const blocked = sm.recordSuspicious('1.1.1.1', 'c');
      expect(blocked).toBe(true);
      expect(sm.isBlocked('1.1.1.1')).toBe(true);
    });

    it('should trim actions list at 50', () => {
      for (let i = 0; i < 60; i++) {
        sm.recordSuspicious('2.2.2.2', `action-${i}`);
      }
      const record = sm.suspiciousAttempts.get('2.2.2.2');
      expect(record.actions.length).toBe(34);
    });
  });

  describe('auditRequest', () => {
    it('should create audit entry for request', () => {
      const req = { ip: '1.2.3.4', method: 'GET', path: '/api/test', headers: {} };
      sm.auditRequest(req, 'read', 'success');
      expect(sm.auditLog.length).toBe(1);
      expect(sm.auditLog[0].ip).toBe('1.2.3.4');
      expect(sm.auditLog[0].result).toBe('success');
    });

    it('should record suspicious when result is blocked', () => {
      const req = { ip: '1.2.3.4', method: 'POST', path: '/login', headers: {} };
      sm.auditRequest(req, 'login', 'blocked');
      expect(sm.suspiciousAttempts.get('1.2.3.4').count).toBe(1);
    });

    it('should trim audit log when exceeding max', () => {
      const m = new SecurityMiddleware({ maxAuditLog: 10 });
      const req = { ip: 'x', method: 'GET', path: '/', headers: {} };
      for (let i = 0; i < 20; i++) {
        m.auditRequest(req, 'read', 'success');
      }
      expect(m.auditLog.length).toBeLessThanOrEqual(10);
      m.destroy();
    });
  });

  describe('wafMiddleware', () => {
    it('should return middleware function', () => {
      const mw = sm.wafMiddleware();
      expect(typeof mw).toBe('function');
    });

    it('should block requests from blocked IPs', () => {
      sm.blockIP('1.2.3.4', 'test');
      const mw = sm.wafMiddleware();
      const req = { ip: '1.2.3.4', url: '/', method: 'GET', headers: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should block suspicious URL patterns', () => {
      const mw = sm.wafMiddleware();
      const req = { ip: '9.9.9.9', url: '/path/../../../etc/passwd', method: 'GET', headers: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass clean requests', () => {
      const mw = sm.wafMiddleware();
      const req = { ip: '9.9.9.9', url: '/api/health', method: 'GET', headers: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('authAuditMiddleware', () => {
    it('should track failed auth', () => {
      const mw = sm.authAuditMiddleware();
      const req = { ip: '1.2.3.4', path: '/auth/login', method: 'POST', headers: {} };
      const res = { statusCode: 401, json: jest.fn() };
      const _next = jest.fn();
      mw(req, res, jest.fn());
      res.json({ error: 'unauthorized' });
      expect(sm.suspiciousAttempts.get('1.2.3.4').count).toBe(2);
    });
  });

  describe('getAuditLog', () => {
    it('should return recent logs', () => {
      const req = { ip: '1.1.1.1', method: 'GET', path: '/', headers: {} };
      sm.auditRequest(req, 'test', 'success');
      const logs = sm.getAuditLog();
      expect(logs.length).toBe(1);
    });

    it('should filter by IP', () => {
      const reqA = { ip: '1.1.1.1', method: 'GET', path: '/', headers: {} };
      const reqB = { ip: '2.2.2.2', method: 'GET', path: '/', headers: {} };
      sm.auditRequest(reqA, 'a', 'success');
      sm.auditRequest(reqB, 'b', 'success');
      expect(sm.getAuditLog({ ip: '1.1.1.1' }).length).toBe(1);
    });
  });

  describe('getBlockedIPs / getSuspiciousIPs', () => {
    it('should return blocked IPs', () => {
      sm.blockIP('1.1.1.1', 'test');
      expect(sm.getBlockedIPs()).toEqual(['1.1.1.1']);
    });

    it('should return suspicious IPs sorted by count', () => {
      sm.recordSuspicious('A', 'x');
      sm.recordSuspicious('B', 'x');
      sm.recordSuspicious('B', 'y');
      const list = sm.getSuspiciousIPs();
      expect(list[0].ip).toBe('B');
      expect(list[0].count).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return stats', () => {
      sm.blockIP('1.1.1.1', 'test');
      const stats = sm.getStats();
      expect(stats.blockedIPs).toBe(1);
      expect(stats.auditLogSize).toBe(1);
    });
  });

  describe('destroy', () => {
    it('should clear all state', () => {
      sm.start();
      sm.blockIP('1.1.1.1', 'test');
      sm.destroy();
      expect(sm.blockedIPs.size).toBe(0);
      expect(sm.auditLog.length).toBe(0);

    });
  });

  describe('coverage expansion', () => {
    it('should invoke _cleanup via start interval', () => {
      sm.start();
      sm.stop();
      expect(sm._cleanupTimer).toBeNull();
    });

    it('should audit successful auth requests', () => {
      const mw = sm.authAuditMiddleware();
      const req = { ip: '1.2.3.4', path: '/auth/login', method: 'POST', headers: {} };
      const res = { statusCode: 200, json: jest.fn() };
      mw(req, res, jest.fn());
      res.json({ token: 'abc' });
      expect(sm.auditLog.length).toBe(1);
      expect(sm.auditLog[0].result).toBe('success');
    });

    it('should filter getAuditLog by type', () => {
      const req = { ip: '1.1.1.1', method: 'GET', path: '/', headers: {} };
      sm.auditRequest(req, 'read', 'success');
      sm.blockIP('2.2.2.2', 'bad');
      const typeLogs = sm.getAuditLog({ type: 'request' });
      expect(typeLogs.every(l => l.type === 'request')).toBe(true);
      expect(typeLogs.length).toBe(1);
    });

    it('should filter getAuditLog by since timestamp', () => {
      const req = { ip: '1.1.1.1', method: 'GET', path: '/', headers: {} };
      sm.auditRequest(req, 'read', 'success');
      const sinceLogs = sm.getAuditLog({ since: Date.now() - 60000 });
      expect(sinceLogs.length).toBe(1);
    });

    it('should cleanup expired suspicious entries', () => {
      sm.suspiciousAttempts.set('old', { count: 1, actions: [], firstSeen: Date.now() - 50000, lastSeen: Date.now() - 50000 });
      sm.recordSuspicious('fresh', 'x');
      sm._cleanup();
      expect(sm.suspiciousAttempts.has('old')).toBe(false);
      expect(sm.suspiciousAttempts.has('fresh')).toBe(true);
    });

    it('should use socket remoteAddress for auditRequest ip', () => {
      const req = { socket: { remoteAddress: '10.0.0.1' }, method: 'GET', path: '/', headers: {} };
      sm.auditRequest(req, 'test', 'success');
      expect(sm.auditLog[0].ip).toBe('10.0.0.1');
    });

    it('should default to unknown ip in auditRequest', () => {
      const req = { method: 'GET', path: '/', headers: {} };
      sm.auditRequest(req, 'test', 'success');
      expect(sm.auditLog[0].ip).toBe('unknown');
    });

    it('should handle missing ip and url in wafMiddleware', () => {
      const mw = sm.wafMiddleware();
      const req = { method: 'GET', headers: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should use socket remoteAddress in wafMiddleware', () => {
      const mw = sm.wafMiddleware();
      const req = { socket: { remoteAddress: '10.0.0.1' }, url: '/api/health', method: 'GET', headers: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should default to unknown ip in authAuditMiddleware', () => {
      const mw = sm.authAuditMiddleware();
      const req = { path: '/auth/login', method: 'POST', headers: {} };
      const res = { statusCode: 401, json: jest.fn() };
      mw(req, res, jest.fn());
      res.json({ error: 'unauthorized' });
      expect(sm.auditLog.length).toBe(1);
    });

    it('should use socket remoteAddress in authAuditMiddleware', () => {
      const mw = sm.authAuditMiddleware();
      const req = { socket: { remoteAddress: '10.0.0.1' }, path: '/auth/login', method: 'POST', headers: {} };
      const res = { statusCode: 200, json: jest.fn() };
      mw(req, res, jest.fn());
      res.json({ token: 'abc' });
      expect(sm.auditLog[0].ip).toBe('10.0.0.1');
    });

    it('should not audit non-auth 200 responses', () => {
      const mw = sm.authAuditMiddleware();
      const req = { ip: '1.2.3.4', path: '/api/data', method: 'GET', headers: {} };
      const res = { statusCode: 200, json: jest.fn() };
      mw(req, res, jest.fn());
      res.json({ data: 'ok' });
      expect(sm.auditLog.length).toBe(0);
    });
  });
});
