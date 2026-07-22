/**
 * k6 Performance Test Configuration
 * 负载测试配置
 */

export const options = {
  scenarios: {
    // Smoke test - 验证基本功能
    smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      tags: { test_type: 'smoke' }
    },

    // Load test - 正常负载
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // 2分钟内增加到50用户
        { duration: '5m', target: 50 },   // 保持5分钟
        { duration: '2m', target: 0 }     // 2分钟内降到0
      ],
      tags: { test_type: 'load' }
    },

    // Stress test - 压力测试
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '3m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '3m', target: 200 },
        { duration: '1m', target: 0 }
      ],
      tags: { test_type: 'stress' }
    },

    // Spike test - 峰值测试
    spike: {
      executor: 'stepped-up-ramping',
      startVUs: 0,
      steps: [
        { duration: '1m', target: 10 },
        { duration: '1m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '1m', target: 10 },
        { duration: '1m', target: 0 }
      ],
      tags: { test_type: 'spike' }
    }
  },

  thresholds: {
    // HTTP 相关指标
    http_req_duration: ['p(95)<500'],      // 95%请求延迟<500ms
    http_req_failed: ['rate<0.01'],         // 失败率<1%
    http_req_receiving: ['p(95)<200'],        // 接收时间<200ms
    http_req_sending: ['p(95)<50'],          // 发送时间<50ms

    // 自定义指标阈值
    'benchmark_duration{type:metrics}': ['p(95)<100'],     // 指标收集<100ms
    'benchmark_duration{type:workflow}': ['p(95)<5000'],    // 工作流<5s
    'benchmark_duration{type:mcp}': ['p(95)<1000'],        // MCP调用<1s

    // 可用性
    'checks{type:health}': ['rate>0.95'],   // 健康检查>95%

    // 速率限制
    'rate_limit_exceeded': ['count<10']      // 速率限制超限<10次
  }
};

import http from 'k6/http';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// 自定义指标
const benchmarkDuration = new Trend('benchmark_duration');
const healthCheckRate = new Rate('checks{type:health}');
const rateLimitExceeded = new Counter('rate_limit_exceeded');
const activeConnections = new Gauge('active_connections');

// 测试配置
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// 健康检查测试
export function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health`);

  const isHealthy = res.status === 200 && JSON.parse(res.body).status === 'healthy';
  healthCheckRate.add(isHealthy ? 1 : 0);

  return res;
}

// 指标收集测试
export function metricsCollection() {
  const start = Date.now();

  // 模拟指标收集
  const res = http.get(`${BASE_URL}/api/metrics`);

  const duration = Date.now() - start;
  benchmarkDuration.add(duration, { type: 'metrics' });

  return res;
}

// 工作流测试
export function workflowExecution() {
  const start = Date.now();

  const payload = JSON.stringify({
    workflow: 'test-workflow',
    params: { test: true, iterations: 10 }
  });

  const res = http.post(`${BASE_URL}/api/workflow/execute`, payload, {
    headers: { 'Content-Type': 'application/json' }
  });

  const duration = Date.now() - start;
  benchmarkDuration.add(duration, { type: 'workflow' });

  // 检查速率限制
  if (res.status === 429) {
    rateLimitExceeded.add(1);
  }

  return res;
}

// MCP 调用测试
export function mcpCall() {
  const start = Date.now();

  const payload = JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'echo',
      arguments: { message: 'benchmark test' }
    }
  });

  const res = http.post(`${BASE_URL}/api/mcp/call`, payload, {
    headers: { 'Content-Type': 'application/json' }
  });

  const duration = Date.now() - start;
  benchmarkDuration.add(duration, { type: 'mcp' });

  return res;
}

// 默认测试场景
export default function() {
  // 记录活跃连接
  activeConnections.add(1);

  // 执行测试
  healthCheck();

  // 随机选择其他测试
  const choice = Math.random();
  if (choice < 0.3) {
    metricsCollection();
  } else if (choice < 0.6) {
    workflowExecution();
  } else {
    mcpCall();
  }

  // 等待一段时间
  sleep(Math.random() * 2 + 0.5);

  activeConnections.add(-1);
}

// 每个虚拟用户的设置
export function setup() {
  console.log(`Starting k6 benchmark test against ${BASE_URL}`);
  return { startTime: Date.now() };
}

// 测试结束后的清理
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
    'summary.html': htmlReport(data)
  };
}

// 文本摘要
function textSummary(data, opts) {
  const indent = opts.indent || '';

  let summary = '\n=== Performance Test Summary ===\n\n';

  // HTTP 指标
  summary += `${indent}HTTP Metrics:\n`;
  summary += `${indent}  Request Duration P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `${indent}  Request Duration P99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
  summary += `${indent}  Failed Requests: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
  summary += `${indent}  Total Requests: ${data.metrics.http_reqs.values.count}\n`;
  summary += `${indent}  Requests/sec: ${data.metrics.http_reqs.values.rate.toFixed(2)}\n`;

  // 自定义指标
  summary += `\n${indent}Benchmark Metrics:\n`;
  if (data.metrics['benchmark_duration{type=metrics}']) {
    summary += `${indent}  Metrics Collection P95: ${data.metrics['benchmark_duration{type=metrics}'].values['p(95)'].toFixed(2)}ms\n`;
  }
  if (data.metrics['benchmark_duration{type=workflow}']) {
    summary += `${indent}  Workflow P95: ${data.metrics['benchmark_duration{type=workflow}'].values['p(95)'].toFixed(2)}ms\n`;
  }
  if (data.metrics['benchmark_duration{type=mcp}']) {
    summary += `${indent}  MCP Call P95: ${data.metrics['benchmark_duration{type=mcp}'].values['p(95)'].toFixed(2)}ms\n`;
  }

  // 健康检查
  summary += `\n${indent}Health Check:\n`;
  if (data.metrics['checks{type=health}']) {
    summary += `${indent}  Success Rate: ${(data.metrics['checks{type=health}'].values.rate * 100).toFixed(2)}%\n`;
  }

  // 速率限制
  summary += `\n${indent}Rate Limiting:\n`;
  if (data.metrics.rate_limit_exceeded) {
    summary += `${indent}  Exceeded Count: ${data.metrics.rate_limit_exceeded.values.count}\n`;
  }

  summary += `\n${indent}Test Duration: ${(data.state.testRunDurationMs / 1000).toFixed(2)}s\n`;
  summary += `${indent}Virtual Users: ${data.metrics.vus ? data.metrics.vus.values.max : 'N/A'}\n`;

  return summary;
}

// HTML 报告
function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Performance Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    .metric { margin: 10px 0; }
  </style>
</head>
<body>
  <h1>Performance Test Report</h1>
  <div class="metric">
    <strong>Test Duration:</strong> ${(data.state.testRunDurationMs / 1000).toFixed(2)}s
  </div>
  <div class="metric">
    <strong>Total Requests:</strong> ${data.metrics.http_reqs.values.count}
  </div>
  <table>
    <tr>
      <th>Metric</th>
      <th>Value</th>
    </tr>
    <tr>
      <td>HTTP Duration P95</td>
      <td>${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms</td>
    </tr>
    <tr>
      <td>HTTP Duration P99</td>
      <td>${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms</td>
    </tr>
    <tr>
      <td>Failed Rate</td>
      <td>${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%</td>
    </tr>
    <tr>
      <td>Requests/sec</td>
      <td>${data.metrics.http_reqs.values.rate.toFixed(2)}</td>
    </tr>
  </table>
</body>
</html>
  `;
}
