const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
}

function scanFiles(dir, pattern, maxDepth = 3) {
  const results = [];
  if (!fs.existsSync(dir)) {return results;}

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && maxDepth > 0) {
      results.push(...scanFiles(fullPath, pattern, maxDepth - 1));
    } else if (file.match(pattern)) {
      results.push(fullPath);
    }
  }

  return results;
}

function extractSkills(phase = 'phase-monitoring') {
  const skills = {
    phase,
    timestamp: new Date().toISOString(),
    modules: [],
    patterns: [],
    benchmarks: [],
    monitoring: [],
    alerting: [],
    deployment: [],
    cicd: [],
    summary: ''
  };

  const srcDir = path.resolve(process.cwd(), 'src');

  // Monitoring 模块
  const monitoringFiles = scanFiles(path.join(srcDir, 'monitoring'), /\.js$/);
  skills.monitoring = monitoringFiles.map((f) => ({
    name: path.basename(f, '.js'),
    path: f,
    type: 'monitoring'
  }));

  // Performance 模块
  const perfFiles = scanFiles(path.join(srcDir, 'performance'), /\.js$/);
  skills.modules.push(...perfFiles.map((f) => ({
    name: path.basename(f, '.js'),
    path: f,
    type: 'performance'
  })));

  // 性能模式
  skills.patterns = [
    {
      name: 'PrometheusMetrics',
      description: 'Prometheus 风格指标收集器，支持 Counter、Gauge、Histogram',
      file: 'src/monitoring/Metrics.js',
      lines: 323
    },
    {
      name: 'HealthMonitor',
      description: '健康检查系统，支持定时检查、告警、连续失败检测',
      file: 'src/monitoring/HealthMonitor.js',
      lines: 145
    },
    {
      name: 'PerformanceManager',
      description: '性能配置管理，支持热更新、阈值告警、自动扩缩容',
      file: 'src/performance/PerformanceManager.js',
      lines: 407
    }
  ];

  // 基准测试定义
  skills.benchmarks = [
    {
      name: 'workflow-latency',
      description: '工作流执行延迟测试',
      metrics: ['p50', 'p95', 'p99', 'mean'],
      thresholds: { p95: 5000, p99: 10000 }
    },
    {
      name: 'mcp-throughput',
      description: 'MCP 调用吞吐量测试',
      metrics: ['rps', 'latency', 'errorRate'],
      thresholds: { rps: 100, errorRate: 0.01 }
    },
    {
      name: 'cache-efficiency',
      description: '缓存效率测试',
      metrics: ['hitRate', 'missRate', 'ttl'],
      thresholds: { hitRate: 0.5 }
    },
    {
      name: 'memory-usage',
      description: '内存使用测试',
      metrics: ['heapUsed', 'heapTotal', 'rss'],
      thresholds: { heapUsedMB: 512 }
    }
  ];

  // 部署配置
  skills.deployment = [
    {
      name: 'Dockerfile.multi',
      description: '多阶段 Docker 构建，支持开发/构建/生产',
      stages: ['deps', 'development', 'builder', 'production'],
      security: ['non-root user', 'health check', 'volume isolation']
    }
  ];

  // CI/CD 配置
  skills.cicd = [
    {
      name: 'opencode-cicd.yml',
      description: '6 阶段 CI/CD 流水线',
      phases: ['code-quality', 'unit-tests', 'integration-tests', 'build-push', 'deploy', 'performance-tests'],
      security: ['trivy scan', 'sast', 'sbom generation']
    }
  ];

  skills.summary = `
=== Phase: ${phase} ===

=== Monitoring Modules ===
Files: ${monitoringFiles.length}
Examples: ${monitoringFiles.map((f) => path.basename(f)).join(', ')}

=== Performance Patterns ===
1. PrometheusMetrics - Counter/Gauge/Histogram 指标收集
2. HealthMonitor - 健康检查与告警
3. PerformanceManager - 配置热更新与阈值管理

=== Benchmark Tests ===
1. workflow-latency - 工作流延迟 P50/P95/P99
2. mcp-throughput - MCP 调用吞吐量
3. cache-efficiency - 缓存命中率
4. memory-usage - 内存使用监控

=== Deployment Security ===
- Non-root user: opencode
- Health check: /api/health
- Volume isolation: .opencode, data, screenshots
- SBOM generation for supply chain security

=== CI/CD Pipeline ===
6 phases with parallel execution:
1. Code Quality (lint, typecheck, security audit)
2. Unit Tests (multi-node version testing)
3. Integration Tests (Redis, MongoDB services)
4. Build & Push (Docker multi-stage, SBOM)
5. Deploy (production environment)
6. Performance Tests (k6 load testing)
  `.trim();

  return skills;
}

function run(phase = 'phase-monitoring') {
  const outputDir = path.resolve(process.cwd(), '.opencode', 'skills');
  ensureDir(outputDir);

  const skills = extractSkills(phase);

  const outPath = path.resolve(outputDir, `${phase}.json`);
  fs.writeFileSync(outPath, JSON.stringify(skills, null, 2), 'utf8');
  console.log(`Learn-Eval: ${phase} extracted to`, outPath);
  console.log(skills.summary);
}

module.exports = { run, extractSkills };
