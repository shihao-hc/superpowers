/**
 * Skills 路由
 * 集成 Claude Code 风格的命令系统和技能系统
 */

const express = require('express');
const router = express.Router();
const { CommandService } = require('../../src/agent/CommandService');
const { FeatureFlagsService } = require('../../src/agent/FeatureFlagsService');
const { authMiddleware, sensitiveLimiter } = require('../middleware');

// 初始化服务
const commandService = new CommandService();
const featureFlags = new FeatureFlagsService();

/**
 * GET /api/skills
 * 获取所有可用技能
 */
router.get('/', (req, res) => {
  const skills = commandService.getAll();

  res.json({
    success: true,
    data: skills
  });
});

/**
 * GET /api/skills/commands
 * 获取所有可用命令
 */
router.get('/commands', (req, res) => {
  const commands = commandService.getAll();

  res.json({
    success: true,
    data: commands
  });
});

/**
 * POST /api/skills/execute
 * 执行命令/技能
 */
router.post('/execute', sensitiveLimiter, authMiddleware, async (req, res) => {
  try {
    const { command, args = {}, context = {} } = req.body;

    if (!command) {
      return res.status(400).json({
        error: '缺少命令',
        code: 'INVALID_INPUT'
      });
    }

    const result = await commandService.execute(command, args, context);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const isClientError = error.message && error.message.startsWith('Command not found');
    res.status(isClientError ? 400 : 500).json({
      error: error.message,
      code: isClientError ? 'COMMAND_NOT_FOUND' : 'EXECUTE_ERROR'
    });
  }
});

/**
 * GET /api/skills/features
 * 获取特性开关状态
 */
router.get('/features', (req, res) => {
  const features = featureFlags.getAll();

  res.json({
    success: true,
    data: features
  });
});

/**
 * POST /api/skills/features/:feature
 * 设置特性开关
 */
router.post('/features/:feature', authMiddleware, (req, res) => {
  const { feature } = req.params;
  const { enabled } = req.body;

  if (enabled) {
    featureFlags.enable(feature);
  } else {
    featureFlags.disable(feature);
  }

  res.json({
    success: true,
    data: { feature, enabled: featureFlags.isEnabled(feature) }
  });
});

/**
 * GET /api/skills/features/:feature
 * 检查特性开关状态
 */
router.get('/features/:feature', (req, res) => {
  const { feature } = req.params;
  const enabled = featureFlags.isEnabled(feature);

  res.json({
    success: true,
    data: { feature, enabled }
  });
});

router.get('/stats', (req, res) => {
  const all = commandService.getAll();
  const stats = commandService.getStats ? commandService.getStats() : {};
  res.json({
    success: true,
    total: all.length,
    commands: all,
    ...stats
  });
});

module.exports = router;
