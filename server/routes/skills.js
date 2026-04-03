/**
 * Skills 路由
 * 集成 Claude Code 风格的命令系统和技能系统
 */

const express = require('express');
const router = express.Router();
const { CommandService } = require('../../src/agent/CommandService');
const { FeatureFlagsService } = require('../../src/agent/FeatureFlagsService');

// 初始化服务
const commandService = new CommandService();
const featureFlags = new FeatureFlagsService();

/**
 * GET /api/skills
 * 获取所有可用技能
 */
router.get('/', (req, res) => {
  const skills = commandService.getRegisteredCommands();
  
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
  const commands = commandService.getCommandList();
  
  res.json({
    success: true,
    data: commands
  });
});

/**
 * POST /api/skills/execute
 * 执行命令/技能
 */
router.post('/execute', async (req, res) => {
  try {
    const { command, args = {}, context = {} } = req.body;
    
    if (!command) {
      return res.status(400).json({
        error: '缺少命令',
        code: 'INVALID_INPUT'
      });
    }
    
    const result = await commandService.executeCommand(command, args, context);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'EXECUTE_ERROR'
    });
  }
});

/**
 * GET /api/skills/features
 * 获取特性开关状态
 */
router.get('/features', (req, res) => {
  const features = featureFlags.getAllFeatures();
  
  res.json({
    success: true,
    data: features
  });
});

/**
 * POST /api/skills/features/:feature
 * 设置特性开关
 */
router.post('/features/:feature', (req, res) => {
  const { feature } = req.params;
  const { enabled } = req.body;
  
  featureFlags.setFeature(feature, enabled);
  
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

module.exports = router;
