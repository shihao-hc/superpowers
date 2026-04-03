/**
 * OpenClaw Gateway 客户端
 * 统一调用各种免费大模型
 * 
 * 安全特性:
 * - URL 白名单验证
 * - 请求体大小限制
 * - 参数白名单验证
 * - 超时保护
 */

const EventEmitter = require('events');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1'];
const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB

function isUrlSafe(gatewayUrl) {
  try {
    const url = new URL(gatewayUrl);
    
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      return { safe: false, error: 'Only http/https protocols allowed' };
    }
    
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.includes(host) && !host.endsWith('.local')) {
      return { safe: false, error: 'Only localhost connections allowed' };
    }
    
    return { safe: true };
  } catch (e) {
    return { safe: false, error: 'Invalid URL' };
  }
}

function isPrototypePollutionSafe(obj) {
  if (typeof obj !== 'object' || obj === null) return true;
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(obj)) {
    if (dangerousKeys.includes(key)) return false;
  }
  return true;
}

function sanitizeString(str, maxLength = 1000) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[\x00-\x1F\x7F]/g, '');
}

class OpenClawClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.gatewayUrl = options.gatewayUrl || 'http://127.0.0.1:3002';
    this.token = options.token || '';
    this.timeout = Math.min(options.timeout || 120000, 300000);
    this.retries = Math.min(options.retries || 3, 5);
    
    const urlCheck = isUrlSafe(this.gatewayUrl);
    if (!urlCheck.safe) {
      throw new Error(`Unsafe gateway URL: ${urlCheck.error}`);
    }
    
    this.connected = false;
    this.models = [];
    this.providers = new Map();
  }
  
  getUrl(path) {
    const base = this.gatewayUrl.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }
  
  async request(method, path, data = null, options = {}) {
    const url = new URL(this.getUrl(path));
    
    const urlCheck = isUrlSafe(url.toString());
    if (!urlCheck.safe) {
      throw new Error(`Unsafe request URL: ${urlCheck.error}`);
    }
    
    if (data) {
      const dataStr = JSON.stringify(data);
      if (Buffer.byteLength(dataStr) > MAX_REQUEST_SIZE) {
        throw new Error('Request body too large');
      }
    }
    
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    
    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sanitizeString(this.token, 200)}`,
        'X-Request-ID': `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
      },
      timeout: Math.min(options.timeout || this.timeout, 300000)
    };
    
    return new Promise((resolve, reject) => {
      const req = transport.request(url, requestOptions, (res) => {
        let body = '';
        let bytesReceived = 0;
        
        res.on('data', (chunk) => {
          body += chunk;
          bytesReceived += chunk.length;
          
          if (bytesReceived > MAX_REQUEST_SIZE) {
            req.destroy();
            reject(new Error('Response body too large'));
            return;
          }
        });
        
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${json.error?.message || body}`));
            }
          } catch (e) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }
  
  async connect() {
    try {
      const result = await this.request('GET', '/v1/models');
      this.connected = true;
      this.emit('connected');
      return result;
    } catch (error) {
      this.connected = false;
      this.emit('error', error);
      throw error;
    }
  }
  
  async listModels() {
    const result = await this.request('GET', '/v1/models');
    this.models = result.data || [];
    return this.models;
  }
  
  async getModel(modelId) {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Invalid model ID');
    }
    const safeModelId = sanitizeString(modelId, 100);
    const models = await this.listModels();
    return models.find(m => m.id === safeModelId);
  }
  
  async chatCompletion(params, onChunk) {
    if (!isPrototypePollutionSafe(params)) {
      throw new Error('Invalid parameters: prototype pollution attempt');
    }
    
    const { model, messages, temperature = 0.7, max_tokens, stream = true } = params;
    
    if (!model || typeof model !== 'string') {
      throw new Error('Missing or invalid model parameter');
    }
    
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Missing or invalid messages parameter');
    }
    
    if (temperature < 0 || temperature > 2) {
      throw new Error('Temperature must be between 0 and 2');
    }
    
    if (max_tokens && (max_tokens < 1 || max_tokens > 32000)) {
      throw new Error('max_tokens must be between 1 and 32000');
    }
    
    const data = {
      model: sanitizeString(model, 100),
      messages: messages.slice(0, 100),
      temperature: Math.max(0, Math.min(2, temperature)),
      max_tokens: max_tokens ? Math.max(1, Math.min(32000, max_tokens)) : undefined,
      stream
    };
    
    if (stream && onChunk) {
      return this.streamChatCompletion(data, onChunk);
    }
    
    const result = await this.request('POST', '/v1/chat/completions', data);
    return result;
  }
  
  async streamChatCompletion(data, onChunk) {
    if (!isPrototypePollutionSafe(data)) {
      throw new Error('Invalid parameters: prototype pollution attempt');
    }
    
    const url = new URL(this.getUrl('/v1/chat/completions'));
    
    const urlCheck = isUrlSafe(url.toString());
    if (!urlCheck.safe) {
      throw new Error(`Unsafe request URL: ${urlCheck.error}`);
    }
    
    const postData = JSON.stringify(data);
    
    if (Buffer.byteLength(postData) > MAX_REQUEST_SIZE) {
      throw new Error('Request body too large');
    }
    
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    
    return new Promise((resolve, reject) => {
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sanitizeString(this.token, 200)}`,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: this.timeout
      };
      
      const req = transport.request(url, options, (res) => {
        let buffer = '';
        let bytesReceived = 0;
        
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          bytesReceived += chunk.length;
          
          if (bytesReceived > MAX_REQUEST_SIZE * 10) {
            req.destroy();
            reject(new Error('Response too large'));
            return;
          }
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                resolve({ done: true });
                return;
              }
              try {
                const parsed = JSON.parse(data);
                onChunk(parsed);
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        });
        
        res.on('end', () => {
          resolve({ done: true });
        });
        
        res.on('error', reject);
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Stream timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }
  
  async generate(prompt, options = {}) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Invalid prompt');
    }
    
    const messages = [{ role: 'user', content: sanitizeString(prompt, 50000) }];
    const result = await this.chatCompletion({
      model: options.model || 'deepseek-web/deepseek-chat',
      messages,
      temperature: Math.max(0, Math.min(2, options.temperature || 0.7)),
      max_tokens: options.max_tokens ? Math.max(1, Math.min(32000, options.max_tokens)) : undefined
    }, null);
    
    return result.choices?.[0]?.message?.content || '';
  }
  
  async switchModel(modelId) {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Invalid model ID');
    }
    
    const safeModelId = sanitizeString(modelId, 100);
    const model = await this.getModel(safeModelId);
    if (!model) {
      throw new Error(`Model not found: ${safeModelId}`);
    }
    return model;
  }
  
  async listProviders() {
    const models = await this.listModels();
    const providers = new Map();
    
    for (const model of models) {
      const provider = (model.id.split('/')[0] || '').toLowerCase();
      if (!provider) continue;
      
      if (!providers.has(provider)) {
        providers.set(provider, {
          id: provider,
          models: []
        });
      }
      providers.get(provider).models.push(model);
    }
    
    this.providers = providers;
    return Array.from(providers.values());
  }
  
  async healthCheck() {
    try {
      const start = Date.now();
      await this.request('GET', '/health');
      const latency = Date.now() - start;
      return { healthy: true, latency };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
  
  disconnect() {
    this.connected = false;
    this.emit('disconnected');
  }
}

function createOpenClawClient(options = {}) {
  return new OpenClawClient(options);
}

let defaultClient = null;

function getOpenClawClient(options) {
  if (!defaultClient) {
    defaultClient = new OpenClawClient(options);
  }
  return defaultClient;
}

module.exports = { 
  OpenClawClient, 
  createOpenClawClient, 
  getOpenClawClient,
  isUrlSafe,
  isPrototypePollutionSafe,
  sanitizeString
};
