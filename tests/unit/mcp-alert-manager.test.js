const { MCPAlertManager, getMCPAlertManager, alertSensitiveOperation, SENSITIVE_TOOLS } = require('../../src/mcp/MCPAlertManager');

jest.mock('../../src/agent/PlatformBridge', () => {
  return {
    PlatformBridge: jest.fn().mockImplementation(() => ({
      registerPlatform: jest.fn(),
      connect: jest.fn().mockResolvedValue({ status: 'connected' }),
      send: jest.fn().mockResolvedValue({ status: 'sent' })
    }))
  };
});

describe('MCPAlertManager', () => {
  let manager;

  beforeEach(() => {
    manager = new MCPAlertManager({ maxHistory: 100 });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const m = new MCPAlertManager();
      expect(m.alertChannels).toBeInstanceOf(Map);
      expect(m.alertRules).toHaveLength(4);
      expect(m.alertHistory).toEqual([]);
      expect(m.maxHistory).toBe(1000);
      expect(m.onAlert).toBeInstanceOf(Function);
      expect(m.alertCounters).toBeInstanceOf(Map);
      expect(m.rateLimitWindows).toBeInstanceOf(Map);
      expect(m.platformBridge).toBeDefined();
    });

    it('should accept custom options', () => {
      const onAlert = jest.fn();
      const m = new MCPAlertManager({ maxHistory: 50, onAlert });
      expect(m.maxHistory).toBe(50);
      expect(m.onAlert).toBe(onAlert);
      m.destroy();
    });
  });

  describe('addRule', () => {
    it('should add a new rule with defaults', () => {
      const rule = {
        id: 'custom_rule',
        match: () => true,
        severity: () => 'low',
        template: () => ({ content: 'test' })
      };
      manager.addRule(rule);
      expect(manager.alertRules).toHaveLength(5);
      const added = manager.alertRules[4];
      expect(added.id).toBe('custom_rule');
      expect(added.enabled).toBe(true);
      expect(added.rateLimit).toBe(60);
      expect(added.platforms).toEqual(['slack']);
    });

    it('should generate id if not provided', () => {
      const rule = {
        match: () => true,
        severity: 'high',
        template: () => ({ content: 'test' })
      };
      manager.addRule(rule);
      const added = manager.alertRules[4];
      expect(added.id).toMatch(/^rule_\d+$/);
    });

    it('should handle non-function severity as static value', () => {
      const rule = {
        id: 'static_sev',
        match: () => true,
        severity: 'critical',
        template: () => ({ content: 'test' })
      };
      manager.addRule(rule);
      const added = manager.alertRules[4];
      expect(added.severity()).toBe('critical');
    });

    it('should use low as default severity when non-function severity is falsy', () => {
      const rule = {
        id: 'falsy_sev',
        match: () => true,
        severity: '',
        template: () => ({ content: 'test' })
      };
      manager.addRule(rule);
      const added = manager.alertRules[4];
      expect(added.severity()).toBe('low');
    });
  });

  describe('removeRule', () => {
    it('should remove an existing rule', () => {
      const result = manager.removeRule('sensitive_ops');
      expect(result).toBe(true);
      expect(manager.alertRules).toHaveLength(3);
    });

    it('should return false for non-existent rule', () => {
      const result = manager.removeRule('nonexistent');
      expect(result).toBe(false);
      expect(manager.alertRules).toHaveLength(4);
    });
  });

  describe('registerAlertChannel', () => {
    it('should register a channel with defaults', () => {
      const channel = manager.registerAlertChannel('ch1', {
        platform: 'slack',
        channel: '#alerts'
      });
      expect(channel.id).toBe('ch1');
      expect(channel.platform).toBe('slack');
      expect(channel.enabled).toBe(true);
      expect(channel.severityFilter).toEqual(['critical', 'high', 'medium', 'low']);
    });

    it('should register a channel with custom severity filter', () => {
      const channel = manager.registerAlertChannel('ch2', {
        platform: 'wechat_work',
        channel: 'group1',
        severityFilter: ['critical', 'high']
      });
      expect(channel.severityFilter).toEqual(['critical', 'high']);
    });

    it('should register a disabled channel', () => {
      const channel = manager.registerAlertChannel('ch3', {
        platform: 'slack',
        channel: '#quiet',
        enabled: false
      });
      expect(channel.enabled).toBe(false);
    });

    it('should default platform to slack when not provided', () => {
      const channel = manager.registerAlertChannel('no_platform', { channel: '#test' });
      expect(channel.platform).toBe('slack');
    });
  });

  describe('connectChannel', () => {
    it('should delegate to platformBridge.connect', async () => {
      manager.registerAlertChannel('ch1', { platform: 'slack', channel: '#alerts' });
      const result = await manager.connectChannel('ch1');
      expect(result).toEqual({ status: 'connected' });
    });
  });

  describe('processAlert', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-15T14:00:00Z'));
      manager.registerAlertChannel('default', {
        platform: 'slack',
        channel: '#alerts'
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should trigger sensitive_ops rule on matching tool', async () => {
      const callData = {
        toolFullName: 'filesystem:delete_file',
        username: 'testuser',
        role: 'operator',
        ip: '127.0.0.1',
        traceId: 'trace_001'
      };
      const alerts = await manager.processAlert(callData);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].rule).toBe('sensitive_ops');
      expect(alerts[0].severity).toBe('high');
    });

    it('should trigger failed_auth rule on auth error', async () => {
      const callData = {
        toolFullName: 'github:list_repos',
        username: 'testuser',
        role: 'viewer',
        result: { error: 'access_denied' }
      };
      const alerts = await manager.processAlert(callData);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].rule).toBe('failed_auth');
    });

    it('should trigger high_failure_rate after 5 failures', async () => {
      const callData = {
        toolFullName: 'filesystem:delete_file',
        username: 'failing_user',
        role: 'viewer'
      };
      for (let i = 0; i < 5; i++) {
        await manager.processAlert(callData);
      }
      // _checkRateLimit is called per-rule before match, so high_failure_rate
      // accumulates 5 rate-limit calls during non-matching invocations.
      // Reset its window to allow the match to verify the alert counter logic.
      manager.rateLimitWindows.delete('ratelimit:high_failure_rate');
      const alerts = await manager.processAlert(callData);
      const highFailure = alerts.find((a) => a.rule === 'high_failure_rate');
      expect(highFailure).toBeDefined();
    });

    it('should trigger unusual_activity for non-admin off-hours', async () => {
      jest.setSystemTime(new Date('2024-01-15T03:00:00'));

      const callData = {
        toolFullName: 'filesystem:list_directory',
        username: 'night_user',
        role: 'viewer'
      };
      const alerts = await manager.processAlert(callData);
      const unusual = alerts.find((a) => a.rule === 'unusual_activity');
      expect(unusual).toBeDefined();
    });

    it('should respect rate limiting', async () => {
      manager.rateLimitWindows.set('ratelimit:sensitive_ops', {
        count: 5,
        resetAt: Date.now() + 60000
      });

      const callData = {
        toolFullName: 'filesystem:delete_file',
        username: 'testuser',
        role: 'operator'
      };
      const alerts = await manager.processAlert(callData);
      const sensitive = alerts.find((a) => a.rule === 'sensitive_ops');
      expect(sensitive).toBeUndefined();
    });

    it('should skip disabled rules', async () => {
      const rule = manager.alertRules.find((r) => r.id === 'sensitive_ops');
      rule.enabled = false;

      const callData = {
        toolFullName: 'filesystem:delete_file',
        username: 'testuser',
        role: 'operator'
      };
      const alerts = await manager.processAlert(callData);
      const sensitive = alerts.find((a) => a.rule === 'sensitive_ops');
      expect(sensitive).toBeUndefined();
    });

    it('should return empty array when no channels match severity', async () => {
      manager.alertChannels.clear();
      manager.registerAlertChannel('critical_only', {
        platform: 'slack',
        channel: '#critical',
        severityFilter: ['critical']
      });

      const callData = {
        toolFullName: 'filesystem:delete_file',
        username: 'testuser',
        role: 'operator'
      };
      const alerts = await manager.processAlert(callData);
      expect(alerts).toEqual([]);
    });

    it('should handle send errors gracefully', async () => {
      manager.platformBridge.send.mockRejectedValue(new Error('Send failed'));
      const callData = {
        toolFullName: 'filesystem:delete_file',
        username: 'testuser',
        role: 'operator'
      };
      const alerts = await manager.processAlert(callData);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].results[0].error).toBe('Send failed');
    });

    it('should skip disabled channels when sending alerts', async () => {
      const m = new MCPAlertManager({ maxHistory: 100 });
      m.registerAlertChannel('enabled', { platform: 'slack', channel: '#alerts' });
      m.registerAlertChannel('disabled', { platform: 'slack', channel: '#quiet', enabled: false });
      const alerts = await m.processAlert({
        toolFullName: 'filesystem:delete_file',
        username: 'test',
        role: 'operator'
      });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].results).toHaveLength(1);
      expect(alerts[0].results[0].channelId).toBe('enabled');
      m.destroy();
    });

    it('should skip channels whose platform is not in preferred platforms', async () => {
      const m = new MCPAlertManager({ maxHistory: 100 });
      m.registerAlertChannel('slack_ch', { platform: 'slack', channel: '#alerts' });
      m.registerAlertChannel('discord_ch', { platform: 'discord', channel: 'general' });
      const alerts = await m.processAlert({
        toolFullName: 'filesystem:delete_file',
        username: 'test',
        role: 'operator'
      });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].results).toHaveLength(1);
      expect(alerts[0].results[0].channelId).toBe('slack_ch');
      m.destroy();
    });
  });

  describe('_checkRateLimit', () => {
    it('should allow first request', () => {
      expect(manager._checkRateLimit('test_rule', 60)).toBe(true);
    });

    it('should block after 5 requests in window', () => {
      manager._checkRateLimit('test_rule', 60);
      manager._checkRateLimit('test_rule', 60);
      manager._checkRateLimit('test_rule', 60);
      manager._checkRateLimit('test_rule', 60);
      manager._checkRateLimit('test_rule', 60);
      const sixth = manager._checkRateLimit('test_rule', 60);
      expect(sixth).toBe(false);
    });

    it('should reset after window expires', () => {
      manager._checkRateLimit('test_rule', 60);
      const window = manager.rateLimitWindows.get('ratelimit:test_rule');
      window.resetAt = Date.now() - 1;
      expect(manager._checkRateLimit('test_rule', 60)).toBe(true);
    });
  });

  describe('_formatAlertMessage', () => {
    it('should format alert message with all fields', () => {
      const msg = manager._formatAlertMessage({
        severity: 'high',
        toolFullName: 'filesystem:delete_file',
        username: 'alice',
        role: 'admin',
        ip: '10.0.0.1',
        traceId: 'abc123',
        timestamp: 1700000000000,
        result: { success: false, error: 'permission denied' }
      });
      expect(msg).toContain('高危告警');
      expect(msg).toContain('filesystem:delete_file');
      expect(msg).toContain('alice');
      expect(msg).toContain('10.0.0.1');
      expect(msg).toContain('删除操作');
      expect(msg).toContain('失败');
    });

    it('should handle missing optional fields', () => {
      const msg = manager._formatAlertMessage({
        severity: 'low',
        toolFullName: 'github:list_repos',
        username: 'bob',
        role: 'viewer'
      });
      expect(msg).toContain('低危告警');
      expect(msg).toContain('未知');
      expect(msg).toContain('N/A');
    });

    it('should handle unknown severity', () => {
      const msg = manager._formatAlertMessage({
        severity: 'unknown',
        toolFullName: 'test:tool',
        username: 'u',
        role: 'r'
      });
      expect(msg).toContain('⚪');
    });

    it('should format failed operation without error message', () => {
      const msg = manager._formatAlertMessage({
        severity: 'high',
        toolFullName: 'filesystem:delete_file',
        username: 'alice',
        role: 'admin',
        result: { success: false }
      });
      expect(msg).toContain('失败');
      expect(msg).toContain('未知错误');
    });
  });

  describe('_incrementCounter', () => {
    it('should increment and later decrement counter', async () => {
      jest.useFakeTimers();
      manager._incrementCounter({ username: 'u1', toolFullName: 't1' });
      expect(manager.alertCounters.get('u1:t1')).toBe(1);

      jest.advanceTimersByTime(60000);
      expect(manager.alertCounters.get('u1:t1')).toBe(0);
      jest.useRealTimers();
    });

    it('should handle zero counter in setTimeout callback', () => {
      jest.useFakeTimers();
      manager._incrementCounter({ username: 'zero_user', toolFullName: 'zero_tool' });
      manager.alertCounters.set('zero_user:zero_tool', 0);
      jest.advanceTimersByTime(60000);
      expect(manager.alertCounters.get('zero_user:zero_tool')).toBe(0);
      jest.useRealTimers();
    });
  });

  describe('getAlertHistory', () => {
    beforeEach(() => {
      const baseTime = Date.now();
      manager._recordAlert({
        ruleId: 'r1', severity: 'high', toolFullName: 't1',
        username: 'alice', role: 'admin', channelId: 'ch1',
        timestamp: baseTime
      });
      manager._recordAlert({
        ruleId: 'r2', severity: 'low', toolFullName: 't2',
        username: 'bob', role: 'viewer', channelId: 'ch2',
        timestamp: baseTime + 1000
      });
      manager._recordAlert({
        ruleId: 'r1', severity: 'high', toolFullName: 't3',
        username: 'alice', role: 'admin', channelId: 'ch1',
        timestamp: baseTime + 2000
      });
    });

    it('should return all history', () => {
      expect(manager.getAlertHistory()).toHaveLength(3);
    });

    it('should filter by severity', () => {
      const filtered = manager.getAlertHistory({ severity: 'low' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].ruleId).toBe('r2');
    });

    it('should filter by ruleId', () => {
      const filtered = manager.getAlertHistory({ ruleId: 'r1' });
      expect(filtered).toHaveLength(2);
    });

    it('should filter by username', () => {
      const filtered = manager.getAlertHistory({ username: 'bob' });
      expect(filtered).toHaveLength(1);
    });

    it('should filter by since (number)', () => {
      const now = Date.now();
      manager._recordAlert({
        ruleId: 'r3', severity: 'medium', toolFullName: 't4',
        username: 'carol', role: 'operator', channelId: 'ch1',
        timestamp: now
      });
      const filtered = manager.getAlertHistory({ since: now - 500 });
      const recent = filtered.filter((a) => a.ruleId === 'r3');
      expect(recent).toHaveLength(1);
    });

    it('should filter by since as relative duration (non-number type)', () => {
      const oldTime = Date.now() - 100000;
      manager._recordAlert({
        ruleId: 'r3', severity: 'medium', toolFullName: 't4',
        username: 'carol', role: 'operator', channelId: 'ch1',
        timestamp: oldTime
      });
      const filtered = manager.getAlertHistory({ since: '50000' });
      expect(filtered).toHaveLength(3);
      const oldAlert = filtered.find((a) => a.ruleId === 'r3');
      expect(oldAlert).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty manager', () => {
      const stats = manager.getStats();
      expect(stats.total).toBe(0);
      expect(stats.bySeverity).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
      expect(stats.byRule).toEqual({});
      expect(stats.activeRules).toBe(4);
      expect(stats.configuredChannels).toBe(0);
    });

    it('should aggregate stats from history', () => {
      const t = Date.now();
      manager._recordAlert({ ruleId: 'r1', severity: 'high', toolFullName: 't1', username: 'u', role: 'r', channelId: 'c', timestamp: t });
      manager._recordAlert({ ruleId: 'r1', severity: 'high', toolFullName: 't2', username: 'u', role: 'r', channelId: 'c', timestamp: t });
      manager._recordAlert({ ruleId: 'r2', severity: 'low', toolFullName: 't3', username: 'u', role: 'r', channelId: 'c', timestamp: t });

      const stats = manager.getStats();
      expect(stats.total).toBe(3);
      expect(stats.bySeverity.high).toBe(2);
      expect(stats.bySeverity.low).toBe(1);
      expect(stats.byRule.r1).toBe(2);
      expect(stats.byRule.r2).toBe(1);
    });
  });

  describe('exportConfig', () => {
    it('should export rules and channels', () => {
      manager.registerAlertChannel('ch1', { platform: 'slack', channel: '#alerts' });
      const config = manager.exportConfig();
      expect(config.rules).toHaveLength(4);
      expect(config.channels).toHaveLength(1);
      expect(config.channels[0].id).toBe('ch1');
    });
  });

  describe('_recordAlert', () => {
    it('should trim history when exceeding maxHistory', () => {
      const m = new MCPAlertManager({ maxHistory: 10 });
      for (let i = 0; i < 20; i++) {
        m._recordAlert({
          ruleId: 'r', severity: 'low', toolFullName: 't',
          username: 'u', role: 'r', channelId: 'c', timestamp: Date.now()
        });
      }
      expect(m.alertHistory.length).toBeLessThanOrEqual(10);
      m.destroy();
    });
  });

  describe('destroy', () => {
    it('should clear all state', () => {
      manager.registerAlertChannel('ch1', { platform: 'slack', channel: '#alerts' });
      manager._recordAlert({ ruleId: 'r', severity: 'high', toolFullName: 't', username: 'u', role: 'r', channelId: 'c', timestamp: Date.now() });
      manager.destroy();
      expect(manager.alertRules).toEqual([]);
      expect(manager.alertHistory).toEqual([]);
      expect(manager.alertChannels.size).toBe(0);
      expect(manager.alertCounters.size).toBe(0);
      expect(manager.rateLimitWindows.size).toBe(0);
    });
  });
});

describe('getMCPAlertManager', () => {
  it('should return singleton instance', () => {
    jest.isolateModules(() => {
      const { getMCPAlertManager: getMCP } = require('../../src/mcp/MCPAlertManager');
      const a = getMCP();
      const b = getMCP();
      expect(a).toBe(b);
    });
  });

  it('should pass options on first call', () => {
    jest.isolateModules(() => {
      const { getMCPAlertManager: getMCP } = require('../../src/mcp/MCPAlertManager');
      const a = getMCP({ maxHistory: 500 });
      expect(a.maxHistory).toBe(500);
    });
  });
});

describe('alertSensitiveOperation', () => {
  it('should process alert via singleton', async () => {
    const manager = getMCPAlertManager();
    manager.registerAlertChannel('alert', {
      platform: 'slack',
      channel: '#ops'
    });
    const result = await alertSensitiveOperation({
      toolFullName: 'filesystem:delete_file',
      username: 'test',
      role: 'admin'
    });
    expect(Array.isArray(result)).toBe(true);
    manager.destroy();
    jest.resetModules();
  });
});

describe('SENSITIVE_TOOLS', () => {
  it('should export sensitive tool definitions', () => {
    expect(SENSITIVE_TOOLS).toBeInstanceOf(Array);
    expect(SENSITIVE_TOOLS.length).toBeGreaterThan(0);
    const deleteOp = SENSITIVE_TOOLS.find((s) => s.name === '删除操作');
    expect(deleteOp).toBeDefined();
    expect(deleteOp.severity).toBe('high');
  });
});

describe('uncovered branches', () => {
  it('should return low severity when no sensitive tool matches (line 49)', () => {
    const m = new MCPAlertManager({ maxHistory: 100 });
    const rule = m.alertRules.find((r) => r.id === 'sensitive_ops');
    const result = rule.severity('unknown_tool_name');
    expect(result).toBe('low');
    m.destroy();
  });

  it('should handle missing counter in high_failure_rate template (line 87)', () => {
    const m = new MCPAlertManager({ maxHistory: 100 });
    const rule = m.alertRules.find((r) => r.id === 'high_failure_rate');
    const msg = rule.template({
      username: 'no_such_user',
      toolFullName: 'unknown:tool',
      severity: 'high'
    });
    expect(msg.content).toContain('失败次数: 0');
    m.destroy();
  });

  it('should use unknown error fallback in failed_auth template (line 70)', () => {
    const m = new MCPAlertManager({ maxHistory: 100 });
    const rule = m.alertRules.find((r) => r.id === 'failed_auth');
    const msg = rule.template({
      username: 'testuser',
      toolFullName: 'github:list_repos',
      severity: 'medium'
    });
    expect(msg.content).toContain('未知错误');
    m.destroy();
  });
});
