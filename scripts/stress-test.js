const http = require('http');
const https = require('https');

class StressTester {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.concurrency = options.concurrency || 10;
    this.duration = options.duration || 30000;
    this.results = [];
    this.errors = [];
    this.startTime = null;
    this.isRunning = false;
  }

  async runTest(config) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Stress Test: ${config.name}`);
    console.log(`  URL: ${this.baseUrl}${config.path}`);
    console.log(`  Concurrency: ${this.concurrency}`);
    console.log(`  Duration: ${this.duration / 1000}s`);
    console.log(`${'='.repeat(60)}\n`);

    this.results = [];
    this.errors = [];
    this.isRunning = true;
    this.startTime = Date.now();

    const promises = [];
    for (let i = 0; i < this.concurrency; i++) {
      promises.push(this._worker(config, i));
    }

    await Promise.all(promises);

    this.isRunning = false;

    return this._generateReport(config.name);
  }

  async _worker(config, workerId) {
    while (this.isRunning && (Date.now() - this.startTime) < this.duration) {
      const start = Date.now();
      try {
        await this._request(config);
        const duration = Date.now() - start;
        this.results.push({ workerId, duration, status: 'success', timestamp: start });
      } catch (error) {
        const duration = Date.now() - start;
        this.errors.push({ workerId, duration, error: error.message, timestamp: start });
      }

      if (config.delay) {
        await new Promise(r => setTimeout(r, config.delay));
      }
    }
  }

  _request(config) {
    return new Promise((resolve, reject) => {
      const url = new URL(config.path, this.baseUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: config.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(config.headers || {})
        },
        timeout: config.timeout || 10000
      };

      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve({ status: res.statusCode, data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      if (config.body) {
        req.write(JSON.stringify(config.body));
      }

      req.end();
    });
  }

  _generateReport(testName) {
    const allResults = [...this.results, ...this.errors];
    const totalRequests = allResults.length;
    const successCount = this.results.length;
    const errorCount = this.errors.length;
    const duration = Date.now() - this.startTime;

    const durations = this.results.map(r => r.duration).sort((a, b) => a - b);
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const p50 = durations[Math.floor(durations.length * 0.5)] || 0;
    const p90 = durations[Math.floor(durations.length * 0.9)] || 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
    const p99 = durations[Math.floor(durations.length * 0.99)] || 0;
    const min = durations[0] || 0;
    const max = durations[durations.length - 1] || 0;

    const rps = (totalRequests / (duration / 1000)).toFixed(2);

    const report = {
      test: testName,
      duration: (duration / 1000).toFixed(2) + 's',
      totalRequests,
      success: successCount,
      errors: errorCount,
      errorRate: ((errorCount / totalRequests) * 100).toFixed(2) + '%',
      rps,
      latency: {
        avg: avg.toFixed(2) + 'ms',
        min: min + 'ms',
        max: max + 'ms',
        p50: p50 + 'ms',
        p90: p90 + 'ms',
        p95: p95 + 'ms',
        p99: p99 + 'ms'
      }
    };

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Results: ${testName}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Duration:      ${report.duration}`);
    console.log(`  Total Requests: ${report.totalRequests}`);
    console.log(`  Success:       ${report.success}`);
    console.log(`  Errors:        ${report.errors}`);
    console.log(`  Error Rate:    ${report.errorRate}`);
    console.log(`  RPS:           ${report.rps}`);
    console.log(`  Latency Avg:   ${report.latency.avg}`);
    console.log(`  Latency P50:   ${report.latency.p50}`);
    console.log(`  Latency P90:   ${report.latency.p90}`);
    console.log(`  Latency P95:   ${report.latency.p95}`);
    console.log(`  Latency P99:   ${report.latency.p99}`);
    console.log(`${'='.repeat(60)}\n`);

    return report;
  }

  async runSuite() {
    const suite = [
      {
        name: 'Health Check',
        path: '/health',
        method: 'GET'
      },
      {
        name: 'API Templates',
        path: '/api/agent/templates',
        method: 'GET'
      },
      {
        name: 'Price Monitor Products',
        path: '/api/price-monitor/products',
        method: 'GET'
      },
      {
        name: 'Workflows List',
        path: '/api/workflows',
        method: 'GET'
      },
      {
        name: 'Models List',
        path: '/api/models',
        method: 'GET'
      },
      {
        name: 'Metrics Endpoint',
        path: '/metrics',
        method: 'GET'
      }
    ];

    const reports = [];

    for (const test of suite) {
      const report = await this.runTest({
        ...test,
        concurrency: this.concurrency,
        duration: 10000
      });
      reports.push(report);
    }

    console.log('\n' + '='.repeat(60));
    console.log('  STRESS TEST SUITE SUMMARY');
    console.log('='.repeat(60));

    for (const report of reports) {
      console.log(`  ${report.test.padEnd(25)} RPS: ${report.rps.padStart(8)} | P95: ${report.latency.p95.padStart(8)} | Errors: ${report.errorRate}`);
    }

    console.log('='.repeat(60) + '\n');

    return reports;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || 'http://localhost:3000';
  const concurrency = parseInt(args[1]) || 10;
  const duration = parseInt(args[2]) || 30;

  const tester = new StressTester({
    baseUrl,
    concurrency,
    duration: duration * 1000
  });

  if (args.includes('--suite')) {
    await tester.runSuite();
  } else {
    await tester.runTest({
      name: 'Health Check Stress Test',
      path: '/health',
      method: 'GET'
    });
  }
}

main().catch(console.error);

module.exports = { StressTester };
