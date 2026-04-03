// Phase 14: Performance Optimization System
// Monitors and optimizes system performance

class PerformanceOptimizer {
  constructor() {
    this.metrics = {
      latency: [],
      throughput: [],
      memory: [],
      cpu: []
    };
    this.baselines = {};
  }

  recordMetric(type, value) {
    if (this.metrics[type]) {
      this.metrics[type].push({
        value,
        timestamp: new Date().toISOString()
      });
      
      // Keep last 1000 metrics
      if (this.metrics[type].length > 1000) {
        this.metrics[type].shift();
      }
    }
  }

  setBaseline(type, value) {
    this.baselines[type] = value;
  }

  getAverage(type) {
    const data = this.metrics[type];
    if (!data || data.length === 0) return 0;
    
    const sum = data.reduce((acc, m) => acc + m.value, 0);
    return sum / data.length;
  }

  getPercentile(type, percentile) {
    const data = this.metrics[type] || [];
    const sorted = [...data].sort((a, b) => a.value - b.value);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index]?.value || 0;
  }

  checkAnomalies(type) {
    const avg = this.getAverage(type);
    const p95 = this.getPercentile(type, 95);
    const threshold = avg * 1.5;
    
    return {
      average: avg,
      p95,
      anomaly: p95 > threshold,
      recommendation: p95 > threshold ? 'Consider scaling or optimization' : 'Performance normal'
    };
  }

  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      metrics: {
        latency: {
          avg: this.getAverage('latency'),
          p95: this.getPercentile('latency', 95),
          p99: this.getPercentile('latency', 99)
        },
        throughput: {
          avg: this.getAverage('throughput'),
          current: this.metrics.throughput[this.metrics.throughput.length - 1]?.value || 0
        },
        memory: {
          avg: this.getAverage('memory'),
          current: this.metrics.memory[this.metrics.memory.length - 1]?.value || 0
        }
      },
      anomalies: {
        latency: this.checkAnomalies('latency'),
        memory: this.checkAnomalies('memory')
      }
    };
  }
}

module.exports = { PerformanceOptimizer };
