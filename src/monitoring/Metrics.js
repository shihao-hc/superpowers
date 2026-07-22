/**
 * Metrics System
 * Prometheus 风格指标收集
 */

class Counter {
  constructor(name, description = '', labels = {}) {
    this.name = name;
    this.description = description;
    this.labels = labels;
    this.value = 0;
    this.history = [];
    this.maxHistory = 1000;
  }

  inc(amount = 1, labelValues = {}) {
    this.value += amount;
    this.history.push({
      timestamp: Date.now(),
      value: this.value,
      delta: amount,
      labels: labelValues
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  get() {
    return this.value;
  }

  getHistory(limit = 100) {
    return this.history.slice(-limit);
  }
}

class Gauge {
  constructor(name, description = '', labels = {}) {
    this.name = name;
    this.description = description;
    this.labels = labels;
    this.value = 0;
    this.history = [];
    this.maxHistory = 1000;
  }

  set(value, labelValues = {}) {
    const delta = value - this.value;
    this.value = value;
    this.history.push({
      timestamp: Date.now(),
      value: this.value,
      delta,
      labels: labelValues
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  inc(amount = 1, labelValues = {}) {
    this.set(this.value + amount, labelValues);
  }

  dec(amount = 1, labelValues = {}) {
    this.set(this.value - amount, labelValues);
  }

  get() {
    return this.value;
  }

  getHistory(limit = 100) {
    return this.history.slice(-limit);
  }
}

class Histogram {
  constructor(name, description = '', buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
    this.name = name;
    this.description = description;
    this.buckets = buckets;
    this.count = 0;
    this.sum = 0;
    this.values = [];
    this.maxValues = 10000;
  }

  observe(value, _labelValues = {}) {
    this.count++;
    this.sum += value;
    this.values.push(value);

    if (this.values.length > this.maxValues) {
      this.values.shift();
    }
  }

  getPercentile(p) {
    if (this.values.length === 0) {return 0;}

    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * p);
    return sorted[index] || 0;
  }

  getStats() {
    return {
      count: this.count,
      sum: this.sum,
      mean: this.count > 0 ? this.sum / this.count : 0,
      min: this.values.length > 0 ? Math.min(...this.values) : 0,
      max: this.values.length > 0 ? Math.max(...this.values) : 0,
      p50: this.getPercentile(0.5),
      p90: this.getPercentile(0.9),
      p95: this.getPercentile(0.95),
      p99: this.getPercentile(0.99)
    };
  }

  getBucketCounts() {
    const counts = {};
    for (const bucket of this.buckets) {
      counts[bucket] = this.values.filter((v) => v <= bucket).length;
    }
    counts['+Inf'] = this.count;
    return counts;
  }
}

class Metrics {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.registry = new Map();

    this.startTime = Date.now();
  }

  /**
   * 创建或获取 Counter
   */
  counter(name, description = '', labels = {}) {
    const key = this.getKey(name, labels);

    if (!this.counters.has(key)) {
      this.counters.set(key, new Counter(name, description, labels));
    }

    return this.counters.get(key);
  }

  /**
   * 创建或获取 Gauge
   */
  gauge(name, description = '', labels = {}) {
    const key = this.getKey(name, labels);

    if (!this.gauges.has(key)) {
      this.gauges.set(key, new Gauge(name, description, labels));
    }

    return this.gauges.get(key);
  }

  /**
   * 创建或获取 Histogram
   */
  histogram(name, description = '', buckets, labels = {}) {
    const key = this.getKey(name, labels);

    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram(name, description, buckets));
    }

    return this.histograms.get(key);
  }

  /**
   * 快捷方法
   */
  incCounter(name, amount = 1, labels = {}) {
    this.counter(name).inc(amount, labels);
  }

  setGauge(name, value, labels = {}) {
    this.gauge(name).set(value, labels);
  }

  observeHistogram(name, value, labels = {}) {
    this.histogram(name).observe(value, labels);
  }

  /**
   * 计时器
   */
  timer(name) {
    const start = Date.now();

    return {
      end: (labels = {}) => {
        const duration = Date.now() - start;
        this.observeHistogram(name, duration, labels);
        return duration;
      }
    };
  }

  /**
   * 获取键
   */
  getKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    return labelStr ? `${name}{${labelStr}}` : name;
  }

  /**
   * 获取所有指标
   */
  getAll() {
    const metrics = [];

    for (const counter of this.counters.values()) {
      metrics.push({
        name: counter.name,
        type: 'counter',
        value: counter.get(),
        description: counter.description
      });
    }

    for (const gauge of this.gauges.values()) {
      metrics.push({
        name: gauge.name,
        type: 'gauge',
        value: gauge.get(),
        description: gauge.description
      });
    }

    for (const histogram of this.histograms.values()) {
      metrics.push({
        name: histogram.name,
        type: 'histogram',
        stats: histogram.getStats(),
        buckets: histogram.getBucketCounts(),
        description: histogram.description
      });
    }

    return metrics;
  }

  /**
   * Prometheus 格式输出
   */
  toPrometheus() {
    const lines = [];

    // Counters
    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.description}`);
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(`${counter.name} ${counter.get()}`);
    }

    // Gauges
    for (const gauge of this.gauges.values()) {
      lines.push(`# HELP ${gauge.name} ${gauge.description}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      lines.push(`${gauge.name} ${gauge.get()}`);
    }

    // Histograms
    for (const histogram of this.histograms.values()) {
      lines.push(`# HELP ${histogram.name} ${histogram.description}`);
      lines.push(`# TYPE ${histogram.name} histogram`);

      const buckets = histogram.getBucketCounts();
      for (const [bucket, count] of Object.entries(buckets)) {
        lines.push(`${histogram.name}_bucket{le="${bucket}"} ${count}`);
      }
      lines.push(`${histogram.name}_sum ${histogram.getStats().sum}`);
      lines.push(`${histogram.name}_count ${histogram.count}`);
    }

    return lines.join('\n');
  }

  /**
   * 获取摘要
   */
  getSummary() {
    return {
      counters: this.counters.size,
      gauges: this.gauges.size,
      histograms: this.histograms.size,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * 重置所有指标
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

// 全局指标实例
const globalMetrics = new Metrics();

module.exports = { Metrics, Counter, Gauge, Histogram, globalMetrics };
