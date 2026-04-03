/**
 * MCP ThinkingChain Persistence - 思维链持久化与优化
 * 支持增量存储、快照机制、资源暴露
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class ThinkingChainStorage {
  constructor(config = {}) {
    this.storageDir = config.storageDir || path.join(os.homedir(), '.mcp', 'thinking');
    this.snapshotInterval = config.snapshotInterval || 50;
    this.maxChainLength = config.maxChainLength || 1000;
    
    this._ensureStorageDir();
  }

  _ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * 保存思维链（增量追加）
   */
  saveIncremental(chainId, step) {
    const chainFile = path.join(this.storageDir, `${chainId}.jsonl`);
    const stepLine = JSON.stringify({
      ...step,
      savedAt: new Date().toISOString()
    });
    
    fs.appendFileSync(chainFile, stepLine + '\n');
    return { success: true, file: chainFile };
  }

  /**
   * 加载思维链
   */
  loadIncremental(chainId) {
    const chainFile = path.join(this.storageDir, `${chainId}.jsonl`);
    
    if (!fs.existsSync(chainFile)) {
      return null;
    }

    const lines = fs.readFileSync(chainFile, 'utf-8').split('\n').filter(l => l.trim());
    return lines.map(l => JSON.parse(l));
  }

  /**
   * 创建快照
   */
  createSnapshot(chainId, chain) {
    const snapshotFile = path.join(this.storageDir, `${chainId}_snapshot_${Date.now()}.json`);
    const snapshot = {
      id: chainId,
      createdAt: new Date().toISOString(),
      type: 'snapshot',
      thoughts: chain.thoughts.slice(-this.snapshotInterval * 2),
      branches: chain.branches,
      metadata: chain.metadata
    };

    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
    return { success: true, file: snapshotFile, size: snapshot.thoughts.length };
  }

  /**
   * 获取最新快照
   */
  getLatestSnapshot(chainId) {
    const files = fs.readdirSync(this.storageDir)
      .filter(f => f.startsWith(`${chainId}_snapshot_`) && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const snapshotFile = path.join(this.storageDir, files[0]);
    return JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'));
  }

  /**
   * 删除思维链数据
   */
  deleteChain(chainId) {
    const chainFile = path.join(this.storageDir, `${chainId}.jsonl`);
    const snapshotFiles = fs.readdirSync(this.storageDir)
      .filter(f => f.startsWith(`${chainId}_snapshot_`));

    let deleted = 0;
    
    if (fs.existsSync(chainFile)) {
      fs.unlinkSync(chainFile);
      deleted++;
    }

    for (const file of snapshotFiles) {
      fs.unlinkSync(path.join(this.storageDir, file));
      deleted++;
    }

    return { success: true, deleted };
  }

  /**
   * 列出所有思维链
   */
  listChains() {
    const files = fs.readdirSync(this.storageDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const chainId = f.replace('.jsonl', '');
        const stats = fs.statSync(path.join(this.storageDir, f));
        return {
          chainId,
          file: f,
          size: stats.size,
          modified: stats.mtime,
          steps: fs.readFileSync(path.join(this.storageDir, f), 'utf-8').split('\n').filter(l => l.trim()).length
        };
      });

    return files.sort((a, b) => b.modified - a.modified);
  }
}

// 扩展 ThinkingChain
const { thinkingChain } = require('./ThinkingChain');
const storage = new ThinkingChainStorage();

const originalAddThought = thinkingChain.addThought.bind(thinkingChain);
thinkingChain.addThought = function(chainId, thought, options = {}) {
  const result = originalAddThought(chainId, thought, options);
  
  if (result) {
    try {
      storage.saveIncremental(chainId, result);
      
      const chain = thinkingChain.chains.get(chainId);
      if (chain && chain.thoughts.length % storage.snapshotInterval === 0) {
        storage.createSnapshot(chainId, chain);
      }
    } catch (error) {
      console.error('Failed to persist thought:', error);
    }
  }
  
  return result;
};

const originalCreateChain = thinkingChain.createChain.bind(thinkingChain);
thinkingChain.createChain = function(initialThought, metadata = {}) {
  const result = originalCreateChain(initialThought, metadata);
  
  if (result) {
    try {
      storage.saveIncremental(result.id, result.thoughts[0]);
    } catch (error) {
      console.error('Failed to persist chain:', error);
    }
  }
  
  return result;
};

const originalDeleteChain = thinkingChain.deleteChain.bind(thinkingChain);
thinkingChain.deleteChain = function(chainId) {
  try {
    storage.deleteChain(chainId);
  } catch (error) {
    console.error('Failed to delete chain storage:', error);
  }
  
  return originalDeleteChain(chainId);
};

thinkingChain.getStorage = () => storage;

thinkingChain.getStorageStats = () => {
  const chains = storage.listChains();
  const totalSize = chains.reduce((sum, c) => sum + c.size, 0);
  
  return {
    chains: chains.length,
    totalSize,
    totalSizeFormatted: formatSize(totalSize),
    snapshots: chains.filter(c => c.file.includes('snapshot')).length
  };
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  ThinkingChainStorage,
  thinkingChain
};
