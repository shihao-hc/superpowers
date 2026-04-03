/**
 * MCP FileSystem Bridge - 增强版文件系统桥接器
 * 支持批量操作、文件监视、思维链集成
 */

const fs = require('fs');
const path = require('path');
const { rootsManager } = require('../engines/RootsManager');
const { dryRunEngine } = require('../engines/DryRunEngine');
const { thinkingChain } = require('../engines/ThinkingChain');

class FileSystemBridge {
  constructor(config = {}) {
    this.allowedRoots = config.roots || [process.cwd()];
    this.watchers = new Map();
    this.batchHistory = [];

    rootsManager.setRoots(this.allowedRoots);
  }

  /**
   * 获取所有工具定义
   */
  getTools() {
    return [
      // 只读操作
      this._tool('read_text_file', '读取文件文本', {
        path: { type: 'string', required: true }
      }),
      this._tool('read_multiple_files', '批量读取文件', {
        paths: { type: 'array', items: { type: 'string' }, required: true }
      }),
      this._tool('list_directory', '列出目录', {
        path: { type: 'string', required: true }
      }),
      this._tool('directory_tree', '递归目录树', {
        path: { type: 'string', required: true },
        maxDepth: { type: 'number', required: false }
      }),
      this._tool('search_files', '搜索文件', {
        path: { type: 'string', required: true },
        pattern: { type: 'string', required: true }
      }),
      this._tool('get_file_info', '获取文件信息', {
        path: { type: 'string', required: true }
      }),

      // 写操作
      this._tool('write_file', '写入文件', {
        path: { type: 'string', required: true },
        content: { type: 'string', required: true }
      }),
      this._tool('edit_file', '编辑文件', {
        path: { type: 'string', required: true },
        edits: { type: 'array', required: true }
      }),
      this._tool('create_directory', '创建目录', {
        path: { type: 'string', required: true }
      }),
      this._tool('move_file', '移动文件', {
        source: { type: 'string', required: true },
        destination: { type: 'string', required: true }
      }),
      this._tool('delete_file', '删除文件', {
        path: { type: 'string', required: true }
      }),
      this._tool('delete_directory', '删除目录', {
        path: { type: 'string', required: true },
        recursive: { type: 'boolean', required: false }
      }),

      // 批量操作
      this._tool('multi_write', '批量写入', {
        files: { type: 'array', required: true }
      }),
      this._tool('multi_delete', '批量删除', {
        paths: { type: 'array', required: true }
      }),

      // 高级
      this._tool('watch_directory', '监视目录变化', {
        path: { type: 'string', required: true },
        recursive: { type: 'boolean', required: false }
      }),
      this._tool('unwatch_directory', '取消监视', {
        path: { type: 'string', required: true }
      }),
      this._tool('list_allowed_directories', '列出允许的目录')
    ];
  }

  _tool(name, description, inputSchema = {}) {
    return {
      name,
      description,
      inputSchema,
      handler: this._getHandler(name)
    };
  }

  _getHandler(name) {
    const handlers = {
      read_text_file: this.readTextFile.bind(this),
      read_multiple_files: this.readMultipleFiles.bind(this),
      list_directory: this.listDirectory.bind(this),
      directory_tree: this.directoryTree.bind(this),
      search_files: this.searchFiles.bind(this),
      get_file_info: this.getFileInfo.bind(this),
      write_file: this.writeFile.bind(this),
      edit_file: this.editFile.bind(this),
      create_directory: this.createDirectory.bind(this),
      move_file: this.moveFile.bind(this),
      delete_file: this.deleteFile.bind(this),
      delete_directory: this.deleteDirectory.bind(this),
      multi_write: this.multiWrite.bind(this),
      multi_delete: this.multiDelete.bind(this),
      watch_directory: this.watchDirectory.bind(this),
      unwatch_directory: this.unwatchDirectory.bind(this),
      list_allowed_directories: this.listAllowedDirectories.bind(this)
    };
    return handlers[name];
  }

  /**
   * 读取文本文件
   */
  async readTextFile(params, context) {
    const { path: filePath } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], filePath);
    
    const content = fs.readFileSync(resolved.path, 'utf-8');
    const lines = content.split('\n').length;

    thinkingChain.addThought(context.thinking?.getCurrentChain()?.id, `读取文件: ${filePath}`, {
      reasoning: `成功读取 ${lines} 行`,
      metadata: { path: filePath, lines }
    });

    return { content, lines, path: resolved.path };
  }

  /**
   * 批量读取文件
   */
  async readMultipleFiles(params, context) {
    const { paths } = params;
    const results = [];

    for (const filePath of paths) {
      try {
        const resolved = rootsManager.safeResolve(this.allowedRoots[0], filePath);
        const content = fs.readFileSync(resolved.path, 'utf-8');
        results.push({ path: resolved.path, content, success: true });
      } catch (error) {
        results.push({ path: filePath, error: error.message, success: false });
      }
    }

    return { files: results, total: paths.length, successful: results.filter(r => r.success).length };
  }

  /**
   * 列出目录
   */
  async listDirectory(params, context) {
    const { path: dirPath } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], dirPath);

    const entries = fs.readdirSync(resolved.path, { withFileTypes: true });
    const items = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: path.join(resolved.path, entry.name)
    }));

    return { path: resolved.path, items, count: items.length };
  }

  /**
   * 递归目录树
   */
  async directoryTree(params, context) {
    const { path: dirPath, maxDepth = 10 } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], dirPath);

    const buildTree = (dir, depth = 0) => {
      if (depth > maxDepth) return null;

      const stats = fs.statSync(dir);
      if (!stats.isDirectory()) {
        return { name: path.basename(dir), type: 'file' };
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const children = entries.map(entry => {
        const childPath = path.join(dir, entry.name);
        return buildTree(childPath, depth + 1);
      }).filter(Boolean);

      return { name: path.basename(dir), type: 'directory', children };
    };

    const tree = buildTree(resolved.path);
    return { path: resolved.path, tree, maxDepth };
  }

  /**
   * 搜索文件
   */
  async searchFiles(params, context) {
    const { path: searchPath, pattern } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], searchPath);
    
    const matches = [];
    const search = (dir, pattern) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          search(fullPath, pattern);
        } else if (entry.name.match(new RegExp(pattern))) {
          matches.push({ name: entry.name, path: fullPath });
        }
      }
    };

    search(resolved.path, pattern);
    return { pattern, matches, count: matches.length };
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(params, context) {
    const { path: filePath } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], filePath);

    const stats = fs.statSync(resolved.path);
    return {
      path: resolved.path,
      size: stats.size,
      sizeFormatted: formatSize(stats.size),
      created: stats.birthtime,
      modified: stats.mtime,
      type: stats.isDirectory() ? 'directory' : 'file'
    };
  }

  /**
   * 写入文件
   */
  async writeFile(params, context) {
    const { path: filePath, content } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], filePath);

    if (params.dry_run || params.dryRun) {
      return dryRunEngine.previewWrite(resolved.path, content);
    }

    fs.writeFileSync(resolved.path, content, 'utf-8');

    thinkingChain.addThought(context.thinking?.getCurrentChain()?.id, `写入文件: ${filePath}`, {
      reasoning: `写入 ${content.length} 字符`,
      metadata: { path: filePath, size: content.length }
    });

    return { success: true, path: resolved.path, bytes: Buffer.byteLength(content, 'utf-8') };
  }

  /**
   * 编辑文件
   */
  async editFile(params, context) {
    const { path: filePath, edits } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], filePath);

    if (params.dry_run || params.dryRun) {
      const content = fs.readFileSync(resolved.path, 'utf-8');
      return dryRunEngine.previewEdit(resolved.path, edits, content);
    }

    let content = fs.readFileSync(resolved.path, 'utf-8');
    for (const edit of edits) {
      content = content.replace(edit.oldText, edit.newText);
    }
    fs.writeFileSync(resolved.path, content, 'utf-8');

    thinkingChain.addThought(context.thinking?.getCurrentChain()?.id, `编辑文件: ${filePath}`, {
      reasoning: `应用 ${edits.length} 处修改`,
      metadata: { path: filePath, edits }
    });

    return { success: true, path: resolved.path, editsApplied: edits.length };
  }

  /**
   * 创建目录
   */
  async createDirectory(params, context) {
    const { path: dirPath } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], dirPath);

    if (params.dry_run || params.dryRun) {
      return {
        _meta: { dryRun: true },
        action: 'create_directory',
        path: resolved.path,
        confirmationNeeded: true
      };
    }

    fs.mkdirSync(resolved.path, { recursive: true });

    return { success: true, path: resolved.path };
  }

  /**
   * 移动文件
   */
  async moveFile(params, context) {
    const { source, destination } = params;
    const srcResolved = rootsManager.safeResolve(this.allowedRoots[0], source);
    const dstResolved = rootsManager.safeResolve(this.allowedRoots[0], destination);

    if (params.dry_run || params.dryRun) {
      return {
        _meta: { dryRun: true },
        action: 'move_file',
        source: srcResolved.path,
        destination: dstResolved.path,
        confirmationNeeded: true
      };
    }

    fs.renameSync(srcResolved.path, dstResolved.path);

    thinkingChain.addThought(context.thinking?.getCurrentChain()?.id, `移动文件: ${source} -> ${destination}`, {
      metadata: { source, destination }
    });

    return { success: true, source: srcResolved.path, destination: dstResolved.path };
  }

  /**
   * 删除文件
   */
  async deleteFile(params, context) {
    const { path: filePath } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], filePath);

    if (params.dry_run || params.dryRun) {
      return dryRunEngine.previewDelete(resolved.path);
    }

    fs.unlinkSync(resolved.path);

    thinkingChain.addThought(context.thinking?.getCurrentChain()?.id, `删除文件: ${filePath}`, {
      metadata: { path: filePath, action: 'delete' }
    });

    return { success: true, path: resolved.path };
  }

  /**
   * 删除目录
   */
  async deleteDirectory(params, context) {
    const { path: dirPath, recursive = false } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], dirPath);

    if (params.dry_run || params.dryRun) {
      return dryRunEngine.previewDeleteDirectory(resolved.path);
    }

    if (recursive) {
      fs.rmSync(resolved.path, { recursive: true });
    } else {
      fs.rmdirSync(resolved.path);
    }

    return { success: true, path: resolved.path };
  }

  /**
   * 批量写入
   */
  async multiWrite(params, context) {
    const { files } = params;

    if (params.dry_run || params.dryRun) {
      const previews = files.map(f => {
        const resolved = rootsManager.safeResolve(this.allowedRoots[0], f.path);
        return dryRunEngine.previewWrite(resolved.path, f.content);
      });
      return { _meta: { dryRun: true }, previews, count: files.length };
    }

    const results = [];
    for (const file of files) {
      const resolved = rootsManager.safeResolve(this.allowedRoots[0], file.path);
      fs.writeFileSync(resolved.path, file.content, 'utf-8');
      results.push({ path: resolved.path, success: true });
    }

    thinkingChain.addThought(context.thinking?.getCurrentChain()?.id, `批量写入 ${files.length} 个文件`, {
      metadata: { files: files.map(f => f.path) }
    });

    return { results, total: files.length, successful: results.length };
  }

  /**
   * 批量删除
   */
  async multiDelete(params, context) {
    const { paths } = params;

    if (params.dry_run || params.dryRun) {
      const previews = paths.map(p => {
        const resolved = rootsManager.safeResolve(this.allowedRoots[0], p);
        return dryRunEngine.previewDelete(resolved.path);
      });
      return { _meta: { dryRun: true }, previews, count: paths.length };
    }

    const results = [];
    for (const p of paths) {
      const resolved = rootsManager.safeResolve(this.allowedRoots[0], p);
      fs.unlinkSync(resolved.path);
      results.push({ path: resolved.path, success: true });
    }

    thinkingChain.addThought(context.thinking?.getCurrentChain()?.id, `批量删除 ${paths.length} 个文件`, {
      metadata: { paths }
    });

    return { results, total: paths.length, successful: results.length };
  }

  /**
   * 监视目录
   */
  async watchDirectory(params, context) {
    const { path: dirPath, recursive = false } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], dirPath);

    if (this.watchers.has(resolved.path)) {
      return { success: true, message: 'Already watching', path: resolved.path };
    }

    const watcher = fs.watch(resolved.path, { recursive }, (eventType, filename) => {
      console.log(`File ${eventType}: ${filename}`);
    });

    this.watchers.set(resolved.path, watcher);

    return { success: true, path: resolved.path, message: 'Now watching for changes' };
  }

  /**
   * 取消监视
   */
  async unwatchDirectory(params, context) {
    const { path: dirPath } = params;
    const resolved = rootsManager.safeResolve(this.allowedRoots[0], dirPath);

    if (this.watchers.has(resolved.path)) {
      this.watchers.get(resolved.path).close();
      this.watchers.delete(resolved.path);
      return { success: true, path: resolved.path, message: 'Stopped watching' };
    }

    return { success: false, message: 'Not watching this directory' };
  }

  /**
   * 列出允许的目录
   */
  async listAllowedDirectories(params, context) {
    return { roots: rootsManager.getRoots() };
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

module.exports = { FileSystemBridge };
