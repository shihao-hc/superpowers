const { PermissionService } = require('../../src/agent/PermissionService');

describe('PermissionService', () => {
  let service;

  beforeEach(() => {
    jest.restoreAllMocks();
    service = new PermissionService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should set default values', () => {
      expect(service.mode).toBe('default');
      expect(service.maxTurns).toBe(100);
      expect(service.allowRules).toBeInstanceOf(Map);
      expect(service.denyRules).toBeInstanceOf(Map);
      expect(service.askRules).toBeInstanceOf(Map);
      expect(service.denialTracking).toBeInstanceOf(Map);
      expect(service.mcpPermissionManager).toBeNull();
      expect(service.externalPermissionManager).toBeNull();
    });

    test('should accept mcpPermissionManager option', () => {
      const mcpManager = { checkToolAccess: jest.fn() };
      const custom = new PermissionService({ mcpPermissionManager: mcpManager });
      expect(custom.mcpPermissionManager).toBe(mcpManager);
    });

    test('should define all 6 mode configs', () => {
      expect(Object.keys(service.modeConfig)).toEqual([
        'default', 'plan', 'acceptEdits', 'bypass', 'dontAsk', 'auto'
      ]);
      expect(service.modeConfig.default.behavior).toBe('ask');
      expect(service.modeConfig.plan.behavior).toBe('deny');
      expect(service.modeConfig.acceptEdits.behavior).toBe('allow');
      expect(service.modeConfig.bypass.behavior).toBe('allow');
      expect(service.modeConfig.dontAsk.behavior).toBe('deny');
      expect(service.modeConfig.auto.behavior).toBe('auto');
    });
  });

  describe('setMode', () => {
    test('should change mode and emit modeChanged event', () => {
      const handler = jest.fn();
      service.on('modeChanged', handler);
      const result = service.setMode('bypass');
      expect(result).toEqual({ oldMode: 'default', newMode: 'bypass' });
      expect(service.mode).toBe('bypass');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toEqual({ oldMode: 'default', newMode: 'bypass' });
    });

    test('should throw for invalid mode', () => {
      expect(function () { service.setMode('invalid'); }).toThrow('Unknown mode: invalid');
    });
  });

  describe('getModeConfig', () => {
    test('should return config for current mode', () => {
      expect(service.getModeConfig().behavior).toBe('ask');
      service.setMode('bypass');
      expect(service.getModeConfig().behavior).toBe('allow');
      service.setMode('plan');
      expect(service.getModeConfig().behavior).toBe('deny');
    });
  });

  describe('addRule', () => {
    test('should add allow rule and emit event', () => {
      const handler = jest.fn();
      service.on('ruleAdded', handler);
      service.addRule('allow', 'bash');
      expect(service.allowRules.get('bash')).toHaveLength(1);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].type).toBe('allow');
    });

    test('should add deny rule', () => {
      service.addRule('deny', 'dangerous_cmd');
      expect(service.denyRules.get('dangerous_cmd')).toHaveLength(1);
    });

    test('should add ask rule with pattern and source', () => {
      service.addRule('ask', 'file_write', { pattern: 'file_write_*', source: 'manual' });
      const rule = service.askRules.get('file_write')[0];
      expect(rule.pattern).toBe('file_write_*');
      expect(rule.source).toBe('manual');
      expect(rule.createdAt).toBeDefined();
    });

    test('should throw for unknown rule type', () => {
      expect(function () { service.addRule('invalid', 'bash'); }).toThrow('Unknown rule type: invalid');
    });

    test('should accumulate multiple rules for same tool', () => {
      service.addRule('allow', 'bash');
      service.addRule('allow', 'bash', { pattern: 'bash_*' });
      expect(service.allowRules.get('bash')).toHaveLength(2);
    });
  });

  describe('removeRule', () => {
    test('should delete rules from map', () => {
      service.addRule('allow', 'bash');
      expect(service.allowRules.has('bash')).toBe(true);
      service.removeRule('allow', 'bash');
      expect(service.allowRules.has('bash')).toBe(false);
    });

    test('should not throw when removing non-existent rule', () => {
      expect(function () { service.removeRule('allow', 'non_existent'); }).not.toThrow();
    });
  });

  describe('getRules', () => {
    test('should return empty array when no rules', () => {
      expect(service.getRules('allow')).toEqual([]);
    });

    test('should return flattened rules', () => {
      service.addRule('allow', 'bash');
      service.addRule('allow', 'edit', { pattern: 'edit_*' });
      const rules = service.getRules('allow');
      expect(rules).toHaveLength(2);
    });
  });

  describe('checkPermission', () => {
    test('should allow all in bypass mode', async () => {
      service.setMode('bypass');
      const result = await service.checkPermission('any_command');
      expect(result.result).toBe('allow');
      expect(result.reason).toContain('bypass');
    });

    test('should deny all in plan mode', async () => {
      service.setMode('plan');
      const result = await service.checkPermission('any_command');
      expect(result.result).toBe('deny');
      expect(result.reason).toContain('plan');
    });

    test('should deny all in dontAsk mode', async () => {
      service.setMode('dontAsk');
      const result = await service.checkPermission('any_command');
      expect(result.result).toBe('deny');
      expect(result.reason).toContain('dontAsk');
    });

    test('should respect deny rules over allow rules', async () => {
      service.addRule('allow', 'tool');
      service.addRule('deny', 'tool');
      const result = await service.checkPermission('tool');
      expect(result.result).toBe('deny');
    });

    test('should allow matching allow rule', async () => {
      service.addRule('allow', 'safe_tool');
      const result = await service.checkPermission('safe_tool');
      expect(result.result).toBe('allow');
      expect(result.reason).toContain('Rule matched');
      expect(result.rule.toolName).toBe('safe_tool');
    });

    test('should ask for matching ask rule', async () => {
      service.addRule('ask', 'risky_tool');
      const result = await service.checkPermission('risky_tool');
      expect(result.result).toBe('ask');
      expect(result.message).toContain('risky_tool');
    });

    test('should fallback to denial after too many denials', async () => {
      await service.handleUserResponse('bash', false);
      await service.handleUserResponse('bash', false);
      await service.handleUserResponse('bash', false);
      const result = await service.checkPermission('bash');
      expect(result.result).toBe('deny');
      expect(result.reason).toBe('Too many denials, falling back to default');
    });

    test('should use mcpPermissionManager when present', async () => {
      const mcpManager = {
        checkToolAccess: jest.fn().mockReturnValue({ allowed: false, reason: 'MCP denied' })
      };
      const svc = new PermissionService({ mcpPermissionManager: mcpManager });
      const result = await svc.checkPermission('some_tool');
      expect(mcpManager.checkToolAccess).toHaveBeenCalledWith('some_tool', 'viewer');
      expect(result.result).toBe('deny');
      expect(result.reason).toBe('MCP denied');
    });

    test('should pass through mcpPermissionManager when allowed', async () => {
      const mcpManager = {
        checkToolAccess: jest.fn().mockReturnValue({ allowed: true, reason: 'ok' })
      };
      const svc = new PermissionService({ mcpPermissionManager: mcpManager });
      const result = await svc.checkPermission('unknown_tool');
      expect(result.result).toBe('ask');
    });

    test('should default to ask for unknown tool', async () => {
      const result = await service.checkPermission('unknown_tool');
      expect(result.result).toBe('ask');
      expect(result.message).toBe('Allow unknown_tool?');
      expect(result.reason).toBe('Default behavior');
    });

    test('should pass input to mcpPermissionManager', async () => {
      const mcpManager = {
        checkToolAccess: jest.fn().mockReturnValue({ allowed: true, reason: 'ok' })
      };
      const svc = new PermissionService({ mcpPermissionManager: mcpManager });
      const result = await svc.checkPermission('my_tool', {}, { userRole: 'admin' });
      expect(mcpManager.checkToolAccess).toHaveBeenCalledWith('my_tool', 'admin');
      expect(result.result).toBe('ask');
    });
  });

  describe('_matchPattern', () => {
    test('should match wildcard pattern', () => {
      expect(service._matchPattern('bash_execute', '*')).toBe(true);
      expect(service._matchPattern('bash_execute', 'bash_*')).toBe(true);
      expect(service._matchPattern('bash_execute', 'edit_*')).toBe(false);
      expect(service._matchPattern('file_write', 'file_w?ite')).toBe(true);
    });

    test('should return false for pattern over 100 chars', () => {
      const long = 'x'.repeat(101);
      expect(service._matchPattern('anything', long)).toBe(false);
    });

    test('should handle regex errors gracefully', () => {
      const result = service._matchPattern('test', '[');
      expect(result).toBe(false);
    });
  });

  describe('_findMatchingRule', () => {
    test('should match exact tool name', () => {
      service.addRule('deny', 'dangerous');
      const rule = service._findMatchingRule('deny', 'dangerous', {});
      expect(rule).not.toBeNull();
      expect(rule.toolName).toBe('dangerous');
    });

    test('should match wildcard pattern', () => {
      service.addRule('deny', 'file', { pattern: 'file_*' });
      const rule = service._findMatchingRule('deny', 'file_write', {});
      expect(rule).not.toBeNull();
      expect(rule.pattern).toBe('file_*');
    });

    test('should return null when no match', () => {
      const rule = service._findMatchingRule('deny', 'anything', {});
      expect(rule).toBeNull();
    });
  });

  describe('handleUserResponse', () => {
    test('should add allow rule and emit permissionGranted', async () => {
      const handler = jest.fn();
      service.on('permissionGranted', handler);
      const result = await service.handleUserResponse('bash', true);
      expect(result).toEqual({ success: true, action: 'added_to_allowlist' });
      expect(service.allowRules.has('bash')).toBe(true);
      expect(handler).toHaveBeenCalledWith({ toolName: 'bash' });
    });

    test('should record denial and emit permissionDenied', async () => {
      const handler = jest.fn();
      service.on('permissionDenied', handler);
      const result = await service.handleUserResponse('bash', false);
      expect(result).toEqual({ success: true, action: 'recorded_denial' });
      expect(service.denialTracking.get('bash').count).toBe(1);
      expect(handler).toHaveBeenCalledWith({ toolName: 'bash' });
    });
  });

  describe('getDenialStatus', () => {
    test('should return zero status for untracked tool', () => {
      expect(service.getDenialStatus('bash')).toEqual({ count: 0, lastTime: null });
    });

    test('should return current denial count', async () => {
      await service.handleUserResponse('bash', false);
      const status = service.getDenialStatus('bash');
      expect(status.count).toBe(1);
      expect(status.lastTime).toBeDefined();
    });
  });

  describe('exportConfig and importConfig', () => {
    test('exportConfig should return current configuration', () => {
      service.addRule('allow', 'bash');
      const config = service.exportConfig();
      expect(config.mode).toBe('default');
      expect(config.allowRules).toBeDefined();
    });

    test('importConfig should restore configuration', () => {
      service.importConfig({
        mode: 'bypass',
        allowRules: { bash: [{ toolName: 'bash', pattern: null, source: 'imported', createdAt: 1 }] },
        denyRules: {},
        askRules: {}
      });
      expect(service.mode).toBe('bypass');
      expect(service.allowRules.size).toBe(1);
    });

    test('importConfig should handle partial config', () => {
      service.importConfig({ mode: 'bypass' });
      expect(service.mode).toBe('bypass');
    });
  });

  describe('getStats', () => {
    test('should return rule and denial counts', () => {
      service.addRule('allow', 'bash');
      service.addRule('deny', 'dangerous');
      service.addRule('ask', 'risky');
      service.handleUserResponse('bash', false);
      const stats = service.getStats();
      expect(stats.allowRulesCount).toBe(1);
      expect(stats.denyRulesCount).toBe(1);
      expect(stats.askRulesCount).toBe(1);
      expect(stats.denialTrackingCount).toBe(1);
    });
  });

  describe('reset', () => {
    test('should clear all state and emit reset event', () => {
      const handler = jest.fn();
      service.on('reset', handler);
      service.addRule('allow', 'bash');
      service.setMode('bypass');
      service.handleUserResponse('bash', false);
      service.reset();
      expect(service.mode).toBe('default');
      expect(service.allowRules.size).toBe(0);
      expect(service.denyRules.size).toBe(0);
      expect(service.askRules.size).toBe(0);
      expect(service.denialTracking.size).toBe(0);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('_recordDenial event', () => {
    test('should emit denialRecorded event', async () => {
      const handler = jest.fn();
      service.on('denialRecorded', handler);
      await service.handleUserResponse('bash', false);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].toolName).toBe('bash');
      expect(handler.mock.calls[0][0].count).toBe(1);
    });
  });

  describe('edge cases', () => {
    test('checkPermission should normalize tool name case', async () => {
      service.addRule('allow', 'MY_TOOL');
      const result = await service.checkPermission('my_tool');
      expect(result.result).toBe('allow');
    });

    test('addRule should normalize tool name to lowercase', () => {
      service.addRule('allow', 'BASH');
      expect(service.allowRules.has('bash')).toBe(true);
    });
  });

  describe('_findMatchingRule wildcard without pattern', () => {
    test('should skip rules without pattern in wildcard loop', () => {
      service.addRule('deny', 'file_write');
      const rule = service._findMatchingRule('deny', 'read_file', {});
      expect(rule).toBeNull();
    });
  });

  describe('importConfig without mode', () => {
    test('should keep existing mode when config has no mode', () => {
      service.setMode('bypass');
      service.importConfig({});
      expect(service.mode).toBe('bypass');
    });
  });
});
