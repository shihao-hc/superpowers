/**
 * OpenClaw 认证管理器
 * 管理各平台的认证状态
 */

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

class AuthManager {
  constructor(options = {}) {
    this.stateDir = options.stateDir || path.join(process.cwd(), '.openclaw-state');
    this.authProfilesPath = path.join(this.stateDir, 'agents', 'main', 'agent', 'auth-profiles.json');
    this.authJsonPath = path.join(this.stateDir, 'agents', 'main', 'agent', 'auth.json');
    this.openclawJsonPath = path.join(this.stateDir, 'openclaw.json');
    
    this.profiles = new Map();
    this.providers = new Set();
    
    this._ensureStateDir();
  }
  
  /**
   * 确保状态目录存在
   */
  _ensureStateDir() {
    const dirs = [
      this.stateDir,
      path.join(this.stateDir, 'agents'),
      path.join(this.stateDir, 'agents', 'main'),
      path.join(this.stateDir, 'agents', 'main', 'agent')
    ];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }
  
  /**
   * 加载认证配置
   */
  loadAuthProfiles() {
    try {
      if (fs.existsSync(this.authProfilesPath)) {
        const data = JSON.parse(fs.readFileSync(this.authProfilesPath, 'utf8'));
        this.profiles = new Map(Object.entries(data.profiles || {}));
        return true;
      }
    } catch (error) {
      console.error('[AuthManager] 加载认证配置失败:', error.message);
    }
    return false;
  }
  
  /**
   * 保存认证配置
   */
  saveAuthProfiles() {
    try {
      const data = {
        profiles: Object.fromEntries(this.profiles),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.authProfilesPath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('[AuthManager] 保存认证配置失败:', error.message);
      return false;
    }
  }
  
  /**
   * 添加认证配置
   */
  addProfile(provider, profile) {
    const key = `${provider}:default`;
    this.profiles.set(key, {
      provider,
      key: profile,
      addedAt: new Date().toISOString()
    });
    this.providers.add(provider);
    return this.saveAuthProfiles();
  }
  
  /**
   * 获取认证配置
   */
  getProfile(provider) {
    const key = `${provider}:default`;
    const profile = this.profiles.get(key);
    if (!profile) return null;
    return profile.key;
  }
  
  /**
   * 获取所有已认证的提供商
   */
  getAuthenticatedProviders() {
    return Array.from(this.providers);
  }
  
  /**
   * 检查提供商是否已认证
   */
  isProviderAuthenticated(provider) {
    return this.providers.has(provider);
  }
  
  /**
   * 移除认证配置
   */
  removeProfile(provider) {
    const key = `${provider}:default`;
    if (this.profiles.delete(key)) {
      this.providers.delete(provider);
      return this.saveAuthProfiles();
    }
    return false;
  }
  
  /**
   * 启动 Chrome 调试模式
   */
  async startChromeDebug(platforms = []) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'start-chrome-debug.sh');
      
      if (!fs.existsSync(scriptPath)) {
        reject(new Error('start-chrome-debug.sh not found'));
        return;
      }
      
      const args = [scriptPath];
      if (platforms.length > 0) {
        args.push(...platforms);
      }
      
      const child = spawn('bash', args, {
        detached: true,
        stdio: 'ignore'
      });
      
      child.unref();
      
      setTimeout(() => {
        resolve({ pid: child.pid, message: 'Chrome debug mode started' });
      }, 2000);
    });
  }
  
  /**
   * 运行 onboard 流程
   */
  async runOnboard(provider) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'onboard.sh');
      
      if (!fs.existsSync(scriptPath)) {
        reject(new Error('onboard.sh not found'));
        return;
      }
      
      const child = spawn('bash', [scriptPath, 'webauth'], {
        stdio: 'inherit'
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          this.loadAuthProfiles();
          resolve({ success: true, provider });
        } else {
          reject(new Error(`Onboard failed with code ${code}`));
        }
      });
      
      child.on('error', reject);
    });
  }
  
  /**
   * 获取认证状态摘要
   */
  getStatus() {
    const authenticated = this.getAuthenticatedProviders();
    
    return {
      stateDir: this.stateDir,
      authenticatedProviders: authenticated,
      totalProfiles: this.profiles.size,
      profiles: Array.from(this.profiles.entries()).map(([key, value]) => ({
        key,
        provider: value.provider,
        addedAt: value.addedAt
      }))
    };
  }
  
  /**
   * 同步到 auth.json (OpenClaw 内部格式)
   */
  syncToAuthJson() {
    try {
      const authData = {
        version: '1.0',
        profiles: {}
      };
      
      for (const [key, profile] of this.profiles.entries()) {
        authData.profiles[key] = {
          provider: profile.provider,
          key: profile.key
        };
      }
      
      fs.writeFileSync(this.authJsonPath, JSON.stringify(authData, null, 2));
      return true;
    } catch (error) {
      console.error('[AuthManager] 同步到 auth.json 失败:', error.message);
      return false;
    }
  }
  
  /**
   * 导出配置
   */
  export() {
    return {
      exportedAt: new Date().toISOString(),
      status: this.getStatus()
    };
  }
}

/**
 * 创建认证管理器实例
 */
function createAuthManager(options) {
  return new AuthManager(options);
}

/**
 * 默认实例
 */
let defaultAuthManager = null;

function getAuthManager(options) {
  if (!defaultAuthManager) {
    defaultAuthManager = new AuthManager(options);
    defaultAuthManager.loadAuthProfiles();
  }
  return defaultAuthManager;
}

module.exports = { AuthManager, createAuthManager, getAuthManager };
