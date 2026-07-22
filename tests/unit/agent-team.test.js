const EventEmitter = require('events');

const mockMessageBus = () => ({
  joinChannel: jest.fn(),
  leaveChannel: jest.fn(),
  broadcast: jest.fn(),
  send: jest.fn(),
  destroy: jest.fn()
});

jest.mock('../../src/agent/AgentInbox', () => {
  const MockMessageBus = jest.fn().mockImplementation(() => mockMessageBus());
  return { MessageBus: MockMessageBus };
});

const { AgentTeam } = require('../../src/agent/AgentTeam');

describe('AgentTeam', () => {
  let team;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    team = new AgentTeam({ name: 'Test Team', autoWake: true, wakeThreshold: 2 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with default options', () => {
      const t = new AgentTeam();
      expect(t.name).toBe('Agent Team');
      expect(t.teamId).toMatch(/^team_/);
      expect(t.agents).toBeInstanceOf(Map);
      expect(t.tasks).toBeInstanceOf(Map);
      expect(t.maxMessages).toBe(1000);
      expect(t.autoWake).toBe(true);
      expect(t.wakeThreshold).toBe(3);
      expect(t._messageBus).toBeDefined();
      expect(t._collaborationGraph).toBeInstanceOf(Map);
      expect(t._stateMachine).toBeInstanceOf(Map);
      expect(t._childAgents).toBeInstanceOf(Map);
      expect(t._permissionRules).toBeInstanceOf(Map);
    });

    it('accepts custom options', () => {
      const t = new AgentTeam({ name: 'Custom', maxMessages: 500, autoWake: false, wakeThreshold: 5 });
      expect(t.name).toBe('Custom');
      expect(t.maxMessages).toBe(500);
      expect(t.autoWake).toBe(false);
      expect(t.wakeThreshold).toBe(5);
    });
  });

  describe('addAgent', () => {
    it('adds an agent with default role of worker', () => {
      const agent = team.addAgent('alice', {});
      expect(agent.id).toBe('alice');
      expect(agent.name).toBe('alice');
      expect(agent.role).toBe('worker');
      expect(agent.status).toBe('idle');
      expect(agent.capabilities).toEqual([]);
      expect(agent.tasksCompleted).toBe(0);
      expect(agent.tasksFailed).toBe(0);
      expect(team.agents.get('alice')).toBe(agent);
    });

    it('adds an agent with custom config', () => {
      const agent = team.addAgent('bob', {
        name: 'Bob',
        role: 'leader',
        capabilities: ['planning', 'delegation'],
        collaborates: ['alice']
      });
      expect(agent.name).toBe('Bob');
      expect(agent.role).toBe('leader');
      expect(agent.capabilities).toEqual(['planning', 'delegation']);
      expect(agent.permissions.canSpawn).toBe(true);
    });

    it('emits agent:joined event', () => {
      const handler = jest.fn();
      team.on('agent:joined', handler);
      team.addAgent('charlie', {});
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'charlie' }));
    });

    it('initializes state machine for new agent', () => {
      team.addAgent('dave', {});
      const state = team._stateMachine.get('dave');
      expect(state).toBeDefined();
      expect(state.ui).toBe('idle');
      expect(state.system).toBe('idle');
    });

    it('joins the team channel', () => {
      const bus = team._messageBus;
      team.addAgent('eve', {});
      expect(bus.joinChannel).toHaveBeenCalledWith('team', 'eve');
    });

    it('updates collaboration graph', () => {
      team.addAgent('fiona', { collaborates: ['alice'] });
      expect(team._collaborationGraph.get('fiona')).toEqual(new Set(['alice']));
    });
  });

  describe('removeAgent', () => {
    it('removes an existing agent and returns true', () => {
      team.addAgent('alice', { role: 'leader' });
      const result = team.removeAgent('alice');
      expect(result).toBe(true);
      expect(team.agents.has('alice')).toBe(false);
    });

    it('returns false for non-existent agent', () => {
      expect(team.removeAgent('nobody')).toBe(false);
    });

    it('leaves team channel and cleans up state', () => {
      const bus = team._messageBus;
      team.addAgent('bob', {});
      team.removeAgent('bob');
      expect(bus.leaveChannel).toHaveBeenCalledWith('team', 'bob');
      expect(team._collaborationGraph.has('bob')).toBe(false);
      expect(team._stateMachine.has('bob')).toBe(false);
    });

    it('emits agent:left event', () => {
      const handler = jest.fn();
      team.on('agent:left', handler);
      team.addAgent('charlie', {});
      team.removeAgent('charlie');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'charlie' }));
    });

    it('removes child agents when parent is removed', () => {
      team.addAgent('parent', { role: 'leader', permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] } });
      team._childAgents.set('parent', ['child1', 'child2']);
      team.agents.set('child1', { id: 'child1', role: 'child' });
      team.agents.set('child2', { id: 'child2', role: 'child' });
      team._stateMachine.set('child1', {});
      team._stateMachine.set('child2', {});
      team.removeAgent('parent');
      expect(team.agents.has('child1')).toBe(false);
      expect(team.agents.has('child2')).toBe(false);
      expect(team._childAgents.has('parent')).toBe(false);
    });
  });

  describe('agent state machine', () => {
    it('getAgentState returns idle for new agent', () => {
      team.addAgent('alice', {});
      expect(team.getAgentState('alice')).toBe('idle');
      expect(team.getAgentState('alice', 'system')).toBe('idle');
    });

    it('getAgentState returns unknown for missing agent', () => {
      expect(team.getAgentState('nobody')).toBe('unknown');
    });

    it('setAgentState updates ui mode only', () => {
      team.addAgent('bob', {});
      team.setAgentState('bob', 'busy', 'ui');
      expect(team.getAgentState('bob', 'ui')).toBe('busy');
      expect(team.getAgentState('bob', 'system')).toBe('idle');
    });

    it('setAgentState updates both modes by default', () => {
      team.addAgent('charlie', {});
      team.setAgentState('charlie', 'busy');
      expect(team.getAgentState('charlie', 'ui')).toBe('busy');
      expect(team.getAgentState('charlie', 'system')).toBe('busy');
    });

    it('setAgentState emits state changed event', () => {
      const handler = jest.fn();
      team.on('agent:stateChanged', handler);
      team.addAgent('dave', {});
      team.setAgentState('dave', 'busy', 'ui');
      expect(handler).toHaveBeenCalledWith({ agentId: 'dave', state: 'busy', mode: 'ui' });
    });

    it('setAgentState does nothing for missing agent', () => {
      expect(() => team.setAgentState('nobody', 'busy')).not.toThrow();
    });
  });

  describe('spawnChildAgent', () => {
    beforeEach(() => {
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
    });

    it('spawns a child agent', async () => {
      const child = await team.spawnChildAgent('parent', { name: 'helper' });
      expect(child.id).toMatch(/^child_parent_/);
      expect(child.role).toBe('child');
      expect(child.parent).toBe('parent');
      expect(child.permissions.canSpawn).toBe(false);
      expect(child.permissions.canAccessTeamChannel).toBe(false);
      expect(child.permissions.allowedChannels).toEqual([child.id]);
      expect(team.agents.get(child.id)).toBe(child);
    });

    it('tracks child under parent', async () => {
      const child = await team.spawnChildAgent('parent', {});
      expect(team._childAgents.get('parent')).toContain(child.id);
    });

    it('emits agent:spawned event', async () => {
      const handler = jest.fn();
      team.on('agent:spawned', handler);
      await team.spawnChildAgent('parent', {});
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ parent: 'parent' }));
    });

    it('throws if parent not found', async () => {
      await expect(team.spawnChildAgent('nobody', {})).rejects.toThrow('Parent agent not found');
    });

    it('throws if parent lacks spawn permission', async () => {
      team.addAgent('worker', {
        permissions: { canSpawn: false, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      await expect(team.spawnChildAgent('worker', {})).rejects.toThrow('Agent does not have spawn permission');
    });
  });

  describe('canSendMessage', () => {
    it('allows non-child agents to send', () => {
      team.addAgent('alice', {});
      expect(team.canSendMessage('alice', 'bob', 'team')).toBe(true);
    });

    it('blocks child agent from team channel if no permission', () => {
      team.agents.set('child1', {
        id: 'child1', role: 'child',
        permissions: { canAccessTeamChannel: false, allowedChannels: ['*'], deniedTools: [] }
      });
      expect(team.canSendMessage('child1', 'bob', 'team')).toBe(false);
    });

    it('blocks child agent from channel not in allowedChannels', () => {
      team.agents.set('child1', {
        id: 'child1', role: 'child',
        permissions: { canAccessTeamChannel: true, allowedChannels: ['private'], deniedTools: [] }
      });
      expect(team.canSendMessage('child1', 'bob', 'team')).toBe(false);
    });

    it('allows child agent on wildcard channel', () => {
      team.agents.set('child1', {
        id: 'child1', role: 'child',
        permissions: { canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      expect(team.canSendMessage('child1', 'bob', 'team')).toBe(true);
    });

    it('returns false for unknown agent', () => {
      expect(team.canSendMessage('nobody', 'bob', 'team')).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('sends a team broadcast when toId is team', async () => {
      team.addAgent('alice', {});
      const envelope = await team.sendMessage('alice', 'team', 'hello');
      expect(envelope).toBeDefined();
      expect(envelope.from).toBe('alice');
      expect(envelope.to).toBe('team');
      expect(envelope.content).toBe('hello');
      expect(team._messageBus.broadcast).toHaveBeenCalled();
    });

    it('sends direct message for non-team recipient', async () => {
      team.addAgent('alice', {});
      team.addAgent('bob', {});
      await team.sendMessage('alice', 'bob', 'hi');
      expect(team._messageBus.send).toHaveBeenCalledWith('bob', expect.objectContaining({ from: 'alice' }));
    });

    it('emits message:sent event', async () => {
      const handler = jest.fn();
      team.on('message:sent', handler);
      team.addAgent('alice', {});
      await team.sendMessage('alice', 'team', 'hi');
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ from: 'alice' }));
    });

    it('blocks message and returns null when permission denied', async () => {
      const handler = jest.fn();
      team.on('message:blocked', handler);
      team.agents.set('child1', {
        id: 'child1', role: 'child',
        permissions: { canAccessTeamChannel: false, allowedChannels: ['*'], deniedTools: [] }
      });
      const result = await team.sendMessage('child1', 'team', 'hi');
      expect(result).toBeNull();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ from: 'child1', reason: 'permission_denied' }));
    });
  });

  describe('broadcastToTeam', () => {
    it('delegates to sendMessage with team target', async () => {
      team.addAgent('alice', {});
      const envelope = await team.broadcastToTeam('alice', 'hello team');
      expect(envelope.to).toBe('team');
      expect(envelope.channel).toBe('team');
    });
  });

  describe('fireAndForget', () => {
    it('spawns child and executes task', async () => {
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      const taskFn = jest.fn().mockResolvedValue('done');
      const result = await team.fireAndForget('parent', taskFn);
      expect(result.taskId).toBeDefined();
      expect(result.childId).toBeDefined();
      expect(taskFn).toHaveBeenCalled();
    });

    it('throws if parent not found', async () => {
      await expect(team.fireAndForget('nobody', jest.fn())).rejects.toThrow('Parent agent not found');
    });
  });

  describe('getCollaborators', () => {
    it('returns empty array for agent with no collaborators', () => {
      team.addAgent('alice', {});
      expect(team.getCollaborators('alice')).toEqual([]);
    });

    it('returns collaborators', () => {
      team.addAgent('alice', { collaborates: ['bob', 'charlie'] });
      expect(team.getCollaborators('alice')).toEqual(['bob', 'charlie']);
    });
  });

  describe('assignTask', () => {
    it('assigns task to best idle agent', async () => {
      team.addAgent('alice', { capabilities: ['search'] });
      team.addAgent('bob', { capabilities: ['search'] });
      const teamTask = await team.assignTask({ type: 'search' }, { requiredCapabilities: ['search'] });
      expect(teamTask.status).toBe('assigned');
      expect(teamTask.assignedTo).toBe('alice');
      expect(team.getAgentState('alice')).toBe('busy');
    });

    it('emits task:assigned event', async () => {
      const handler = jest.fn();
      team.on('task:assigned', handler);
      team.addAgent('alice', { capabilities: ['search'] });
      await team.assignTask({ type: 'search' }, { requiredCapabilities: ['search'] });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        task: expect.objectContaining({ status: 'assigned' })
      }));
    });

    it('selects agent with better success rate', async () => {
      const a1 = team.addAgent('fast', { capabilities: ['work'] });
      const a2 = team.addAgent('slow', { capabilities: ['work'] });
      a1.tasksCompleted = 10;
      a1.tasksFailed = 0;
      a2.tasksCompleted = 1;
      a2.tasksFailed = 0;
      const teamTask = await team.assignTask({ type: 'work' }, { requiredCapabilities: ['work'] });
      expect(teamTask.assignedTo).toBe('fast');
    });

    it('skips child agents during selection', async () => {
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      const child = await team.spawnChildAgent('parent', {});
      const teamTask = await team.assignTask({ type: 'work' });
      expect(teamTask.assignedTo).not.toBe(child.id);
    });

    it('remains pending if no suitable agent', async () => {
      const teamTask = await team.assignTask({ type: 'work' }, { requiredCapabilities: ['impossible'] });
      expect(teamTask.status).toBe('pending');
      expect(teamTask.assignedTo).toBeNull();
    });

    it('triggers autoWake if threshold met', async () => {
      const handler = jest.fn();
      team.on('agent:wake', handler);
      team.addAgent('collab1', {});
      team.addAgent('collab2', { capabilities: ['work'], collaborates: ['idle1', 'idle2'] });
      team.addAgent('idle1', {});
      team.addAgent('idle2', {});
      await team.assignTask({ type: 'work' }, { requiredCapabilities: ['work'] });
      jest.runAllTimers();
      expect(handler).toHaveBeenCalled();
    });

    it('does not autoWake if autoWake is false', async () => {
      const t = new AgentTeam({ name: 'NoWake', autoWake: false });
      const handler = jest.fn();
      t.on('agent:wake', handler);
      t.addAgent('alice', { capabilities: ['work'] });
      await t.assignTask({ type: 'work' }, { requiredCapabilities: ['work'] });
      jest.runAllTimers();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('completeTask', () => {
    it('marks task completed and updates agent', () => {
      team.addAgent('alice', { capabilities: ['work'] });
      team.tasks.set('t1', { id: 't1', status: 'assigned', assignedTo: 'alice' });
      const result = team.completeTask('t1', { data: 'done' });
      expect(result).toBe(true);
      expect(team.tasks.get('t1').status).toBe('completed');
      expect(team.agents.get('alice').status).toBe('idle');
      expect(team.agents.get('alice').tasksCompleted).toBe(1);
    });

    it('returns false for non-existent task', () => {
      expect(team.completeTask('nope', {})).toBe(false);
    });

    it('emits task:completed', () => {
      const handler = jest.fn();
      team.on('task:completed', handler);
      team.addAgent('alice', { capabilities: ['work'] });
      team.tasks.set('t2', { id: 't2', status: 'assigned', assignedTo: 'alice' });
      team.completeTask('t2', {});
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('failTask', () => {
    it('marks task failed and updates agent', () => {
      team.addAgent('alice', { capabilities: ['work'] });
      team.tasks.set('t1', { id: 't1', status: 'assigned', assignedTo: 'alice' });
      const result = team.failTask('t1', 'error');
      expect(result).toBe(true);
      expect(team.tasks.get('t1').status).toBe('failed');
      expect(team.agents.get('alice').status).toBe('idle');
      expect(team.agents.get('alice').tasksFailed).toBe(1);
    });

    it('returns false for non-existent task', () => {
      expect(team.failTask('nope', 'err')).toBe(false);
    });

    it('emits task:failed', () => {
      const handler = jest.fn();
      team.on('task:failed', handler);
      team.addAgent('alice', { capabilities: ['work'] });
      team.tasks.set('t2', { id: 't2', status: 'assigned', assignedTo: 'alice' });
      team.failTask('t2', 'err');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getTeamStatus', () => {
    it('returns status with agent and task counts', () => {
      team.addAgent('alice', {});
      team.addAgent('bob', {});
      team.tasks.set('t1', { id: 't1', status: 'pending' });
      team.tasks.set('t2', { id: 't2', status: 'completed' });
      const status = team.getTeamStatus();
      expect(status.teamId).toBe(team.teamId);
      expect(status.agents.total).toBe(2);
      expect(status.agents.idle).toBe(2);
      expect(status.tasks.total).toBe(2);
      expect(status.tasks.pending).toBe(1);
      expect(status.tasks.completed).toBe(1);
    });

    it('excludes child agents from count', () => {
      team.addAgent('parent', { role: 'leader' });
      team.agents.set('child1', { id: 'child1', role: 'child' });
      const status = team.getTeamStatus();
      expect(status.agents.total).toBe(1);
    });

    it('counts running and assigned as running', () => {
      team.addAgent('alice', {});
      team.tasks.set('t1', { id: 't1', status: 'assigned' });
      team.tasks.set('t2', { id: 't2', status: 'running' });
      const status = team.getTeamStatus();
      expect(status.tasks.running).toBe(2);
    });
  });

  describe('getAgent / getAllAgents / getParentAgents / getChildAgents', () => {
    it('getAgent returns agent or undefined', () => {
      team.addAgent('alice', {});
      expect(team.getAgent('alice')).toBeDefined();
      expect(team.getAgent('nobody')).toBeUndefined();
    });

    it('getAllAgents returns all agents', () => {
      team.addAgent('alice', {});
      team.addAgent('bob', {});
      expect(team.getAllAgents()).toHaveLength(2);
    });

    it('getParentAgents returns only non-child agents', () => {
      team.addAgent('parent', { role: 'leader' });
      team.agents.set('child1', { id: 'child1', role: 'child' });
      const parents = team.getParentAgents();
      expect(parents).toHaveLength(1);
      expect(parents[0].id).toBe('parent');
    });

    it('getChildAgents returns children of parent', () => {
      team._childAgents.set('parent1', ['c1', 'c2']);
      expect(team.getChildAgents('parent1')).toEqual(['c1', 'c2']);
    });

    it('getChildAgents returns empty for parent with no children', () => {
      expect(team.getChildAgents('nobody')).toEqual([]);
    });
  });

  describe('purgeCompletedTasks', () => {
    it('removes old completed tasks', () => {
      const now = Date.now();
      team.tasks.set('t1', { id: 't1', status: 'completed', completedAt: now - 7200000 });
      team.tasks.set('t2', { id: 't2', status: 'failed', completedAt: now - 7200000 });
      team.tasks.set('t3', { id: 't3', status: 'pending' });
      const count = team.purgeCompletedTasks(3600000);
      expect(count).toBe(2);
      expect(team.tasks.has('t1')).toBe(false);
      expect(team.tasks.has('t2')).toBe(false);
      expect(team.tasks.has('t3')).toBe(true);
    });

    it('removes nothing from empty map', () => {
      expect(team.purgeCompletedTasks()).toBe(0);
    });

    it('removes nothing if tasks are recent', () => {
      const now = Date.now();
      team.tasks.set('t1', { id: 't1', status: 'completed', completedAt: now - 1000 });
      expect(team.purgeCompletedTasks(3600000)).toBe(0);
    });

    it('skips tasks without completedAt', () => {
      team.tasks.set('t1', { id: 't1', status: 'completed' });
      expect(team.purgeCompletedTasks()).toBe(0);
    });
  });

  describe('purgeChildAgents', () => {
    it('removes old idle child agents', () => {
      const oldTime = Date.now() - 600000;
      const childId = 'old_child';
      team._childAgents.set('parent', [childId]);
      team.agents.set(childId, { id: childId, role: 'child', status: 'idle', createdAt: oldTime });
      team._stateMachine.set(childId, {});
      const count = team.purgeChildAgents();
      expect(count).toBe(1);
      expect(team.agents.has(childId)).toBe(false);
      expect(team._stateMachine.has(childId)).toBe(false);
    });

    it('preserves recent child agents', () => {
      const recentTime = Date.now();
      const childId = 'new_child';
      team._childAgents.set('parent', [childId]);
      team.agents.set(childId, { id: childId, role: 'child', status: 'idle', createdAt: recentTime });
      const count = team.purgeChildAgents();
      expect(count).toBe(0);
      expect(team.agents.has(childId)).toBe(true);
    });

    it('cleans up empty parent entries', () => {
      const oldTime = Date.now() - 600000;
      team._childAgents.set('orphan', ['dead_child']);
      team.agents.set('dead_child', { id: 'dead_child', role: 'child', status: 'idle', createdAt: oldTime });
      team._stateMachine.set('dead_child', {});
      team.purgeChildAgents();
      expect(team._childAgents.has('orphan')).toBe(false);
    });
  });

  describe('gc', () => {
    it('returns purge counts', () => {
      const result = team.gc();
      expect(result).toEqual({ tasksPurged: 0, agentsPurged: 0 });
    });
  });

  describe('destroy', () => {
    it('clears all state and removes listeners', () => {
      team.addAgent('alice', {});
      team.destroy();
      expect(team.agents.size).toBe(0);
      expect(team.tasks.size).toBe(0);
      expect(team._collaborationGraph.size).toBe(0);
      expect(team._stateMachine.size).toBe(0);
      expect(team._childAgents.size).toBe(0);
      expect(team._messageBus.destroy).toHaveBeenCalled();
      expect(team.listenerCount('agent:joined')).toBe(0);
    });
  });

  describe('events', () => {
    it('is an EventEmitter', () => {
      expect(team).toBeInstanceOf(EventEmitter);
    });

    it('emits agent:wake from _scheduleAutoWake', () => {
      const handler = jest.fn();
      team.on('agent:wake', handler);
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] },
        config: {}
      });
      team.addAgent('alice', {});
      team.agents.get('parent').status = 'idle';
      team._scheduleAutoWake('parent', { taskId: 't1' });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        reason: 'child_task_completed',
        context: expect.objectContaining({ taskId: 't1' })
      }));
    });

    it('_scheduleAutoWake does nothing if autoWake disabled', () => {
      const t = new AgentTeam({ autoWake: false });
      const handler = jest.fn();
      t.on('agent:wake', handler);
      t.addAgent('alice', {});
      t.agents.get('alice').status = 'idle';
      t._scheduleAutoWake('alice', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('_scheduleAutoWake does nothing if parent not found', () => {
      const handler = jest.fn();
      team.on('agent:wake', handler);
      team._scheduleAutoWake('nobody', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('_autoWakeCollaborators', () => {
    it('emits agent:wake for idle collaborators when threshold met', () => {
      const handler = jest.fn();
      team.on('agent:wake', handler);
      team.addAgent('alice', { collaborates: ['bob', 'charlie'] });
      team.addAgent('bob', {});
      team.addAgent('charlie', {});
      team._autoWakeCollaborators('alice', { type: 'test' });
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ reason: 'collaboration' }));
    });
  });

  describe('_selectAgent', () => {
    it('skips busy agents', () => {
      team.addAgent('busy', { capabilities: ['work'] });
      team.addAgent('free', { capabilities: ['work'] });
      team.agents.get('busy').status = 'busy';
      const selected = team._selectAgent({ requiredCapabilities: ['work'] });
      expect(selected.id).toBe('free');
    });

    it('skips agents without required capabilities', () => {
      team.addAgent('nocap', { capabilities: [] });
      team.addAgent('hascap', { capabilities: ['work'] });
      const selected = team._selectAgent({ requiredCapabilities: ['work'] });
      expect(selected.id).toBe('hascap');
    });

    it('returns null when no agent matches', () => {
      expect(team._selectAgent({ requiredCapabilities: ['magic'] })).toBeNull();
    });
  });

  describe('additional branch coverage', () => {
    it('setAgentState updates system mode only', () => {
      team.addAgent('alice', {});
      team.setAgentState('alice', 'busy', 'system');
      expect(team.getAgentState('alice', 'ui')).toBe('idle');
      expect(team.getAgentState('alice', 'system')).toBe('busy');
    });

    it('spawnChildAgent reuses existing children array', async () => {
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      await team.spawnChildAgent('parent', {});
      await team.spawnChildAgent('parent', {});
      expect(team._childAgents.get('parent')).toHaveLength(2);
    });

    it('fireAndForget calls callback on success', async () => {
      jest.useRealTimers();
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      const callback = jest.fn();
      const taskFn = jest.fn().mockResolvedValue('done');
      const { taskId } = await team.fireAndForget('parent', taskFn, callback);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(callback).toHaveBeenCalledWith(null, 'done');
      expect(team.tasks.get(taskId).status).toBe('completed');
    });

    it('fireAndForget handles task error with callback', async () => {
      jest.useRealTimers();
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      const callback = jest.fn();
      const taskFn = jest.fn().mockRejectedValue(new Error('boom'));
      const { taskId } = await team.fireAndForget('parent', taskFn, callback);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(callback).toHaveBeenCalledWith(expect.any(Error), null);
      expect(team.tasks.get(taskId).status).toBe('failed');
    });

    it('fireAndForget handles task error without callback', async () => {
      jest.useRealTimers();
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      const taskFn = jest.fn().mockRejectedValue(new Error('boom'));
      const { taskId } = await team.fireAndForget('parent', taskFn);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(team.tasks.get(taskId).status).toBe('failed');
    });

    it('_executeTask handles object with execute method', async () => {
      jest.useRealTimers();
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      const executeFn = jest.fn().mockResolvedValue('executed');
      const { taskId } = await team.fireAndForget('parent', { execute: executeFn, requiredCapabilities: [] });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(executeFn).toHaveBeenCalled();
      expect(team.tasks.get(taskId).status).toBe('completed');
    });

    it('_executeTask falls through to default return', async () => {
      jest.useRealTimers();
      team.addAgent('parent', {
        role: 'leader',
        permissions: { canSpawn: true, canAccessTeamChannel: true, allowedChannels: ['*'], deniedTools: [] }
      });
      const { taskId } = await team.fireAndForget('parent', { type: 'simple' });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(team.tasks.get(taskId).status).toBe('completed');
      expect(team.tasks.get(taskId).result).toEqual({ success: true, message: 'Task completed' });
    });

    it('getCollaborators returns empty for agent not in graph', () => {
      expect(team.getCollaborators('nobody')).toEqual([]);
    });

    it('completeTask handles task with no assignedTo', () => {
      team.tasks.set('t1', { id: 't1', status: 'assigned' });
      const result = team.completeTask('t1', {});
      expect(result).toBe(true);
    });

    it('completeTask handles task with missing agent', () => {
      team.tasks.set('t1', { id: 't1', status: 'assigned', assignedTo: 'ghost' });
      const result = team.completeTask('t1', 'done');
      expect(result).toBe(true);
      expect(team.tasks.get('t1').status).toBe('completed');
    });

    it('failTask handles task with no assignedTo', () => {
      team.tasks.set('t1', { id: 't1', status: 'assigned' });
      const result = team.failTask('t1', 'err');
      expect(result).toBe(true);
    });

    it('failTask handles task with missing agent', () => {
      team.tasks.set('t1', { id: 't1', status: 'assigned', assignedTo: 'ghost' });
      const result = team.failTask('t1', 'err');
      expect(result).toBe(true);
      expect(team.tasks.get('t1').status).toBe('failed');
    });

    it('purgeChildAgents skips non-child agents', () => {
      team.addAgent('alice', {});
      const count = team.purgeChildAgents();
      expect(count).toBe(0);
      expect(team.agents.has('alice')).toBe(true);
    });

    it('purgeChildAgents skips busy child agents', () => {
      const childId = 'busy_child';
      team.agents.set(childId, { id: childId, role: 'child', status: 'busy', createdAt: Date.now() - 600000 });
      const count = team.purgeChildAgents();
      expect(count).toBe(0);
      expect(team.agents.has(childId)).toBe(true);
    });

    it('purgeChildAgents handles child without createdAt', () => {
      const childId = 'no_date_child';
      team._childAgents.set('parent', [childId]);
      team.agents.set(childId, { id: childId, role: 'child', status: 'idle' });
      team._stateMachine.set(childId, {});
      const count = team.purgeChildAgents();
      expect(count).toBe(1);
      expect(team.agents.has(childId)).toBe(false);
    });
  });
});
