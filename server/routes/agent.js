/**
 * Agent 路由
 * 集成 Claude Code 风格的 Agent 循环、任务系统和状态管理
 */

const express = require('express');
const router = express.Router();
const { TaskService } = require('../../src/agent/TaskService');
const { MessageService } = require('../../src/agent/MessageService');
const { authMiddleware, memoryLimiter } = require('../middleware');

// 初始化服务
const taskService = new TaskService();
const messageService = new MessageService();

// 按用户隔离的数据容器
// 修复：原 stateStore/messageService 为模块级单例（跨用户共享 = 用户 A 数据进用户 B 请求 = 隐私泄露）；
// 且 stateStore.set/get 方法根本不存在（StateStore 只有 setState/getState）导致接口 100% 500。
const agentData = new Map();
function getAgentData(userId) {
  const key = userId || 'anonymous';
  if (!agentData.has(key)) {
    agentData.set(key, { states: new Map(), messages: [] });
  }
  return agentData.get(key);
}

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
      priority,
      userId: req.user && req.user.id
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
  // 跨用户隔离：仅本人可读自己的任务
  if (task.userId && req.user && task.userId !== req.user.id) {
    return res.status(403).json({ error: '无权访问该任务', code: 'FORBIDDEN' });
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

  // 修复：TaskService 无 getTasks（只有 getAllTasks）；按 userId 过滤实现隔离
  const all = taskService.getAllTasks() || [];
  const tasks = all
    .filter((t) => !t.userId || !req.user || t.userId === req.user.id)
    .filter((t) => !status || t.status === status)
    .slice(0, parseInt(limit) || 20);

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

    const ad = getAgentData(req.user && req.user.id);
    ad.states.set(`${namespace}:${key}`, value);

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

  const value = getAgentData(req.user && req.user.id).states.get(`${namespace}:${key}`);

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
    if (content.length > 5000) {
      return res.status(400).json({
        error: '消息内容过长（最多5000字符）',
        code: 'INVALID_INPUT'
      });
    }

    const ad = getAgentData(req.user && req.user.id);
    // 用户消息按 userId 隔离存储（原 messageService 为全局单例，跨用户混合）
    ad.messages.push({ type: role, content, metadata, timestamp: Date.now() });
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
        // 历史按 userId 隔离（不再从全局 messageService 取混合消息）
        const history = ad.messages.slice(-6).map((m) => ({
          role: m.type === 'assistant' ? 'assistant' : 'user',
          content: typeof m.content === 'string' ? m.content : ''
        }));
        const r = await chatService.generateResponse(content, {
          personality: 'default',
          context: { lastIntent: intent },
          messages: history
        }, req.user && req.user.id);
        if (r && r.text) {
          reply = { text: r.text, source: r.source || 'fallback' };
          // AI 回复写回该用户历史（原从未写回，多轮语义断裂）
          ad.messages.push({ type: 'assistant', content: r.text, timestamp: Date.now() });
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
  // 修复：taskService.getStats/stateStore.getStats 均不存在（曾导致 500）
  const allTasks = taskService.getAllTasks() || [];
  const userKey = (req.user && req.user.id) || 'anonymous';
  const ad = agentData.get(userKey) || { states: new Map(), messages: [] };
  res.json({
    success: true,
    data: {
      tasks: { total: allTasks.length, mine: allTasks.filter((t) => t.userId === userKey).length },
      state: { entries: ad.states.size },
      messages: { total: ad.messages.length }
    }
  });
});

module.exports = router;
