/**
 * AgentRegistry - Agent注册表
 *
 * 管理所有Agent的注册、状态、能力描述
 */

const crypto = require('crypto');

class AgentInfo {
  constructor(config) {
    this.id = config.id || crypto.randomUUID().substring(0, 8);
    this.name = config.name;
    this.type = config.type || 'general';
    this.status = 'idle'; // idle, busy, offline
    this.capabilities = config.capabilities || [];
    this.model = config.model || 'default';
    this.owner = config.owner || null;
    this.metadata = config.metadata || {};
    this.createdAt = new Date().toISOString();
    this.lastActive = null;
    this.taskCount = 0;
  }
}

class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.listeners = new Set();
  }

  register(config) {
    if (this.agents.has(config.name)) {
      return { success: false, error: 'Agent already exists' };
    }
    const agent = new AgentInfo(config);
    this.agents.set(config.name, agent);
    this._notify('register', agent);
    return { success: true, agent };
  }

  unregister(name) {
    const agent = this.agents.get(name);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }
    this.agents.delete(name);
    this._notify('unregister', agent);
    return { success: true };
  }

  get(name) {
    return this.agents.get(name);
  }

  list(status = null) {
    if (status) {
      return Array.from(this.agents.values()).filter((a) => a.status === status);
    }
    return Array.from(this.agents.values());
  }

  updateStatus(name, status) {
    const agent = this.agents.get(name);
    if (!agent) {return null;}
    agent.status = status;
    agent.lastActive = new Date().toISOString();
    if (status === 'busy') {agent.taskCount++;}
    this._notify('status', agent);
    return agent;
  }

  findAvailable(capabilities = []) {
    return Array.from(this.agents.values()).filter((a) => {
      if (a.status !== 'idle') {return false;}
      if (capabilities.length === 0) {return true;}
      return capabilities.every((cap) => a.capabilities.includes(cap));
    });
  }

  onEvent(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify(event, data) {
    for (const cb of this.listeners) {
      try { cb(event, data); } catch (e) {}
    }
  }
}

module.exports = { AgentRegistry, AgentInfo };