/**
 * CI/CD Validation Script
 * 持续集成验证脚本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class CICDValidator {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  log(category, message, status = 'INFO') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'WARN' ? '⚠️' : 'ℹ️';
    console.log(`${icon} [${category}] ${message}`);
  }

  async runCommand(cmd, options = {}) {
    try {
      const output = execSync(cmd, {
        encoding: 'utf8',
        stdio: 'pipe',
        ...options
      });
      return { success: true, output };
    } catch (error) {
      return { success: false, error: error.message, output: error.stdout };
    }
  }

  async validateCodeQuality() {
    this.log('CODE-QUALITY', 'Starting code quality validation...');

    const checks = [
      { name: 'ESLint', cmd: 'npm run lint' },
      { name: 'TypeScript Check', cmd: 'npm run typecheck' },
      { name: 'Security Audit', cmd: 'npm audit --audit-level=high --omit=dev' }
    ];

    for (const check of checks) {
      this.log('CODE-QUALITY', `Running ${check.name}...`);
      const result = await this.runCommand(check.cmd);
      this.results.push({
        category: 'code-quality',
        name: check.name,
        status: result.success ? 'PASS' : 'FAIL',
        error: result.error
      });
      this.log('CODE-QUALITY', `${check.name}: ${result.success ? 'PASS' : 'FAIL'}`, result.success ? 'PASS' : 'FAIL');
    }
  }

  async validateUnitTests() {
    this.log('UNIT-TESTS', 'Running unit tests...');

    const result = await this.runCommand('npm test -- --reporter=json');
    const status = result.success ? 'PASS' : 'FAIL';

    this.results.push({
      category: 'unit-tests',
      name: 'Vitest Unit Tests',
      status,
      error: result.error
    });

    this.log('UNIT-TESTS', `Unit tests: ${status}`, status);
  }

  async validateDockerBuild() {
    this.log('DOCKER', 'Validating Docker build...');

    // Check Dockerfile exists
    const dockerfileExists = fs.existsSync(path.join(process.cwd(), 'deploy', 'Dockerfile.multi'));

    if (!dockerfileExists) {
      this.log('DOCKER', 'Dockerfile.multi not found', 'FAIL');
      this.results.push({
        category: 'docker',
        name: 'Dockerfile.multi',
        status: 'FAIL',
        error: 'File not found'
      });
      return;
    }

    // Check docker-compose files
    const composeFiles = [
      'docker-compose.yml',
      'docker-compose.prod.yml',
      'docker-compose.dev.yml'
    ];

    for (const file of composeFiles) {
      const exists = fs.existsSync(path.join(process.cwd(), file));
      this.results.push({
        category: 'docker',
        name: file,
        status: exists ? 'PASS' : 'FAIL',
        error: exists ? null : 'File not found'
      });
      this.log('DOCKER', `${file}: ${exists ? 'PASS' : 'FAIL'}`, exists ? 'PASS' : 'FAIL');
    }
  }

  async validateHelmCharts() {
    this.log('HELM', 'Validating Helm charts...');

    const chartPath = path.join(process.cwd(), 'deploy', 'helm', 'opencode');
    const requiredFiles = [
      'Chart.yaml',
      'values.yaml',
      'templates/deployment.yaml',
      'templates/_helpers.tpl'
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(chartPath, file);
      const exists = fs.existsSync(fullPath);
      this.results.push({
        category: 'helm',
        name: file,
        status: exists ? 'PASS' : 'FAIL',
        error: exists ? null : 'File not found'
      });
      this.log('HELM', `${file}: ${exists ? 'PASS' : 'FAIL'}`, exists ? 'PASS' : 'FAIL');
    }
  }

  async validateCICD() {
    this.log('CI-CD', 'Validating CI/CD pipeline...');

    const workflowPath = path.join(process.cwd(), '.github', 'workflows');
    const workflowExists = fs.existsSync(workflowPath);

    this.results.push({
      category: 'cicd',
      name: 'GitHub Workflows Directory',
      status: workflowExists ? 'PASS' : 'FAIL',
      error: workflowExists ? null : 'Directory not found'
    });

    if (workflowExists) {
      const files = fs.readdirSync(workflowPath).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
      this.log('CI-CD', `Found ${files.length} workflow files: ${files.join(', ')}`);

      this.results.push({
        category: 'cicd',
        name: 'Workflow Files',
        status: 'PASS',
        details: files
      });
    }
  }

  async validateMonitoring() {
    this.log('MONITORING', 'Validating monitoring configuration...');

    const files = [
      'deploy/prometheus.yml',
      'docker-compose.prod.yml'
    ];

    for (const file of files) {
      const exists = fs.existsSync(path.join(process.cwd(), file));
      this.results.push({
        category: 'monitoring',
        name: file,
        status: exists ? 'PASS' : 'FAIL',
        error: exists ? null : 'File not found'
      });
      this.log('MONITORING', `${file}: ${exists ? 'PASS' : 'FAIL'}`, exists ? 'PASS' : 'FAIL');
    }

    // Check monitoring modules
    const monitorModules = [
      'src/monitoring/Metrics.js',
      'src/monitoring/HealthMonitor.js',
      'src/performance/PerformanceManager.js'
    ];

    for (const module of monitorModules) {
      const exists = fs.existsSync(path.join(process.cwd(), module));
      this.results.push({
        category: 'monitoring',
        name: module,
        status: exists ? 'PASS' : 'FAIL',
        error: exists ? null : 'Module not found'
      });
    }
  }

  async validateSecurity() {
    this.log('SECURITY', 'Validating security configuration...');

    const securityFiles = [
      'src/security/AuditLogger.js',
      'src/security/CommandRateLimiter.js',
      'src/skills/security/SkillSecurityValidator.js'
    ];

    for (const file of securityFiles) {
      const exists = fs.existsSync(path.join(process.cwd(), file));
      this.results.push({
        category: 'security',
        name: file,
        status: exists ? 'PASS' : 'FAIL',
        error: exists ? null : 'File not found'
      });
      this.log('SECURITY', `${file}: ${exists ? 'PASS' : 'FAIL'}`, exists ? 'PASS' : 'FAIL');
    }
  }

  async runAll() {
    console.log('\n========================================');
    console.log('   CI/CD Validation Pipeline');
    console.log('========================================\n');

    await this.validateCodeQuality();
    await this.validateUnitTests();
    await this.validateDockerBuild();
    await this.validateHelmCharts();
    await this.validateCICD();
    await this.validateMonitoring();
    await this.validateSecurity();

    this.printSummary();
  }

  printSummary() {
    console.log('\n========================================');
    console.log('   Validation Summary');
    console.log('========================================\n');

    const categories = {};
    for (const result of this.results) {
      if (!categories[result.category]) {
        categories[result.category] = { pass: 0, fail: 0, total: 0 };
      }
      categories[result.category].total++;
      if (result.status === 'PASS') {
        categories[result.category].pass++;
      } else {
        categories[result.category].fail++;
      }
    }

    let totalPass = 0;
    let totalFail = 0;

    console.log('| Category | Passed | Failed | Total | Status |');
    console.log('|----------|--------|--------|-------|--------|');

    for (const [category, stats] of Object.entries(categories)) {
      totalPass += stats.pass;
      totalFail += stats.fail;
      const status = stats.fail === 0 ? '🟢 PASS' : '🔴 FAIL';
      console.log(`| ${category} | ${stats.pass} | ${stats.fail} | ${stats.total} | ${status} |`);
    }

    console.log('\n----------------------------------------');
    console.log(`Total: ${totalPass} passed, ${totalFail} failed`);
    console.log(`Duration: ${Date.now() - this.startTime}ms`);

    // Print failed items
    if (totalFail > 0) {
      console.log('\n❌ Failed Checks:');
      for (const result of this.results.filter((r) => r.status !== 'PASS')) {
        console.log(`  - ${result.category}/${result.name}: ${result.error || 'Unknown error'}`);
      }
    }
  }
}

// Run validation
const validator = new CICDValidator();
validator.runAll()
  .then(() => {
    const hasFails = validator.results.some((r) => r.status === 'FAIL');
    process.exit(hasFails ? 1 : 0);
  })
  .catch((err) => {
    console.error('Validation failed:', err);
    process.exit(1);
  });
