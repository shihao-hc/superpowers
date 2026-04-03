/**
 * MCP Dry-Run Engine - 操作预览引擎
 * 为所有写操作提供 dry_run 预览机制
 */

const fs = require('fs');
const path = require('path');

class DryRunEngine {
  constructor(options = {}) {
    this.previewCache = new Map();
    this.history = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxPreviewLength = options.maxPreviewLength || 5000;
  }

  /**
   * 验证文件路径安全性 - 防止路径穿越攻击
   */
  validateFilePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path: must be a non-empty string');
    }
    
    // 规范化路径分隔符 (Windows/Linux兼容)
    const normalized = filePath.replace(/\\/g, '/');
    
    // 检查危险字符和路径穿越
    if (normalized.includes('..') || /[\<\>\|]/.test(normalized)) {
      throw new Error('Path traversal or invalid characters not allowed');
    }
    
    const resolved = path.resolve(normalized);
    return resolved;
  }

  /**
   * 验证文件大小
   */
  validateFileSize(filePath) {
    const stats = fs.statSync(filePath);
    if (stats.size > this.maxFileSize) {
      throw new Error(`File size exceeds limit: ${stats.size} > ${this.maxFileSize}`);
    }
    return stats.size;
  }

  /**
   * 通用 Dry-Run 检查
   */
  checkDryRun(params, toolName) {
    if (params.dry_run === true || params.dryRun === true) {
      return true;
    }
    return false;
  }

  /**
   * 预览文件编辑
   */
  previewEdit(filePath, edits, currentContent) {
    const safePath = this.validateFilePath(filePath);
    
    // 如果没有提供内容，先验证并检查文件大小
    if (!currentContent) {
      this.validateFileSize(safePath);
      currentContent = fs.readFileSync(safePath, 'utf-8');
    }
    
    const content = currentContent;
    
    // 限制预览内容长度
    const truncated = content.length > this.maxPreviewLength;
    const displayContent = truncated ? content.slice(0, this.maxPreviewLength) + '\n...' : content;
    
    const preview = this.applyEdits(displayContent, edits);
    const diff = this.generateDiff(displayContent, preview, filePath);

    const previewData = {
      _meta: {
        dryRun: true,
        preview: true,
        tool: 'edit_file',
        file: filePath,
        truncated,
        originalSize: content.length,
        lineCount: {
          before: displayContent.split('\n').length,
          after: preview.split('\n').length,
          delta: preview.split('\n').length - displayContent.split('\n').length
        }
      },
      preview,
      diff,
      confirmationNeeded: true,
      nextStep: 'Call again with dry_run=false to execute'
    };

    this.history.push({ type: 'edit_file', filePath, dryRun: true, timestamp: new Date().toISOString() });
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
    return previewData;
  }

  /**
   * 预览文件写入
   */
  previewWrite(filePath, content) {
    let existingContent = '';
    let exists = false;

    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, 'utf-8');
      exists = true;
    }

    const diff = this.generateDiff(existingContent, content, filePath);

    const previewData = {
      _meta: {
        dryRun: true,
        preview: true,
        tool: 'write_file',
        file: filePath,
        willCreate: !exists,
        willOverwrite: exists,
        size: {
          before: Buffer.byteLength(existingContent, 'utf-8'),
          after: Buffer.byteLength(content, 'utf-8')
        }
      },
      preview: content,
      diff,
      existingContent: exists ? existingContent.substring(0, 500) + (existingContent.length > 500 ? '...' : '') : null,
      confirmationNeeded: true,
      warning: exists ? 'This will overwrite the existing file' : 'This will create a new file',
      nextStep: 'Call again with dry_run=false to execute'
    };

    this.history.push({ type: 'write_file', filePath, dryRun: true });
    return previewData;
  }

  /**
   * 预览文件删除
   */
  previewDelete(filePath) {
    let stats = null;
    if (fs.existsSync(filePath)) {
      stats = fs.statSync(filePath);
    }

    const previewData = {
      _meta: {
        dryRun: true,
        preview: true,
        tool: 'delete_file',
        file: filePath,
        exists: !!stats
      },
      fileInfo: stats ? {
        size: stats.size,
        sizeFormatted: this.formatSize(stats.size),
        modified: stats.mtime,
        created: stats.birthtime,
        type: stats.isDirectory() ? 'directory' : 'file'
      } : null,
      confirmationNeeded: true,
      warning: 'This action cannot be undone!',
      nextStep: 'Call again with dry_run=false to execute'
    };

    this.history.push({ type: 'delete_file', filePath, dryRun: true });
    return previewData;
  }

  /**
   * 预览目录删除
   */
  previewDeleteDirectory(dirPath) {
    const exists = fs.existsSync(dirPath);
    let fileCount = 0;
    let totalSize = 0;

    if (exists) {
      const stats = this.countFiles(dirPath);
      fileCount = stats.count;
      totalSize = stats.size;
    }

    const previewData = {
      _meta: {
        dryRun: true,
        preview: true,
        tool: 'delete_directory',
        directory: dirPath,
        exists
      },
      directoryInfo: {
        fileCount,
        totalSize: this.formatSize(totalSize)
      },
      confirmationNeeded: true,
      warning: `This will delete ${fileCount} files/directories. This action cannot be undone!`,
      nextStep: 'Call again with dry_run=false to execute'
    };

    this.history.push({ type: 'delete_directory', dirPath, dryRun: true });
    return previewData;
  }

  /**
   * 预览 GitHub Issue 创建
   */
  previewCreateIssue({ owner, repo, title, body, labels }) {
    const previewData = {
      _meta: {
        dryRun: true,
        preview: true,
        tool: 'create_issue',
        endpoint: `POST /repos/${owner}/${repo}/issues`
      },
      requestPreview: {
        owner,
        repo,
        title,
        body: body || '',
        labels: labels || []
      },
      formattedRequest: JSON.stringify({
        title,
        body,
        labels
      }, null, 2),
      confirmationNeeded: true,
      nextStep: 'Call again with dry_run=false to execute'
    };

    this.history.push({ type: 'create_issue', owner, repo, title, dryRun: true });
    return previewData;
  }

  /**
   * 预览 GitHub PR 合并
   */
  previewMergePR({ owner, repo, prNumber, mergeMethod }) {
    const previewData = {
      _meta: {
        dryRun: true,
        preview: true,
        tool: 'merge_pr',
        endpoint: `PUT /repos/${owner}/${repo}/pulls/${prNumber}/merge`,
        destructive: true
      },
      requestPreview: {
        owner,
        repo,
        prNumber,
        mergeMethod: mergeMethod || 'merge'
      },
      formattedRequest: JSON.stringify({
        merge_method: mergeMethod || 'merge'
      }, null, 2),
      confirmationNeeded: true,
      warning: 'This will merge the pull request. This action cannot be undone!',
      nextStep: 'Call again with dry_run=false to execute'
    };

    this.history.push({ type: 'merge_pr', owner, repo, prNumber, dryRun: true });
    return previewData;
  }

  /**
   * 预览 Memos 删除
   */
  previewDeleteMemo(memoId, memoContent) {
    const previewData = {
      _meta: {
        dryRun: true,
        preview: true,
        tool: 'delete_memo',
        memoId
      },
      memoPreview: {
        id: memoId,
        content: memoContent ? memoContent.substring(0, 200) + (memoContent.length > 200 ? '...' : '') : null
      },
      confirmationNeeded: true,
      warning: 'This memo will be permanently deleted. This action cannot be undone!',
      nextStep: 'Call again with dry_run=false to execute'
    };

    this.history.push({ type: 'delete_memo', memoId, dryRun: true });
    return previewData;
  }

  /**
   * 预览 CDP 命令
   */
  previewCdpCommand(command, params) {
    const warnings = this.analyzeCdpRisks(command, params);

    const previewData = {
      _meta: {
        dryRun: true,
        preview: true,
        tool: 'cdp_command',
        command
      },
      commandPreview: {
        command,
        params
      },
      warnings,
      confirmationNeeded: true,
      nextStep: 'Call again with dry_run=false to execute'
    };

    this.history.push({ type: 'cdp_command', command, dryRun: true });
    return previewData;
  }

  /**
   * 分析 CDP 命令风险
   */
  analyzeCdpRisks(command, params) {
    const risks = [];
    
    if (command.includes('inject') || command.includes('evaluate')) {
      risks.push('This command executes code in the browser context');
    }
    if (command.includes('click') || command.includes('type')) {
      risks.push('This will interact with page elements');
    }
    if (command.includes('delete') || command.includes('remove')) {
      risks.push('This will modify or remove page content');
    }

    return risks;
  }

  /**
   * 应用编辑到内容
   */
  applyEdits(content, edits) {
    let result = content;
    
    for (const edit of edits) {
      const { oldText, newText } = edit;
      if (oldText && result.includes(oldText)) {
        result = result.replace(oldText, newText);
      }
    }

    return result;
  }

  /**
   * 生成差异对比
   */
  generateDiff(before, after, filePath) {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    
    const changes = {
      added: 0,
      removed: 0,
      unchanged: 0,
      hunks: []
    };

    let hunkStart = -1;
    let hunkLines = [];

    for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
      const beforeLine = beforeLines[i];
      const afterLine = afterLines[i];

      if (beforeLine === afterLine) {
        changes.unchanged++;
        if (hunkStart >= 0) {
          hunkLines.push({ type: 'unchanged', content: beforeLine });
        }
      } else if (beforeLine !== undefined && afterLine === undefined) {
        changes.removed++;
        if (hunkStart < 0) hunkStart = Math.max(0, i - 2);
        hunkLines.push({ type: 'removed', content: beforeLine });
      } else if (beforeLine === undefined && afterLine !== undefined) {
        changes.added++;
        if (hunkStart < 0) hunkStart = Math.max(0, i - 2);
        hunkLines.push({ type: 'added', content: afterLine });
      } else {
        changes.removed++;
        changes.added++;
        if (hunkStart < 0) hunkStart = Math.max(0, i - 2);
        hunkLines.push({ type: 'removed', content: beforeLine });
        hunkLines.push({ type: 'added', content: afterLine });
      }
    }

    if (hunkStart >= 0) {
      changes.hunks.push({
        start: hunkStart + 1,
        lines: hunkLines.slice(0, 50)
      });
    }

    return {
      ...changes,
      summary: `+${changes.added} -${changes.removed}`,
      file: filePath
    };
  }

  /**
   * 格式化文件大小
   */
  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  /**
   * 统计目录文件
   */
  countFiles(dirPath, stats = { count: 0, size: 0 }) {
    if (!fs.existsSync(dirPath)) return stats;

    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const entryStat = fs.statSync(fullPath);
      
      if (entryStat.isDirectory()) {
        this.countFiles(fullPath, stats);
      } else {
        stats.count++;
        stats.size += entryStat.size;
      }
    }

    return stats;
  }

  /**
   * 获取历史记录
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * 清除历史
   */
  clearHistory() {
    this.history = [];
  }
}

// 单例导出
const dryRunEngine = new DryRunEngine();

module.exports = {
  DryRunEngine,
  dryRunEngine
};
