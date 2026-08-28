const chatService = require('../../server/services/chatService');

describe('ChatService (BrainSystem-wired)', () => {
  beforeEach(() => {
    chatService.conversations.clear();
    jest.restoreAllMocks();
    // 默认 mock bridge，避免测试触发真实 Ollama（慢/超时）
    chatService.ollamaBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'mock reply' }) };
  });

  afterEach(() => {
    chatService.ollamaBridge = null;
    chatService._ollamaTried = false;
    // 清理 BrainSystem 共享实例的定时器（forceThink 经 _getSharedInstance 创建）
    const { BrainSystem } = require('../../src/core/BrainSystem');
    const inst = BrainSystem._sharedInstance;
    if (inst) {
      if (inst.selfCheckInterval) { clearInterval(inst.selfCheckInterval); inst.selfCheckInterval = null; }
      if (inst.monitoringInterval) { clearInterval(inst.monitoringInterval); inst.monitoringInterval = null; }
    }
  });

  describe('processMessage', () => {
    it('returns a reply and stores conversation', async () => {
      const res = await chatService.processMessage({ text: '你好', userId: 'u1' });
      expect(res.text).toBeTruthy();
      expect(res.personality).toBe('default');
      expect(chatService.conversations.get('u1').messages).toHaveLength(2);
    });

    it('stores lastIntent via BrainSystem.analyzeIntent', async () => {
      await chatService.processMessage({ text: '帮我写一个排序算法', userId: 'u2' });
      const conv = chatService.conversations.get('u2');
      expect(conv.context.lastIntent).toBeDefined();
      expect(conv.context.lastIntent.intent).toBe('code');
    });

    it('persists memory via BrainSystem.smartStore', async () => {
      const smartStoreSpy = jest.spyOn(require('../../src/core/BrainSystem').BrainSystem, 'smartStore');
      await chatService.processMessage({ text: '记录一下', userId: 'u3' });
      expect(smartStoreSpy).toHaveBeenCalled();
      smartStoreSpy.mockRestore();
    });

    it('still replies even if BrainSystem is unavailable', async () => {
      const realRequire = module.constructor.prototype.require;
      module.constructor.prototype.require = function (id) {
        if (id.includes('src/core/BrainSystem')) {throw new Error('brain unavailable');}
        return realRequire.call(this, id);
      };
      try {
        const res = await chatService.processMessage({ text: '测试', userId: 'u4' });
        expect(res.text).toBeTruthy();
      } finally {
        module.constructor.prototype.require = realRequire;
      }
    });

    it('uses provided personality', async () => {
      const res = await chatService.processMessage({ text: 'hi', userId: 'u5', personality: 'professional' });
      expect(res.personality).toBe('professional');
    });

    it('emits message:error and throws when generation fails', async () => {
      const errorListener = jest.fn();
      chatService.on('message:error', errorListener);
      const genSpy = jest.spyOn(chatService, 'generateResponse').mockRejectedValue(new Error('gen boom'));
      try {
        await expect(chatService.processMessage({ text: 'x', userId: 'u6' })).rejects.toThrow('gen boom');
        expect(errorListener).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u6' }));
        expect(chatService.stats.errors).toBeGreaterThan(0);
      } finally {
        genSpy.mockRestore();
        chatService.off('message:error', errorListener);
      }
    });
  });

  describe('generateResponse (LLM wiring)', () => {
    it('uses Ollama when bridge is available', async () => {
      const mockBridge = {
        chat: jest.fn().mockResolvedValue({ ok: true, text: '模型推理回复' })
      };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      try {
        const conv = { personality: 'default', messages: [{ role: 'user', content: 'hi' }], context: {} };
        const r = await chatService.generateResponse('hi', conv);
        expect(r.source).toBe('ollama');
        expect(r.text).toBe('模型推理回复');
        expect(mockBridge.chat).toHaveBeenCalled();
      } finally {
        chatService.ollamaBridge = origBridge;
      }
    });

    it('includes personality and intent in the LLM system prompt', async () => {
      const mockBridge = {
        chat: jest.fn().mockResolvedValue({ ok: true, text: 'r' })
      };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      try {
        const conv = { personality: 'professional', context: { lastIntent: { intent: 'code' } }, messages: [{ role: 'user', content: 'hi' }] };
        await chatService.generateResponse('hi', conv);
        const systemPrompt = mockBridge.chat.mock.calls[0][0][0].content;
        expect(systemPrompt).toContain('professional');
        expect(systemPrompt).toContain('code');
      } finally {
        chatService.ollamaBridge = origBridge;
      }
    });

    it('falls back to canned when Ollama fails', async () => {
      const mockBridge = {
        chat: jest.fn().mockRejectedValue(new Error('ollama down'))
      };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      try {
        const conv = { personality: 'default', messages: [{ role: 'user', content: 'hi' }], context: {} };
        const r = await chatService.generateResponse('hi', conv);
        expect(r.source).toBe('fallback');
        expect(r.text).toBeTruthy();
      } finally {
        chatService.ollamaBridge = origBridge;
      }
    });

    it('retries Ollama call on transient failure', async () => {
      const mockBridge = {
        chat: jest.fn()
          .mockRejectedValueOnce(new Error('transient'))
          .mockResolvedValueOnce({ ok: true, text: 'recovered' })
      };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      try {
        const conv = { personality: 'default', messages: [{ role: 'user', content: 'hi' }], context: {} };
        const r = await chatService.generateResponse('hi', conv);
        expect(r.source).toBe('ollama');
        expect(r.text).toBe('recovered');
        expect(mockBridge.chat.mock.calls.length).toBeGreaterThan(1);
      } finally {
        chatService.ollamaBridge = origBridge;
      }
    });
  });

  describe('processStream', () => {
    it('streams chunks and calls onEnd', async () => {
      const chunks = [];
      let ended = false;
      await chatService.processStream({
        text: '流', userId: 's1',
        onData: (d) => chunks.push(d),
        onEnd: () => { ended = true; },
        onError: () => {}
      });
      expect(chunks.length).toBeGreaterThan(0);
      expect(ended).toBe(true);
    });

    it('calls onError when streaming fails', async () => {
      const errorSpy = jest.fn();
      // 使 stream 内部抛错：mock setTimeout 抛错或让 onData 抛错
      const onData = jest.fn(() => { throw new Error('stream data error'); });
      await chatService.processStream({
        text: '错误', userId: 's2',
        onData,
        onEnd: () => {},
        onError: errorSpy
      });
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('getHistory / clearHistory', () => {
    it('returns history for a user', async () => {
      await chatService.processMessage({ text: 'h1', userId: 'h1' });
      const history = await chatService.getHistory('h1');
      expect(history.messages.length).toBeGreaterThan(0);
      expect(history.total).toBeGreaterThan(0);
    });

    it('clears history', async () => {
      await chatService.processMessage({ text: 'h2', userId: 'h2' });
      await chatService.clearHistory('h2');
      const history = await chatService.getHistory('h2');
      expect(history.messages).toEqual([]);
      expect(history.total).toBe(0);
    });

    it('returns empty for unknown user', async () => {
      const history = await chatService.getHistory('nobody');
      expect(history).toEqual({ messages: [], total: 0 });
    });
  });

  describe('getStats', () => {
    it('returns stats with active conversations', async () => {
      await chatService.processMessage({ text: 's', userId: 's1' });
      const stats = chatService.getStats();
      expect(stats.totalMessages).toBeGreaterThan(0);
      expect(stats.activeConversations).toBe(1);
      expect(stats.averageLatency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanupInactiveSessions', () => {
    it('cleans inactive conversations', async () => {
      const conv = {
        id: 'old', messages: [], personality: 'default', context: {},
        createdAt: new Date(), lastActivity: new Date(Date.now() - 7200000)
      };
      chatService.conversations.set('old', conv);
      const cleaned = chatService.cleanupInactiveSessions(3600000);
      expect(cleaned).toBe(1);
      expect(chatService.conversations.has('old')).toBe(false);
    });

    it('keeps active conversations', async () => {
      const conv = {
        id: 'fresh', messages: [], personality: 'default', context: {},
        createdAt: new Date(), lastActivity: new Date()
      };
      chatService.conversations.set('fresh', conv);
      const cleaned = chatService.cleanupInactiveSessions(3600000);
      expect(cleaned).toBe(0);
    });
  });

  describe('error paths', () => {
    it('truncates messages beyond 100', async () => {
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'ok' }) };
      try {
        for (let i = 0; i < 55; i++) {
          await chatService.processMessage({ text: `msg ${i}`, userId: 'bulk' });
        }
        const conv = chatService.conversations.get('bulk');
        expect(conv.messages.length).toBeLessThanOrEqual(100);
      } finally {
        chatService.ollamaBridge = origBridge;
      }
    });

    it('still replies when Ollama fails (fallback)', async () => {
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = { chat: jest.fn().mockRejectedValue(new Error('boom')) };
      chatService._ollamaTried = false;
      try {
        const res = await chatService.processMessage({ text: 'x', userId: 'e1' });
        expect(res.text).toBeTruthy();
      } finally {
        chatService.ollamaBridge = origBridge;
        chatService._ollamaTried = false;
      }
    });
  });
});