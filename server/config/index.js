/**
 * UltraWork AI 服务器配置管理
 */

const path = require('path');
const crypto = require('crypto');

// 生成随机JWT密钥（如果环境变量未设置）
function generateSecureSecret() {
  return crypto.randomBytes(32).toString('hex');
}

// 默认配置
const defaultConfig = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    trustProxy: false,
    maxRequestSize: '10mb'
  },
  
  security: {
    jwtSecret: process.env.JWT_SECRET || generateSecureSecret(),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    jwtRefreshExpiresIn: '7d',
    corsOrigins: process.env.CORS_ORIGINS ? 
      process.env.CORS_ORIGINS.split(',') : 
      ['http://localhost:3000', 'http://127.0.0.1:3000']
  },
  
  rateLimit: {
    windowMs: 60000, // 1分钟
    max: {
      api: 100,
      chat: 30,
      memory: 20,
      auth: 5,
      sensitive: 10
    }
  },
  
  websocket: {
    pingTimeout: 60000,
    pingInterval: 25000,
    maxConnections: 1000,
    perIpLimit: 10
  },
  
  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    defaultModel: 'llama3.2',
    visionModel: 'llava',
    timeout: 30000
  },
  
  database: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: 0
    }
  },
  
  frontend: {
    staticPath: path.join(__dirname, '..', '..', 'frontend'),
    maxAge: '1d'
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty'
  }
};

// 合并环境配置
function mergeConfig(base, override) {
  const result = { ...base };
  
  for (const key in override) {
    if (override[key] !== undefined) {
      if (typeof override[key] === 'object' && !Array.isArray(override[key])) {
        result[key] = mergeConfig(base[key] || {}, override[key]);
      } else {
        result[key] = override[key];
      }
    }
  }
  
  return result;
}

// 配置存储
let config = { ...defaultConfig };

// 从环境变量加载
function loadFromEnv() {
  const envConfig = {
    server: {
      port: parseInt(process.env.PORT) || defaultConfig.server.port,
      host: process.env.HOST || defaultConfig.server.host,
      trustProxy: process.env.TRUST_PROXY === 'true'
    },
    security: {
      jwtSecret: process.env.JWT_SECRET
    }
  };
  
  config = mergeConfig(config, envConfig);
}

// 配置管理器
const configManager = {
  /**
   * 获取配置值
   */
  get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  },
  
  /**
   * 设置配置值
   */
  set(key, value) {
    const keys = key.split('.');
    let current = config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    current[keys[keys.length - 1]] = value;
  },
  
  /**
   * 获取所有配置
   */
  getAll() {
    return { ...config };
  },
  
  /**
   * 重置配置
   */
  reset() {
    config = { ...defaultConfig };
    loadFromEnv();
  },
  
  /**
   * 验证配置
   */
  validate() {
    const errors = [];
    
    // 验证必需的配置
    if (!config.security.jwtSecret || config.security.jwtSecret.length < 32) {
      if (process.env.NODE_ENV === 'production') {
        errors.push('JWT_SECRET必须在生产环境中设置且长度至少32位');
      }
    }
    
    if (config.server.port < 1 || config.server.port > 65535) {
      errors.push('服务器端口必须在1-65535之间');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};

// 初始化
loadFromEnv();

module.exports = configManager;