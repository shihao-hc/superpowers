const { EventEmitter } = require('events');

let mockSkillDiscovery;
let mockSkillManager;
let mockSessionManager;
let mockExecutor;
let mockPresenter;
let mockRecommender;

jest.mock('../../src/skills/agent/SkillDiscovery', () => {
  const instance = { analyzeInput: jest.fn() };
  mockSkillDiscovery = instance;
  return { SkillDiscovery: jest.fn(() => instance) };
});

jest.mock('../../src/skills/SkillManager', () => {
  const instance = { getAllSkills: jest.fn() };
  mockSkillManager = instance;
  return { SkillManager: jest.fn(() => instance) };
});

jest.mock('../../src/skills/agent/SessionManager', () => {
  const instance = {
    getSession: jest.fn(),
    addToHistory: jest.fn(),
    recordSkillExecution: jest.fn()
  };
  mockSessionManager = instance;
  return { SessionManager: jest.fn(() => instance) };
});

jest.mock('../../src/skills/agent/AsyncExecutor', () => {
  const { EventEmitter } = require('events');
  const instance = Object.assign(new EventEmitter(), {
    execute: jest.fn(),
    waitForCompletion: jest.fn()
  });
  mockExecutor = instance;
  return { AsyncExecutor: jest.fn(() => instance) };
});

jest.mock('../../src/skills/agent/MultimodalPresenter', () => {
  const instance = { present: jest.fn() };
  mockPresenter = instance;
  return { MultimodalPresenter: jest.fn(() => instance) };
});

jest.mock('../../src/skills/recommendation/RLSkillRecommender', () => {
  const instance = { recommendSkills: jest.fn() };
  mockRecommender = instance;
  return { RLSkillRecommender: jest.fn(() => instance) };
});

const { ChatWebSocketHandler } = require('../../src/chat/ChatWebSocketHandler');

function createMockSocket(id) {
  const socket = new EventEmitter();
  socket.id = id || 'socket-1';
  socket.join = jest.fn();
  socket.disconnect = jest.fn();
  socket.on('error', () => {});
  jest.spyOn(socket, 'emit');
  return socket;
}

function createMockSession(sessionId, historyLength) {
  const history = [];
  for (let i = 0; i < (historyLength || 2); i++) {
    history.push({ type: i % 2 === 0 ? 'user' : 'assistant', content: `Entry ${i}` });
  }
  return { id: sessionId || 'session-1', lastAccessed: Date.now(), history };
}

function setupSessionInHandler(handler, socket, session) {
  handler.sessions.set(socket.id, { sessionId: session.id, socket, session });
}

describe('ChatWebSocketHandler', () => {
  let handler;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
    handler = new ChatWebSocketHandler();
  });

  afterEach(() => {
    mockExecutor.removeAllListeners();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should set default options', () => {
      expect(handler.sessions).toBeInstanceOf(Map);
      expect(handler.maxSessions).toBe(1000);
      expect(handler.proactiveEnabled).toBe(true);
      expect(handler.suggestionThreshold).toBe(0.7);
      expect(handler.minMessagesForSuggestion).toBe(3);
    });

    it('should accept custom options', () => {
      const custom = new ChatWebSocketHandler({
        maxSessions: 500,
        proactiveEnabled: false,
        suggestionThreshold: 0.8
      });
      expect(custom.maxSessions).toBe(500);
      expect(custom.proactiveEnabled).toBe(false);
      expect(custom.suggestionThreshold).toBe(0.8);
    });

    it('should inject custom skillManager', () => {
      const customSkillManager = { getAllSkills: jest.fn() };
      const h = new ChatWebSocketHandler({ skillManager: customSkillManager });
      expect(h.skillManager).toBe(customSkillManager);
    });

    it('should inject custom llmAdapter', () => {
      const customLlm = { generate: jest.fn() };
      const h = new ChatWebSocketHandler({ llmAdapter: customLlm });
      expect(h.llmAdapter).toBe(customLlm);
    });

    it('should initialize dependencies', () => {
      expect(handler.skillDiscovery).toBe(mockSkillDiscovery);
      expect(handler.skillManager).toBe(mockSkillManager);
      expect(handler.sessionManager).toBe(mockSessionManager);
      expect(handler.executor).toBe(mockExecutor);
      expect(handler.presenter).toBe(mockPresenter);
      expect(handler.rlRecommender).toBe(mockRecommender);
    });
  });

  describe('_setupExecutorListeners', () => {
    it('should forward executor progress events', () => {
      const emitSpy = jest.spyOn(handler, 'emit');
      const data = { progress: 50, message: 'Working' };
      mockExecutor.emit('progress', data);
      expect(emitSpy).toHaveBeenCalledWith('skill_progress', data);
    });

    it('should forward executor completed events', () => {
      const emitSpy = jest.spyOn(handler, 'emit');
      const execution = { id: 'exec-1', skillName: 'test' };
      mockExecutor.emit('completed', execution);
      expect(emitSpy).toHaveBeenCalledWith('skill_complete', execution);
    });

    it('should forward executor failed events', () => {
      const emitSpy = jest.spyOn(handler, 'emit');
      const execution = { id: 'exec-1', error: 'Something failed' };
      mockExecutor.emit('failed', execution);
      expect(emitSpy).toHaveBeenCalledWith('skill_error', execution);
    });
  });

  describe('handleConnection', () => {
    it('should register event listeners and send welcome', () => {
      const socket = createMockSocket('sock-1');
      handler.handleConnection(socket);

      expect(consoleLogSpy).toHaveBeenCalledWith('[ChatWS] New connection:', 'sock-1');
      expect(socket.emit).toHaveBeenCalledWith('connected', {
        message: 'Connected to UltraWork AI Chat',
        sessionId: 'sock-1'
      });
      expect(socket._events.join_session).toBeDefined();
      expect(socket._events.chat_message).toBeDefined();
      expect(socket._events.execute_skill).toBeDefined();
      expect(socket._events.disconnect).toBeDefined();
    });

    it('should emit connected on handleConnection for second socket too', () => {
      const socket1 = createMockSocket('sock-1');
      const socket2 = createMockSocket('sock-2');
      handler.handleConnection(socket1);
      handler.handleConnection(socket2);

      expect(socket1.emit).toHaveBeenCalledWith('connected', expect.objectContaining({ sessionId: 'sock-1' }));
      expect(socket2.emit).toHaveBeenCalledWith('connected', expect.objectContaining({ sessionId: 'sock-2' }));
    });
  });

  describe('_handleJoinSession', () => {
    it('should join a new session', () => {
      const socket = createMockSocket('sock-1');
      const session = createMockSession('session-alpha', 5);
      mockSessionManager.getSession.mockReturnValue(session);

      handler._handleJoinSession(socket, { sessionId: 'session-alpha' });

      expect(mockSessionManager.getSession).toHaveBeenCalledWith('session-alpha', { socketId: 'sock-1' });
      expect(handler.sessions.get('sock-1')).toEqual({ sessionId: 'session-alpha', socket, session });
      expect(socket.join).toHaveBeenCalledWith('session-alpha');
      expect(socket.emit).toHaveBeenCalledWith('session_joined', { sessionId: 'session-alpha', historyLength: 5 });
    });

    it('should return error when sessionId is missing', () => {
      const socket = createMockSocket('sock-1');
      handler._handleJoinSession(socket, {});

      expect(mockSessionManager.getSession).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Session ID required' });
    });

    it('should throw when data is null', () => {
      const socket = createMockSocket('sock-1');
      expect(() => handler._handleJoinSession(socket, null)).toThrow(TypeError);
    });
  });

  describe('_handleChatMessage', () => {
    it('should return error for invalid data', async () => {
      const socket = createMockSocket('sock-1');
      await handler._handleChatMessage(socket, {});
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid message data' });
    });

    it('should return error for missing message', async () => {
      const socket = createMockSocket('sock-1');
      await handler._handleChatMessage(socket, { sessionId: 's1', message: '' });
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid message data' });
    });

    it('should return error when session not found', async () => {
      const socket = createMockSocket('sock-1');
      await handler._handleChatMessage(socket, { sessionId: 's1', message: 'Hello' });
      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Session not found' });
    });

    it('should execute skill when skill discovery matches', async () => {
      const socket = createMockSocket('sock-1');
      const session = createMockSession('session-1', 5);
      setupSessionInHandler(handler, socket, session);
      handler._executeSkillWithStreaming = jest.fn().mockResolvedValue();
      handler._maybeSendProactiveSuggestion = jest.fn();

      mockSkillDiscovery.analyzeInput.mockReturnValue({
        hasMatch: true,
        confidence: 0.8,
        matchedSkills: [{ name: 'test-skill', inputs: [] }]
      });

      await handler._handleChatMessage(socket, {
        sessionId: 'session-1', conversationId: 'conv-1', message: 'Run test', attachments: []
      });

      expect(mockSessionManager.addToHistory).toHaveBeenCalledWith('session-1', {
        type: 'user', content: 'Run test',
        metadata: { conversationId: 'conv-1', attachments: [] }
      });
      expect(mockSkillDiscovery.analyzeInput).toHaveBeenCalledWith('Run test', session.history.slice(-10));
      expect(handler._executeSkillWithStreaming).toHaveBeenCalledWith(socket, {
        sessionId: 'session-1', conversationId: 'conv-1',
        skillName: 'test-skill',
        parameters: expect.any(Object),
        userMessage: 'Run test'
      });
      expect(socket.emit).toHaveBeenCalledWith('message_start', { conversationId: 'conv-1' });
      expect(socket.emit).toHaveBeenCalledWith('message_end', { conversationId: 'conv-1' });
    });

    it('should generate text response when no skill matches', async () => {
      const socket = createMockSocket('sock-1');
      const session = createMockSession('session-1', 5);
      setupSessionInHandler(handler, socket, session);
      handler._generateTextResponse = jest.fn().mockResolvedValue();
      handler._maybeSendProactiveSuggestion = jest.fn();

      mockSkillDiscovery.analyzeInput.mockReturnValue({
        hasMatch: false, confidence: 0, matchedSkills: []
      });

      await handler._handleChatMessage(socket, {
        sessionId: 'session-1', conversationId: 'conv-1', message: 'Hello', model: 'llama3.2'
      });

      expect(handler._generateTextResponse).toHaveBeenCalledWith(socket, {
        sessionId: 'session-1', conversationId: 'conv-1', message: 'Hello',
        model: 'llama3.2', attachments: undefined,
        history: session.history
      });
    });

    it('should handle error during message processing', async () => {
      const socket = createMockSocket('sock-1');
      const session = createMockSession('session-1');
      setupSessionInHandler(handler, socket, session);
      handler._executeSkillWithStreaming = jest.fn().mockRejectedValue(new Error('Processing failed'));

      mockSkillDiscovery.analyzeInput.mockReturnValue({
        hasMatch: true, confidence: 0.9, matchedSkills: [{ name: 'bad-skill', inputs: [] }]
      });

      await handler._handleChatMessage(socket, {
        sessionId: 'session-1', conversationId: 'conv-1', message: 'Do it'
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('出错'),
        error: 'Processing failed'
      });
    });
  });

  describe('_maybeSendProactiveSuggestion', () => {
    it('should send suggestion when confidence meets threshold', () => {
      const socket = createMockSocket('sock-1');
      const skill = { name: 'data-analysis', description: 'Analyze data', confidence: 0.85 };
      mockSkillManager.getAllSkills.mockReturnValue([{ name: 'data-analysis' }]);
      mockRecommender.recommendSkills.mockReturnValue([skill]);

      jest.spyOn(Math, 'random').mockReturnValue(0);

      handler._maybeSendProactiveSuggestion(socket, {
        sessionId: 'session-1', conversationId: 'conv-1',
        lastMessage: 'analyze this', history: []
      });

      expect(socket.emit).toHaveBeenCalledWith('proactive_suggestion', {
        conversationId: 'conv-1',
        skill: { name: 'data-analysis', description: 'Analyze data', confidence: 0.85 },
        message: expect.stringContaining('data-analysis'),
        action: 'execute_skill_suggested',
        autoDismissAfter: 30000
      });

      jest.spyOn(Math, 'random').mockRestore();
    });

    it('should not send suggestion when confidence is below threshold', () => {
      const socket = createMockSocket('sock-1');
      mockSkillManager.getAllSkills.mockReturnValue([{ name: 'data-analysis' }]);
      mockRecommender.recommendSkills.mockReturnValue([
        { name: 'data-analysis', description: 'Analyze', confidence: 0.5 }
      ]);

      handler._maybeSendProactiveSuggestion(socket, {
        sessionId: 'session-1', conversationId: 'conv-1', lastMessage: 'x', history: []
      });

      expect(socket.emit).not.toHaveBeenCalledWith('proactive_suggestion', expect.anything());
    });

    it('should not send suggestion when no skills returned', () => {
      const socket = createMockSocket('sock-1');
      mockSkillManager.getAllSkills.mockReturnValue([]);
      mockRecommender.recommendSkills.mockReturnValue([]);

      handler._maybeSendProactiveSuggestion(socket, {
        sessionId: 'session-1', conversationId: 'conv-1', lastMessage: 'x', history: []
      });

      expect(socket.emit).not.toHaveBeenCalledWith('proactive_suggestion', expect.anything());
    });

    it('should handle missing getAllSkills on skillManager', () => {
      const socket = createMockSocket('sock-1');
      handler.skillManager = {};
      mockRecommender.recommendSkills.mockReturnValue([]);

      handler._maybeSendProactiveSuggestion(socket, {
        sessionId: 'session-1', conversationId: 'conv-1', lastMessage: 'x', history: []
      });

      expect(mockRecommender.recommendSkills).toHaveBeenCalledWith('x', 'session-1', [], expect.any(Array), 1);
    });
  });

  describe('_handleSkillExecution', () => {
    it('should execute skill successfully', async () => {
      const socket = createMockSocket('sock-1');
      mockExecutor.execute.mockResolvedValue({ executionId: 'exec-1', estimatedDuration: 5000 });

      await handler._handleSkillExecution(socket, {
        sessionId: 'session-1', skillName: 'test-skill', parameters: { text: 'hello' }
      });

      expect(mockExecutor.execute).toHaveBeenCalledWith('test-skill', { text: 'hello' }, {
        sessionId: 'session-1',
        onProgress: expect.any(Function)
      });
      expect(socket.emit).toHaveBeenCalledWith('skill_started', {
        skillName: 'test-skill', executionId: 'exec-1', estimatedDuration: 5000
      });
    });

    it('should return error for missing parameters', async () => {
      const socket = createMockSocket('sock-1');
      await handler._handleSkillExecution(socket, { sessionId: 'session-1' });

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid skill execution request' });
    });

    it('should return error for missing skillName', async () => {
      const socket = createMockSocket('sock-1');
      await handler._handleSkillExecution(socket, { sessionId: 'session-1', parameters: {} });

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid skill execution request' });
    });

    it('should handle executor error', async () => {
      const socket = createMockSocket('sock-1');
      mockExecutor.execute.mockRejectedValue(new Error('Execution failed'));

      await handler._handleSkillExecution(socket, {
        sessionId: 'session-1', skillName: 'bad-skill', parameters: {}
      });

      expect(socket.emit).toHaveBeenCalledWith('skill_error', {
        skillName: 'bad-skill', error: 'Execution failed'
      });
    });
  });

  describe('_executeSkillWithStreaming', () => {
    let socket;
    let _session;

    beforeEach(() => {
      socket = createMockSocket('sock-1');
      _session = createMockSession('session-1');
      handler._streamText = jest.fn().mockResolvedValue();
      mockExecutor.execute.mockResolvedValue({ executionId: 'exec-1' });
      mockExecutor.waitForCompletion.mockResolvedValue({
        success: true, duration: 2000, text: 'Done'
      });
      mockPresenter.present.mockResolvedValue({ metadata: {}, text: 'Presented' });
    });

    it('should execute skill with streaming updates on success', async () => {
      await handler._executeSkillWithStreaming(socket, {
        sessionId: 'session-1', conversationId: 'conv-1',
        skillName: 'data-skill', parameters: { query: 'test' }, userMessage: 'run test'
      });

      expect(socket.emit).toHaveBeenCalledWith('skill_start', {
        conversationId: 'conv-1', skillName: 'data-skill',
        message: expect.stringContaining('data-skill')
      });
      expect(mockSessionManager.addToHistory).toHaveBeenCalledWith('session-1', {
        type: 'skill_call', content: { skillName: 'data-skill', parameters: { query: 'test' } },
        skillName: 'data-skill', metadata: { conversationId: 'conv-1' }
      });
      expect(mockExecutor.execute).toHaveBeenCalledWith('data-skill', { query: 'test' }, {
        sessionId: 'session-1', onProgress: expect.any(Function)
      });
      expect(mockExecutor.waitForCompletion).toHaveBeenCalledWith('exec-1');
      expect(mockSessionManager.recordSkillExecution).toHaveBeenCalledWith('session-1', 'data-skill', 'exec-1', {
        success: true, duration: 2000, result: { success: true, duration: 2000, text: 'Done' }
      });
      expect(socket.emit).toHaveBeenCalledWith('skill_complete', {
        conversationId: 'conv-1', skillName: 'data-skill',
        executionId: 'exec-1', duration: 2000
      });
      expect(mockPresenter.present).toHaveBeenCalledWith(
        { success: true, duration: 2000, text: 'Done' },
        { format: 'auto' }
      );
      expect(handler._streamText).toHaveBeenCalled();
    });

    it('should fire onProgress callback during execution', async () => {
      mockExecutor.execute.mockImplementation((_name, _params, opts) => {
        opts.onProgress(50, 'Halfway');
        return Promise.resolve({ executionId: 'exec-1' });
      });
      mockExecutor.waitForCompletion.mockResolvedValue({ success: true, duration: 1000, text: 'Done' });

      await handler._executeSkillWithStreaming(socket, {
        sessionId: 'session-1', conversationId: 'conv-1',
        skillName: 'prog-skill', parameters: {}, userMessage: 'progress'
      });

      expect(socket.emit).toHaveBeenCalledWith('skill_progress', {
        conversationId: 'conv-1', skillName: 'prog-skill', progress: 50, message: 'Halfway'
      });
    });

    it('should handle execution error', async () => {
      mockExecutor.execute.mockRejectedValue(new Error('Exec error'));

      await handler._executeSkillWithStreaming(socket, {
        sessionId: 'session-1', conversationId: 'conv-1',
        skillName: 'bad-skill', parameters: {}, userMessage: 'fail'
      });

      expect(socket.emit).toHaveBeenCalledWith('skill_error', {
        conversationId: 'conv-1', skillName: 'bad-skill', error: 'Exec error'
      });
      expect(handler._streamText).toHaveBeenCalledWith(socket, 'conv-1',
        expect.stringContaining('bad-skill')
      );
      expect(mockSessionManager.addToHistory).toHaveBeenCalledWith('session-1', {
        type: 'skill_error', content: { error: 'Exec error' },
        skillName: 'bad-skill', metadata: { conversationId: 'conv-1' }
      });
    });
  });

  describe('_formatSkillResult', () => {
    it('should format success result with text', () => {
      const text = handler._formatSkillResult('gen-doc', { success: true, text: 'Doc content', duration: 1500 }, { metadata: {} });
      expect(text).toContain('gen-doc');
      expect(text).toContain('Doc content');
      expect(text).toContain('1.5秒');
    });

    it('should format success result with message', () => {
      const text = handler._formatSkillResult('gen-doc', { success: true, message: 'Doc ready', duration: 2000 }, { metadata: {} });
      expect(text).toContain('Doc ready');
    });

    it('should format image result', () => {
      const text = handler._formatSkillResult('gen-img', { success: true, duration: 500 }, { metadata: { isImage: true } });
      expect(text).toContain('生成图片');
      expect(text).not.toContain('Doc content');
    });

    it('should format PDF result', () => {
      const text = handler._formatSkillResult('gen-pdf', { success: true }, { metadata: { isPDF: true } });
      expect(text).toContain('PDF文档');
    });

    it('should format Excel result', () => {
      const text = handler._formatSkillResult('gen-xlsx', { success: true }, { metadata: { isExcel: true } });
      expect(text).toContain('Excel表格');
    });

    it('should format PPT result', () => {
      const text = handler._formatSkillResult('gen-ppt', { success: true }, { metadata: { isPPT: true } });
      expect(text).toContain('PowerPoint演示文稿');
    });

    it('should use default message for success without text or message', () => {
      const text = handler._formatSkillResult('gen', { success: true }, { metadata: {} });
      expect(text).toContain('任务已完成');
    });

    it('should format failure result', () => {
      const text = handler._formatSkillResult('bad-skill', { success: false, error: '权限不足' }, { metadata: {} });
      expect(text).toContain('bad-skill');
      expect(text).toContain('失败');
      expect(text).toContain('权限不足');
    });

    it('should handle failure without error message', () => {
      const text = handler._formatSkillResult('bad-skill', { success: false }, { metadata: {} });
      expect(text).toContain('未知错误');
    });
  });

  describe('_generateTextResponse', () => {
    let socket;
    let session;

    beforeEach(() => {
      socket = createMockSocket('sock-1');
      session = createMockSession('session-1', 5);
      handler._streamText = jest.fn().mockResolvedValue();
    });

    it('should use fallback response when no llmAdapter', async () => {
      handler.llmAdapter = null;

      await handler._generateTextResponse(socket, {
        sessionId: 'session-1', conversationId: 'conv-1',
        message: 'Hello', history: session.history
      });

      expect(handler._streamText).toHaveBeenCalledWith(socket, 'conv-1', expect.stringContaining('AI 助手'));
    });

    it('should use llmAdapter when available', async () => {
      handler.llmAdapter = { generate: jest.fn().mockResolvedValue('AI response text') };

      await handler._generateTextResponse(socket, {
        sessionId: 'session-1', conversationId: 'conv-1',
        message: 'Hello', model: 'custom-model', history: session.history
      });

      expect(handler.llmAdapter.generate).toHaveBeenCalledWith(
        expect.stringContaining('User: Hello\nAssistant:'),
        { model: 'custom-model', temperature: 0.7, maxTokens: 1000 }
      );
      expect(mockSessionManager.addToHistory).toHaveBeenCalledWith('session-1', {
        type: 'assistant', content: 'AI response text',
        metadata: { conversationId: 'conv-1', model: 'custom-model' }
      });
    });

    it('should use default model when none specified', async () => {
      handler.llmAdapter = { generate: jest.fn().mockResolvedValue('response') };

      await handler._generateTextResponse(socket, {
        sessionId: 'session-1', conversationId: 'conv-1',
        message: 'Hi', history: session.history
      });

      expect(handler.llmAdapter.generate).toHaveBeenCalledWith(
        expect.any(String), expect.objectContaining({ model: 'llama3.2' })
      );
    });

    it('should fall back when llmAdapter throws', async () => {
      handler.llmAdapter = { generate: jest.fn().mockRejectedValue(new Error('API error')) };

      await handler._generateTextResponse(socket, {
        sessionId: 'session-1', conversationId: 'conv-1',
        message: 'Hello', history: session.history
      });

      expect(handler._streamText).toHaveBeenCalledWith(socket, 'conv-1', expect.stringContaining('AI 助手'));
    });
  });

  describe('_buildConversationContext', () => {
    it('should build context from history entries', () => {
      const history = [
        { type: 'user', content: 'Hello' },
        { type: 'assistant', content: 'Hi there' },
        { type: 'user', content: 'Help me' }
      ];
      const context = handler._buildConversationContext(history, 'Sure!');
      expect(context).toContain('User: Hello');
      expect(context).toContain('Assistant: Hi there');
      expect(context).toContain('User: Help me');
      expect(context).toContain('User: Sure!\nAssistant:');
    });

    it('should include only last 10 history entries', () => {
      const history = [];
      for (let i = 0; i < 15; i++) {
        history.push({ type: 'user', content: `message-${i}` });
      }
      const context = handler._buildConversationContext(history, 'new');
      const lines = context.split('\n').filter(l => l.startsWith('User:'));
      expect(lines.length).toBeLessThanOrEqual(12);
    });

    it('should skip non-user/non-assistant entries', () => {
      const history = [
        { type: 'user', content: 'Hello' },
        { type: 'skill_call', content: { skillName: 'test' } },
        { type: 'skill_result', content: { success: true } }
      ];
      const context = handler._buildConversationContext(history, 'Hi');
      expect(context).toContain('User: Hello');
      expect(context).not.toContain('skill_call');
      expect(context).toContain('User: Hi\nAssistant:');
    });
  });

  describe('_generateFallbackResponse', () => {
    function checkFallback(message, expectedKeyword) {
      const response = handler._generateFallbackResponse(message);
      expect(response).toEqual(expect.stringContaining(expectedKeyword));
    }

    it('should respond to 你好', () => {
      checkFallback('你好呀', 'AI 助手');
    });

    it('should respond to hello', () => {
      checkFallback('hello world', 'AI 助手');
    });

    it('should respond to 文档', () => {
      checkFallback('创建文档', 'Word、PDF、PPT、Excel');
    });

    it('should respond to document', () => {
      checkFallback('document help', 'Word、PDF、PPT、Excel');
    });

    it('should respond to 图表', () => {
      checkFallback('画个图表', '柱状图、折线图、饼图');
    });

    it('should respond to chart', () => {
      checkFallback('chart data', '柱状图、折线图、饼图');
    });

    it('should respond to 分析', () => {
      checkFallback('分析数据', '分析报告');
    });

    it('should respond to analyze', () => {
      checkFallback('analyze sales', '分析报告');
    });

    it('should return generic response for unknown messages', () => {
      const response = handler._generateFallbackResponse('something random');
      expect(response).toContain('something random');
      expect(response).toContain('AI助手');
    });
  });

  describe('_streamText', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should stream text in 10-character chunks', async () => {
      const socket = createMockSocket('sock-1');
      const text = 'Hello World! This is a long text for testing streaming.';

      const promise = handler._streamText(socket, 'conv-1', text);
      while (jest.getTimerCount() > 0) {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      }
      await promise;

      expect(socket.emit).toHaveBeenCalledWith('message_chunk', {
        conversationId: 'conv-1', content: expect.stringMatching(/^.{1,10}$/)
      });
      expect(socket.emit).toHaveBeenCalledTimes(Math.ceil(text.length / 10));
    });

    it('should stream single chunk for short text', async () => {
      const socket = createMockSocket('sock-1');

      const promise = handler._streamText(socket, 'conv-1', 'Short');
      while (jest.getTimerCount() > 0) {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      }
      await promise;

      expect(socket.emit).toHaveBeenCalledTimes(1);
      expect(socket.emit).toHaveBeenCalledWith('message_chunk', {
        conversationId: 'conv-1', content: 'Short'
      });
    });
  });

  describe('_extractSkillParameters', () => {
    it('should extract parameters from skill inputs', () => {
      const skill = {
        inputs: [
          { name: 'text', type: 'string' },
          { name: 'format', type: 'string' }
        ]
      };
      const params = handler._extractSkillParameters('Hello world', skill);
      expect(params.text).toBe('Hello world');
      expect(params.content).toBeUndefined();
    });

    it('should map data and query inputs', () => {
      const skill = {
        inputs: [
          { name: 'query', type: 'string' },
          { name: 'limit', type: 'number' }
        ]
      };
      const params = handler._extractSkillParameters('search query', skill);
      expect(params.query).toBe('search query');
    });

    it('should use defaults when skill has no inputs', () => {
      const skill = { name: 'test', inputs: null };
      const params = handler._extractSkillParameters('fallback msg', skill);
      expect(params.content).toBe('fallback msg');
      expect(params.text).toBe('fallback msg');
    });

    it('should use defaults when no inputs match', () => {
      const skill = { inputs: [{ name: 'unrelated', type: 'string' }] };
      const params = handler._extractSkillParameters('msg', skill);
      expect(params.content).toBe('msg');
      expect(params.text).toBe('msg');
    });

    it('should handle undefined inputs', () => {
      const params = handler._extractSkillParameters('test', {});
      expect(params.content).toBe('test');
    });
  });

  describe('_handleDisconnect', () => {
    it('should remove session on disconnect', () => {
      const socket = createMockSocket('sock-1');
      const session = createMockSession('session-1');
      setupSessionInHandler(handler, socket, session);

      handler._handleDisconnect(socket);

      expect(handler.sessions.has('sock-1')).toBe(false);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ChatWS] Socket sock-1 disconnected, session session-1'
      );
    });

    it('should do nothing for unknown socket', () => {
      const socket = createMockSocket('unknown');
      handler._handleDisconnect(socket);
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('disconnected'), expect.anything()
      );
    });
  });

  describe('getSessionStats', () => {
    it('should return zero stats with no sessions', () => {
      const stats = handler.getSessionStats();
      expect(stats).toEqual({ activeConnections: 0, maxSessions: 1000 });
    });

    it('should count active connections', () => {
      const socket1 = createMockSocket('sock-1');
      const socket2 = createMockSocket('sock-2');
      const session1 = createMockSession('session-1');
      const session2 = createMockSession('session-2');
      setupSessionInHandler(handler, socket1, session1);
      setupSessionInHandler(handler, socket2, session2);

      const stats = handler.getSessionStats();
      expect(stats.activeConnections).toBe(2);
      expect(stats.maxSessions).toBe(1000);
    });
  });

  describe('cleanup', () => {
    it('should disconnect stale sessions', () => {
      const socket1 = createMockSocket('sock-1');
      const socket2 = createMockSocket('sock-2');
      const freshSession = createMockSession('fresh');
      const staleSession = createMockSession('stale');
      staleSession.lastAccessed = Date.now() - 7200000;

      setupSessionInHandler(handler, socket1, freshSession);
      setupSessionInHandler(handler, socket2, staleSession);

      jest.spyOn(Date, 'now').mockReturnValue(Date.now());

      handler.cleanup();

      expect(handler.sessions.has('sock-1')).toBe(true);
      expect(handler.sessions.has('sock-2')).toBe(false);
      expect(socket2.disconnect).toHaveBeenCalledWith(true);
      expect(socket1.disconnect).not.toHaveBeenCalled();

      jest.spyOn(Date, 'now').mockRestore();
    });

    it('should do nothing when no sessions exist', () => {
      expect(() => handler.cleanup()).not.toThrow();
    });
  });

  describe('getChatWebSocketHandler singleton', () => {
    it('should create singleton and pass options on first call', () => {
      jest.isolateModules(() => {
        const { getChatWebSocketHandler: get } = require('../../src/chat/ChatWebSocketHandler');
        const i1 = get({ maxSessions: 42, proactiveEnabled: false });
        expect(i1.maxSessions).toBe(42);
        expect(i1.proactiveEnabled).toBe(false);
        expect(i1).toBeInstanceOf(require('../../src/chat/ChatWebSocketHandler').ChatWebSocketHandler);
        const i2 = get({ maxSessions: 999 });
        expect(i2).toBe(i1);
        expect(i2.maxSessions).toBe(42);
      });
    });
  });
});
