# UltraWork AI 服务器架构重构方案

## 📋 重构概述

**目标**: 将 `server/staticServer.js` (2864行) 拆分为独立的模块化架构

**当前问题**:
- 单文件2864行，违反单一职责原则
- 所有路由、中间件、业务逻辑混合在一起
- 难以测试、维护和扩展
- 代码耦合度高

## 🏗️ 新架构设计

### 目录结构

```
server/
├── app.js                          # Express应用配置
├── index.js                        # 服务器入口
├── config/
│   ├── index.js                    # 配置管理
│   └── routes.js                   # 路由配置
├── middleware/
│   ├── index.js                    # 中间件导出
│   ├── auth.js                     # JWT认证中间件
│   ├── rateLimiter.js              # 速率限制
│   ├── cors.js                     # CORS配置
│   ├── helmet.js                   # 安全标头
│   ├── compression.js              # 压缩中间件
│   ├── validation.js               # 输入验证
│   └── audit.js                    # 审计日志
├── routes/
│   ├── index.js                    # 路由汇总
│   ├── auth.js                     # 认证路由
│   ├── chat.js                     # 聊天API
│   ├── personality.js              # 人格管理
│   ├── vision.js                   # 视觉API
│   ├── agent.js                    # Agent API
│   ├── skills.js                   # 技能API
│   ├── mcp.js                      # MCP API
│   ├── game.js                     # 游戏API
│   ├── workflow.js                 # 工作流API
│   ├── verticalDomain.js           # 垂直领域
│   ├── marketplace.js              # 市场API
│   └── websocket.js                # WebSocket处理
├── services/
│   ├── index.js                    # 服务导出
│   ├── chatService.js              # 聊天服务
│   ├── personalityService.js       # 人格服务
│   ├── memoryService.js            # 记忆服务
│   ├── inferenceService.js         # 推理服务
│   ├── websocketService.js         # WebSocket服务
│   ├── gameService.js              # 游戏服务
│   └── skillService.js             # 技能服务
├── utils/
│   ├── index.js                    # 工具导出
│   ├── errorHandler.js             # 错误处理
│   ├── logger.js                   # 日志工具
│   └── helpers.js                  # 辅助函数
└── websocket/
    ├── index.js                    # WebSocket入口
    ├── handlers/
    │   ├── chatHandler.js          # 聊天处理器
    │   ├── skillHandler.js         # 技能处理器
    │   └── gameHandler.js          # 游戏处理器
    └── managers/
        ├── sessionManager.js       # 会话管理
        └── roomManager.js          # 房间管理
```

## 📝 拆分步骤

### 第一阶段: 创建基础架构 (1-2天)

#### 1. 创建Express应用配置 (`app.js`)
```javascript
const express = require('express');
const path = require('path');
const config = require('./config');

function createApp() {
  const app = express();
  
  // 基础配置
  app.set('trust proxy', config.get('server.trustProxy', false));
  
  // JSON解析
  app.use(express.json({ limit: config.get('server.maxRequestSize', '10mb') }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  return app;
}

module.exports = { createApp };
```

#### 2. 创建配置管理 (`config/index.js`)
```javascript
const path = require('path');

const config = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    trustProxy: process.env.TRUST_PROXY === 'true',
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb'
  },
  
  security: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000']
  },
  
  rateLimit: {
    windowMs: 60000,
    max: {
      api: 100,
      chat: 30,
      auth: 5
    }
  },
  
  websocket: {
    pingTimeout: 60000,
    pingInterval: 25000
  }
};

module.exports = {
  get: (key, defaultValue) => {
    const keys = key.split('.');
    let value = config;
    for (const k of keys) {
      value = value?.[k];
    }
    return value !== undefined ? value : defaultValue;
  },
  getAll: () => config
};
```

#### 3. 创建中间件模块 (`middleware/`)

**middleware/auth.js**
```javascript
const jwt = require('jsonwebtoken');
const config = require('../config');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, config.get('security.jwtSecret'));
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    try {
      const decoded = jwt.verify(token, config.get('security.jwtSecret'));
      req.user = decoded;
    } catch (error) {
      // Token无效但不阻止请求
    }
  }
  
  next();
}

module.exports = { authMiddleware, optionalAuth };
```

**middleware/rateLimiter.js**
```javascript
const rateLimit = require('express-rate-limit');
const config = require('../config');

function createRateLimiter(options = {}) {
  const { windowMs, max, message, keyGenerator } = options;
  
  return rateLimit({
    windowMs: windowMs || config.get('rateLimit.windowMs'),
    max: max || 100,
    message: { error: message || '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyGenerator || ((req) => {
      const forwarded = req.headers['x-forwarded-for'];
      return forwarded ? forwarded.split(',')[0].trim() : req.ip;
    })
  });
}

const apiLimiter = createRateLimiter({ max: config.get('rateLimit.max.api') });
const chatLimiter = createRateLimiter({ max: config.get('rateLimit.max.chat') });
const authLimiter = createRateLimiter({ max: config.get('rateLimit.max.auth') });

module.exports = { createRateLimiter, apiLimiter, chatLimiter, authLimiter };
```

### 第二阶段: 拆分路由模块 (2-3天)

#### 4. 创建路由模块

**routes/index.js**
```javascript
const express = require('express');
const router = express.Router();

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

// API版本中间件
router.use((req, res, next) => {
  res.setHeader('X-API-Version', 'v1');
  res.setHeader('X-Request-ID', Date.now().toString(36) + Math.random().toString(36).substr(2, 5));
  next();
});

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

// 健康检查
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404处理
router.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

module.exports = router;
```

**routes/chat.js**
```javascript
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { chatLimiter } = require('../middleware/rateLimiter');
const chatService = require('../services/chatService');

// 发送消息
router.post('/', authMiddleware, chatLimiter, async (req, res) => {
  try {
    const { text, personality, context } = req.body;
    const userId = req.user.id;
    
    const response = await chatService.processMessage({
      text,
      personality,
      context,
      userId
    });
    
    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取聊天历史
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const userId = req.user.id;
    
    const history = await chatService.getHistory(userId, { limit, offset });
    res.json(history);
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

### 第三阶段: 创建服务层 (2-3天)

#### 5. 创建服务模块

**services/index.js**
```javascript
const chatService = require('./chatService');
const personalityService = require('./personalityService');
const memoryService = require('./memoryService');
const inferenceService = require('./inferenceService');
const websocketService = require('./websocketService');
const gameService = require('./gameService');
const skillService = require('./skillService');

module.exports = {
  chatService,
  personalityService,
  memoryService,
  inferenceService,
  websocketService,
  gameService,
  skillService
};
```

**services/chatService.js**
```javascript
const { EventEmitter } = require('events');

class ChatService extends EventEmitter {
  constructor() {
    super();
    this.conversations = new Map();
    this.messageQueue = [];
  }
  
  async processMessage({ text, personality, context, userId }) {
    const startTime = Date.now();
    
    try {
      // 获取或创建会话
      let conversation = this.conversations.get(userId);
      if (!conversation) {
        conversation = {
          id: userId,
          messages: [],
          personality: personality || 'default',
          createdAt: new Date()
        };
        this.conversations.set(userId, conversation);
      }
      
      // 添加用户消息
      conversation.messages.push({
        role: 'user',
        content: text,
        timestamp: new Date()
      });
      
      // 调用推理服务
      const response = await this.generateResponse(text, conversation, context);
      
      // 添加助手回复
      conversation.messages.push({
        role: 'assistant',
        content: response.text,
        timestamp: new Date()
      });
      
      // 限制会话长度
      if (conversation.messages.length > 100) {
        conversation.messages = conversation.messages.slice(-50);
      }
      
      // 发出事件
      this.emit('message:processed', {
        userId,
        latency: Date.now() - startTime
      });
      
      return response;
    } catch (error) {
      this.emit('message:error', { userId, error });
      throw error;
    }
  }
  
  async generateResponse(text, conversation, context) {
    // 这里调用实际的AI服务
    // 可以是Ollama、OpenAI等
    
    return {
      text: `收到: ${text}`,
      personality: conversation.personality,
      timestamp: new Date()
    };
  }
  
  async getHistory(userId, options = {}) {
    const conversation = this.conversations.get(userId);
    if (!conversation) {
      return { messages: [], total: 0 };
    }
    
    const { limit = 50, offset = 0 } = options;
    const messages = conversation.messages.slice(offset, offset + limit);
    
    return {
      messages,
      total: conversation.messages.length,
      offset,
      limit
    };
  }
  
  clearHistory(userId) {
    this.conversations.delete(userId);
  }
}

module.exports = new ChatService();
```

### 第四阶段: 集成WebSocket (1-2天)

#### 6. 创建WebSocket处理

**websocket/index.js**
```javascript
const { Server } = require('socket.io');
const config = require('../config');
const chatHandler = require('./handlers/chatHandler');
const skillHandler = require('./handlers/skillHandler');
const gameHandler = require('./handlers/gameHandler');
const sessionManager = require('./managers/sessionManager');

class WebSocketServer {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: config.get('security.corsOrigins'),
        methods: ['GET', 'POST']
      },
      pingTimeout: config.get('websocket.pingTimeout'),
      pingInterval: config.get('websocket.pingInterval')
    });
    
    this.setupMiddleware();
    this.setupEventHandlers();
  }
  
  setupMiddleware() {
    // 认证中间件
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      try {
        // 验证token
        const user = this.verifyToken(token);
        socket.user = user;
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });
  }
  
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.user?.id}`);
      
      // 创建会话
      sessionManager.createSession(socket.user.id, socket);
      
      // 注册处理器
      chatHandler.register(socket, this.io);
      skillHandler.register(socket, this.io);
      gameHandler.register(socket, this.io);
      
      // 断开连接处理
      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.user?.id}`);
        sessionManager.removeSession(socket.user.id);
      });
      
      // 错误处理
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.user?.id}:`, error);
      });
    });
  }
  
  verifyToken(token) {
    // 实际的token验证逻辑
    return { id: 'user-id', name: 'User' };
  }
  
  broadcast(event, data) {
    this.io.emit(event, data);
  }
  
  toRoom(room, event, data) {
    this.io.to(room).emit(event, data);
  }
}

module.exports = WebSocketServer;
```

## 🚀 迁移计划

### 第一周: 准备阶段
1. ✅ 创建新目录结构
2. ✅ 创建配置管理模块
3. ✅ 创建基础中间件

### 第二周: 路由迁移
1. 迁移认证路由
2. 迁移聊天路由
3. 迁移其他API路由

### 第三周: 服务层创建
1. 创建核心服务模块
2. 实现业务逻辑
3. 集成现有功能

### 第四周: WebSocket和测试
1. 迁移WebSocket处理
2. 编写集成测试
3. 性能测试和优化

## 📊 预期收益

| 指标 | 当前 | 重构后 | 改进 |
|------|------|--------|------|
| **代码行数/文件** | 2864 | <300 | 90%↓ |
| **模块数量** | 1 | 25+ | 2500%↑ |
| **测试覆盖率** | 5% | 50% | 900%↑ |
| **维护难度** | 高 | 低 | 80%↓ |
| **扩展性** | 差 | 优 | 100%↑ |

## 📝 注意事项

1. **向后兼容**: 保持API接口不变
2. **渐进迁移**: 分阶段迁移，避免一次性大规模改动
3. **测试覆盖**: 每个模块迁移后立即编写测试
4. **文档更新**: 及时更新API文档
5. **性能监控**: 迁移过程中持续监控性能指标