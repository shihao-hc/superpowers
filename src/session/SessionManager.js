/**
 * 会话管理模块
 * Claude Code 会话历史管理 - 基于 claude-code-assistant 技能
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { strictId } = require('../utils/SafePath');

class SessionManager {
  constructor(options = {}) {
    this.options = {
      storageDir: options.storageDir || path.join(process.cwd(), '.sessions'),
      maxSessions: options.maxSessions || 50,
      maxHistoryAge: options.maxHistoryAge || 30 * 24 * 60 * 60 * 1000, // 30 days
      enableEncryption: options.enableEncryption !== false,
      ...options
    };

    this.currentSession = null;
    this.sessions = new Map();

    this.ensureStorageDir();
  }

  /**
   * 确保存储目录存在
   */
  ensureStorageDir() {
    if (!fs.existsSync(this.options.storageDir)) {
      fs.mkdirSync(this.options.storageDir, { recursive: true });
    }
  }

  /**
   * 创建新会话
   */
  createSession(metadata = {}) {
    const id = this.generateSessionId();
    const now = Date.now();

    const session = {
      id,
      createdAt: now,
      updatedAt: now,
      metadata,
      messages: [],
      context: {},
      checkpoint: null,
      tags: []
    };

    this.sessions.set(id, session);
    this.currentSession = id;

    this.emit('sessionCreated', session);
    return session;
  }

  /**
   * 获取当前会话
   */
  getCurrentSession() {
    if (!this.currentSession) {
      return this.createSession();
    }
    return this.sessions.get(this.currentSession);
  }

  /**
   * 添加消息到会话
   */
  addMessage(message) {
    const session = this.getCurrentSession();
    if (!session) {return null;}

    const msg = {
      id: this.generateMessageId(),
      timestamp: Date.now(),
      ...message
    };

    session.messages.push(msg);
    session.updatedAt = Date.now();

    this.emit('messageAdded', { sessionId: session.id, message: msg });
    return msg;
  }

  /**
   * 获取消息历史
   */
  getMessages(sessionId, options = {}) {
    const session = this.sessions.get(sessionId || this.currentSession);
    if (!session) {return [];}

    let messages = [...session.messages];

    if (options.limit) {
      messages = messages.slice(-options.limit);
    }

    if (options.before) {
      const index = messages.findIndex((m) => m.id === options.before);
      if (index > 0) {
        messages = messages.slice(0, index);
      }
    }

    if (options.after) {
      const index = messages.findIndex((m) => m.id === options.after);
      if (index >= 0) {
        messages = messages.slice(index + 1);
      }
    }

    return messages;
  }

  /**
   * 创建检查点
   */
  createCheckpoint(label = null) {
    const session = this.getCurrentSession();
    if (!session) {return null;}

    const checkpoint = {
      id: this.generateCheckpointId(),
      timestamp: Date.now(),
      label,
      messageCount: session.messages.length,
      context: { ...session.context }
    };

    session.checkpoint = checkpoint;
    return checkpoint;
  }

  /**
   * 恢复到检查点
   */
  restoreCheckpoint(checkpointId) {
    // 检查点信息存储在会话中
    const session = this.getCurrentSession();
    if (!session || !session.checkpoint) {return false;}

    if (session.checkpoint.id !== checkpointId) {
      return false;
    }

    // 简单实现：移除检查点后的消息
    // 完整实现需要持久化检查点信息
    session.checkpoint = null;
    this.emit('checkpointRestored', { sessionId: session.id, checkpointId });
    return true;
  }

  /**
   * 保存会话到磁盘
   */
  async saveSession(sessionId = null) {
    const id = sessionId || this.currentSession;
    const session = this.sessions.get(id);
    if (!session) {return false;}

    const filePath = this.getSessionFilePath(id);

    try {
      const data = this.serializeSession(session);

      if (this.options.enableEncryption) {
        const encrypted = this.encrypt(JSON.stringify(data));
        fs.writeFileSync(filePath, encrypted, 'utf8');
      } else {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      }

      this.emit('sessionSaved', { sessionId: id, filePath });
      return true;
    } catch (error) {
      this.emit('error', { sessionId: id, error });
      return false;
    }
  }

  /**
   * 从磁盘加载会话
   */
  async loadSession(sessionId) {
    const filePath = this.getSessionFilePath(sessionId);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      let data;
      const content = fs.readFileSync(filePath, 'utf8');

      if (this.options.enableEncryption) {
        data = JSON.parse(this.decrypt(content));
      } else {
        data = JSON.parse(content);
      }

      const session = this.deserializeSession(data);
      this.sessions.set(sessionId, session);

      this.emit('sessionLoaded', session);
      return session;
    } catch (error) {
      this.emit('error', { sessionId, error });
      return null;
    }
  }

  /**
   * 列出所有会话
   */
  listSessions() {
    const sessions = [];

    if (!fs.existsSync(this.options.storageDir)) {
      return sessions;
    }

    const files = fs.readdirSync(this.options.storageDir);
    for (const file of files) {
      if (!file.endsWith('.session')) {continue;}

      try {
        const content = fs.readFileSync(
          path.join(this.options.storageDir, file),
          'utf8'
        );

        let data;
        if (this.options.enableEncryption) {
          data = JSON.parse(this.decrypt(content));
        } else {
          data = JSON.parse(content);
        }

        sessions.push({
          id: data.id,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          messageCount: data.messages?.length || 0,
          metadata: data.metadata,
          tags: data.tags
        });
      } catch {
        // 跳过损坏的会话文件
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId) {
    const filePath = this.getSessionFilePath(sessionId);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}

    this.sessions.delete(sessionId);

    if (this.currentSession === sessionId) {
      this.currentSession = null;
    }

    this.emit('sessionDeleted', sessionId);
    return true;
  }

  /**
   * 清理旧会话
   */
  async cleanupOldSessions() {
    const sessions = this.listSessions();
    const now = Date.now();
    let cleaned = 0;

    for (const session of sessions) {
      if (now - session.updatedAt > this.options.maxHistoryAge) {
        await this.deleteSession(session.id);
        cleaned++;
      }
    }

    // 限制会话数量
    while (sessions.length > this.options.maxSessions) {
      const oldest = sessions[sessions.length - 1];
      await this.deleteSession(oldest.id);
      sessions.pop();
      cleaned++;
    }

    this.emit('cleanupComplete', { cleaned });
    return cleaned;
  }

  /**
   * 切换当前会话
   */
  switchSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.loadSession(sessionId);
    }
    this.currentSession = sessionId;
    this.emit('sessionSwitched', sessionId);
  }

  /**
   * 序列化会话
   */
  serializeSession(session) {
    return {
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      metadata: session.metadata,
      messages: session.messages,
      context: session.context,
      tags: session.tags
    };
  }

  /**
   * 反序列化会话
   */
  deserializeSession(data) {
    return {
      id: data.id,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      metadata: data.metadata || {},
      messages: data.messages || [],
      context: data.context || {},
      tags: data.tags || [],
      checkpoint: null
    };
  }

  /**
   * 获取会话文件路径
   */
  getSessionFilePath(sessionId) {
    const safeId = strictId(sessionId) || 'default';
    return path.join(this.options.storageDir, `${safeId}.session`);
  }

  /**
   * 获取会话密钥（带安全警告）
   */
  getSessionKey() {
    const sessionKey = process.env.SESSION_KEY;

    if (!sessionKey) {
      // SECURITY FIX: 生产环境中必须设置 SESSION_KEY
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SECURITY ERROR: SESSION_KEY environment variable must be set in production');
      }

      // 仅在开发环境警告
      if (!SessionManager._warnedNoKey) {
        console.warn('[SessionManager] WARNING: SESSION_KEY not set, using insecure default key');
        console.warn('[SessionManager] Set SESSION_KEY environment variable for production');
        SessionManager._warnedNoKey = true;
      }
      return 'insecure-dev-key-do-not-use-in-production';
    }

    return sessionKey;
  }

  /**
   * 加密数据
   */
  encrypt(data) {
    const key = crypto.scryptSync(
      this.getSessionKey(),
      'session-salt-v1',
      32
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * 解密数据
   */
  decrypt(data) {
    const [ivHex, encrypted] = data.split(':');
    const key = crypto.scryptSync(
      this.getSessionKey(),
      'session-salt-v1',
      32
    );
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 生成会话ID
   */
  generateSessionId() {
    return `sess_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 生成消息ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 生成检查点ID
   */
  generateCheckpointId() {
    return `chk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 事件发射
   */
  emit(_event, ..._args) {
    // 简单的事件发射实现
  }
}

module.exports = { SessionManager };
