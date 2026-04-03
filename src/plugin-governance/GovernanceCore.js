// Phase 11: Plugin Governance System
// Manages plugin lifecycle, permissions, and security policies

class PluginGovernance {
  constructor() {
    this.policies = new Map();
    this.pluginRegistry = new Map();
    this.permissionMatrix = new Map();
  }

  registerPolicy(pluginName, policy) {
    this.policies.set(pluginName, {
      ...policy,
      createdAt: new Date().toISOString(),
      version: '1.0.0'
    });
  }

  getPolicy(pluginName) {
    return this.policies.get(pluginName);
  }

  validatePermission(pluginName, action) {
    const policy = this.getPolicy(pluginName);
    if (!policy) return false;
    return policy.allowedActions.includes(action);
  }

  approvePlugin(pluginName) {
    const plugin = this.pluginRegistry.get(pluginName);
    if (plugin) {
      plugin.status = 'approved';
      plugin.approvedAt = new Date().toISOString();
    }
  }

  rejectPlugin(pluginName, reason) {
    const plugin = this.pluginRegistry.get(pluginName);
    if (plugin) {
      plugin.status = 'rejected';
      plugin.rejectedReason = reason;
    }
  }

  audit(pluginName) {
    return {
      pluginName,
      policy: this.getPolicy(pluginName),
      registry: this.pluginRegistry.get(pluginName)
    };
  }
}

module.exports = { PluginGovernance };
