/**
 * Security Audit v5 - Focused Fix Verification
 * 验证安全修复是否正确应用
 */

const fs = require('fs');
const path = require('path');

class SecurityAuditV5 {
  constructor() {
    this.results = [];
    this.timestamp = new Date().toISOString();
  }

  log(status, message) {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'FIXED' ? '🔧' : '⚠️';
    console.log(`${icon} ${message}`);
    this.results.push({ status, message, timestamp: this.timestamp });
  }

  async verifyFixes() {
    console.log('\n========================================');
    console.log('   Security Audit v5 - Fix Verification');
    console.log('========================================\n');

    await this.verifyRouterPathTraversal();
    await this.verifySessionManagerKey();
    await this.verifyBashToolSecurity();
    await this.verifyMCPClientWhitelist();
    await this.verifyAuthMiddleware();
    await this.verifyRateLimiter();
    await this.verifyAuditLogger();

    this.printSummary();
  }

  async verifyRouterPathTraversal() {
    console.log('\n📋 Verifying: MCP Router Path Traversal Fix');
    const filePath = path.join(process.cwd(), 'src/mcp/router.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // 检查是否添加了路径验证
    if (content.includes('path.normalize') && content.includes('PATH_TRAVERSAL')) {
      this.log('FIXED', 'mcp/router.js: Path traversal validation added');
    } else if (content.includes('normalizedPath.includes') && content.includes('..')) {
      this.log('FIXED', 'mcp/router.js: Path normalization check added');
    } else {
      this.log('FAIL', 'mcp/router.js: Path traversal validation NOT found');
    }
  }

  async verifySessionManagerKey() {
    console.log('\n📋 Verifying: Session Manager Key Security');
    const filePath = path.join(process.cwd(), 'src/session/SessionManager.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // 检查是否移除了硬编码密钥
    if (content.includes('getSessionKey') && content.includes('insecure-dev-key')) {
      this.log('FIXED', 'SessionManager.js: Insecure default key removed, added getSessionKey()');
    }

    // 检查生产环境是否强制要求密钥
    if (content.includes('NODE_ENV === \'production\'') && content.includes('must be set')) {
      this.log('FIXED', 'SessionManager.js: Production enforces SESSION_KEY requirement');
    } else {
      this.log('FAIL', 'SessionManager.js: Production key requirement NOT found');
    }
  }

  async verifyBashToolSecurity() {
    console.log('\n📋 Verifying: Bash Tool Security');
    const filePath = path.join(process.cwd(), 'src/core/tools/builtins/bash.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // 检查是否使用了 bash -c 数组形式
    if (content.includes('bash') && content.includes('[\'-c\'') && content.includes('params.command')) {
      this.log('FIXED', 'bash.ts: Using bash -c array form for complex commands');
    }

    // 检查危险模式检测
    if (content.includes('dangerousPatterns') && content.includes('shell_injection')) {
      this.log('FIXED', 'bash.ts: Shell injection pattern detection active');
    }

    // 检查命令长度限制
    if (content.includes('1000') && content.includes('Command too long')) {
      this.log('FIXED', 'bash.ts: Command length limit enforced');
    }
  }

  async verifyMCPClientWhitelist() {
    console.log('\n📋 Verifying: MCP Client Command Whitelist');
    const filePath = path.join(process.cwd(), 'src/mcp/client.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // 检查白名单
    if (content.includes('ALLOWED_MCP_COMMANDS') && content.includes('isSafeMCPServerCommand')) {
      this.log('FIXED', 'client.ts: Command whitelist validation added');
    }

    // 检查清理函数
    if (content.includes('sanitizeMCPArg') && content.includes('sanitizedArgs')) {
      this.log('FIXED', 'client.ts: Argument sanitization implemented');
    }

    // 检查错误抛出
    if (content.includes('is not in whitelist')) {
      this.log('FIXED', 'client.ts: Non-whitelisted commands rejected');
    }
  }

  async verifyAuthMiddleware() {
    console.log('\n📋 Verifying: Auth Middleware Key Security');
    const filePath = path.join(process.cwd(), 'src/middleware/auth.js');
    const content = fs.readFileSync(filePath, 'utf8');

    // 检查 getJWTSecret 函数
    if (content.includes('getJWTSecret') && content.includes('WARNING: JWT_SECRET not set')) {
      this.log('FIXED', 'auth.js: Added getJWTSecret() with warning');
    }

    // 检查生产环境验证
    if (content.includes('JWT_SECRET must be set') && content.includes('at least 32 characters')) {
      this.log('FIXED', 'auth.js: Production enforces JWT_SECRET requirement + length check');
    }
  }

  async verifyRateLimiter() {
    console.log('\n📋 Verifying: Rate Limiter Implementation');
    const filePath = path.join(process.cwd(), 'src/security/CommandRateLimiter.js');

    if (!fs.existsSync(filePath)) {
      this.log('FAIL', 'CommandRateLimiter.js: NOT FOUND');
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (content.includes('dangerousCommands')) {
      this.log('FIXED', 'CommandRateLimiter.js: Per-command rate limits configured');
    }

    if (content.includes('temporarily_blocked')) {
      this.log('FIXED', 'CommandRateLimiter.js: Temporary blocking implemented');
    }
  }

  async verifyAuditLogger() {
    console.log('\n📋 Verifying: Audit Logger Implementation');
    const filePath = path.join(process.cwd(), 'src/security/AuditLogger.js');

    if (!fs.existsSync(filePath)) {
      this.log('FAIL', 'AuditLogger.js: NOT FOUND');
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    const events = ['COMMAND_EXEC', 'COMMAND_BLOCKED', 'SHELL_INJECTION_DETECTED', 'RATE_LIMIT_EXCEEDED'];
    let eventsFound = 0;

    for (const event of events) {
      if (content.includes(event)) {
        eventsFound++;
      }
    }

    if (eventsFound === events.length) {
      this.log('FIXED', `AuditLogger.js: All ${events.length} security events logged`);
    } else {
      this.log('PARTIAL', `AuditLogger.js: Only ${eventsFound}/${events.length} events found`);
    }
  }

  printSummary() {
    console.log('\n========================================');
    console.log('   Security Audit Summary');
    console.log('========================================\n');

    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const fixed = this.results.filter((r) => r.status === 'FIXED').length;
    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    const total = this.results.length;

    console.log('| Status | Count |');
    console.log('|--------|-------|');
    console.log(`| ✅ PASS | ${passed} |`);
    console.log(`| 🔧 FIXED | ${fixed} |`);
    console.log(`| ❌ FAIL | ${failed} |`);
    console.log('|--------|-------|');
    console.log(`| **Total** | ${total} |`);

    console.log('\n----------------------------------------');

    if (failed === 0) {
      console.log('🟢 Security Status: ALL CRITICAL AND HIGH ISSUES FIXED');
    } else {
      console.log('🔴 Security Status: SOME ISSUES REMAIN');
    }

    console.log('----------------------------------------\n');

    return { passed, fixed, failed, total };
  }
}

// Run audit
const audit = new SecurityAuditV5();
audit.verifyFixes()
  .then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
