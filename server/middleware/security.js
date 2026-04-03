/**
 * UltraWork AI 安全加固中间件
 */

const crypto = require('crypto');

/**
 * 生成随机nonce用于CSP
 */
function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * 增强的CSP中间件
 */
function enhancedCSP(req, res, next) {
  const nonce = generateNonce();
  
  // 将nonce附加到请求对象
  res.locals.nonce = nonce;
  
  // 设置CSP头
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; '));
  
  next();
}

/**
 * 严格的输入验证中间件
 */
function strictInputValidation(req, res, next) {
  // 检查请求体大小
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 10 * 1024 * 1024) { // 10MB
    return res.status(413).json({ 
      error: '请求体过大',
      code: 'PAYLOAD_TOO_LARGE'
    });
  }
  
  // 检查Content-Type
  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      // 允许form-data用于文件上传
      if (!contentType.includes('multipart/form-data')) {
        return res.status(415).json({ 
          error: '不支持的Content-Type',
          code: 'UNSUPPORTED_MEDIA_TYPE'
        });
      }
    }
  }
  
  // 防止HTTP响应拆分
  if (req.url.includes('\r') || req.url.includes('\n')) {
    return res.status(400).json({ 
      error: '无效的URL',
      code: 'INVALID_URL'
    });
  }
  
  next();
}

/**
 * 安全响应头中间件
 */
function securityHeaders(req, res, next) {
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY');
  
  // 防止MIME类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // 启用XSS过滤
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // 严格传输安全
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // 引用策略
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // 权限策略
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
  
  // 隐藏服务器信息
  res.removeHeader('X-Powered-By');
  
  next();
}

/**
 * 请求ID中间件
 */
function requestId(req, res, next) {
  const id = crypto.randomBytes(16).toString('hex');
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

/**
 * 速率限制绕过检测
 */
function rateLimitBypassDetection(req, res, next) {
  // 检查常见的绕过尝试
  const suspiciousHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip'
  ];
  
  let ipCount = 0;
  for (const header of suspiciousHeaders) {
    if (req.headers[header]) {
      const ips = req.headers[header].split(',').map(ip => ip.trim());
      ipCount += ips.length;
    }
  }
  
  // 如果检测到多个IP头，可能是绕过尝试
  if (ipCount > 3) {
    console.warn('Rate limit bypass attempt detected', {
      ip: req.ip,
      headers: suspiciousHeaders.filter(h => req.headers[h])
    });
  }
  
  next();
}

/**
 * SQL注入检测
 */
function sqlInjectionDetection(req, res, next) {
  const sqlPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/gi,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/gi,
    /w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/gi,
    /((\%27)|(\'))union/gi,
    /exec(\s|\+)+(s|x)p\w+/gi,
    /UNION[\s\S]*SELECT/gi,
    /SELECT[\s\S]*FROM/gi,
    /INSERT[\s\S]*INTO/gi,
    /DELETE[\s\S]*FROM/gi,
    /DROP[\s\S]*TABLE/gi
  ];
  
  const checkValue = (value) => {
    if (typeof value !== 'string') return false;
    return sqlPatterns.some(pattern => pattern.test(value));
  };
  
  // 检查查询参数
  for (const key in req.query) {
    if (checkValue(req.query[key])) {
      console.warn('SQL injection attempt detected', {
        ip: req.ip,
        path: req.path,
        param: key
      });
      return res.status(400).json({ 
        error: '检测到可疑输入',
        code: 'SUSPICIOUS_INPUT'
      });
    }
  }
  
  // 检查请求体
  if (req.body && typeof req.body === 'object') {
    const checkObject = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string' && checkValue(obj[key])) {
          return true;
        }
        if (typeof obj[key] === 'object' && checkObject(obj[key])) {
          return true;
        }
      }
      return false;
    };
    
    if (checkObject(req.body)) {
      console.warn('SQL injection attempt detected', {
        ip: req.ip,
        path: req.path
      });
      return res.status(400).json({ 
        error: '检测到可疑输入',
        code: 'SUSPICIOUS_INPUT'
      });
    }
  }
  
  next();
}

/**
 * XSS检测
 */
function xssDetection(req, res, next) {
  const xssPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /<img[\s\S]*?onerror[\s\S]*?=/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[\s\S]*?>/gi,
    /<object[\s\S]*?>/gi,
    /<embed[\s\S]*?>/gi
  ];
  
  const checkValue = (value) => {
    if (typeof value !== 'string') return false;
    return xssPatterns.some(pattern => pattern.test(value));
  };
  
  // 检查查询参数
  for (const key in req.query) {
    if (checkValue(req.query[key])) {
      console.warn('XSS attempt detected', {
        ip: req.ip,
        path: req.path,
        param: key
      });
      return res.status(400).json({ 
        error: '检测到可疑输入',
        code: 'SUSPICIOUS_INPUT'
      });
    }
  }
  
  next();
}

/**
 * 路径遍历检测
 */
function pathTraversalDetection(req, res, next) {
  const pathPatterns = [
    /\.\.\//g,
    /\.\.\\/g,
    /%2e%2e%2f/gi,
    /%2e%2e\//g,
    /\.\.%2f/gi,
    /%2e%2e%5c/gi,
    /%2e%2e\\/g
  ];
  
  const checkValue = (value) => {
    if (typeof value !== 'string') return false;
    return pathPatterns.some(pattern => pattern.test(value));
  };
  
  // 检查URL
  if (checkValue(req.url)) {
    console.warn('Path traversal attempt detected', {
      ip: req.ip,
      path: req.path
    });
    return res.status(400).json({ 
      error: '无效的路径',
      code: 'INVALID_PATH'
    });
  }
  
  // 检查查询参数
  for (const key in req.query) {
    if (checkValue(req.query[key])) {
      console.warn('Path traversal attempt detected', {
        ip: req.ip,
        path: req.path,
        param: key
      });
      return res.status(400).json({ 
        error: '检测到可疑输入',
        code: 'SUSPICIOUS_INPUT'
      });
    }
  }
  
  next();
}

module.exports = {
  enhancedCSP,
  strictInputValidation,
  securityHeaders,
  requestId,
  rateLimitBypassDetection,
  sqlInjectionDetection,
  xssDetection,
  pathTraversalDetection,
  
  // 新增安全模块
  outputEncoder: require('../../src/security/OutputEncoder'),
  inputValidator: require('../../src/security/EnhancedInputValidator'),
  dependencyScanner: require('../../src/security/DependencyScanner')
};