const { DistributedCoordinator } = require('../../src/distributed/Coordinator');

describe('DistributedCoordinator', () => {
  let coord;

  beforeEach(() => {
    coord = new DistributedCoordinator();
  });

  describe('constructor', () => {
    it('initializes empty state', () => {
      expect(coord.nodes).toBeInstanceOf(Map);
      expect(coord.tasks).toBeInstanceOf(Map);
      expect(coord.consensusThreshold).toBe(0.51);
    });
  });

  describe('registerNode / unregisterNode', () => {
    it('registers a node with status active', () => {
      coord.registerNode('node1', { name: 'worker-1', capacity: 10 });
      const node = coord.nodes.get('node1');
      expect(node.name).toBe('worker-1');
      expect(node.capacity).toBe(10);
      expect(node.status).toBe('active');
      expect(node.registeredAt).toBeDefined();
    });

    it('unregisters a node by setting status inactive', () => {
      coord.registerNode('node1', { name: 'worker-1' });
      coord.unregisterNode('node1');
      expect(coord.nodes.get('node1').status).toBe('inactive');
      expect(coord.nodes.get('node1').unregisteredAt).toBeDefined();
    });

    it('unregisterNode handles unknown node', () => {
      expect(() => coord.unregisterNode('ghost')).not.toThrow();
    });
  });

  describe('proposeTask', () => {
    it('creates a task with proposed status', async () => {
      const taskId = await coord.proposeTask({ type: 'analysis', payload: {} });
      const task = coord.tasks.get(taskId);
      expect(task.status).toBe('proposed');
      expect(task.votes).toEqual([]);
      expect(task.taskId).toBe(taskId);
    });

    it('returns a task ID', async () => {
      const taskId = await coord.proposeTask({ type: 'test' });
      expect(taskId).toMatch(/^task-/);
    });
  });

  describe('vote', () => {
    it('approves task when votes meet threshold', async () => {
      for (let i = 0; i < 3; i++) coord.registerNode(`node${i}`, {});
      const taskId = await coord.proposeTask({ type: 'test' });
      await coord.vote(taskId, 'node0', 'approve');
      expect(coord.tasks.get(taskId).status).toBe('proposed');
      await coord.vote(taskId, 'node1', 'approve');
      expect(coord.tasks.get(taskId).status).toBe('approved');
    });

    it('rejects task when reject votes meet threshold', async () => {
      for (let i = 0; i < 3; i++) coord.registerNode(`node${i}`, {});
      const taskId = await coord.proposeTask({ type: 'test' });
      await coord.vote(taskId, 'node0', 'reject');
      await coord.vote(taskId, 'node1', 'reject');
      expect(coord.tasks.get(taskId).status).toBe('rejected');
    });

    it('handles task not found', async () => {
      await expect(coord.vote('no-such-task', 'node0', 'approve')).resolves.not.toThrow();
    });
  });

  describe('getTaskStatus', () => {
    it('returns task when exists', async () => {
      const taskId = await coord.proposeTask({ type: 'test' });
      const task = coord.getTaskStatus(taskId);
      expect(task.taskId).toBe(taskId);
    });

    it('returns undefined for unknown task', () => {
      expect(coord.getTaskStatus('ghost')).toBeUndefined();
    });
  });

  describe('getActiveNodes', () => {
    it('returns only active nodes', () => {
      coord.registerNode('active1', { name: 'a1' });
      coord.registerNode('active2', { name: 'a2' });
      coord.registerNode('inactive1', { name: 'i1' });
      coord.unregisterNode('inactive1');
      const active = coord.getActiveNodes();
      expect(active).toHaveLength(2);
      expect(active.map(n => n.name)).toEqual(expect.arrayContaining(['a1', 'a2']));
    });

    it('returns empty when no active nodes', () => {
      expect(coord.getActiveNodes()).toEqual([]);
    });
  });
});
