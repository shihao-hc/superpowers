// Phase 15: Integration Testing Framework
// End-to-end integration testing for all components

class IntegrationTestRunner {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  registerTest(name, testFn) {
    this.tests.push({ name, fn: testFn });
  }

  async runAll() {
    console.log(`Running ${this.tests.length} integration tests...`);
    
    for (const test of this.tests) {
      try {
        const start = Date.now();
        await test.fn();
        const duration = Date.now() - start;
        
        this.results.push({
          name: test.name,
          status: 'passed',
          duration,
          timestamp: new Date().toISOString()
        });
        console.log(`✓ ${test.name}`);
      } catch (error) {
        this.results.push({
          name: test.name,
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        console.log(`✗ ${test.name}: ${error.message}`);
      }
    }

    return this.generateReport();
  }

  generateReport() {
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    
    return {
      total: this.tests.length,
      passed,
      failed,
      successRate: `${((passed / this.tests.length) * 100).toFixed(2)}%`,
      results: this.results
    };
  }
}

// Register integration tests
const runner = new IntegrationTestRunner();

// Test 1: Plugin System
runner.registerTest('Plugin Governance', async () => {
  const { PluginGovernance } = require('../plugin-governance/GovernanceCore');
  const gov = new PluginGovernance();
  gov.registerPolicy('test-plugin', { allowedActions: ['read', 'write'] });
  const policy = gov.getPolicy('test-plugin');
  if (!policy) throw new Error('Policy not registered');
});

// Test 2: Auto Update
runner.registerTest('Auto Update System', async () => {
  const { AutoUpdateSystem } = require('../auto-update/AutoUpdater');
  const updater = new AutoUpdateSystem({ autoApply: false });
  const update = await updater.checkForUpdates();
  if (!update) throw new Error('Update check failed');
});

// Test 3: Distributed Coordination
runner.registerTest('Distributed Coordinator', async () => {
  const { DistributedCoordinator } = require('../distributed/Coordinator');
  const coord = new DistributedCoordinator();
  coord.registerNode('node-1', { name: 'Test Node' });
  const nodes = coord.getActiveNodes();
  if (nodes.length !== 1) throw new Error('Node registration failed');
});

// Test 4: Security
runner.registerTest('Security Hardening', async () => {
  const { SecurityHardening } = require('../security/SecurityHardening');
  const sec = new SecurityHardening();
  const vulns = await sec.scanDependencies();
  if (!Array.isArray(vulns)) throw new Error('Security scan failed');
});

// Test 5: Performance
runner.registerTest('Performance Optimizer', async () => {
  const { PerformanceOptimizer } = require('../performance/Optimizer');
  const perf = new PerformanceOptimizer();
  perf.recordMetric('latency', 100);
  const avg = perf.getAverage('latency');
  if (avg !== 100) throw new Error('Metric recording failed');
});

// Export for CLI usage
module.exports = { IntegrationTestRunner, runner };
