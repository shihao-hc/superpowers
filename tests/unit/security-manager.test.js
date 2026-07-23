const path = require('path');
const os = require('os');
const fs = require('fs');
const SecurityManager = require('../../src/core/SecurityManager');

describe('PermissionControl', () => {
  let sm;

  beforeEach(() => {
    sm = new SecurityManager({ audit: { logPath: path.join(os.tmpdir(), `perm-test-${Date.now()}.log`), maxFileSize: 999999 } });
  });

  it('grants and checks permissions', () => {
    sm.permission.grant('agent-1', 'read');
    expect(sm.permission.hasPermission('agent-1', 'read')).toBe(true);
    expect(sm.permission.hasPermission('agent-1', 'write')).toBe(false);
  });

  it('grants wildcard permission', () => {
    sm.permission.grant('agent-1', '*');
    expect(sm.permission.hasPermission('agent-1', 'anything')).toBe(true);
  });

  it('revokes permissions', () => {
    sm.permission.grant('agent-1', 'write');
    sm.permission.revoke('agent-1', 'write');
    expect(sm.permission.hasPermission('agent-1', 'write')).toBe(false);
  });

  it('handles revoke on non-existent agent', () => {
    expect(() => sm.permission.revoke('ghost', 'read')).not.toThrow();
  });

  it('handles hasPermission for non-existent agent', () => {
    expect(sm.permission.hasPermission('ghost', 'read')).toBe(false);
  });

  it('sets role permissions', () => {
    sm.permission.setRole('agent-2', 'admin');
    expect(sm.permission.hasPermission('agent-2', 'read')).toBe(true);
    expect(sm.permission.hasPermission('agent-2', 'write')).toBe(true);
  });

  it('observer role has only read', () => {
    sm.permission.setRole('agent-3', 'observer');
    expect(sm.permission.hasPermission('agent-3', 'read')).toBe(true);
    expect(sm.permission.hasPermission('agent-3', 'write')).toBe(false);
  });

  it('restricted role has no permissions', () => {
    sm.permission.setRole('agent-4', 'restricted');
    expect(sm.permission.hasPermission('agent-4', 'read')).toBe(false);
    expect(sm.permission.hasPermission('agent-4', 'write')).toBe(false);
  });

  it('setRole on unknown role does nothing', () => {
    sm.permission.setRole('agent-5', 'nonexistent');
    expect(sm.permission.hasPermission('agent-5', 'read')).toBe(false);
  });
});

describe('BehaviorLimits', () => {
  let sm;

  beforeEach(() => {
    sm = new SecurityManager({ enabled: true, audit: { logPath: path.join(os.tmpdir(), `bl-test-${Date.now()}.log`), maxFileSize: 999999 } });
  });

  it('allows operations within limit', () => {
    expect(sm.checkLimit('agent-1', 'file')).toBe(true);
  });

  it('blocks agents exceeding limit', () => {
    const limits = sm.limits;
    limits.limits.maxRequestsPerMinute = 3;
    expect(sm.checkLimit('agent-1', 'request')).toBe(true);
    expect(sm.checkLimit('agent-1', 'request')).toBe(true);
    expect(sm.checkLimit('agent-1', 'request')).toBe(true);
    expect(() => sm.checkLimit('agent-1', 'request')).toThrow('超出限制');
  });

  it('resets agent counters', () => {
    const limits = sm.limits;
    limits.limits.maxRequestsPerMinute = 1;
    expect(sm.checkLimit('agent-1', 'request')).toBe(true);
    expect(() => sm.checkLimit('agent-1', 'request')).toThrow('超出限制');
    sm.limits.reset('agent-1');
    expect(sm.checkLimit('agent-1', 'request')).toBe(true);
  });

  it('maps operations to correct limits', () => {
    const limits = sm.limits;
    limits.limits.maxFileOps = 2;
    expect(sm.checkLimit('agent-1', 'file')).toBe(true);
    expect(sm.checkLimit('agent-1', 'file')).toBe(true);
    expect(() => sm.checkLimit('agent-1', 'file')).toThrow('超出限制');
  });

  it('maps network operations', () => {
    const limits = sm.limits;
    limits.limits.maxNetworkCalls = 1;
    expect(sm.checkLimit('agent-1', 'network')).toBe(true);
    expect(() => sm.checkLimit('agent-1', 'network')).toThrow('超出限制');
  });
});

describe('SecurityManager', () => {
  let sm;
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `sec-mgr-${Date.now()}.log`);
    sm = new SecurityManager({ audit: { logPath: tmpFile, maxFileSize: 999999 } });
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  it('authorizes based on permissions', () => {
    sm.permission.grant('agent-1', 'read');
    expect(sm.authorize('agent-1', 'read')).toBe(true);
    expect(sm.authorize('agent-1', 'write')).toBe(false);
  });

  it('allows all when disabled', () => {
    const disabled = new SecurityManager({ enabled: false, audit: { logPath: tmpFile, maxFileSize: 999999 } });
    expect(disabled.authorize('anyone', 'anything')).toBe(true);
    expect(disabled.checkLimit('anyone', 'anything')).toBe(true);
  });

  it('bypasses limit checks when disabled', () => {
    const disabled = new SecurityManager({ enabled: false, audit: { logPath: tmpFile, maxFileSize: 999999 } });
    expect(disabled.checkLimit('anyone', 'request')).toBe(true);
  });

  describe('withAudit', () => {
    it('logs started and success', async () => {
      const result = await sm.withAudit('agent-1', 'do-task', () => Promise.resolve('done'));
      expect(result).toBe('done');
      expect(sm.audit.entries).toHaveLength(2);
      expect(sm.audit.entries[0].status).toBe('started');
      expect(sm.audit.entries[1].status).toBe('success');
    });

    it('logs error on rejection', async () => {
      await expect(sm.withAudit('agent-1', 'fail-task', () => Promise.reject(new Error('oops'))))
        .rejects.toThrow('oops');
      expect(sm.audit.entries).toHaveLength(2);
      expect(sm.audit.entries[1].status).toBe('error');
      expect(sm.audit.entries[1].error).toBe('oops');
    });

    it('skips audit when disabled', async () => {
      const disabled = new SecurityManager({ enabled: false, audit: { logPath: tmpFile, maxFileSize: 999999 } });
      const result = await disabled.withAudit('agent-1', 'task', () => Promise.resolve('skip'));
      expect(result).toBe('skip');
      expect(disabled.audit.entries).toHaveLength(0);
    });
  });

  it('getStats returns current state', () => {
    sm.permission.grant('a1', 'read');
    const stats = sm.getStats();
    expect(stats.permissions).toBe(1);
    expect(stats.auditEntries).toBe(0);
    expect(stats.blockedAgents).toBe(0);
    expect(stats.enabled).toBe(true);
  });
});

describe('AuditLog', () => {
  let tmpLog;
  let audit;

  beforeEach(() => {
    tmpLog = path.join(os.tmpdir(), `audit-${Date.now()}.log`);
    const sm = new SecurityManager({ audit: { logPath: tmpLog, maxFileSize: 999999 } });
    audit = sm.audit;
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpLog); } catch {}
  });

  it('logs events to file', () => {
    audit.log({ action: 'test', agentId: 'a1' });
    const content = fs.readFileSync(tmpLog, 'utf8');
    expect(content).toContain('test');
    expect(content).toContain('a1');
  });

  it('enforces max entries with shift', () => {
    audit.maxEntries = 3;
    for (let i = 0; i < 5; i++) { audit.log({ action: `e${i}` }); }
    expect(audit.entries).toHaveLength(3);
    expect(audit.entries[0].action).toBe('e2');
    expect(audit.entries[2].action).toBe('e4');
  });

  it('queries with filter', () => {
    audit.log({ agentId: 'a1', action: 'read' });
    audit.log({ agentId: 'a2', action: 'write' });
    audit.log({ agentId: 'a1', action: 'write' });
    const results = audit.query({ agentId: 'a1' });
    expect(results).toHaveLength(2);
  });

  it('queries by action', () => {
    audit.log({ agentId: 'a1', action: 'read' });
    audit.log({ agentId: 'a2', action: 'write' });
    expect(audit.query({ action: 'read' })).toHaveLength(1);
    expect(audit.query({ action: 'write' })).toHaveLength(1);
  });

  it('queries with time range', () => {
    const now = new Date();
    audit.log({ agentId: 'a1', action: 'old' });
    audit.log({ agentId: 'a1', action: 'new' });
    const from = new Date(now.getTime() - 1000);
    const to = new Date(now.getTime() + 3600000);
    const results = audit.query({ from, to });
    expect(results).toHaveLength(2);
  });

  it('rotates log file when exceeding max size', () => {
    audit.maxFileSize = 10;
    audit.log({ action: 'first entry' });
    audit.log({ action: 'trigger rotate' });
    const backupPath = tmpLog + '.bak';
    expect(fs.existsSync(backupPath)).toBe(true);
    try { fs.unlinkSync(backupPath); } catch {}
  });
});

describe('Coverage gaps', () => {
  it('creates log directory when parent does not exist', () => {
    const nestedDir = path.join(os.tmpdir(), `sec-new-dir-${Date.now()}`);
    const logPath = path.join(nestedDir, 'audit.log');
    const _sm = new SecurityManager({ audit: { logPath, maxFileSize: 999999 } });
    expect(fs.existsSync(nestedDir)).toBe(true);
    fs.rmdirSync(nestedDir);
  });

  it('handles write errors in audit log', () => {
    const tmpLog = path.join(os.tmpdir(), `audit-err-${Date.now()}.log`);
    const sm = new SecurityManager({ audit: { logPath: tmpLog, maxFileSize: 999999 } });
    const spy = jest.spyOn(fs, 'appendFileSync').mockImplementationOnce(() => { throw new Error('disk full'); });
    const conSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    sm.audit.log({ action: 'fail-write' });
    expect(conSpy).toHaveBeenCalledWith('[AuditLog] 写入失败:', 'disk full');
    spy.mockRestore();
    conSpy.mockRestore();
    try { fs.unlinkSync(tmpLog); } catch {}
  });

  it('throws blocked error for already-blocked agent', () => {
    const tmpLog = path.join(os.tmpdir(), `audit-blocked-${Date.now()}.log`);
    const sm = new SecurityManager({ audit: { logPath: tmpLog, maxFileSize: 999999 } });
    sm.limits.limits.maxRequestsPerMinute = 1;
    sm.checkLimit('agent-B', 'request');
    expect(() => sm.checkLimit('agent-B', 'request')).toThrow('超出限制');
    expect(() => sm.checkLimit('agent-B', 'request')).toThrow('已受限');
    try { fs.unlinkSync(tmpLog); } catch {}
  });

  it('resets counter when time window expires', () => {
    const tmpLog = path.join(os.tmpdir(), `audit-reset-${Date.now()}.log`);
    const sm = new SecurityManager({ audit: { logPath: tmpLog, maxFileSize: 999999 } });
    sm.limits.counters.set('agent-C:request', { count: 50, resetAt: Date.now() - 1 });
    expect(sm.checkLimit('agent-C', 'request')).toBe(true);
    try { fs.unlinkSync(tmpLog); } catch {}
  });

  it('grants multiple permissions to same agent without duplicate Set', () => {
    const sm = new SecurityManager({ enabled: false });
    sm.permission.grant('agent-X', 'read');
    sm.permission.grant('agent-X', 'write');
    expect(sm.permission.hasPermission('agent-X', 'read')).toBe(true);
    expect(sm.permission.hasPermission('agent-X', 'write')).toBe(true);
  });

  it('uses default audit log path and sizes when not provided', () => {
    const sm = new SecurityManager({ enabled: false });
    expect(sm.audit.logPath).toBe('./logs/audit.log');
    expect(sm.audit.maxFileSize).toBe(10 * 1024 * 1024);
    expect(sm.audit.maxEntries).toBe(10000);
    try { fs.rmSync('./logs', { recursive: true, force: true }); } catch {}
  });

  it('queries with default filter returns all entries', () => {
    const tmpLog = path.join(os.tmpdir(), `audit-dflt-${Date.now()}.log`);
    const sm = new SecurityManager({ audit: { logPath: tmpLog } });
    sm.audit.log({ action: 'first' });
    sm.audit.log({ action: 'second' });
    const results = sm.audit.query();
    expect(results).toHaveLength(2);
    try { fs.unlinkSync(tmpLog); } catch {}
  });

  it('reset only zeros counters for the specified agent', () => {
    const tmpLog = path.join(os.tmpdir(), `audit-rst-${Date.now()}.log`);
    const sm = new SecurityManager({ audit: { logPath: tmpLog } });
    sm.limits.counters.set('agent-Y:request', { count: 5, resetAt: Date.now() + 60000 });
    sm.limits.counters.set('agent-Z:network', { count: 3, resetAt: Date.now() + 60000 });
    sm.limits.reset('agent-Y');
    expect(sm.limits.counters.get('agent-Y:request').count).toBe(0);
    expect(sm.limits.counters.get('agent-Z:network').count).toBe(3);
    try { fs.unlinkSync(tmpLog); } catch {}
  });

  it('constructs without options (default parameter)', () => {
    const sm = new SecurityManager();
    expect(sm.enabled).toBe(true);
    expect(sm.permission).toBeDefined();
    expect(sm.audit).toBeDefined();
    expect(sm.limits).toBeDefined();
  });
});
