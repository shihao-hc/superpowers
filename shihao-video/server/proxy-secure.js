/**
 * 拾号-影视 CORS代理服务 - 安全加固版
 * 处理跨域请求，代理转发到影视资源站
 * 
 * 安全改进：
 * 1. URL白名单验证，防止SSRF攻击
 * 2. 请求大小限制，防止内存耗尽
 * 3. 速率限制，防止滥用
 * 4. 安全的错误处理，避免信息泄露
 * 5. 更严格的CORS配置
 */

const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// 安全配置
const SECURITY_CONFIG = {
  // 允许的域名白名单（正则表达式）
  ALLOWED_HOSTS: [
    /\.com$/i,      // .com域名
    /\.net$/i,      // .net域名
    /\.org$/i,      // .org域名
    /\.cn$/i,       // .cn域名
    /\.cc$/i,       // .cc域名
    /\.tv$/i,       // .tv域名
    /\.io$/i,       // .io域名
    /\.me$/i,       // .me域名
    /\.vip$/i,      // .vip域名
  ],
  
  // 禁止访问的IP和网段（防止SSRF攻击）
  BLOCKED_IPS: [
    /^127\./,           // 本地回环
    /^10\./,            // 私有网络A类
    /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 私有网络B类
    /^192\.168\./,      // 私有网络C类
    /^169\.254\./,      // 链路本地
    /^::1$/,            // IPv6本地回环
    /^fc/,              // IPv6唯一本地地址
    /^fd/,              // IPv6唯一本地地址
  ],
  
  // 请求限制
  MAX_REQUEST_SIZE: 5 * 1024 * 1024,  // 5MB
  MAX_RESPONSE_SIZE: 10 * 1024 * 1024, // 10MB
  REQUEST_TIMEOUT: 15000,              // 15秒
  
  // 速率限制
  RATE_LIMIT: {
    windowMs: 60 * 1000,    // 1分钟
    max: 100,                // 每分钟最多100个请求
  }
};

// 速率限制存储
const requestCounts = new Map();

// 清理过期的速率限制记录
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (now - value.startTime > SECURITY_CONFIG.RATE_LIMIT.windowMs) {
      requestCounts.delete(key);
    }
  }
}, 60000);

// 速率限制中间件
function rateLimit(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts.has(clientIP)) {
    requestCounts.set(clientIP, { count: 1, startTime: now });
    return next();
  }
  
  const record = requestCounts.get(clientIP);
  
  if (now - record.startTime > SECURITY_CONFIG.RATE_LIMIT.windowMs) {
    // 重置计数
    record.count = 1;
    record.startTime = now;
    return next();
  }
  
  if (record.count >= SECURITY_CONFIG.RATE_LIMIT.max) {
    return res.status(429).json({ 
      error: '请求过于频繁，请稍后再试',
      retryAfter: Math.ceil((record.startTime + SECURITY_CONFIG.RATE_LIMIT.windowMs - now) / 1000)
    });
  }
  
  record.count++;
  next();
}

// URL验证函数
function validateUrl(targetUrl) {
  try {
    const parsedUrl = new URL(targetUrl);
    
    // 只允许HTTP和HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, reason: '只支持HTTP和HTTPS协议' };
    }
    
    // 检查是否为IP地址
    const hostname = parsedUrl.hostname;
    
    // 检查是否为禁止访问的IP
    for (const blocked of SECURITY_CONFIG.BLOCKED_IPS) {
      if (blocked.test(hostname)) {
        return { valid: false, reason: '不允许访问内部网络' };
      }
    }
    
    // 检查域名白名单
    let isAllowed = false;
    for (const pattern of SECURITY_CONFIG.ALLOWED_HOSTS) {
      if (pattern.test(hostname)) {
        isAllowed = true;
        break;
      }
    }
    
    if (!isAllowed) {
      return { valid: false, reason: '域名不在允许列表中' };
    }
    
    return { valid: true, parsedUrl };
  } catch (err) {
    return { valid: false, reason: 'URL格式错误' };
  }
}

// 安全的错误响应（不泄露敏感信息）
function sendSafeError(res, statusCode, message) {
  const safeMessages = {
    400: '请求参数错误',
    404: '资源未找到',
    429: '请求过于频繁',
    500: '服务器内部错误',
    502: '代理请求失败',
    504: '请求超时'
  };
  
  res.status(statusCode).json({ 
    error: safeMessages[statusCode] || message || '未知错误'
  });
}

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// 解析JSON（带大小限制）
app.use(express.json({ limit: '1mb' }));

// 设置安全的CORS头
app.use((req, res, next) => {
  // 只允许本地开发和生产环境的来源
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    ['http://localhost:3000', 'http://127.0.0.1:3000'];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !origin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 应用速率限制
app.use(rateLimit);

/**
 * 代理请求处理 - 安全版
 * GET /proxy?url=目标URL
 */
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return sendSafeError(res, 400, '缺少目标URL参数');
  }
  
  // 验证URL
  const validation = validateUrl(targetUrl);
  if (!validation.valid) {
    return sendSafeError(res, 400, validation.reason);
  }
  
  const parsedUrl = validation.parsedUrl;
  const isHttps = parsedUrl.protocol === 'https:';
  const httpModule = isHttps ? https : http;
  
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'identity',
      'Connection': 'close'
    },
    timeout: SECURITY_CONFIG.REQUEST_TIMEOUT,
    // 限制响应大小
    maxResponseSize: SECURITY_CONFIG.MAX_RESPONSE_SIZE
  };
  
  const proxyReq = httpModule.request(options, (proxyRes) => {
    let data = '';
    let size = 0;
    
    proxyRes.on('data', (chunk) => {
      size += chunk.length;
      
      // 检查响应大小
      if (size > SECURITY_CONFIG.MAX_RESPONSE_SIZE) {
        proxyReq.destroy();
        return sendSafeError(res, 413, '响应数据过大');
      }
      
      data += chunk;
    });
    
    proxyRes.on('end', () => {
      // 设置安全的响应头
      res.header('Content-Type', 'application/json; charset=utf-8');
      res.header('Cache-Control', 'max-age=300');
      res.header('X-Content-Type-Options', 'nosniff');
      
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (e) {
        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.send(data);
      }
    });
  });
  
  proxyReq.on('error', (err) => {
    console.error('代理请求错误:', err.message);
    sendSafeError(res, 502, '代理请求失败');
  });
  
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    sendSafeError(res, 504, '请求超时');
  });
  
  proxyReq.end();
});

/**
 * 获取视频详情 - 安全版
 * GET /detail?url=目标URL
 */
app.get('/detail', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return sendSafeError(res, 400, '缺少目标URL参数');
  }
  
  // 验证URL
  const validation = validateUrl(targetUrl);
  if (!validation.valid) {
    return sendSafeError(res, 400, validation.reason);
  }
  
  const parsedUrl = validation.parsedUrl;
  const isHttps = parsedUrl.protocol === 'https:';
  const httpModule = isHttps ? https : http;
  
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'identity',
      'Connection': 'close'
    },
    timeout: 20000
  };
  
  const proxyReq = httpModule.request(options, (proxyRes) => {
    let data = '';
    let size = 0;
    
    proxyRes.on('data', (chunk) => {
      size += chunk.length;
      
      if (size > SECURITY_CONFIG.MAX_RESPONSE_SIZE) {
        proxyReq.destroy();
        return sendSafeError(res, 413, '响应数据过大');
      }
      
      data += chunk;
    });
    
    proxyRes.on('end', () => {
      res.header('Content-Type', 'application/json; charset=utf-8');
      res.header('Cache-Control', 'max-age=600');
      res.header('X-Content-Type-Options', 'nosniff');
      
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (e) {
        res.header('Content-Type', 'text/plain; charset=utf-8');
        res.send(data);
      }
    });
  });
  
  proxyReq.on('error', (err) => {
    console.error('详情请求错误:', err.message);
    sendSafeError(res, 502, '详情请求失败');
  });
  
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    sendSafeError(res, 504, '请求超时');
  });
  
  proxyReq.end();
});

/**
 * 图片代理 - 安全版
 * GET /image?url=图片URL
 */
app.get('/image', (req, res) => {
  const imageUrl = req.query.url;
  
  if (!imageUrl) {
    return res.status(400).send('缺少图片URL');
  }
  
  // 验证URL
  const validation = validateUrl(imageUrl);
  if (!validation.valid) {
    return res.status(400).send('无效的图片URL');
  }
  
  const parsedUrl = validation.parsedUrl;
  const isHttps = parsedUrl.protocol === 'https:';
  const httpModule = isHttps ? https : http;
  
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Encoding': 'identity',
      'Connection': 'close'
    },
    timeout: 10000
  };
  
  const proxyReq = httpModule.request(options, (proxyRes) => {
    // 只代理图片类型
    const contentType = proxyRes.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
      return res.status(400).send('不是有效的图片');
    }
    
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    console.error('图片代理错误:', err.message);
    res.status(502).send('图片加载失败');
  });
  
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.status(504).send('图片加载超时');
  });
  
  proxyReq.end();
});

/**
 * 测试数据源连接 - 安全版
 * POST /test-source
 */
app.post('/test-source', (req, res) => {
  const { apiUrl } = req.body;
  
  if (!apiUrl) {
    return sendSafeError(res, 400, '缺少apiUrl参数');
  }
  
  // 验证URL
  const validation = validateUrl(apiUrl);
  if (!validation.valid) {
    return sendSafeError(res, 400, validation.reason);
  }
  
  const parsedUrl = validation.parsedUrl;
  const isHttps = parsedUrl.protocol === 'https:';
  const httpModule = isHttps ? https : http;
  
  const testUrl = `${apiUrl}?ac=list&pg=1`;
  
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search + '?ac=list&pg=1',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Connection': 'close'
    },
    timeout: 10000
  };
  
  const testReq = httpModule.request(options, (testRes) => {
    let data = '';
    
    testRes.on('data', (chunk) => {
      data += chunk;
    });
    
    testRes.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.code === 1) {
          res.json({ 
            success: true, 
            message: '连接成功',
            classCount: jsonData.class ? jsonData.class.length : 0,
            totalCount: jsonData.total || 0
          });
        } else {
          res.json({ 
            success: false, 
            message: '接口返回异常'
          });
        }
      } catch (e) {
        res.json({ 
          success: false, 
          message: '无法解析JSON响应'
        });
      }
    });
  });
  
  testReq.on('error', (err) => {
    res.json({ 
      success: false, 
      message: '连接失败'
    });
  });
  
  testReq.on('timeout', () => {
    testReq.destroy();
    res.json({ 
      success: false, 
      message: '连接超时'
    });
  });
  
  testReq.end();
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 详情页路由
app.get('/detail.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/detail.html'));
});

// 播放页路由
app.get('/player.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/player.html'));
});

// 配置页路由
app.get('/setting.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/setting.html'));
});

// 背景设置工具路由
app.get('/bg-setup.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/bg-setup.html'));
});

// 404处理
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../public/index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err.message);
  sendSafeError(res, 500, '服务器内部错误');
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║         拾号-影视 服务已启动 (安全加固版)        ║
║                                                  ║
║  本地访问: http://localhost:${PORT}               ║
║  健康检查: http://localhost:${PORT}/health        ║
║                                                  ║
║  安全特性:                                       ║
║  ✓ URL白名单验证                                 ║
║  ✓ 速率限制                                     ║
║  ✓ 请求大小限制                                  ║
║  ✓ SSRF防护                                     ║
║  ✓ 安全的CORS配置                                ║
║                                                  ║
║  按 Ctrl+C 停止服务                              ║
║                                                  ║
╚══════════════════════════════════════════════════╝
  `);
});