const { AgentRegistry } = require('../../src/core/AgentRegistry');

describe('AgentRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  describe('register', () => {
    it('registers a new agent', () => {
      const result = registry.register({ name: 'agent1', type: 'coder' });
      expect(result.success).toBe(true);
      expect(result.agent.name).toBe('agent1');
      expect(result.agent.type).toBe('coder');
      expect(result.agent.status).toBe('idle');
    });

    it('rejects duplicate names', () => {
      registry.register({ name: 'agent1' });
      const result = registry.register({ name: 'agent1' });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/exists/);
    });

    it('triggers listener on register', () => {
      const listener = jest.fn();
      registry.onEvent(listener);
      registry.register({ name: 'agent1' });
      expect(listener).toHaveBeenCalledWith('register', expect.objectContaining({ name: 'agent1' }));
    });
  });

  describe('unregister', () => {
    it('removes an agent', () => {
      registry.register({ name: 'agent1' });
      const result = registry.unregister('agent1');
      expect(result.success).toBe(true);
      expect(registry.get('agent1')).toBeUndefined();
    });

    it('returns error for non-existent agent', () => {
      expect(registry.unregister('ghost').success).toBe(false);
    });
  });

  describe('get', () => {
    it('returns agent by name', () => {
      registry.register({ name: 'agent1' });
      expect(registry.get('agent1').name).toBe('agent1');
    });

    it('returns undefined for missing agent', () => {
      expect(registry.get('ghost')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns all agents', () => {
      registry.register({ name: 'a1' });
      registry.register({ name: 'a2' });
      expect(registry.list()).toHaveLength(2);
    });

    it('filters by status', () => {
      registry.register({ name: 'a1' });
      registry.register({ name: 'a2' });
      registry.updateStatus('a2', 'busy');
      expect(registry.list('busy')).toHaveLength(1);
      expect(registry.list('busy')[0].name).toBe('a2');
    });
  });

  describe('updateStatus', () => {
    it('updates agent status', () => {
      registry.register({ name: 'a1' });
      const agent = registry.updateStatus('a1', 'busy');
      expect(agent.status).toBe('busy');
      expect(agent.taskCount).toBe(1);
    });

    it('returns null for non-existent agent', () => {
      expect(registry.updateStatus('ghost', 'busy')).toBeNull();
    });

    it('increments taskCount only on busy', () => {
      registry.register({ name: 'a1' });
      registry.updateStatus('a1', 'idle');
      registry.updateStatus('a1', 'busy');
      registry.updateStatus('a1', 'idle');
      registry.updateStatus('a1', 'busy');
      expect(registry.get('a1').taskCount).toBe(2);
    });

    it('notifies listeners', () => {
      const listener = jest.fn();
      registry.onEvent(listener);
      registry.register({ name: 'a1' });
      registry.updateStatus('a1', 'busy');
      expect(listener).toHaveBeenCalledWith('status', expect.objectContaining({ name: 'a1', status: 'busy' }));
    });
  });

  describe('findAvailable', () => {
    it('returns idle agents', () => {
      registry.register({ name: 'a1' });
      registry.register({ name: 'a2' });
      registry.updateStatus('a2', 'busy');
      expect(registry.findAvailable()).toHaveLength(1);
      expect(registry.findAvailable()[0].name).toBe('a1');
    });

    it('filters by capabilities', () => {
      registry.register({ name: 'a1', capabilities: ['python', 'js'] });
      registry.register({ name: 'a2', capabilities: ['python'] });
      expect(registry.findAvailable(['python', 'js'])).toHaveLength(1);
      expect(registry.findAvailable(['python', 'js'])[0].name).toBe('a1');
    });
  });

  describe('onEvent', () => {
    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = registry.onEvent(listener);
      registry._notify('test', {});
      expect(listener).toHaveBeenCalled();
      unsubscribe();
      registry._notify('test', {});
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('prevents listener errors from propagating', () => {
      const badFn = () => { throw new Error('fail'); };
      registry.onEvent(badFn);
      expect(() => registry._notify('test', {})).not.toThrow();
    });
  });
});
