'use strict';

const { PluginGovernance } = require('../../src/plugin-governance/GovernanceCore');

describe('PluginGovernance', () => {
  let governance;

  beforeEach(() => {
    governance = new PluginGovernance();
  });

  describe('constructor', () => {
    it('initializes empty Maps', () => {
      expect(governance.policies).toBeInstanceOf(Map);
      expect(governance.pluginRegistry).toBeInstanceOf(Map);
      expect(governance.permissionMatrix).toBeInstanceOf(Map);
      expect(governance.policies.size).toBe(0);
      expect(governance.pluginRegistry.size).toBe(0);
      expect(governance.permissionMatrix.size).toBe(0);
    });
  });

  describe('registerPolicy', () => {
    it('stores policy with metadata', () => {
      governance.registerPolicy('my-plugin', {
        allowedActions: ['read', 'write'],
        maxInstances: 2
      });

      const policy = governance.policies.get('my-plugin');
      expect(policy.allowedActions).toEqual(['read', 'write']);
      expect(policy.maxInstances).toBe(2);
      expect(policy.createdAt).toEqual(expect.any(String));
      expect(policy.version).toBe('1.0.0');
    });

    it('overwrites existing policy for same plugin', () => {
      governance.registerPolicy('my-plugin', { allowedActions: ['read'] });
      governance.registerPolicy('my-plugin', { allowedActions: ['write'] });

      expect(governance.policies.size).toBe(1);
      expect(governance.policies.get('my-plugin').allowedActions).toEqual(['write']);
    });

    it('stores multiple plugins independently', () => {
      governance.registerPolicy('plugin-a', { allowedActions: ['read'] });
      governance.registerPolicy('plugin-b', { allowedActions: ['write'] });

      expect(governance.policies.size).toBe(2);
    });
  });

  describe('getPolicy', () => {
    it('returns stored policy', () => {
      governance.registerPolicy('my-plugin', { allowedActions: ['execute'] });

      const policy = governance.getPolicy('my-plugin');
      expect(policy.allowedActions).toEqual(['execute']);
    });

    it('returns undefined for unregistered plugin', () => {
      expect(governance.getPolicy('unknown')).toBeUndefined();
    });
  });

  describe('validatePermission', () => {
    it('returns true if action is in allowed actions', () => {
      governance.registerPolicy('my-plugin', { allowedActions: ['read', 'write', 'execute'] });

      expect(governance.validatePermission('my-plugin', 'read')).toBe(true);
      expect(governance.validatePermission('my-plugin', 'write')).toBe(true);
      expect(governance.validatePermission('my-plugin', 'execute')).toBe(true);
    });

    it('returns false if action is not in allowed actions', () => {
      governance.registerPolicy('my-plugin', { allowedActions: ['read'] });

      expect(governance.validatePermission('my-plugin', 'delete')).toBe(false);
    });

    it('returns false if no policy exists for plugin', () => {
      expect(governance.validatePermission('unknown', 'read')).toBe(false);
    });
  });

  describe('approvePlugin', () => {
    it('sets plugin status to approved with timestamp', () => {
      governance.pluginRegistry.set('my-plugin', { name: 'my-plugin', status: 'pending' });

      const before = Date.now();
      governance.approvePlugin('my-plugin');
      const after = Date.now();

      const plugin = governance.pluginRegistry.get('my-plugin');
      expect(plugin.status).toBe('approved');
      expect(plugin.approvedAt).toEqual(expect.any(String));
      const ts = new Date(plugin.approvedAt).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after + 100);
    });

    it('does nothing if plugin not in registry', () => {
      expect(() => governance.approvePlugin('unknown')).not.toThrow();
    });

    it('does not modify other plugins', () => {
      governance.pluginRegistry.set('plugin-a', { status: 'pending' });
      governance.pluginRegistry.set('plugin-b', { status: 'pending' });

      governance.approvePlugin('plugin-a');

      expect(governance.pluginRegistry.get('plugin-a').status).toBe('approved');
      expect(governance.pluginRegistry.get('plugin-b').status).toBe('pending');
    });
  });

  describe('rejectPlugin', () => {
    it('sets plugin status to rejected with reason', () => {
      governance.pluginRegistry.set('my-plugin', { name: 'my-plugin', status: 'pending' });

      governance.rejectPlugin('my-plugin', 'Security violation');

      const plugin = governance.pluginRegistry.get('my-plugin');
      expect(plugin.status).toBe('rejected');
      expect(plugin.rejectedReason).toBe('Security violation');
    });

    it('does nothing if plugin not in registry', () => {
      expect(() => governance.rejectPlugin('unknown', 'reason')).not.toThrow();
    });

    it('updates rejection reason on repeated calls', () => {
      governance.pluginRegistry.set('my-plugin', { status: 'pending' });

      governance.rejectPlugin('my-plugin', 'First reason');
      governance.rejectPlugin('my-plugin', 'Updated reason');

      const plugin = governance.pluginRegistry.get('my-plugin');
      expect(plugin.rejectedReason).toBe('Updated reason');
    });
  });

  describe('audit', () => {
    it('returns policy and registry info for registered plugin', () => {
      governance.registerPolicy('my-plugin', { allowedActions: ['read'] });
      governance.pluginRegistry.set('my-plugin', { status: 'pending' });

      const result = governance.audit('my-plugin');

      expect(result.pluginName).toBe('my-plugin');
      expect(result.policy).toBeDefined();
      expect(result.policy.allowedActions).toEqual(['read']);
      expect(result.registry).toEqual({ status: 'pending' });
    });

    it('returns undefined policy and registry for unknown plugin', () => {
      const result = governance.audit('unknown');

      expect(result.pluginName).toBe('unknown');
      expect(result.policy).toBeUndefined();
      expect(result.registry).toBeUndefined();
    });

    it('returns policy without registry when policy exists but no registry', () => {
      governance.registerPolicy('my-plugin', { allowedActions: ['read'] });

      const result = governance.audit('my-plugin');

      expect(result.policy).toBeDefined();
      expect(result.registry).toBeUndefined();
    });
  });
});
