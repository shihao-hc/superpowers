const { ContextCompactService } = require('../../src/agent/ContextCompactService');

describe('ContextCompactService', () => {
  let service;
  let warnSpy;

  beforeEach(() => {
    jest.restoreAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    service = new ContextCompactService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should set default values', () => {
      expect(service.maxTokens).toBe(100000);
      expect(service.bufferTokens).toBe(13000);
      expect(service.warningThreshold).toBe(20000);
      expect(service.preserveRecentMessages).toBe(10);
      expect(service.maxSummaryTokens).toBe(5000);
      expect(service.autoCompactEnabled).toBe(true);
      expect(service.consecutiveFailureLimit).toBe(3);
      expect(service.messages).toEqual([]);
      expect(service.tokenCount).toBe(0);
      expect(service.compactionHistory).toEqual([]);
      expect(service.consecutiveFailures).toBe(0);
      expect(service.lastCompactTime).toBeNull();
      expect(service.turnCounter).toBe(0);
      expect(typeof service.tokenEstimator).toBe('function');
    });

    test('should accept custom options', () => {
      const estimator = jest.fn();
      const custom = new ContextCompactService({
        maxTokens: 50000,
        bufferTokens: 5000,
        warningThreshold: 5000,
        preserveRecentMessages: 5,
        maxSummaryTokens: 2000,
        autoCompactEnabled: false,
        consecutiveFailureLimit: 5,
        tokenEstimator: estimator
      });
      expect(custom.maxTokens).toBe(50000);
      expect(custom.bufferTokens).toBe(5000);
      expect(custom.warningThreshold).toBe(5000);
      expect(custom.preserveRecentMessages).toBe(5);
      expect(custom.maxSummaryTokens).toBe(2000);
      expect(custom.autoCompactEnabled).toBe(false);
      expect(custom.consecutiveFailureLimit).toBe(5);
      expect(custom.tokenEstimator).toBe(estimator);
    });
  });

  describe('addMessage', () => {
    test('should add message with timestamp and uuid', () => {
      service.addMessage({ content: 'hello', role: 'user' });
      expect(service.messages).toHaveLength(1);
      expect(service.messages[0].content).toBe('hello');
      expect(service.messages[0].role).toBe('user');
      expect(service.messages[0].timestamp).toBeDefined();
      expect(service.messages[0].uuid).toMatch(/^[0-9a-f-]+$/);
      expect(service.turnCounter).toBe(1);
    });

    test('should preserve existing timestamp and uuid', () => {
      const ts = 12345;
      const uid = 'my-uuid-123';
      service.addMessage({ content: 'hello', timestamp: ts, uuid: uid });
      expect(service.messages[0].timestamp).toBe(ts);
      expect(service.messages[0].uuid).toBe(uid);
    });

    test('should update token count', () => {
      service.addMessage({ content: 'a'.repeat(40) });
      expect(service.tokenCount).toBe(10);
    });
  });

  describe('getMessages', () => {
    test('should return a copy of messages', () => {
      service.addMessage({ content: 'hello' });
      const msgs = service.getMessages();
      expect(msgs).toEqual(service.messages);
      expect(msgs).not.toBe(service.messages);
    });
  });

  describe('_defaultTokenEstimator', () => {
    test('should estimate tokens as ceil(text.length / 4)', () => {
      expect(service._defaultTokenEstimator('hello world')).toBe(3);
      expect(service._defaultTokenEstimator('a')).toBe(1);
      expect(service._defaultTokenEstimator('aaaa')).toBe(1);
      expect(service._defaultTokenEstimator('aaaaa')).toBe(2);
    });

    test('should return 0 for empty or null text', () => {
      expect(service._defaultTokenEstimator('')).toBe(0);
      expect(service._defaultTokenEstimator(null)).toBe(0);
      expect(service._defaultTokenEstimator(undefined)).toBe(0);
    });
  });

  describe('_calculateTotalTokens', () => {
    test('should handle array content with text blocks', () => {
      service.addMessage({ content: [{ text: 'hello' }, { text: 'world' }] });
      expect(service.tokenCount).toBe(4);
    });

    test('should handle array content blocks without text', () => {
      service.addMessage({ content: [{ notText: true }, { text: 'hi' }] });
      expect(service.tokenCount).toBe(1);
    });

    test('should handle messages without content', () => {
      service.addMessage({ role: 'system' });
      expect(service.tokenCount).toBe(0);
    });

    test('should handle content that is neither string nor array', () => {
      service.addMessage({ content: 12345 });
      expect(service.tokenCount).toBe(0);
    });
  });

  describe('getTokenState', () => {
    test('should return state for empty messages', () => {
      const state = service.getTokenState();
      expect(state.current).toBe(0);
      expect(state.max).toBe(100000);
      expect(state.available).toBe(100000);
      expect(state.percentLeft).toBe(100);
      expect(state.isAboveWarning).toBe(false);
      expect(state.isAboveAutoCompact).toBe(false);
      expect(state.effectiveThreshold).toBe(87000);
    });

    test('should detect warning threshold crossing', () => {
      const big = 'a'.repeat(324000);
      service.addMessage({ content: big });
      const state = service.getTokenState();
      expect(state.current).toBe(81000);
      expect(state.isAboveWarning).toBe(true);
      expect(state.isAboveAutoCompact).toBe(false);
    });

    test('should detect auto-compact threshold crossing', () => {
      const reallyBig = 'a'.repeat(352000);
      service.addMessage({ content: reallyBig });
      const state = service.getTokenState();
      expect(state.current).toBe(88000);
      expect(state.isAboveAutoCompact).toBe(true);
      expect(state.isAboveWarning).toBe(true);
    });

    test('should clamp percentLeft to 0', () => {
      service.tokenCount = 200000;
      const state = service.getTokenState();
      expect(state.percentLeft).toBe(0);
    });
  });

  describe('shouldCompact and shouldWarn', () => {
    test('should return false when under thresholds', () => {
      expect(service.shouldCompact()).toBe(false);
      expect(service.shouldWarn()).toBe(false);
    });

    test('should return true when over thresholds', () => {
      const big = 'a'.repeat(352000);
      service.addMessage({ content: big });
      expect(service.shouldCompact()).toBe(true);
      expect(service.shouldWarn()).toBe(true);
    });
  });

  describe('compact', () => {
    test('should compress messages and return result', async () => {
      for (let i = 0; i < 15; i++) {
        service.addMessage({ content: `message ${i}`, role: 'user' });
      }
      const preCount = service.tokenCount;
      const result = await service.compact();
      expect(result.success).toBe(true);
      expect(result.preTokens).toBe(preCount);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.boundary).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(service.consecutiveFailures).toBe(0);
      expect(service.lastCompactTime).toBeDefined();
      expect(service.compactionHistory).toHaveLength(1);
    });

    test('should emit compact event on success', async () => {
      const handler = jest.fn();
      service.on('compact', handler);
      for (let i = 0; i < 15; i++) {
        service.addMessage({ content: `msg ${i}` });
      }
      await service.compact();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].success).toBe(true);
    });

    test('should use LLM when provided in context', async () => {
      const mockLLM = {
        complete: jest.fn().mockResolvedValue({ text: 'LLM summary text' })
      };
      for (let i = 0; i < 15; i++) {
        service.addMessage({ content: `Message ${i} content`, role: 'user' });
      }
      const result = await service.compact({ llm: mockLLM, summarizePrompt: 'Summarize: {content}' });
      expect(mockLLM.complete).toHaveBeenCalledTimes(1);
      expect(mockLLM.complete).toHaveBeenCalledWith({
        prompt: expect.stringContaining('Summarize:'),
        max_tokens: 5000
      });
      expect(result.success).toBe(true);
      expect(result.summary).toBe('LLM summary text');
    });

    test('should fall back to truncation when LLM fails', async () => {
      const mockLLM = {
        complete: jest.fn().mockRejectedValue(new Error('LLM error'))
      };
      for (let i = 0; i < 15; i++) {
        service.addMessage({ content: 'test content', role: 'user' });
      }
      const result = await service.compact({ llm: mockLLM, summarizePrompt: 'X: {content}' });
      expect(result.success).toBe(true);
      expect(result.summary.length).toBeLessThanOrEqual(20000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Compact] LLM summary failed'),
        expect.any(String)
      );
    });

    test('should emit compactError on failure', async () => {
      const handler = jest.fn();
      service.on('compactError', handler);
      for (let i = 0; i < 10; i++) {
        service.addMessage({ content: 'test', role: 'user' });
      }
      await expect(service.compact()).rejects.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].success).toBe(false);
    });

    test('should auto-disable after consecutiveFailureLimit', async () => {
      const handler = jest.fn();
      service.on('autoCompactDisabled', handler);
      for (let i = 0; i < 3; i++) {
        service.messages = [];
        for (let j = 0; j < 10; j++) {
          service.messages.push({
            content: `test ${i} ${j}`,
            role: 'user',
            timestamp: Date.now(),
            uuid: service._generateUUID()
          });
        }
        service._updateTokenCount();
        await expect(service.compact()).rejects.toThrow();
      }
      expect(service.autoCompactEnabled).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].reason).toBe('consecutive_failures');
      expect(handler.mock.calls[0][0].failures).toBe(3);
    });

    test('should handle array content in text extraction', async () => {
      service.addMessage({ content: [{ text: 'block1' }, { text: 'block2' }], role: 'user' });
      service.addMessage({ content: 'plain text', role: 'user' });
      for (let i = 0; i < 14; i++) {
        service.addMessage({ content: `msg ${i}`, role: 'user' });
      }
      const result = await service.compact();
      expect(result.success).toBe(true);
    });

    test('should handle array content blocks without text property', async () => {
      service.addMessage({ content: [{ text: 'text1' }, { alt: 'no_text_here' }], role: 'user' });
      service.addMessage({ content: [{ type: 'image', url: 'img.png' }], role: 'user' });
      for (let i = 0; i < 14; i++) {
        service.addMessage({ content: `msg ${i}`, role: 'user' });
      }
      const result = await service.compact();
      expect(result.success).toBe(true);
    });

    test('should use original text when LLM response lacks text property', async () => {
      const mockLLM = {
        complete: jest.fn().mockResolvedValue({ content: 'summary without text field' })
      };
      for (let i = 0; i < 15; i++) {
        service.addMessage({ content: `Message ${i}`, role: 'user' });
      }
      const result = await service.compact({ llm: mockLLM, summarizePrompt: 'X: {content}' });
      expect(result.success).toBe(true);
      expect(result.summary).toContain('Message');
    });

    test('should handle non-string non-array content in text extraction', async () => {
      service.addMessage({ content: 12345, role: 'user' });
      service.addMessage({ content: true, role: 'user' });
      for (let i = 0; i < 14; i++) {
        service.addMessage({ content: `msg ${i}`, role: 'user' });
      }
      const result = await service.compact();
      expect(result.success).toBe(true);
    });

    test('should use default summarizer when summarizePrompt provided without llm', async () => {
      for (let i = 0; i < 15; i++) {
        service.addMessage({ content: `message ${i} content here`, role: 'user' });
      }
      const result = await service.compact({ summarizePrompt: 'Please summarize: {content}' });
      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
    });
  });

  describe('microCompact', () => {
    test('should truncate long tool results', async () => {
      const longContent = 'x'.repeat(10000);
      service.addMessage({ type: 'tool_result', content: longContent });
      service.addMessage({ type: 'user', content: 'short' });
      const result = await service.microCompact();
      expect(result.success).toBe(true);
      expect(result.type).toBe('micro');
      expect(result.tokensSaved).toBeGreaterThan(0);
      const toolMsg = service.messages.find(function (m) { return m.type === 'tool_result'; });
      expect(toolMsg.content.length).toBe(5015);
      expect(toolMsg.content.endsWith('...[truncated]')).toBe(true);
    });

    test('should handle array content in truncation', async () => {
      const longText = 'y'.repeat(10000);
      service.addMessage({ type: 'tool_result', content: [{ text: longText }] });
      const result = await service.microCompact();
      expect(result.success).toBe(true);
      expect(result.tokensSaved).toBeGreaterThan(0);
    });

    test('should handle array content blocks without text in truncation', async () => {
      const longText = 'z'.repeat(10000);
      service.addMessage({ type: 'tool_result', content: [{ text: longText }, { type: 'image', data: 'base64' }] });
      const result = await service.microCompact();
      expect(result.success).toBe(true);
      expect(result.tokensSaved).toBeGreaterThan(0);
    });

    test('should not truncate short content', async () => {
      service.addMessage({ type: 'tool_result', content: 'short' });
      const result = await service.microCompact();
      expect(result.tokensSaved).toBe(0);
    });

    test('should emit microCompact event', async () => {
      const handler = jest.fn();
      service.on('microCompact', handler);
      service.addMessage({ type: 'tool_result', content: 'x'.repeat(10000) });
      await service.microCompact();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('autoCompactIfNeeded', () => {
    test('should skip when auto-compact disabled', async () => {
      service.autoCompactEnabled = false;
      const result = await service.autoCompactIfNeeded();
      expect(result.shouldCompact).toBe(false);
      expect(result.reason).toBe('disabled');
    });

    test('should skip on circuit breaker', async () => {
      service.consecutiveFailures = 3;
      const result = await service.autoCompactIfNeeded();
      expect(result.shouldCompact).toBe(false);
      expect(result.reason).toBe('circuit_breaker');
    });

    test('should skip when under threshold', async () => {
      const result = await service.autoCompactIfNeeded();
      expect(result.shouldCompact).toBe(false);
      expect(result.reason).toBe('under_threshold');
    });

    test('should attempt micro compact when possible', async () => {
      const big = 'a'.repeat(387996);
      service.addMessage({ content: big, type: 'tool_result' });
      const result = await service.autoCompactIfNeeded();
      expect(result.shouldCompact).toBe(true);
      expect(result.type).toBe('micro');
    });

    test('should fall back to full compact when micro not possible', async () => {
      const big = 'a'.repeat(392000);
      service.addMessage({ content: big, role: 'user' });
      for (let i = 0; i < 11; i++) {
        service.addMessage({ content: 'short', role: 'user' });
      }
      const result = await service.autoCompactIfNeeded();
      expect(result.shouldCompact).toBe(true);
      expect(result.type).toBe('full');
    });

    test('should handle compact failure gracefully', async () => {
      for (let i = 0; i < 10; i++) {
        service.addMessage({ content: 'x'.repeat(100), role: 'user' });
      }
      service.tokenCount = 98000;
      const result = await service.autoCompactIfNeeded();
      expect(result.shouldCompact).toBe(false);
      expect(result.reason).toBe('compact_failed');
    });
  });

  describe('createBoundaryMessage', () => {
    test('should create a system boundary message', () => {
      const boundary = service.createBoundaryMessage(100, 50, 'summary text');
      expect(boundary.type).toBe('system');
      expect(boundary.role).toBe('system');
      expect(boundary.content).toContain('100');
      expect(boundary.content).toContain('50');
      expect(boundary.content).toContain('summary text');
      expect(boundary.isCompactBoundary).toBe(true);
      expect(boundary.compactMetadata.preCompactTokenCount).toBe(100);
      expect(boundary.compactMetadata.postCompactTokenCount).toBe(50);
      expect(boundary.uuid).toBeDefined();
      expect(boundary.timestamp).toBeDefined();
    });
  });

  describe('getMessagesAfterBoundary', () => {
    test('should return messages after boundary', () => {
      service.addMessage({ content: 'first' });
      service.addMessage({ content: 'second' });
      service.messages.unshift({
        type: 'system',
        role: 'system',
        content: '[Earlier conversation summarized. 100 to 50 tokens]',
        isCompactBoundary: true,
        timestamp: Date.now(),
        uuid: service._generateUUID()
      });
      const after = service.getMessagesAfterBoundary();
      expect(after).toHaveLength(2);
      expect(after[0].content).toBe('first');
    });

    test('should return all messages when no boundary exists', () => {
      service.addMessage({ content: 'first' });
      service.addMessage({ content: 'second' });
      const after = service.getMessagesAfterBoundary();
      expect(after).toHaveLength(2);
    });

    test('should find boundary by system type with summarized content', () => {
      service.addMessage({ content: 'first' });
      service.addMessage({ content: 'second' });
      service.messages.unshift({
        type: 'system',
        role: 'system',
        content: '[Conversation summarized. 100 to 50 tokens]',
        timestamp: Date.now(),
        uuid: service._generateUUID()
      });
      const after = service.getMessagesAfterBoundary();
      expect(after).toHaveLength(2);
      expect(after[0].content).toBe('first');
    });
  });

  describe('getStats', () => {
    test('should return current stats with history', async () => {
      for (let i = 0; i < 15; i++) {
        service.addMessage({ content: `msg ${i}` });
      }
      await service.compact();
      const stats = service.getStats();
      expect(stats.currentTokens).toBeDefined();
      expect(stats.maxTokens).toBe(100000);
      expect(stats.messageCount).toBeGreaterThan(0);
      expect(stats.compactionCount).toBe(1);
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.autoCompactEnabled).toBe(true);
      expect(stats.lastCompactTime).toBeDefined();
      expect(stats.history).toHaveLength(1);
    });
  });

  describe('reset', () => {
    test('should clear state and emit reset event', () => {
      const handler = jest.fn();
      service.on('reset', handler);
      service.addMessage({ content: 'test' });
      service.tokenCount = 100;
      service.turnCounter = 5;
      service.reset();
      expect(service.messages).toEqual([]);
      expect(service.tokenCount).toBe(0);
      expect(service.turnCounter).toBe(0);
      expect(service.compactionHistory).toEqual([]);
      expect(service.consecutiveFailures).toBe(0);
      expect(service.lastCompactTime).toBeNull();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
