/**
 * Monitoring Report Generator
 * 监控报告生成器
 */

const fs = require('fs');
const path = require('path');
const { Metrics } = require('../../src/monitoring/Metrics');
const { HealthMonitor } = require('../../src/monitoring/HealthMonitor');
const { PerformanceManager } = require('../../src/performance/PerformanceManager');

class MonitoringReport {
  constructor() {
    this.metrics = new Metrics();
    this.healthMonitor = new HealthMonitor();
    this.perfManager = new PerformanceManager();
    this.startTime = Date.now();
  }

  async generate() {
    const report = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development'
    };

    // System metrics
    report.system = this.collectSystemMetrics();

    // Memory metrics
    report.memory = this.collectMemoryMetrics();

    // Event loop lag
    report.eventLoop = this.collectEventLoopMetrics();

    // Application metrics
    report.application = this.collectApplicationMetrics();

    // Health status
    report.health = await this.collectHealthMetrics();

    // Performance thresholds
    report.performance = this.checkPerformanceThresholds();

    // Alerts
    report.alerts = this.generateAlerts(report);

    return report;
  }

  collectSystemMetrics() {
    const cpu = process.cpuUsage();
    return {
      cpu: {
        user: cpu.user / 1000000,  // Convert to seconds
        system: cpu.system / 1000000
      },
      loadAverage: typeof os !== 'undefined' ? os.loadavg() : null
    };
  }

  collectMemoryMetrics() {
    const mem = process.memoryUsage();
    const totalMem = typeof os !== 'undefined' ? os.totalmem() : 0;
    const freeMem = typeof os !== 'undefined' ? os.freemem() : 0;

    return {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,  // MB
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
      heapUsagePercent: Math.round(mem.heapUsed / mem.heapTotal * 10000) / 100,
      rss: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      external: Math.round(mem.external / 1024 / 1024 * 100) / 100,
      systemTotal: Math.round(totalMem / 1024 / 1024 / 1024 * 100) / 100,  // GB
      systemFree: Math.round(freeMem / 1024 / 1024 / 1024 * 100) / 100,
      systemUsagePercent: Math.round((1 - freeMem / totalMem) * 10000) / 100
    };
  }

  collectEventLoopMetrics() {
    const start = Date.now();

    return new Promise((resolve) => {
      setImmediate(() => {
        const lag = Date.now() - start;
        resolve({
          lagMs: lag,
          status: lag < 10 ? 'healthy' : lag < 50 ? 'warning' : 'critical'
        });
      });
    });
  }

  collectApplicationMetrics() {
    return {
      metricsCount: this.metrics.counters.size + this.metrics.gauges.size + this.metrics.histograms.size,
      requestsTotal: this.metrics.counter('requests_total').get(),
      errorsTotal: this.metrics.counter('errors_total').get(),
      uptimeMs: Date.now() - this.startTime
    };
  }

  async collectHealthMetrics() {
    // Register default health checks
    this.healthMonitor.registerCheck('memory', async () => {
      const mem = process.memoryUsage();
      return {
        heapUsedPercent: mem.heapUsed / mem.heapTotal,
        status: mem.heapUsed / mem.heapTotal < 0.9 ? 'ok' : 'warning'
      };
    }, { critical: true });

    this.healthMonitor.registerCheck('event-loop', async () => {
      const start = Date.now();
      await new Promise((resolve) => setImmediate(resolve));
      const lag = Date.now() - start;
      return {
        lagMs: lag,
        status: lag < 10 ? 'ok' : lag < 50 ? 'warning' : 'critical'
      };
    }, { critical: false });

    const result = await this.healthMonitor.runChecks();
    return {
      status: result.status,
      checks: result.checks,
      uptime: this.healthMonitor.getUptime()
    };
  }

  checkPerformanceThresholds() {
    const config = this.perfManager.exportConfig();
    const mem = process.memoryUsage();
    const memUsedMB = mem.heapUsed / 1024 / 1024;

    const thresholds = {
      memory: {
        threshold: config.agent.memoryLimitMB,
        current: memUsedMB,
        status: memUsedMB < config.agent.memoryLimitMB * 0.8 ? 'healthy' :
          memUsedMB < config.agent.memoryLimitMB ? 'warning' : 'critical'
      },
      mcp: {
        callTimeout: config.mcp.callTimeout,
        rateLimit: config.mcp.rateLimit
      },
      workflow: {
        maxConcurrent: config.workflow.maxConcurrent,
        cacheTTL: config.workflow.cacheTTL
      }
    };

    return thresholds;
  }

  generateAlerts(report) {
    const alerts = [];

    // Memory alerts
    if (report.memory.heapUsagePercent > 90) {
      alerts.push({
        severity: 'critical',
        type: 'MEMORY_HIGH',
        message: `Heap usage at ${report.memory.heapUsagePercent}%`,
        value: report.memory.heapUsagePercent
      });
    } else if (report.memory.heapUsagePercent > 80) {
      alerts.push({
        severity: 'warning',
        type: 'MEMORY_WARNING',
        message: `Heap usage at ${report.memory.heapUsagePercent}%`,
        value: report.memory.heapUsagePercent
      });
    }

    // Event loop alerts
    if (report.eventLoop.status === 'critical') {
      alerts.push({
        severity: 'critical',
        type: 'EVENT_LOOP_LAG',
        message: `Event loop lag: ${report.eventLoop.lagMs}ms`,
        value: report.eventLoop.lagMs
      });
    }

    // Health alerts
    if (report.health.status === 'unhealthy') {
      const failedChecks = Object.entries(report.health.checks)
        .filter(([, check]) => check.status === 'fail')
        .map(([name]) => name);

      alerts.push({
        severity: 'critical',
        type: 'HEALTH_CHECK_FAILED',
        message: `Failed checks: ${failedChecks.join(', ')}`,
        checks: failedChecks
      });
    }

    return alerts;
  }

  async generateMarkdownReport(report) {
    let md = '# Monitoring Report\n\n';
    md += `Generated: ${report.timestamp}\n\n`;

    // Status Badge
    const overallStatus = report.alerts.some((a) => a.severity === 'critical') ? '🔴 CRITICAL' :
      report.alerts.some((a) => a.severity === 'warning') ? '🟠 WARNING' : '🟢 HEALTHY';
    md += `## Status: ${overallStatus}\n\n`;

    // System Info
    md += '## System Information\n\n';
    md += '| Metric | Value |\n';
    md += '|--------|-------|\n';
    md += `| Node Version | ${report.nodeVersion} |\n`;
    md += `| Platform | ${report.platform} |\n`;
    md += `| Architecture | ${report.arch} |\n`;
    md += `| PID | ${report.pid} |\n`;
    md += `| Environment | ${report.environment} |\n`;
    md += `| Uptime | ${(report.uptime / 60).toFixed(2)} minutes |\n\n`;

    // Memory
    md += '## Memory Usage\n\n';
    md += '| Metric | Value |\n';
    md += '|--------|-------|\n';
    md += `| Heap Used | ${report.memory.heapUsed} MB |\n`;
    md += `| Heap Total | ${report.memory.heapTotal} MB |\n`;
    md += `| Heap Usage | ${report.memory.heapUsagePercent}% |\n`;
    md += `| RSS | ${report.memory.rss} MB |\n`;
    md += `| System Free | ${report.memory.systemFree} GB |\n\n`;

    // Health
    md += '## Health Status\n\n';
    md += `Overall: **${report.health.status.toUpperCase()}** (${report.health.uptime} uptime)\n\n`;
    md += '| Check | Status | Details |\n';
    md += '|-------|--------|--------|\n';
    for (const [name, check] of Object.entries(report.health.checks)) {
      const status = check.status === 'pass' ? '✅' : '❌';
      const details = check.duration ? `${check.duration}ms` : (check.error || '');
      md += `| ${name} | ${status} | ${details} |\n`;
    }
    md += '\n';

    // Performance
    md += '## Performance Thresholds\n\n';
    md += '| Threshold | Value | Current | Status |\n';
    md += '|-----------|-------|---------|--------|\n';
    md += `| Memory | ${report.performance.memory.threshold} MB | ${report.performance.memory.current.toFixed(2)} MB | ${report.performance.memory.status} |\n\n`;

    // Alerts
    if (report.alerts.length > 0) {
      md += '## Alerts\n\n';
      for (const alert of report.alerts) {
        const icon = alert.severity === 'critical' ? '🔴' : '🟠';
        md += `- ${icon} **[${alert.severity.toUpperCase()}]** ${alert.type}: ${alert.message}\n`;
      }
      md += '\n';
    }

    return md;
  }

  async saveReport(format = 'json') {
    const report = await this.generate();

    const outputDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'json') {
      const jsonPath = path.join(outputDir, `monitoring-${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
      console.log(`Report saved to: ${jsonPath}`);
    }

    if (format === 'markdown' || format === 'md') {
      const md = await this.generateMarkdownReport(report);
      const mdPath = path.join(outputDir, `monitoring-${timestamp}.md`);
      fs.writeFileSync(mdPath, md);
      console.log(`Report saved to: ${mdPath}`);
      console.log(`\n${md}`);
    }

    return report;
  }
}

// Run if called directly
if (require.main === module) {
  const report = new MonitoringReport();
  const format = process.argv[2] || 'markdown';
  report.saveReport(format).catch(console.error);
}

module.exports = { MonitoringReport };
