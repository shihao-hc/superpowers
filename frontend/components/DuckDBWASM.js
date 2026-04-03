/**
 * DuckDB WASM 本地数据库 - Browser-Inline Database
 * 
 * 功能:
 * - 纯浏览器内SQL数据库
 * - 支持Parquet/CSV/Arrow数据导入
 * - OPFS持久化存储
 * - 向量化查询执行
 * 
 * 基于 duckdb/duckdb-wasm 设计
 */

class DuckDBWASM {
  constructor(options = {}) {
    this.options = {
      // 数据目录
      dataDir: options.dataDir || 'avatar_data',
      // 启用OPFS持久化
      enablePersistence: options.enablePersistence !== false,
      // 内存限制(MB)
      memoryLimit: options.memoryLimit || 4096,
      // 日志级别
      logLevel: options.logLevel || 'warn',
      // 回调
      onReady: options.onReady || null,
      onError: options.onError || null,
      onQuery: options.onQuery || null
    };

    this.db = null;
    this.conn = null;
    this.worker = null;
    this.logger = null;
    this.isReady = false;

    // 查询历史
    this.queryHistory = [];
    this.maxHistorySize = 100;

    // 统计数据
    this.stats = {
      totalQueries: 0,
      avgQueryTime: 0,
      totalDataProcessed: 0
    };
  }

  /**
   * 初始化DuckDB WASM
   */
  async init() {
    try {
      // 动态导入DuckDB WASM
      const duckdb = await import('@duckdb/duckdb-wasm');
      
      // 获取WASM bundles
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      // 创建Web Worker
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      );
      this.worker = new Worker(workerUrl);

      // 创建数据库实例
      this.logger = new duckdb.ConsoleLogger(this.options.logLevel);
      this.db = new duckdb.AsyncDuckDB(this.logger, this.worker);

      // 初始化
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      
      // 如果支持OPFS，设置持久化
      if (this.options.enablePersistence && await this._supportsOPFS()) {
        await this._initOPFS();
      }

      // 创建连接
      this.conn = await this.db.connect();
      this.isReady = true;

      // 创建默认表
      await this._createDefaultTables();

      if (this.options.onReady) {
        this.options.onReady(this);
      }

      this._emit('ready', { message: 'DuckDB WASM initialized' });
      return true;

    } catch (error) {
      console.error('[DuckDBWASM] Init error:', error);
      if (this.options.onError) {
        this.options.onError(error);
      }
      throw error;
    }
  }

  /**
   * 检查是否支持OPFS
   */
  async _supportsOPFS() {
    return 'storage' in navigator && 'getDirectory' in navigator.storage;
  }

  /**
   * 初始化OPFS持久化
   */
  async _initOPFS() {
    try {
      const opfsRoot = await navigator.storage.getDirectory();
      
      // 创建数据目录
      const dataDir = await opfsRoot.getDirectoryHandle(this.options.dataDir, { create: true });
      
      // 打开数据库
      await this.db.open({
        path: `${this.options.dataDir}/duckdb.db`,
        accessMode: duckdb.DuckDBAccessMode.READ_WRITE
      });

      // 设置WAL自动检查点
      await this.conn.query(`SET wal_autocheckpoint = '0KB'`);
      
      this._emit('persistence:enabled', { path: this.options.dataDir });
    } catch (error) {
      console.warn('[DuckDBWASM] OPFS not available, using memory-only mode');
    }
  }

  /**
   * 创建默认表
   */
  async _createDefaultTables() {
    // 对话历史表
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS conversation_history (
        id INTEGER PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        role VARCHAR(20),
        content TEXT,
        metadata JSON
      )
    `);

    // 记忆表
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY,
        type VARCHAR(50),
        content TEXT,
        embedding BLOB,
        importance FLOAT DEFAULT 0.5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 1
      )
    `);

    // 情绪历史表
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS emotion_history (
        id INTEGER PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        emotion VARCHAR(50),
        intensity FLOAT,
        trigger TEXT,
        context TEXT
      )
    `);

    // 用户偏好表
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`);
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC)`);
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_conversation_timestamp ON conversation_history(timestamp DESC)`);
  }

  /**
   * 执行查询
   */
  async query(sql, params = []) {
    if (!this.isReady) {
      throw new Error('Database not initialized');
    }

    const startTime = performance.now();
    
    try {
      let result;
      
      if (params.length > 0) {
        // 参数化查询
        const stmt = await this.conn.prepare(sql);
        result = await stmt.query(...params);
      } else {
        result = await this.conn.query(sql);
      }

      const queryTime = performance.now() - startTime;
      const rows = result.toArray().map(row => ({ ...row }));
      
      // 更新统计
      this.stats.totalQueries++;
      this.stats.avgQueryTime = (this.stats.avgQueryTime * (this.stats.totalQueries - 1) + queryTime) / this.stats.totalQueries;
      this.stats.totalDataProcessed += JSON.stringify(rows).length;

      // 添加到历史
      this._addToHistory(sql, queryTime, rows.length);

      if (this.options.onQuery) {
        this.options.onQuery({ sql, queryTime, rowCount: rows.length });
      }

      return {
        success: true,
        data: rows,
        metadata: {
          queryTime,
          rowCount: rows.length,
          columns: result.schema.fields.map(f => f.name)
        }
      };

    } catch (error) {
      console.error('[DuckDBWASM] Query error:', error);
      return {
        success: false,
        error: error.message,
        sql
      };
    }
  }

  /**
   * 流式查询(大数据集)
   */
  async *queryStream(sql, batchSize = 1000) {
    if (!this.isReady) {
      throw new Error('Database not initialized');
    }

    const startTime = performance.now();
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const paginatedSQL = `${sql} LIMIT ${batchSize} OFFSET ${offset}`;
      const result = await this.conn.query(paginatedSQL);
      const rows = result.toArray().map(row => ({ ...row }));

      if (rows.length === 0) {
        hasMore = false;
      } else {
        yield {
          rows,
          metadata: {
            offset,
            batchSize,
            totalSoFar: offset + rows.length
          }
        };
        offset += batchSize;
      }
    }
  }

  /**
   * 导入CSV数据
   */
  async importCSV(file, tableName, options = {}) {
    const {
      header = true,
      delimiter = ',',
      skipRows = 0
    } = options;

    try {
      // 注册文件
      await this.conn.registerFile(file.name, file);
      
      // 创建表
      await this.conn.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} AS
        SELECT * FROM read_csv_auto('${file.name}',
          header = ${header},
          delim = '${delimiter}',
          skip_rows = ${skipRows}
        )
      `);

      return { success: true, tableName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 导入Parquet数据
   */
  async importParquet(url, tableName) {
    try {
      await this.conn.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} AS
        SELECT * FROM read_parquet('${url}')
      `);

      const result = await this.query(`SELECT count(*) as count FROM ${tableName}`);
      
      return {
        success: true,
        tableName,
        rowCount: result.data[0]?.count || 0
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 导入Arrow数据
   */
  async importArrow(arrowTable, tableName) {
    try {
      await this.conn.insertArrowTable(arrowTable, { name: tableName });
      return { success: true, tableName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 导出数据为JSON
   */
  async exportJSON(tableName, whereClause = '') {
    const sql = `SELECT * FROM ${tableName}${whereClause ? ' WHERE ' + whereClause : ''}`;
    const result = await this.query(sql);
    return result.success ? JSON.stringify(result.data, null, 2) : null;
  }

  /**
   * 导出数据为CSV
   */
  async exportCSV(tableName, whereClause = '') {
    const sql = `SELECT * FROM ${tableName}${whereClause ? ' WHERE ' + whereClause : ''}`;
    const result = await this.query(sql);
    
    if (!result.success) return null;

    const headers = result.metadata.columns;
    const rows = result.data.map(row => 
      headers.map(h => JSON.stringify(row[h] ?? '')).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  }

  // ============ 记忆系统接口 ============

  /**
   * 添加记忆
   */
  async addMemory(content, type = 'general', importance = 0.5) {
    const result = await this.query(`
      INSERT INTO memories (type, content, importance)
      VALUES ('${type}', '${this._escapeString(content)}', ${importance})
      RETURNING id
    `);
    return result.success ? result.data[0] : null;
  }

  /**
   * 搜索记忆(关键词)
   */
  async searchMemories(keyword, type = null, limit = 10) {
    const typeCondition = type ? `AND type = '${type}'` : '';
    const result = await this.query(`
      SELECT * FROM memories
      WHERE content LIKE '%${keyword}%' ${typeCondition}
      ORDER BY importance DESC, accessed_at DESC
      LIMIT ${limit}
    `);
    return result.data;
  }

  /**
   * 语义搜索记忆
   */
  async semanticSearchMemories(query, limit = 5) {
    // 简单的关键词匹配 + 重要性排序
    const keywords = query.toLowerCase().split(/\s+/);
    const keywordConditions = keywords.map(k => `content LIKE '%${k}%'`).join(' OR ');
    
    const result = await this.query(`
      SELECT *,
        (${keywords.length} + importance * 2) as relevance_score
      FROM memories
      WHERE ${keywordConditions}
      ORDER BY relevance_score DESC, accessed_at DESC
      LIMIT ${limit}
    `);
    
    // 更新访问时间
    for (const row of result.data) {
      await this.query(`UPDATE memories SET accessed_at = CURRENT_TIMESTAMP, access_count = access_count + 1 WHERE id = ${row.id}`);
    }
    
    return result.data;
  }

  /**
   * 获取上下文记忆
   */
  async getContextMemory(topic, limit = 5) {
    const result = await this.query(`
      SELECT * FROM memories
      WHERE content LIKE '%${topic}%'
      ORDER BY accessed_at DESC, importance DESC
      LIMIT ${limit}
    `);
    return result.data;
  }

  /**
   * 添加对话历史
   */
  async addConversation(role, content, metadata = {}) {
    const metaJson = JSON.stringify(metadata).replace(/'/g, "''");
    const result = await this.query(`
      INSERT INTO conversation_history (role, content, metadata)
      VALUES ('${role}', '${this._escapeString(content)}', '${metaJson}')
      RETURNING id
    `);
    return result.success ? result.data[0] : null;
  }

  /**
   * 获取对话历史
   */
  async getConversationHistory(limit = 50) {
    const result = await this.query(`
      SELECT * FROM conversation_history
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `);
    return result.data.reverse();
  }

  /**
   * 添加情绪记录
   */
  async addEmotion(emotion, intensity, trigger = '', context = '') {
    const result = await this.query(`
      INSERT INTO emotion_history (emotion, intensity, trigger, context)
      VALUES ('${emotion}', ${intensity}, '${this._escapeString(trigger)}', '${this._escapeString(context)}')
      RETURNING id
    `);
    return result.success ? result.data[0] : null;
  }

  /**
   * 获取情绪趋势
   */
  async getEmotionTrend(hours = 24) {
    const result = await this.query(`
      SELECT 
        emotion,
        avg(intensity) as avg_intensity,
        count(*) as count
      FROM emotion_history
      WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
      GROUP BY emotion
      ORDER BY count DESC
    `);
    return result.data;
  }

  // ============ 工具方法 ============

  /**
   * 转义SQL字符串
   */
  _escapeString(str) {
    return String(str).replace(/'/g, "''").replace(/\n/g, '\\n');
  }

  /**
   * 添加查询历史
   */
  _addToHistory(sql, queryTime, rowCount) {
    this.queryHistory.push({
      sql,
      queryTime,
      rowCount,
      timestamp: Date.now()
    });

    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift();
    }
  }

  /**
   * 发送事件
   */
  _emit(event, data) {
    if (this.options.onReady && event === 'ready') return; // 已在init中处理
    console.log(`[DuckDBWASM] ${event}:`, data);
  }

  /**
   * 获取统计
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 获取查询历史
   */
  getQueryHistory() {
    return [...this.queryHistory];
  }

  /**
   * 关闭数据库
   */
  async close() {
    if (this.conn) {
      await this.conn.close();
    }
    if (this.db) {
      await this.db.terminate();
    }
    if (this.worker) {
      this.worker.terminate();
    }
    this.isReady = false;
  }

  /**
   * 备份数据库
   */
  async backup() {
    const tables = ['conversation_history', 'memories', 'emotion_history', 'user_preferences'];
    const backup = {};

    for (const table of tables) {
      const result = await this.query(`SELECT * FROM ${table}`);
      if (result.success) {
        backup[table] = result.data;
      }
    }

    return JSON.stringify(backup, null, 2);
  }

  /**
   * 恢复数据
   */
  async restore(jsonData) {
    let backup;
    try {
      backup = JSON.parse(jsonData);
    } catch (error) {
      console.error('[DuckDB] JSON解析失败:', error.message);
      throw new Error('无效的JSON数据');
    }

    for (const [table, rows] of Object.entries(backup)) {
      await this.query(`DELETE FROM ${table}`);
      
      for (const row of rows) {
        const columns = Object.keys(row).filter(k => k !== 'id');
        const values = columns.map(c => {
          const val = row[c];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'string') return `'${this._escapeString(val)}'`;
          return JSON.stringify(val);
        });
        
        await this.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.join(',')})`);
      }
    }
  }
}

// 工厂函数
async function createDuckDBWASM(options = {}) {
  const db = new DuckDBWASM(options);
  await db.init();
  return db;
}

if (typeof window !== 'undefined') {
  window.DuckDBWASM = DuckDBWASM;
  window.createDuckDBWASM = createDuckDBWASM;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DuckDBWASM, createDuckDBWASM };
}
