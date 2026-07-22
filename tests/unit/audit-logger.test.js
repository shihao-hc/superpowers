const path = require('path');
const os = require('os');
const fs = require('fs');
const { AuditLogger, getAuditLogger, AUDIT_EVENTS, LOG_LEVELS } = require('../../src/security/AuditLogger');

describe('AuditLogger', () => {
  let tmpDir;
  let audit;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `audit-test-${Date.now()}`);
    audit = new AuditLogger({ logDir: tmpDir, maxLogSize: 999999, retentionDays: 30 });
  });

  afterEach(() => {
    audit.shutdown();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  describe('constructor', () => {
    it('creates log directory', () => {
      expect(fs.existsSync(tmpDir)).toBe(true);
    });

    it('does not create dir when disabled', () => {
      const tmp2 = path.join(os.tmpdir(), `audit-disabled-${Date.now()}`);
      const disabled = new AuditLogger({ logDir: tmp2, enabled: false });
      disabled.shutdown();
      expect(fs.existsSync(tmp2)).toBe(false);
    });

    it('sets session ID', () => {
      expect(audit.sessionId).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('_formatLog', () => {
    it('adds metadata to log entry', () => {
      const formatted = audit._formatLog({ event: 'TEST' });
      expect(formatted.id).toMatch(/^[0-9a-f]{16}$/);
      expect(formatted.sessionId).toBe(audit.sessionId);
      expect(formatted.timestamp).toBeDefined();
      expect(formatted.hostname).toBeDefined();
      expect(formatted.pid).toBe(process.pid);
    });
  });

  describe('log methods', () => {
    it('logCommandExec', () => {
      audit.logCommandExec('ls', ['-la'], 'user1', true, 100);
      expect(audit.pendingLogs).toHaveLength(1);
      expect(audit.pendingLogs[0].event).toBe(AUDIT_EVENTS.COMMAND_EXEC);
      expect(audit.pendingLogs[0].success).toBe(true);
    });

    it('logCommandBlocked', () => {
      audit.logCommandBlocked('rm -rf /', 'not allowed', 'user1');
      expect(audit.pendingLogs[0].event).toBe(AUDIT_EVENTS.COMMAND_BLOCKED);
      expect(audit.pendingLogs[0].blocked).toBe(true);
    });

    it('logShellInjectionDetected', () => {
      audit.logShellInjectionDetected('$(cat /etc/passwd)', 'shell_meta', 'user1');
      expect(audit.pendingLogs[0].event).toBe(AUDIT_EVENTS.SHELL_INJECTION_DETECTED);
      expect(audit.pendingLogs[0].severity).toBe('HIGH');
    });

    it('logPermissionDenied', () => {
      audit.logPermissionDenied('writeFile', 'user1', 'no access');
      expect(audit.pendingLogs[0].event).toBe(AUDIT_EVENTS.PERMISSION_DENIED);
    });

    it('logRateLimitExceeded', () => {
      audit.logRateLimitExceeded('user1', 'npm install', 10, 5);
      expect(audit.pendingLogs[0].event).toBe(AUDIT_EVENTS.RATE_LIMIT_EXCEEDED);
      expect(audit.pendingLogs[0].currentCount).toBe(10);
    });

    it('logAuthFailure', () => {
      audit.logAuthFailure('user1', 'bad password');
      expect(audit.pendingLogs[0].event).toBe(AUDIT_EVENTS.AUTH_FAILURE);
    });

    it('logSessionStart', () => {
      audit.logSessionStart('user1');
      expect(audit.pendingLogs[0].event).toBe(AUDIT_EVENTS.SESSION_START);
    });

    it('logSessionEnd', () => {
      audit.logSessionEnd('user1', 5000);
      expect(audit.pendingLogs[0].event).toBe(AUDIT_EVENTS.SESSION_END);
      expect(audit.pendingLogs[0].duration).toBe(5000);
    });

    it('does not log when disabled', () => {
      const disabled = new AuditLogger({ logDir: tmpDir, enabled: false });
      disabled.logCommandExec('ls', [], 'user1', true, 0);
      expect(disabled.pendingLogs).toHaveLength(0);
      disabled.shutdown();
    });
  });

  describe('_flush', () => {
    it('writes pending logs to file', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      audit._flush();
      expect(audit.pendingLogs).toHaveLength(0);
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('audit-'));
      expect(files).toHaveLength(1);
      const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf8');
      expect(content).toContain('COMMAND_EXEC');
    });

    it('does nothing with empty pending', () => {
      expect(() => audit._flush()).not.toThrow();
    });

    it('rotates log file when over max size', () => {
      audit.maxLogSize = 10;
      audit.logCommandExec('first', [], 'user1', true, 0);
      audit._flush();
      audit.logCommandExec('second', [], 'user1', true, 0);
      audit._flush();
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('audit-'));
      expect(files.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('queryLogs', () => {
    it('returns logs from files', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      audit.logCommandBlocked('rm', 'denied', 'user2');
      audit._flush();
      const logs = audit.queryLogs();
      expect(logs).toHaveLength(2);
    });

    it('filters by event', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      audit.logCommandBlocked('rm', 'denied', 'user2');
      audit._flush();
      const logs = audit.queryLogs({ event: AUDIT_EVENTS.COMMAND_BLOCKED });
      expect(logs).toHaveLength(1);
      expect(logs[0].event).toBe(AUDIT_EVENTS.COMMAND_BLOCKED);
    });

    it('filters by level', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      audit.logCommandBlocked('rm', 'denied', 'user2');
      audit._flush();
      const logs = audit.queryLogs({ level: LOG_LEVELS.INFO });
      expect(logs).toHaveLength(1);
    });

    it('filters by user', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      audit.logCommandExec('pwd', [], 'user2', true, 0);
      audit._flush();
      expect(audit.queryLogs({ user: 'user1' })).toHaveLength(1);
    });

    it('filters by blocked status', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      audit.logCommandBlocked('rm', 'denied', 'user2');
      audit._flush();
      expect(audit.queryLogs({ blocked: true })).toHaveLength(1);
    });

  });

  describe('getStats', () => {
    it('returns correct statistics', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      audit.logCommandBlocked('rm', 'denied', 'user2');
      audit._flush();
      const stats = audit.getStats(365);
      expect(stats.total).toBe(2);
      expect(stats.blocked).toBe(1);
      expect(stats.byEvent[AUDIT_EVENTS.COMMAND_EXEC]).toBe(1);
      expect(stats.byEvent[AUDIT_EVENTS.COMMAND_BLOCKED]).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('clears flush interval and flushes pending', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      audit.shutdown();
      expect(audit.flushInterval._destroyed).toBe(true);
      expect(audit.pendingLogs).toHaveLength(0);
    });
  });

  describe('getAuditLogger', () => {
    it('returns singleton instance', () => {
      const a = getAuditLogger({ logDir: tmpDir });
      const b = getAuditLogger();
      expect(a).toBe(b);
      getAuditLogger().shutdown();
      jest.resetModules();
    });
  });

  describe('additional branch coverage', () => {
    afterEach(() => { jest.useRealTimers(); });

    it('flushes immediately when pendingLogs reaches 100', () => {
      const flushSpy = jest.spyOn(audit, '_flush').mockImplementation(() => {});
      for (let i = 0; i < 100; i++) {
        audit.logCommandExec(`cmd${i}`, [], 'user1', true, 0);
      }
      expect(flushSpy).toHaveBeenCalled();
      flushSpy.mockRestore();
    });

    it('triggers flush via interval timer', () => {
      jest.useFakeTimers();
      const dir = path.join(os.tmpdir(), `audit-interval-${Date.now()}`);
      const logger = new AuditLogger({ logDir: dir, maxLogSize: 999999, retentionDays: 30 });
      logger.logCommandExec('ls', [], 'user1', true, 0);
      expect(logger.pendingLogs).toHaveLength(1);
      jest.advanceTimersByTime(5000);
      expect(logger.pendingLogs).toHaveLength(0);
      logger.shutdown();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    });

    it('handles flush errors gracefully', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      jest.spyOn(fs, 'appendFileSync').mockImplementation(() => { throw new Error('write fail'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      audit._flush();
      expect(consoleSpy).toHaveBeenCalledWith('[AuditLogger] Failed to write logs:', 'write fail');
      consoleSpy.mockRestore();
      fs.appendFileSync.mockRestore();
    });

    it('cleans old audit files and skips non-audit files', () => {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'random-file.txt'), 'data');
      const oldAuditFile = path.join(tmpDir, 'audit-2020-01-01.json');
      fs.writeFileSync(oldAuditFile, '{"event":"TEST"}');
      const pastTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      fs.utimesSync(oldAuditFile, pastTime, pastTime);
      const recentFile = path.join(tmpDir, 'audit-2099-01-01.json');
      fs.writeFileSync(recentFile, '{"event":"RECENT"}');
      const logger = new AuditLogger({ logDir: tmpDir, maxLogSize: 999999, retentionDays: 30 });
      expect(fs.existsSync(oldAuditFile)).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'random-file.txt'))).toBe(true);
      expect(fs.existsSync(recentFile)).toBe(true);
      logger.shutdown();
    });

    it('handles cleanup errors gracefully', () => {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'audit-test.json'), '{}');
      const logger = new AuditLogger({ logDir: tmpDir, maxLogSize: 999999, retentionDays: 30 });
      jest.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('read fail'); });
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      logger._cleanupOldLogs();
      expect(consoleSpy).toHaveBeenCalledWith('[AuditLogger] Cleanup failed:', 'read fail');
      consoleSpy.mockRestore();
      fs.readdirSync.mockRestore();
      logger.shutdown();
    });

    it('queryLogs filters by command', () => {
      audit.logCommandExec('ls', [], 'user1', true, 0);
      audit.logCommandExec('pwd', [], 'user1', true, 0);
      audit._flush();
      expect(audit.queryLogs({ command: 'ls' })).toHaveLength(1);
      expect(audit.queryLogs({ command: 'nonexistent' })).toHaveLength(0);
    });

    it('queryLogs filters by startTime and endTime', () => {
      audit.logCommandExec('cmd1', [], 'user1', true, 0);
      audit._flush();
      const now = new Date();
      const logs = audit.queryLogs({ startTime: new Date(now.getTime() - 100000), endTime: new Date(now.getTime() + 100000) });
      expect(logs).toHaveLength(1);
      const emptyLogs = audit.queryLogs({ startTime: new Date(now.getTime() + 100000) });
      expect(emptyLogs).toHaveLength(0);
    });

    it('logCommandExec handles undefined args and args exceeding 10', () => {
      audit.logCommandExec('ls', undefined, 'user1', true, 0);
      expect(audit.pendingLogs[0].args).toBeUndefined();
      audit.logCommandExec('ls', Array.from({ length: 20 }, (_, i) => `arg${i}`), 'user1', true, 0);
      expect(audit.pendingLogs[1].args).toHaveLength(10);
    });

    it('logShellInjectionDetected handles null command', () => {
      audit.logShellInjectionDetected(null, 'pattern', 'user1');
      expect(audit.pendingLogs[0].command).toBeUndefined();
    });

    it('uses default options when called with no arguments', () => {
      const defaultDir = path.join(process.cwd(), '.opencode', 'logs');
      try { fs.rmSync(defaultDir, { recursive: true, force: true }); } catch {}
      const logger = new AuditLogger();
      expect(logger.logDir).toBe(defaultDir);
      expect(logger.maxLogSize).toBe(10 * 1024 * 1024);
      expect(logger.retentionDays).toBe(30);
      logger.shutdown();
      try { fs.rmSync(defaultDir, { recursive: true, force: true }); } catch {}
    });

    it('appends to existing log file under max size without rotation', () => {
      audit.logCommandExec('first', [], 'user1', true, 0);
      audit._flush();
      audit.logCommandExec('second', [], 'user1', true, 0);
      audit._flush();
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('audit-'));
      expect(files).toHaveLength(1);
      const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf8');
      expect(content.split('\n').filter(l => l.trim())).toHaveLength(2);
    });

    it('logCommandExec with success=false sets WARNING level', () => {
      audit.logCommandExec('ls', [], 'user1', false, 100);
      expect(audit.pendingLogs[0].level).toBe(LOG_LEVELS.WARNING);
    });

    it('queryLogs filters by endTime excluding old entries', () => {
      audit.logCommandExec('cmd1', [], 'user1', true, 0);
      audit._flush();
      const logs = audit.queryLogs({ endTime: new Date(0) });
      expect(logs).toHaveLength(0);
    });

    it('queryLogs skips invalid JSON lines', () => {
      audit.logCommandExec('valid', [], 'user1', true, 0);
      audit._flush();
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('audit-'));
      const logFile = path.join(tmpDir, files[0]);
      fs.appendFileSync(logFile, 'not valid json\n', 'utf8');
      const logs = audit.queryLogs();
      expect(logs).toHaveLength(1);
    });

    it('getStats uses default 7 days', () => {
      audit.logCommandExec('cmd', [], 'user1', true, 0);
      audit._flush();
      const stats = audit.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byEvent[AUDIT_EVENTS.COMMAND_EXEC]).toBe(1);
    });

    it('getStats accumulates multiple logs with same level', () => {
      audit.logCommandExec('cmd1', [], 'user1', true, 0);
      audit.logCommandExec('cmd2', [], 'user1', true, 0);
      audit._flush();
      const stats = audit.getStats(365);
      expect(stats.byLevel[LOG_LEVELS.INFO]).toBe(2);
      expect(stats.byEvent[AUDIT_EVENTS.COMMAND_EXEC]).toBe(2);
    });
  });

  describe('AUDIT_EVENTS and LOG_LEVELS', () => {
    it('exports constants', () => {
      expect(AUDIT_EVENTS.COMMAND_EXEC).toBe('COMMAND_EXEC');
      expect(LOG_LEVELS.INFO).toBe('INFO');
      expect(LOG_LEVELS.CRITICAL).toBe('CRITICAL');
    });
  });
});
