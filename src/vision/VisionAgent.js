const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const dns = require('dns').promises;

const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0',
  '::1', '::',
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.azure.com'
];

const BLOCKED_IPS = [
  '127.0.0.1', '0.0.0.0', '::1', '::'
];

class VisionAgent {
  constructor(options = {}) {
    this.ollamaHost = options.ollamaHost || 'http://localhost:11434';
    this.model = options.model || 'llava';
    this.fallbackModel = options.fallbackModel || 'moondream';
    this.enabled = false;
    this.lastVisionResult = null;
    this.allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    this.maxFileSize = 10 * 1024 * 1024;
  }

  async _isUrlBlocked(url) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      
      if (BLOCKED_HOSTS.includes(hostname)) {
        return true;
      }
      
      if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)) return true;
      if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
      
      const ip = await dns.lookup(hostname).catch(() => null);
      if (ip && BLOCKED_IPS.includes(ip.address)) {
        return true;
      }
      
      return false;
    } catch {
      return true;
    }
  }

  async checkAvailable() {
    try {
      const models = await this._request('/api/tags', 'GET');
      const hasVision = models.models?.some(m => 
        ['llava', 'moondream', 'bakllava', 'llava-llama3'].includes(m.name)
      );
      this.enabled = hasVision;
      return hasVision;
    } catch (err) {
      this.enabled = false;
      return false;
    }
  }

  _validateLocalPath(filePath) {
    const normalized = path.normalize(filePath);
    const forbidden = ['.env', '.git', 'node_modules', '.ssh', '.config'];
    const normalizedLower = normalized.toLowerCase();
    
    for (const dir of forbidden) {
      if (normalizedLower.includes(path.sep + dir.toLowerCase() + path.sep) || 
          normalizedLower.endsWith(path.sep + dir.toLowerCase())) {
        return false;
      }
    }
    
    const stats = fs.statSync(normalized);
    if (stats.size > this.maxFileSize) {
      return false;
    }
    
    return true;
  }

  async analyzeImage(imagePath, question = '描述这张图片') {
    if (!this.enabled) {
      const available = await this.checkAvailable();
      if (!available) {
        return { ok: false, error: 'Vision model not available' };
      }
    }

    try {
      let imageBase64;
      
      if (imagePath.startsWith('data:')) {
        imageBase64 = imagePath;
      } else if (fs.existsSync(imagePath)) {
        if (!this._validateLocalPath(imagePath)) {
          return { ok: false, error: 'Access denied: path not allowed' };
        }
        const imageBuffer = fs.readFileSync(imagePath);
        imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      } else if (/^https?:\/\//.test(imagePath)) {
        if (await this._isUrlBlocked(imagePath)) {
          return { ok: false, error: 'URL not allowed (SSRF protection)' };
        }
        imageBase64 = await this._downloadAndEncode(imagePath);
      } else {
        return { ok: false, error: 'Invalid image path or URL' };
      }

      const model = await this._getVisionModel();
      
      const result = await this._request('/api/generate', 'POST', {
        model: model,
        prompt: question,
        images: [imageBase64],
        stream: false
      });

      this.lastVisionResult = {
        description: result.response,
        model: model,
        timestamp: new Date().toISOString()
      };

      return {
        ok: true,
        description: result.response,
        model: model
      };
    } catch (err) {
      console.error('[VisionAgent] Analysis failed:', err.message);
      return { ok: false, error: err.message };
    }
  }

  async analyzeBase64(imageBase64, question = '描述这张图片') {
    if (!this.enabled) {
      await this.checkAvailable();
    }

    try {
      const model = await this._getVisionModel();
      
      const result = await this._request('/api/generate', 'POST', {
        model: model,
        prompt: question,
        images: [imageBase64],
        stream: false
      });

      return {
        ok: true,
        description: result.response,
        model: model
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async detectObjects(imagePath) {
    return this.analyzeImage(imagePath, 
      '列出图中所有可识别的物体，用逗号分隔'
    );
  }

  async readText(imagePath) {
    return this.analyzeImage(imagePath, 
      '如果图中有文字，请识别并输出所有文字内容'
    );
  }

  async analyzeGameScreen(imagePath) {
    return this.analyzeImage(imagePath, 
      `这是一个游戏截图。请分析:
1. 游戏类型
2. 当前游戏状态
3. 玩家位置/状态
4. 周围环境
5. 建议的行动`
    );
  }

  async _getVisionModel() {
    try {
      const models = await this._request('/api/tags', 'GET');
      
      const visionModels = ['bakllava:latest', 'llava:latest', 'llava:7b', 'moondream:latest'];
      
      for (const model of visionModels) {
        if (models.models?.some(m => m.name === model || m.name === model.replace(':latest', ''))) {
          return model;
        }
      }
      
      return this.fallbackModel;
    } catch {
      return this.fallbackModel;
    }
  }

  async _downloadAndEncode(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      
      client.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const mime = res.headers['content-type'] || 'image/jpeg';
          resolve(`data:${mime};base64,${buffer.toString('base64')}`);
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  _request(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.ollamaHost);
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const client = url.protocol === 'https:' ? https : http;
      
      const req = client.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString());
            resolve(data);
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  getStatus() {
    return {
      enabled: this.enabled,
      model: this.model,
      lastResult: this.lastVisionResult
    };
  }
}

module.exports = VisionAgent;
