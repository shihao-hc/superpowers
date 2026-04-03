const crypto = require('crypto');
const { EventEmitter } = require('events');

class SessionInjector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessions = new Map();
    this.injectionQueue = new Map();
    this.maxQueueSize = options.maxQueueSize || 100;
    this._processing = false;
  }

  createSession(agentId, sessionConfig = {}) {
    const sessionId = `sess_${agentId}_${Date.now().toString(36)}`;

    const session = {
      id: sessionId,
      agentId,
      status: 'active',
      context: [],
      maxContext: sessionConfig.maxContext || 50,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      injectionCount: 0
    };

    this.sessions.set(sessionId, session);
    this.injectionQueue.set(sessionId, []);

    this.emit('session:created', session);
    return session;
  }

  injectMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (session.status !== 'active') {
      return null;
    }

    const injection = {
      id: `inj_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      sessionId,
      type: message.type || 'message',
      role: message.role || 'system',
      content: message.content,
      metadata: message.metadata || {},
      timestamp: Date.now(),
      delivered: false
    };

    const queue = this.injectionQueue.get(sessionId);
    if (queue.length >= this.maxQueueSize) {
      queue.shift();
    }
    queue.push(injection);

    session.context.push({
      role: injection.role,
      content: injection.content,
      timestamp: injection.timestamp
    });

    if (session.context.length > session.maxContext) {
      session.context = session.context.slice(-session.maxContext);
    }

    session.injectionCount++;
    session.lastActivity = Date.now();

    this.emit('message:injected', { session, injection });
    this._processQueue(sessionId);

    return injection;
  }

  _processQueue(sessionId) {
    const queue = this.injectionQueue.get(sessionId);
    if (!queue || queue.length === 0) return;

    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') return;

    const pending = queue.filter(inj => !inj.delivered);

    for (const injection of pending) {
      injection.delivered = true;

      this.emit('message:delivered', {
        sessionId,
        agentId: session.agentId,
        injection
      });
    }
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getSessionByAgent(agentId) {
    for (const [sessionId, session] of this.sessions) {
      if (session.agentId === agentId && session.status === 'active') {
        return session;
      }
    }
    return null;
  }

  getContext(sessionId, limit = 20) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.context.slice(-limit);
  }

  getPendingInjections(sessionId) {
    const queue = this.injectionQueue.get(sessionId);
    return queue ? queue.filter(inj => !inj.delivered) : [];
  }

  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'closed';
      this.injectionQueue.delete(sessionId);
      this.emit('session:closed', session);
      return true;
    }
    return false;
  }

  closeAllSessions(agentId) {
    const toClose = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.agentId === agentId) {
        toClose.push(sessionId);
      }
    }

    let closed = 0;
    for (const sessionId of toClose) {
      if (this.closeSession(sessionId)) {
        closed++;
      }
    }
    return closed;
  }

  getStats() {
    const sessions = Array.from(this.sessions.values());
    return {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'active').length,
      totalInjections: sessions.reduce((sum, s) => sum + s.injectionCount, 0)
    };
  }

  destroy() {
    for (const [sessionId] of this.sessions) {
      this.closeSession(sessionId);
    }
    this.sessions.clear();
    this.injectionQueue.clear();
    this.removeAllListeners();
  }
}

class PeerToPeerCommunicator {
  constructor(options = {}) {
    this.agents = new Map();
    this.channels = new Map();
    this.messageHistory = new Map();
    this.maxHistory = options.maxHistory || 100;
    this._onMessage = options.onMessage || (() => {});
  }

  registerAgent(agentId, capabilities = []) {
    this.agents.set(agentId, {
      id: agentId,
      capabilities,
      status: 'online',
      registeredAt: Date.now(),
      lastSeen: Date.now()
    });

    this.messageHistory.set(agentId, []);
  }

  unregisterAgent(agentId) {
    this.agents.delete(agentId);
    this.messageHistory.delete(agentId);

    for (const [, members] of this.channels) {
      members.delete(agentId);
    }
  }

  sendDirect(fromId, toId, message) {
    const from = this.agents.get(fromId);
    const to = this.agents.get(toId);

    if (!from || !to) {
      return { success: false, error: 'Agent not found' };
    }

    const envelope = {
      id: `p2p_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      type: 'direct',
      from: fromId,
      to: toId,
      content: message,
      timestamp: Date.now()
    };

    this._addToHistory(fromId, envelope);
    this._addToHistory(toId, envelope);

    this._onMessage(envelope);

    return { success: true, messageId: envelope.id };
  }

  broadcast(fromId, message, excludeIds = []) {
    const from = this.agents.get(fromId);
    if (!from) return { success: false, error: 'Sender not found' };

    const results = [];

    for (const [agentId, agent] of this.agents) {
      if (agentId === fromId || excludeIds.includes(agentId)) continue;
      if (agent.status !== 'online') continue;

      const result = this.sendDirect(fromId, agentId, message);
      results.push({ agentId, ...result });
    }

    return { success: true, sent: results.length, results };
  }

  createChannel(channelId, creatorId) {
    if (this.channels.has(channelId)) {
      return { success: false, error: 'Channel exists' };
    }

    this.channels.set(channelId, new Set([creatorId]));

    return { success: true, channelId };
  }

  joinChannel(channelId, agentId) {
    const channel = this.channels.get(channelId);
    if (!channel) return { success: false, error: 'Channel not found' };

    channel.add(agentId);
    return { success: true };
  }

  leaveChannel(channelId, agentId) {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.delete(agentId);
    }
    return { success: true };
  }

  sendToChannel(fromId, channelId, message) {
    const from = this.agents.get(fromId);
    const channel = this.channels.get(channelId);

    if (!from) return { success: false, error: 'Sender not found' };
    if (!channel) return { success: false, error: 'Channel not found' };
    if (!channel.has(fromId)) return { success: false, error: 'Not in channel' };

    const results = [];

    for (const agentId of channel) {
      if (agentId === fromId) continue;

      const envelope = {
        id: `ch_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
        type: 'channel',
        channel: channelId,
        from: fromId,
        to: agentId,
        content: message,
        timestamp: Date.now()
      };

      this._addToHistory(agentId, envelope);
      this._onMessage(envelope);

      results.push({ agentId, success: true });
    }

    return { success: true, sent: results.length };
  }

  _addToHistory(agentId, envelope) {
    const history = this.messageHistory.get(agentId);
    if (!history) return;

    history.push(envelope);
    if (history.length > this.maxHistory) {
      this.messageHistory.set(agentId, history.slice(-this.maxHistory));
    }
  }

  getHistory(agentId, limit = 50) {
    const history = this.messageHistory.get(agentId) || [];
    return history.slice(-limit);
  }

  getAgentStatus(agentId) {
    return this.agents.get(agentId) || null;
  }

  getOnlineAgents() {
    return Array.from(this.agents.values()).filter(a => a.status === 'online');
  }

  getChannelMembers(channelId) {
    const channel = this.channels.get(channelId);
    return channel ? Array.from(channel) : [];
  }

  destroy() {
    this.agents.clear();
    this.channels.clear();
    this.messageHistory.clear();
  }
}

module.exports = { SessionInjector, PeerToPeerCommunicator };
