/**
 * UltraWork AI 统一日志模块
 * 使用winston提供结构化日志
 */

const winston = require('winston');
const path = require('path');

// 日志级别
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// 日志颜色
const LOG_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

// 自定义格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 控制台格式
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] ${level}: ${message} ${metaStr}`;
  })
);

// 创建日志目录
const logDir = path.join(__dirname, '..', '..', 'logs');

// 创建logger实例
const logger = winston.createLogger({
  levels: LOG_LEVELS,
  format: logFormat,
  transports: [
    // 错误日志
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // 所有日志
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // HTTP日志
    new winston.transports.File({
      filename: path.join(logDir, 'http.log'),
      level: 'http',
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ]
});

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// 添加颜色
winston.addColors(LOG_COLORS);

// 导出便捷方法
module.exports = {
  logger,
  
  // 错误日志
  error: (message, meta = {}) => {
    logger.error(message, meta);
  },
  
  // 警告日志
  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },
  
  // 信息日志
  info: (message, meta = {}) => {
    logger.info(message, meta);
  },
  
  // HTTP日志
  http: (message, meta = {}) => {
    logger.http(message, meta);
  },
  
  // 调试日志
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  },
  
  // 请求日志中间件
  requestLogger: (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.originalUrl || req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('user-agent')
      };
      
      if (res.statusCode >= 400) {
        logger.warn('Request failed', logData);
      } else if (duration > 1000) {
        logger.warn('Slow request', logData);
      } else {
        logger.http('Request completed', logData);
      }
    });
    
    next();
  },
  
  // 错误日志中间件
  errorLogger: (err, req, res, next) => {
    logger.error('Error occurred', {
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip
    });
    
    next(err);
  }
};