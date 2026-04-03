/**
 * MCP Roots Manager - 动态目录访问控制
 * 实现路径沙箱，防止路径遍历攻击
 * 支持细粒度权限控制（读/写/执行）和临时沙箱
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

class RootConfig {
  constructor(rootPath, permissions = ['read', 'write']) {
    this.path = path.resolve(rootPath);
    this.permissions = permissions;
    this.readOnly = !permissions.includes('write');
    this.createdAt = new Date().toISOString();
    this.temporary = false;
    this.id = crypto.randomUUID();
  }
}

class RootsManager {
  constructor() {
    this.roots = [];
    this.listeners = new Set();
    this.pathCache = new Map();
    this.temporaryRoots = new Map();
  }

  /**
   * 设置允许的根目录（带权限）
   */
  setRoots(roots, permissions = ['read', 'write']) {
    this.roots = roots.map(r => new RootConfig(r, permissions));
    this.pathCache.clear();
    this.notifyListeners();
    return this.roots;
  }

  /**
   * 添加带权限的根目录
   */
  addRoot(root, permissions = ['read', 'write']) {
    const config = new RootConfig(root, permissions);
    if (!this.roots.find(r => r.path === config.path)) {
      this.roots.push(config);
      this.pathCache.clear();
      this.notifyListeners();
    }
    return this.roots;
  }

  /**
   * 创建临时沙箱目录
   */
  createTemporaryRoot(prefix = 'mcp-sandbox') {
    const tmpDir = os.tmpdir();
    const sandboxPath = path.join(tmpDir, `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
    
    fs.mkdirSync(sandboxPath, { recursive: true });
    
    const config = new RootConfig(sandboxPath, ['read', 'write']);
    config.temporary = true;
    
    this.roots.push(config);
    this.temporaryRoots.set(config.id, sandboxPath);
    this.pathCache.clear();
    this.notifyListeners();
    
    return { id: config.id, path: sandboxPath, cleanup: () => this.cleanupTemporaryRoot(config.id) };
  }

  /**
   * 清理临时沙箱
   */
  cleanupTemporaryRoot(id) {
    const sandboxPath = this.temporaryRoots.get(id);
    if (sandboxPath && fs.existsSync(sandboxPath)) {
      fs.rmSync(sandboxPath, { recursive: true, force: true });
    }
    this.roots = this.roots.filter(r => r.id !== id);
    this.temporaryRoots.delete(id);
    this.pathCache.clear();
    return { success: true };
  }

  /**
   * 清理所有临时沙箱
   */
  cleanupAllTemporary() {
    for (const id of this.temporaryRoots.keys()) {
      this.cleanupTemporaryRoot(id);
    }
    return { success: true, cleaned: this.temporaryRoots.size };
  }

  /**
   * 获取根目录（兼容）
   */
  getRoots() {
    return this.roots.map(r => r.path);
  }

  /**
   * 获取根目录配置
   */
  getRootsConfig() {
    return [...this.roots];
  }

  /**
   * 移除根目录
   */
  removeRoot(root) {
    const resolved = path.resolve(root);
    this.roots = this.roots.filter(r => r.path !== resolved);
    this.pathCache.clear();
    this.notifyListeners();
    return this.roots;
  }

  /**
   * 检查权限
   */
  hasPermission(filePath, permission) {
    for (const config of this.roots) {
      if (filePath.startsWith(config.path)) {
        return config.permissions.includes(permission);
      }
    }
    return false;
  }

  /**
   * 验证路径是否在允许范围内
   */
  validatePath(requestedPath, requirePermission = null) {
    const cacheKey = `${requestedPath}:${requirePermission || 'any'}`;
    if (this.pathCache.has(cacheKey)) {
      return this.pathCache.get(cacheKey);
    }

    const resolved = path.resolve(requestedPath);
    
    for (const config of this.roots) {
      if (resolved === config.path || resolved.startsWith(config.path + path.sep)) {
        if (requirePermission && !config.permissions.includes(requirePermission)) {
          const result = {
            valid: false,
            error: 'PERMISSION_DENIED',
            message: `Path "${requestedPath}" does not have "${requirePermission}" permission`,
            requiredPermission: requirePermission,
            root: config.path
          };
          this.pathCache.set(cacheKey, result);
          return result;
        }

        const result = {
          valid: true,
          root: config.path,
          rootConfig: config,
          relative: path.relative(config.path, resolved),
          absolute: resolved,
          permissions: config.permissions,
          readOnly: config.readOnly
        };
        this.pathCache.set(cacheKey, result);
        return result;
      }
    }

    const result = {
      valid: false,
      error: 'PATH_OUTSIDE_ROOTS',
      message: `Path "${requestedPath}" is outside allowed roots`,
      allowedRoots: this.roots.map(r => r.path)
    };
    this.pathCache.set(cacheKey, result);
    return result;
  }

  /**
   * 安全解析路径（防止路径遍历）
   */
  safeResolve(basePath, userPath, requirePermission = null) {
    if (!userPath) {
      return { valid: true, path: basePath, relative: '', root: basePath, permissions: ['read', 'write'] };
    }

    const resolved = path.resolve(basePath, userPath);
    const validated = this.validatePath(resolved, requirePermission);
    
    if (!validated.valid) {
      const error = new Error(`Path traversal detected: ${userPath}`);
      error.code = 'PATH_TRAVERSAL';
      error.details = validated;
      throw error;
    }

    return {
      valid: true,
      path: validated.absolute,
      relative: validated.relative,
      root: validated.root,
      permissions: validated.permissions,
      readOnly: validated.readOnly
    };
  }

  /**
   * 强制路径验证中间件
   */
  validateMiddleware(toolName, params) {
    const pathParams = ['path', 'file', 'filePath', 'directory', 'dir', 'source', 'destination', 'root'];
    
    for (const paramName of pathParams) {
      if (params[paramName] !== undefined) {
        const requireWrite = !this._isReadOnlyTool(toolName) ? 'write' : null;
        const result = this.safeResolve(process.cwd(), params[paramName], requireWrite);
        if (!result.valid) {
          return {
            error: 'PATH_VALIDATION_FAILED',
            message: result.message,
            code: result.error
          };
        }
        params[`_${paramName}_validated`] = result;
      }
    }

    return null;
  }

  /**
   * 检查是否为只读工具
   */
  _isReadOnlyTool(toolName) {
    const readOnlyTools = ['read_file', 'read_text_file', 'read_multiple_files', 'list_directory', 
                          'directory_tree', 'search_files', 'get_file_info'];
    return readOnlyTools.includes(toolName);
  }

  /**
   * 监听根目录变更
   */
  onRootsChanged(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * 通知监听器
   */
  notifyListeners() {
    for (const callback of this.listeners) {
      try {
        callback(this.roots);
      } catch (error) {
        console.error('Roots listener error:', error);
      }
    }
  }

  /**
   * 实现 MCP Roots 协议
   */
  async handleRootsList() {
    return {
      roots: this.roots.map(config => ({
        uri: `file://${config.path}`,
        name: path.basename(config.path),
        description: `Root directory: ${config.path} (${config.permissions.join(', ')})`,
        permissions: config.permissions,
        temporary: config.temporary
      }))
    };
  }

  /**
   * 处理 MCP Roots 变更通知
   */
  async handleRootsListChanged(roots) {
    if (roots && Array.isArray(roots)) {
      this.roots = roots.map(r => {
        const rootPath = typeof r === 'string' ? r : (r.uri ? r.uri.replace('file://', '') : r.path);
        const permissions = r.permissions || ['read', 'write'];
        return new RootConfig(rootPath, permissions);
      });
      this.pathCache.clear();
      this.notifyListeners();
    }
    return { success: true };
  }

  /**
   * 获取相对路径信息
   */
  getRelativeInfo(absolutePath) {
    for (const config of this.roots) {
      if (absolutePath.startsWith(config.path + path.sep)) {
        return {
          root: config.path,
          rootConfig: config,
          relative: path.relative(config.path, absolutePath),
          depth: path.relative(config.path, absolutePath).split(path.sep).length
        };
      }
    }
    return null;
  }

  /**
   * 列出所有允许的路径前缀
   */
  getAllowedPrefixes() {
    return this.roots.map(config => ({
      prefix: config.path,
      name: path.basename(config.path),
      permissions: config.permissions,
      exists: fs.existsSync(config.path),
      temporary: config.temporary
    }));
  }

  /**
   * 检查路径是否可写
   */
  isWritable(filePath) {
    return this.hasPermission(filePath, 'write');
  }

  /**
   * 检查路径是否可读
   */
  isReadable(filePath) {
    return this.hasPermission(filePath, 'read');
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.pathCache.clear();
  }

  /**
   * 监听根目录变更
   */
  onRootsChanged(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * 通知监听器
   */
  notifyListeners() {
    for (const callback of this.listeners) {
      try {
        callback(this.allowedRoots);
      } catch (error) {
        console.error('Roots listener error:', error);
      }
    }
  }

  /**
   * 获取所有根目录信息
   */
  onRootsChanged(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * 通知监听器
   */
  notifyListeners() {
    for (const callback of this.listeners) {
      try {
        callback(this.allowedRoots);
      } catch (error) {
        console.error('Roots listener error:', error);
      }
    }
  }

  /**
   * 实现 MCP Roots 协议
   */
  async handleRootsList() {
    return {
      roots: this.allowedRoots.map(r => ({
        uri: `file://${r}`,
        name: path.basename(r),
        description: `Root directory: ${r}`
      }))
    };
  }

  /**
   * 处理 MCP Roots 变更通知
   */
  async handleRootsListChanged(roots) {
    if (roots && Array.isArray(roots)) {
      this.setRoots(roots.map(r => {
        if (typeof r === 'string') return r;
        return r.uri ? r.uri.replace('file://', '') : r;
      }));
    }
    return { success: true };
  }

  /**
   * 获取相对路径信息
   */
  getRelativeInfo(absolutePath) {
    for (const root of this.allowedRoots) {
      if (absolutePath.startsWith(root + path.sep)) {
        return {
          root,
          relative: path.relative(root, absolutePath),
          depth: path.relative(root, absolutePath).split(path.sep).length
        };
      }
    }
    return null;
  }

  /**
   * 列出所有允许的路径前缀
   */
  getAllowedPrefixes() {
    return this.allowedRoots.map(r => ({
      prefix: r,
      name: path.basename(r),
      exists: fs.existsSync(r)
    }));
  }

  /**
   * 检查路径是否可写
   */
  isWritable(filePath) {
    const validated = this.validatePath(filePath);
    if (!validated.valid) return false;

    try {
      fs.accessSync(validated.absolute, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.pathCache.clear();
  }
}

// 单例导出
const rootsManager = new RootsManager();

module.exports = {
  RootsManager,
  rootsManager
};
