/**
 * SettingsSync - 设置同步系统
 * 基于 Claude Code settingsSync 设计模式
 *
 * 核心功能:
 * - 双向同步（上传/下载）
 * - 增量同步（差异检测）
 * - OAuth 认证
 * - 冲突解决
 */

const fs = require('fs').promises;
const path = require('path');
const _crypto = require('crypto');

/**
 * 同步键定义
 */
const SyncKeys = {
  USER_SETTINGS: 'settings.json',
  USER_MEMORY: 'CLAUDE.md',
  PROJECT_SETTINGS: 'settings.local.json',
  PROJECT_MEMORY: 'CLAUDE.local.md'
};

/**
 * 同步类型
 */
const SyncDirection = {
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  BIDIRECTIONAL: 'bidirectional'
};

/**
 * 同步状态
 */
const SyncStatus = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  SUCCESS: 'success',
  FAILED: 'failed',
  CONFLICT: 'conflict'
};

/**
 * OAuth 配置
 */
const OAuthConfig = {
  authUrl: 'https://auth.anthropic.com/oauth',
  tokenUrl: 'https://auth.anthropic.com/oauth/token',
  scope: 'settings:read settings:write',
  redirectUri: 'claude://settings-sync/callback'
};

/**
 * 设置同步类
 */
class SettingsSync {
  constructor(options = {}) {
    this.localPath = options.localPath || this.getDefaultLocalPath();
    this.remoteApi = options.remoteApi;
    this.authToken = options.authToken;
    this.logger = options.logger || console;

    this.status = SyncStatus.IDLE;
    this.lastSync = null;
    this.conflictResolver = options.conflictResolver || this.defaultConflictResolver;

    // 缓存
    this.downloadCache = null;
  }

  getDefaultLocalPath() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    return path.join(homeDir, '.claude', 'settings-sync');
  }

  /**
   * 初始化
   */
  async initialize() {
    await fs.mkdir(this.localPath, { recursive: true });
  }

  /**
   * 设置认证令牌
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * OAuth 认证
   */
  async authenticate() {
    if (!this.remoteApi) {
      throw new Error('Remote API not configured');
    }

    // 获取 OAuth URL
    const authUrl = this.buildOAuthUrl();

    // 简化实现：假设已经通过外部流程获取了 token
    return {
      authUrl,
      message: `Please authorize via: ${authUrl}`
    };
  }

  buildOAuthUrl() {
    const params = new URLSearchParams({
      client_id: 'claude-code',
      scope: OAuthConfig.scope,
      redirect_uri: OAuthConfig.redirectUri,
      response_type: 'code'
    });

    return `${OAuthConfig.authUrl}?${params.toString()}`;
  }

  /**
   * 上传设置
   */
  async upload(settings, options = {}) {
    if (!this.authToken) {
      throw new Error('Not authenticated');
    }

    this.status = SyncStatus.SYNCING;

    try {
      // 获取远程设置
      const remote = await this.fetchRemote(options.key);

      // 计算差异
      const changed = this.diff(settings, remote);

      if (Object.keys(changed).length === 0) {
        this.status = SyncStatus.SUCCESS;
        return { uploaded: false, reason: 'No changes' };
      }

      // 上传变更
      await this.remoteApi.upload({
        token: this.authToken,
        key: options.key || SyncKeys.USER_SETTINGS,
        entries: changed
      });

      // 保存本地备份
      await this.saveLocalBackup(settings, options.key);

      this.status = SyncStatus.SUCCESS;
      this.lastSync = Date.now();

      return {
        uploaded: true,
        entries: Object.keys(changed).length,
        timestamp: this.lastSync
      };

    } catch (error) {
      this.status = SyncStatus.FAILED;
      throw error;
    }
  }

  /**
   * 下载设置
   */
  async download(options = {}) {
    if (!this.authToken) {
      throw new Error('Not authenticated');
    }

    this.status = SyncStatus.SYNCING;

    try {
      // 使用缓存
      if (this.downloadCache && !options.force) {
        return this.downloadCache;
      }

      // 获取远程设置
      const remoteResponse = await this.remoteApi.download({
        token: this.authToken,
        key: options.key || SyncKeys.USER_SETTINGS
      });
      const remote = remoteResponse.entries || remoteResponse;

      // 获取本地设置
      const local = await this.loadLocal(options.key);

      // 合并
      const merged = this.merge(remote, local);

      this.downloadCache = merged;
      this.status = SyncStatus.SUCCESS;
      this.lastSync = Date.now();

      return merged;

    } catch (error) {
      this.status = SyncStatus.FAILED;
      throw error;
    }
  }

  /**
   * 双向同步
   */
  async sync(options = {}) {
    this.status = SyncStatus.SYNCING;

    try {
      // 并行下载和读取本地
      const [remote, local] = await Promise.all([
        this.download(options).catch(() => ({})),
        this.loadLocal(options.key).catch(() => ({}))
      ]);

      // 检测冲突
      const conflict = this.detectConflict(remote, local);

      if (conflict) {
        this.status = SyncStatus.CONFLICT;
        const resolved = await this.conflictResolver(remote, local, conflict);
        await this.saveLocal(resolved, options.key);
        await this.upload(resolved, options);
        return { direction: SyncDirection.BIDIRECTIONAL, conflict: true };
      }

      // 增量上传
      const diff = this.diff(local, remote);

      if (Object.keys(diff).length > 0) {
        await this.upload(local, options);
      }

      this.status = SyncStatus.SUCCESS;
      return {
        direction: SyncDirection.BIDIRECTIONAL,
        conflict: false,
        lastSync: this.lastSync
      };

    } catch (error) {
      this.status = SyncStatus.FAILED;
      throw error;
    }
  }

  /**
   * 获取远程设置
   */
  async fetchRemote(key) {
    if (!this.remoteApi) {
      return {};
    }

    try {
      const response = await this.remoteApi.download({
        token: this.authToken,
        key: key || SyncKeys.USER_SETTINGS
      });

      return response.entries || {};
    } catch (error) {
      if (error.status === 404) {
        return {};
      }
      throw error;
    }
  }

  /**
   * 计算差异
   */
  diff(local, remote) {
    const changed = {};

    for (const [key, value] of Object.entries(local)) {
      if (JSON.stringify(value) !== JSON.stringify(remote[key])) {
        changed[key] = value;
      }
    }

    return changed;
  }

  /**
   * 合并设置
   */
  merge(remote, local) {
    // 策略：远程优先，本地备份
    const merged = { ...local, ...remote };
    return merged;
  }

  /**
   * 检测冲突
   */
  detectConflict(remote, local) {
    const conflicts = [];

    for (const key of Object.keys(remote)) {
      if (key in local) {
        if (JSON.stringify(remote[key]) !== JSON.stringify(local[key])) {
          conflicts.push({
            key,
            remote: remote[key],
            local: local[key]
          });
        }
      }
    }

    return conflicts.length > 0 ? conflicts : null;
  }

  /**
   * 默认冲突解决器
   */
  async defaultConflictResolver(remote, local, conflicts) {
    // 策略：远程优先
    const resolved = { ...local };

    for (const conflict of conflicts) {
      resolved[conflict.key] = conflict.remote;
    }

    return resolved;
  }

  /**
   * 加载本地设置
   */
  async loadLocal(key) {
    const filePath = this.getLocalFilePath(key);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  /**
   * 保存本地设置
   */
  async saveLocal(settings, key) {
    const filePath = this.getLocalFilePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  /**
   * 保存本地备份
   */
  async saveLocalBackup(settings, key) {
    const backupDir = path.join(this.localPath, 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${key || 'settings'}-${timestamp}.json`);

    await fs.writeFile(backupPath, JSON.stringify(settings, null, 2), 'utf-8');

    // 清理旧备份（保留最近10个）
    await this.cleanOldBackups(backupDir, key, 10);
  }

  /**
   * 清理旧备份
   */
  async cleanOldBackups(dir, key, keep) {
    const files = await fs.readdir(dir);
    const backups = files
      .filter((f) => f.startsWith(key || 'settings'))
      .sort()
      .reverse();

    if (backups.length > keep) {
      for (const file of backups.slice(keep)) {
        await fs.unlink(path.join(dir, file));
      }
    }
  }

  /**
   * 获取本地文件路径
   */
  getLocalFilePath(key) {
    return path.join(this.localPath, key || SyncKeys.USER_SETTINGS);
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      status: this.status,
      lastSync: this.lastSync,
      localPath: this.localPath
    };
  }

  /**
   * 强制重新下载
   */
  async forceRedownload(options = {}) {
    return this.download({ ...options, force: true });
  }
}

/**
 * 本地文件观察器
 */
class SettingsWatcher {
  constructor(sync, options = {}) {
    this.sync = sync;
    this.watchPath = options.watchPath || sync.localPath;
    this.debounceMs = options.debounce || 1000;
    this.debounceTimer = null;
    this.watcher = null;
  }

  /**
   * 开始观察
   */
  async start() {
    const chokidar = require('chokidar');

    this.watcher = chokidar.watch(this.watchPath, {
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('change', (filePath) => {
      this.debounce(() => {
        this.onFileChange(filePath);
      });
    });
  }

  /**
   * 文件变化处理
   */
  async onFileChange(filePath) {
    try {
      const key = path.basename(filePath);
      const settings = JSON.parse(await fs.readFile(filePath, 'utf-8'));

      await this.sync.upload(settings, { key });

      this.sync.logger.debug(`Settings uploaded: ${key}`);
    } catch (error) {
      this.sync.logger.error(`Settings sync failed: ${error.message}`);
    }
  }

  /**
   * 防抖
   */
  debounce(fn) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(fn, this.debounceMs);
  }

  /**
   * 停止观察
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

module.exports = {
  SettingsSync,
  SettingsWatcher,
  SyncKeys,
  SyncDirection,
  SyncStatus,
  OAuthConfig
};
