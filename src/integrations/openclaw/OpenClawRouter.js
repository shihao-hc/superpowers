/**
 * OpenClaw API 路由
 * 将 OpenClaw 网关集成到 UltraWork 后端
 * 
 * 安全特性:
 * - CORS 配置
 * - 速率限制
 * - 参数验证
 * - 请求超时
 * - Helmet 安全头
 * - 响应缓存
 */

const express = require('express');
const { ModelServiceAdapter } = require('./ModelServiceAdapter');
const { MultiModelManager } = require('./MultiModelManager');
const { ResponseCache } = require('./ResponseCache');

const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 100;

class RateLimiter {
  constructor() {
    this.requests = new Map();
  }
  
  isAllowed(ip) {
    const now = Date.now();
    const record = this.requests.get(ip);
    
    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
      this.requests.set(ip, { count: 1, windowStart: now });
      return true;
    }
    
    if (record.count >= RATE_LIMIT_MAX) {
      return false;
    }
    
    record.count++;
    return true;
  }
  
  cleanup() {
    const now = Date.now();
    for (const [ip, record] of this.requests.entries()) {
      if (now - record.windowStart > RATE_LIMIT_WINDOW * 2) {
        this.requests.delete(ip);
      }
    }
  }
}

class OpenClawRouter {
  constructor(options = {}) {
    this.gatewayUrl = options.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:3002';
    this.port = options.port || 3003;
    this.apiKey = options.apiKey || process.env.OPENCLAW_API_KEY || 'ultrawork-local-key';
    
    this.modelService = null;
    this.multiModelManager = null;
    this.app = null;
    this.server = null;
    this.rateLimiter = new RateLimiter();
    this.responseCache = new ResponseCache({
      maxSize: options.cacheMaxSize || 500,
      defaultTTL: options.cacheTTL || 300000,
      enabled: options.cacheEnabled !== false
    });
    
    setInterval(() => this.rateLimiter.cleanup(), RATE_LIMIT_WINDOW);
  }
  
  async initialize() {
    this.modelService = new ModelServiceAdapter({
      gatewayUrl: this.gatewayUrl,
      apiKey: this.apiKey
    });
    
    this.multiModelManager = new MultiModelManager({
      gatewayUrl: this.gatewayUrl
    });
    
    this.app = express();
    this._setupMiddleware();
    this._setupRoutes();
  }
  
  _setupMiddleware() {
    this.app.set('trust proxy', 1);
    
    this.app.use((req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      
      if (!this.rateLimiter.isAllowed(ip)) {
        return res.status(429).json({ 
          error: 'Too many requests',
          retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
        });
      }
      next();
    });
    
    this.app.use(express.json({ 
      limit: '5mb',
      strict: true
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '5mb' }));
    
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.removeHeader('X-Powered-By');
      next();
    });
    
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });
    
    const corsOptions = {
      origin: process.env.CORS_ORIGIN || 'localhost',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400
    };
    
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
      
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      next();
    });
    
    this.app.use((req, res, next) => {
      if (req.path.startsWith('/v1/') || req.path.startsWith('/api/')) {
        const key = req.headers.authorization?.replace('Bearer ', '');
        if (!key) {
          return res.status(401).json({ error: 'Missing API key' });
        }
        if (key !== this.apiKey) {
          return res.status(401).json({ error: 'Invalid API key' });
        }
      }
      next();
    });
  }
  
  _setupRoutes() {
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.modelService.healthCheck();
        res.json({
          status: health.status,
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        });
      } catch (error) {
        res.status(500).json({ 
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    this.app.get('/stats', (req, res) => {
      const stats = this.modelService.getStats();
      res.json({
        ...stats,
        timestamp: new Date().toISOString()
      });
    });
    
    this.app.get('/cache/stats', (req, res) => {
      res.json({
        ...this.responseCache.getStats(),
        timestamp: new Date().toISOString()
      });
    });
    
    this.app.delete('/cache', (req, res) => {
      const { model } = req.query;
      const count = this.responseCache.invalidate(model);
      res.json({ 
        invalidated: count,
        model: model || 'all',
        timestamp: new Date().toISOString()
      });
    });
    
    this.app.get('/v1/models', async (req, res) => {
      try {
        const result = await this.modelService.listModels();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/v1/chat/completions', async (req, res) => {
      try {
        const { model, messages, temperature, max_tokens, stream } = req.body;
        
        if (!model || typeof model !== 'string') {
          return res.status(400).json({ 
            error: 'Missing or invalid model parameter' 
          });
        }
        
        if (!Array.isArray(messages) || messages.length === 0) {
          return res.status(400).json({ 
            error: 'Missing or invalid messages parameter' 
          });
        }
        
        if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
          return res.status(400).json({ 
            error: 'Temperature must be between 0 and 2' 
          });
        }
        
        if (max_tokens !== undefined && (max_tokens < 1 || max_tokens > 32000)) {
          return res.status(400).json({ 
            error: 'max_tokens must be between 1 and 32000' 
          });
        }
        
        const safeMessages = messages.slice(0, 100).map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content.slice(0, 50000) : ''
        }));
        
        const cacheParams = {
          model: model.slice(0, 100),
          messages: safeMessages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 4096
        };
        
        const cachedResult = this.responseCache.get(cacheParams);
        if (cachedResult && !stream) {
          res.setHeader('X-Cache', 'HIT');
          return res.json(cachedResult);
        }
        
        res.setHeader('X-Cache', 'MISS');
        
        const result = await this.modelService.chatCompletions({
          ...cacheParams,
          stream: stream ?? false
        });
        
        if (!stream && result.choices) {
          this.responseCache.set(cacheParams, result);
        }
        
        res.json(result);
      } catch (error) {
        console.error('[OpenClaw Router] Chat completion error:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/v1/completions', async (req, res) => {
      try {
        const { model, prompt, max_tokens } = req.body;
        
        if (!model || typeof prompt !== 'string') {
          return res.status(400).json({ 
            error: 'Missing model or prompt' 
          });
        }
        
        const result = await this.modelService.completions({
          model: model.slice(0, 100),
          prompt: prompt.slice(0, 50000),
          max_tokens: max_tokens ?? 1000
        });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/api/openclaw/providers', async (req, res) => {
      try {
        await this.multiModelManager.initialize();
        res.json(this.multiModelManager.getProviders());
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.get('/api/openclaw/models', async (req, res) => {
      try {
        const { search, provider } = req.query;
        let models = await this.multiModelManager.getModels();
        
        if (search && typeof search === 'string') {
          models = this.multiModelManager.searchModels(search.slice(0, 50));
        }
        if (provider && typeof provider === 'string') {
          models = this.multiModelManager.filterModels({ 
            provider: provider.slice(0, 50) 
          });
        }
        
        res.json(models);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/api/openclaw/ask', async (req, res) => {
      try {
        const { prompt, model, temperature, stream } = req.body;
        
        if (!prompt || typeof prompt !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid prompt' });
        }
        
        await this.multiModelManager.initialize();
        
        const safePrompt = prompt.slice(0, 50000);
        
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          
          let fullContent = '';
          await this.multiModelManager.streamChat(
            [{ role: 'user', content: safePrompt }],
            { 
              model: model?.slice(0, 100), 
              temperature: temperature ?? 0.7,
              onChunk: (chunk) => {
                const content = chunk.choices?.[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                  res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
              }
            }
          );
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          const result = await this.multiModelManager.ask(safePrompt, { 
            model: model?.slice(0, 100), 
            temperature: temperature ?? 0.7 
          });
          res.json(result);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/api/openclaw/ask-once', async (req, res) => {
      try {
        const { prompt, models, temperature } = req.body;
        
        if (!prompt || typeof prompt !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid prompt' });
        }
        
        await this.multiModelManager.initialize();
        
        const safePrompt = prompt.slice(0, 50000);
        const safeModels = Array.isArray(models) 
          ? models.slice(0, 10).map(m => typeof m === 'string' ? m.slice(0, 100) : null).filter(Boolean)
          : [];
        
        const results = await this.multiModelManager.askOnce(
          safePrompt, 
          safeModels, 
          { temperature: temperature ?? 0.7 }
        );
        
        res.json({
          prompt: safePrompt,
          results,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/api/openclaw/switch-model', async (req, res) => {
      try {
        const { model } = req.body;
        
        if (!model || typeof model !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid model' });
        }
        
        await this.multiModelManager.initialize();
        const result = await this.multiModelManager.switchModel(model.slice(0, 100));
        
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });
    
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
    
    this.app.use((err, req, res, next) => {
      console.error('[OpenClaw Router] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }
  
  async start() {
    await this.initialize();
    
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`[OpenClaw Router] Started on port ${this.port}`);
        console.log(`[OpenClaw Router] Gateway: ${this.gatewayUrl}`);
        console.log(`[OpenClaw Router] Health: http://localhost:${this.port}/health`);
        console.log(`[OpenClaw Router] Models: http://localhost:${this.port}/v1/models`);
        resolve(this.server);
      });
      
      this.server.timeout = 180000;
    });
  }
  
  stop() {
    if (this.server) {
      this.server.close();
      console.log('[OpenClaw Router] Stopped');
    }
  }
}

function createOpenClawRouter(options = {}) {
  return new OpenClawRouter(options);
}

module.exports = { OpenClawRouter, createOpenClawRouter, RateLimiter };
