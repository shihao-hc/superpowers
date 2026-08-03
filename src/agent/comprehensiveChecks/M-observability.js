/**
 * M-observability 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
module.exports = {
  'checkTracing': async (root, files) => {
    const tracingPatterns = ['trace', 'span', 'traceId', 'requestId', 'correlationId'];
    let hasTracing = false;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (tracingPatterns.some((p) => content.toLowerCase().includes(p))) {
        hasTracing = true;
        break;
      }
    }

    if (!hasTracing) {
      return { status: 'warning', message: '缺少链路追踪', details: '建议添加traceId实现链路追踪' };
    }

    return { status: 'passed', message: '链路追踪机制存在' };
  },

  'checkPerformanceMonitoring': async (root, files) => {
    const perfPatterns = ['performance', 'timing', 'latency', 'duration', 'benchmark'];
    let hasPerf = false;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (perfPatterns.some((p) => content.includes(p))) {
        hasPerf = true;
        break;
      }
    }

    if (!hasPerf) {
      return { status: 'warning', message: '缺少性能监控', details: '建议添加性能指标收集' };
    }

    return { status: 'passed', message: '性能监控存在' };
  },

  'checkHealthCheck': async (root, files) => {
    const hasHealth = files.some((f) => {
      const content = fs.readFileSync(f, 'utf-8');
      return content.includes('getStatus') ||
             content.includes('health') ||
             content.includes('ping');
    });

    if (!hasHealth) {
      return { status: 'warning', message: '缺少健康检查', details: '建议实现/health端点' };
    }

    return { status: 'passed', message: '健康检查端点存在' };
  },

  'checkDiagnostics': async (root, files) => {
    const diagPatterns = ['debug', 'diagnostic', 'dump', 'profile', 'stats'];
    let hasDiag = false;

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8');
      if (diagPatterns.some((p) => content.includes(p))) {
        hasDiag = true;
        break;
      }
    }

    if (!hasDiag) {
      return { status: 'warning', message: '缺少诊断接口', details: '建议添加调试和诊断端点' };
    }

    return { status: 'passed', message: '诊断接口存在' };
  }


};
