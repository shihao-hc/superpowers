/**
 * UltraWork AI 聊天路由
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuth, chatLimiter } = require('../middleware');
const chatService = require('../services/chatService');

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
    const userId = req.user?.id || 'anonymous';

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
    console.error('Chat error:', error);
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
    console.error('History error:', error);
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
    console.error('Clear history error:', error);
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

    const userId = req.user?.id || 'anonymous';

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
      onEnd: () => {
        res.write('data: [DONE]\n\n');
        res.end();
      },
      onError: (error) => {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    });
  } catch (error) {
    console.error('Stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: '流式处理失败',
        code: 'STREAM_ERROR'
      });
    }
  }
});

module.exports = router;