/**
 * Performance Benchmark Suite
 * 性能基准测试套件
 */

const { Metrics, Counter, Gauge, Histogram } = require('../../src/monitoring/Metrics');
const { HealthMonitor } = require('../../src/monitoring/HealthMonitor');
const { PerformanceManager } = require('../../src/performance/PerformanceManager');

class BenchmarkRunner {
  constructor() {
    this.results = [];
    this.metrics = new Metrics();
    this.startTime = Date.now();
  }

  async run(name, fn, iterations = 100) {
    const timer = this.metrics.timer(`benchmark.${name}`);

    const latencies = [];
    const memBefore = process.memoryUsage();

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await fn();
      latencies.push(Date.now() - start);
    }

    const memAfter = process.memoryUsage();
    const duration = timer.end();

    const stats = this.calculateStats(latencies);

    const result = {
      name,
      iterations,
      duration,
      latency: stats,
      memory: {
        heapUsed: (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024,
        heapTotal: memAfter.heapTotal / 1024 / 1024,
        rss: memAfter.rss / 1024 / 1024
      },
      timestamp: Date.now()
    };

    this.results.push(result);
    return result;
  }

  calculateStats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  printResults() {
    console.log('\n=== Performance Benchmark Results ===\n');

    for (const result of this.results) {
      console.log(`\n## ${result.name}`);
      console.log(`Iterations: ${result.iterations}`);
      console.log(`Total Duration: ${result.duration}ms`);
      console.log(`Throughput: ${(result.iterations / result.duration * 1000).toFixed(2)} ops/sec`);

      console.log('\nLatency (ms):');
      console.log(`  Min:   ${result.latency.min.toFixed(2)}`);
      console.log(`  Mean:  ${result.latency.mean.toFixed(2)}`);
      console.log(`  P50:   ${result.latency.p50.toFixed(2)}`);
      console.log(`  P90:   ${result.latency.p90.toFixed(2)}`);
      console.log(`  P95:   ${result.latency.p95.toFixed(2)}`);
      console.log(`  P99:   ${result.latency.p99.toFixed(2)}`);
      console.log(`  Max:   ${result.latency.max.toFixed(2)}`);

      console.log('\nMemory (MB):');
      console.log(`  Heap Used:  ${result.memory.heapUsed.toFixed(2)}`);
      console.log(`  Heap Total: ${result.memory.heapTotal.toFixed(2)}`);
      console.log(`  RSS:       ${result.memory.rss.toFixed(2)}`);
    }
  }

  getSummary() {
    return {
      totalTests: this.results.length,
      totalDuration: Date.now() - this.startTime,
      results: this.results
    };
  }
}

async function runBenchmarks() {
  const runner = new BenchmarkRunner();

  console.log('Starting Performance Benchmarks...\n');

  // 1. Metrics Benchmark
  await runner.run('metrics-counter', () => {
    const counter = runner.metrics.counter('test.counter');
    counter.inc();
  }, 10000);

  await runner.run('metrics-gauge', () => {
    const gauge = runner.metrics.gauge('test.gauge');
    gauge.set(Math.random() * 100);
  }, 10000);

  await runner.run('metrics-histogram', () => {
    const histogram = runner.metrics.histogram('test.histogram');
    histogram.observe(Math.random() * 1000);
  }, 10000);

  // 2. Health Monitor Benchmark
  const healthMonitor = new HealthMonitor({ checkInterval: 60000 });
  healthMonitor.registerCheck('test-check', async () => ({ status: 'ok' }), { critical: true });

  await runner.run('health-check', async () => {
    await healthMonitor.runChecks();
  }, 1000);

  // 3. Performance Manager Benchmark
  const perfManager = new PerformanceManager();

  await runner.run('perf-config-get', () => {
    perfManager.get('mcp.callTimeout');
  }, 10000);

  await runner.run('perf-alert-check', () => {
    perfManager.checkAlerts({
      workflowP95Latency: 3000,
      mcpSuccessRate: 0.98,
      cacheHitRate: 0.6,
      nodeQueueLength: 50
    });
  }, 5000);

  // 4. Array Operations Benchmark
  await runner.run('array-sort', () => {
    const arr = Array.from({ length: 1000 }, () => Math.random());
    arr.sort((a, b) => a - b);
  }, 1000);

  await runner.run('array-filter-map', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    arr.filter((x) => x % 2 === 0).map((x) => x * 2);
  }, 1000);

  // 5. JSON Operations Benchmark
  const testObj = {
    nested: { data: { items: Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item-${i}` })) } }
  };

  await runner.run('json-stringify', () => {
    JSON.stringify(testObj);
  }, 5000);

  await runner.run('json-parse', () => {
    JSON.parse(JSON.stringify(testObj));
  }, 5000);

  // 6. Map/Set Operations Benchmark
  const map = new Map();
  const keys = Array.from({ length: 100 }, (_, i) => `key-${i}`);

  await runner.run('map-set-get', () => {
    const k = keys[Math.floor(Math.random() * keys.length)];
    map.set(k, { data: Math.random() });
    map.get(k);
  }, 10000);

  // Print Results
  runner.printResults();

  // Summary
  const summary = runner.getSummary();
  console.log('\n=== Summary ===');
  console.log(`Total Tests: ${summary.totalTests}`);
  console.log(`Total Duration: ${summary.totalDuration}ms`);

  return summary;
}

// Run benchmarks
if (require.main === module) {
  runBenchmarks()
    .then((summary) => {
      console.log('\n=== Benchmark Complete ===');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}

module.exports = { BenchmarkRunner, runBenchmarks };
