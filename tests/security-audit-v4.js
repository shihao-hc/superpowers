/**
 * Security Audit v4 - Final Review
 * 最终安全审查
 */

const fs = require('fs');
const path = require('path');

class SecurityAuditV4 {
  constructor() {
    this.issues = [];
    this.fixes = [];
    this.timestamp = new Date().toISOString();
  }

  log(severity, category, message, file = null, line = null) {
    const issue = { severity, category, message, file, line, timestamp: this.timestamp };
    this.issues.push(issue);

    const icon = severity === 'CRITICAL' ? '🔴' : severity === 'HIGH' ? '🟠' : severity === 'MEDIUM' ? '🟡' : '🟢';
    const location = file ? `${file}:${line || '?'}` : category;
    console.log(`${icon} [${severity}] [${location}] ${message}`);
  }

  async audit() {
    console.log('\n========================================');
    console.log('   Security Audit v4 - Final Review');
    console.log('========================================\n');

    await this.checkCommandExecution();
    await this.checkInputValidation();
    await this.checkAuthentication();
    await this.checkRateLimiting();
    await this.checkAuditLogging();
    await this.checkDependencies();
    await this.checkConfiguration();
    await this.checkContainerSecurity();

    this.printSummary();
  }

  async checkCommandExecution() {
    console.log('\n📋 Checking Command Execution Security...');

    const vulnerableFiles = [
      'src/core/tools/builtins/bash.ts',
      'src/core/tools/builtins/grep.ts',
      'src/commands/builtins/git.ts',
      'src/commands/builtins/search.ts',
      'src/commands/builtins/dev.ts'
    ];

    for (const file of vulnerableFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {continue;}

      const content = fs.readFileSync(filePath, 'utf8');

      // 检查是否使用模板字符串
      const templateLiteral = /execSync\s*\(`|\$\{[^}]+\}/g;
      if (templateLiteral.test(content)) {
        this.log('HIGH', 'Command Execution', 'Uses template literals - potential injection risk', file);
      }

      // 检查是否使用数组形式
      const arrayForm = /execSync\s*\(\s*['"][^'"]+['"]\s*,\s*\[/g;
      if (arrayForm.test(content)) {
        this.fixes.push({ file, type: 'Array Form', status: 'FIXED' });
      }

      // 检查是否验证输入
      const inputValidation = /[;&|`$<>()[\]{}]/g;
      if (inputValidation.test(content) && content.includes('replace')) {
        this.fixes.push({ file, type: 'Input Validation', status: 'FIXED' });
      }
    }
  }

  async checkInputValidation() {
    console.log('\n📋 Checking Input Validation...');

    const inputFiles = [
      'src/mcp/MCPClient.js',
      'src/api/client.ts',
      'src/security/InputValidator.js'
    ];

    for (const file of inputFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {continue;}

      const content = fs.readFileSync(filePath, 'utf8');

      // 检查 XSS 防护
      if (content.includes('xss') || content.includes('sanitize')) {
        this.log('INFO', 'Input Validation', 'XSS protection found', file);
      }

      // 检查 SQL 注入防护
      if (content.includes('parameterized') || content.includes('prepared')) {
        this.log('INFO', 'Input Validation', 'SQL injection protection found', file);
      }

      // 检查路径遍历防护
      if (content.includes('path.resolve') || content.includes('normalize')) {
        this.log('INFO', 'Input Validation', 'Path traversal protection found', file);
      }
    }
  }

  async checkAuthentication() {
    console.log('\n📋 Checking Authentication...');

    const authFiles = [
      'src/security/AuthManager.js',
      'src/api/auth.js'
    ];

    for (const file of authFiles) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {continue;}

      const content = fs.readFileSync(filePath, 'utf8');

      if (content.includes('JWT') || content.includes('jwt')) {
        this.log('INFO', 'Authentication', 'JWT authentication found', file);
      }

      if (content.includes('bcrypt') || content.includes('hash')) {
        this.log('INFO', 'Authentication', 'Password hashing found', file);
      }

      if (content.includes('rateLimit')) {
        this.log('INFO', 'Authentication', 'Rate limiting found', file);
      }
    }
  }

  async checkRateLimiting() {
    console.log('\n📋 Checking Rate Limiting...');

    const rateLimiterPath = path.join(process.cwd(), 'src/security/CommandRateLimiter.js');
    if (fs.existsSync(rateLimiterPath)) {
      this.log('PASS', 'Rate Limiting', 'CommandRateLimiter.js found');
      this.fixes.push({ file: 'src/security/CommandRateLimiter.js', type: 'Rate Limiter', status: 'IMPLEMENTED' });
    } else {
      this.log('HIGH', 'Rate Limiting', 'CommandRateLimiter not found');
    }

    // 检查 docker-compose 中的速率限制配置
    const composePath = path.join(process.cwd(), 'docker-compose.prod.yml');
    if (fs.existsSync(composePath)) {
      const content = fs.readFileSync(composePath, 'utf8');
      if (content.includes('rate_limit') || content.includes('rate-limit')) {
        this.log('PASS', 'Rate Limiting', 'Rate limiting configured in docker-compose');
      }
    }
  }

  async checkAuditLogging() {
    console.log('\n📋 Checking Audit Logging...');

    const auditLoggerPath = path.join(process.cwd(), 'src/security/AuditLogger.js');
    if (fs.existsSync(auditLoggerPath)) {
      this.log('PASS', 'Audit Logging', 'AuditLogger.js found');
      this.fixes.push({ file: 'src/security/AuditLogger.js', type: 'Audit Logging', status: 'IMPLEMENTED' });

      const content = fs.readFileSync(auditLoggerPath, 'utf8');

      // 检查日志事件类型
      const events = ['COMMAND_EXEC', 'COMMAND_BLOCKED', 'SHELL_INJECTION_DETECTED', 'RATE_LIMIT_EXCEEDED'];
      for (const event of events) {
        if (content.includes(event)) {
          this.log('PASS', 'Audit Logging', `Event type: ${event}`);
        }
      }
    } else {
      this.log('CRITICAL', 'Audit Logging', 'AuditLogger not found');
    }
  }

  async checkDependencies() {
    console.log('\n📋 Checking Dependencies...');

    const packagePath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packagePath)) {return;}

    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    const securityDeps = [
      'helmet',
      'express-rate-limit',
      'bcrypt',
      'jsonwebtoken'
    ];

    for (const dep of securityDeps) {
      if (pkg.dependencies && pkg.dependencies[dep]) {
        this.log('PASS', 'Dependencies', `${dep}@${pkg.dependencies[dep]} installed`);
      }
      if (pkg.devDependencies && pkg.devDependencies[dep]) {
        this.log('PASS', 'Dependencies', `${dep}@${pkg.devDependencies[dep]} installed (dev)`);
      }
    }
  }

  async checkConfiguration() {
    console.log('\n📋 Checking Security Configuration...');

    // 检查 .env 权限
    const envFiles = ['.env', '.env.production', '.env.example'];
    for (const envFile of envFiles) {
      const envPath = path.join(process.cwd(), envFile);
      if (fs.existsSync(envPath)) {
        this.log('INFO', 'Configuration', `${envFile} exists`);
      }
    }

    // 检查 Docker 安全配置
    const dockerPath = path.join(process.cwd(), 'deploy/Dockerfile.multi');
    if (fs.existsSync(dockerPath)) {
      const content = fs.readFileSync(dockerPath, 'utf8');

      if (content.includes('USER opencode') || content.includes('adduser')) {
        this.log('PASS', 'Container Security', 'Non-root user configured');
      }

      if (content.includes('HEALTHCHECK')) {
        this.log('PASS', 'Container Security', 'Health check configured');
      }
    }
  }

  async checkContainerSecurity() {
    console.log('\n📋 Checking Container Security...');

    // 检查 Kubernetes 安全上下文
    const helmValuesPath = path.join(process.cwd(), 'deploy/helm/opencode/values.yaml');
    if (fs.existsSync(helmValuesPath)) {
      const content = fs.readFileSync(helmValuesPath, 'utf8');

      if (content.includes('runAsNonRoot')) {
        this.log('PASS', 'Container Security', 'runAsNonRoot configured');
      }

      if (content.includes('readOnlyRootFilesystem')) {
        this.log('PASS', 'Container Security', 'readOnlyRootFilesystem configured');
      }

      if (content.includes('NetworkPolicy')) {
        this.log('PASS', 'Container Security', 'NetworkPolicy configured');
      }
    }
  }

  printSummary() {
    console.log('\n========================================');
    console.log('   Security Audit Summary');
    console.log('========================================\n');

    const bySeverity = {
      CRITICAL: this.issues.filter((i) => i.severity === 'CRITICAL'),
      HIGH: this.issues.filter((i) => i.severity === 'HIGH'),
      MEDIUM: this.issues.filter((i) => i.severity === 'MEDIUM'),
      INFO: this.issues.filter((i) => i.severity === 'INFO'),
      PASS: this.issues.filter((i) => i.severity === 'PASS')
    };

    console.log('Issues by Severity:');
    console.log('| Severity | Count |');
    console.log('|----------|-------|');
    for (const [severity, issues] of Object.entries(bySeverity)) {
      const icon = severity === 'CRITICAL' ? '🔴' : severity === 'HIGH' ? '🟠' : severity === 'MEDIUM' ? '🟡' : severity === 'PASS' ? '✅' : 'ℹ️';
      console.log(`| ${icon} ${severity} | ${issues.length} |`);
    }

    console.log('\nFixes Applied:');
    console.log('| Component | Type | Status |');
    console.log('|----------|------|--------|');
    for (const fix of this.fixes) {
      console.log(`| ${fix.file} | ${fix.type} | ${fix.status} |`);
    }

    const hasCritical = bySeverity.CRITICAL.length > 0;
    const hasHigh = bySeverity.HIGH.length > 0;

    console.log('\n----------------------------------------');
    if (hasCritical) {
      console.log('🔴 Security Status: CRITICAL ISSUES FOUND');
    } else if (hasHigh) {
      console.log('🟠 Security Status: HIGH RISK ISSUES FOUND');
    } else {
      console.log('🟢 Security Status: PASSED');
    }
    console.log('----------------------------------------\n');
  }
}

// Run audit
const audit = new SecurityAuditV4();
audit.audit()
  .then(() => {
    const hasIssues = audit.issues.some((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH');
    process.exit(hasIssues ? 1 : 0);
  })
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
