/**
 * UltraWork AI 服务器入口
 */

require('dotenv').config();

// 默认为生产环境（开发需显式设置 NODE_ENV=development）
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

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
const { maskResponseBody } = require('./middleware/dataMask');

// ============ Claude Code 模块集成 ============
const { MessageService, SuggestionPipeline } = require('../src/agent');
const { FuzzyMatcher } = require('../src/utils');
const { defaultManager: hooksManager } = require('../src/hooks');
const { UnifiedMemory } = require('../src/memory');
const { SettingsSync } = require('../src/config');
const { SelfLearningSystem } = require('../src/core');
const { BrainSystem } = require('../src/core/BrainSystem');
const { BrainBridge } = require('../src/core/BrainBridge');
const { MCPManager } = require('../src/mcp');
const InferenceBridge = require('../src/localInferencing/InferBridge');

// 初始化模块
let messageService = null;
let fuzzyMatcher = null;
let suggestionPipeline = null;
let unifiedMemory = null;
let settingsSync = null;
let selfLearning = null;
let mcpManager = null;
let inferenceBridge = null;
let brainBridge = null;
let brainCodeImprover = null;
let brainProactiveAdvisor = null;
let securityWatcher = null;

function initializeModules() {
  logger.info('[Server] 初始化 Claude Code 模块...');

  // MessageService - 对话消息管理
  try {
    messageService = new MessageService({ maxMessages: 500, uuidSetCapacity: 1000 });
    logger.info('[MessageService] 对话消息管理已启用');
  } catch (e) {
    logger.warn('[MessageService] 初始化失败:', e.message);
  }

  // FuzzyMatcher - 模糊匹配器
  try {
    fuzzyMatcher = new FuzzyMatcher({ threshold: 0.3, ignoreCase: true });
    logger.info('[FuzzyMatcher] 模糊匹配已启用');
  } catch (e) {
    logger.warn('[FuzzyMatcher] 初始化失败:', e.message);
  }

  // SuggestionPipeline - 建议管道
  try {
    suggestionPipeline = new SuggestionPipeline({ enabled: true });
    suggestionPipeline.use('skillSuggestion', async (ctx) => {
      const { message } = ctx;
      const skillKeywords = {
        'test': ['测试', '测试用例', '单元测试'],
        'git': ['git', 'commit', 'branch', 'push'],
        'docker': ['docker', 'container', '镜像']
      };
      const suggestions = [];
      const lowerMsg = (message || '').toLowerCase();
      for (const [skill, keywords] of Object.entries(skillKeywords)) {
        if (keywords.some((kw) => lowerMsg.includes(kw))) {
          suggestions.push({ type: 'skill', name: skill, reason: '检测到关键词' });
        }
      }
      return { ...ctx, suggestions };
    });
    logger.info('[SuggestionPipeline] 建议管道已启用');
  } catch (e) {
    logger.warn('[SuggestionPipeline] 初始化失败:', e.message);
  }

  // UnifiedMemory - 统一内存
  try {
    unifiedMemory = new UnifiedMemory();
    unifiedMemory.initialize().then(() => {
      logger.info('[UnifiedMemory] 会话记忆已启用');
    }).catch((e) => {
      logger.warn('[UnifiedMemory] 初始化失败:', e.message);
    });
  } catch (e) {
    logger.warn('[UnifiedMemory] 创建失败:', e.message);
  }

  // SettingsSync - 设置同步
  try {
    settingsSync = new SettingsSync({ localPath: path.join(process.cwd(), '.opencode', 'settings') });
    logger.info('[SettingsSync] 设置同步已启用');
  } catch (e) {
    logger.warn('[SettingsSync] 初始化失败:', e.message);
  }

  // SelfLearningSystem - 自主学习
  try {
    selfLearning = new SelfLearningSystem({ enabled: true });
    logger.info('[SelfLearning] 自主学习已启用');
  } catch (e) {
    logger.warn('[SelfLearning] 初始化失败:', e.message);
  }

  // MCPManager - 条件初始化
  try {
    const mcpConfigPath = path.join(process.cwd(), '.opencode', 'mcp-config.json');
    const fs = require('fs');
    if (fs.existsSync(mcpConfigPath)) {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
      if (mcpConfig && Object.keys(mcpConfig).length > 0) {
        mcpManager = new MCPManager({ maxConcurrent: 3 });
        mcpManager.updateServers(mcpConfig).catch((e) => {
          logger.warn('[MCPManager] 更新失败:', e.message);
          mcpManager = null;
        });
        logger.info('[MCPManager] MCP服务器管理已启用');
      }
    }
  } catch (e) {
    logger.warn('[MCPManager] 初始化失败:', e.message);
  }

  // InferenceBridge - 推理桥接器
  try {
    inferenceBridge = new InferenceBridge();
    inferenceBridge.loadModel().then(() => {
      logger.info('[InferenceBridge] 推理服务已就绪');
    }).catch((e) => {
      logger.warn('[InferenceBridge] 加载失败:', e.message);
    });
  } catch (e) {
    logger.warn('[InferenceBridge] 初始化失败:', e.message);
  }

  // ============ BrainSystem 自动化接入 ============

  // 1. 连接 BrainSystem 钩子系统（自动诊断/教训学习/风险分析）
  try {
    BrainSystem.connectHooks();
    logger.info('[BrainSystem] 钩子系统已连接 (自动诊断/教训学习/风险分析/会话管理)');
  } catch (e) {
    logger.warn('[BrainSystem] 钩子连接失败:', e.message);
  }

  // 2. 初始化 BrainBridge（断路器/循环防护/审计日志/Phase C决策）
  try {
    brainBridge = new BrainBridge();
    brainBridge.initialize();
    logger.info('[BrainBridge] 大脑桥接已启动 (断路器/循环防护/审计日志)');
  } catch (e) {
    logger.warn('[BrainBridge] 初始化失败:', e.message);
  }

  // 3. 启动 SelfCodeImprover 自动代码改进（每小时）
  try {
    const SelfCodeImprover = require('../src/core/SelfCodeImprover');
    const sci = new SelfCodeImprover();
    sci.startAutoImprovementLoop(60 * 60 * 1000);
    brainCodeImprover = sci;
    logger.info('[SelfCodeImprover] 自动代码改进循环已启动 (间隔: 1小时)');
  } catch (e) {
    logger.warn('[SelfCodeImprover] 启动失败:', e.message);
  }

  // 4. 启动 ProactiveAdvisor 定期扫描（每小时）
  try {
    const ProactiveAdvisor = require('../src/core/ProactiveAdvisor');
    const pa = new ProactiveAdvisor();
    // 立即执行一次扫描
    const scanResult = pa.scan();
    if (scanResult && (scanResult.warnings || scanResult.suggestions)) {
      logger.info(`[ProactiveAdvisor] 初始扫描: ${scanResult.warnings?.length || 0} 警告, ${scanResult.suggestions?.length || 0} 建议`);
    }
    brainProactiveAdvisor = pa;
    logger.info('[ProactiveAdvisor] 主动建议系统已启动');
  } catch (e) {
    logger.warn('[ProactiveAdvisor] 启动失败:', e.message);
  }

  logger.info('[Server] Claude Code 模块初始化完成');
}

function cleanupModules() {
  logger.info('[Server] 清理 Claude Code 模块...');
  if (hooksManager) {hooksManager.destroy();}
  if (suggestionPipeline) {suggestionPipeline.destroy();}
  if (mcpManager) {mcpManager.cleanup();}
  if (unifiedMemory?.initialized) {unifiedMemory.session.save().catch(() => {});}
  if (messageService) {logger.info('[MessageService] 会话统计:', messageService.getStats());}

  // ChatService 清理（释放 MCP 子进程）
  try {
    const chatService = require('./services/chatService');
    if (chatService && typeof chatService.shutdown === 'function') {
      chatService.shutdown().catch(() => {});
    }
  } catch (e) { /* ChatService 可选 */ }

  // BrainSystem 清理
  if (brainCodeImprover) {
    try { brainCodeImprover.stopAutoImprovementLoop(); } catch (e) { /* */ }
  }
  if (BrainSystem.isHooksConnected()) {
    try { BrainSystem.disconnectHooks(); } catch (e) { /* */ }
  }
  logger.info('[BrainSystem] 自动化模块已清理');

  // 安全监控清理
  if (securityWatcher) {
    try {
      const { stopSecurityMonitor } = require('../src/daemon/securityMonitor');
      stopSecurityMonitor(securityWatcher);
      securityWatcher = null;
    } catch (e) { /* */ }
  }
}

// 创建Express应用
const app = express();

// 导出内部模块供中间件使用
app.getModules = () => ({
  messageService, fuzzyMatcher, suggestionPipeline, unifiedMemory,
  settingsSync, selfLearning, mcpManager, inferenceBridge, hooksManager,
  brainBridge, brainCodeImprover, brainProactiveAdvisor
});
const port = config.get('server.port');
const host = config.get('server.host');

// ============ Claude Code 模块初始化 ============
initializeModules();

// ============ 基础中间件 ============

// 请求ID
app.use(security.requestId);

// 安全响应头
app.use(security.securityHeaders);

// 安全中间件
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  // nonce-based CSP 允许安全的内联脚本，替代 helmet 静态 CSP
  app.use(security.enhancedCSP);
} else {
  // 开发环境也添加基础安全头
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        scriptSrc: ['\'self\'', '\'unsafe-inline\'', '\'unsafe-eval\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        imgSrc: ['\'self\'', 'data:', 'blob:'],
        connectSrc: ['\'self\'', 'ws:', 'wss:']
      }
    },
    crossOriginEmbedderPolicy: false
  }));
}

// 压缩
app.use(compression());

// 信任代理（生产环境默认启用，TRUST_PROXY=false 可关闭）
if (config.get('server.trustProxy')) {
  app.set('trust proxy', 1);
}

// 解析JSON
app.use(express.json({ limit: config.get('server.maxRequestSize') }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// 安全检测中间件
app.use(security.strictInputValidation);
app.use(security.sqlInjectionDetection);
app.use(security.xssDetection);
app.use(security.pathTraversalDetection);
app.use(security.rateLimitBypassDetection);

// 数据掩码（响应体PII脱敏）
app.use(maskResponseBody);

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
    const wsServer = WebSocketServer(server, app);
    app.set('wss', wsServer);
  }

  logger.info('Claude Code 风格服务已集成');
} catch (error) {
  logger.warn('WebSocket 集成跳过', { error: error.message });
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
    logger.error('配置错误', { errors: validation.errors });
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  // 开发模式启动安全文件监控
  if (process.env.NODE_ENV === 'development') {
    try {
      const { startSecurityMonitor } = require('../src/daemon/securityMonitor');
      securityWatcher = startSecurityMonitor();
    } catch (err) {
      console.warn('⚠️  Security monitor unavailable:', err.message);
    }
  }
});

// 优雅关闭
let shutdownTimer = null;

process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，开始优雅关闭...');
  cleanupModules();

  server.close(() => {
    logger.info('HTTP服务器已关闭');
    if (shutdownTimer) {clearTimeout(shutdownTimer);}
    process.exit(0);
  });

  // 强制关闭超时
  shutdownTimer = setTimeout(() => {
    logger.error('强制关闭超时');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  logger.info('收到SIGINT信号，开始优雅关闭...');
  cleanupModules();

  server.close(() => {
    logger.info('HTTP服务器已关闭');
    process.exit(0);
  });

  // Safety timeout to prevent hanging
  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获异常', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  logger.error('未处理的Promise拒绝', { reason: String(reason) });
});

module.exports = app;