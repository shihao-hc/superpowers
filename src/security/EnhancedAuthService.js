/**
 * EnhancedAuthService - 增强认证服务
 * 支持多因素认证、会话管理、令牌刷新、登录保护
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class EnhancedAuthService {
  constructor(options = {}) {
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'default-secret-change-me';
    this.jwtExpiry = options.jwtExpiry || '24h';
    this.refreshExpiry = options.refreshExpiry || '7d';
    this.maxLoginAttempts = options.maxLoginAttempts || 5;
    this.lockoutDuration = options.lockoutDuration || 15 * 60 * 1000; // 15分钟
    
    // 登录尝试追踪
    this.loginAttempts = new Map();
    
    // 活跃会话
    this.activeSessions = new Map();
    
    // 令牌黑名单
    this.tokenBlacklist = new Set();
    
    // TOTP 密钥存储
    this.totpSecrets = new Map();
  }
  
  // 生成密码哈希
  hashPassword(password, salt = null) {
    const useSalt = salt || crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
    return { hash, salt: useSalt };
  }
  
  // 验证密码
  verifyPassword(password, hash, salt) {
    const { hash: computedHash } = this.hashPassword(password, salt);
    return computedHash === hash;
  }
  
  // 生成 TOTP 密钥
  generateTOTPSecret() {
    return crypto.randomBytes(20).toString('hex');
  }
  
  // 验证 TOTP 代码
  verifyTOTP(secret, code) {
    // 简化实现 - 实际应使用 speakeasy 库
    const expected = this.generateTOTPCode(secret);
    return code === expected || code === this.generateTOTPCode(secret, -1); // 允许前后一个时间窗口
  }
  
  // 生成 TOTP 代码
  generateTOTPCode(secret, offset = 0) {
    const time = Math.floor(Date.now() / 30000) + offset;
    const hmac = crypto.createHmac('sha1', secret);
    hmac.update(time.toString());
    const hash = hmac.digest('hex');
    const offset2 = parseInt(hash.slice(-1), 16) & 0xf;
    const code = parseInt(hash.slice(offset2 * 2, offset2 * 2 + 8), 16) % 1000000;
    return code.toString().padStart(6, '0');
  }
  
  // 生成 JWT 令牌
  generateToken(payload, options = {}) {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: options.refresh ? this.refreshExpiry : this.jwtExpiry,
      issuer: 'ultrawork-ai',
      ...options
    });
  }
  
  // 验证 JWT 令牌
  verifyToken(token) {
    try {
      // 检查黑名单
      if (this.tokenBlacklist.has(token)) {
        return { valid: false, error: 'Token has been revoked' };
      }
      
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'ultrawork-ai'
      });
      
      return { valid: true, payload: decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
  
  // 刷新令牌
  refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret, {
        issuer: 'ultrawork-ai'
      });
      
      if (!decoded.refresh) {
        return { success: false, error: 'Not a refresh token' };
      }
      
      // 生成新令牌
      const newToken = this.generateToken({ userId: decoded.userId });
      const newRefreshToken = this.generateToken({ 
        userId: decoded.userId, 
        refresh: true 
      }, { refresh: true });
      
      return { success: true, token: newToken, refreshToken: newRefreshToken };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // 撤销令牌
  revokeToken(token) {
    this.tokenBlacklist.add(token);
    return true;
  }
  
  // 追踪登录尝试
  trackLoginAttempt(identifier) {
    const attempts = this.loginAttempts.get(identifier) || { count: 0, firstAttempt: Date.now(), locked: false };
    
    attempts.count++;
    attempts.lastAttempt = Date.now();
    
    // 检查是否需要锁定
    if (attempts.count >= this.maxLoginAttempts) {
      attempts.locked = true;
      attempts.lockedUntil = Date.now() + this.lockoutDuration;
    }
    
    this.loginAttempts.set(identifier, attempts);
    
    return {
      attempts: attempts.count,
      remaining: Math.max(0, this.maxLoginAttempts - attempts.count),
      locked: attempts.locked
    };
  }
  
  // 检查登录锁定
  checkLoginLock(identifier) {
    const attempts = this.loginAttempts.get(identifier);
    if (!attempts || !attempts.locked) return { locked: false };
    
    if (Date.now() > attempts.lockedUntil) {
      attempts.locked = false;
      attempts.count = 0;
      this.loginAttempts.set(identifier, attempts);
      return { locked: false };
    }
    
    return { 
      locked: true, 
      remaining: Math.ceil((attempts.lockedUntil - Date.now()) / 1000) 
    };
  }
  
  // 清除登录尝试
  clearLoginAttempts(identifier) {
    this.loginAttempts.delete(identifier);
  }
  
  // 创建会话
  createSession(userId, metadata = {}) {
    const sessionId = crypto.randomUUID();
    const session = {
      id: sessionId,
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      metadata,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24小时
    };
    
    this.activeSessions.set(sessionId, session);
    return session;
  }
  
  // 获取会话
  getSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;
    
    // 检查过期
    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      return null;
    }
    
    // 更新最后活动
    session.lastActivity = Date.now();
    return session;
  }
  
  // 销毁会话
  destroySession(sessionId) {
    return this.activeSessions.delete(sessionId);
  }
  
  // 获取用户会话
  getUserSessions(userId) {
    return Array.from(this.activeSessions.values())
      .filter(s => s.userId === userId);
  }
  
  // 清理过期会话
  cleanupSessions() {
    const now = Date.now();
    for (const [id, session] of this.activeSessions) {
      if (now > session.expiresAt) {
        this.activeSessions.delete(id);
      }
    }
  }
  
  // 生成安全的随机令牌
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
  
  // 生成 API 密钥
  generateAPIKey(userId, name) {
    const key = `uw_${this.generateSecureToken(48)}`;
    const apiKey = {
      key,
      userId,
      name,
      createdAt: Date.now(),
      lastUsed: null,
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1年
    };
    
    return apiKey;
  }
  
  // 验证 API 密钥
  verifyAPIKey(key, apiKeys) {
    const apiKey = apiKeys.find(k => k.key === key);
    if (!apiKey) return { valid: false };
    
    if (Date.now() > apiKey.expiresAt) {
      return { valid: false, error: 'API key expired' };
    }
    
    apiKey.lastUsed = Date.now();
    return { valid: true, userId: apiKey.userId, apiKey };
  }
}

const authService = new EnhancedAuthService();

module.exports = { EnhancedAuthService, authService };