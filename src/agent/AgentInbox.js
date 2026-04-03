const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentInbox {
  constructor(agentId, options = {}) {
    this.agentId = this._sanitizeId(agentId);
    this.inboxDir = path.resolve(options.inboxDir || './data/inboxes');
    this.inboxPath = this._safePath(`${this.agentId}.jsonl`);
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024;
    this._ensureDir();
  }

  _sanitizeId(id) {
    if (!id || typeof id !== 'string') return 'unknown';
    return id.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
  }

  _safePath(filename) {
    const sanitized = filename.replace(/[^a-zA-Z0-9_.-]/g, '');
    const resolved = path.resolve(this.inboxDir, sanitized);
    if (!resolved.startsWith(this.inboxDir)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  _ensureDir() {
    if (!fs.existsSync(this.inboxDir)) {
      fs.mkdirSync(this.inboxDir, { recursive: true });
    }
  }

  write(message) {
    const envelope = {
      id: `msg_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      to: this.agentId,
      from: message.from || 'system',
      type: message.type || 'message',
      content: message.content,
      metadata: message.metadata || {},
      timestamp: Date.now(),
      read: false
    };

    const line = JSON.stringify(envelope) + '\n';

    try {
      fs.appendFileSync(this.inboxPath, line, 'utf-8');
      return envelope;
    } catch (error) {
      console.error('[AgentInbox] Write failed:', error.message);
      return null;
    }
  }

  read(options = {}) {
    const limit = options.limit || 50;
    const unreadOnly = options.unreadOnly || false;
    const since = options.since || 0;

    try {
      if (!fs.existsSync(this.inboxPath)) {
        return [];
      }

      const content = fs.readFileSync(this.inboxPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      const messages = [];
      const indices = [];

      for (let i = lines.length - 1; i >= 0 && messages.length < limit; i--) {
        try {
          const msg = JSON.parse(lines[i]);

          if (msg.timestamp < since) continue;
          if (unreadOnly && msg.read) continue;

          messages.push(msg);
          indices.push(i);
        } catch (e) {
          continue;
        }
      }

      if (options.markRead && indices.length > 0) {
        this._markAsRead(indices);
      }

      return messages.reverse();
    } catch (error) {
      console.error('[AgentInbox] Read failed:', error.message);
      return [];
    }
  }

  _markAsRead(indices) {
    try {
      const content = fs.readFileSync(this.inboxPath, 'utf-8');
      const lines = content.split('\n');

      for (const idx of indices) {
        if (lines[idx]) {
          try {
            const msg = JSON.parse(lines[idx]);
            msg.read = true;
            lines[idx] = JSON.stringify(msg);
          } catch (e) {}
        }
      }

      fs.writeFileSync(this.inboxPath, lines.join('\n'), 'utf-8');
    } catch (error) {
      console.error('[AgentInbox] Mark read failed:', error.message);
    }
  }

  getUnreadCount() {
    try {
      if (!fs.existsSync(this.inboxPath)) return 0;

      const content = fs.readFileSync(this.inboxPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      let count = 0;
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (!msg.read) count++;
        } catch (e) {}
      }

      return count;
    } catch (error) {
      return 0;
    }
  }

  getLastMessage() {
    try {
      if (!fs.existsSync(this.inboxPath)) return null;

      const content = fs.readFileSync(this.inboxPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      if (lines.length === 0) return null;

      return JSON.parse(lines[lines.length - 1]);
    } catch (error) {
      return null;
    }
  }

  compact() {
    try {
      if (!fs.existsSync(this.inboxPath)) return;

      const stats = fs.statSync(this.inboxPath);
      if (stats.size < this.maxFileSize) return;

      const content = fs.readFileSync(this.inboxPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      const recent = lines.slice(-1000);

      const compacted = recent.join('\n') + '\n';
      fs.writeFileSync(this.inboxPath, compacted, 'utf-8');

      console.log(`[AgentInbox] Compacted ${this.agentId}: ${lines.length} → ${recent.length} messages`);
    } catch (error) {
      console.error('[AgentInbox] Compact failed:', error.message);
    }
  }

  clear() {
    try {
      if (fs.existsSync(this.inboxPath)) {
        fs.writeFileSync(this.inboxPath, '', 'utf-8');
      }
    } catch (error) {
      console.error('[AgentInbox] Clear failed:', error.message);
    }
  }

  delete() {
    try {
      if (fs.existsSync(this.inboxPath)) {
        fs.unlinkSync(this.inboxPath);
      }
    } catch (error) {
      console.error('[AgentInbox] Delete failed:', error.message);
    }
  }

  getStats() {
    try {
      if (!fs.existsSync(this.inboxPath)) {
        return { total: 0, unread: 0, size: 0 };
      }

      const stats = fs.statSync(this.inboxPath);
      const content = fs.readFileSync(this.inboxPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      let unread = 0;
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (!msg.read) unread++;
        } catch (e) {}
      }

      return {
        total: lines.length,
        unread,
        size: stats.size
      };
    } catch (error) {
      return { total: 0, unread: 0, size: 0 };
    }
  }
}

class MessageBus {
  constructor(options = {}) {
    this.inboxDir = options.inboxDir || './data/inboxes';
    this.inboxes = new Map();
    this.subscribers = new Map();
    this.channels = new Map();
    this._watchers = new Map();
  }

  getInbox(agentId) {
    if (!this.inboxes.has(agentId)) {
      this.inboxes.set(agentId, new AgentInbox(agentId, {
        inboxDir: this.inboxDir
      }));
    }
    return this.inboxes.get(agentId);
  }

  send(toAgentId, message) {
    const inbox = this.getInbox(toAgentId);
    const envelope = inbox.write(message);

    if (envelope) {
      this._notifySubscribers(toAgentId, envelope);
    }

    return envelope;
  }

  broadcast(channel, message, excludeAgents = []) {
    const channelAgents = this.channels.get(channel) || [];
    const results = [];

    for (const agentId of channelAgents) {
      if (excludeAgents.includes(agentId)) continue;
      const result = this.send(agentId, {
        ...message,
        metadata: { ...message.metadata, channel }
      });
      results.push(result);
    }

    return results;
  }

  subscribe(agentId, callback) {
    if (!this.subscribers.has(agentId)) {
      this.subscribers.set(agentId, []);
    }
    this.subscribers.get(agentId).push(callback);
  }

  unsubscribe(agentId, callback) {
    const subs = this.subscribers.get(agentId);
    if (subs) {
      const idx = subs.indexOf(callback);
      if (idx > -1) subs.splice(idx, 1);
    }
  }

  _notifySubscribers(agentId, envelope) {
    const subs = this.subscribers.get(agentId) || [];
    for (const callback of subs) {
      try {
        callback(envelope);
      } catch (e) {
        console.error('[MessageBus] Subscriber error:', e.message);
      }
    }
  }

  joinChannel(channel, agentId) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel).add(agentId);
  }

  leaveChannel(channel, agentId) {
    const ch = this.channels.get(channel);
    if (ch) {
      ch.delete(agentId);
    }
  }

  getChannelMembers(channel) {
    return Array.from(this.channels.get(channel) || []);
  }

  destroy() {
    for (const [agentId, inbox] of this.inboxes) {
      inbox.compact();
    }
    this.inboxes.clear();
    this.subscribers.clear();
    this.channels.clear();
  }
}

module.exports = { AgentInbox, MessageBus };
