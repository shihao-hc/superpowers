/**
 * Agent 路由
 * 集成 Claude Code 风格的 Agent 循环、任务系统和状态管理
 */

const express = require('express');
const router = express.Router();
const { TaskService } = require('../../src/agent/TaskService');
const { StateStore } = require('../../src/agent/StateStore');
const { MessageService } = require('../../src/agent/MessageService');
const { authMiddleware, memoryLimiter } = require('../middleware');

// 初始化服务
const taskService = new TaskService();
const stateStore = new StateStore();
const messageService = new MessageService();

/**
 * GET /api/agent
 * 获取 Agent 状态
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ready',
      version: '1.0.0',
      features: ['task', 'state', 'message']
    }
  });
});

/**
 * POST /api/agent/task
 * 创建任务
 */
router.post('/task', memoryLimiter, authMiddleware, async (req, res) => {
  try {
    const { type, payload, priority = 'normal' } = req.body;

    if (!type || !payload) {
      return res.status(400).json({
        error: '缺少必要参数: type, payload',
        code: 'INVALID_PARAMS'
      });
    }

    const task = await taskService.createTask({
      type,
      payload,
      priority
    });

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'TASK_ERROR'
    });
  }
});

/**
 * GET /api/agent/task/:id
 * 获取任务状态
 */
router.get('/task/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  const task = taskService.getTask(id);
  if (!task) {
    return res.status(404).json({
      error: '任务不存在',
      code: 'NOT_FOUND'
    });
  }

  res.json({
    success: true,
    data: task
  });
});

/**
 * GET /api/agent/tasks
 * 获取所有任务
 */
router.get('/tasks', authMiddleware, (req, res) => {
  const { status, limit = 20 } = req.query;

  const tasks = taskService.getTasks({ status, limit: parseInt(limit) });

  res.json({
    success: true,
    data: tasks
  });
});

/**
 * POST /api/agent/state
 * 保存状态
 */
router.post('/state', memoryLimiter, authMiddleware, (req, res) => {
  try {
    const { key, value, namespace = 'default' } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({
        error: '缺少必要参数: key, value',
        code: 'INVALID_PARAMS'
      });
    }

    stateStore.set(key, value, namespace);

    res.json({
      success: true,
      data: { key, namespace }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'STATE_ERROR'
    });
  }
});

/**
 * GET /api/agent/state/:key
 * 获取状态
 */
router.get('/state/:key', authMiddleware, (req, res) => {
  const { key } = req.params;
  const { namespace = 'default' } = req.query;

  const value = stateStore.get(key, namespace);

  res.json({
    success: true,
    data: { key, value, namespace }
  });
});

/**
 * POST /api/agent/message
 * 处理消息
 */
router.post('/message', memoryLimiter, authMiddleware, async (req, res) => {
  try {
    const { content, role = 'user', metadata = {} } = req.body;

    if (!content) {
      return res.status(400).json({
        error: '消息内容不能为空',
        code: 'INVALID_INPUT'
      });
    }

    const message = await messageService.processMessage({
      content,
      role,
      metadata
    });

    // BrainSystem 感知：意图分析 + 记忆存储（非侵入式，与 chat 路径对称）
    try {
      const { BrainSystem } = require('../../src/core/BrainSystem');
      if (BrainSystem.analyzeIntent) {
        BrainSystem.analyzeIntent(content);
      }
      if (BrainSystem.smartStore) {
        BrainSystem.smartStore(`agent_${req.user.id}_${Date.now()}`, { input: content, role, userId: req.user.id });
      }
    } catch (e) { /* BrainSystem 可选，失败静默 */ }

    // 用户消息 → 生成 AI 回复（复用 chatService 的 Ollama 引擎，非侵入式）
    let reply = null;
    if (role === 'user') {
      try {
        const { BrainSystem } = require('../../src/core/BrainSystem');
        const chatService = require('../services/chatService');
        const intent = (BrainSystem && BrainSystem.analyzeIntent) ? BrainSystem.analyzeIntent(content) : null;
        const history = messageService.getMessages().slice(-6).map((m) => ({
          role: m.type === 'assistant' ? 'assistant' : 'user',
          content: typeof m.content === 'string' ? m.content : ''
        }));
        const r = await chatService.generateResponse(content, {
          personality: 'default',
          context: { lastIntent: intent },
          messages: history
        });
        if (r && r.text) {
          reply = { text: r.text, source: r.source || 'fallback' };
        }
      } catch (e) { /* BrainSystem/Ollama 可选，保持只存行为 */ }
    }

    res.json({
      success: true,
      data: message,
      reply
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'MESSAGE_ERROR'
    });
  }
});

/**
 * GET /api/agent/stats
 * 获取统计信息
 */
router.get('/stats', authMiddleware, (req, res) => {
  res.json({
    success: true,
    data: {
      tasks: taskService.getStats(),
      state: stateStore.getStats(),
      messages: messageService.getStats()
    }
  });
});

module.exports = router;
