const express = require('express');
const request = require('supertest');

jest.mock('../../server/middleware', () => ({
  authMiddleware: (req, res, next) => next(),
  memoryLimiter: (req, res, next) => next()
}));

jest.mock('../../src/agent/TaskService', () => ({
  TaskService: jest.fn(() => ({})),
}));
jest.mock('../../src/agent/StateStore', () => ({
  StateStore: jest.fn(() => ({})),
}));

const agentRouter = require('../../server/routes/agent');
const chatService = require('../../server/services/chatService');

const app = express();
app.use(express.json());
app.use('/api/agent', agentRouter);

describe('Agent message routes (BrainSystem reply)', () => {
  beforeEach(() => {
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

  it('stores user message and returns AI reply', async () => {
    const origBridge = chatService.ollamaBridge;
    chatService.ollamaBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'agent 回复' }) };
    try {
      const res = await request(app).post('/api/agent/message').send({ content: '你好 agent' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeTruthy();
      expect(res.body.reply).toBeTruthy();
      expect(res.body.reply.text).toBe('agent 回复');
    } finally {
      chatService.ollamaBridge = origBridge;
    }
  });

  it('returns 400 when content missing', async () => {
    const res = await request(app).post('/api/agent/message').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('消息内容不能为空');
  });

  it('still stores message when Ollama unavailable (reply null)', async () => {
    const origBridge = chatService.ollamaBridge;
    chatService.ollamaBridge = { chat: jest.fn().mockRejectedValue(new Error('down')) };
    chatService._ollamaTried = false;
    try {
      const res = await request(app).post('/api/agent/message').send({ content: 'x' });
      expect(res.status).toBe(200);
      expect(res.body.data).toBeTruthy();
    } finally {
      chatService.ollamaBridge = origBridge;
      chatService._ollamaTried = false;
    }
  });
});