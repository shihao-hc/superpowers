/**
 * UltraWork AI 服务器入口
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http');
const compression = require('compression');
const helmet = require('helmet');

const config = require('./config');
const middleware = require('./middleware');
const routes = require('./routes');
const logger = require('./utils/logger');
const security = require('./middleware/security');

// 创建Express应用
const app = express();
const port = config.get('server.port');
const host = config.get('server.host');

// ============ 基础中间件 ============

// 请求ID
app.use(security.requestId);

// 安全响应头
app.use(security.securityHeaders);

// 安全中间件
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
}

// 压缩
app.use(compression());

// 信任代理
if (config.get('server.trustProxy')) {
  app.set('trust proxy', 1);
}

// 解析JSON
app.use(express.json({ limit: config.get('server.maxRequestSize') }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 安全检测中间件
app.use(security.strictInputValidation);
app.use(security.sqlInjectionDetection);
app.use(security.xssDetection);
app.use(security.pathTraversalDetection);
app.use(security.rateLimitBypassDetection);

// 请求日志
if (process.env.NODE_ENV !== 'test') {
  app.use(logger.requestLogger);
}

// CORS
app.use(middleware.corsMiddleware);

// 速率限制
app.use('/api/', middleware.apiLimiter);

// ============ 静态文件 ============

const staticPath = config.get('frontend.staticPath');
app.use(express.static(staticPath, {
  maxAge: config.get('frontend.maxAge'),
  index: 'index.html'
}));

// ============ API路由 ============

app.use('/api', routes);

// ============ 前端路由 ============

// 所有其他请求返回前端
app.all(/.*/, (req, res) => {
  // 排除API请求
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  res.sendFile(path.join(staticPath, 'index.html'));
});

// ============ 错误处理 ============

// 404处理
app.use(middleware.notFoundHandler);

// 全局错误处理
app.use(middleware.errorHandler);

// ============ 启动服务器 ============

const server = http.createServer(app);

// WebSocket集成（可选）
try {
  const WebSocketServer = require('./websocket');
  const { FeatureFlagsService } = require('../src/agent/FeatureFlagsService');
  
  // 初始化特性开关服务
  const featureFlags = new FeatureFlagsService();
  
  // 挂载到 app 以便路由访问
  app.set('featureFlags', featureFlags);
  app.set('permissionService', require('./middleware').permissionService);
  
  // 初始化 WebSocket
  if (typeof WebSocketServer === 'function') {
    WebSocketServer(server, app);
  }
  
  console.log('✓ Claude Code 风格服务已集成');
} catch (error) {
  console.warn('WebSocket 集成跳过:', error.message);
}

// 启动服务器
server.listen(port, host, () => {
  logger.info('UltraWork AI Server started', {
    host,
    port,
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid
  });
  
  // 验证配置
  const validation = config.validate();
  if (!validation.valid) {
    logger.warn('配置警告', { errors: validation.errors });
  }
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，开始优雅关闭...');
  
  server.close(() => {
    logger.info('HTTP服务器已关闭');
    process.exit(0);
  });
  
  // 强制关闭超时
  setTimeout(() => {
    logger.error('强制关闭超时');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  logger.info('收到SIGINT信号，开始优雅关闭...');
  
  server.close(() => {
    logger.info('HTTP服务器已关闭');
    process.exit(0);
  });
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获异常', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason: String(reason) });
});

module.exports = app;