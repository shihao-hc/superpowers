const crypto = require('crypto');
const { EventEmitter } = require('events');
const { MessageBus } = require('./AgentInbox');

class AgentTeam extends EventEmitter {
  constructor(options = {}) {
    super();
    this.teamId = options.teamId || `team_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    this.name = options.name || 'Agent Team';
    this.agents = new Map();
    this.tasks = new Map();
    this.maxMessages = options.maxMessages || 1000;
    this.autoWake = options.autoWake !== false;
    this.wakeThreshold = options.wakeThreshold || 3;
    this._messageBus = options.messageBus || new MessageBus();
    this._collaborationGraph = new Map();
    this._stateMachine = new Map();
    this._childAgents = new Map();
    this._permissionRules = new Map();
  }

  addAgent(agentId, agentConfig) {
    const agent = {
      id: agentId,
      name: agentConfig.name || agentId,
      role: agentConfig.role || 'worker',
      capabilities: agentConfig.capabilities || [],
      permissions: agentConfig.permissions || {
        canSpawn: agentConfig.role === 'leader',
        canAccessTeamChannel: true,
        allowedChannels: ['*'],
        deniedTools: []
      },
      status: 'idle',
      lastActive: Date.now(),
      tasksCompleted: 0,
      tasksFailed: 0,
      config: agentConfig
    };

    this.agents.set(agentId, agent);
    this._updateCollaborationGraph(agentId, agentConfig.collaborates || []);
    this._initStateMachine(agentId);
    this._messageBus.joinChannel('team', agentId);

    this.emit('agent:joined', agent);
    return agent;
  }

  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this._messageBus.leaveChannel('team', agentId);
      this.agents.delete(agentId);
      this._collaborationGraph.delete(agentId);
      this._stateMachine.delete(agentId);
      this._removeChildAgents(agentId);
      this.emit('agent:left', agent);
      return true;
    }
    return false;
  }

  _initStateMachine(agentId) {
    this._stateMachine.set(agentId, {
      ui: 'idle',
      system: 'idle',
      lastTransition: Date.now()
    });
  }

  getAgentState(agentId, mode = 'ui') {
    const state = this._stateMachine.get(agentId);
    return state ? state[mode] : 'unknown';
  }

  setAgentState(agentId, state, mode = 'both') {
    const sm = this._stateMachine.get(agentId);
    if (!sm) return;

    if (mode === 'both' || mode === 'ui') {
      sm.ui = state;
    }
    if (mode === 'both' || mode === 'system') {
      sm.system = state;
    }
    sm.lastTransition = Date.now();

    this.emit('agent:stateChanged', { agentId, state, mode });
  }

  async spawnChildAgent(parentId, childConfig) {
    const parent = this.agents.get(parentId);
    if (!parent) throw new Error('Parent agent not found');

    if (!parent.permissions.canSpawn) {
      throw new Error('Agent does not have spawn permission');
    }

    const childId = `child_${parentId}_${Date.now().toString(36)}`;

    const childAgent = {
      id: childId,
      name: childConfig.name || childId,
      role: 'child',
      parent: parentId,
      capabilities: childConfig.capabilities || [],
      permissions: {
        canSpawn: false,
        canAccessTeamChannel: false,
        allowedChannels: [childId],
        deniedTools: ['team_broadcast', 'spawn_agent']
      },
      status: 'idle',
      createdAt: Date.now()
    };

    if (!this._childAgents.has(parentId)) {
      this._childAgents.set(parentId, []);
    }
    this._childAgents.get(parentId).push(childId);

    this.agents.set(childId, childAgent);
    this._initStateMachine(childId);

    this.emit('agent:spawned', { parent: parentId, child: childId });

    return childAgent;
  }

  _removeChildAgents(parentId) {
    const children = this._childAgents.get(parentId) || [];
    for (const childId of children) {
      this.agents.delete(childId);
      this._stateMachine.delete(childId);
    }
    this._childAgents.delete(parentId);
  }

  canSendMessage(fromId, toId, channel) {
    const from = this.agents.get(fromId);
    if (!from) return false;

    if (from.role === 'child') {
      if (channel === 'team' && !from.permissions.canAccessTeamChannel) {
        return false;
      }
      if (from.permissions.allowedChannels.length > 0 &&
          !from.permissions.allowedChannels.includes(channel) &&
          !from.permissions.allowedChannels.includes('*')) {
        return false;
      }
    }

    return true;
  }

  async sendMessage(fromId, toId, message, channel = 'team') {
    if (!this.canSendMessage(fromId, toId, channel)) {
      this.emit('message:blocked', { from: fromId, to: toId, channel, reason: 'permission_denied' });
      return null;
    }

    const envelope = {
      id: `msg_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      from: fromId,
      to: toId,
      content: message,
      channel,
      timestamp: Date.now()
    };

    if (toId === 'team') {
      this._messageBus.broadcast(channel, envelope, [fromId]);
    } else {
      this._messageBus.send(toId, envelope);
    }

    this.emit('message:sent', envelope);
    return envelope;
  }

  async broadcastToTeam(fromId, message) {
    return this.sendMessage(fromId, 'team', message, 'team');
  }

  async fireAndForget(parentId, task, callback) {
    const parent = this.agents.get(parentId);
    if (!parent) throw new Error('Parent agent not found');

    const child = await this.spawnChildAgent(parentId, {
      name: `${parent.name}_subtask`,
      capabilities: task.requiredCapabilities || []
    });

    const taskId = `task_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const teamTask = {
      id: taskId,
      task,
      status: 'running',
      assignedTo: child.id,
      parent: parentId,
      fireAndForget: true,
      createdAt: Date.now()
    };

    this.tasks.set(taskId, teamTask);
    this.setAgentState(child.id, 'running', 'both');

    const executeTask = async () => {
      try {
        const result = await this._executeTask(task);

        teamTask.status = 'completed';
        teamTask.completedAt = Date.now();
        teamTask.result = result;

        this._messageBus.send(parentId, {
          from: child.id,
          type: 'task_result',
          content: { taskId, result, status: 'completed' }
        });

        if (callback) callback(null, result);

        this.emit('task:completed', teamTask);

        this._scheduleAutoWake(parentId, { taskId, result });

      } catch (error) {
        teamTask.status = 'failed';
        teamTask.error = error.message;

        this._messageBus.send(parentId, {
          from: child.id,
          type: 'task_error',
          content: { taskId, error: error.message }
        });

        if (callback) callback(error, null);

        this.emit('task:failed', teamTask);
      }
    };

    executeTask();

    return { taskId, childId: child.id };
  }

  _scheduleAutoWake(parentId, context) {
    const parent = this.agents.get(parentId);
    if (!parent || !this.autoWake) return;

    this.emit('agent:wake', {
      agent: parent,
      reason: 'child_task_completed',
      context
    });
  }

  async _executeTask(task) {
    if (typeof task === 'function') {
      return await task();
    }
    if (task.execute && typeof task.execute === 'function') {
      return await task.execute();
    }
    return { success: true, message: 'Task completed' };
  }

  _updateCollaborationGraph(agentId, collaborators) {
    this._collaborationGraph.set(agentId, new Set(collaborators));
  }

  getCollaborators(agentId) {
    return Array.from(this._collaborationGraph.get(agentId) || []);
  }

  async assignTask(task, options = {}) {
    const taskId = `task_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const teamTask = {
      id: taskId,
      task,
      status: 'pending',
      assignedTo: null,
      priority: options.priority || 0,
      requiredCapabilities: options.requiredCapabilities || [],
      createdAt: Date.now()
    };

    this.tasks.set(taskId, teamTask);

    const agent = this._selectAgent(teamTask);

    if (agent) {
      teamTask.assignedTo = agent.id;
      teamTask.status = 'assigned';
      this.setAgentState(agent.id, 'busy');

      this.emit('task:assigned', { task: teamTask, agent });

      if (this.autoWake) {
        await this._autoWakeCollaborators(agent.id, teamTask);
      }
    }

    return teamTask;
  }

  _selectAgent(task) {
    let bestAgent = null;
    let bestScore = -1;

    for (const [agentId, agent] of this.agents) {
      if (agent.status !== 'idle' || agent.role === 'child') continue;

      let score = 0;

      if (task.requiredCapabilities.length > 0) {
        const hasCapabilities = task.requiredCapabilities.every(cap =>
          agent.capabilities.includes(cap)
        );
        if (!hasCapabilities) continue;
        score += 10;
      }

      score += agent.tasksCompleted - agent.tasksFailed * 2;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  async _autoWakeCollaborators(agentId, task) {
    const collaborators = this.getCollaborators(agentId);
    const idleCollaborators = collaborators
      .map(cId => this.agents.get(cId))
      .filter(a => a && a.status === 'idle');

    if (idleCollaborators.length >= this.wakeThreshold) {
      for (const agent of idleCollaborators) {
        this.emit('agent:wake', { agent, reason: 'collaboration', task });
      }
    }
  }

  completeTask(taskId, result) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'completed';
    task.completedAt = Date.now();
    task.result = result;

    if (task.assignedTo) {
      const agent = this.agents.get(task.assignedTo);
      if (agent) {
        agent.status = 'idle';
        agent.tasksCompleted++;
        this.setAgentState(agent.id, 'idle');
      }
    }

    this.emit('task:completed', task);
    return true;
  }

  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'failed';
    task.error = error;

    if (task.assignedTo) {
      const agent = this.agents.get(task.assignedTo);
      if (agent) {
        agent.status = 'idle';
        agent.tasksFailed++;
        this.setAgentState(agent.id, 'idle');
      }
    }

    this.emit('task:failed', task);
    return true;
  }

  getTeamStatus() {
    const agents = Array.from(this.agents.values()).filter(a => a.role !== 'child');
    const tasks = Array.from(this.tasks.values());

    return {
      teamId: this.teamId,
      name: this.name,
      agents: {
        total: agents.length,
        idle: agents.filter(a => a.status === 'idle').length,
        busy: agents.filter(a => a.status === 'busy').length
      },
      tasks: {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        running: tasks.filter(t => t.status === 'running' || t.status === 'assigned').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length
      }
    };
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  getParentAgents() {
    return Array.from(this.agents.values()).filter(a => a.role !== 'child');
  }

  getChildAgents(parentId) {
    return this._childAgents.get(parentId) || [];
  }

  purgeCompletedTasks(maxAge = 3600000) {
    const now = Date.now();
    const toRemove = [];

    for (const [taskId, task] of this.tasks) {
      if ((task.status === 'completed' || task.status === 'failed') &&
          task.completedAt &&
          now - task.completedAt > maxAge) {
        toRemove.push(taskId);
      }
    }

    for (const taskId of toRemove) {
      this.tasks.delete(taskId);
    }

    return toRemove.length;
  }

  purgeChildAgents() {
    const toRemove = [];

    for (const [childId, agent] of this.agents) {
      if (agent.role === 'child' && agent.status === 'idle') {
        const age = Date.now() - (agent.createdAt || 0);
        if (age > 300000) {
          toRemove.push(childId);
        }
      }
    }

    for (const childId of toRemove) {
      this.agents.delete(childId);
      this._stateMachine.delete(childId);
    }

    for (const [parentId, children] of this._childAgents) {
      const remaining = children.filter(cId => this.agents.has(cId));
      if (remaining.length === 0) {
        this._childAgents.delete(parentId);
      } else {
        this._childAgents.set(parentId, remaining);
      }
    }

    return toRemove.length;
  }

  gc() {
    const tasksPurged = this.purgeCompletedTasks();
    const agentsPurged = this.purgeChildAgents();
    return { tasksPurged, agentsPurged };
  }

  destroy() {
    this._messageBus.destroy();
    this.agents.clear();
    this.tasks.clear();
    this._collaborationGraph.clear();
    this._stateMachine.clear();
    this._childAgents.clear();
    this.removeAllListeners();
  }
}

module.exports = { AgentTeam };
