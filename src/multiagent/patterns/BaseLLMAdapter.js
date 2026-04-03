/**
 * BaseLLMAdapter - LLM统一适配器
 * 
 * 参考 TradingAgents-CN 的 LLM 适配器架构
 * 
 * 核心思想:
 * 1. 统一接口抽象 (BaseChatModel)
 * 2. 多提供商支持 (OpenAI, DeepSeek, Google, DashScope)
 * 3. 工厂方法创建实例
 * 4. 参数标准化
 */

const https = require('https');
const http = require('http');

class BaseLLMAdapter {
  constructor(config = {}) {
    this.config = {
      model: config.model || 'gpt-3.5-turbo',
      temperature: config.temperature ?? 0.7,
      max_tokens: config.max_tokens || 4096,
      timeout: config.timeout || 120000,
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      ...config
    };
    
    this.type = 'base';
  }
  
  async generate(messages, options = {}) {
    throw new Error('generate() must be implemented by subclass');
  }
  
  async chat(prompt, options = {}) {
    const messages = [
      { role: 'user', content: prompt }
    ];
    return this.generate(messages, options);
  }
  
  async stream(messages, onChunk, options = {}) {
    throw new Error('stream() must be implemented by subclass');
  }
  
  getType() {
    return this.type;
  }
  
  getConfig() {
    return { ...this.config };
  }
}

class OpenAIAdapter extends BaseLLMAdapter {
  constructor(config = {}) {
    super({
      model: config.model || 'gpt-3.5-turbo',
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      ...config
    });
    
    this.type = 'openai';
  }
  
  async generate(messages, options = {}) {
    const { model, temperature, max_tokens, timeout } = this.config;
    
    const body = {
      model,
      messages: this._formatMessages(messages),
      temperature: temperature ?? options.temperature ?? 0.7,
      max_tokens: options.max_tokens || max_tokens
    };
    
    const response = await this._request('/chat/completions', body, timeout);
    
    return this._parseResponse(response);
  }
  
  async stream(messages, onChunk, options = {}) {
    const { model, temperature, max_tokens, timeout } = this.config;
    
    const body = {
      model,
      messages: this._formatMessages(messages),
      temperature: temperature ?? options.temperature ?? 0.7,
      max_tokens: options.max_tokens || max_tokens,
      stream: true
    };
    
    await this._streamRequest('/chat/completions', body, timeout, onChunk);
  }
  
  _formatMessages(messages) {
    if (typeof messages === 'string') {
      return [{ role: 'user', content: messages }];
    }
    
    if (Array.isArray(messages)) {
      return messages.map(m => {
        if (typeof m === 'string') {
          return { role: 'user', content: m };
        }
        return {
          role: m.role || 'user',
          content: m.content || String(m)
        };
      });
    }
    
    return [{ role: 'user', content: String(messages) }];
  }
  
  async _request(endpoint, body, timeout) {
    const url = new URL(this.config.baseUrl + endpoint);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    
    return new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${json.error?.message || data}`));
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(JSON.stringify(body));
      req.end();
    });
  }
  
  async _streamRequest(endpoint, body, timeout, onChunk) {
    const url = new URL(this.config.baseUrl + endpoint);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    
    return new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        timeout
      }, (res) => {
        let buffer = '';
        
        res.on('data', chunk => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                resolve();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                onChunk(parsed);
              } catch {}
            }
          }
        });
        
        res.on('end', resolve);
        res.on('error', reject);
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Stream timeout'));
      });
      
      req.write(JSON.stringify(body));
      req.end();
    });
  }
  
  _parseResponse(response) {
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No response choices in LLM response');
    }
    
    return {
      content: choice.message?.content || '',
      reasoning: choice.message?.reasoning || '',
      finishReason: choice.finish_reason,
      usage: response.usage,
      model: response.model
    };
  }
}

class DeepSeekAdapter extends OpenAIAdapter {
  constructor(config = {}) {
    super({
      model: config.model || 'deepseek-chat',
      baseUrl: config.baseUrl || 'https://api.deepseek.com/v1',
      ...config
    });
    
    this.type = 'deepseek';
  }
}

class GoogleAdapter extends OpenAIAdapter {
  constructor(config = {}) {
    super({
      model: config.model || 'gemini-pro',
      baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
      ...config
    });
    
    this.type = 'google';
  }
  
  _formatMessages(messages) {
    const formatted = super._formatMessages(messages);
    
    return formatted.map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }]
    }));
  }
  
  async _request(endpoint, body, timeout) {
    const url = new URL(this.config.baseUrl + endpoint);
    url.searchParams.set('key', this.config.apiKey);
    
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    
    const formattedBody = {
      contents: body.messages,
      generationConfig: {
        temperature: body.temperature,
        maxOutputTokens: body.max_tokens
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${json.error?.message || data}`));
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(JSON.stringify(formattedBody));
      req.end();
    });
  }
  
  _parseResponse(response) {
    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new Error('No response candidates in LLM response');
    }
    
    return {
      content: candidate.content?.parts?.[0]?.text || '',
      reasoning: '',
      finishReason: candidate.finishReason,
      usage: response.usageMetadata,
      model: this.config.model
    };
  }
}

class DashScopeAdapter extends OpenAIAdapter {
  constructor(config = {}) {
    super({
      model: config.model || 'qwen-turbo',
      baseUrl: config.baseUrl || 'https://dashscope.aliyuncs.com/api/v1',
      ...config
    });
    
    this.type = 'dashscope';
  }
  
  async _request(endpoint, body, timeout) {
    const isHttps = true;
    const transport = https;
    
    return new Promise((resolve, reject) => {
      const req = transport.request({
        hostname: 'dashscope.aliyuncs.com',
        port: 443,
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${json.error?.message || data}`));
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(JSON.stringify({
        model: body.model,
        input: { messages: body.messages },
        parameters: {
          temperature: body.temperature,
          max_tokens: body.max_tokens,
          result_format: 'message'
        }
      }));
      req.end();
    });
  }
  
  _parseResponse(response) {
    const output = response.output;
    if (!output) {
      throw new Error('No output in DashScope response');
    }
    
    return {
      content: output.choices?.[0]?.message?.content || '',
      reasoning: '',
      finishReason: output.choices?.[0]?.finish_reason,
      usage: response.usage,
      model: response.model
    };
  }
}

class OpenClawAdapter extends OpenAIAdapter {
  constructor(config = {}) {
    super({
      model: config.model || 'deepseek-web/deepseek-chat',
      baseUrl: config.baseUrl || 'http://127.0.0.1:3002',
      ...config
    });
    
    this.type = 'openclaw';
  }
}

function createLLMAdapter(provider, config = {}) {
  const providerLower = provider.toLowerCase();
  
  switch (providerLower) {
    case 'openai':
      return new OpenAIAdapter(config);
    
    case 'deepseek':
      return new DeepSeekAdapter(config);
    
    case 'google':
    case 'gemini':
      return new GoogleAdapter(config);
    
    case 'dashscope':
    case 'qwen':
    case 'alibaba':
      return new DashScopeAdapter(config);
    
    case 'openclaw':
      return new OpenClawAdapter(config);
    
    default:
      if (config.baseUrl) {
        return new OpenAIAdapter(config);
      }
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

module.exports = {
  BaseLLMAdapter,
  OpenAIAdapter,
  DeepSeekAdapter,
  GoogleAdapter,
  DashScopeAdapter,
  OpenClawAdapter,
  createLLMAdapter
};
