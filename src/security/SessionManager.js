/**
 * SessionManager - 会话管理服务
 * 提供会话存储、过期管理、并发控制、跨设备同步
 */

const crypto = require('crypto');

class SessionManager {
  constructor(options = {}) {
    this.store = new Map();
    this.defaultTTL = options.defaultTTL || 24 * 60 * 60 * 1000; // 24小时
    this.maxSessions = options.maxSessions || 10;
    this.cleanupInterval = options.cleanupInterval || 60 * 60 * 1000; // 1小时
    
    // 启动定期清理
    this.startCleanup();
  }
  
  // 创建会话
  create(sessionId, data, ttl = this.defaultTTL) {
    const session = {
      id: sessionId,
      data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + ttl,
      version: 1,
      locked: false,
      lockUntil: null
    };
    
    // 检查最大会话数限制
    this.enforceMaxSessions(session.data.userId);
    
    this.store.set(sessionId, session);
    return session;
  }
  
  // 获取会话
  get(sessionId, extend = true) {
    const session = this.store.get(sessionId);
    if (!session) return null;
    
    // 检查过期
    if (Date.now() > session.expiresAt) {
      this.store.delete(sessionId);
      return null;
    }
    
    // 延长过期时间
    if (extend) {
      session.expiresAt = Date.now() + this.defaultTTL;
      session.updatedAt = Date.now();
    }
    
    return session;
  }
  
  // 设置会话数据
  set(sessionId, key, value) {
    const session = this.get(sessionId, false);
    if (!session) return false;
    
    session.data[key] = value;
    session.updatedAt = Date.now();
    session.version++;
    
    return true;
  }
  
  // 获取会话数据
  getData(sessionId, key) {
    const session = this.get(sessionId, false);
    if (!session) return null;
    
    return key ? session.data[key] : session.data;
  }
  
  // 删除会话
  destroy(sessionId) {
    return this.store.delete(sessionId);
  }
  
  // 销毁用户所有会话
  destroyUserSessions(userId) {
    let count = 0;
    for (const [id, session] of this.store) {
      if (session.data.userId === userId) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }
  
  // 刷新会话
  refresh(sessionId, ttl = this.defaultTTL) {
    const session = this.store.get(sessionId);
    if (!session) return false;
    
    session.expiresAt = Date.now() + ttl;
    session.updatedAt = Date.now();
    return true;
  }
  
  // 会话锁定
  lock(sessionId, duration = 30000) {
    const session = this.store.get(sessionId);
    if (!session) return false;
    
    session.locked = true;
    session.lockUntil = Date.now() + duration;
    return true;
  }
  
  // 会话解锁
  unlock(sessionId) {
    const session = this.store.get(sessionId);
    if (!session) return false;
    
    session.locked = false;
    session.lockUntil = null;
    return true;
  }
  
  // 检查锁定状态
  checkLock(sessionId) {
    const session = this.store.get(sessionId);
    if (!session) return { locked: false };
    
    if (session.locked && session.lockUntil && Date.now() > session.lockUntil) {
      session.locked = false;
      session.lockUntil = null;
      return { locked: false };
    }
    
    return { 
      locked: session.locked, 
      remaining: session.locked ? Math.ceil((session.lockUntil - Date.now()) / 1000) : 0 
    };
  }
  
  // 获取用户会话
  getUserSessions(userId) {
    return Array.from(this.store.values())
      .filter(s => s.data.userId === userId && Date.now() <= s.expiresAt)
      .map(s => ({
        id: s.id,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        expiresAt: s.expiresAt,
        version: s.version
      }));
  }
  
  // 会话数量
  get size() {
    return this.store.size;
  }
  
  // 强制执行最大会话数限制
  enforceMaxSessions(userId) {
    const userSessions = this.getUserSessions(userId);
    
    if (userSessions.length >= this.maxSessions) {
      // 找到最早过期的会话
      const oldest = userSessions
        .sort((a, b) => a.expiresAt - b.expiresAt)[0];
      
      if (oldest) {
        this.store.delete(oldest.id);
      }
    }
  }
  
  // 清理过期会话
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, session] of this.store) {
      if (now > session.expiresAt || (session.locked && session.lockUntil && now > session.lockUntil)) {
        this.store.delete(id);
        cleaned++;
      }
    }
    
    return cleaned;
  }
  
  // 启动定期清理
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const cleaned = this.cleanup();
      if (cleaned > 0) {
        console.log(`[SessionManager] Cleaned ${cleaned} expired sessions`);
      }
    }, this.cleanupInterval);
  }
  
  // 停止清理
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
  
  // 生成会话 ID
  generateSessionId() {
    return crypto.randomUUID();
  }
  
  // 导出所有会话 (调试用)
  exportSessions() {
    return Array.from(this.store.values()).map(s => ({
      id: s.id,
      userId: s.data?.userId,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      version: s.version
    }));
  }
}

const sessionManager = new SessionManager();

module.exports = { SessionManager, sessionManager };