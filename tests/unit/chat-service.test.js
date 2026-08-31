const chatService = require('../../server/services/chatService');

describe('ChatService (BrainSystem-wired)', () => {
  beforeEach(() => {
    chatService.conversations.clear();
    jest.restoreAllMocks();
    // 默认 mock bridge，避免测试触发真实 Ollama（慢/超时）
    chatService.ollamaBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'mock reply' }) };
    // 禁用 MCP 初始化（避免测试 spawn 真实 MCP 进程导致挂起）
    chatService._mcpTried = true;
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
      expect(res.source).toBe('ollama');
      expect(chatService.conversations.get('u1').messages).toHaveLength(2);
    });

    it('stores lastIntent via BrainSystem.analyzeIntent', async () => {
      await chatService.processMessage({ text: '帮我写一个排序算法', userId: 'u2' });
      const conv = chatService.conversations.get('u2');
      expect(conv.context.lastIntent).toBeDefined();
      expect(conv.context.lastIntent.intent).toBe('code');
    });

    it('does NOT persist memory for anonymous users (H3 fix)', async () => {
      const smartStoreSpy = jest.spyOn(require('../../src/core/BrainSystem').BrainSystem, 'smartStore');
      try {
        await chatService.processMessage({ text: '注入危险内容', userId: 'anonymous' });
        expect(smartStoreSpy).not.toHaveBeenCalled();
      } finally {
        smartStoreSpy.mockRestore();
      }
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

    it('executes tool calls when LLM returns tool_calls', async () => {
      const toolResults = [{ tool: 'generate_document', ok: true, result: { type: 'docx', message: 'generated' } }];
      const mockBridge = {
        chat: jest.fn()
          .mockResolvedValueOnce({
            ok: true,
            text: '',
            tool_calls: [{ function: { name: 'generate_document', arguments: { type: 'docx', title: '测试' } } }]
          })
          .mockResolvedValueOnce({ ok: true, text: '已生成文档' })
      };
      const origBridge = chatService.ollamaBridge;
      const execSpy = jest.spyOn(chatService, '_executeToolCalls').mockResolvedValue(toolResults);
      try {
        chatService.ollamaBridge = mockBridge;
        const conv = { personality: 'default', messages: [{ role: 'user', content: '生成文档' }], context: {} };
        const r = await chatService.generateResponse('帮我生成一份Word文档', conv);
        expect(r.source).toBe('ollama');
        expect(r.text).toBe('已生成文档');
        expect(r.toolResults).toEqual(toolResults);
        expect(execSpy).toHaveBeenCalled();
        expect(mockBridge.chat.mock.calls.length).toBe(2);
      } finally {
        chatService.ollamaBridge = origBridge;
        execSpy.mockRestore();
      }
    });

    it('supports multi-round tool calls (read file then generate doc)', async () => {
      const mockBridge = {
        chat: jest.fn()
          .mockResolvedValueOnce({
            ok: true,
            text: '',
            tool_calls: [{ function: { name: 'filesystem:read_file', arguments: { path: '/tmp/a.txt' } } }]
          })
          .mockResolvedValueOnce({
            ok: true,
            text: '',
            tool_calls: [{ function: { name: 'generate_document', arguments: { type: 'docx', title: '总结' } } }]
          })
          .mockResolvedValueOnce({ ok: true, text: '已基于文件内容生成文档' })
      };
      const origBridge = chatService.ollamaBridge;
      const execSpy = jest.spyOn(chatService, '_executeToolCalls').mockResolvedValue([{ tool: 'x', ok: true, result: {} }]);
      try {
        chatService.ollamaBridge = mockBridge;
        const conv = { personality: 'default', messages: [{ role: 'user', content: '读文件并生成总结' }], context: {} };
        const r = await chatService.generateResponse('请读取文件并生成一份总结文档', conv);
        expect(r.text).toBe('已基于文件内容生成文档');
        expect(r.toolResults).toHaveLength(2); // 2 轮工具结果
        expect(execSpy).toHaveBeenCalledTimes(2);
        expect(mockBridge.chat.mock.calls.length).toBe(3); // 1 首轮 + 2 工具回填
      } finally {
        chatService.ollamaBridge = origBridge;
        execSpy.mockRestore();
      }
    });

    it('reports truncated when tool loop hits max rounds without final text', async () => {
      const mockBridge = {
        chat: jest.fn().mockImplementation(() => Promise.resolve({
          ok: true,
          text: '',
          tool_calls: [{ function: { name: 'generate_document', arguments: { type: 'docx' } } }]
        }))
      };
      const origBridge = chatService.ollamaBridge;
      const execSpy = jest.spyOn(chatService, '_executeToolCalls').mockResolvedValue([{ tool: 'x', ok: true, result: {} }]);
      try {
        chatService.ollamaBridge = mockBridge;
        const conv = { personality: 'default', messages: [{ role: 'user', content: 'x' }], context: {} };
        const r = await chatService.generateResponse('生成文档', conv);
        expect(r.truncated).toBe(true);
        expect(r.toolResults.length).toBe(4); // 4 轮工具执行
        expect(mockBridge.chat.mock.calls.length).toBe(5); // 1 首轮 + 4 工具轮
      } finally {
        chatService.ollamaBridge = origBridge;
        execSpy.mockRestore();
      }
    });

    it('_executeToolCalls fails honestly for placeholder skill (no real executor)', async () => {
      // '../../evil' 或未知类型 → AsyncExecutor placeholder → 诚实失败而非假装成功
      const r1 = await chatService._executeToolCalls([{ function: { name: 'generate_document', arguments: { type: '../../evil' } } }]);
      expect(r1[0].ok).toBe(false);
      expect(r1[0].error).toContain('placeholder');
      const r2 = await chatService._executeToolCalls([{ function: { name: 'generate_document', arguments: { type: 'mystery' } } }]);
      expect(r2[0].ok).toBe(false);
    }, 20000);

    it('_executeToolCalls rejects unknown tools', async () => {
      const r = await chatService._executeToolCalls([{ function: { name: 'not_a_tool', arguments: {} } }]);
      expect(r[0].ok).toBe(false);
      expect(r[0].error).toContain('Unknown tool');
    });

    it('_executeToolCalls dispatches read-only MCP tools', async () => {
      const mockPlugin = {
        executeTool: jest.fn().mockResolvedValue({ content: 'file contents' })
      };
      chatService._mcpPlugin = mockPlugin;
      chatService._mcpTried = true;
      try {
        const r = await chatService._executeToolCalls([
          { function: { name: 'filesystem:read_file', arguments: { path: '/tmp/a.txt' } } }
        ]);
        expect(r[0].ok).toBe(true);
        expect(mockPlugin.executeTool).toHaveBeenCalledWith('filesystem:read_file', { path: '/tmp/a.txt' });
      } finally {
        chatService._mcpPlugin = null;
      }
    });

    it('_executeToolCalls rejects write MCP tools (read-only allowlist)', async () => {
      const mockPlugin = {
        executeTool: jest.fn()
      };
      chatService._mcpPlugin = mockPlugin;
      chatService._mcpTried = true;
      try {
        const r = await chatService._executeToolCalls([
          { function: { name: 'filesystem:write_file', arguments: { path: '/tmp/x.txt', content: 'x' } } }
        ]);
        expect(r[0].ok).toBe(false);
        expect(r[0].error).toContain('not allowed');
        expect(mockPlugin.executeTool).not.toHaveBeenCalled();
      } finally {
        chatService._mcpPlugin = null;
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

describe('ChatService conversation persistence', () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const origCwd = process.cwd();
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-persist-'));
    process.chdir(tmpDir);
    jest.resetModules();
  });

  afterEach(() => {
    process.chdir(origCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* */ }
  });

  it('persists and restores conversation across restart', () => {
    const svc1 = require('../../server/services/chatService');
    svc1.conversations.set('u1', {
      id: 'u1', personality: 'professional', context: { lastIntent: { intent: 'code' } },
      messages: [{ role: 'user', content: 'hi', timestamp: new Date() }],
      lastActivity: new Date()
    });
    svc1._saveConversations();
    const convFile = path.join(tmpDir, 'data', 'conversations.json');
    expect(fs.existsSync(convFile)).toBe(true);

    // 模拟重启：重新 require 模块（新 cwd 下 CONVERSATIONS_FILE 指向 tmpDir/data）
    jest.resetModules();
    const svc2 = require('../../server/services/chatService');
    const conv = svc2.conversations.get('u1');
    expect(conv).toBeDefined();
    expect(conv.personality).toBe('professional');
    expect(conv.messages).toHaveLength(1);
    expect(conv.context.lastIntent.intent).toBe('code');
    expect(conv.messages[0].timestamp instanceof Date).toBe(true);
  });
});