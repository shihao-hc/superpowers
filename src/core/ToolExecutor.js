/**
 * ToolExecutor - 工具执行器
 *
 * 让AI能够真正执行代码、运行命令、测试
 * 超越"说"的阶段，进入"做"的阶段
 */

const { safeSpawn } = require('../utils/SafeExec');
const fs = require('fs');
const path = require('path');

class ToolExecutor {
  constructor(brainSystem) {
    this.brain = brainSystem;

    // 可用工具
    this.tools = {
      node: {
        name: 'Node.js',
        description: '运行JavaScript代码',
        extensions: ['.js', '.mjs'],
        execute: this._executeNode.bind(this)
      },
      command: {
        name: 'Shell命令',
        description: '执行Shell命令',
        execute: this._executeCommand.bind(this)
      },
      test: {
        name: '测试',
        description: '运行测试',
        execute: this._executeTest.bind(this)
      },
      lint: {
        name: '代码检查',
        description: '运行linting',
        execute: this._executeLint.bind(this)
      }
    };

    // 执行历史
    this.history = [];
    this.maxHistory = 50;

    // 安全白名单
    this.safeCommands = new Set([
      'node', 'npm', 'git', 'echo', 'pwd', 'ls', 'dir', 'type', 'cat', 'cd'
    ]);

    console.log('[ToolExecutor] 工具执行器已初始化');

    // 自动初始化测试
    this._initAutoTest();
  }

  /**
   * 执行代码
   */
  async execute(code, options = {}) {
    const execution = {
      id: Date.now().toString(36),
      code: code.substring(0, 100),
      startTime: Date.now(),
      success: false,
      output: null,
      error: null,
      duration: 0
    };

    try {
      // 检测语言
      const lang = this._detectLanguage(code);

      switch (lang) {
      case 'javascript':
        execution.output = await this._executeNode(code, options);
        break;
      case 'shell':
        execution.output = await this._executeCommand(code, options);
        break;
      default:
        execution.output = '不支持的语言类型';
      }

      execution.success = true;

    } catch (e) {
      execution.error = e.message;
      execution.success = false;
    }

    execution.duration = Date.now() - execution.startTime;
    this._record(execution);

    return execution;
  }

  /**
   * 执行Node.js代码
   */
  async _executeNode(code, options = {}) {
    return new Promise((resolve, reject) => {
      const tempFile = path.join(process.cwd(), '.temp', `exec-${Date.now()}.js`);
      const dir = path.dirname(tempFile);

      // 确保目录存在
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入临时文件
      fs.writeFileSync(tempFile, code);

      // 执行
      const child = safeSpawn('node', [tempFile], {
        cwd: process.cwd(),
        timeout: options.timeout || 30000
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => stdout += d);
      child.stderr.on('data', (d) => stderr += d);

      child.on('close', (code) => {
        // 清理临时文件，忽略不存在错误
        try { fs.unlinkSync(tempFile); } catch (e) { /* 忽略 */ }

        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr.trim() || `Exit code: ${code}`));
        }
      });

      child.on('error', (e) => {
        // 清理临时文件，忽略不存在错误
        try { fs.unlinkSync(tempFile); } catch (e) { /* 忽略错误 */ }
        reject(e);
      });
    });
  }

  /**
   * 执行命令
   */
  async _executeCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      // 安全检查
      const cmd = command.trim().split(/\s+/)[0];

      if (!this._isSafeCommand(cmd)) {
        reject(new Error(`不安全命令: ${cmd}`));
        return;
      }

      const args = command.trim().split(/\s+/).slice(1);
      const child = safeSpawn(cmd, args, {
        cwd: options.cwd || process.cwd(),
        timeout: options.timeout || 30000
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => stdout += d);
      child.stderr.on('data', (d) => stderr += d);

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr.trim() || `Exit code: ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * 安全性检查
   */
  _isSafeCommand(cmd) {
    // 基础安全检查
    const dangerous = ['rm -rf', 'format', 'del /', 'mkfs', 'dd if='];
    for (const d of dangerous) {
      if (cmd.includes(d)) {return false;}
    }

    // 白名单
    if (this.safeCommands.has(cmd) || cmd.startsWith('echo')) {
      return true;
    }

    // 允许npm script
    if (cmd.startsWith('npm ')) {return true;}

    return false;
  }

  /**
   * 检测语言
   */
  _detectLanguage(code) {
    if (code.includes('function') || code.includes('const ') || code.includes('require(')) {
      return 'javascript';
    }
    if (code.includes('echo') || code.includes('ls') || code.includes('git')) {
      return 'shell';
    }
    return 'unknown';
  }

  /**
   * 运行测试
   */
  async _executeTest() {
    return new Promise((resolve, reject) => {
      const child = safeSpawn('npm', ['test'], {
        cwd: process.cwd(),
        timeout: 60000,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let testOut = '';
      let testErr = '';
      child.stdout.on('data', (d) => testOut += d);
      child.stderr.on('data', (d) => testErr += d);
      child.on('close', (code) => {
        if (code === 0) {resolve(testOut);}
        else {reject(new Error(testErr || `Exit code: ${code}`));}
      });
      child.on('error', reject);
    });
  }

  /**
   * 运行lint
   */
  async _executeLint() {
    return new Promise((resolve, reject) => {
      const child = safeSpawn('npm', ['run', 'lint'], {
        cwd: process.cwd(),
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let lintOut = '';
      let lintErr = '';
      child.stdout.on('data', (d) => lintOut += d);
      child.stderr.on('data', (d) => lintErr += d);
      child.on('close', (code) => {
        if (code === 0) {resolve(lintOut);}
        else {reject(new Error(lintErr || `Exit code: ${code}`));}
      });
      child.on('error', reject);
    });
  }

  /**
   * 记录执行历史
   */
  _record(execution) {
    this.history.push(execution);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  /**
   * 自动初始化测试
   */
  _initAutoTest() {
    try {
      // 检查是否有package.json
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        // 检查可用的npm scripts
        this.scripts = Object.keys(pkg.scripts || {});
        console.log(`[ToolExecutor] 发现 ${this.scripts.length} 个可执行脚本`);
      }
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 获取统计
   */
  getStats() {
    const total = this.history.length;
    const success = this.history.filter((h) => h.success).length;
    return {
      total,
      success,
      successRate: total > 0 ? `${Math.round((success / total) * 100)}%` : '0%'
    };
  }

  /**
   * 诊断
   */
  diagnose() {
    return {
      tools: Object.keys(this.tools).length,
      scripts: this.scripts?.length || 0,
      history: this.history.length,
      health: 'operational'
    };
  }
}

module.exports = ToolExecutor;