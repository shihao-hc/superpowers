/**
 * UltraWork AI 健康检查路由
 */

const express = require('express');
const router = express.Router();
const os = require('os');

/**
 * GET /api/health
 * 基础健康检查
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /api/health/detailed
 * 详细健康检查
 */
router.get('/detailed', (req, res) => {
  const memoryUsage = process.memoryUsage();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem()
    },
    process: {
      pid: process.pid,
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      },
      cpuUsage: process.cpuUsage()
    }
  });
});

/**
 * GET /api/health/ready
 * 就绪检查
 */
router.get('/ready', (req, res) => {
  // 检查依赖服务是否就绪
  const checks = {
    server: true
    // 在这里添加其他依赖检查
  };

  const allReady = Object.values(checks).every((v) => v);

  res.status(allReady ? 200 : 503).json({
    status: allReady ? 'ready' : 'not_ready',
    checks
  });
});

module.exports = router;