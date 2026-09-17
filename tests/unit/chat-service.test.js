const chatService = require('../../server/services/chatService');

describe('ChatService (BrainSystem-wired)', () => {
  beforeEach(() => {
    chatService.conversations.clear();
    jest.restoreAllMocks();
    // 阻止 processMessage 写真实记忆库（测试隔离，防污染 .opencode/evolution/memory.json）
    const { BrainSystem } = require('../../src/core/BrainSystem');
    jest.spyOn(BrainSystem, 'smartStore').mockImplementation(() => {});
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

    it('retries once when LLM returns empty text, then returns the retried reply', async () => {
      const mockBridge = {
        chat: jest.fn()
          .mockResolvedValueOnce({ ok: true, text: '' })
          .mockResolvedValueOnce({ ok: true, text: '重试后的回复' })
      };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      try {
        const conv = { personality: 'default', messages: [{ role: 'user', content: 'hi' }], context: {} };
        const r = await chatService.generateResponse('hi', conv);
        expect(r.source).toBe('ollama');
        expect(r.text).toBe('重试后的回复');
        expect(mockBridge.chat.mock.calls.length).toBe(2);
      } finally {
        chatService.ollamaBridge = origBridge;
      }
    });

    it('marks empty-response honestly when retry still returns empty text (not fake "unavailable")', async () => {
      const mockBridge = {
        chat: jest.fn().mockResolvedValue({ ok: true, text: '' })
      };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      try {
        const conv = { personality: 'default', messages: [{ role: 'user', content: 'hi' }], context: {} };
        const r = await chatService.generateResponse('hi', conv);
        expect(r.source).toBe('empty-response');
        expect(r.text).toContain('空内容');
        expect(mockBridge.chat.mock.calls.length).toBe(2); // 首轮 + 重试
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

    it('handles invalid tool_calls elements (LLM hallucination) without throwing', async () => {
      const results = await chatService._executeToolCalls([null, 'bad', 42]);
      expect(results.length).toBe(3);
      expect(results.every((r) => r.ok === false)).toBe(true);
      expect(results.every((r) => r.error.includes('Invalid tool call'))).toBe(true);
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
        // 所有轮次都必须传 tools schema（否则 Ollama 无法返回 tool_calls）
        for (const call of mockBridge.chat.mock.calls) {
          expect(call[1]).toEqual(expect.objectContaining({ tools: expect.any(Array) }));
        }
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

    it('honestly reports tool results when summary LLM call fails (partial success)', async () => {
      const mockBridge = {
        chat: jest.fn()
          .mockResolvedValueOnce({
            ok: true,
            text: '',
            tool_calls: [{ function: { name: 'generate_document', arguments: { type: 'docx', title: '报告' } } }]
          })
          .mockRejectedValueOnce(new Error('ollama died after tool exec'))
      };
      const origBridge = chatService.ollamaBridge;
      const execSpy = jest.spyOn(chatService, '_executeToolCalls').mockResolvedValue([{ tool: 'generate_document', ok: true, result: { type: 'docx', message: '已生成' } }]);
      try {
        chatService.ollamaBridge = mockBridge;
        const conv = { personality: 'default', messages: [{ role: 'user', content: '生成报告' }], context: {} };
        const r = await chatService.generateResponse('帮我生成一份报告', conv);
        // 工具已执行，LLM 失败 → 诚实告知工具结果，非 canned fallback
        expect(r.toolResults).toBeDefined();
        expect(r.toolResults.length).toBeGreaterThan(0);
        expect(r.text).toContain('DOCX');
      } finally {
        chatService.ollamaBridge = origBridge;
        execSpy.mockRestore();
        chatService._lastToolResults = null;
      }
    });

    it('generates documents via rule-based fallback when Ollama is unavailable', async () => {
      const origGetBridge = chatService._getOllamaBridge;
      const origExec = chatService._executeToolCalls;
      // Ollama 完全不可用
      chatService._getOllamaBridge = () => null;
      chatService._executeToolCalls = jest.fn().mockResolvedValue([{ tool: 'generate_document', ok: true, result: { type: 'docx', message: '已生成' } }]);
      try {
        const conv = { personality: 'default', messages: [], context: {} };
        const r = await chatService.generateResponse('帮我生成一份标题为"测试"的 Word 文档', conv, 'rule-user');
        expect(r.ruleBased).toBe(true);
        expect(r.source).toBe('rule-based');
        expect(r.toolResults.length).toBeGreaterThan(0);
        expect(chatService._executeToolCalls).toHaveBeenCalled();
      } finally {
        chatService._getOllamaBridge = origGetBridge;
        chatService._executeToolCalls = origExec;
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

    it('_executeToolCalls returns real file path for generated documents', async () => {
      // 真实执行：AsyncExecutor + XlsxExecutor 生成文件，验证路径透传（L238 提取修复）
      const os = require('os');
      const fs2 = require('fs');
      const path2 = require('path');
      const origCwd = process.cwd();
      const tmpDir = fs2.mkdtempSync(path2.join(os.tmpdir(), 'tool-path-'));
      process.chdir(tmpDir);
      try {
        const r = await chatService._executeToolCalls([
          { function: { name: 'generate_document', arguments: { type: 'xlsx', title: '路径测试' } } }
        ]);
        expect(r[0].ok).toBe(true);
        expect(r[0].result.path).toBeTruthy();
        expect(r[0].result.path.endsWith('.xlsx')).toBe(true);
        // 文件真实存在
        expect(fs2.existsSync(r[0].result.path)).toBe(true);
      } finally {
        process.chdir(origCwd);
        try { fs2.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* */ }
      }
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

    it('streams real Ollama output via async iterable', async () => {
      async function* fakeStream() {
        yield { message: { content: '你' }, done: false };
        yield { message: { content: '好' }, done: false };
        yield { message: { content: '！' }, done: true };
      }
      const mockBridge = { chat: jest.fn().mockResolvedValue(fakeStream()) };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      const chunks = [];
      let endSource = null;
      try {
        await chatService.processStream({
          text: '你好', userId: 'stream-real',
          onData: (d) => chunks.push(d),
          onEnd: (r) => { endSource = r.source; },
          onError: () => {}
        });
        expect(mockBridge.chat).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ stream: true }));
        expect(chunks.length).toBe(3);
        expect(endSource).toBe('ollama');
      } finally {
        chatService.ollamaBridge = origBridge;
      }
    });

    it('emits honest text when the stream yields no content (not silent empty)', async () => {
      async function* emptyStream() { /* 无任何 chunk */ }
      const mockBridge = { chat: jest.fn().mockResolvedValue(emptyStream()) };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      let endInfo = null;
      const chunks = [];
      try {
        await chatService.processStream({
          text: '你好', userId: 'stream-empty',
          onData: (d) => chunks.push(d),
          onEnd: (r) => { endInfo = r; },
          onError: () => {}
        });
        expect(endInfo.text).toContain('空内容');
        expect(chunks.some((c) => (c.content || '').includes('空内容'))).toBe(true);
      } finally {
        chatService.ollamaBridge = origBridge;
      }
    });

    it('supports multi-round tool calls in the stream path', async () => {
      let calls = 0;
      const mockBridge = {
        chat: jest.fn(async () => {
          calls++;
          if (calls === 1) return { ok: true, text: '', tool_calls: [{ function: { name: 'generate_document', arguments: { type: 'xlsx', title: 'A' } } }] };
          if (calls === 2) return { ok: true, text: '', tool_calls: [{ function: { name: 'generate_document', arguments: { type: 'docx', title: 'B' } } }] };
          return { ok: true, text: '已完成' };
        })
      };
      const origBridge = chatService.ollamaBridge;
      const origExec = chatService._executeToolCalls;
      chatService._executeToolCalls = jest.fn().mockResolvedValue([{ tool: 'x', ok: true, result: {} }]);
      chatService._mcpTried = true;
      let endInfo = null;
      try {
        chatService.ollamaBridge = mockBridge;
        await chatService.processStream({
          text: '帮我生成 Excel 和 Word 文档', userId: 'stream-multi-round',
          onData: () => {}, onEnd: (r) => { endInfo = r; }, onError: () => {}
        });
        expect(endInfo).toBeDefined();
        expect(endInfo.toolResults.length).toBe(2); // 2 轮工具
        expect(calls).toBe(3); // 1 首轮 + 2 工具轮
      } finally {
        chatService.ollamaBridge = origBridge;
        chatService._executeToolCalls = origExec;
      }
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

  describe('context compaction', () => {
    it('compacts conversation when shouldCompact is true', async () => {
      const { ContextCompactService } = require('../../src/agent/ContextCompactService');
      const cc = new ContextCompactService();
      const shouldSpy = jest.spyOn(cc, 'shouldCompact').mockReturnValue(true);
      const compactSpy = jest.spyOn(cc, 'compact').mockResolvedValue({
        success: true, preTokens: 1000, postTokens: 500
      });
      cc.messages = [
        { role: 'system', content: '[Earlier conversation summarized]', timestamp: Date.now() },
        { role: 'user', content: '最近消息', timestamp: Date.now() }
      ];
      chatService._contextCompacts.set('compact-1', cc);
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: '回复' }) };
      const origExec = chatService._executeToolCalls;
      chatService._executeToolCalls = jest.fn().mockResolvedValue([]);
      try {
        await chatService.processMessage({ text: '触发压缩', userId: 'compact-1' });
        const conv = chatService.conversations.get('compact-1');
        expect(conv.messages.length).toBeGreaterThan(0);
        expect(conv.messages[0].content).toContain('summarized');
      } finally {
        chatService.ollamaBridge = origBridge;
        chatService._executeToolCalls = origExec;
        chatService._contextCompacts.delete('compact-1');
        shouldSpy.mockRestore();
        compactSpy.mockRestore();
      }
    });

    it('does not mix another user messages into this conversation on compaction (cross-user isolation)', async () => {
      const { ContextCompactService } = require('../../src/agent/ContextCompactService');
      // 用户 A：压缩触发，只有 A 自己的消息
      const ccA = new ContextCompactService();
      jest.spyOn(ccA, 'shouldCompact').mockReturnValue(true);
      jest.spyOn(ccA, 'compact').mockResolvedValue({ success: true, preTokens: 1, postTokens: 1 });
      ccA.messages = [{ role: 'user', content: 'A 自己的消息', timestamp: Date.now() }];
      chatService._contextCompacts.set('isolated-A', ccA);
      // 用户 B：独立实例，消息不应进入 A 的会话
      const ccB = new ContextCompactService();
      ccB.addMessage({ role: 'user', content: 'B 的机密内容', timestamp: Date.now() });
      chatService._contextCompacts.set('isolated-B', ccB);
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'ok' }) };
      try {
        await chatService.processMessage({ text: '触发', userId: 'isolated-A' });
        const convA = chatService.conversations.get('isolated-A');
        const allText = convA.messages.map((m) => m.content).join(' ');
        expect(allText).toContain('A 自己的消息');
        expect(allText).not.toContain('B 的机密内容');
      } finally {
        chatService.ollamaBridge = origBridge;
        chatService._contextCompacts.delete('isolated-A');
        chatService._contextCompacts.delete('isolated-B');
      }
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

    it('includes tool usage counters in stats structure', async () => {
      const stats = chatService.getStats();
      expect(stats.tools).toBeDefined();
      expect(stats.tools).toHaveProperty('calls');
      expect(stats.tools).toHaveProperty('success');
      expect(stats.tools).toHaveProperty('failed');
      expect(stats.tools).toHaveProperty('filesGenerated');
      expect(stats.tools).toHaveProperty('byType');
    });

    it('tracks real token usage from LLM responses into stats.tokens', async () => {
      const mockBridge = {
        chat: jest.fn().mockResolvedValue({ ok: true, text: 'r', promptEvalCount: 120, evalCount: 45 })
      };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      const before = { ...chatService.stats.tokens };
      try {
        const conv = { personality: 'default', messages: [{ role: 'user', content: 'hi' }], context: {} };
        await chatService.generateResponse('hi', conv);
        expect(chatService.stats.tokens.prompt - before.prompt).toBe(120);
        expect(chatService.stats.tokens.completion - before.completion).toBe(45);
        expect(chatService.stats.tokens.total - before.total).toBe(165);
        expect(chatService.stats.tokens.requests - before.requests).toBe(1);
      } finally {
        chatService.ollamaBridge = origBridge;
      }
    });

    it('exposes context length (num_ctx) in stats', () => {
      const stats = chatService.getStats();
      expect(stats.contextLength).toBe(8192);
    });

    it('warns when prompt usage approaches context limit (silent truncation risk)', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const mockBridge = {
        chat: jest.fn().mockResolvedValue({ ok: true, text: 'r', promptEvalCount: 7000, evalCount: 10 })
      };
      const origBridge = chatService.ollamaBridge;
      chatService.ollamaBridge = mockBridge;
      try {
        const conv = { personality: 'default', messages: [{ role: 'user', content: 'hi' }], context: {} };
        await chatService.generateResponse('hi', conv);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('上下文利用率'));
      } finally {
        chatService.ollamaBridge = origBridge;
        warnSpy.mockRestore();
      }
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

  describe('enforceConversationLimit', () => {
    it('evicts oldest conversations over the cap (LRU)', () => {
      chatService.conversations.clear();
      for (let i = 0; i < 5; i++) {
        chatService.conversations.set('user' + i, {
          id: 'user' + i, messages: [], personality: 'default', context: {},
          createdAt: new Date(), lastActivity: new Date(Date.now() + i * 1000)
        });
      }
      const evicted = chatService.enforceConversationLimit(3);
      expect(evicted).toBe(2);
      expect(chatService.conversations.has('user0')).toBe(false);
      expect(chatService.conversations.has('user1')).toBe(false);
      expect(chatService.conversations.has('user4')).toBe(true); // 最新保留
      expect(chatService.conversations.size).toBe(3);
    });

    it('does nothing when under the cap', () => {
      chatService.conversations.clear();
      chatService.conversations.set('a', { id: 'a', messages: [], personality: 'default', context: {}, createdAt: new Date(), lastActivity: new Date() });
      const evicted = chatService.enforceConversationLimit(10);
      expect(evicted).toBe(0);
      expect(chatService.conversations.size).toBe(1);
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

  it('persists and restores conversation across restart', async () => {
    const svc1 = require('../../server/services/chatService');
    svc1.conversations.set('u1', {
      id: 'u1', personality: 'professional', context: { lastIntent: { intent: 'code' } },
      messages: [{ role: 'user', content: 'hi', timestamp: new Date() }],
      lastActivity: new Date()
    });
    svc1._saveConversations();
    // shutdown flush 同步写盘（防抖 timer 未触发时保证写入）
    await svc1.shutdown();
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

  describe('skill guidance injection', () => {
    const projectRoot = require('path').resolve(__dirname, '../../');
    beforeEach(() => {
      // 防御：确保 cwd 回到项目根（其他测试可能 chdir 污染，技能路径依赖 cwd）
      process.chdir(projectRoot);
      chatService._skillRecognizer = null;
      chatService._skillEssenceCache = null;
    });

    it('injects skill guidance when task matches a skill', () => {
      chatService._skillRecognizer = { recognize: jest.fn(() => [{ skill: { name: 'performance-optimization' }, score: 1.0 }]) };
      const text = chatService._buildSkillGuidance('帮我优化代码性能');
      expect(text).toContain('performance-optimization');
      expect(text).toContain('技能方法论');
    });

    it('returns empty when no skill matches', () => {
      chatService._skillRecognizer = { recognize: jest.fn(() => []) };
      expect(chatService._buildSkillGuidance('你好')).toBe('');
    });

    it('returns empty when match score is below threshold', () => {
      chatService._skillRecognizer = { recognize: jest.fn(() => [{ skill: { name: 'x' }, score: 0.1 }]) };
      expect(chatService._buildSkillGuidance('随便聊聊')).toBe('');
    });

    it('returns empty when skill file does not exist', () => {
      chatService._skillRecognizer = { recognize: jest.fn(() => [{ skill: { name: 'nonexistent-skill' }, score: 0.9 }]) };
      expect(chatService._buildSkillGuidance('测试任务')).toBe('');
    });

    it('returns empty for empty/whitespace/short input', () => {
      chatService._skillRecognizer = { recognize: jest.fn(() => [{ skill: { name: 'advanced-css-animations' }, score: 0.8 }]) };
      expect(chatService._buildSkillGuidance('')).toBe('');
      expect(chatService._buildSkillGuidance('   ')).toBe('');
      expect(chatService._buildSkillGuidance('a')).toBe('');
      expect(chatService._skillRecognizer.recognize).not.toHaveBeenCalled();
    });

    it('injects capability description for custom module skills', () => {
      chatService._skillRecognizer = { recognize: jest.fn(() => [{ skill: { name: 'DynamicScraper', description: '爬虫系统', isCustomModule: true }, score: 1.0 }]) };
      const text = chatService._buildSkillGuidance('写一个爬虫');
      expect(text).toContain('DynamicScraper');
      expect(text).toContain('爬虫系统');
    });

    it('injects SKILL.md body content', () => {
      const path = require('path');
      const fs = require('fs');
      const realJoin = path.join;
      const realExists = fs.existsSync;
      const realRead = fs.readFileSync;
      path.join = () => '/fake/skill.md';
      fs.existsSync = () => true;
      fs.readFileSync = () => '---\nname: t\n---\n# 技能\n## 核心原则\n1. 先分析再动手\n2. 验证结果\n- 记录经验';
      try {
        chatService._skillRecognizer = { recognize: jest.fn(() => [{ skill: { name: 't' }, score: 0.9 }]) };
        const text = chatService._buildSkillGuidance('测试任务');
        expect(text).toContain('核心原则');
        expect(text).toContain('先分析再动手');
        expect(text).not.toContain('---'); // frontmatter 已去除
      } finally {
        path.join = realJoin;
        fs.existsSync = realExists;
        fs.readFileSync = realRead;
      }
    });

    it('extracts structured essence (headings/steps/points, skips code blocks)', () => {
      const body = '## 步骤\n```js\nconst x = 1;\n```\n1. 第一步\n2. 第二步\n- 要点A\n- 要点B\n## 总结\n结束';
      const essence = chatService._extractSkillEssence(body);
      expect(essence).toContain('步骤');
      expect(essence).toContain('1. 第一步');
      expect(essence).toContain('要点A');
      expect(essence).not.toContain('const x = 1'); // 代码块跳过
    });

    it('caches skill essence (no re-read on repeat calls)', () => {
      chatService._skillRecognizer = { recognize: jest.fn(() => [{ skill: { name: 'performance-optimization' }, score: 1.0 }]) };
      const first = chatService._buildSkillGuidance('优化性能');
      expect(chatService._skillEssenceCache.has('performance-optimization')).toBe(true);
      const second = chatService._buildSkillGuidance('优化性能');
      expect(second).toBe(first); // 缓存命中，结果一致
    });

    it('uses a slim reference on same-session repeat of the same skill (no repeated essence)', () => {
      chatService._skillRecognizer = { recognize: jest.fn(() => [{ skill: { name: 'performance-optimization' }, score: 1.0 }]) };
      const conv = { personality: 'default', context: {}, messages: [] };
      const first = chatService._buildSkillGuidance('优化性能', conv);
      expect(first).toContain('技能方法论'); // 首条完整注入
      const second = chatService._buildSkillGuidance('优化性能', conv);
      expect(second).toContain('继续沿用'); // 同会话同技能 → 极简引用
      expect(second).not.toContain('技能方法论');
      expect(second.length).toBeLessThan(first.length);
    });

    it('stops after 3 top-level sections (avoids trailing metadata)', () => {
      const body = '## 核心\n内容\n## 模式\n内容\n## 指标\n内容\n## 更新日志\n不应提取';
      const essence = chatService._extractSkillEssence(body);
      expect(essence).toContain('核心');
      expect(essence).toContain('模式');
      expect(essence).toContain('指标');
      expect(essence).not.toContain('更新日志'); // 第 4 个主章节被跳过
    });
  });

  describe('sysPrompt context safety', () => {
    it('caps over-long injected memory so it cannot blow up the context (safety valve)', async () => {
      const { BrainSystem } = require('../../src/core/BrainSystem');
      chatService._skillRecognizer = { recognize: jest.fn(() => []) }; // 隔离技能注入
      const semSpy = jest.spyOn(BrainSystem, 'smartSearchSemantic').mockResolvedValue([{ value: '很长的记忆内容'.repeat(400) }]);
      const kwSpy = jest.spyOn(BrainSystem, 'smartSearch').mockReturnValue([]);
      try {
        const { sysPrompt } = await chatService._buildSysPrompt('测试输入', { personality: 'default', context: {}, messages: [] }, 'u');
        expect(sysPrompt.length).toBeLessThan(1500); // 2800 字符记忆被限长，未撑爆
      } finally {
        semSpy.mockRestore();
        kwSpy.mockRestore();
      }
    });

    it('does not inject meta-cognitive thinking questions into sysPrompt (confuses weak models)', async () => {
      const { BrainSystem } = require('../../src/core/BrainSystem');
      chatService._skillRecognizer = { recognize: jest.fn(() => []) };
      const semSpy = jest.spyOn(BrainSystem, 'smartSearchSemantic').mockResolvedValue([]);
      const kwSpy = jest.spyOn(BrainSystem, 'smartSearch').mockReturnValue([]);
      try {
        const { sysPrompt } = await chatService._buildSysPrompt('你好，请介绍一下你自己', { personality: 'default', context: {}, messages: [] }, 'u');
        expect(sysPrompt).not.toContain('回答前请先思考');
        expect(sysPrompt).not.toContain('我真正理解这个问题了吗');
      } finally {
        semSpy.mockRestore();
        kwSpy.mockRestore();
      }
    });

    it('injects memory input text instead of raw JSON (cleaner, no userId leak)', async () => {
      const { BrainSystem } = require('../../src/core/BrainSystem');
      chatService._skillRecognizer = { recognize: jest.fn(() => []) };
      const semSpy = jest.spyOn(BrainSystem, 'smartSearchSemantic').mockResolvedValue([{ value: { input: '用户喜欢用Vue开发前端', role: 'user', userId: 'u1' } }]);
      const kwSpy = jest.spyOn(BrainSystem, 'smartSearch').mockReturnValue([]);
      try {
        const { sysPrompt } = await chatService._buildSysPrompt('技术栈', { personality: 'default', context: {}, messages: [] }, 'u1');
        expect(sysPrompt).toContain('用户喜欢用Vue开发前端');
        expect(sysPrompt).not.toContain('userId');
        expect(sysPrompt).not.toContain('"input"');
      } finally {
        semSpy.mockRestore();
        kwSpy.mockRestore();
      }
    });

    it('triggers tool prompt for scraping requests (was missing -> scrape tool never invoked)', async () => {
      const { BrainSystem } = require('../../src/core/BrainSystem');
      chatService._skillRecognizer = { recognize: jest.fn(() => []) };
      const semSpy = jest.spyOn(BrainSystem, 'smartSearchSemantic').mockResolvedValue([]);
      const kwSpy = jest.spyOn(BrainSystem, 'smartSearch').mockReturnValue([]);
      try {
        const { sysPrompt, toolTrigger } = await chatService._buildSysPrompt('抓取 https://example.com 的网页内容', { personality: 'default', context: {}, messages: [] }, 'u');
        expect(toolTrigger).toBe(true);
        expect(sysPrompt).toContain('scrape_web');
      } finally {
        semSpy.mockRestore();
        kwSpy.mockRestore();
      }
    });
  });
});