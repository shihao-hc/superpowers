require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http');

const config = require('../config');
const i18n = require('../src/i18n');
const app = express();
const port = config.get('server.port', 3000);
const wsConfig = config.get('websocket');
const serverConfig = config.get('server', {});

let helmet, rateLimit, compression;
try { helmet = require('helmet'); } catch (e) { console.warn('[Security] helmet not available'); }
try { rateLimit = require('express-rate-limit'); } catch (e) { console.warn('[Security] rate-limit not available'); }
try { compression = require('compression'); } catch (e) { console.warn('[Server] compression not available'); }

if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
        scriptSrc: ["'self'", "https://cdn.socket.io", "https://unpkg.com", "https://cdn.jsdelivr.net"],
        scriptSrcAttr: null,
        connectSrc: ["'self'", "ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        mediaSrc: ["'self'", "blob:", "http://localhost:*"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: 'strict-origin-when-cross-origin',
    xFrameOptions: 'DENY',
    xPoweredBy: false,
    permissionsPolicy: {
      microphone: ['self'],
      camera: []
    }
  }));
}
if (compression) app.use(compression());

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
  console.log('[Server] Trust proxy enabled');
}

// Request size limits
app.use((req, res, next) => {
  const limit = process.env.MAX_REQUEST_SIZE || '10mb';
  req.setTimeout(30000);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global error handler (place at end before 404)
// Note: Will be moved to end of file after all routes

// API版本化中间件
app.use('/api', (req, res, next) => {
  res.setHeader('X-API-Version', 'v1');
  res.setHeader('X-Request-ID', Date.now().toString(36) + Math.random().toString(36).substr(2, 5));
  next();
});

if (rateLimit) {
  const { ipKeyGenerator } = require('express-rate-limit');
  
  // General API limiter - 100 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) return forwarded.split(',')[0].trim();
      return ipKeyGenerator(req, res);
    }
  });
  app.use('/api/', apiLimiter);
  
  // Chat limiter - 30 requests per minute
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: '聊天请求过于频繁，请稍后再试' },
    standardHeaders: true
  });
  app.use('/api/chat', chatLimiter);
  
  // Memory limiter - 20 requests per minute
  const memoryLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: '记忆操作过于频繁，请稍后再试' }
  });
  app.use('/api/memory', memoryLimiter);
  
  // Sensitive operations - 10 requests per minute
  const sensitiveLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: '操作过于频繁，请稍后再试' }
  });
  app.use('/api/personality/switch', sensitiveLimiter);
  app.use('/api/personality/create', sensitiveLimiter);
  app.use('/api/auth/', sensitiveLimiter);
  app.use('/api/plugins/', sensitiveLimiter);
  
  // Installation limiter - 5 requests per minute
  const installLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: '安装请求过于频繁，请稍后再试' },
    standardHeaders: true
  });
  app.use('/api/vertical-domains/:domainId/solutions/:solutionId/install', installLimiter);
  app.use('/api/marketplace/workflows/:workflowId/download', installLimiter);
  
  // Vision/image limiter - 10 requests per minute
  const visionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: '图片处理请求过于频繁，请稍后再试' }
  });
  app.use('/api/vision', visionLimiter);
  
  // Agent execution limiter - 20 requests per minute
  const agentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Agent执行请求过于频繁，请稍后再试' }
  });
  app.use('/api/agent/', agentLimiter);
  app.use('/api/executions/', agentLimiter);
  
  // Price monitor limiter - 30 requests per minute
  const priceLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: '价格监控请求过于频繁，请稍后再试' }
  });
  app.use('/api/price-monitor/', priceLimiter);
  
  // WebSocket connection limiter
  const wsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: '连接请求过于频繁' },
    skipSuccessfulRequests: true
  });
  app.use('/socket.io', wsLimiter);
  
  console.log('[Security] Rate limiting enabled');
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(o => o);
if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  console.error('[Security] ALLOWED_ORIGINS must be set in production');
  process.exit(1);
}
const corsOptions = {
  origin: allowedOrigins.length > 0 ? allowedOrigins : ['http://localhost:3000'],
  credentials: true
};

const server = http.createServer(app);

const API_KEY = process.env.API_KEY || null;
const crypto = require('crypto');

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const lenA = a.length;
  const lenB = b.length;
  const maxLen = Math.max(lenA, lenB);
  const bufA = Buffer.alloc(maxLen);
  const bufB = Buffer.alloc(maxLen);
  Buffer.from(a).copy(bufA);
  Buffer.from(b).copy(bufB);
  return crypto.timingSafeEqual(bufA, bufB);
}

const authMiddleware = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'API_KEY not configured' });
    }
    return next();
  }
  if (!key) return res.status(401).json({ error: 'API_KEY required' });
  if (timingSafeEqual(key, API_KEY)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

const csrfTokens = new Map();
const CSRF_TOKEN_TTL = 3600000;

function generateCsrfToken() {
  const token = require('crypto').randomBytes(32).toString('hex');
  const expiresAt = Date.now() + CSRF_TOKEN_TTL;
  csrfTokens.set(token, expiresAt);
  return token;
}

function validateCsrfToken(token) {
  if (!token) return false;
  const expiresAt = csrfTokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    csrfTokens.delete(token);
    return false;
  }
  return true;
}

function validateId(id) {
  if (typeof id !== 'string') return false;
  // Prevent prototype pollution
  if (id === '__proto__' || id === 'constructor' || id === 'prototype') return false;
  // Allow alphanumeric, dash, underscore, length 1-50
  if (id.length > 50) return false;
  return /^[a-z0-9_-]+$/i.test(id);
}

app.get('/api/csrf-token', (req, res) => {
  res.json({ token: generateCsrfToken() });
});

setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of csrfTokens.entries()) {
    if (now > expiresAt) csrfTokens.delete(token);
  }
}, 60000);

const SENSITIVE_PATHS = ['/api/personality/switch', '/api/personality/create', '/api/memory', '/api/game/connect', '/api/game/disconnect', '/api/game/command', '/api/game/plan'];
const auditLog = [];
const MAX_AUDIT_LOG_SIZE = 5000;

function auditMiddleware(req, res, next) {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - start;
    const isSensitive = SENSITIVE_PATHS.some(p => req.path.startsWith(p));
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent')?.substring(0, 100),
      statusCode: res.statusCode,
      duration,
      sensitive: isSensitive,
      bodyKeys: req.body ? Object.keys(req.body) : []
    };
    
    if (isSensitive || res.statusCode >= 400) {
      auditLog.push(logEntry);
      if (auditLog.length > MAX_AUDIT_LOG_SIZE) auditLog.shift();
      console.log(`[AUDIT] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

app.use(auditMiddleware);

app.get('/api/audit-log', authMiddleware, (req, res) => {
  const { limit = 100, level } = req.query;
  const maxLimit = Math.min(parseInt(limit) || 100, 500);
  let logs = auditLog.slice(-maxLimit);
  
  if (level) {
    logs = logs.filter(l => {
      if (level === 'sensitive') return l.sensitive;
      if (level === 'error') return l.statusCode >= 400;
      return true;
    });
  }
  
  res.json({
    total: auditLog.length,
    returned: logs.length,
    logs
  });
});

app.delete('/api/audit-log', authMiddleware, (req, res) => {
  auditLog.length = 0;
  res.json({ ok: true, message: 'Audit log cleared' });
});

const wsRateLimits = new Map();
const WS_RATE_LIMIT_WINDOW = 60000;
const WS_RATE_LIMIT_MAX = 60;
const WS_RATE_LIMIT_CLEANUP_INTERVAL = 300000;
const WS_RATE_LIMIT_MAX_ENTRIES = 1000;

setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [key, record] of wsRateLimits.entries()) {
    if (now > record.resetAt + WS_RATE_LIMIT_WINDOW) {
      wsRateLimits.delete(key);
      removed++;
    }
  }
  if (wsRateLimits.size > WS_RATE_LIMIT_MAX_ENTRIES) {
    const entries = Array.from(wsRateLimits.entries()).slice(-WS_RATE_LIMIT_MAX_ENTRIES);
    wsRateLimits.clear();
    entries.forEach(([k, v]) => wsRateLimits.set(k, v));
  }
  if (removed > 0) console.log(`[WS] Cleaned up ${removed} rate limit entries`);
}, WS_RATE_LIMIT_CLEANUP_INTERVAL);

const wsRateLimitMiddleware = (socket, next) => {
  const now = Date.now();
  const clientId = socket.handshake?.address || socket.id || 'unknown';
  const record = wsRateLimits.get(clientId) || { count: 0, resetAt: now + WS_RATE_LIMIT_WINDOW };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WS_RATE_LIMIT_WINDOW;
  }
  record.count++;
  wsRateLimits.set(clientId, record);
  if (record.count > WS_RATE_LIMIT_MAX) {
    return next(new Error('Rate limit exceeded'));
  }

  const wsAuthEnabled = config.get('websocket.auth.enabled', false);
  if (!wsAuthEnabled) {
    socket.user = { role: 'guest', username: 'anonymous' };
    return next();
  }

  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const jwtAuth = new (require(path.resolve(ROOT_DIR, 'src/auth/JWTAuth.js')))({
      secret: process.env.JWT_SECRET,
      expiresIn: config.get('auth.tokenExpiresIn', 86400000),
      issuer: config.get('auth.issuer', 'ultrawork')
    });

    const result = jwtAuth.verifySocketToken(token);
    if (!result.valid) {
      return next(new Error(result.error || 'Invalid token'));
    }

    socket.user = {
      username: result.username,
      role: result.role
    };
    socket.token = token;
    next();
  } catch (error) {
    return next(new Error('Authentication failed'));
  }
};

let io;
try {
  const ioConfig = {
    cors: corsOptions,
    allowEIO3: true,
    pingTimeout: wsConfig.pingTimeout || 60000,
    pingInterval: wsConfig.pingInterval || 25000
  };
  
  if (wsConfig.compression?.enabled) {
    ioConfig.perMessageDeflate = {
      threshold: wsConfig.compression.threshold || 1024,
      zlibDeflateOptions: { chunkSize: 1024, memLevel: 7, level: 3 },
      zlibInflateOptions: { chunkSize: 1024 * 4 },
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      serverMaxWindowBits: 10,
      concurrencyLimit: 10
    };
  }
  
  io = require('socket.io')(server, {
    ...ioConfig,
    middleware: wsRateLimitMiddleware
  });
  console.log('[Socket.IO] WebSocket server initialized' + (wsConfig.compression?.enabled ? ' with compression' : '') + ' with rate limiting');
} catch (e) {
  console.warn('[Socket.IO] Not available, WebSocket disabled');
}

app.use(express.json({ limit: '100kb' }));

const ROOT_DIR = path.resolve(__dirname, '..');

app.use('/frontend', express.static(path.resolve(ROOT_DIR, 'frontend')));
app.get('/', (req, res) => res.sendFile(path.resolve(ROOT_DIR, 'frontend/index.html')));
app.get('/chat', (req, res) => res.sendFile(path.resolve(ROOT_DIR, 'frontend/chat.html')));
app.get('/chat.html', (req, res) => res.sendFile(path.resolve(ROOT_DIR, 'frontend/chat.html')));
app.get('/vertical-markets', (req, res) => res.sendFile(path.resolve(ROOT_DIR, 'frontend/vertical-markets.html')));
app.get('/vertical-markets.html', (req, res) => res.sendFile(path.resolve(ROOT_DIR, 'frontend/vertical-markets.html')));
app.get('/game-panel', (req, res) => res.sendFile(path.resolve(ROOT_DIR, 'frontend/game-panel.html')));
app.get('/mcp-market', (req, res) => res.sendFile(path.resolve(ROOT_DIR, 'frontend/mcp-market.html')));
app.get('/game-panel.html', (req, res) => res.sendFile(path.resolve(ROOT_DIR, 'frontend/game-panel.html')));

const { PersonalityManager } = require(path.resolve(ROOT_DIR, 'src/personality/PersonalityManager'));
const ChatAgent = require(path.resolve(ROOT_DIR, 'src/agents/ChatAgent'));
const RouterAgent = require(path.resolve(ROOT_DIR, 'src/agents/RouterAgent'));
const MemoryAgent = require(path.resolve(ROOT_DIR, 'src/agents/MemoryAgent'));
const MediaAgent = require(path.resolve(ROOT_DIR, 'src/agents/MediaAgent'));
const GameAgent = require(path.resolve(ROOT_DIR, 'src/agents/GameAgent'));
const { getChatWebSocketHandler } = require(path.resolve(ROOT_DIR, 'src/chat/ChatWebSocketHandler'));

const pm = new PersonalityManager(path.resolve(ROOT_DIR, 'data/personalities.json'));
pm.loadSync();
console.log('Personality loaded:', pm.activeName);

let ollamaBridge = null;
const inferenceEngine = config.get('inference.engine', 'mock');

if (inferenceEngine === 'ollama') {
  try {
    const { OllamaBridge } = require(path.resolve(ROOT_DIR, 'src/localInferencing/OllamaBridge'));
    const ollamaConfig = config.get('inference.ollama', {});
    ollamaBridge = new OllamaBridge({
      host: ollamaConfig.host || 'http://localhost',
      port: ollamaConfig.port || '11434',
      model: ollamaConfig.defaultModel || 'llama3.2',
      maxTokens: ollamaConfig.maxTokens || 256
    });
    console.log('OllamaBridge initialized');
  } catch (e) {
    console.warn('OllamaBridge init failed:', e.message);
  }
}

const chat = new ChatAgent(pm, { 
  ollamaBridge, 
  defaultModel: config.get('inference.ollama.defaultModel', 'llama3.2') 
});
const memoryConfig = config.get('memory', {});
const memory = new MemoryAgent({
  pageSize: memoryConfig.pageSize || 50,
  memoryPath: path.resolve(ROOT_DIR, memoryConfig.path || '.opencode/memory.json')
});
const media = new MediaAgent();
const game = new GameAgent();
const router = new RouterAgent(pm, chat, memory, media, game);

// ========== Game Manager (declared early for Socket.IO access) ==========
const GameManager = require(path.resolve(ROOT_DIR, 'src/game/GameManager'));
let gameManager = null;

async function initGame() {
  if (config.get('game.enabled', false)) {
    try {
      gameManager = new GameManager(pm, chat, memory, config.get('game.minecraft', {}));
      await gameManager.initialize();
    } catch (e) {
      console.warn('GameManager init failed:', e.message);
    }
  }
}

const wsCommandRateLimits = new Map();
const WS_COMMAND_RATE_LIMIT = 20;
const WS_COMMAND_RATE_WINDOW = 60000;

function checkWsCommandRateLimit(socketId) {
  const now = Date.now();
  const record = wsCommandRateLimits.get(socketId) || { count: 0, resetAt: now + WS_COMMAND_RATE_WINDOW };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + WS_COMMAND_RATE_WINDOW;
  }
  record.count++;
  wsCommandRateLimits.set(socketId, record);
  if (record.count > WS_COMMAND_RATE_LIMIT) {
    return false;
  }
  return true;
}

function sanitizeCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return null;
  const trimmed = cmd.trim();
  const sanitized = trimmed.substring(0, 500);
  
  const lowerSanitized = sanitized.toLowerCase();
  if (/^(https?|ftp):/i.test(sanitized)) return null;
  if (/\0/.test(sanitized)) return null;
  if (/<script/i.test(lowerSanitized)) return null;
  if (/javascript\s*:/i.test(sanitized)) return null;
  if (/data\s*:/i.test(sanitized)) return null;
  if (/vbscript\s*:/i.test(sanitized)) return null;
  
  return sanitized;
}

// Initialize chat WebSocket handler
let chatHandler = null;
try {
  chatHandler = getChatWebSocketHandler({
    skillManager: null // Will be initialized when needed
  });
  console.log('[ChatWS] Chat WebSocket handler initialized');
} catch (e) {
  console.warn('[ChatWS] Chat WebSocket handler init failed:', e.message);
}

if (io) {
  io.on('connection', (socket) => {
    const userInfo = socket.user ? ` (user: ${socket.user.username || 'unknown'}, role: ${socket.user.role || 'unknown'})` : ' (anonymous)';
    console.log('[Socket.IO] Client connected:', socket.id + userInfo);
    
    socket.on('game_status', () => {
      const status = gameManager?.getStatus?.() || { enabled: false };
      if (gameManager?.game?.getStatus) {
        const botStatus = gameManager.game.getStatus();
        status.bot = {
          username: botStatus.username || 'Bot',
          health: botStatus.health || 0,
          food: botStatus.food || 0,
          position: botStatus.position || { x: 0, y: 0, z: 0 },
          isAlive: (botStatus.health || 0) > 0
        };
        status.connected = botStatus.connected || false;
      }
      socket.emit('game_status', status);
    });
    
    socket.on('mood', () => {
      socket.emit('mood', pm.getMood());
    });
    
    socket.on('game_command', async (command) => {
      if (typeof command !== 'string') {
        return socket.emit('error', { message: 'Command must be string' });
      }
      if (!checkWsCommandRateLimit(socket.id)) {
        return socket.emit('error', { message: 'Rate limit exceeded' });
      }
      
      const sanitized = sanitizeCommand(command);
      if (!sanitized) {
        return socket.emit('error', { message: 'Invalid or forbidden command' });
      }
      
      if (gameManager) {
        const result = await gameManager.handleMessage(sanitized);
        socket.emit('command_result', { command: sanitized, result });
        socket.emit('game_status', gameManager.getStatus());
      }
    });
    
    socket.on('disconnect', () => {
      console.log('[Socket.IO] Client disconnected:', socket.id);
      wsCommandRateLimits.delete(socket.id);
    });

    socket.on('logout', () => {
      if (socket.token) {
        try {
          const jwtAuth = new (require(path.resolve(ROOT_DIR, 'src/auth/JWTAuth.js')))({
            secret: process.env.JWT_SECRET,
            expiresIn: config.get('auth.tokenExpiresIn', 86400000),
            issuer: config.get('auth.issuer', 'ultrawork')
          });
          jwtAuth.logout(socket.token);
        } catch (e) {}
      }
      socket.disconnect(true);
    });

    socket.on('refresh_token', async () => {
      if (!socket.user) {
        return socket.emit('error', { message: 'Not authenticated' });
      }
      try {
        const jwtAuth = new (require(path.resolve(ROOT_DIR, 'src/auth/JWTAuth.js')))({
          secret: process.env.JWT_SECRET,
          expiresIn: config.get('auth.tokenExpiresIn', 86400000),
          issuer: config.get('auth.issuer', 'ultrawork')
        });
        const user = jwtAuth.users?.get(socket.user.username);
        if (!user) {
          return socket.emit('error', { message: 'User not found' });
        }
        const result = jwtAuth.login(user.username, user.salt);
        socket.token = result.accessToken;
        socket.emit('token_refreshed', {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn
        });
      } catch (e) {
        socket.emit('error', { message: 'Token refresh failed' });
      }
    });

    // Chat WebSocket events
    socket.on('join_session', (data) => {
      if (chatHandler) {
        // Ensure connection handler is set up (only registers listeners once)
        if (!chatHandler.sessions.has(socket.id)) {
          chatHandler.handleConnection(socket);
        }
        // Directly handle the join session to create session data
        chatHandler._handleJoinSession(socket, data);
      } else {
        socket.emit('error', { message: 'Chat service unavailable' });
      }
    });

    socket.on('chat_message', async (data) => {
      if (chatHandler) {
        // Forward to chat handler
        chatHandler._handleChatMessage(socket, data);
      } else {
        // Fallback response
        socket.emit('message_start', { conversationId: data.conversationId });
        socket.emit('message_chunk', { 
          conversationId: data.conversationId,
          content: '抱歉，聊天服务暂时不可用。'
        });
        socket.emit('message_end', { conversationId: data.conversationId });
      }
    });

    socket.on('execute_skill', async (data) => {
      if (chatHandler) {
        chatHandler._handleSkillExecution(socket, data);
      }
    });
  });
  
  console.log('[Socket.IO] WebSocket ready on /socket.io');
}

// ========== REST API ==========
app.get('/api/personality', (req, res) => {
  const persona = pm.getCurrentPersonality();
  const personalities = Object.entries(pm.personalities || {}).map(([name, p]) => ({
    name,
    description: p.description,
    traits: p.traits,
    model: p.model
  }));
  res.json({
    name: persona?.name || pm.activeName,
    mood: pm.getMood(),
    tts: pm.getTTSConfig(),
    traits: persona?.traits,
    allPersonalities: Object.keys(pm.personalities || {}),
    personalities,
    engine: inferenceEngine
  });
});

app.get('/api/personality/list', (req, res) => {
  const list = Object.entries(pm.personalities || {}).map(([name, p]) => ({
    name,
    description: p.description,
    model: p.model?.name,
    avatar: p.avatar,
    modelParams: p.modelParams,
    idleAnimation: p.idleAnimation,
    isActive: name === pm.activeName
  }));
  res.json({ personalities: list, active: pm.activeName });
});

app.post('/api/personality/switch', authMiddleware, (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const oldName = pm.activeName;
  const success = pm.setActive(name);
  if (success) {
    memory.remember('personality_switch', { from: oldName, to: name, at: new Date().toISOString() });
    if (io) io.emit('mood', pm.getMood());
    const currentPersonality = pm.getCurrentPersonality();
    const rawAvatar = currentPersonality?.avatar;
    const safeTypes = ['svg', 'live2d', 'vrm'];
    const safeAvatar = rawAvatar && typeof rawAvatar === 'object' ? {
      type: safeTypes.includes(rawAvatar.type) ? rawAvatar.type : 'svg',
      fallback: typeof rawAvatar.fallback === 'string' ? rawAvatar.fallback : null
    } : null;
    if (safeAvatar && safeAvatar.type === 'live2d' && typeof rawAvatar.model === 'string' && rawAvatar.model.startsWith('https://')) {
      safeAvatar.model = rawAvatar.model;
    }
    res.json({
      ok: true,
      active: pm.activeName,
      mood: pm.getMood(),
      tts: pm.getTTSConfig(),
      model: currentPersonality?.model,
      avatar: safeAvatar,
      previous: oldName
    });
  } else {
    res.status(404).json({ error: 'not found', available: Object.keys(pm.personalities || {}) });
  }
});

app.post('/api/personality/create', authMiddleware, (req, res) => {
  const { name, description, style } = req.body || {};
  
  if (!name || typeof name !== 'string' || name.length < 1 || name.length > 50) {
    return res.status(400).json({ error: 'Invalid name (1-50 chars)' });
  }
  
  const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '');
  if (!safeName) {
    return res.status(400).json({ error: 'Invalid name characters' });
  }
  
  if (pm.personalities && pm.personalities[safeName]) {
    return res.status(400).json({ error: 'Personality already exists' });
  }
  
  const styleConfigs = {
    emoji: { emoji: true, rate: 1.0 },
    formal: { emoji: false, rate: 0.9 },
    playful: { emoji: true, rate: 1.2 }
  };
  
  const styleConfig = styleConfigs[style] || styleConfigs.emoji;
  
  if (pm.createPersonality) {
    const success = pm.createPersonality(safeName, {
      name: safeName,
      description: description || '自定义人格',
      traits: {
        emoji: styleConfig.emoji,
        rate: styleConfig.rate,
        style: style
      }
    });
    
    if (success) {
      memory.remember('personality_created', { name: safeName, style, at: new Date().toISOString() });
      res.json({ ok: true, name: safeName });
    } else {
      res.status(500).json({ error: 'Failed to create personality' });
    }
  } else {
    res.status(501).json({ error: 'Personality creation not supported' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { text, history } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    if (text.length > 4000) return res.status(400).json({ error: 'text too long (max 4000 chars)' });
    
    let contextHistory = [];
    if (history && Array.isArray(history)) {
      const boundedHistory = history.length > 100 ? history.slice(-100) : history;
      contextHistory = boundedHistory.slice(-10).map(h => ({
        role: (h.role === 'user' || h.role === 'assistant') ? h.role : 'user',
        content: String(h.content).substring(0, 2000)
      }));
    }
    
    const result = await router.routeMessage(text, contextHistory);
    res.json(result);
  } catch (err) {
    console.error('[Chat] Error:', err.message);
    res.status(500).json({ error: '处理失败' });
  }
});

const ALLOWED_MODELS = [
  'llama3.2', 'llama3.2:latest', 'llama3.1', 'llama3.1:latest',
  'qwen2.5', 'qwen2.5:latest', 'qwen2', 'qwen2:latest',
  'mistral', 'mistral:latest', 'codellama', 'codellama:latest',
  'phi3', 'phi3:latest', 'gemma2', 'gemma2:latest'
];

app.post('/api/ollama/model', (req, res) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'model required' });
  
  const safeModel = String(model).trim().toLowerCase();
  const MAX_MODEL_LENGTH = 50;
  
  if (safeModel.length > MAX_MODEL_LENGTH) {
    return res.status(400).json({ error: 'Model name too long' });
  }
  
  if (!ALLOWED_MODELS.includes(safeModel)) {
    return res.status(400).json({ 
      error: 'Invalid model name',
      allowed: ALLOWED_MODELS
    });
  }
  
  if (ollamaBridge) {
    ollamaBridge.defaultModel = safeModel;
  }
  
  res.json({ ok: true, model: safeModel });
});

const visionRateLimits = new Map();
const VISION_RATE_LIMIT_WINDOW = 60000;
const VISION_RATE_LIMIT_MAX = 10;

function checkVisionRateLimit(ip) {
  const now = Date.now();
  const record = visionRateLimits.get(ip);

  if (!record || now - record.windowStart > VISION_RATE_LIMIT_WINDOW) {
    visionRateLimits.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (record.count >= VISION_RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of visionRateLimits) {
    if (now - record.windowStart > VISION_RATE_LIMIT_WINDOW) {
      visionRateLimits.delete(ip);
    }
  }
  if (visionRateLimits.size > 5000) {
    const entries = Array.from(visionRateLimits.entries()).slice(-2500);
    visionRateLimits.clear();
    entries.forEach(([k, v]) => visionRateLimits.set(k, v));
  }
}, 120000);

app.post('/api/vision', authMiddleware, async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  if (!checkVisionRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Vision rate limit exceeded' });
  }

  const { image, prompt, model } = req.body || {};

  if (!image) {
    return res.status(400).json({ error: 'Image data required' });
  }

  if (typeof image !== 'string' || image.length > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'Invalid image data' });
  }

  const safePrompt = String(prompt || '请描述这张图片').substring(0, 2000);
  const safeModel = String(model || 'llava').substring(0, 50);

  if (!ollamaBridge) {
    return res.status(503).json({ error: 'Ollama not available' });
  }

  try {
    const base64Data = image.startsWith('data:') ? image.split(',')[1] : image;
    const result = await ollamaBridge.analyzeImage(base64Data, safePrompt, { model: safeModel });

    if (result.ok) {
      res.json({
        success: true,
        description: result.description,
        model: result.model,
        totalDuration: result.totalDuration,
        evalCount: result.evalCount
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[Vision API] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/vision/models', async (req, res) => {
  if (!ollamaBridge) {
    return res.json({ models: [] });
  }

  try {
    const visionModels = await ollamaBridge.listVisionModels();
    res.json({ models: visionModels.map(m => m.name) });
  } catch (error) {
    res.json({ models: [] });
  }
});

app.post('/api/agent/execute', authMiddleware, async (req, res) => {
  const { command } = req.body || {};
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'command required' });
  }

  try {
    res.json({
      success: true,
      command: command.substring(0, 500),
      message: '任务已接收',
      taskId: `task_${Date.now()}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/agent/identity', authMiddleware, async (req, res) => {
  const { name, capabilities } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name required' });
  }

  const crypto = require('crypto');
  const agentId = `agent_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
  const publicKeyHash = crypto.createHash('sha256').update(agentId).digest('hex').substring(0, 32);

  res.json({
    agentId,
    name: name.substring(0, 50),
    did: `did:ultrawork:1:${publicKeyHash}`,
    capabilities: Array.isArray(capabilities) ? capabilities.slice(0, 10) : [],
    reputation: { score: 0, interactions: 0 },
    createdAt: Date.now()
  });
});

app.post('/api/agent/browser', authMiddleware, async (req, res) => {
  const { action, url } = req.body || {};

  if (action === 'goto') {
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url required' });
    }
    try {
      new URL(url);
      res.json({ success: true, action: 'goto', url });
    } catch (e) {
      res.status(400).json({ error: 'Invalid URL' });
    }
    return;
  }

  res.json({ success: true, action, message: 'Browser action received' });
});

const attestations = new Map();

app.get('/api/attestations', (req, res) => {
  const result = [];
  for (const [id, att] of attestations) {
    result.push({
      id: att.id,
      hash: att.hash,
      data: att.data,
      metadata: att.metadata,
      signature: att.signature ? att.signature.substring(0, 32) + '...' : null,
      verified: att.verified || false
    });
  }
  res.json(result);
});

app.post('/api/attestations', authMiddleware, (req, res) => {
  const { data, description } = req.body || {};

  if (!data) {
    return res.status(400).json({ error: 'data required' });
  }

  const crypto = require('crypto');
  const attestationId = `att_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

  const attestation = {
    id: attestationId,
    data,
    hash,
    metadata: {
      createdAt: Date.now(),
      description: String(description || '').substring(0, 200),
      chainId: 1,
      version: '1.0'
    },
    signature: null,
    verified: false
  };

  attestations.set(attestationId, attestation);

  res.json({
    id: attestationId,
    hash,
    metadata: attestation.metadata
  });
});

app.post('/api/attestations/:id/verify', (req, res) => {
  const att = attestations.get(req.params.id);
  if (!att) {
    return res.status(404).json({ error: 'Attestation not found' });
  }

  const computedHash = crypto.createHash('sha256').update(JSON.stringify(att.data)).digest('hex');
  const valid = computedHash === att.hash;

  att.verified = valid;

  res.json({ valid, attestationId: att.id });
});

app.get('/api/attestations/:id/export', (req, res) => {
  const att = attestations.get(req.params.id);
  if (!att) {
    return res.status(404).json({ error: 'Attestation not found' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="attestation_${att.id}.json"`);
  res.json(att);
});

const workflows = [
  { id: 'collect_analyze_report', name: '数据采集-分析-报告', icon: '📊', description: '端到端数据分析流程',
    steps: [{ agent: 'collector', task: 'collect' }, { agent: 'analyzer', task: 'analyze' }, { agent: 'reporter', task: 'report' }, { agent: 'attester', task: 'attest' }] },
  { id: 'research_write_publish', name: '研究-写作-发布', icon: '📝', description: '内容创作全流程',
    steps: [{ agent: 'researcher', task: 'research' }, { agent: 'writer', task: 'write' }, { agent: 'reviewer', task: 'review' }, { agent: 'publisher', task: 'publish' }] },
  { id: 'monitor_alert_action', name: '监控-告警-执行', icon: '🔔', description: '自动化运维流程',
    steps: [{ agent: 'monitor', task: 'monitor' }, { agent: 'alertor', task: 'analyze' }, { agent: 'executor', task: 'execute' }] },
  { id: 'extract_transform_load', name: 'ETL数据管道', icon: '🔄', description: '数据抽取-转换-加载',
    steps: [{ agent: 'extractor', task: 'extract' }, { agent: 'transformer', task: 'transform' }, { agent: 'loader', task: 'load' }] },
  { id: 'scrape_verify_store', name: '采集-验证-存储', icon: '🔗', description: '数据采集并上链存证',
    steps: [{ agent: 'scraper', task: 'scrape' }, { agent: 'verifier', task: 'verify' }, { agent: 'attester', task: 'attest' }] }
];

const executions = new Map();

const verticalSolutions = [
  { id: 'finance_monitor', name: '金融监控', icon: '💰', industry: 'finance', description: '实时监控市场动态' },
  { id: 'ecommerce_auto', name: '电商自动化', icon: '🛒', industry: 'ecommerce', description: '商品监控、价格跟踪' },
  { id: 'customer_service', name: '智能客服', icon: '🎧', industry: 'service', description: '7x24小时自动客服' },
  { id: 'hr_recruitment', name: '智能招聘', icon: '👔', industry: 'hr', description: '简历筛选、面试安排' },
  { id: 'content_marketing', name: '内容营销', icon: '📢', industry: 'marketing', description: '内容创作、多平台发布' },
  { id: 'supply_chain', name: '供应链管理', icon: '📦', industry: 'logistics', description: '库存监控、需求预测' },
  { id: 'legal_compliance', name: '法律合规', icon: '⚖️', industry: 'legal', description: '合同审查、法规查询' },
  { id: 'healthcare', name: '医疗辅助', icon: '🏥', industry: 'healthcare', description: '病历分析、健康监测' }
];

const modelMarketplace = [
  { id: 'model_finance_01', name: '金融风控模型', industry: 'finance', type: 'federated', price: 500, rating: 4.5, downloads: 120 },
  { id: 'model_ecommerce_01', name: '电商推荐模型', industry: 'ecommerce', type: 'federated', price: 300, rating: 4.2, downloads: 85 },
  { id: 'model_nlp_01', name: '中文NLP模型', industry: 'general', type: 'pretrained', price: 200, rating: 4.8, downloads: 350 }
];

const deployments = new Map();

app.get('/api/solutions', (req, res) => {
  const industry = req.query.industry;
  let result = verticalSolutions;
  if (industry) {
    result = result.filter(s => s.industry === industry);
  }
  res.json(result);
});

// Vertical Domains API with End-to-End Solutions
const verticalDomains = [
  { id: 'finance', name: '金融领域', nameEn: 'Finance', icon: '💰', description: '股票、基金、债券、风险管理、财务分析', color: '#10a37f', skillsCount: 18, templatesCount: 12, isNew: false },
  { id: 'healthcare', name: '医疗健康', nameEn: 'Healthcare', icon: '🏥', description: '医学影像、诊断辅助、健康管理', color: '#ef4444', skillsCount: 15, templatesCount: 8, isNew: false },
  { id: 'legal', name: '法律服务', nameEn: 'Legal', icon: '⚖️', description: '合同审查、法律检索、案件分析', color: '#8b5cf6', skillsCount: 12, templatesCount: 6, isNew: false },
  { id: 'manufacturing', name: '制造业', nameEn: 'Manufacturing', icon: '🏭', description: '质量控制、供应链管理、预测性维护', color: '#f59e0b', skillsCount: 14, templatesCount: 10, isNew: false },
  { id: 'education', name: '教育行业', nameEn: 'Education', icon: '📚', description: '智能备课、作业批改、学习分析', color: '#3b82f6', skillsCount: 10, templatesCount: 8, isNew: false },
  { id: 'retail', name: '零售电商', nameEn: 'Retail', icon: '🛒', description: '商品推荐、库存管理、价格优化', color: '#ec4899', skillsCount: 12, templatesCount: 9, isNew: false },
  { id: 'energy', name: '能源行业', nameEn: 'Energy', icon: '⚡', description: '负荷预测、设备故障诊断、碳排放计算、能源效率优化', color: '#22c55e', skillsCount: 6, templatesCount: 5, isNew: true },
  { id: 'agriculture', name: '智慧农业', nameEn: 'Agriculture', icon: '🌾', description: '作物产量预测、病虫害识别、灌溉优化、土壤分析', color: '#84cc16', skillsCount: 6, templatesCount: 4, isNew: true },
  { id: 'government', name: '政府政务', nameEn: 'Government', icon: '🏛️', description: '公文智能生成、政策舆情分析、预算优化、电子政务', color: '#6366f1', skillsCount: 6, templatesCount: 6, isNew: true },
  { id: 'transportation', name: '交通运输', nameEn: 'Transportation', icon: '🚗', description: '路径优化、车流预测、车辆调度、物流追踪', color: '#f97316', skillsCount: 6, templatesCount: 5, isNew: true },
  { id: 'media', name: '媒体娱乐', nameEn: 'Media & Entertainment', icon: '🎬', description: '内容标签生成、个性化推荐、版权检测、智能剪辑', color: '#ec4899', skillsCount: 6, templatesCount: 4, isNew: true }
];

const e2eSolutions = {
  finance: [
    {
      id: 'smart-credit-fullflow',
      name: '智能信贷全流程',
      icon: '💳',
      description: '从进件到贷后监控的完整信贷生命周期管理，自动化率高达85%',
      automationRate: 85,
      estimatedTime: 480,
      stages: ['进件审核', '反欺诈检测', '信用评分', '智能审批', '放款执行', '贷后监控'],
      requiredSkills: ['KYC验证', '反洗钱监控', '风险评估', '合规检查', '报告生成', '审计日志'],
      templateId: 'workflow_credit_fullflow',
      demoData: {
        name: '智能信贷案例数据集',
        description: '包含完整的贷款申请、审批、放款流程演示数据',
        records: 50,
        sampleApplicant: {
          name: '张三',
          age: 35,
          income: 25000,
          loanAmount: 500000,
          loanTerm: 24,
          purpose: '购房'
        }
      },
      relatedSolutions: ['cross-border-payment']
    },
    {
      id: 'cross-border-payment',
      name: '跨境支付合规助手',
      icon: '🌍',
      description: '自动识别制裁名单、生成监管报告，合规检查自动化率90%',
      automationRate: 90,
      estimatedTime: 30,
      stages: ['制裁名单筛查', '风险评估', '合规检查', '监管报告'],
      requiredSkills: ['反洗钱监控', '风险评估', '合规检查', '报告生成'],
      templateId: 'workflow_cross_border',
      demoData: {
        name: '跨境支付测试数据',
        description: '模拟跨境支付合规检查场景',
        records: 20,
        sampleTransaction: {
          amount: 100000,
          currency: 'USD',
          fromCountry: 'CN',
          toCountry: 'US',
          beneficiary: 'ABC Trading Co.'
        }
      },
      relatedSolutions: ['smart-credit-fullflow']
    }
  ],
  healthcare: [
    {
      id: 'smart-hospital-service',
      name: '智慧医院患者服务平台',
      icon: '👨‍⚕️',
      description: '覆盖挂号、导诊、病历摘要、用药提醒的全流程患者服务',
      automationRate: 70,
      estimatedTime: 120,
      stages: ['智能挂号', 'AI导诊', '辅助诊断', '用药管理', '随访管理', '医保结算'],
      requiredSkills: ['预约调度', '症状检查', '影像分析', '病历摘要', '药物交互', '医保理赔'],
      templateId: 'workflow_smart_hospital',
      demoData: {
        name: '患者就诊演示数据',
        description: '模拟患者从挂号到结算的完整就诊流程',
        records: 30,
        samplePatient: {
          name: '李四',
          age: 45,
          symptoms: ['头痛', '发热'],
          department: '神经内科',
          insuranceType: '城镇职工医保'
        }
      },
      relatedSolutions: ['clinical-decision']
    },
    {
      id: 'clinical-decision',
      name: '临床辅助决策系统',
      icon: '🔬',
      description: '整合影像分析、症状检查、诊疗指南的智能诊断支持',
      automationRate: 60,
      estimatedTime: 45,
      stages: ['症状分析', '影像分析', '病历回顾', '诊疗建议'],
      requiredSkills: ['症状检查', '影像分析', '病历摘要', '药物交互'],
      templateId: 'workflow_clinical_decision',
      demoData: {
        name: '临床诊断演示数据',
        description: '模拟临床辅助诊断流程',
        records: 15,
        sampleCase: {
          patientId: 'P001',
          symptoms: ['咳嗽', '胸闷', '呼吸困难'],
          medicalHistory: '高血压'
        }
      },
      relatedSolutions: ['smart-hospital-service']
    }
  ],
  manufacturing: [
    {
      id: 'digital-twin-production',
      name: '数字孪生生产线监控',
      icon: '🔧',
      description: '实时数据采集、异常预警、根因分析的全链路监控',
      automationRate: 75,
      estimatedTime: 60,
      stages: ['数据采集', '实时监控', '异常预警', '根因分析', '优化建议'],
      requiredSkills: ['质量控制', '预测性维护', '根因分析', '流程优化'],
      templateId: 'workflow_digital_twin',
      demoData: {
        name: '生产线监控演示数据',
        description: '模拟工厂生产线实时监控数据',
        records: 1000,
        sampleMetrics: {
          lineId: 'LINE-A01',
          temperature: 85.5,
          pressure: 2.4,
          speed: 150,
          defectRate: 0.02
        }
      },
      relatedSolutions: ['supply-chain-resilience']
    },
    {
      id: 'supply-chain-resilience',
      name: '供应链韧性评估',
      icon: '📦',
      description: '风险识别、替代供应商推荐、库存优化的供应链管理',
      automationRate: 65,
      estimatedTime: 90,
      stages: ['风险识别', '供应商分析', '库存优化', '应急预案'],
      requiredSkills: ['供应链优化', '库存预测', '风险管理'],
      templateId: 'workflow_supply_chain',
      demoData: {
        name: '供应链评估演示数据',
        description: '模拟供应链风险评估场景',
        records: 50,
        sampleSupplier: {
          name: '优质供应商A',
          region: '华东',
          leadTime: 7,
          qualityScore: 95,
          riskLevel: '低'
        }
      },
      relatedSolutions: ['digital-twin-production']
    }
  ],
  energy: [
    {
      id: 'smart-grid-optimization',
      name: '智能电网调度优化',
      icon: '⚡',
      description: '负荷预测、发电调度、碳排放优化的一体化解决方案',
      automationRate: 80,
      estimatedTime: 45,
      stages: ['负荷预测', '发电调度', '碳排放计算', '效率优化'],
      requiredSkills: ['负荷预测', '电网调度', '碳排放计算', '能效优化'],
      templateId: 'workflow_smart_grid',
      demoData: {
        name: '电网调度演示数据',
        description: '模拟区域电网负荷和发电调度数据',
        records: 500,
        sampleData: {
          region: '华东电网',
          currentLoad: 4500,
          peakLoad: 6000,
          renewableRatio: 35,
          carbonEmission: 1200
        }
      },
      relatedSolutions: []
    }
  ],
  agriculture: [
    {
      id: 'precision-farming',
      name: '精准农业管理方案',
      icon: '🌾',
      description: '土壤分析、产量预测、灌溉优化的智能化种植管理',
      automationRate: 70,
      estimatedTime: 60,
      stages: ['土壤分析', '产量预测', '病虫害识别', '灌溉优化'],
      requiredSkills: ['土壤分析', '产量预测', '病虫害识别', '灌溉优化'],
      templateId: 'workflow_precision_farming',
      demoData: {
        name: '精准农业演示数据',
        description: '模拟农田管理和作物生长数据',
        records: 200,
        sampleField: {
          fieldId: 'FIELD-001',
          area: 100,
          crop: '小麦',
          soilPH: 6.8,
          predictedYield: 600
        }
      },
      relatedSolutions: []
    }
  ],
  government: [
    {
      id: 'smart-approval',
      name: '智能行政审批流程',
      icon: '🏛️',
      description: '公文生成、政策分析、审批优化的政务服务自动化',
      automationRate: 65,
      estimatedTime: 30,
      stages: ['公文生成', '政策分析', '预算优化', '审批处理'],
      requiredSkills: ['公文生成', '政策分析', '预算优化', '审批处理'],
      templateId: 'workflow_smart_approval',
      demoData: {
        name: '行政审批演示数据',
        description: '模拟政府行政审批流程数据',
        records: 25,
        sampleCase: {
          caseId: 'GOV-2026-001',
          applicant: '某科技有限公司',
          type: '高新技术企业认定',
          amount: 5000000
        }
      },
      relatedSolutions: []
    }
  ],
  transportation: [
    {
      id: 'fleet-optimization',
      name: '车队智能调度方案',
      icon: '🚛',
      description: '路径优化、车流预测、实时追踪的物流管理',
      automationRate: 75,
      estimatedTime: 25,
      stages: ['路径优化', '车流预测', '车辆调度', '物流追踪'],
      requiredSkills: ['路径优化', '车流预测', '车辆调度', '物流追踪'],
      templateId: 'workflow_fleet_optimization',
      demoData: {
        name: '物流调度演示数据',
        description: '模拟物流车队调度和路径优化场景',
        records: 100,
        sampleOrder: {
          orderId: 'ORD-2026-001',
          origin: '上海仓库',
          destination: '杭州客户',
          weight: 500,
          priority: '加急'
        }
      },
      relatedSolutions: []
    }
  ],
  media: [
    {
      id: 'content-publishing',
      name: '智能内容发布流程',
      icon: '📱',
      description: '内容标签、版权检测、个性化推荐的内容管理',
      automationRate: 80,
      estimatedTime: 20,
      stages: ['内容标签', '版权检测', '个性化推荐', '舆情监控'],
      requiredSkills: ['内容标签', '版权检测', '推荐算法', '舆情监控'],
      templateId: 'workflow_content_publishing',
      demoData: {
        name: '内容发布演示数据',
        description: '模拟媒体内容发布和推荐场景',
        records: 50,
        sampleContent: {
          title: '2026年AI技术趋势分析',
          type: '文章',
          targetAudience: '科技爱好者',
          platform: '微信公众号'
        }
      },
      relatedSolutions: []
    }
  ]
};

app.get('/api/vertical-domains', (req, res) => {
  const result = verticalDomains.map(domain => ({
    ...domain,
    e2eCount: (e2eSolutions[domain.id] || []).length
  }));
  res.json(result);
});

app.get('/api/vertical-domains/:domainId/skills', (req, res) => {
  const { domainId } = req.params;
  
  if (!validateId(domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID format' });
  }
  
  // Return domain-specific skills
  const domainSkills = {
    finance: [
      { id: 'stock-analysis', name: '股票技术分析', category: 'stocks', description: '基于技术指标进行股票走势分析和预测', rating: 4.8, downloads: 1250, tags: ['股票', 'K线', 'MACD'] },
      { id: 'risk-assessment', name: '风险评估模型', category: 'risk-management', description: '综合评估投资组合风险', rating: 4.6, downloads: 890, tags: ['风险', 'VaR', '投资组合'] }
    ],
    healthcare: [
      { id: 'medical-image', name: '医学影像分析', category: 'medical-imaging', description: 'X光、CT、MRI等医学影像AI分析', rating: 4.9, downloads: 3200, tags: ['影像', 'AI诊断', 'X光'] }
    ],
    energy: [
      { id: 'load-forecast', name: '电力负荷预测', category: 'grid', description: '基于历史数据和天气预测电力负荷', rating: 4.7, downloads: 850, tags: ['负荷', '预测', '电网'] }
    ]
  };
  res.json(domainSkills[domainId] || []);
});

app.get('/api/vertical-domains/:domainId/solutions', (req, res) => {
  const { domainId } = req.params;
  
  if (!validateId(domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID format' });
  }
  
  const solutions = e2eSolutions[domainId] || [];
  res.json(solutions);
});

app.post('/api/vertical-domains/:domainId/solutions/:solutionId/install', authMiddleware, (req, res) => {
  const { domainId, solutionId } = req.params;
  
  // Input validation
  if (!domainId || !solutionId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  // Validate domainId and solutionId format (alphanumeric, dash, underscore only) and prevent prototype pollution
  if (!validateId(domainId) || !validateId(solutionId)) {
    return res.status(400).json({ error: 'Invalid parameter format' });
  }
  
  const solutions = e2eSolutions[domainId] || [];
  const solution = solutions.find(s => s.id === solutionId);
  
  if (!solution) {
    return res.status(404).json({ error: 'Solution not found' });
  }

  const installId = `install_${Date.now().toString(36)}`;
  const installation = {
    id: installId,
    solutionId: solution.id,
    solutionName: solution.name,
    domainId,
    templateId: solution.templateId,
    status: 'installing',
    progress: 0,
    stages: solution.stages.map(s => ({ name: s, status: 'pending' })),
    startedAt: Date.now()
  };

  // Simulate installation progress
  let stageIndex = 0;
  const installInterval = setInterval(() => {
    if (stageIndex < installation.stages.length) {
      installation.stages[stageIndex].status = 'completed';
      installation.progress = Math.round(((stageIndex + 1) / installation.stages.length) * 100);
      stageIndex++;
    } else {
      installation.status = 'completed';
      installation.completedAt = Date.now();
      clearInterval(installInterval);
    }
  }, 1000);

  res.json({ 
    id: installId, 
    status: 'installing',
    message: `开始安装「${solution.name}」...`
  });
});

app.get('/api/vertical-domains/solutions', (req, res) => {
  const allSolutions = Object.entries(e2eSolutions).flatMap(([domainId, sols]) => 
    sols.map(s => ({ ...s, domainId }))
  );
  res.json(allSolutions);
});

// Import demo data for a solution
app.post('/api/vertical-domains/:domainId/solutions/:solutionId/demo-data', authMiddleware, (req, res) => {
  const { domainId, solutionId } = req.params;
  
  if (!validateId(domainId) || !validateId(solutionId)) {
    return res.status(400).json({ error: 'Invalid parameter format' });
  }
  
  const solutions = e2eSolutions[domainId] || [];
  const solution = solutions.find(s => s.id === solutionId);
  
  if (!solution) {
    return res.status(404).json({ error: 'Solution not found' });
  }
  
  if (!solution.demoData) {
    return res.status(404).json({ error: 'No demo data available for this solution' });
  }

  const importId = `import_${Date.now().toString(36)}`;
  
  res.json({
    id: importId,
    status: 'success',
    demoData: solution.demoData,
    message: `成功导入「${solution.demoData.name}」`
  });
});

// Get solution recommendations based on related solutions
app.get('/api/vertical-domains/solutions/:solutionId/recommendations', (req, res) => {
  const { solutionId } = req.params;
  
  if (!validateId(solutionId)) {
    return res.status(400).json({ error: 'Invalid solution ID format' });
  }
  
  let targetSolution = null;
  let targetDomainId = null;
  
  for (const [domainId, solutions] of Object.entries(e2eSolutions)) {
    const sol = solutions.find(s => s.id === solutionId);
    if (sol) {
      targetSolution = sol;
      targetDomainId = domainId;
      break;
    }
  }
  
  if (!targetSolution) {
    return res.status(404).json({ error: 'Solution not found' });
  }
  
  const recommendations = [];
  
  // Add related solutions
  if (targetSolution.relatedSolutions) {
    for (const relatedId of targetSolution.relatedSolutions) {
      for (const [domainId, solutions] of Object.entries(e2eSolutions)) {
        const related = solutions.find(s => s.id === relatedId);
        if (related) {
          recommendations.push({
            ...related,
            domainId,
            reason: 'related'
          });
        }
      }
    }
  }
  
  // Add high automation solutions from same domain
  const sameDomainSolutions = (e2eSolutions[targetDomainId] || [])
    .filter(s => s.id !== solutionId && s.automationRate >= 75)
    .map(s => ({ ...s, domainId: targetDomainId, reason: 'high-automation' }));
  
  recommendations.push(...sameDomainSolutions);
  
  res.json(recommendations.slice(0, 5));
});

// Popular solutions ranking
app.get('/api/vertical-domains/solutions/popular', (req, res) => {
  let { limit = 10, sortBy = 'automationRate' } = req.query;
  
  // Validate limit
  limit = parseInt(limit);
  if (isNaN(limit) || limit < 1) limit = 10;
  if (limit > 100) limit = 100; // cap to prevent excessive data
  
  // Validate sortBy
  const allowedSort = ['automationRate', 'installs', 'rating'];
  if (!allowedSort.includes(sortBy)) {
    sortBy = 'automationRate';
  }
  
  const allSolutions = Object.entries(e2eSolutions).flatMap(([domainId, sols]) => 
    sols.map(s => ({ 
      ...s, 
      domainId,
      // Simulated popularity metrics (in production, these would come from database)
      installs: Math.floor(Math.random() * 1000) + 100,
      rating: (Math.random() * 1 + 4).toFixed(1),
      trials: Math.floor(Math.random() * 500) + 50
    }))
  );
  
  // Sort by different criteria
  let sorted = allSolutions;
  switch (sortBy) {
    case 'automationRate':
      sorted = allSolutions.sort((a, b) => b.automationRate - a.automationRate);
      break;
    case 'installs':
      sorted = allSolutions.sort((a, b) => b.installs - a.installs);
      break;
    case 'rating':
      sorted = allSolutions.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
      break;
    default:
      sorted = allSolutions.sort((a, b) => b.automationRate - a.automationRate);
  }
  
  res.json({
    hot: sorted.slice(0, 3).map(s => ({ ...s, badge: '🔥 热门' })),
    highAutomation: allSolutions.filter(s => s.automationRate >= 80).map(s => ({ ...s, badge: '⚡ 高自动化' })),
    newlyAdded: allSolutions.filter(s => ['energy', 'agriculture', 'government', 'transportation', 'media'].includes(s.domainId)).map(s => ({ ...s, badge: '🆕 新增' }))
  });
});

// Search solutions by keyword (for chat recommendation)
app.get('/api/vertical-domains/solutions/search', (req, res) => {
  let { q } = req.query;
  
  if (!q || typeof q !== 'string') {
    return res.json([]);
  }
  
  // Limit length to prevent DoS
  if (q.length > 100) {
    q = q.substring(0, 100);
  }
  
  if (q.length < 2) {
    return res.json([]);
  }
  
  const keywords = q.toLowerCase();
  const results = [];
  
  const solutionKeywords = {
    '信贷': ['smart-credit-fullflow', 'finance'],
    '贷款': ['smart-credit-fullflow', 'finance'],
    '银行': ['smart-credit-fullflow', 'cross-border-payment', 'finance'],
    '支付': ['cross-border-payment', 'finance'],
    '合规': ['cross-border-payment', 'finance'],
    '医院': ['smart-hospital-service', 'healthcare'],
    '患者': ['smart-hospital-service', 'clinical-decision', 'healthcare'],
    '诊断': ['clinical-decision', 'healthcare'],
    '工厂': ['digital-twin-production', 'manufacturing'],
    '生产': ['digital-twin-production', 'manufacturing'],
    '供应链': ['supply-chain-resilience', 'manufacturing'],
    '电网': ['smart-grid-optimization', 'energy'],
    '能源': ['smart-grid-optimization', 'energy'],
    '农业': ['precision-farming', 'agriculture'],
    '种植': ['precision-farming', 'agriculture'],
    '审批': ['smart-approval', 'government'],
    '政务': ['smart-approval', 'government'],
    '物流': ['fleet-optimization', 'transportation'],
    '车队': ['fleet-optimization', 'transportation'],
    '内容': ['content-publishing', 'media'],
    '媒体': ['content-publishing', 'media']
  };
  
  for (const [keyword, [solutionId, domainId]] of Object.entries(solutionKeywords)) {
    if (keywords.includes(keyword)) {
      const solution = (e2eSolutions[domainId] || []).find(s => s.id === solutionId);
      if (solution && !results.find(r => r.id === solutionId)) {
        results.push({ ...solution, domainId, matchKeyword: keyword });
      }
    }
  }
  
  res.json(results.slice(0, 3));
});

app.post('/api/solutions/:id/deploy', authMiddleware, async (req, res) => {
  const solution = verticalSolutions.find(s => s.id === req.params.id);
  if (!solution) return res.status(404).json({ error: 'Solution not found' });

  const deploymentId = `deploy_${req.params.id}_${Date.now().toString(36)}`;
  const deployment = {
    id: deploymentId,
    solutionId: solution.id,
    solutionName: solution.name,
    status: 'running',
    startedAt: Date.now()
  };

  deployments.set(deploymentId, deployment);
  res.json({ id: deploymentId, status: 'deployed' });
});

app.get('/api/models', (req, res) => {
  const { industry, type, minRating, sortBy } = req.query;
  let result = [...modelMarketplace];

  if (industry) result = result.filter(m => m.industry === industry);
  if (type) result = result.filter(m => m.type === type);
  if (minRating) result = result.filter(m => m.rating >= parseFloat(minRating));

  if (sortBy === 'rating') result.sort((a, b) => b.rating - a.rating);
  if (sortBy === 'downloads') result.sort((a, b) => b.downloads - a.downloads);
  if (sortBy === 'price') result.sort((a, b) => a.price - b.price);

  res.json(result);
});

app.post('/api/models/train', authMiddleware, async (req, res) => {
  const { name, industry, participants } = req.body || {};

  const jobId = `train_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  res.json({
    id: jobId,
    name: name || 'Unnamed Model',
    industry: industry || 'general',
    participants: participants || [],
    status: 'training',
    startedAt: Date.now()
  });
});

app.post('/api/models/:id/subscribe', authMiddleware, (req, res) => {
  const model = modelMarketplace.find(m => m.id === req.params.id);
  if (!model) return res.status(404).json({ error: 'Model not found' });

  res.json({
    success: true,
    subscriptionId: `sub_${req.params.id}_${Date.now().toString(36)}`,
    model: model.name,
    plan: req.body?.plan || 'basic'
  });
});

const priceMonitorProducts = new Map();
const priceMonitorAlerts = [];

app.get('/api/price-monitor/products', (req, res) => {
  const products = Array.from(priceMonitorProducts.values()).map(p => {
    const history = p.priceHistory || [];
    const prices = history.map(h => h.price).filter(Boolean);
    const trend = prices.length >= 2
      ? (prices[prices.length - 1] > prices[0] ? 'rising' : prices[prices.length - 1] < prices[0] ? 'falling' : 'stable')
      : 'stable';

    return {
      ...p,
      lowestPrice: prices.length > 0 ? Math.min(...prices) : null,
      highestPrice: prices.length > 0 ? Math.max(...prices) : null,
      trend,
      priceHistory: history.slice(-20)
    };
  });

  res.json(products);
});

app.post('/api/price-monitor/products', authMiddleware, (req, res) => {
  const { name, url, targetPrice, selector } = req.body || {};

  if (!name) return res.status(400).json({ error: 'name required' });

  const id = `prod_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const product = {
    id,
    name: String(name).substring(0, 100),
    url: String(url || '').substring(0, 500),
    selector: String(selector || '.price').substring(0, 100),
    targetPrice: targetPrice ? parseFloat(targetPrice) : null,
    currentPrice: null,
    previousPrice: null,
    priceHistory: [],
    lastChecked: null,
    status: 'active',
    createdAt: Date.now()
  };

  priceMonitorProducts.set(id, product);

  res.json({ id, status: 'created' });
});

app.delete('/api/price-monitor/products/:id', authMiddleware, (req, res) => {
  priceMonitorProducts.delete(req.params.id);
  res.json({ success: true });
});

app.post('/api/price-monitor/products/:id/price', authMiddleware, (req, res) => {
  const product = priceMonitorProducts.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { price } = req.body || {};
  const numericPrice = parseFloat(price);

  if (isNaN(numericPrice)) return res.status(400).json({ error: 'Invalid price' });

  product.previousPrice = product.currentPrice;
  product.currentPrice = numericPrice;
  product.lastChecked = Date.now();

  product.priceHistory.push({
    price: numericPrice,
    timestamp: Date.now()
  });

  if (product.priceHistory.length > 100) {
    product.priceHistory = product.priceHistory.slice(-100);
  }

  let alert = null;

  if (product.targetPrice && numericPrice <= product.targetPrice) {
    alert = {
      id: `alert_${Date.now().toString(36)}`,
      productId: product.id,
      productName: product.name,
      type: 'price_below_target',
      message: `${product.name} 价格降至 ¥${numericPrice}，低于目标价 ¥${product.targetPrice}`,
      price: numericPrice,
      targetPrice: product.targetPrice,
      timestamp: Date.now(),
      read: false
    };
    priceMonitorAlerts.push(alert);
  }

  if (product.previousPrice && Math.abs((numericPrice - product.previousPrice) / product.previousPrice * 100) >= 10) {
    const change = ((numericPrice - product.previousPrice) / product.previousPrice * 100).toFixed(1);
    alert = {
      id: `alert_${Date.now().toString(36)}`,
      productId: product.id,
      productName: product.name,
      type: change > 0 ? 'price_spike' : 'price_drop',
      message: `${product.name} 价格${change > 0 ? '暴涨' : '暴跌'} ${Math.abs(change)}%`,
      price: numericPrice,
      previousPrice: product.previousPrice,
      timestamp: Date.now(),
      read: false
    };
    priceMonitorAlerts.push(alert);
  }

  if (priceMonitorAlerts.length > 500) {
    priceMonitorAlerts.splice(0, priceMonitorAlerts.length - 500);
  }

  res.json({ price: numericPrice, alert });
});

app.get('/api/price-monitor/alerts', (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  let alerts = [...priceMonitorAlerts];

  if (unreadOnly) {
    alerts = alerts.filter(a => !a.read);
  }

  res.json(alerts.slice(-50));
});

app.post('/api/price-monitor/alerts/:id/read', (req, res) => {
  const alert = priceMonitorAlerts.find(a => a.id === req.params.id);
  if (alert) alert.read = true;
  res.json({ success: true });
});

app.post('/api/price-monitor/check-all', authMiddleware, async (req, res) => {
  const results = [];

  for (const [id, product] of priceMonitorProducts) {
    if (product.status !== 'active') continue;
    results.push({
      id,
      name: product.name,
      currentPrice: product.currentPrice,
      lastChecked: product.lastChecked
    });
  }

  res.json({ checked: results.length, products: results });
});

const predictions = new Map();
const notifications = [];
const autoAdjustRules = new Map();

app.get('/api/price-monitor/:id/predict', (req, res) => {
  const product = priceMonitorProducts.get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const history = product.priceHistory || [];
  if (history.length < 3) {
    return res.json({ error: '数据不足', predictions: [] });
  }

  const prices = history.map(h => h.price).filter(Boolean);
  const lastPrice = prices[prices.length - 1];
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const trend = lastPrice > avgPrice ? 'rising' : lastPrice < avgPrice ? 'falling' : 'stable';

  const pred = [];
  for (let i = 1; i <= 7; i++) {
    const factor = trend === 'rising' ? 1 + (i * 0.005) : trend === 'falling' ? 1 - (i * 0.005) : 1;
    pred.push({
      day: i,
      date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
      price: parseFloat((lastPrice * factor).toFixed(2)),
      confidence: Math.max(0.3, 0.9 - i * 0.08),
      trend
    });
  }

  const recommendation = trend === 'rising'
    ? { action: 'buy_soon', reason: '预计上涨，建议尽快采购' }
    : trend === 'falling'
    ? { action: 'wait', reason: '预计下跌，建议等待' }
    : { action: 'hold', reason: '价格稳定' };

  res.json({
    productId: req.params.id,
    currentPrice: lastPrice,
    predictions: pred,
    trend,
    recommendation,
    volatility: 0.05
  });
});

app.post('/api/price-monitor/rules', authMiddleware, (req, res) => {
  const { name, productId, conditionType, conditionValue, actionType, actionValue } = req.body || {};

  if (!name || !productId) return res.status(400).json({ error: 'name and productId required' });

  const ruleId = `rule_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const rule = {
    id: ruleId,
    name: String(name).substring(0, 100),
    productId,
    conditionType: conditionType || 'price_below',
    conditionValue: parseFloat(conditionValue) || 0,
    actionType: actionType || 'set_price',
    actionValue: parseFloat(actionValue) || 0,
    enabled: true,
    createdAt: Date.now(),
    triggerCount: 0
  };

  autoAdjustRules.set(ruleId, rule);

  res.json({ id: ruleId, status: 'created' });
});

app.get('/api/price-monitor/rules', (req, res) => {
  res.json(Array.from(autoAdjustRules.values()));
});

app.post('/api/notifications', authMiddleware, async (req, res) => {
  const { title, body, channels, priority } = req.body || {};

  if (!title || !body) return res.status(400).json({ error: 'title and body required' });

  const notifId = `notif_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const notification = {
    id: notifId,
    title: String(title).substring(0, 200),
    body: String(body).substring(0, 1000),
    channels: channels || ['wechat_work', 'telegram'],
    priority: priority || 'normal',
    status: 'sent',
    timestamp: Date.now()
  };

  notifications.push(notification);

  if (notifications.length > 500) {
    notifications.splice(0, notifications.length - 500);
  }

  res.json({ id: notifId, status: 'sent' });
});

app.get('/api/notifications', (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  let result = [...notifications];
  if (unreadOnly) result = result.filter(n => !n.read);
  res.json(result.slice(-50));
});

app.get('/api/workflows', (req, res) => {
  res.json(workflows);
});

const workflowMarket = new Map();
const plugins = new Map();

app.get('/api/marketplace/workflows', (req, res) => {
  const { category, keyword, sortBy, minRating } = req.query;
  let result = Array.from(workflowMarket.values());

  if (category) result = result.filter(w => w.category === category);
  if (minRating) result = result.filter(w => w.rating >= parseFloat(minRating));
  if (keyword) {
    const kw = keyword.toLowerCase();
    result = result.filter(w =>
      w.name.toLowerCase().includes(kw) ||
      w.description.toLowerCase().includes(kw)
    );
  }

  switch (sortBy) {
    case 'downloads': result.sort((a, b) => b.downloads - a.downloads); break;
    case 'rating': result.sort((a, b) => b.rating - a.rating); break;
    case 'newest': result.sort((a, b) => b.createdAt - a.createdAt); break;
  }

  res.json(result.slice(0, 50));
});

app.post('/api/marketplace/workflows', authMiddleware, (req, res) => {
  const { name, description, category, tags, nodes, connections } = req.body || {};

  if (!name) return res.status(400).json({ error: 'name required' });

  const id = `wf_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const workflow = {
    id,
    name: String(name).substring(0, 100),
    description: String(description || '').substring(0, 500),
    category: category || 'general',
    tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
    nodes: nodes || [],
    connections: connections || [],
    downloads: 0,
    rating: 0,
    ratingCount: 0,
    createdAt: Date.now()
  };

  workflowMarket.set(id, workflow);
  res.json({ id, status: 'published' });
});

app.get('/api/marketplace/workflows/:id', (req, res) => {
  const workflow = workflowMarket.get(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Not found' });
  res.json(workflow);
});

app.post('/api/marketplace/workflows/:id/download', (req, res) => {
  const workflow = workflowMarket.get(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Not found' });

  workflow.downloads++;
  res.json({ success: true, downloads: workflow.downloads });
});

app.post('/api/marketplace/workflows/:id/rate', authMiddleware, (req, res) => {
  const workflow = workflowMarket.get(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Not found' });

  const { rating } = req.body || {};
  const numericRating = Math.max(1, Math.min(5, parseInt(rating) || 3));

  workflow.rating = ((workflow.rating * workflow.ratingCount) + numericRating) / (workflow.ratingCount + 1);
  workflow.ratingCount++;

  res.json({ rating: workflow.rating, count: workflow.ratingCount });
});

app.get('/api/plugins', (req, res) => {
  res.json(Array.from(plugins.values()));
});

app.post('/api/plugins', authMiddleware, (req, res) => {
  const { name, description, nodeTypes, version } = req.body || {};

  if (!name) return res.status(400).json({ error: 'name required' });

  const id = `plugin_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const plugin = {
    id,
    name: String(name).substring(0, 100),
    description: String(description || '').substring(0, 500),
    version: version || '1.0.0',
    nodeTypes: Array.isArray(nodeTypes) ? nodeTypes : [],
    downloads: 0,
    status: 'active',
    createdAt: Date.now()
  };

  plugins.set(id, plugin);
  res.json({ id, status: 'registered' });
});

app.post('/api/plugins/:id/install', authMiddleware, (req, res) => {
  const plugin = plugins.get(req.params.id);
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' });

  plugin.downloads++;
  res.json({ success: true, plugin });
});

app.get('/api/executions', (req, res) => {
  const result = [];
  for (const [id, exec] of executions) {
    result.push(exec);
  }
  res.json(result);
});

app.post('/api/executions', authMiddleware, async (req, res) => {
  const { workflowId } = req.body || {};
  const workflow = workflows.find(w => w.id === workflowId);

  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }

  const execId = `exec_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const execution = {
    id: execId,
    workflowId,
    workflowName: workflow.name,
    status: 'running',
    steps: workflow.steps.map((s, i) => ({
      ...s,
      index: i,
      status: i === 0 ? 'running' : 'pending',
      result: null,
      startTime: i === 0 ? Date.now() : null
    })),
    startedAt: Date.now(),
    completedAt: null,
    currentStep: 0
  };

  executions.set(execId, execution);

  const simulateExecution = async () => {
    for (let i = 0; i < execution.steps.length; i++) {
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
      execution.steps[i].status = 'completed';
      execution.steps[i].endTime = Date.now();
      execution.steps[i].result = { type: execution.steps[i].task, completed: true };
      execution.currentStep = i + 1;

      if (i + 1 < execution.steps.length) {
        execution.steps[i + 1].status = 'running';
        execution.steps[i + 1].startTime = Date.now();
      }
    }

    execution.status = 'completed';
    execution.completedAt = Date.now();
  };

  simulateExecution();

  res.json({ id: execId, status: 'started' });
});

app.post('/api/executions/:id/cancel', authMiddleware, (req, res) => {
  const exec = executions.get(req.params.id);
  if (!exec) return res.status(404).json({ error: 'Not found' });

  exec.status = 'cancelled';
  exec.completedAt = Date.now();

  const currentStep = exec.steps[exec.currentStep];
  if (currentStep && currentStep.status === 'running') {
    currentStep.status = 'cancelled';
  }

  res.json({ success: true });
});

app.get('/api/agent/templates', (req, res) => {
  const templates = [
    { key: 'search', name: '搜索信息', icon: '🔍', description: '在搜索引擎中搜索', params: ['query'] },
    { key: 'scrape', name: '数据采集', icon: '📊', description: '提取网页数据', params: ['url', 'selector'] },
    { key: 'monitor', name: '网页监控', icon: '👁️', description: '检查网页变化', params: ['url', 'selector'] },
    { key: 'form_fill', name: '填写表单', icon: '📝', description: '自动填写表单', params: ['url'] },
    { key: 'download', name: '下载文件', icon: '⬇️', description: '下载指定文件', params: ['url'] },
    { key: 'screenshot_page', name: '页面截图', icon: '📸', description: '截取网页', params: ['url'] },
    { key: 'extract_links', name: '提取链接', icon: '🔗', description: '提取所有链接', params: ['url'] },
    { key: 'price_check', name: '价格监控', icon: '💰', description: '监控价格变化', params: ['url', 'price_selector'] },
    { key: 'social_post', name: '社交媒体发布', icon: '📱', description: '在社交媒体发布内容', params: ['url', 'content'] },
    { key: 'data_compare', name: '数据对比', icon: '⚖️', description: '对比两个网页数据', params: ['url1', 'url2'] },
    { key: 'login_check', name: '登录检测', icon: '🔐', description: '检测网站登录状态', params: ['url', 'status_selector'] },
    { key: 'content_crawl', name: '内容抓取', icon: '📰', description: '抓取网页正文内容', params: ['url', 'content_selector'] },
    { key: 'data_analysis', name: '数据分析', icon: '📈', description: '数据分析统计', params: ['url', 'data_selector'] },
    { key: 'report_generate', name: '报表生成', icon: '📊', description: '生成数据报表', params: ['url', 'table_selector'] },
    { key: 'api_test', name: 'API测试', icon: '🔌', description: '测试API接口', params: ['url'] },
    { key: 'seo_check', name: 'SEO检测', icon: '🔎', description: '检查SEO元素', params: ['url'] }
  ];
  res.json(templates);
});

app.get('/api/agent/tasks', (req, res) => {
  res.json([]);
});

app.post('/api/agent/tasks/:id/cancel', authMiddleware, (req, res) => {
  res.json({ success: true, taskId: req.params.id });
});

app.get('/api/memory', authMiddleware, (req, res) => {
  const { page, pageSize, query, format, export: isExport, stream } = req.query;
  
  if (isExport === 'true') {
    if (stream === 'true') {
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="memory-${Date.now()}.${format || 'json'}"`);
      res.setHeader('Transfer-Encoding', 'chunked');
      
      for (const chunk of memory.streamExport(format || 'json')) {
        res.write(chunk);
      }
      res.end();
      return;
    }
    
    const exportData = memory.export(format || 'json');
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="memory-${Date.now()}.csv"`);
    }
    return res.json({
      format: format || 'json',
      data: exportData
    });
  }
  
  if (page || query) {
    const result = memory.list({
      page: parseInt(page) || 1,
      pageSize: Math.min(parseInt(pageSize) || 50, 100),
      query: query || ''
    });
    return res.json(result);
  }
  
  res.json(memory.dump());
});

app.get('/api/memory/stats', (req, res) => {
  res.json(memory.getStats());
});

app.get('/api/i18n/locales', (req, res) => {
  res.json({
    current: i18n.getLocale(),
    available: i18n.getAllLocales()
  });
});

app.get('/api/i18n/:locale', (req, res) => {
  const { locale } = req.params;
  const allowedLocales = i18n.getAllLocales();
  if (!allowedLocales.includes(locale)) {
    return res.status(400).json({ error: 'Invalid locale' });
  }
  res.json(i18n.getTranslations(locale));
});

app.post('/api/i18n/locale', (req, res) => {
  const { locale } = req.body || {};
  const allowedLocales = i18n.getAllLocales();
  if (!locale || !allowedLocales.includes(locale)) {
    return res.status(400).json({ ok: false, error: 'Invalid locale' });
  }
  i18n.setLocale(locale);
  res.json({ ok: true, locale: i18n.getLocale() });
});

// ========== Swagger UI ==========
let swaggerUi, swaggerSpec;
try {
  swaggerUi = require('swagger-ui-express');
  const fs = require('fs');
  const openApiPath = path.resolve(ROOT_DIR, 'docs/openapi.json');
  if (fs.existsSync(openApiPath)) {
    swaggerSpec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'UltraWork AI API Docs',
      swaggerOptions: { persistAuthorization: true }
    }));
    console.log('[Docs] Swagger UI available at /api-docs');
  } else {
    console.warn('[Docs] OpenAPI spec not found at docs/openapi.json');
  }
} catch (e) {
  console.warn('[Docs] Swagger UI not available:', e.message);
}

app.delete('/api/memory', authMiddleware, (req, res) => {
  memory.remember('__cleared__', Date.now());
  res.json({ ok: true });
});

app.delete('/api/memory/:key', authMiddleware, (req, res) => {
  const { key } = req.params;
  if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
    return res.status(400).json({ error: 'Invalid key format' });
  }
  memory.remove(key);
  res.json({ ok: true, key });
});

app.post('/api/infer', authMiddleware, async (req, res) => {
  const { text } = req.body || {};
  if (ollamaBridge) {
    const result = await chat.respond(text);
    return res.json(result);
  }
  res.status(500).json({ ok: false, text: 'inference-unavailable' });
});

app.get('/api/ollama/status', async (req, res) => {
  if (!ollamaBridge) {
    return res.json({ available: false, message: 'Set INFERENCE_ENGINE=ollama' });
  }
  try {
    const connected = await ollamaBridge.checkConnection();
    const models = await ollamaBridge.listModels();
    res.json({ 
      available: connected, 
      models: models.map(m => m.name) || [], 
      model: ollamaBridge.defaultModel,
      maxTokens: ollamaBridge.maxTokens
    });
  } catch (e) {
    res.json({ available: false, error: e.message });
  }
});

console.log(`Inference engine: ${inferenceEngine}`);

// ========== Game API ==========
app.get('/api/game/status', (req, res) => {
  res.json(gameManager?.getStatus() || { enabled: false });
});

app.post('/api/game/connect', authMiddleware, async (req, res) => {
  if (!gameManager) return res.status(500).json({ error: 'Game not enabled' });
  try {
    await gameManager.game.connect();
    if (io) io.emit('game_status', gameManager.getStatus());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/game/disconnect', authMiddleware, async (req, res) => {
  if (!gameManager) return res.status(500).json({ error: 'Game not enabled' });
  try {
    await gameManager.disconnect();
    if (io) io.emit('game_status', gameManager.getStatus());
    res.json({ ok: true });
  } catch (error) {
    console.error('[Game] Disconnect error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/game/command', authMiddleware, async (req, res) => {
  if (!gameManager) return res.status(500).json({ error: 'Game not enabled' });
  const { command } = req.body || {};
  if (!command || typeof command !== 'string') return res.status(400).json({ error: 'command required' });
  const sanitized = sanitizeCommand(command);
  if (!sanitized) return res.status(400).json({ error: 'Invalid or forbidden command' });
  const result = await gameManager.handleMessage(sanitized);
  if (io) io.emit('game_status', gameManager.getStatus());
  res.json(result || { ok: true });
});

app.post('/api/game/plan', authMiddleware, async (req, res) => {
  if (!gameManager) return res.status(500).json({ error: 'Game not enabled' });
  const { task } = req.body || {};
  if (!task || typeof task !== 'string') return res.status(400).json({ error: 'task required' });
  const safeTask = String(task).substring(0, 500);
  if (/[;&|`$]/.test(safeTask)) return res.status(400).json({ error: 'Task contains forbidden characters' });
  const result = await gameManager.planAndExecute(safeTask);
  res.json(result);
});

app.get('/api/game/events', (req, res) => {
  res.json(gameManager?.eventHandler?.getEventHistory() || []);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

const gracefulShutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);
  if (pm?.stopMoodDrift) pm.stopMoodDrift();
  if (gameManager?.disconnect) gameManager.disconnect();
  if (io) io.close();
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const improvedHealthCheck = async () => {
  const health = {
    ok: true,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: config.get('server.env', 'development'),
    inference: inferenceEngine,
    ollama: false,
    model: config.get('inference.ollama.defaultModel', 'llama3.2'),
    websocket: !!io,
    compression: wsConfig.compression?.enabled || false,
    game: {
      enabled: config.get('game.enabled', false),
      connected: gameManager?.game?.connected || false
    },
    memoryStats: memory?.getStats ? memory.getStats() : null,
    timestamp: new Date().toISOString()
  };
  
  if (ollamaBridge) {
    try {
      health.ollama = await ollamaBridge.checkConnection();
    } catch (e) {
      health.ollamaError = e.message;
    }
  }
  
  return health;
};

const workflowMetrics = {
  workflows: new Map(),
  system: { requests: 0, errors: 0, startTime: Date.now() }
};

app.get('/metrics', (req, res) => {
  let output = '';

  output += '# HELP ultrawork_http_requests_total Total HTTP requests\n';
  output += '# TYPE ultrawork_http_requests_total counter\n';
  output += `ultrawork_http_requests_total ${workflowMetrics.system.requests}\n`;

  output += '\n# HELP ultrawork_http_errors_total Total HTTP errors\n';
  output += '# TYPE ultrawork_http_errors_total counter\n';
  output += `ultrawork_http_errors_total ${workflowMetrics.system.errors}\n`;

  output += '\n# HELP ultrawork_uptime_seconds Uptime in seconds\n';
  output += '# TYPE ultrawork_uptime_seconds gauge\n';
  output += `ultrawork_uptime_seconds ${((Date.now() - workflowMetrics.system.startTime) / 1000).toFixed(0)}\n`;

  output += '\n# HELP ultrawork_websocket_connections WebSocket connections\n';
  output += '# TYPE ultrawork_websocket_connections gauge\n';
  output += `ultrawork_websocket_connections ${wss ? wss.clients?.size || 0 : 0}\n`;

  const memUsage = process.memoryUsage();
  output += '\n# HELP ultrawork_memory_heap_bytes Memory heap usage\n';
  output += '# TYPE ultrawork_memory_heap_bytes gauge\n';
  output += `ultrawork_memory_heap_bytes ${memUsage.heapUsed}\n`;

  output += '\n# HELP ultrawork_memory_rss_bytes Memory RSS\n';
  output += '# TYPE ultrawork_memory_rss_bytes gauge\n';
  output += `ultrawork_memory_rss_bytes ${memUsage.rss}\n`;

  output += '\n# HELP ultrawork_agent_count Active agents\n';
  output += '# TYPE ultrawork_agent_count gauge\n';
  output += `ultrawork_agent_count ${wsRateLimits.size || 0}\n`;

  output += '\n# HELP ultrawork_attestations_total Total attestations\n';
  output += '# TYPE ultrawork_attestations_total counter\n';
  output += `ultrawork_attestations_total ${attestations.size || 0}\n`;

  output += '\n# HELP ultrawork_price_products_total Monitored products\n';
  output += '# TYPE ultrawork_price_products_total gauge\n';
  output += `ultrawork_price_products_total ${priceMonitorProducts.size || 0}\n`;

  output += '\n# HELP ultrawork_price_alerts_total Price alerts\n';
  output += '# TYPE ultrawork_price_alerts_total gauge\n';
  output += `ultrawork_price_alerts_total ${priceMonitorAlerts.length || 0}\n`;

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(output);
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    system: {
      uptime: ((Date.now() - workflowMetrics.system.startTime) / 1000).toFixed(0) + 's',
      requests: workflowMetrics.system.requests,
      errors: workflowMetrics.system.errors,
      errorRate: workflowMetrics.system.requests > 0
        ? (workflowMetrics.system.errors / workflowMetrics.system.requests * 100).toFixed(2) + '%'
        : '0%',
      memory: {
        heapUsed: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + 'MB',
        rss: (process.memoryUsage().rss / 1024 / 1024).toFixed(2) + 'MB'
      }
    },
    industry: {
      priceMonitor: {
        products: priceMonitorProducts.size,
        alerts: priceMonitorAlerts.length,
        unreadAlerts: priceMonitorAlerts.filter(a => !a.read).length
      },
      attestations: attestations.size
    }
  });
});

app.get('/health', async (req, res) => {
  const isPublic = req.query.public === 'true';
  
  if (isPublic) {
    return res.json({ 
      ok: true, 
      status: 'online',
      timestamp: new Date().toISOString()
    });
  }
  
  if (!API_KEY) {
    return res.json({ 
      ok: true,
      status: 'online',
      timestamp: new Date().toISOString()
    });
  }
  
  const key = req.headers['x-api-key'];
  if (!timingSafeEqual(key || '', API_KEY)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const memUsage = process.memoryUsage();
    const memUsed = memUsage.heapUsed / 1024 / 1024;
    
    const health = {
      ok: true,
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      inference: inferenceEngine,
      ollama: false,
      model: config.get('inference.ollama.defaultModel', 'llama3.2'),
      websocket: !!io,
      compression: wsConfig.compression?.enabled || false,
      game: {
        enabled: config.get('game.enabled', false),
        connected: gameManager?.game?.connected || false
      },
      memoryStats: memory?.getStats ? memory.getStats() : null,
      mcp: mcpPlugin ? {
        servers: Object.keys(mcpPlugin.getStatus().servers || {}).length,
        tools: mcpPlugin.getStatus().tools,
        nodes: mcpPlugin.getStatus().nodes
      } : null,
      timestamp: new Date().toISOString()
    };
    
    if (memUsed > 500) {
      health.warnings = health.warnings || [];
      health.warnings.push('High memory usage detected');
    }
    
    if (ollamaBridge) {
      try {
        health.ollama = await ollamaBridge.checkConnection();
      } catch (e) {
        health.ollamaError = 'Connection failed';
      }
    }
    
    res.json(health);
  } catch (e) {
    res.status(503).json({ ok: false, error: 'Health check failed' });
  }
});

server.listen(port, () => {
  console.log(`UltraWork AI listening on port ${port}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} in use.`);
    process.exit(1);
  }
});

// ========== MCP Integration ==========
let mcpPlugin = null;
let mcpWorkflowEngine = null;

// Initialize Skills API immediately (independent of MCP)
let skillAutoLoader = null;
let skillAutoRouter = null;
try {
  const { SkillManager } = require(path.resolve(ROOT_DIR, 'src/skills/SkillManager'));
  const { SkillsApi, SkillAutoRouter } = require(path.resolve(ROOT_DIR, 'src/skills/api'));
  const { SkillAutoLoader } = require(path.resolve(ROOT_DIR, 'src/skills/SkillAutoLoader'));
  
  const skillManager = new SkillManager({ hotReload: false });
  const loadedSkills = skillManager.loadAllSkills();
  const skillsApi = new SkillsApi(skillManager);
  app.use('/api/skills', skillsApi.getRouter());
  
  // Initialize Skill AutoLoader
  skillAutoLoader = new SkillAutoLoader();
  skillAutoRouter = new SkillAutoRouter(skillAutoLoader);
  app.use('/api/skills/auto', skillAutoRouter.getRouter());
  
  console.log('[Skills] Skills API initialized');
  console.log(`[Skills] Loaded ${loadedSkills.length} skills`);
  console.log('[Skills] AutoLoader enabled:', skillAutoLoader.isEnabled());
  
  // Get startup skills
  const startupSkills = skillAutoLoader.getStartupSkills();
  console.log('[Skills] Startup skills to load:', startupSkills);
} catch (error) {
  console.warn('[Skills] Initialization failed:', error.message);
}

async function initMCP() {
  try {
    const { MCPPlugin } = require(path.resolve(ROOT_DIR, 'src/mcp/MCPPlugin'));
    const { NodeWorkflowEngine } = require(path.resolve(ROOT_DIR, 'src/workflow/NodeWorkflowEngine'));
    const { router: mcpRouter, setMCPPlugin, setPermissionManager } = require(path.resolve(ROOT_DIR, 'src/mcp/router'));
    const { createMCPMetricsHandler } = require(path.resolve(ROOT_DIR, 'src/mcp/metrics'));

    // Always mount the router first
    app.use('/api/mcp', mcpRouter);
    console.log('[MCP] Router mounted at /api/mcp');

    mcpPlugin = new MCPPlugin({
      configPath: path.resolve(ROOT_DIR, 'config/mcp-servers.json'),
      autoRefreshInterval: 60000
    });

    mcpPlugin.on('server-registered', (info) => {
      console.log(`[MCP] Server registered: ${info.name}`);
    });
    mcpPlugin.on('loaded', (info) => {
      console.log(`[MCP] Loaded: ${info.serversRegistered} servers, ${info.toolsAvailable} tools`);
    });
    mcpPlugin.on('status-change', (info) => {
      console.log(`[MCP] Status changed: ${info.status}`);
    });
    
    // Start MCP loading in background
    setMCPPlugin(mcpPlugin);
    console.log('[MCP] Plugin reference set, loading in background...');
    
    mcpPlugin.onLoad().then(() => {
      console.log('[MCP] Background loading complete');
      
      if (mcpPlugin.getPermissionManager()) {
        setPermissionManager(mcpPlugin.getPermissionManager());
      }

      mcpWorkflowEngine = new NodeWorkflowEngine();
      mcpPlugin.registerWorkflowEngine(mcpWorkflowEngine);

      app.get('/api/mcp/metrics', createMCPMetricsHandler(mcpPlugin));
      
      console.log('[MCP] Integration initialized');
      console.log(`[MCP] Servers: ${Object.keys(mcpPlugin.getStatus().servers || {}).length}`);
      console.log(`[MCP] Tools: ${mcpPlugin.getStatus().tools}`);
      console.log(`[MCP] Nodes: ${mcpPlugin.getStatus().nodes}`);
    }).catch(err => {
      console.error('[MCP] Background loading failed:', err.message);
    });

  } catch (error) {
    console.warn('[MCP] Initialization failed:', error.message);
    console.warn('[MCP] MCP features will be unavailable');
  }
}

// MCP Annotations API (direct routes as fallback)
try {
  const ToolAnnotations = require(path.resolve(ROOT_DIR, 'src/mcp/engines/ToolAnnotations'));
  
  app.get('/api/mcp/annotations', (req, res) => {
    res.json({ annotations: ToolAnnotations.ANNOTATIONS, count: Object.keys(ToolAnnotations.ANNOTATIONS).length });
  });
  
  app.get('/api/mcp/annotations/summary', (req, res) => {
    const annotations = ToolAnnotations.ANNOTATIONS;
    const summary = {
      total: Object.keys(annotations).length,
      readOnly: Object.values(annotations).filter(a => a.readOnlyHint).length,
      destructive: Object.values(annotations).filter(a => a.destructiveHint).length,
      idempotent: Object.values(annotations).filter(a => a.idempotentHint).length
    };
    res.json(summary);
  });
  
  app.get('/api/mcp/annotations/risk-level', (req, res) => {
    const { tools } = req.query;
    if (!tools) return res.status(400).json({ error: 'tools query parameter required' });
    const toolList = tools.split(',');
    const riskLevels = toolList.map(tool => ({
      tool,
      riskLevel: ToolAnnotations.getRiskLevel(tool),
      ...ToolAnnotations.getAnnotation(tool)
    }));
    res.json({ riskLevels });
  });
  
  console.log('[MCP] Annotation routes registered directly');
} catch (error) {
  console.warn('[MCP] Failed to register annotation routes:', error.message);
}

// MCP Roots API
try {
  const { rootsManager } = require(path.resolve(ROOT_DIR, 'src/mcp/engines/RootsManager'));
  
  app.get('/api/mcp/roots', (req, res) => {
    res.json({ roots: rootsManager.roots, count: rootsManager.roots.length });
  });
  
  app.get('/api/mcp/roots/validate', (req, res) => {
    const { path: targetPath } = req.query;
    if (!targetPath) return res.status(400).json({ error: 'path query required' });
    const validation = rootsManager.validatePath(targetPath);
    res.json({ ...validation, allowed: validation.valid });
  });
  
  app.get('/api/mcp/roots/:id', (req, res) => {
    const root = rootsManager.roots.find(r => r.id === req.params.id);
    if (!root) return res.status(404).json({ error: 'Root not found' });
    res.json(root);
  });
  
  app.post('/api/mcp/roots', authMiddleware, (req, res) => {
    const { path: rootPath, name, type } = req.body;
    if (!rootPath) return res.status(400).json({ error: 'path required' });
    const newRoot = rootsManager.addRoot(rootPath, name, type);
    res.json({ roots: rootsManager.roots, added: rootPath });
  });
  
  app.delete('/api/mcp/roots/:id', authMiddleware, (req, res) => {
    const success = rootsManager.removeRoot(req.params.id);
    if (!success) return res.status(404).json({ error: 'Root not found' });
    res.json({ success: true });
  });
  
  console.log('[MCP] Roots routes registered directly');
} catch (error) {
  console.warn('[MCP] Failed to register roots routes:', error.message);
}

// MCP Status API
app.get('/api/mcp/status', (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP not available' });
  }
  res.json(mcpPlugin.getStatus());
});

app.get('/api/mcp/tools', (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP not available' });
  }
  const tools = mcpPlugin.getAvailableTools();
  res.json({ tools, count: tools.length });
});

app.get('/api/mcp/tools/prompt', (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP not available' });
  }
  const prompt = mcpPlugin.getToolsForPrompt({ includeSchema: true });
  res.type('text/plain').send(prompt);
});

app.post('/api/mcp/call', authMiddleware, async (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP not available' });
  }
  
  const { toolFullName, params } = req.body || {};
  
  if (!toolFullName) {
    return res.status(400).json({ error: 'toolFullName required' });
  }

  try {
    const result = await mcpPlugin.executeTool(toolFullName, params || {});
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/mcp/workflow/nodes', (req, res) => {
  if (!mcpWorkflowEngine) {
    return res.status(503).json({ error: 'MCP workflow not available' });
  }
  
  const nodes = mcpWorkflowEngine.getAllNodeTypes()
    .filter(n => n.type.startsWith('mcp.'))
    .map(n => ({
      type: n.type,
      name: n.name,
      category: n.category,
      description: n.description
    }));
  
  res.json({ nodes, count: nodes.length });
});

// Initialize MCP with proper async handling
initMCP().then(() => {
  console.log('[MCP] Initialization complete');
}).catch(err => {
  console.warn('[MCP] Initialization failed:', err.message);
});

initGame();

// ================== Error Handlers (MUST be at end) ==================
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  console.error(`[ERROR] ${req.method} ${req.path} - ${statusCode}: ${err.message}`);
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? '服务器内部错误' 
    : err.message;
  res.status(statusCode).json({
    error: errorMessage,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});
