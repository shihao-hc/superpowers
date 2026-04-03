/**
 * MCP DryRun History - 历史记录持久化
 * 将 dry-run 预览记录写入文件，支持查询和回滚
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class DryRunHistory {
  constructor(config = {}) {
    this.historyDir = config.historyDir || path.join(os.homedir(), '.mcp');
    this.historyFile = path.join(this.historyDir, 'dryrun_history.json');
    this.maxHistory = config.maxHistory || 1000;
    this.autoPersist = config.autoPersist !== false;
    
    this._ensureHistoryDir();
  }

  _ensureHistoryDir() {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
    if (!fs.existsSync(this.historyFile)) {
      fs.writeFileSync(this.historyFile, JSON.stringify({ entries: [], version: 1 }, null, 2));
    }
  }

  /**
   * 添加预览记录
   */
  add(entry) {
    const history = this._loadHistory();
    
    const record = {
      id: `dryrun_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      tool: entry.tool,
      params: entry.params,
      preview: entry.preview,
      executed: false,
      executedAt: null,
      executedResult: null
    };

    history.entries.unshift(record);
    
    if (history.entries.length > this.maxHistory) {
      history.entries = history.entries.slice(0, this.maxHistory);
    }

    if (this.autoPersist) {
      this._saveHistory(history);
    }

    return record;
  }

  /**
   * 标记为已执行
   */
  markExecuted(id, result = null) {
    const history = this._loadHistory();
    const entry = history.entries.find(e => e.id === id);
    
    if (entry) {
      entry.executed = true;
      entry.executedAt = new Date().toISOString();
      entry.executedResult = result;
      this._saveHistory(history);
    }

    return entry;
  }

  /**
   * 查询历史
   */
  query(options = {}) {
    const history = this._loadHistory();
    let entries = [...history.entries];

    if (options.tool) {
      entries = entries.filter(e => e.tool === options.tool);
    }
    if (options.executed !== undefined) {
      entries = entries.filter(e => e.executed === options.executed);
    }
    if (options.startDate) {
      entries = entries.filter(e => new Date(e.timestamp) >= new Date(options.startDate));
    }
    if (options.endDate) {
      entries = entries.filter(e => new Date(e.timestamp) <= new Date(options.endDate));
    }
    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * 获取统计
   */
  getStats() {
    const history = this._loadHistory();
    const total = history.entries.length;
    const executed = history.entries.filter(e => e.executed).length;
    const previewOnly = total - executed;

    const byTool = {};
    for (const entry of history.entries) {
      byTool[entry.tool] = (byTool[entry.tool] || 0) + 1;
    }

    return {
      total,
      executed,
      previewOnly,
      executedRate: total > 0 ? (executed / total * 100).toFixed(1) + '%' : '0%',
      byTool,
      lastEntry: history.entries[0] || null
    };
  }

  /**
   * 获取 MCP 资源 URI
   */
  toResource() {
    return {
      uri: 'dryrun://history',
      name: 'Dry-run History',
      description: 'Complete dry-run preview and execution history',
      mimeType: 'application/json',
      content: JSON.stringify(this._loadHistory(), null, 2)
    };
  }

  /**
   * 清除历史
   */
  clear() {
    this._saveHistory({ entries: [], version: 1 });
    return { success: true, cleared: true };
  }

  /**
   * 导出历史
   */
  export(format = 'json') {
    const history = this._loadHistory();
    
    if (format === 'json') {
      return JSON.stringify(history, null, 2);
    }
    
    if (format === 'csv') {
      const headers = ['id', 'timestamp', 'tool', 'executed', 'executedAt'];
      const rows = history.entries.map(e => 
        headers.map(h => e[h] || '').join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }

    return JSON.stringify(history);
  }

  _loadHistory() {
    try {
      return JSON.parse(fs.readFileSync(this.historyFile, 'utf-8'));
    } catch {
      return { entries: [], version: 1 };
    }
  }

  _saveHistory(history) {
    fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
  }
}

// 扩展 DryRunEngine
const { DryRunEngine } = require('./DryRunEngine');

const originalCheckDryRun = DryRunEngine.prototype.checkDryRun;
DryRunEngine.prototype.checkDryRun = function(params, toolName) {
  const isDryRun = originalCheckDryRun.call(this, params, toolName);
  
  if (isDryRun) {
    const history = new DryRunHistory();
    history.add({
      tool: toolName,
      params,
      preview: true
    });
  }
  
  return isDryRun;
};

const originalPreview = DryRunEngine.prototype.previewEdit;
DryRunEngine.prototype.previewEdit = function(filePath, edits, currentContent) {
  const result = originalPreview.call(this, filePath, edits, currentContent);
  
  const history = new DryRunHistory();
  const record = history.add({
    tool: 'edit_file',
    params: { filePath, edits },
    preview: result
  });
  
  result._meta.recordId = record.id;
  return result;
};

module.exports = { DryRunHistory };
