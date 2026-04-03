/**
 * UltraWork AI 数据库集成模块
 * 支持MongoDB和PostgreSQL
 */

const config = require('../config');

// ============ MongoDB集成 ============

class MongoDBConnection {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
  }
  
  async connect() {
    try {
      // 这里需要安装mongodb驱动
      // npm install mongodb
      const { MongoClient } = require('mongodb');
      
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
      const dbName = process.env.MONGODB_DB || 'ultrawork';
      
      this.client = new MongoClient(uri);
      await this.client.connect();
      
      this.db = this.client.db(dbName);
      this.isConnected = true;
      
      console.log('[MongoDB] 连接成功');
      return this.db;
    } catch (error) {
      console.error('[MongoDB] 连接失败:', error.message);
      throw error;
    }
  }
  
  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('[MongoDB] 连接已关闭');
    }
  }
  
  getDb() {
    return this.db;
  }
  
  getCollection(name) {
    if (!this.db) {
      throw new Error('MongoDB未连接');
    }
    return this.db.collection(name);
  }
}

// ============ PostgreSQL集成 ============

class PostgreSQLConnection {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }
  
  async connect() {
    try {
      // 这里需要安装pg驱动
      // npm install pg
      const { Pool } = require('pg');
      
      this.pool = new Pool({
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT) || 5432,
        database: process.env.PG_DATABASE || 'ultrawork',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
      
      // 测试连接
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      console.log('[PostgreSQL] 连接成功');
      return this.pool;
    } catch (error) {
      console.error('[PostgreSQL] 连接失败:', error.message);
      throw error;
    }
  }
  
  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('[PostgreSQL] 连接已关闭');
    }
  }
  
  getPool() {
    return this.pool;
  }
  
  async query(text, params) {
    if (!this.pool) {
      throw new Error('PostgreSQL未连接');
    }
    return this.pool.query(text, params);
  }
}

// ============ 数据库管理器 ============

class DatabaseManager {
  constructor() {
    this.mongodb = new MongoDBConnection();
    this.postgresql = new PostgreSQLConnection();
    this.activeDB = null;
  }
  
  async initialize(dbType = 'mongodb') {
    try {
      if (dbType === 'mongodb') {
        await this.mongodb.connect();
        this.activeDB = this.mongodb;
      } else if (dbType === 'postgresql') {
        await this.postgresql.connect();
        this.activeDB = this.postgresql;
      } else {
        throw new Error(`不支持的数据库类型: ${dbType}`);
      }
      
      console.log(`[Database] 使用 ${dbType} 数据库`);
      return this.activeDB;
    } catch (error) {
      console.error('[Database] 初始化失败:', error.message);
      throw error;
    }
  }
  
  async shutdown() {
    await this.mongodb.disconnect();
    await this.postgresql.disconnect();
  }
  
  getActiveDB() {
    return this.activeDB;
  }
}

// ============ 数据库模型 ============

// MongoDB模型
const MongoModels = {
  // 用户模型
  User: {
    collection: 'users',
    schema: {
      _id: 'ObjectId',
      username: 'String',
      email: 'String',
      password: 'String',
      createdAt: 'Date',
      updatedAt: 'Date'
    }
  },
  
  // 消息模型
  Message: {
    collection: 'messages',
    schema: {
      _id: 'ObjectId',
      userId: 'String',
      role: 'String', // 'user' or 'assistant'
      content: 'String',
      personality: 'String',
      timestamp: 'Date',
      metadata: 'Object'
    }
  },
  
  // 会话模型
  Conversation: {
    collection: 'conversations',
    schema: {
      _id: 'ObjectId',
      userId: 'String',
      personality: 'String',
      messages: 'Array',
      createdAt: 'Date',
      lastActivity: 'Date'
    }
  }
};

// PostgreSQL表结构
const PostgreSQLSchema = `
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  personality VARCHAR(50),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB
);

-- 会话表
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  personality VARCHAR(50),
  messages JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
`;

// ============ 导出 ============

module.exports = {
  MongoDBConnection,
  PostgreSQLConnection,
  DatabaseManager,
  MongoModels,
  PostgreSQLSchema
};