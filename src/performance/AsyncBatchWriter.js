const fs = require('fs');
const path = require('path');

class AsyncBatchWriter {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000;
    this.maxQueueSize = options.maxQueueSize || 10000;
    this.encoding = options.encoding || 'utf8';
    
    this.queue = [];
    this.writeStream = null;
    this.flushTimer = null;
    this.stats = {
      totalWritten: 0,
      batchesFlushed: 0,
      avgBatchSize: 0,
      totalFlushTime: 0,
      lastFlushTime: 0
    };
    this.isWriting = false;
    this._pendingWrites = 0;
  }

  setWriteStream(stream) {
    this.writeStream = stream;
  }

  setLogPath(logPath) {
    if (!logPath || typeof logPath !== 'string') {
      console.error('[AsyncBatchWriter] Invalid log path: must be a string');
      return false;
    }

    const normalizedPath = path.normalize(logPath);
    
    const normalizedDir = path.dirname(normalizedPath);
    const allowedBase = path.resolve(process.cwd(), 'logs');
    if (!normalizedDir.startsWith(allowedBase)) {
      console.error('[AsyncBatchWriter] Path traversal detected:', logPath);
      return false;
    }

    try {
      if (!fs.existsSync(normalizedDir)) {
        fs.mkdirSync(normalizedDir, { recursive: true });
      }
      
      if (this.writeStream) {
        this.writeStream.end();
      }
      
      this.writeStream = fs.createWriteStream(normalizedPath, { flags: 'a', encoding: this.encoding });
      
      this.writeStream.on('error', (err) => {
        console.error('[AsyncBatchWriter] Write error:', err.message);
      });
      
      return true;
    } catch (error) {
      console.error('[AsyncBatchWriter] Failed to set log path:', error.message);
      return false;
    }
  }

  add(data) {
    if (this.queue.length >= this.maxQueueSize) {
      console.warn('[AsyncBatchWriter] Queue full, forcing flush');
      this.flush(true);
      return false;
    }

    this.queue.push(data);
    
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
    
    return true;
  }

  async flush(force = false) {
    if (this.isWriting && !force) {
      return 0;
    }

    if (this.queue.length === 0) {
      return 0;
    }

    this.isWriting = true;
    const startTime = Date.now();
    const itemsToWrite = this.queue.splice(0, this.batchSize);
    
    try {
      if (this.writeStream) {
        const lines = itemsToWrite.map(item => JSON.stringify(item)).join('\n') + '\n';
        
        await new Promise((resolve, reject) => {
          this._pendingWrites++;
          
          const canWrite = this.writeStream.write(lines);
          
          if (canWrite) {
            this._pendingWrites--;
            resolve();
          } else {
            this.writeStream.once('drain', () => {
              this._pendingWrites--;
              resolve();
            });
          }
        });
      }

      this.stats.totalWritten += itemsToWrite.length;
      this.stats.batchesFlushed++;
      this.stats.lastFlushTime = Date.now() - startTime;
      this.stats.totalFlushTime += this.stats.lastFlushTime;
      this.stats.avgBatchSize = this.stats.totalWritten / this.stats.batchesFlushed;

      return itemsToWrite.length;
    } catch (error) {
      console.error('[AsyncBatchWriter] Flush error:', error.message);
      this.queue.unshift(...itemsToWrite);
      return 0;
    } finally {
      this.isWriting = false;
    }
  }

  startAutoFlush() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
    
    this.flushTimer.unref();
  }

  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async close() {
    this.stopAutoFlush();
    await this.flush(true);
    
    if (this.writeStream) {
      await new Promise((resolve) => {
        this.writeStream.end(resolve);
      });
      this.writeStream = null;
    }
  }

  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.length,
      pendingWrites: this._pendingWrites,
      isWriting: this.isWriting
    };
  }

  clear() {
    this.queue = [];
  }

  getQueueSize() {
    return this.queue.length;
  }
}

class BufferedAuditWriter extends AsyncBatchWriter {
  constructor(options = {}) {
    super({
      batchSize: options.auditBatchSize || 100,
      flushInterval: options.auditFlushInterval || 5000,
      maxQueueSize: options.auditMaxMemoryEntries || 10000,
      ...options
    });
    
    this.retentionDays = options.retentionDays || 30;
    this.compressionEnabled = options.compressionEnabled || false;
    this.encryptionKey = options.encryptionKey || null;
    this.currentDate = this._getDateStr();
  }

  _getDateStr() {
    return new Date().toISOString().substring(0, 10);
  }

  _encrypt(data) {
    if (!this.encryptionKey) return data;
    
    const crypto = require('crypto');
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      iv: iv.toString('hex'),
      data: encrypted,
      tag: cipher.getAuthTag().toString('hex')
    };
  }

  async writeEntry(entryData) {
    const entry = {
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      ...entryData
    };

    const dataToWrite = this.encryptionKey 
      ? this._encrypt(entry) 
      : entry;

    return this.add(dataToWrite);
  }

  rotateLogFile() {
    const dateStr = this._getDateStr();
    
    if (dateStr === this.currentDate) {
      return null;
    }

    this.currentDate = dateStr;
    const logPath = `logs/mcp-audit-${dateStr}.jsonl`;
    
    this.setLogPath(logPath);
    
    return logPath;
  }

  cleanupOldFiles(dir = 'logs') {
    try {
      if (!fs.existsSync(dir)) return;
      
      const maxAge = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
      
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith('mcp-audit-') && f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: path.join(dir, f),
          mtime: fs.statSync(path.join(dir, f)).mtime
        }))
        .filter(f => f.mtime.getTime() < maxAge);
      
      for (const file of files) {
        fs.unlinkSync(file.path);
        console.log(`[BufferedAuditWriter] Deleted expired log: ${file.name}`);
      }
      
      return files.length;
    } catch (error) {
      console.error('[BufferedAuditWriter] Cleanup error:', error.message);
      return 0;
    }
  }
}

module.exports = { AsyncBatchWriter, BufferedAuditWriter };
