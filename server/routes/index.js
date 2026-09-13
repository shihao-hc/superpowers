/**
 * UltraWork AI 路由汇总
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { apiVersion, authMiddleware } = require('../middleware');

// API版本中间件
router.use(apiVersion);

/**
 * GET /api/files/:skillName/:filename
 * 下载生成的文档（认证保护 + 路径穿越防御）
 */
router.get('/files/:skillName/:filename', authMiddleware, (req, res) => {
  const { skillName, filename } = req.params;
  // 严格格式校验（防路径穿越）
  if (!/^[a-zA-Z0-9_-]+$/.test(skillName) || !/^[a-zA-Z0-9_.-]+$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  const uploadsRoot = path.join(process.cwd(), 'uploads', 'skills');
  const filePath = path.join(uploadsRoot, skillName, filename);
  // 双重确认：解析后仍在 uploads 根内
  if (!path.resolve(filePath).startsWith(path.resolve(uploadsRoot))) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath, filename);
});

// 导入子路由
const authRoutes = require('./auth');
const chatRoutes = require('./chat');
const personalityRoutes = require('./personality');
const visionRoutes = require('./vision');
const agentRoutes = require('./agent');
const skillsRoutes = require('./skills');
const mcpRoutes = require('./mcp');
const gameRoutes = require('./game');
const workflowRoutes = require('./workflow');
const verticalDomainRoutes = require('./verticalDomain');
const marketplaceRoutes = require('./marketplace');
const healthRoutes = require('./health');

// 注册路由
router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
router.use('/personality', personalityRoutes);
router.use('/vision', visionRoutes);
router.use('/agent', agentRoutes);
router.use('/skills', skillsRoutes);
router.use('/mcp', mcpRoutes);
router.use('/game', gameRoutes);
router.use('/workflow', workflowRoutes);
router.use('/vertical-domains', verticalDomainRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/health', healthRoutes);

// 404处理
router.use((req, res) => {
  res.status(404).json({
    error: '未找到请求的资源',
    path: req.path,
    method: req.method,
    code: 'NOT_FOUND'
  });
});

module.exports = router;