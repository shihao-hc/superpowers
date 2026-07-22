'use strict';

const { SessionInjector, PeerToPeerCommunicator } = require('../../src/agent/SessionInjector');

describe('SessionInjector', () => {
  let injector;

  beforeEach(() => {
    injector = new SessionInjector();
  });

  describe('constructor', () => {
    it('should set default values', () => {
      expect(injector.sessions).toBeInstanceOf(Map);
      expect(injector.injectionQueue).toBeInstanceOf(Map);
      expect(injector.maxQueueSize).toBe(100);
      expect(injector._processing).toBe(false);
    });

    it('should accept custom maxQueueSize', () => {
      const custom = new SessionInjector({ maxQueueSize: 50 });
      expect(custom.maxQueueSize).toBe(50);
    });
  });

  describe('createSession', () => {
    it('should create a session with default config', () => {
      const spy = jest.spyOn(injector, 'emit');
      const session = injector.createSession('agent1');

      expect(session.id).toMatch(/^sess_agent1_/);
      expect(session.agentId).toBe('agent1');
      expect(session.status).toBe('active');
      expect(session.context).toEqual([]);
      expect(session.maxContext).toBe(50);
      expect(session.injectionCount).toBe(0);
      expect(typeof session.createdAt).toBe('number');
      expect(typeof session.lastActivity).toBe('number');
      expect(injector.sessions.get(session.id)).toBe(session);
      expect(injector.injectionQueue.get(session.id)).toEqual([]);
      expect(spy).toHaveBeenCalledWith('session:created', session);
    });

    it('should create a session with custom maxContext', () => {
      const session = injector.createSession('agent2', { maxContext: 10 });
      expect(session.maxContext).toBe(10);
    });
  });

  describe('injectMessage', () => {
    it('should inject a message into an active session', () => {
      const spy = jest.spyOn(injector, 'emit');
      const session = injector.createSession('agent1');
      const msg = { type: 'text', role: 'user', content: 'hello', metadata: { source: 'test' } };
      const injection = injector.injectMessage(session.id, msg);

      expect(injection).toBeDefined();
      expect(injection.id).toMatch(/^inj_/);
      expect(injection.sessionId).toBe(session.id);
      expect(injection.type).toBe('text');
      expect(injection.role).toBe('user');
      expect(injection.content).toBe('hello');
      expect(injection.metadata).toEqual({ source: 'test' });
      expect(injection.delivered).toBe(true);

      const queue = injector.injectionQueue.get(session.id);
      expect(queue).toHaveLength(1);
      expect(queue[0]).toBe(injection);

      expect(session.context).toHaveLength(1);
      expect(session.context[0]).toEqual({ role: 'user', content: 'hello', timestamp: injection.timestamp });
      expect(session.injectionCount).toBe(1);
      expect(spy).toHaveBeenCalledWith('message:injected', { session, injection });
    });

    it('should use defaults for type/role/metadata when not provided', () => {
      const session = injector.createSession('agent1');
      const injection = injector.injectMessage(session.id, { content: 'test' });

      expect(injection.type).toBe('message');
      expect(injection.role).toBe('system');
      expect(injection.metadata).toEqual({});
    });

    it('should return null for non-existent session', () => {
      const result = injector.injectMessage('nonexistent', { content: 'test' });
      expect(result).toBeNull();
    });

    it('should return null for inactive session', () => {
      const session = injector.createSession('agent1');
      injector.closeSession(session.id);
      const result = injector.injectMessage(session.id, { content: 'test' });
      expect(result).toBeNull();
    });

    it('should shift earliest item when queue exceeds maxQueueSize', () => {
      const small = new SessionInjector({ maxQueueSize: 3 });
      const session = small.createSession('agent1');
      small.injectMessage(session.id, { content: 'msg1' });
      small.injectMessage(session.id, { content: 'msg2' });
      small.injectMessage(session.id, { content: 'msg3' });
      small.injectMessage(session.id, { content: 'msg4' });

      const queue = small.injectionQueue.get(session.id);
      expect(queue).toHaveLength(3);
      expect(queue[0].content).toBe('msg2');
      expect(queue[1].content).toBe('msg3');
      expect(queue[2].content).toBe('msg4');
    });

    it('should trim context when exceeding maxContext', () => {
      const session = injector.createSession('agent1', { maxContext: 2 });
      injector.injectMessage(session.id, { content: 'a' });
      injector.injectMessage(session.id, { content: 'b' });
      injector.injectMessage(session.id, { content: 'c' });

      expect(session.context).toHaveLength(2);
      expect(session.context[0].content).toBe('b');
      expect(session.context[1].content).toBe('c');
    });
  });

  describe('_processQueue', () => {
    it('should deliver pending injections when called from injectMessage', () => {
      const spy = jest.spyOn(injector, 'emit');
      const session = injector.createSession('agent1');
      injector.injectMessage(session.id, { content: 'test' });

      expect(spy).toHaveBeenCalledWith('message:delivered', expect.objectContaining({
        sessionId: session.id,
        agentId: session.agentId
      }));
    });

    it('should return early for empty queue', () => {
      const session = injector.createSession('agent1');
      injector.injectionQueue.set(session.id, []);
      const spy = jest.spyOn(injector, 'emit');
      injector._processQueue(session.id);
      expect(spy).not.toHaveBeenCalledWith('message:delivered', expect.anything());
    });

    it('should return early when session not found', () => {
      injector.injectionQueue.set('ghost', [{ id: 'x', delivered: false }]);
      const spy = jest.spyOn(injector, 'emit');
      injector._processQueue('ghost');
      expect(spy).not.toHaveBeenCalledWith('message:delivered', expect.anything());
    });

    it('should return early when session is inactive', () => {
      const session = injector.createSession('agent1');
      injector.closeSession(session.id);
      injector.injectionQueue.set(session.id, [{ id: 'x', delivered: false }]);
      const spy = jest.spyOn(injector, 'emit');
      injector._processQueue(session.id);
      expect(spy).not.toHaveBeenCalledWith('message:delivered', expect.anything());
    });

    it('should process only undelivered items', () => {
      const session = injector.createSession('agent1');
      const pending = { id: 'p1', delivered: false };
      const done = { id: 'd1', delivered: true };
      injector.injectionQueue.set(session.id, [done, pending]);
      const spy = jest.spyOn(injector, 'emit');
      injector._processQueue(session.id);

      expect(pending.delivered).toBe(true);
      expect(spy).toHaveBeenCalledWith('message:delivered', expect.objectContaining({ injection: pending }));
      expect(spy).not.toHaveBeenCalledWith('message:delivered', expect.objectContaining({ injection: done }));
    });
  });

  describe('getSession', () => {
    it('should return session by id', () => {
      const session = injector.createSession('agent1');
      expect(injector.getSession(session.id)).toBe(session);
    });

    it('should return null for missing session', () => {
      expect(injector.getSession('absent')).toBeUndefined();
    });
  });

  describe('getSessionByAgent', () => {
    it('should return the first active session for an agent', () => {
      injector.createSession('agent1');
      injector.createSession('agent1');
      const result = injector.getSessionByAgent('agent1');
      expect(result.agentId).toBe('agent1');
      expect(result.status).toBe('active');
    });

    it('should return null when agent has no active sessions', () => {
      const s = injector.createSession('agent1');
      injector.closeSession(s.id);
      expect(injector.getSessionByAgent('agent1')).toBeNull();
    });

    it('should return null when agent has no sessions at all', () => {
      expect(injector.getSessionByAgent('unknown')).toBeNull();
    });
  });

  describe('getContext', () => {
    it('should return recent context entries', () => {
      const session = injector.createSession('agent1');
      injector.injectMessage(session.id, { content: 'first' });
      injector.injectMessage(session.id, { content: 'second' });
      expect(injector.getContext(session.id)).toHaveLength(2);
    });

    it('should respect the limit parameter', () => {
      const session = injector.createSession('agent1');
      injector.injectMessage(session.id, { content: 'a' });
      injector.injectMessage(session.id, { content: 'b' });
      const ctx = injector.getContext(session.id, 1);
      expect(ctx).toHaveLength(1);
      expect(ctx[0].content).toBe('b');
    });

    it('should return empty array for missing session', () => {
      expect(injector.getContext('nowhere')).toEqual([]);
    });
  });

  describe('getPendingInjections', () => {
    it('should return only undelivered injections', () => {
      const session = injector.createSession('agent1');
      injector.closeSession(session.id);
      injector.injectionQueue.set(session.id, [{ id: 'x', delivered: false }]);
      const pending = injector.getPendingInjections(session.id);
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('x');
    });

    it('should return empty array for missing session', () => {
      expect(injector.getPendingInjections('nowhere')).toEqual([]);
    });
  });

  describe('closeSession', () => {
    it('should close an active session', () => {
      const spy = jest.spyOn(injector, 'emit');
      const session = injector.createSession('agent1');
      const result = injector.closeSession(session.id);

      expect(result).toBe(true);
      expect(session.status).toBe('closed');
      expect(injector.injectionQueue.has(session.id)).toBe(false);
      expect(spy).toHaveBeenCalledWith('session:closed', session);
    });

    it('should return false for non-existent session', () => {
      expect(injector.closeSession('nowhere')).toBe(false);
    });
  });

  describe('closeAllSessions', () => {
    it('should close all sessions for a given agent', () => {
      injector.createSession('agent1');
      injector.createSession('agent2');
      injector.createSession('agent3');
      const closed = injector.closeAllSessions('agent1');
      expect(closed).toBe(1);
    });

    it('should return 0 when agent has no sessions', () => {
      expect(injector.closeAllSessions('nobody')).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return aggregated stats', () => {
      injector.createSession('agent1');
      const s2 = injector.createSession('agent2');
      injector.injectMessage(s2.id, { content: 'x' });
      injector.closeSession(s2.id);

      const stats = injector.getStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.totalInjections).toBe(1);
    });

    it('should return zeros for empty injector', () => {
      const stats = injector.getStats();
      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.totalInjections).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should close all sessions and clear state', () => {
      const closeSpy = jest.spyOn(injector, 'closeSession');
      const removeSpy = jest.spyOn(injector, 'removeAllListeners');

      injector.createSession('agent1');
      injector.createSession('agent2');
      injector.destroy();

      expect(closeSpy).toHaveBeenCalledTimes(2);
      expect(injector.sessions.size).toBe(0);
      expect(injector.injectionQueue.size).toBe(0);
      expect(removeSpy).toHaveBeenCalled();
    });
  });
});

describe('PeerToPeerCommunicator', () => {
  let p2p;

  beforeEach(() => {
    p2p = new PeerToPeerCommunicator();
  });

  describe('constructor', () => {
    it('should set default values', () => {
      expect(p2p.agents).toBeInstanceOf(Map);
      expect(p2p.channels).toBeInstanceOf(Map);
      expect(p2p.messageHistory).toBeInstanceOf(Map);
      expect(p2p.maxHistory).toBe(100);
      expect(typeof p2p._onMessage).toBe('function');
    });

    it('should accept custom maxHistory and onMessage', () => {
      const handler = jest.fn();
      const custom = new PeerToPeerCommunicator({ maxHistory: 50, onMessage: handler });
      expect(custom.maxHistory).toBe(50);
      expect(custom._onMessage).toBe(handler);
    });
  });

  describe('registerAgent', () => {
    it('should register an agent', () => {
      p2p.registerAgent('alice', ['read', 'write']);
      const agent = p2p.agents.get('alice');
      expect(agent).toBeDefined();
      expect(agent.id).toBe('alice');
      expect(agent.capabilities).toEqual(['read', 'write']);
      expect(agent.status).toBe('online');
      expect(p2p.messageHistory.has('alice')).toBe(true);
    });
  });

  describe('unregisterAgent', () => {
    it('should remove agent and its history', () => {
      p2p.registerAgent('alice');
      p2p.createChannel('general', 'alice');
      p2p.unregisterAgent('alice');

      expect(p2p.agents.has('alice')).toBe(false);
      expect(p2p.messageHistory.has('alice')).toBe(false);
      expect(p2p.getChannelMembers('general')).toEqual([]);
    });
  });

  describe('sendDirect', () => {
    it('should send a direct message', () => {
      const handler = jest.fn();
      const p2p2 = new PeerToPeerCommunicator({ onMessage: handler });
      p2p2.registerAgent('alice');
      p2p2.registerAgent('bob');

      const result = p2p2.sendDirect('alice', 'bob', 'hello');
      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^p2p_/);

      const aliceHistory = p2p2.getHistory('alice');
      const bobHistory = p2p2.getHistory('bob');
      expect(aliceHistory).toHaveLength(1);
      expect(bobHistory).toHaveLength(1);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'direct',
        from: 'alice',
        to: 'bob',
        content: 'hello'
      }));
    });

    it('should fail when sender does not exist', () => {
      p2p.registerAgent('bob');
      const result = p2p.sendDirect('alice', 'bob', 'hello');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent not found');
    });

    it('should fail when recipient does not exist', () => {
      p2p.registerAgent('alice');
      const result = p2p.sendDirect('alice', 'bob', 'hello');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent not found');
    });
  });

  describe('broadcast', () => {
    it('should send to all online agents except sender', () => {
      p2p.registerAgent('alice');
      p2p.registerAgent('bob');
      p2p.registerAgent('charlie');

      const result = p2p.broadcast('alice', 'hello everyone');
      expect(result.success).toBe(true);
      expect(result.sent).toBe(2);
      expect(result.results).toHaveLength(2);
    });

    it('should exclude specified agent ids', () => {
      p2p.registerAgent('alice');
      p2p.registerAgent('bob');
      p2p.registerAgent('charlie');

      const result = p2p.broadcast('alice', 'hello', ['bob']);
      expect(result.sent).toBe(1);
    });

    it('should fail when sender is not registered', () => {
      const result = p2p.broadcast('ghost', 'hello');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Sender not found');
    });

    it('should skip offline agents', () => {
      p2p.registerAgent('alice');
      p2p.registerAgent('bob');
      p2p.agents.get('bob').status = 'offline';

      const result = p2p.broadcast('alice', 'hello');
      expect(result.sent).toBe(0);
    });
  });

  describe('channel management', () => {
    it('should create a channel', () => {
      p2p.registerAgent('alice');
      const result = p2p.createChannel('general', 'alice');
      expect(result.success).toBe(true);
      expect(result.channelId).toBe('general');
      expect(p2p.getChannelMembers('general')).toEqual(['alice']);
    });

    it('should fail creating duplicate channel', () => {
      p2p.registerAgent('alice');
      p2p.createChannel('general', 'alice');
      const result = p2p.createChannel('general', 'alice');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Channel exists');
    });

    it('should allow agents to join and leave channels', () => {
      p2p.registerAgent('alice');
      p2p.registerAgent('bob');
      p2p.createChannel('general', 'alice');

      expect(p2p.joinChannel('general', 'bob')).toEqual({ success: true });
      expect(p2p.getChannelMembers('general')).toContain('bob');

      expect(p2p.leaveChannel('general', 'bob')).toEqual({ success: true });
      expect(p2p.getChannelMembers('general')).not.toContain('bob');
    });

    it('should silently succeed leaving non-existent channel', () => {
      expect(p2p.leaveChannel('phantom', 'alice')).toEqual({ success: true });
    });

    it('should fail joining non-existent channel', () => {
      p2p.registerAgent('alice');
      expect(p2p.joinChannel('ghost', 'alice')).toEqual({ success: false, error: 'Channel not found' });
    });
  });

  describe('sendToChannel', () => {
    it('should send message to all channel members except sender', () => {
      const handler = jest.fn();
      const p2p2 = new PeerToPeerCommunicator({ onMessage: handler });
      p2p2.registerAgent('alice');
      p2p2.registerAgent('bob');
      p2p2.registerAgent('charlie');
      p2p2.createChannel('general', 'alice');
      p2p2.joinChannel('general', 'bob');
      p2p2.joinChannel('general', 'charlie');

      const result = p2p2.sendToChannel('alice', 'general', 'hi team');
      expect(result.success).toBe(true);
      expect(result.sent).toBe(2);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should fail when sender is not registered', () => {
      const result = p2p.sendToChannel('ghost', 'general', 'hi');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Sender not found');
    });

    it('should fail when channel does not exist', () => {
      p2p.registerAgent('alice');
      const result = p2p.sendToChannel('alice', 'ghost', 'hi');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Channel not found');
    });

    it('should fail when sender is not in channel', () => {
      p2p.registerAgent('alice');
      p2p.registerAgent('bob');
      p2p.createChannel('general', 'bob');
      const result = p2p.sendToChannel('alice', 'general', 'hi');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not in channel');
    });
  });

  describe('getHistory', () => {
    it('should return message history for an agent', () => {
      p2p.registerAgent('alice');
      p2p.registerAgent('bob');
      p2p.sendDirect('alice', 'bob', 'msg1');
      p2p.sendDirect('alice', 'bob', 'msg2');

      expect(p2p.getHistory('bob')).toHaveLength(2);
      expect(p2p.getHistory('bob', 1)).toHaveLength(1);
    });

    it('should return empty array for unknown agent', () => {
      expect(p2p.getHistory('ghost')).toEqual([]);
    });

    it('should cap history at maxHistory', () => {
      const small = new PeerToPeerCommunicator({ maxHistory: 3 });
      small.registerAgent('alice');
      small.registerAgent('bob');
      for (let i = 0; i < 5; i++) {
        small.sendDirect('alice', 'bob', `msg${i}`);
      }
      expect(small.getHistory('bob')).toHaveLength(3);
    });
  });

  describe('getAgentStatus', () => {
    it('should return agent status', () => {
      p2p.registerAgent('alice');
      const status = p2p.getAgentStatus('alice');
      expect(status).toBeDefined();
      expect(status.status).toBe('online');
    });

    it('should return null for unknown agent', () => {
      expect(p2p.getAgentStatus('ghost')).toBeNull();
    });
  });

  describe('getOnlineAgents', () => {
    it('should return only online agents', () => {
      p2p.registerAgent('alice');
      p2p.registerAgent('bob');
      p2p.agents.get('bob').status = 'offline';

      const online = p2p.getOnlineAgents();
      expect(online).toHaveLength(1);
      expect(online[0].id).toBe('alice');
    });
  });

  describe('getChannelMembers', () => {
    it('should return channel members', () => {
      p2p.registerAgent('alice');
      p2p.createChannel('general', 'alice');
      expect(p2p.getChannelMembers('general')).toEqual(['alice']);
    });

    it('should return empty array for non-existent channel', () => {
      expect(p2p.getChannelMembers('ghost')).toEqual([]);
    });
  });

  describe('destroy', () => {
    it('should clear all state', () => {
      p2p.registerAgent('alice');
      p2p.createChannel('general', 'alice');
      p2p.destroy();

      expect(p2p.agents.size).toBe(0);
      expect(p2p.channels.size).toBe(0);
      expect(p2p.messageHistory.size).toBe(0);
    });
  });
});
