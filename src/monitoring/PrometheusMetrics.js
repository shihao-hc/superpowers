class PrometheusMetrics {
  constructor(options = {}) {
    this.prefix = options.prefix || 'ultrawork_';
    this.metrics = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this.counter('http_requests_total', 'Total HTTP requests', ['method', 'path', 'status']);
    this.counter('http_errors_total', 'Total HTTP errors', ['method', 'path']);
    this.counter('tasks_total', 'Total tasks executed', ['status', 'template']);
    this.counter('workflows_total', 'Total workflows executed', ['status']);
    this.counter('agent_executions_total', 'Total agent executions', ['agent', 'status']);
    this.counter('attestations_total', 'Total attestations created');

    this.gauge('websocket_connections', 'Active WebSocket connections');
    this.gauge('agent_team_size', 'Number of active agents');
    this.gauge('task_queue_size', 'Current task queue size');
    this.gauge('memory_heap_bytes', 'Memory heap usage in bytes');
    this.gauge('memory_rss_bytes', 'Memory RSS in bytes');
    this.gauge('price_products_total', 'Monitored products');
    this.gauge('price_alerts_total', 'Price alerts');
    this.gauge('uptime_seconds', 'Server uptime in seconds');

    this.histogram('http_request_duration_seconds', 'HTTP request duration', ['method', 'path'],
      [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]);
    this.histogram('workflow_duration_seconds', 'Workflow execution duration', ['workflow_id'],
      [0.1, 0.5, 1, 2, 5, 10, 30, 60]);
    this.histogram('task_duration_seconds', 'Task execution duration', ['template'],
      [0.01, 0.05, 0.1, 0.5, 1, 5, 10]);
  }

  counter(name, help, labels = []) {
    this.metrics.set(name, {
      type: 'counter',
      name: this.prefix + name,
      help,
      labels,
      values: {}
    });
  }

  gauge(name, help, labels = []) {
    this.metrics.set(name, {
      type: 'gauge',
      name: this.prefix + name,
      help,
      labels,
      values: {},
      value: 0
    });
  }

  histogram(name, help, labels = [], buckets = []) {
    this.metrics.set(name, {
      type: 'histogram',
      name: this.prefix + name,
      help,
      labels,
      buckets,
      sum: 0,
      count: 0,
      values: {}
    });
  }

  inc(name, labels = {}, value = 1) {
    const metric = this.metrics.get(name);
    if (!metric) return;

    const key = this._labelKey(labels);
    metric.values[key] = (metric.values[key] || 0) + value;
  }

  dec(name, labels = {}, value = 1) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') return;

    const key = this._labelKey(labels);
    metric.values[key] = (metric.values[key] || 0) - value;
  }

  set(name, value, labels = {}) {
    const metric = this.metrics.get(name);
    if (!metric) return;

    if (Object.keys(labels).length === 0) {
      metric.value = value;
    } else {
      const key = this._labelKey(labels);
      metric.values[key] = value;
    }
  }

  observe(name, value, labels = {}) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'histogram') return;

    metric.sum += value;
    metric.count++;

    const key = this._labelKey(labels);
    if (!metric.values[key]) {
      metric.values[key] = { sum: 0, count: 0, buckets: {} };
    }

    metric.values[key].sum += value;
    metric.values[key].count++;

    for (const bucket of metric.buckets) {
      if (!metric.values[key].buckets[bucket]) {
        metric.values[key].buckets[bucket] = 0;
      }
      if (value <= bucket) {
        metric.values[key].buckets[bucket]++;
      }
    }
  }

  startTimer(name, labels = {}) {
    const start = Date.now();
    return {
      end: () => {
        const duration = (Date.now() - start) / 1000;
        this.observe(name, duration, labels);
        return duration;
      }
    };
  }

  _labelKey(labels) {
    if (Object.keys(labels).length === 0) return '';
    return Object.entries(labels).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}="${v}"`).join(',');
  }

  toPrometheusFormat() {
    let output = '';

    for (const [name, metric] of this.metrics) {
      output += `# HELP ${metric.name} ${metric.help}\n`;
      output += `# TYPE ${metric.name} ${metric.type}\n`;

      if (metric.type === 'counter') {
        for (const [key, value] of Object.entries(metric.values)) {
          output += `${metric.name}{${key}} ${value}\n`;
        }
        if (Object.keys(metric.values).length === 0) {
          output += `${metric.name} 0\n`;
        }
      } else if (metric.type === 'gauge') {
        if (Object.keys(metric.values).length > 0) {
          for (const [key, value] of Object.entries(metric.values)) {
            output += `${metric.name}{${key}} ${value}\n`;
          }
        } else {
          output += `${metric.name} ${metric.value}\n`;
        }
      } else if (metric.type === 'histogram') {
        for (const [key, data] of Object.entries(metric.values)) {
          for (const bucket of metric.buckets) {
            output += `${metric.name}_bucket{${key},le="${bucket}"} ${data.buckets[bucket] || 0}\n`;
          }
          output += `${metric.name}_bucket{${key},le="+Inf"} ${data.count}\n`;
          output += `${metric.name}_sum{${key}} ${data.sum}\n`;
          output += `${metric.name}_count{${key}} ${data.count}\n`;
        }
      }

      output += '\n';
    }

    return output;
  }

  toJSON() {
    const result = {};
    for (const [name, metric] of this.metrics) {
      if (metric.type === 'counter') {
        result[name] = Object.values(metric.values).reduce((a, b) => a + b, 0);
      } else if (metric.type === 'gauge') {
        result[name] = Object.keys(metric.values).length > 0 ? metric.values : metric.value;
      } else if (metric.type === 'histogram') {
        result[name] = {
          count: metric.count,
          sum: metric.sum,
          avg: metric.count > 0 ? metric.sum / metric.count : 0
        };
      }
    }
    return result;
  }

  reset() {
    for (const [name, metric] of this.metrics) {
      metric.values = {};
      if (metric.type === 'gauge') metric.value = 0;
      if (metric.type === 'histogram') {
        metric.sum = 0;
        metric.count = 0;
      }
    }
  }

  getStats() {
    return {
      metrics: this.metrics.size,
      counters: Array.from(this.metrics.values()).filter(m => m.type === 'counter').length,
      gauges: Array.from(this.metrics.values()).filter(m => m.type === 'gauge').length,
      histograms: Array.from(this.metrics.values()).filter(m => m.type === 'histogram').length
    };
  }
}

module.exports = { PrometheusMetrics };
