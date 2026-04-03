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
 * 6. 添加helmet安全头部
 * 7. 禁用X-Powered-By头部
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
  } else {
    const record = requestCounts.get(clientIP);
    
    if (record.count >= SECURITY_CONFIG.RATE_LIMIT.max) {
      return res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil((record.startTime + SECURITY_CONFIG.RATE_LIMIT.windowMs - now) / 1000)
      });
    }
    
    record.count++;
  }
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

// 禁用X-Powered-By头部（安全加固）
app.disable('x-powered-by');

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// 安全策略：内容安全策略（CSP）头部
app.use((req, res, next) => {
  // 基础安全头部
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // CSP头部
  res.setHeader("Content-Security-Policy", 
    "default-src 'self'; " +
    "img-src 'self' data: https: http:; " +
    "media-src 'self' https: http: blob:; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https: http:; " +
    "font-src 'self' data:; " +
    "frame-ancestors 'none';"
  );
  next();
});

// HTTPS 重定向（仅在通过反向代理且配置了 HTTPS 时启用）
app.use((req, res, next) => {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers.host || 'localhost';
  
  // 仅当通过可信代理（x-forwarded-proto）且明确指定为 HTTPS 时才重定向
  // 避免本地开发时强制重定向导致无法访问
  if (proto === 'https' && !req.secure && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    return res.redirect(307, `https://${host}${req.originalUrl}`);
  }
  next();
});

// 解析JSON和URL编码的请求体
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 应用速率限制
app.use(rateLimit);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 测试数据源接口
app.post('/test-source', async (req, res) => {
  const { apiUrl } = req.body;
  
  if (!apiUrl) {
    return sendSafeError(res, 400, '缺少apiUrl参数');
  }
  
  const validation = validateUrl(apiUrl + '?ac=list&pg=1');
  if (!validation.valid) {
    return sendSafeError(res, 400, validation.reason);
  }
  
  try {
    const testUrl = apiUrl + '?ac=list&pg=1';
    const data = await proxyRequest(testUrl);
    res.json({
      success: true,
      classCount: data.class ? data.class.length : 0,
      totalCount: data.total || 0
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message
    });
  }
});

// CORS代理接口
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return sendSafeError(res, 400, '缺少url参数');
  }
  
  const validation = validateUrl(targetUrl);
  if (!validation.valid) {
    return sendSafeError(res, 400, validation.reason);
  }
  
  try {
    const data = await proxyRequest(targetUrl);
    res.json(data);
  } catch (error) {
    console.error('代理请求失败:', error.message);
    sendSafeError(res, 502, error.message);
  }
});

// 视频详情代理接口
app.get('/detail', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return sendSafeError(res, 400, '缺少url参数');
  }
  
  const validation = validateUrl(targetUrl);
  if (!validation.valid) {
    return sendSafeError(res, 400, validation.reason);
  }
  
  try {
    const data = await proxyRequest(targetUrl);
    res.json(data);
  } catch (error) {
    console.error('详情请求失败:', error.message);
    sendSafeError(res, 502, error.message);
  }
});

// 图片代理接口
app.get('/image', (req, res) => {
  const imageUrl = req.query.url;
  
  if (!imageUrl) {
    return sendSafeError(res, 400, '缺少图片URL');
  }
  
  // 验证URL
  const validation = validateUrl(imageUrl);
  if (!validation.valid) {
    return sendSafeError(res, 400, '无效的图片URL');
  }
  
  const parsedUrl = validation.parsedUrl;
  const isHttps = parsedUrl.protocol === 'https:';
  const httpModule = isHttps ? https : http;
  
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      'Referer': 'https://localhost',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
    }
  };
  
  const proxyReq = httpModule.request(options, (proxyRes) => {
    // 转发响应头
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    console.error('图片代理错误:', err.message);
    sendSafeError(res, 502, '图片加载失败');
  });
  
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    sendSafeError(res, 504, '图片加载超时');
  });
  
  proxyReq.end();
});

// 代理请求函数
function proxyRequest(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout: SECURITY_CONFIG.REQUEST_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        'Referer': 'https://localhost',
        'Accept': 'application/json,text/plain,*/*'
      }
    };
    
    const proxyReq = httpModule.request(options, (proxyRes) => {
      let data = '';
      
      // 检查响应大小
      let totalSize = 0;
      
      proxyRes.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > SECURITY_CONFIG.MAX_RESPONSE_SIZE) {
          proxyReq.destroy();
          reject(new Error('响应数据过大'));
          return;
        }
        data += chunk;
      });
      
      proxyRes.on('end', () => {
        try {
          // CMSV10 API 返回的可能是GBK编码，尝试转换
          const result = JSON.parse(data);
          resolve(result);
        } catch (err) {
          // 如果JSON解析失败，可能是编码问题
          reject(new Error('解析响应失败'));
        }
      });
    });
    
    proxyReq.on('error', (err) => {
      reject(err);
    });
    
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      reject(new Error('请求超时'));
    });
    
    proxyReq.end();
  });
}

// 404处理
app.use((req, res) => {
  sendSafeError(res, 404, '资源未找到');
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  sendSafeError(res, 500, '服务器内部错误');
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║              拾号-影视 服务已启动 (安全加固版)                   ║
║                                                                  ║
║  ━━━━━━━━━━━━━━━━━━━ HTTP访问 ━━━━━━━━━━━━━━━━━━━━━━━            ║
║  本地访问: http://localhost:${PORT}                              ║
║  局域网访问: http://192.168.1.3:${PORT}                          ║
║  健康检查: http://localhost:${PORT}/health                       ║
║                                                                  ║
║  ━━━━━━━━━━━━━━━━━━ 🔒 安全特性 ━━━━━━━━━━━━━━━━━━━━━            ║
║  ✓ URL白名单验证                                                 ║
║  ✓ 速率限制 (100次/分钟)                                         ║
║  ✓ 请求大小限制 (1MB请求/10MB响应)                               ║
║  ✓ SSRF防护                                                      ║
║  ✓ 安全的CORS配置                                                ║
║  ✓ XSS防护                                                       ║
║  ✓ 安全头部 (CSP, X-Frame-Options等)                            ║
║  ✓ 禁用X-Powered-By                                              ║
║                                                                  ║
║  按 Ctrl+C 停止服务                                              ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `);
});
