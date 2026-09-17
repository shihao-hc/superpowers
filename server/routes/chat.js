/**
 * UltraWork AI 聊天路由
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authMiddleware, optionalAuth, chatLimiter } = require('../middleware');
const chatService = require('../services/chatService');
const { errorLog } = require('../utils/logger');

/**
 * 获取会话用户 ID：
 * - 已认证用户 → req.user.id
 * - 匿名用户 → cookie 中的 x-session-id（首次生成 uuid 存 cookie，隔离各浏览器会话）
 */
function getSessionUserId(req, res) {
  if (req.user && req.user.id) {
    return req.user.id;
  }
  const existing = req.headers['x-session-id'];
  if (existing && /^[a-zA-Z0-9_-]{16,64}$/.test(existing)) {
    return existing;
  }
  const sessionId = `anon_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  res.setHeader('X-Session-Id', sessionId);
  return sessionId;
}

/**
 * POST /api/chat
 * 发送消息
 */
router.post('/', optionalAuth, chatLimiter, async (req, res) => {
  try {
    const { text, personality, context } = req.body;

    // 验证输入
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: '消息内容不能为空',
        code: 'INVALID_INPUT'
      });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        error: '消息内容过长',
        code: 'MESSAGE_TOO_LONG'
      });
    }

    // 获取用户ID（如果已登录）
    const userId = getSessionUserId(req, res);

    // 处理消息
    const response = await chatService.processMessage({
      text,
      personality,
      context,
      userId
    });

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    errorLog('Chat error', { error: error.message });
    res.status(500).json({
      error: '消息处理失败',
      code: 'CHAT_ERROR'
    });
  }
});

/**
 * GET /api/chat/history
 * 获取聊天历史
 */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const userId = req.user.id;

    const history = await chatService.getHistory(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    errorLog('History error', { error: error.message });
    res.status(500).json({
      error: '获取历史记录失败',
      code: 'HISTORY_ERROR'
    });
  }
});

/**
 * DELETE /api/chat/history
 * 清除聊天历史
 */
router.delete('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    await chatService.clearHistory(userId);

    res.json({
      success: true,
      message: '聊天历史已清除'
    });
  } catch (error) {
    errorLog('Clear history error', { error: error.message });
    res.status(500).json({
      error: '清除历史记录失败',
      code: 'CLEAR_HISTORY_ERROR'
    });
  }
});

/**
 * POST /api/chat/stream
 * 流式聊天
 */
router.post('/stream', optionalAuth, chatLimiter, async (req, res) => {
  try {
    const { text, personality, context } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: '消息内容不能为空',
        code: 'INVALID_INPUT'
      });
    }
    // 与 POST /api/chat 一致的文本长度限制（防止超大文本撑爆上下文/记忆库）
    if (text.length > 5000) {
      return res.status(400).json({
        error: '消息内容过长（最多5000字符）',
        code: 'INVALID_INPUT'
      });
    }

    const userId = getSessionUserId(req, res);

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 流式处理
    await chatService.processStream({
      text,
      personality,
      context,
      userId,
      onData: (chunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      },
      onEnd: (result) => {
        // 透传 source/toolResults（供前端渲染文件链接）
        res.write(`data: ${JSON.stringify({ type: 'end', source: result ? result.source : null, toolResults: result ? result.toolResults : null })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      },
      onError: (error) => {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    });
  } catch (error) {
    errorLog('Stream error', { error: error.message });
    if (!res.headersSent) {
      res.status(500).json({
        error: '流式处理失败',
        code: 'STREAM_ERROR'
      });
    }
  }
});

/**
 * GET /api/chat/stats
 * 获取 AI 路径健康指标（Ollama 成功率/降级、记忆、教训）
 */
router.get('/stats', authMiddleware, async (_req, res) => {
  try {
    const stats = {
      chat: chatService.getStats(),
      memory: null,
      lessons: null
    };
    try {
      const { BrainSystem } = require('../../src/core/BrainSystem');
      if (BrainSystem.getMemoryStats) {stats.memory = BrainSystem.getMemoryStats();}
      const LessonLibrary = require('../../src/core/LessonLibrary');
      stats.lessons = new LessonLibrary({ quiet: true }).getStats();
    } catch (e) { /* BrainSystem/教训可选 */ }
    res.json({ success: true, data: stats });
  } catch (error) {
    errorLog('Stats error', { error: error.message });
    res.status(500).json({ error: '获取统计失败', code: 'STATS_ERROR' });
  }
});

module.exports = router;