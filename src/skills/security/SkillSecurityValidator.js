/**
 * Skill Security Validator
 * 基于 learn-eval 安全最佳实践的技能安全验证
 *
 * 安全规则:
 * 1. 禁止模板字符串与 execSync 混用
 * 2. 始终验证用户输入的 shell 特殊字符
 * 3. 使用数组形式: execSync('cmd', ['arg1', 'arg2'])
 * 4. 阻止危险字符: ; & | $ ` < >
 */

const fs = require('fs');
const path = require('path');

const DANGEROUS_PATTERNS = {
  shellInjection: [
    { pattern: /\$\([^)]+\)/g, name: 'Command Substitution $(...)' },
    { pattern: /`[^`]+`/g, name: 'Backtick Command' },
    { pattern: /;\s*(rm|del|rmdir)/gi, name: 'Command Chaining with rm' },
    { pattern: /&&\s*(rm|del|rmdir)/gi, name: 'AND Chaining with rm' },
    { pattern: /\|\s*(cat|grep|awk)/gi, name: 'Pipe to sensitive commands' },
    { pattern: /eval\s*\(/gi, name: 'Eval usage' },
    { pattern: /exec\s*\(/gi, name: 'Exec usage' },
    { pattern: /child_process.*execSync.*\$/g, name: 'execSync with variable' },
    { pattern: /child_process.*spawn.*\$/g, name: 'spawn with variable' }
  ],

  pathTraversal: [
    { pattern: /\.\.\/+/g, name: 'Parent directory traversal' },
    { pattern: /\.\.\\+/g, name: 'Windows parent directory traversal' },
    { pattern: /%env%/gi, name: 'Environment variable in path' }
  ],

  dangerousImports: [
    { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/g, name: 'child_process import' },
    { pattern: /import\s+.*from\s+['"]child_process['"]/g, name: 'child_process ES import' }
  ]
};

const ALLOWED_COMMANDS = new Set([
  'node', 'npm', 'npx', 'python', 'python3', 'pip', 'git',
  'docker', 'docker-compose', 'kubectl',
  'curl', 'wget', 'zip', 'unzip', 'tar',
  'mkdir', 'cp', 'mv', 'ls', 'cat', 'echo', 'pwd', 'cd'
]);

const COMMAND_BLACKLIST = new Set([
  'rm', 'del', 'rmdir', 'format', 'fdisk', 'dd',
  'shutdown', 'reboot', 'halt', 'poweroff',
  'net', 'netsh', 'reg', 'regedit'
]);

class SkillSecurityValidator {
  constructor(options = {}) {
    this.strictMode = options.strictMode !== false;
    this.allowChildProcess = options.allowChildProcess || false;
    this.commandWhitelist = options.commandWhitelist || ALLOWED_COMMANDS;
    this.commandBlacklist = options.commandBlacklist || COMMAND_BLACKLIST;
    this.scanScripts = options.scanScripts !== false;
    this.quarantineDir = options.quarantineDir || path.join(process.cwd(), '.opencode', 'quarantine');

    this.violations = [];
    this.warnings = [];
    this.quarantined = new Set();
  }

  /**
   * 验证技能文件
   */
  validateSkill(skillPath) {
    this.violations = [];
    this.warnings = [];

    if (!fs.existsSync(skillPath)) {
      return { valid: false, error: 'Skill path does not exist' };
    }

    const files = this._getSkillFiles(skillPath);

    for (const file of files) {
      if (this.scanScripts && this._isScriptFile(file)) {
        this._validateScriptFile(file);
      }
    }

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      this._validateSkillMetadata(skillMdPath);
    }

    return {
      valid: this.violations.length === 0,
      violations: this.violations,
      warnings: this.warnings,
      quarantined: Array.from(this.quarantined),
      canLoad: this.violations.filter((v) => v.severity === 'CRITICAL').length === 0
    };
  }

  /**
   * 获取技能文件
   */
  _getSkillFiles(skillPath) {
    const files = [];

    const scanDir = (dir) => {
      if (!fs.existsSync(dir)) {return;}

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (['scripts', 'references', 'assets'].includes(entry.name)) {
              scanDir(fullPath);
            }
          } else {
            files.push(fullPath);
          }
        }
      } catch (e) {
        this.warnings.push({ file: dir, message: `Cannot read directory: ${e.message}` });
      }
    };

    scanDir(skillPath);
    return files;
  }

  /**
   * 检查是否为脚本文件
   */
  _isScriptFile(file) {
    const ext = path.extname(file).toLowerCase();
    return ['.js', '.ts', '.sh', '.bash', '.ps1', '.py', '.rb'].includes(ext);
  }

  /**
   * 验证脚本文件
   */
  _validateScriptFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);

      for (const category in DANGEROUS_PATTERNS) {
        for (const rule of DANGEROUS_PATTERNS[category]) {
          const matches = content.match(rule.pattern);
          if (matches) {
            const severity = category === 'shellInjection' ? 'CRITICAL' : 'HIGH';

            if (this.strictMode && severity === 'CRITICAL') {
              this.violations.push({
                file: relativePath,
                severity,
                type: rule.name,
                pattern: rule.pattern.toString(),
                matches: matches.length,
                message: `Found ${matches.length} instances of dangerous pattern: ${rule.name}`
              });

              if (category === 'shellInjection') {
                this._quarantineFile(filePath);
              }
            } else {
              this.warnings.push({
                file: relativePath,
                severity,
                type: rule.name,
                matches: matches.length
              });
            }
          }
        }
      }

      if (!this.allowChildProcess) {
        this._checkCommandUsage(content, relativePath);
      }
    } catch (e) {
      this.warnings.push({ file: filePath, message: `Cannot read file: ${e.message}` });
    }
  }

  /**
   * 检查命令使用
   */
  _checkCommandUsage(content, filePath) {
    const execSyncPattern = /execSync\s*\(\s*['"`]/g;
    const spawnPattern = /spawn\s*\(\s*['"`]/g;

    if (execSyncPattern.test(content)) {
      if (!this._isArrayForm(content, 'execSync')) {
        this.violations.push({
          file: filePath,
          severity: 'CRITICAL',
          type: 'execSync without array form',
          message: 'execSync must use array form: execSync("cmd", ["arg1", "arg2"])'
        });
      }
    }

    if (spawnPattern.test(content)) {
      const commandMatch = content.match(/spawn\s*\(\s*['"]([^'"]+)['"]/);
      if (commandMatch) {
        const command = commandMatch[1];
        if (this.commandBlacklist.has(command)) {
          this.violations.push({
            file: filePath,
            severity: 'CRITICAL',
            type: 'Blacklisted command',
            command,
            message: `Command "${command}" is blacklisted`
          });
        }
      }
    }
  }

  /**
   * 检查是否使用数组形式
   */
  _isArrayForm(content, fnName) {
    const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escaped}\\s*\\(\\s*['"][^'"]+['"]\\s*,\\s*\\[`);
    return pattern.test(content);
  }

  /**
   * 验证技能元数据
   */
  _validateSkillMetadata(skillMdPath) {
    try {
      const content = fs.readFileSync(skillMdPath, 'utf8');

      if (content.includes('risk: high') || content.includes('riskLevel: high')) {
        this.warnings.push({
          file: 'SKILL.md',
          severity: 'MEDIUM',
          type: 'High Risk Skill',
          message: 'This skill is marked as high risk'
        });
      }

      const execMatch = content.match(/exec\w*\s*\(/gi);
      if (execMatch) {
        this.warnings.push({
          file: 'SKILL.md',
          severity: 'HIGH',
          type: 'Executable Code Reference',
          message: 'SKILL.md contains references to executable code'
        });
      }
    } catch (e) {
      this.warnings.push({ file: 'SKILL.md', message: `Cannot read: ${e.message}` });
    }
  }

  /**
   * 隔离危险文件
   */
  _quarantineFile(filePath) {
    if (!fs.existsSync(this.quarantineDir)) {
      fs.mkdirSync(this.quarantineDir, { recursive: true });
    }

    const fileName = path.basename(filePath);
    const timestamp = Date.now();
    const quarantinePath = path.join(this.quarantineDir, `${timestamp}_${fileName}`);

    try {
      fs.renameSync(filePath, quarantinePath);
      this.quarantined.add(filePath);
      this.violations.push({
        file: filePath,
        severity: 'CRITICAL',
        type: 'Quarantined',
        quarantinePath,
        message: `File moved to quarantine: ${quarantinePath}`
      });
    } catch (e) {
      this.violations.push({
        file: filePath,
        severity: 'CRITICAL',
        type: 'Quarantine Failed',
        message: `Failed to quarantine: ${e.message}`
      });
    }
  }

  /**
   * 验证 MCP 工具生成
   */
  validateMCPCommand(command, args) {
    if (typeof command !== 'string') {
      return { valid: false, error: 'Command must be a string' };
    }

    if (!this.commandWhitelist.has(command)) {
      return {
        valid: false,
        error: `Command "${command}" is not in whitelist`,
        allowed: Array.from(this.commandWhitelist)
      };
    }

    if (this.commandBlacklist.has(command)) {
      return {
        valid: false,
        error: `Command "${command}" is blacklisted`
      };
    }

    if (Array.isArray(args)) {
      for (const arg of args) {
        if (this._containsShellMetacharacters(arg)) {
          return {
            valid: false,
            error: `Argument contains shell metacharacters: ${arg}`,
            dangerousChars: this._getShellMetacharacters(arg)
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * 检查是否包含 shell 元字符
   */
  _containsShellMetacharacters(str) {
    const metachar = /[;&|`$<>()[\]{}*?!~\\]/;
    return metachar.test(str);
  }

  /**
   * 获取字符串中的 shell 元字符
   */
  _getShellMetacharacters(str) {
    const metachar = /[;&|`$<>()[\]{}*?!~\\]/g;
    const found = [];
    let match;
    while ((match = metachar.exec(str)) !== null) {
      if (!found.includes(match[0])) {
        found.push(match[0]);
      }
    }
    return found;
  }

  /**
   * 清理输入
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') {return input;}
    return input.replace(/[;&|`$<>()[\]{}*?!~\\]/g, '');
  }

  /**
   * 获取验证报告
   */
  getReport() {
    return {
      timestamp: new Date().toISOString(),
      strictMode: this.strictMode,
      violations: this.violations,
      warnings: this.warnings,
      quarantined: Array.from(this.quarantined),
      summary: {
        critical: this.violations.filter((v) => v.severity === 'CRITICAL').length,
        high: this.violations.filter((v) => v.severity === 'HIGH').length,
        medium: this.violations.filter((v) => v.severity === 'MEDIUM').length,
        warnings: this.warnings.length
      }
    };
  }

  /**
   * 重置状态
   */
  reset() {
    this.violations = [];
    this.warnings = [];
    this.quarantined.clear();
  }
}

module.exports = { SkillSecurityValidator, DANGEROUS_PATTERNS, ALLOWED_COMMANDS, COMMAND_BLACKLIST };
