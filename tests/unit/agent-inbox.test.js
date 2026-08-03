jest.mock('../../src/utils/UltraWorkUtils', () => ({
  splitLines: jest.fn()
}));
jest.mock('fs');
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('12345678', 'hex'))
}));

const fs = require('fs');
const { splitLines } = require('../../src/utils/UltraWorkUtils');
const { AgentInbox, MessageBus } = require('../../src/agent/AgentInbox');

function makeMsg(overrides = {}) {
  return {
    id: 'msg_abc123',
    to: 'test-agent',
    from: 'system',
    type: 'message',
    content: 'test',
    metadata: {},
    timestamp: 1000000000000,
    read: false,
    ...overrides
  };
}

describe('AgentInbox', () => {
  const testDir = 'D:\\tmp\\inboxes';
  const agentId = 'test-agent';
  let inbox;

  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(Date, 'now').mockReturnValue(1000000000000);

    splitLines.mockImplementation((str) => {
      if (str === null || str === undefined) return [''];
      return String(str).replace(/\r\n/g, '\n').split('\n');
    });

    fs.existsSync.mockReturnValue(true);

    inbox = new AgentInbox(agentId, { inboxDir: testDir });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('sets agentId from parameter', () => {
      expect(inbox.agentId).toBe(agentId);
    });

    it('sanitizes agentId by removing special characters', () => {
      const dirty = new AgentInbox('bad/id!@#$', { inboxDir: testDir });
      expect(dirty.agentId).toBe('badid');
    });

    it('uses "unknown" for null agentId', () => {
      const inv = new AgentInbox(null, { inboxDir: testDir });
      expect(inv.agentId).toBe('unknown');
    });

    it('uses "unknown" for non-string agentId', () => {
      const inv = new AgentInbox(123, { inboxDir: testDir });
      expect(inv.agentId).toBe('unknown');
    });

    it('uses "unknown" for empty string agentId', () => {
      const inv = new AgentInbox('', { inboxDir: testDir });
      expect(inv.agentId).toBe('unknown');
    });

    it('truncates agentId to 64 characters', () => {
      const long = 'a'.repeat(100);
      const inv = new AgentInbox(long, { inboxDir: testDir });
      expect(inv.agentId.length).toBe(64);
      expect(inv.agentId).toBe('a'.repeat(64));
    });

    it('resolves inboxPath through _safePath', () => {
      expect(inbox.inboxPath).toContain(agentId);
      expect(inbox.inboxPath).toContain('.jsonl');
    });

    it('creates directory when it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      new AgentInbox('new-agent', { inboxDir: testDir });
      expect(fs.mkdirSync).toHaveBeenCalledWith(testDir, { recursive: true });
    });

    it('does not create directory when it already exists', () => {
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('accepts custom maxFileSize', () => {
      const custom = new AgentInbox('c', { inboxDir: testDir, maxFileSize: 1024 });
      expect(custom.maxFileSize).toBe(1024);
    });
  });

  describe('_safePath', () => {
    it('throws on path traversal with ".."', () => {
      expect(() => inbox._safePath('..')).toThrow('Path traversal detected');
    });
  });

  describe('write', () => {
    it('appends envelope as JSON line to inbox file', () => {
      const result = inbox.write({ content: 'hello' });

      expect(result).toMatchObject({
        id: expect.stringMatching(/^msg_/),
        to: agentId,
        from: 'system',
        type: 'message',
        content: 'hello',
        read: false
      });
      expect(result.timestamp).toBe(1000000000000);

      const writtenLine = fs.appendFileSync.mock.calls[0][1];
      const parsed = JSON.parse(writtenLine);
      expect(parsed.content).toBe('hello');
      expect(parsed.read).toBe(false);
    });

    it('accepts custom from, type, and metadata', () => {
      const result = inbox.write({
        from: 'manager',
        type: 'task',
        content: 'do work',
        metadata: { priority: 'high' }
      });

      expect(result.from).toBe('manager');
      expect(result.type).toBe('task');
      expect(result.content).toBe('do work');
      expect(result.metadata).toEqual({ priority: 'high' });
    });

    it('returns null and logs error when appendFileSync fails', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      fs.appendFileSync.mockImplementation(() => { throw new Error('disk full'); });

      const result = inbox.write({ content: 'x' });
      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('[AgentInbox] Write failed:', 'disk full');
    });
  });

  describe('read', () => {
    it('returns empty array when inbox file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(inbox.read()).toEqual([]);
    });

    it('returns messages in chronological order (oldest first)', () => {
      const old = JSON.stringify(makeMsg({ content: 'old', timestamp: 1 }));
      const mid = JSON.stringify(makeMsg({ content: 'mid', timestamp: 2 }));
      const recent = JSON.stringify(makeMsg({ content: 'recent', timestamp: 3 }));
      fs.readFileSync.mockReturnValue(`${old}\n${mid}\n${recent}\n`);

      const messages = inbox.read({ limit: 50 });
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('old');
      expect(messages[1].content).toBe('mid');
      expect(messages[2].content).toBe('recent');
    });

    it('respects limit parameter returning only newest messages', () => {
      const lines = Array.from({ length: 10 }, (_, i) =>
        JSON.stringify(makeMsg({ content: `msg${i}`, timestamp: i }))
      ).join('\n') + '\n';
      fs.readFileSync.mockReturnValue(lines);

      const messages = inbox.read({ limit: 3 });
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('msg7');
      expect(messages[2].content).toBe('msg9');
    });

    it('filters to unread messages when unreadOnly is true', () => {
      const line1 = JSON.stringify(makeMsg({ content: 'unread1', read: false }));
      const line2 = JSON.stringify(makeMsg({ content: 'read1', read: true }));
      const line3 = JSON.stringify(makeMsg({ content: 'unread2', read: false }));
      fs.readFileSync.mockReturnValue(`${line1}\n${line2}\n${line3}\n`);

      const messages = inbox.read({ unreadOnly: true });
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('unread1');
      expect(messages[1].content).toBe('unread2');
    });

    it('filters by since timestamp', () => {
      const old = JSON.stringify(makeMsg({ content: 'past', timestamp: 100 }));
      const recent = JSON.stringify(makeMsg({ content: 'future', timestamp: 200 }));
      fs.readFileSync.mockReturnValue(`${old}\n${recent}\n`);

      const messages = inbox.read({ since: 150 });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('future');
    });

    it('marks returned messages as read when markRead is true', () => {
      const line1 = JSON.stringify(makeMsg({ content: 'a', read: false }));
      const line2 = JSON.stringify(makeMsg({ content: 'b', read: false }));
      fs.readFileSync.mockReturnValue(`${line1}\n${line2}\n`);

      inbox.read({ markRead: true });

      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = fs.writeFileSync.mock.calls[0][1];
      const parsedLines = written.split('\n').filter(Boolean).map(l => JSON.parse(l));
      expect(parsedLines[0].read).toBe(true);
      expect(parsedLines[1].read).toBe(true);
    });

    it('skips malformed JSON lines', () => {
      const good = JSON.stringify(makeMsg({ content: 'valid' }));
      fs.readFileSync.mockReturnValue(`invalid json line\n${good}\n`);

      const messages = inbox.read();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('valid');
    });

    it('returns empty array and logs error on read failure', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      fs.readFileSync.mockImplementation(() => { throw new Error('permission denied'); });

      const result = inbox.read();
      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('[AgentInbox] Read failed:', 'permission denied');
    });

    it('defaults limit to 50 when limit is 0', () => {
      const lines = Array.from({ length: 60 }, (_, i) =>
        JSON.stringify(makeMsg({ content: `msg${i}`, timestamp: i }))
      ).join('\n') + '\n';
      fs.readFileSync.mockReturnValue(lines);

      const messages = inbox.read({ limit: 0 });
      expect(messages).toHaveLength(50);
    });

    it('handles empty file returning empty array', () => {
      fs.readFileSync.mockReturnValue('');
      expect(inbox.read()).toEqual([]);
    });

    it('ignores error when _markAsRead encounters a parse failure on a line', () => {
      const line1 = JSON.stringify(makeMsg({ content: 'a', read: false }));
      const line2 = JSON.stringify(makeMsg({ content: 'b', read: false }));
      fs.readFileSync
        .mockReturnValueOnce(`${line1}\n${line2}\n`)
        .mockReturnValueOnce(`INVALID_LINE\n${line2}\n`);
      splitLines
        .mockReturnValueOnce([line1, line2, ''])
        .mockReturnValueOnce(['INVALID_LINE', line2, '']);

      inbox.read({ markRead: true });

      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('returns 0 when inbox file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(inbox.getUnreadCount()).toBe(0);
    });

    it('returns count of unread messages', () => {
      const line1 = JSON.stringify(makeMsg({ read: false }));
      const line2 = JSON.stringify(makeMsg({ read: true }));
      const line3 = JSON.stringify(makeMsg({ read: false }));
      const line4 = JSON.stringify(makeMsg({ read: true }));
      fs.readFileSync.mockReturnValue(`${line1}\n${line2}\n${line3}\n${line4}\n`);

      expect(inbox.getUnreadCount()).toBe(2);
    });

    it('skips malformed lines when counting', () => {
      fs.readFileSync.mockReturnValue(`bad json\n${JSON.stringify(makeMsg({ read: false }))}\n`);

      expect(inbox.getUnreadCount()).toBe(1);
    });

    it('returns 0 on read error', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      fs.readFileSync.mockImplementation(() => { throw new Error('fail'); });

      expect(inbox.getUnreadCount()).toBe(0);
    });
  });

  describe('getLastMessage', () => {
    it('returns the last message in the inbox', () => {
      const line1 = JSON.stringify(makeMsg({ content: 'first', timestamp: 1 }));
      const line2 = JSON.stringify(makeMsg({ content: 'last', timestamp: 2 }));
      fs.readFileSync.mockReturnValue(`${line1}\n${line2}\n`);

      const msg = inbox.getLastMessage();
      expect(msg.content).toBe('last');
    });

    it('returns null when inbox file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(inbox.getLastMessage()).toBeNull();
    });

    it('returns null when file is empty', () => {
      fs.readFileSync.mockReturnValue('\n');
      expect(inbox.getLastMessage()).toBeNull();
    });

    it('returns null on read error', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      fs.readFileSync.mockImplementation(() => { throw new Error('fail'); });

      expect(inbox.getLastMessage()).toBeNull();
    });
  });

  describe('compact', () => {
    it('does nothing when file is under maxFileSize', () => {
      fs.statSync.mockReturnValue({ size: 1024 });

      inbox.compact();

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('trims to last 1000 messages when file exceeds maxFileSize', () => {
      fs.statSync.mockReturnValue({ size: 50 * 1024 * 1024 });
      const msgs = Array.from({ length: 1001 }, (_, i) =>
        JSON.stringify(makeMsg({ content: `msg${i}`, timestamp: i }))
      );
      fs.readFileSync.mockReturnValue(msgs.join('\n') + '\n');

      inbox.compact();

      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = fs.writeFileSync.mock.calls[0][1];
      const writtenLines = written.trim().split('\n').filter(Boolean);
      expect(writtenLines).toHaveLength(1000);
    });

    it('does nothing when inbox file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      inbox.compact();

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('logs compaction info', () => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      fs.statSync.mockReturnValue({ size: 50 * 1024 * 1024 });
      const msgs = Array.from({ length: 1001 }, (_, i) =>
        JSON.stringify(makeMsg({ content: `msg${i}`, timestamp: i }))
      );
      fs.readFileSync.mockReturnValue(msgs.join('\n') + '\n');

      inbox.compact();

      expect(console.log).toHaveBeenCalledWith(
        '[AgentInbox] Compacted test-agent: 1001 \u2192 1000 messages'
      );
    });

    it('does not crash on error', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      fs.statSync.mockImplementation(() => { throw new Error('fail'); });

      expect(() => inbox.compact()).not.toThrow();
    });
  });

  describe('clear', () => {
    it('writes empty string to inbox file', () => {
      inbox.clear();

      expect(fs.writeFileSync).toHaveBeenCalledWith(inbox.inboxPath, '', 'utf-8');
    });

    it('does nothing when inbox file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      inbox.clear();

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('does not crash on error', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => { throw new Error('fail'); });

      expect(() => inbox.clear()).not.toThrow();
    });
  });

  describe('delete', () => {
    it('unlinks the inbox file', () => {
      inbox.delete();

      expect(fs.unlinkSync).toHaveBeenCalledWith(inbox.inboxPath);
    });

    it('does nothing when inbox file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      inbox.delete();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('does not crash on error', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      fs.unlinkSync.mockImplementation(() => { throw new Error('fail'); });

      expect(() => inbox.delete()).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('returns total, unread count, and file size', () => {
      fs.statSync.mockReturnValue({ size: 512 });
      const line1 = JSON.stringify(makeMsg({ read: false }));
      const line2 = JSON.stringify(makeMsg({ read: true }));
      const line3 = JSON.stringify(makeMsg({ read: false }));
      fs.readFileSync.mockReturnValue(`${line1}\n${line2}\n${line3}\n`);

      const stats = inbox.getStats();
      expect(stats).toEqual({ total: 3, unread: 2, size: 512 });
    });

    it('returns zeroed stats when inbox file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      expect(inbox.getStats()).toEqual({ total: 0, unread: 0, size: 0 });
    });

    it('returns zeroed stats on error', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      fs.statSync.mockImplementation(() => { throw new Error('fail'); });

      expect(inbox.getStats()).toEqual({ total: 0, unread: 0, size: 0 });
    });
  });
});

describe('MessageBus', () => {
  const testDir = 'D:\\tmp\\inboxes';
  let bus;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1000000000000);

    splitLines.mockImplementation((str) => {
      if (str === null || str === undefined) return [''];
      return String(str).replace(/\r\n/g, '\n').split('\n');
    });

    fs.existsSync.mockReturnValue(true);
    fs.appendFileSync.mockImplementation(() => {});

    bus = new MessageBus({ inboxDir: testDir });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getInbox', () => {
    it('creates a new AgentInbox for an unknown agent', () => {
      const inbox = bus.getInbox('agent-x');
      expect(inbox).toBeInstanceOf(AgentInbox);
      expect(inbox.agentId).toBe('agent-x');
    });

    it('returns the same cached inbox for subsequent calls', () => {
      const inbox1 = bus.getInbox('agent-y');
      const inbox2 = bus.getInbox('agent-y');
      expect(inbox1).toBe(inbox2);
    });
  });

  describe('send', () => {
    it('writes message to the target agent inbox', () => {
      const envelope = bus.send('agent-z', { content: 'hello from bus' });

      expect(envelope).not.toBeNull();
      expect(envelope.to).toBe('agent-z');
      expect(envelope.content).toBe('hello from bus');
      expect(fs.appendFileSync).toHaveBeenCalled();
    });

    it('notifies subscribers of the target agent', () => {
      const callback = jest.fn();
      bus.subscribe('agent-w', callback);

      bus.send('agent-w', { content: 'ping' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].content).toBe('ping');
    });

    it('does not notify subscribers when write fails', () => {
      const callback = jest.fn();
      bus.subscribe('agent-v', callback);
      fs.appendFileSync.mockImplementation(() => { throw new Error('fail'); });

      const result = bus.send('agent-v', { content: 'test' });

      expect(result).toBeNull();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('sends message to all channel members', () => {
      bus.joinChannel('alerts', 'agent-a');
      bus.joinChannel('alerts', 'agent-b');
      bus.joinChannel('alerts', 'agent-c');

      const results = bus.broadcast('alerts', { content: 'emergency' });

      expect(results).toHaveLength(3);
    });

    it('excludes specified agents from broadcast', () => {
      bus.joinChannel('team', 'alice');
      bus.joinChannel('team', 'bob');
      bus.joinChannel('team', 'charlie');

      const results = bus.broadcast('team', { content: 'meeting' }, ['bob']);

      expect(results).toHaveLength(2);
    });

    it('returns empty array for non-existent channel', () => {
      expect(bus.broadcast('ghost', { content: 'x' })).toEqual([]);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('subscribe registers a callback for an agent', () => {
      const cb = jest.fn();
      bus.subscribe('agent-s', cb);
      bus.send('agent-s', { content: 'hello' });

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe removes a registered callback', () => {
      const cb = jest.fn();
      bus.subscribe('agent-r', cb);
      bus.unsubscribe('agent-r', cb);
      bus.send('agent-r', { content: 'hello' });

      expect(cb).not.toHaveBeenCalled();
    });

    it('unsubscribe does not throw for non-existent agent', () => {
      expect(() => bus.unsubscribe('no-such-agent', () => {})).not.toThrow();
    });

    it('unsubscribe does not throw for non-existent callback', () => {
      bus.subscribe('agent-q', () => {});
      expect(() => bus.unsubscribe('agent-q', () => {})).not.toThrow();
    });

    it('handles subscriber errors without crashing', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      bus.subscribe('agent-e', () => { throw new Error('oops'); });

      expect(() => bus.send('agent-e', { content: 'test' })).not.toThrow();
      expect(console.error).toHaveBeenCalledWith('[MessageBus] Subscriber error:', 'oops');
    });
  });

  describe('channels', () => {
    it('joinChannel adds agent to a channel', () => {
      bus.joinChannel('room1', 'agent1');
      expect(bus.getChannelMembers('room1')).toEqual(['agent1']);
    });

    it('leaveChannel removes agent from a channel', () => {
      bus.joinChannel('room2', 'agent1');
      bus.joinChannel('room2', 'agent2');
      bus.leaveChannel('room2', 'agent1');

      expect(bus.getChannelMembers('room2')).toEqual(['agent2']);
    });

    it('getChannelMembers returns empty array for unknown channel', () => {
      expect(bus.getChannelMembers('nonexistent')).toEqual([]);
    });

    it('leaveChannel does not throw for non-existent channel', () => {
      expect(() => bus.leaveChannel('ghost', 'agent1')).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('compacts all inboxes and clears all internal state', () => {
      fs.statSync.mockReturnValue({ size: 1024 });

      bus.getInbox('agent-d1');
      bus.getInbox('agent-d2');
      bus.subscribe('agent-d1', () => {});
      bus.joinChannel('ch', 'agent-d1');

      bus.destroy();

      expect(bus.inboxes.size).toBe(0);
      expect(bus.subscribers.size).toBe(0);
      expect(bus.channels.size).toBe(0);
    });
  });
});
