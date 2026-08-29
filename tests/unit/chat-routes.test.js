const express = require('express');
const request = require('supertest');

jest.mock('../../server/middleware', () => ({
  optionalAuth: (req, res, next) => { req.user = { id: req.query.userId || 'test-user' }; next(); },
  chatLimiter: (req, res, next) => next(),
  authMiddleware: (req, res, next) => { req.user = { id: req.query.userId || 'test-user' }; next(); }
}));

const chatRouter = require('../../server/routes/chat');
const chatService = require('../../server/services/chatService');

const app = express();
app.use(express.json());
app.use('/api/chat', chatRouter);

describe('Chat routes (LLM wiring)', () => {
  beforeEach(() => {
    chatService.conversations.clear();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    // 清理 BrainSystem 共享实例定时器（generateResponse → forceThink → _getSharedInstance）
    const { BrainSystem } = require('../../src/core/BrainSystem');
    const inst = BrainSystem._sharedInstance;
    if (inst) {
      if (inst.selfCheckInterval) { clearInterval(inst.selfCheckInterval); inst.selfCheckInterval = null; }
      if (inst.monitoringInterval) { clearInterval(inst.monitoringInterval); inst.monitoringInterval = null; }
    }
  });

  it('POST /api/chat returns LLM reply', async () => {
    const origBridge = chatService.ollamaBridge;
    chatService.ollamaBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'LLM 回复' }) };
    try {
      const res = await request(app).post('/api/chat').send({ text: '你好', userId: 'c1' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.text).toBe('LLM 回复');
    } finally {
      chatService.ollamaBridge = origBridge;
    }
  });

  it('POST /api/chat persists memory via BrainSystem', async () => {
    const origBridge = chatService.ollamaBridge;
    chatService.ollamaBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'ok' }) };
    const smartStoreSpy = jest.spyOn(require('../../src/core/BrainSystem').BrainSystem, 'smartStore');
    try {
      await request(app).post('/api/chat').send({ text: '记录一下', userId: 'c2' });
      expect(smartStoreSpy).toHaveBeenCalled();
    } finally {
      chatService.ollamaBridge = origBridge;
      smartStoreSpy.mockRestore();
    }
  });

  it('GET /api/chat/history requires auth', async () => {
    const res = await request(app).get('/api/chat/history');
    expect(res.status).toBe(200);
  });

  it('still replies when Ollama unavailable (fallback)', async () => {
    const origBridge = chatService.ollamaBridge;
    chatService.ollamaBridge = { chat: jest.fn().mockRejectedValue(new Error('down')) };
    chatService._ollamaTried = false;
    try {
      const res = await request(app).post('/api/chat').send({ text: 'x', userId: 'c3' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.text).toBeTruthy();
    } finally {
      chatService.ollamaBridge = origBridge;
      chatService._ollamaTried = false;
    }
  });

  it('GET /api/chat/stats returns AI path metrics', async () => {
    const origBridge = chatService.ollamaBridge;
    chatService.ollamaBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'ok' }) };
    try {
      await request(app).post('/api/chat').send({ text: 'hi', userId: 'st1' });
      const res = await request(app).get('/api/chat/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chat).toBeDefined();
      expect(res.body.data.chat.llm).toBeDefined();
      expect(res.body.data.chat.totalMessages).toBeGreaterThan(0);
    } finally {
      chatService.ollamaBridge = origBridge;
    }
  });
});