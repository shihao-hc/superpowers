const {
  MessageService,
  BoundedUUIDSet,
  FlushGate,
  CommandQueue
} = require('../../src/agent/MessageService');

// ========== BoundedUUIDSet ==========
describe('BoundedUUIDSet', () => {
  let set;

  beforeEach(() => {
    set = new BoundedUUIDSet(5);
  });

  it('adds and checks presence', () => {
    expect(set.add('a')).toBe(true);
    expect(set.has('a')).toBe(true);
    expect(set.contains('a')).toBe(true);
  });

  it('rejects duplicates', () => {
    set.add('a');
    expect(set.add('a')).toBe(false);
  });

  it('evicts oldest when at capacity', () => {
    set.add('a'); set.add('b'); set.add('c'); set.add('d'); set.add('e');
    expect(set.size()).toBe(5);
    set.add('f');
    expect(set.size()).toBe(5);
    expect(set.has('a')).toBe(false);
    expect(set.has('f')).toBe(true);
  });

  it('returns correct size and capacity', () => {
    expect(set.size()).toBe(0);
    expect(set.getCapacity()).toBe(5);
    expect(set.isEmpty()).toBe(true);
    set.add('x');
    expect(set.isEmpty()).toBe(false);
  });

  it('clears all entries', () => {
    set.add('a'); set.add('b');
    set.clear();
    expect(set.size()).toBe(0);
    expect(set.isEmpty()).toBe(true);
    expect(set.has('a')).toBe(false);
  });

  it('returns stats', () => {
    set.add('a'); set.add('b');
    const stats = set.getStats();
    expect(stats.capacity).toBe(5);
    expect(stats.size).toBe(2);
    expect(stats.utilization).toBe('40.00%');
  });

  it('handles capacity=0 gracefully', () => {
    const empty = new BoundedUUIDSet(0);
    expect(empty.add('a')).toBe(true);
    expect(empty.has('a')).toBe(true);
  });
});

// ========== FlushGate ==========
describe('FlushGate', () => {
  let gate;

  beforeEach(() => {
    gate = new FlushGate();
  });

  it('enqueues items before flush', () => {
    expect(gate.enqueue('msg1')).toBe(true);
    expect(gate.length()).toBe(1);
    expect(gate.isFlushed()).toBe(false);
  });

  it('rejects items after flush', () => {
    gate.flush();
    expect(gate.enqueue('msg2')).toBe(false);
  });

  it('flushes and returns queued items', () => {
    gate.enqueue('a'); gate.enqueue('b');
    const items = gate.flush();
    expect(items).toEqual(['a', 'b']);
    expect(gate.isFlushed()).toBe(true);
    expect(gate.length()).toBe(0);
  });

  it('reset restores accept state', () => {
    gate.flush();
    gate.reset();
    expect(gate.isFlushed()).toBe(false);
    expect(gate.enqueue('x')).toBe(true);
  });

  it('drop discards items and closes gate', () => {
    gate.enqueue('a'); gate.enqueue('b');
    const count = gate.drop();
    expect(count).toBe(2);
    expect(gate.length()).toBe(0);
    expect(gate.isFlushed()).toBe(true);
    expect(gate.enqueue('c')).toBe(false);
  });

  it('returns flush duration', () => {
    expect(gate.getFlushDuration()).toBe(0);
    gate.flush();
    expect(gate.getFlushDuration()).toBeGreaterThanOrEqual(0);
  });

  it('returns stats', () => {
    gate.enqueue('a');
    const stats = gate.getStats();
    expect(stats.flushed).toBe(false);
    expect(stats.queueLength).toBe(1);
    expect(stats.active).toBe(true);
    gate.flush();
    const stats2 = gate.getStats();
    expect(stats2.flushed).toBe(true);
    expect(stats2.active).toBe(false);
  });
});

// ========== CommandQueue ==========
describe('CommandQueue', () => {
  let q;

  beforeEach(() => {
    q = new CommandQueue();
  });

  it('enqueues and dequeues commands', () => {
    expect(q.enqueue({ type: 'prompt', value: 'hello' })).toBe(true);
    expect(q.length()).toBe(1);
    const cmd = q.dequeue();
    expect(cmd.type).toBe('prompt');
    expect(cmd.value).toBe('hello');
    expect(cmd.enqueuedAt).toBeDefined();
  });

  it('merges consecutive batchable commands', () => {
    q.enqueue({ type: 'prompt', value: 'a', isMeta: false, workload: 'normal' });
    expect(q.enqueue({ type: 'prompt', value: 'b', isMeta: false, workload: 'normal' })).toBe(false);
    const cmd = q.dequeue();
    expect(cmd.value).toBe('a\nb');
  });

  it('merges array values', () => {
    q.enqueue({ type: 'task-notification', value: ['a'], isMeta: true, workload: 'light' });
    q.enqueue({ type: 'task-notification', value: ['b'], isMeta: true, workload: 'light' });
    const cmd = q.dequeue();
    expect(cmd.value).toEqual(['a', 'b']);
  });

  it('merges metadata on batch', () => {
    q.enqueue({ type: 'prompt', value: 'a', isMeta: false, workload: 'normal', metadata: { x: 1 } });
    q.enqueue({ type: 'prompt', value: 'b', isMeta: false, workload: 'normal', metadata: { y: 2 } });
    const cmd = q.dequeue();
    expect(cmd.metadata).toEqual({ x: 1, y: 2 });
  });

  it('does not merge different types', () => {
    q.enqueue({ type: 'prompt', value: 'a', isMeta: false, workload: 'normal' });
    q.enqueue({ type: 'task-notification', value: 'b', isMeta: false, workload: 'normal' });
    expect(q.length()).toBe(2);
  });

  it('peek returns head without removing', () => {
    q.enqueue({ type: 'prompt', value: 'first' });
    q.enqueue({ type: 'task-notification', value: 'second' });
    expect(q.peek().value).toBe('first');
    expect(q.length()).toBe(2);
  });

  it('returns null on dequeue from empty', () => {
    expect(q.dequeue()).toBe(null);
  });

  it('clears and returns all items', () => {
    q.enqueue({ type: 'prompt', value: 'a' });
    q.enqueue({ type: 'task-notification', value: 'b' });
    const items = q.clear();
    expect(items).toHaveLength(2);
    expect(q.length()).toBe(0);
  });

  it('returns stats', () => {
    q.enqueue({ type: 'prompt', value: 'a' });
    q.enqueue({ type: 'task-notification', value: 'b' });
    const stats = q.getStats();
    expect(stats.length).toBe(2);
    expect(stats.byType).toEqual({ prompt: 1, 'task-notification': 1 });
    expect(stats.oldest).toBeGreaterThanOrEqual(0);
  });

  it('canBatchWith returns false for null inputs', () => {
    expect(q.canBatchWith(null, {})).toBe(false);
    expect(q.canBatchWith({}, null)).toBe(false);
  });
});

// ========== MessageService ==========
describe('MessageService', () => {
  let svc;

  beforeEach(() => {
    svc = new MessageService({ maxMessages: 10 });
  });

  // --- Constructor ---
  describe('constructor', () => {
    it('initializes with default options', () => {
      const s = new MessageService();
      expect(s.messages).toEqual([]);
      expect(s.maxMessages).toBe(1000);
      expect(s.processedUUIDs).toBeInstanceOf(BoundedUUIDSet);
      expect(s.flushGate).toBeInstanceOf(FlushGate);
      expect(s.commandQueue).toBeInstanceOf(CommandQueue);
      expect(s.heldBackResult).toBeNull();
      expect(s.tokenEstimator).toBeInstanceOf(Function);
    });

    it('accepts custom options', () => {
      const est = () => 42;
      const s = new MessageService({ maxMessages: 5, uuidSetCapacity: 10, tokenEstimator: est });
      expect(s.maxMessages).toBe(5);
      expect(s.processedUUIDs.getCapacity()).toBe(10);
      expect(s.tokenEstimator).toBe(est);
    });
  });

  // --- Message Creation ---
  describe('createMessage', () => {
    it('creates a basic message', () => {
      const msg = svc.createMessage('user', 'hello');
      expect(msg.type).toBe('user');
      expect(msg.content).toBe('hello');
      expect(msg.timestamp).toBeDefined();
      expect(msg.uuid).toBeDefined();
    });

    it('attaches metadata', () => {
      const msg = svc.createMessage('user', 'hi', { customField: 123 });
      expect(msg.customField).toBe(123);
    });

    it('sets isMeta for user messages', () => {
      const msg = svc.createMessage('user', 'meta', { isMeta: true });
      expect(msg.isMeta).toBe(true);
    });

    it('sets stopReason and usage for assistant messages', () => {
      const msg = svc.createMessage('assistant', 'ok', { stopReason: 'end_turn', usage: { tokens: 10 } });
      expect(msg.stopReason).toBe('end_turn');
      expect(msg.usage).toEqual({ tokens: 10 });
    });

    it('sets level for system messages', () => {
      const msg = svc.createMessage('system', 'err', { level: 'error' });
      expect(msg.level).toBe('error');
    });
  });

  describe('createUserMessage', () => {
    it('creates user message with options', () => {
      const msg = svc.createUserMessage('hello', { isMeta: true, origin: 'test' });
      expect(msg.type).toBe('user');
      expect(msg.isMeta).toBe(true);
      expect(msg.origin).toBe('test');
    });
  });

  describe('createAssistantMessage', () => {
    it('creates assistant message with stop reason', () => {
      const msg = svc.createAssistantMessage('answer', { stopReason: 'max_tokens', usage: { in: 5, out: 10 } });
      expect(msg.type).toBe('assistant');
      expect(msg.stopReason).toBe('max_tokens');
      expect(msg.usage).toEqual({ in: 5, out: 10 });
    });
  });

  describe('createSystemMessage', () => {
    it('creates system message with level', () => {
      const msg = svc.createSystemMessage('beep', { level: 'warn' });
      expect(msg.type).toBe('system');
      expect(msg.level).toBe('warn');
    });

    it('defaults level to info', () => {
      const msg = svc.createSystemMessage('info');
      expect(msg.level).toBe('info');
    });
  });

  describe('createToolUseMessage', () => {
    it('creates tool_use message', () => {
      const msg = svc.createToolUseMessage('search', { q: 'test' });
      expect(msg.type).toBe('tool_use');
      expect(msg.content.name).toBe('search');
      expect(msg.content.input).toEqual({ q: 'test' });
      expect(msg.content.id).toBeDefined();
    });
  });

  describe('createToolResultMessage', () => {
    it('creates tool_result message', () => {
      const msg = svc.createToolResultMessage('tool-1', 'result data', { isError: true });
      expect(msg.type).toBe('tool_result');
      expect(msg.content.tool_use_id).toBe('tool-1');
      expect(msg.content.content).toBe('result data');
      expect(msg.content.is_error).toBe(true);
    });
  });

  describe('createAttachmentMessage', () => {
    it('creates attachment message', () => {
      const att = { name: 'file.pdf', size: 100 };
      const msg = svc.createAttachmentMessage(att, { isMeta: true });
      expect(msg.type).toBe('attachment');
      expect(msg.content.name).toBe('file.pdf');
      expect(msg.isMeta).toBe(true);
    });
  });

  describe('createMessageWithUniqueUUID', () => {
    it('creates message with unique UUID', () => {
      const msg = svc.createMessageWithUniqueUUID('user', 'hello');
      expect(msg.type).toBe('user');
      expect(msg.uuid).toBeDefined();
      expect(svc.isProcessed(msg.uuid)).toBe(false);
    });

    it('generates new UUID if provided one is duplicate', () => {
      svc.markProcessed('dup-uuid');
      const msg = svc.createMessageWithUniqueUUID('user', 'test', { uuid: 'dup-uuid' });
      expect(msg.uuid).not.toBe('dup-uuid');
    });
  });

  // --- Message Management ---
  describe('addMessage', () => {
    it('adds message to array', () => {
      const msg = svc.createMessage('user', 'hi');
      svc.addMessage(msg);
      expect(svc.messages).toHaveLength(1);
      expect(svc.messages[0].content).toBe('hi');
    });

    it('emits messageAdded event', () => {
      const handler = jest.fn();
      svc.on('messageAdded', handler);
      const msg = svc.createMessage('user', 'hi');
      svc.addMessage(msg);
      expect(handler).toHaveBeenCalledWith({ message: msg });
    });

    it('removes oldest when exceeding maxMessages', () => {
      const s = new MessageService({ maxMessages: 3 });
      const removedHandler = jest.fn();
      s.on('messageRemoved', removedHandler);
      for (let i = 0; i < 4; i++) {
        s.addMessage(s.createMessage('user', `msg${i}`));
      }
      expect(s.messages).toHaveLength(3);
      expect(s.messages[0].content).toBe('msg1');
      expect(removedHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('addMessageEnhanced', () => {
    it('queues message when flush gate not flushed', () => {
      const queuedHandler = jest.fn();
      svc.on('messageQueued', queuedHandler);
      const msg = svc.createMessage('user', 'pending');
      const result = svc.addMessageEnhanced(msg, { useFlushGate: true });
      expect(result).toBeNull();
      expect(svc.flushGate.length()).toBe(1);
      expect(queuedHandler).toHaveBeenCalled();
    });

    it('passes through when flush gate flushed', () => {
      svc.beginFlush();
      const msg = svc.createMessage('user', 'direct');
      const result = svc.addMessageEnhanced(msg, { useFlushGate: true });
      expect(result).not.toBeNull();
      expect(svc.messages).toHaveLength(1);
    });

    it('bypasses gate when useFlushGate is false', () => {
      svc.addMessageEnhanced(svc.createMessage('user', 'x'), { useFlushGate: false });
      expect(svc.messages).toHaveLength(1);
    });
  });

  describe('addMessageWithDedupe', () => {
    it('adds message with unique UUID', () => {
      const msg = svc.createMessage('user', 'new', { uuid: 'unique-1' });
      const result = svc.addMessageWithDedupe(msg);
      expect(result).not.toBeNull();
      expect(svc.messages).toHaveLength(1);
    });

    it('skips duplicate UUID', () => {
      const skipHandler = jest.fn();
      svc.on('duplicateSkipped', skipHandler);
      svc.addMessageWithDedupe(svc.createMessage('user', 'first', { uuid: 'dup' }));
      const dup = svc.createMessage('user', 'second', { uuid: 'dup' });
      const result = svc.addMessageWithDedupe(dup);
      expect(result).toBeNull();
      expect(svc.messages).toHaveLength(1);
      expect(skipHandler).toHaveBeenCalled();
    });

    it('skips dedupe check when skipDuplicateCheck is true', () => {
      svc.markProcessed('uuid-1');
      const msg = svc.createMessage('user', 'dup ok', { uuid: 'uuid-1' });
      const result = svc.addMessageWithDedupe(msg, { skipDuplicateCheck: true });
      expect(result).not.toBeNull();
    });
  });

  describe('addMessagesBatch', () => {
    it('adds multiple messages', () => {
      const msgs = [
        svc.createMessage('user', 'a', { uuid: '1' }),
        svc.createMessage('user', 'b', { uuid: '2' }),
        svc.createMessage('user', 'c', { uuid: '3' })
      ];
      const batchHandler = jest.fn();
      svc.on('batchAdded', batchHandler);
      const result = svc.addMessagesBatch(msgs);
      expect(result.added).toHaveLength(3);
      expect(result.duplicates).toHaveLength(0);
      expect(svc.messages).toHaveLength(3);
      expect(batchHandler).toHaveBeenCalled();
    });

    it('filters duplicates', () => {
      svc.markProcessed('dup-1');
      const msgs = [
        svc.createMessage('user', 'dup', { uuid: 'dup-1' }),
        svc.createMessage('user', 'new', { uuid: 'new-1' })
      ];
      const result = svc.addMessagesBatch(msgs);
      expect(result.added).toHaveLength(1);
      expect(result.duplicates).toHaveLength(1);
    });
  });

  describe('processMessage', () => {
    it('processes user role message', async () => {
      const result = await svc.processMessage({ content: 'hi', role: 'user' });
      expect(result.type).toBe('user');
      expect(svc.messages).toHaveLength(1);
    });

    it('processes assistant role', async () => {
      const result = await svc.processMessage({ content: 'response', role: 'assistant' });
      expect(result.type).toBe('assistant');
    });

    it('processes system role', async () => {
      const result = await svc.processMessage({ content: 'sys', role: 'system' });
      expect(result.type).toBe('system');
    });

    it('defaults to user for unknown role', async () => {
      const result = await svc.processMessage({ content: 'hi', role: 'unknown' });
      expect(result.type).toBe('user');
    });
  });

  describe('getMessages', () => {
    it('returns a copy of messages', () => {
      svc.addMessage(svc.createMessage('user', 'hi'));
      const msgs = svc.getMessages();
      expect(msgs).toHaveLength(1);
      msgs.push('tamper');
      expect(svc.messages).toHaveLength(1);
    });
  });

  describe('getLastAssistantMessage', () => {
    it('returns last assistant message', () => {
      svc.addMessage(svc.createMessage('user', 'q'));
      svc.addMessage(svc.createMessage('assistant', 'a1'));
      svc.addMessage(svc.createMessage('user', 'q2'));
      svc.addMessage(svc.createMessage('assistant', 'a2'));
      expect(svc.getLastAssistantMessage().content).toBe('a2');
    });

    it('returns null if no assistant message', () => {
      svc.addMessage(svc.createMessage('user', 'q'));
      expect(svc.getLastAssistantMessage()).toBeNull();
    });
  });

  describe('getLastUserMessage', () => {
    it('returns last non-meta user message', () => {
      svc.addMessage(svc.createMessage('user', 'real', { isMeta: false }));
      expect(svc.getLastUserMessage().content).toBe('real');
    });

    it('skips meta messages', () => {
      svc.addMessage(svc.createMessage('user', 'meta', { isMeta: true }));
      expect(svc.getLastUserMessage()).toBeNull();
    });

    it('returns last user message skipping meta', () => {
      svc.addMessage(svc.createMessage('user', 'meta', { isMeta: true }));
      svc.addMessage(svc.createMessage('user', 'real'));
      expect(svc.getLastUserMessage().content).toBe('real');
    });
  });

  describe('normalizeForAPI', () => {
    it('normalizes user messages', () => {
      svc.addMessage(svc.createMessage('user', 'hello'));
      const api = svc.normalizeForAPI();
      expect(api[0]).toEqual({ role: 'user', content: 'hello' });
    });

    it('normalizes assistant messages with metadata', () => {
      svc.addMessage(svc.createMessage('assistant', 'response', { stopReason: 'end_turn', usage: { in: 5 } }));
      const api = svc.normalizeForAPI();
      expect(api[0].role).toBe('assistant');
      expect(api[0].stop_reason).toBe('end_turn');
      expect(api[0].usage).toEqual({ in: 5 });
    });

    it('normalizes system messages', () => {
      svc.addMessage(svc.createMessage('system', 'prompt'));
      const api = svc.normalizeForAPI();
      expect(api[0]).toEqual({ role: 'system', content: 'prompt' });
    });

    it('normalizes tool_use messages', () => {
      svc.addMessage(svc.createMessage('tool_use', { name: 'search', input: {}, id: 'tid-1' }));
      const api = svc.normalizeForAPI();
      expect(api[0].role).toBe('assistant');
      expect(api[0].content).toEqual([{ type: 'tool_use', id: 'tid-1', name: 'search', input: {} }]);
    });

    it('normalizes tool_result messages with array content', () => {
      svc.addMessage(svc.createMessage('tool_result', {
        tool_use_id: 'tid-1',
        content: [{ text: 'line1' }, { text: 'line2' }],
        is_error: false
      }));
      const api = svc.normalizeForAPI();
      expect(api[0].role).toBe('user');
      expect(api[0].content[0].type).toBe('tool_result');
      expect(api[0].content[0].content).toBe('line1\nline2');
    });

    it('normalizes tool_result with string content', () => {
      svc.addMessage(svc.createMessage('tool_result', {
        tool_use_id: 'tid-1',
        content: 'raw',
        is_error: false
      }));
      const api = svc.normalizeForAPI();
      expect(api[0].content[0].content).toBe('raw');
    });

    it('normalizes unknown type as passthrough', () => {
      const raw = { type: 'custom', content: 'value' };
      svc.addMessage(raw);
      const api = svc.normalizeForAPI();
      expect(api[0]).toBe(raw);
    });

    it('normalizes numeric content via fallthrough', () => {
      svc.addMessage(svc.createMessage('user', 123));
      const api = svc.normalizeForAPI();
      expect(api[0].role).toBe('user');
      expect(api[0].content).toBe(123);
    });

    it('normalizes user message with array content via _normalizeContent', () => {
      svc.addMessage(svc.createMessage('user', [
        { text: 'hello' },
        { type: 'tool_use', id: 't1', name: 'search', input: { q: 'x' } },
        { tool_use_id: 'tr1', content: 'result', is_error: false },
        { raw: 'fallthrough' }
      ]));
      const api = svc.normalizeForAPI();
      expect(api[0].role).toBe('user');
      expect(api[0].content).toHaveLength(4);
      expect(api[0].content[0]).toEqual({ type: 'text', text: 'hello' });
      expect(api[0].content[1].type).toBe('tool_use');
      expect(api[0].content[2].type).toBe('tool_result');
      expect(api[0].content[3]).toEqual({ raw: 'fallthrough' });
    });
  });

  describe('mergeUserMessages', () => {
    it('merges consecutive user messages', () => {
      svc.addMessage(svc.createMessage('user', 'part1'));
      svc.addMessage(svc.createMessage('user', 'part2'));
      svc.addMessage(svc.createMessage('assistant', 'resp'));
      const result = svc.mergeUserMessages();
      expect(result).toHaveLength(2);
      expect(result[0].content).toHaveLength(2);
      expect(result[0].content[0].text).toBe('part1');
      expect(result[0].content[1].text).toBe('part2');
    });

    it('does not merge non-consecutive user messages', () => {
      svc.addMessage(svc.createMessage('user', 'a'));
      svc.addMessage(svc.createMessage('assistant', 'b'));
      svc.addMessage(svc.createMessage('user', 'c'));
      const result = svc.mergeUserMessages();
      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('a');
    });

    it('skips meta user messages', () => {
      svc.addMessage(svc.createMessage('user', 'real'));
      svc.addMessage(svc.createMessage('user', 'meta', { isMeta: true }));
      const result = svc.mergeUserMessages();
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('real');
    });
  });

  describe('stripImages', () => {
    it('removes image blocks from user messages with array content', () => {
      const msg = svc.createMessage('user', [
        { type: 'text', text: 'hello' },
        { type: 'image', source: 'img.png' }
      ]);
      svc.addMessage(msg);
      const result = svc.stripImages();
      expect(typeof result[0].content).toBe('string');
      expect(result[0].content).toBe('hello');
      expect(result[0]._imagesRemoved).toBe(true);
    });

    it('passes through string content unchanged', () => {
      svc.addMessage(svc.createMessage('user', 'text only'));
      const result = svc.stripImages();
      expect(result[0].content).toBe('text only');
    });

    it('passes through non-user messages', () => {
      svc.addMessage(svc.createMessage('assistant', 'ok'));
      const result = svc.stripImages();
      expect(result[0].content).toBe('ok');
    });

    it('returns msg unchanged when array content has no images', () => {
      svc.addMessage(svc.createMessage('user', [
        { type: 'text', text: 'no images' }
      ]));
      const result = svc.stripImages();
      expect(result[0]._imagesRemoved).toBeUndefined();
      expect(result[0].content[0].text).toBe('no images');
    });
  });

  describe('getMessagesAfterBoundary', () => {
    it('returns all messages if no boundary', () => {
      svc.addMessage(svc.createMessage('user', 'a'));
      svc.addMessage(svc.createMessage('user', 'b'));
      expect(svc.getMessagesAfterBoundary()).toHaveLength(2);
    });

    it('returns messages after compact boundary', () => {
      svc.addMessage(svc.createMessage('user', 'before'));
      svc.addMessage(svc.createMessage('system', 'summarized'));
      svc.addMessage(svc.createMessage('user', 'after'));
      const result = svc.getMessagesAfterBoundary();
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('after');
    });

    it('returns messages after isCompactBoundary', () => {
      const boundary = svc.createMessage('system', 'boundary');
      boundary.isCompactBoundary = true;
      svc.addMessage(svc.createMessage('user', 'before'));
      svc.addMessage(boundary);
      svc.addMessage(svc.createMessage('user', 'after'));
      const result = svc.getMessagesAfterBoundary();
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('after');
    });
  });

  describe('calculateTokens', () => {
    it('calculates tokens for string content', () => {
      svc.addMessage(svc.createMessage('user', 'hello'));
      expect(svc.calculateTokens()).toBeGreaterThan(0);
    });

    it('calculates tokens for array content with text blocks', () => {
      svc.addMessage(svc.createMessage('user', [{ text: 'abc' }, { text: 'def' }]));
      expect(svc.calculateTokens()).toBeGreaterThan(0);
    });

    it('returns 0 for empty messages', () => {
      expect(svc.calculateTokens()).toBe(0);
    });

    it('uses custom token estimator', () => {
      const s = new MessageService({ tokenEstimator: () => 42 });
      s.addMessage(s.createMessage('user', 'anything'));
      expect(s.calculateTokens()).toBe(42);
    });
  });

  describe('clear', () => {
    it('clears all messages and emits event', () => {
      svc.addMessage(svc.createMessage('user', 'a'));
      const clearedHandler = jest.fn();
      svc.on('cleared', clearedHandler);
      const old = svc.clear();
      expect(old).toHaveLength(1);
      expect(svc.messages).toHaveLength(0);
      expect(clearedHandler).toHaveBeenCalled();
    });
  });

  describe('getUserMessageText', () => {
    it('extracts text from string content', () => {
      const msg = svc.createMessage('user', 'hello');
      expect(svc.getUserMessageText(msg)).toBe('hello');
    });

    it('joins text blocks from array content', () => {
      const msg = svc.createMessage('user', [{ type: 'text', text: 'line1' }, { type: 'text', text: 'line2' }, { type: 'image' }]);
      expect(svc.getUserMessageText(msg)).toBe('line1\nline2');
    });

    it('returns empty for non-user messages', () => {
      const msg = svc.createMessage('assistant', 'resp');
      expect(svc.getUserMessageText(msg)).toBe('');
    });

    it('returns empty for null', () => {
      expect(svc.getUserMessageText(null)).toBe('');
    });

    it('returns empty for object content', () => {
      const msg = svc.createMessage('user', { custom: true });
      expect(svc.getUserMessageText(msg)).toBe('');
    });
  });

  describe('isThinkingMessage', () => {
    it('returns true for assistant message with thinking block', () => {
      const msg = svc.createMessage('assistant', [{ type: 'thinking', text: '...' }]);
      expect(svc.isThinkingMessage(msg)).toBe(true);
    });

    it('returns false for non-assistant message', () => {
      const msg = svc.createMessage('user', 'hi');
      expect(svc.isThinkingMessage(msg)).toBe(false);
    });

    it('returns false for assistant message with string content', () => {
      const msg = svc.createMessage('assistant', 'no thinking');
      expect(svc.isThinkingMessage(msg)).toBe(false);
    });
  });

  describe('export / import', () => {
    it('exports messages with metadata', () => {
      svc.addMessage(svc.createMessage('user', 'data'));
      const exp = svc.export();
      expect(exp.messages).toHaveLength(1);
      expect(exp.count).toBe(1);
      expect(exp.exportedAt).toBeDefined();
    });

    it('imports messages', () => {
      const importedHandler = jest.fn();
      svc.on('imported', importedHandler);
      const data = { messages: [svc.createMessage('user', 'imported')] };
      svc.import(data);
      expect(svc.messages).toHaveLength(1);
      expect(importedHandler).toHaveBeenCalledWith({ count: 1 });
    });
  });

  describe('getStats', () => {
    it('returns stats with type breakdown', () => {
      svc.addMessage(svc.createMessage('user', 'a'));
      svc.addMessage(svc.createMessage('assistant', 'b'));
      svc.addMessage(svc.createMessage('system', 'c'));
      const stats = svc.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType).toEqual({ user: 1, assistant: 1, system: 1 });
      expect(stats.tokens).toBeGreaterThan(0);
    });
  });

  describe('getDiagnostics', () => {
    it('returns diagnostic info', () => {
      svc.addMessage(svc.createMessage('user', 'test'));
      const diag = svc.getDiagnostics();
      expect(diag.messages.count).toBe(1);
      expect(diag.messages.max).toBe(10);
      expect(diag.uuidTracking).toBeDefined();
      expect(diag.flushGate).toBeDefined();
      expect(diag.commandQueue).toBeDefined();
      expect(diag.heldResult).toBe(false);
      expect(diag.memory).toBeDefined();
    });
  });

  describe('serialize / deserialize', () => {
    it('serializes state', () => {
      svc.addMessage(svc.createMessage('user', 'data'));
      const ser = svc.serialize();
      expect(ser.messages).toHaveLength(1);
      expect(ser.stats).toBeDefined();
      expect(ser.diagnostics).toBeDefined();
      expect(ser.serializedAt).toBeDefined();
    });

    it('deserializes messages', () => {
      const deserHandler = jest.fn();
      svc.on('deserialized', deserHandler);
      const data = { messages: [svc.createMessage('user', 'loaded')] };
      svc.deserialize(data);
      expect(svc.messages).toHaveLength(1);
      expect(svc.messages[0].content).toBe('loaded');
      expect(deserHandler).toHaveBeenCalledWith({ messageCount: 1 });
    });
  });

  describe('resetAll', () => {
    it('resets all state', () => {
      svc.addMessage(svc.createMessage('user', 'a'));
      svc.markProcessed('uuid-1');
      svc.flushGate.flush();
      svc.enqueueCommand({ type: 'prompt', value: 'x' });
      svc.holdResult({ data: 1 });
      const handler = jest.fn();
      svc.on('resetAll', handler);
      svc.resetAll();
      expect(svc.messages).toHaveLength(0);
      expect(svc.processedUUIDs.isEmpty()).toBe(true);
      expect(svc.flushGate.isFlushed()).toBe(false);
      expect(svc.getCommandQueueLength()).toBe(0);
      expect(svc.hasHeldResult()).toBe(false);
      expect(handler).toHaveBeenCalled();
    });
  });

  // --- UUID Tracking ---
  describe('UUID tracking', () => {
    it('marks and checks processed UUIDs', () => {
      svc.markProcessed('abc');
      expect(svc.isProcessed('abc')).toBe(true);
      expect(svc.isProcessed('def')).toBe(false);
    });

    it('marks and checks sent UUIDs', () => {
      svc.markSent('sent-1');
      expect(svc.isSent('sent-1')).toBe(true);
      expect(svc.isSent('unknown')).toBe(false);
    });

    it('marks and checks acknowledged UUIDs', () => {
      svc.markAcknowledged('ack-1');
      expect(svc.isAcknowledged('ack-1')).toBe(true);
      expect(svc.isAcknowledged('unknown')).toBe(false);
    });

    it('acknowledges batch', () => {
      svc.acknowledgeBatch(['a', 'b', 'c']);
      expect(svc.isAcknowledged('a')).toBe(true);
      expect(svc.isAcknowledged('c')).toBe(true);
    });

    it('returns UUID set stats', () => {
      svc.markProcessed('p1');
      svc.markSent('s1');
      svc.markAcknowledged('a1');
      const stats = svc.getUUIDSetStats();
      expect(stats.processed.size).toBe(1);
      expect(stats.sent.size).toBe(1);
      expect(stats.acknowledged.size).toBe(1);
    });

    it('clears all UUID tracking', () => {
      svc.markProcessed('p1');
      svc.markSent('s1');
      svc.markAcknowledged('a1');
      const handler = jest.fn();
      svc.on('uuidTrackingCleared', handler);
      svc.clearUUIDTracking();
      expect(svc.processedUUIDs.isEmpty()).toBe(true);
      expect(svc.sentUUIDs.isEmpty()).toBe(true);
      expect(svc.acknowledgedUUIDs.isEmpty()).toBe(true);
      expect(handler).toHaveBeenCalled();
    });
  });

  // --- FlushGate ---
  describe('FlushGate integration', () => {
    it('beginFlush returns pending messages and emits event', () => {
      svc.addMessageEnhanced(svc.createMessage('user', 'queued'), { useFlushGate: true });
      const handler = jest.fn();
      svc.on('flushBegan', handler);
      const pending = svc.beginFlush();
      expect(pending).toHaveLength(1);
      expect(handler).toHaveBeenCalled();
    });

    it('resetFlushGate resets and emits event', () => {
      svc.beginFlush();
      const handler = jest.fn();
      svc.on('flushGateReset', handler);
      svc.resetFlushGate();
      expect(svc.flushGate.isFlushed()).toBe(false);
      expect(handler).toHaveBeenCalled();
    });

    it('getFlushGateStats returns gate stats', () => {
      const stats = svc.getFlushGateStats();
      expect(stats.flushed).toBe(false);
      expect(stats.queueLength).toBe(0);
    });
  });

  // --- Command Queue ---
  describe('Command Queue integration', () => {
    it('enqueues command and emits event', () => {
      const handler = jest.fn();
      svc.on('commandEnqueued', handler);
      const added = svc.enqueueCommand({ type: 'prompt', value: 'hello' });
      expect(added).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('peeks at first command', () => {
      svc.enqueueCommand({ type: 'prompt', value: 'first' });
      svc.enqueueCommand({ type: 'task-notification', value: 'second' });
      expect(svc.peekCommand().value).toBe('first');
    });

    it('dequeues command', () => {
      svc.enqueueCommand({ type: 'prompt', value: 'x' });
      const cmd = svc.dequeueCommand();
      expect(cmd.value).toBe('x');
      expect(svc.getCommandQueueLength()).toBe(0);
    });

    it('returns command queue stats', () => {
      svc.enqueueCommand({ type: 'prompt', value: 'a' });
      svc.enqueueCommand({ type: 'task-notification', value: 'b' });
      const stats = svc.getCommandQueueStats();
      expect(stats.length).toBe(2);
      expect(stats.byType).toEqual({ prompt: 1, 'task-notification': 1 });
    });

    it('clears command queue and emits event', () => {
      svc.enqueueCommand({ type: 'prompt', value: 'x' });
      const handler = jest.fn();
      svc.on('commandQueueCleared', handler);
      const items = svc.clearCommandQueue();
      expect(items).toHaveLength(1);
      expect(svc.getCommandQueueLength()).toBe(0);
      expect(handler).toHaveBeenCalledWith({ count: 1 });
    });
  });

  // --- Result Holdback ---
  describe('Result Holdback', () => {
    it('holds and retrieves result', () => {
      svc.holdResult({ data: 42 });
      expect(svc.hasHeldResult()).toBe(true);
      expect(svc.getHeldResult()).toEqual({ data: 42 });
    });

    it('releases result and emits event', () => {
      const handler = jest.fn();
      svc.on('resultReleased', handler);
      svc.holdResult({ data: 1 });
      const result = svc.releaseHeldResult();
      expect(result).toEqual({ data: 1 });
      expect(svc.hasHeldResult()).toBe(false);
      expect(handler).toHaveBeenCalled();
    });

    it('release on empty returns null', () => {
      expect(svc.releaseHeldResult()).toBeNull();
    });

    it('emit resultHeld on hold', () => {
      const handler = jest.fn();
      svc.on('resultHeld', handler);
      svc.holdResult('val');
      expect(handler).toHaveBeenCalledWith({ result: 'val' });
    });
  });

  // --- EventEmitter ---
  it('is an EventEmitter', () => {
    expect(svc).toBeInstanceOf(require('events').EventEmitter);
  });
});

// ========== Additional coverage for missing branches ==========

describe('BoundedUUIDSet - default capacity', () => {
  it('uses default capacity of 2000 when not specified', () => {
    const s = new BoundedUUIDSet();
    expect(s.getCapacity()).toBe(2000);
  });
});

describe('CommandQueue - edge cases', () => {
  it('returns null on peek from empty', () => {
    const q = new CommandQueue();
    expect(q.peek()).toBeNull();
  });

  it('merges non-string non-array values without value merge', () => {
    const q = new CommandQueue();
    q.enqueue({ type: 'prompt', value: null, isMeta: false, workload: 'normal', metadata: { x: 1 } });
    expect(q.enqueue({ type: 'prompt', value: null, isMeta: false, workload: 'normal', metadata: { y: 2 } })).toBe(false);
    const cmd = q.dequeue();
    expect(cmd.value).toBeNull();
    expect(cmd.metadata).toEqual({ x: 1, y: 2 });
  });
});

describe('MessageService - creation defaults', () => {
  let svc;
  beforeEach(() => {
    svc = new MessageService({ maxMessages: 10 });
  });

  it('createUserMessage without options uses defaults', () => {
    const msg = svc.createUserMessage('hello');
    expect(msg.isMeta).toBe(false);
    expect(msg.origin).toBeNull();
  });

  it('createAssistantMessage without options uses defaults', () => {
    const msg = svc.createAssistantMessage('answer');
    expect(msg.stopReason).toBeNull();
    expect(msg.usage).toBeNull();
  });

  it('createToolResultMessage without isError defaults to false', () => {
    const msg = svc.createToolResultMessage('tid-1', 'result');
    expect(msg.content.is_error).toBe(false);
  });

  it('createAttachmentMessage without options uses defaults', () => {
    const msg = svc.createAttachmentMessage({ name: 'f.pdf' });
    expect(msg.isMeta).toBe(false);
    expect(msg.origin).toBeNull();
  });

  it('processMessage with default role', async () => {
    const result = await svc.processMessage({ content: 'hi' });
    expect(result.type).toBe('user');
  });

  it('normalizes assistant without stopReason or usage', () => {
    svc.addMessage(svc.createMessage('assistant', 'plain'));
    const api = svc.normalizeForAPI();
    expect(api[0].role).toBe('assistant');
    expect(api[0].stop_reason).toBeUndefined();
    expect(api[0].usage).toBeUndefined();
  });

  it('default tokenEstimator handles falsy text', () => {
    const s = new MessageService();
    expect(s.tokenEstimator(undefined)).toBe(0);
    expect(s.tokenEstimator(null)).toBe(0);
  });

  it('mergeUserMessages with >2 consecutive users triggers array path', () => {
    svc.addMessage(svc.createMessage('user', 'a'));
    svc.addMessage(svc.createMessage('user', 'b'));
    svc.addMessage(svc.createMessage('user', 'c'));
    const result = svc.mergeUserMessages();
    expect(result).toHaveLength(1);
    expect(result[0].content).toHaveLength(3);
  });

  it('mergeUserMessages with incoming array content hits array branch', () => {
    svc.addMessage(svc.createMessage('user', 'first'));
    svc.addMessage(svc.createMessage('user', [{ text: 'second' }]));
    const result = svc.mergeUserMessages();
    expect(result).toHaveLength(1);
    expect(result[0].content).toHaveLength(2);
  });

  it('stripImages with multiple remaining blocks returns array', () => {
    svc.addMessage(svc.createMessage('user', [
      { type: 'text', text: 'keep1' },
      { type: 'image', src: 'img.png' },
      { type: 'text', text: 'keep2' }
    ]));
    const result = svc.stripImages();
    expect(result[0]._imagesRemoved).toBe(true);
    expect(Array.isArray(result[0].content)).toBe(true);
    expect(result[0].content).toHaveLength(2);
  });

  it('stripImages single remaining block without text uses empty string', () => {
    svc.addMessage(svc.createMessage('user', [
      { type: 'tool_result', content: 'result' },
      { type: 'image', src: 'img.png' }
    ]));
    const result = svc.stripImages();
    expect(result[0]._imagesRemoved).toBe(true);
    expect(result[0].content).toBe('');
  });

  it('calculateTokens with null content', () => {
    svc.messages.push({ type: 'user', content: null });
    expect(svc.calculateTokens()).toBe(0);
  });

  it('calculateTokens with non-text block in array', () => {
    svc.addMessage(svc.createMessage('user', [{ type: 'image', src: 'x.png' }]));
    expect(svc.calculateTokens()).toBe(0);
  });

  it('calculateTokens with numeric content', () => {
    svc.addMessage(svc.createMessage('user', 123));
    expect(svc.calculateTokens()).toBe(0);
  });

  it('import without messages field', () => {
    svc.import({ other: 'data' });
    expect(svc.messages).toHaveLength(0);
  });

  it('deserialize without messages field', () => {
    const handler = jest.fn();
    svc.on('deserialized', handler);
    svc.deserialize({ other: 'data' });
    expect(svc.messages).toHaveLength(0);
    expect(handler).toHaveBeenCalledWith({ messageCount: 0 });
  });

  it('addMessageEnhanced without useFlushGate option', () => {
    svc.addMessageEnhanced(svc.createMessage('user', 'x'));
    expect(svc.messages).toHaveLength(1);
  });

  it('createMessageWithUniqueUUID with fresh provided UUID', () => {
    const msg = svc.createMessageWithUniqueUUID('user', 'test', { uuid: 'fresh-uuid' });
    expect(msg.uuid).toBe('fresh-uuid');
  });
});
