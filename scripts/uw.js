#!/usr/bin/env node

// UltraWork CLI - Main entry point for all phases

const { IntegrationTestRunner, runner } = require('../src/integration/IntegrationTests');

const commands = {
  'phase11:governance': async () => {
    const { PluginGovernance } = require('../src/plugin-governance/GovernanceCore');
    const gov = new PluginGovernance();
    gov.registerPolicy('default', { allowedActions: ['read', 'write', 'execute'] });
    console.log('Phase 11: Plugin Governance initialized');
    return gov;
  },

  'phase11:update': async () => {
    const { AutoUpdateSystem } = require('../src/auto-update/AutoUpdater');
    const updater = new AutoUpdateSystem();
    const update = await updater.checkForUpdates();
    console.log('Phase 11: Auto-Update check:', update);
    return updater;
  },

  'phase12:coord': async () => {
    const { DistributedCoordinator } = require('../src/distributed/Coordinator');
    const coord = new DistributedCoordinator();
    coord.registerNode('local-node', { name: 'Local Coordinator' });
    console.log('Phase 12: Distributed Coordinator initialized');
    return coord;
  },

  'phase13:security': async () => {
    const { SecurityHardening } = require('../src/security/SecurityHardening');
    const sec = new SecurityHardening();
    const vulns = await sec.scanDependencies();
    console.log('Phase 13: Security scan found', vulns.length, 'issues');
    return sec;
  },

  'phase14:perf': async () => {
    const { PerformanceOptimizer } = require('../src/performance/Optimizer');
    const perf = new PerformanceOptimizer();
    perf.recordMetric('latency', Math.random() * 100);
    console.log('Phase 14: Performance optimizer running');
    return perf;
  },

  'phase15:test': async () => {
    console.log('Phase 15: Running integration tests...');
    const report = await runner.runAll();
    console.log('\nIntegration Test Report:');
    console.log(JSON.stringify(report, null, 2));
    return report;
  },

  'all': async () => {
    console.log('Running all UltraWork phases...\n');
    
    for (const [name, fn] of Object.entries(commands)) {
      if (name === 'all') continue;
      try {
        await fn();
      } catch (e) {
        console.error(`Error in ${name}:`, e.message);
      }
    }
    
    console.log('\nRunning integration tests...');
    await runner.runAll();
    console.log('\nUltraWork All Phases Complete!');
  }
};

// CLI Handler
const args = process.argv.slice(2);
const command = args[0] || 'all';

if (commands[command]) {
  commands[command]()
    .then(result => {
      if (result && result.generateReport) {
        console.log('\nReport:', JSON.stringify(result.generateReport(), null, 2));
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
} else {
  console.log('UltraWork CLI');
  console.log('=============');
  console.log('Available commands:');
  Object.keys(commands).forEach(cmd => {
    console.log(`  ultrawork ${cmd}`);
  });
  process.exit(1);
}
