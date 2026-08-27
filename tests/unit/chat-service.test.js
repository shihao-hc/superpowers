const chatService = require('../../server/services/chatService');

describe('ChatService (BrainSystem-wired)', () => {
  beforeEach(() => {
    chatService.conversations.clear();
    jest.restoreAllMocks();
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

    it('falls back to canned when no bridge available', async () => {
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = null;
      chatService._ollamaTried = true;
      try {
        const conv = { personality: 'default', messages: [{ role: 'user', content: 'hi' }], context: {} };
        const r = await chatService.generateResponse('hi', conv);
        expect(r.source).toBe('fallback');
        expect(r.text).toBeTruthy();
      } finally {
        chatService.ollamaBridge = origBridge;
        chatService._ollamaTried = false;
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
});