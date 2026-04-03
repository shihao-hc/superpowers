/**
 * PerformanceMonitor - 实时性能监控系统
 * 
 * 功能:
 * - FPS监控
 * - GPU/CPU使用率
 * - 内存占用
 * - 网络延迟
 * - 自动质量调整
 */

class PerformanceMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.updateInterval = options.updateInterval || 1000;
    this.historySize = options.historySize || 60;
    this.onMetricsUpdate = options.onMetricsUpdate || (() => {});
    this.onQualityChange = options.onQualityChange || (() => {});
    
    this.metrics = {
      fps: [],
      memory: [],
      latency: [],
      network: [],
      renderTime: [],
      frameTime: []
    };
    
    this.currentMetrics = {
      fps: 0,
      memory: 0,
      latency: 0,
      networkLatency: 0,
      renderTime: 0,
      frameTime: 0
    };
    
    this.qualityLevel = options.qualityLevel || 'auto';
    this.targetFPS = options.targetFPS || 60;
    this.qualityThresholds = {
      high: { fps: 55, memory: 500 },
      medium: { fps: 30, memory: 800 },
      low: { fps: 15, memory: 1200 }
    };
    
    this.isRunning = false;
    this.intervalId = null;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fpsUpdateTime = performance.now();
    
    this.alertCallbacks = [];
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this._startFPSCounter();
    this.intervalId = setInterval(() => this._updateMetrics(), this.updateInterval);
    
    if (this.qualityLevel === 'auto') {
      this._startQualityAdjuster();
    }
    
    console.log('[PerformanceMonitor] Started');
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('[PerformanceMonitor] Stopped');
  }

  _startFPSCounter() {
    const countFrame = () => {
      if (!this.isRunning) return;
      
      this.frameCount++;
      const now = performance.now();
      
      if (now - this.fpsUpdateTime >= 1000) {
        this.currentMetrics.fps = this.frameCount;
        this.frameCount = 0;
        this.fpsUpdateTime = now;
        
        this._addMetric('fps', this.currentMetrics.fps);
        
        if (this.onMetricsUpdate) {
          this.onMetricsUpdate(this.getCurrentMetrics());
        }
      }
      
      requestAnimationFrame(countFrame);
    };
    
    requestAnimationFrame(countFrame);
  }

  _startQualityAdjuster() {
    setInterval(() => {
      if (this.qualityLevel !== 'auto') return;
      
      const fps = this.currentMetrics.fps;
      const memory = this.currentMetrics.memory;
      
      let newQuality = null;
      
      if (fps < this.qualityThresholds.low.fps || memory > this.qualityThresholds.low.memory) {
        newQuality = 'low';
      } else if (fps < this.qualityThresholds.medium.fps || memory > this.qualityThresholds.medium.memory) {
        newQuality = 'medium';
      } else if (fps > 55 && memory < 400) {
        newQuality = 'high';
      }
      
      if (newQuality && newQuality !== this._currentQuality) {
        this._setQuality(newQuality);
      }
    }, 5000);
  }

  _setQuality(level) {
    this._currentQuality = level;
    console.log(`[PerformanceMonitor] Quality adjusted to: ${level}`);
    
    if (this.onQualityChange) {
      this.onQualityChange(level);
    }
  }

  _updateMetrics() {
    if (typeof performance !== 'undefined' && performance.memory) {
      const memoryMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
      this.currentMetrics.memory = memoryMB;
      this._addMetric('memory', memoryMB);
    }
    
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate(this.getCurrentMetrics());
    }
  }

  _addMetric(type, value) {
    if (!this.metrics[type]) {
      this.metrics[type] = [];
    }
    
    this.metrics[type].push({
      value,
      timestamp: Date.now()
    });
    
    if (this.metrics[type].length > this.historySize) {
      this.metrics[type].shift();
    }
  }

  recordLatency(latency) {
    this.currentMetrics.latency = latency;
    this._addMetric('latency', latency);
  }

  recordNetworkLatency(latency) {
    this.currentMetrics.networkLatency = latency;
    this._addMetric('network', latency);
  }

  recordRenderTime(time) {
    this.currentMetrics.renderTime = time;
    this._addMetric('renderTime', time);
  }

  recordFrameTime(time) {
    this.currentMetrics.frameTime = time;
    this._addMetric('frameTime', time);
  }

  getCurrentMetrics() {
    return { ...this.currentMetrics };
  }

  getMetricsHistory(type = null) {
    if (type) {
      return this.metrics[type] || [];
    }
    return this.metrics;
  }

  getAverageMetrics(period = 60) {
    const result = {};
    const now = Date.now() - period * 1000;
    
    for (const [type, data] of Object.entries(this.metrics)) {
      const filtered = data.filter(m => m.timestamp > now);
      if (filtered.length > 0) {
        const sum = filtered.reduce((acc, m) => acc + m.value, 0);
        result[type] = {
          average: sum / filtered.length,
          min: Math.min(...filtered.map(m => m.value)),
          max: Math.max(...filtered.map(m => m.value)),
          current: filtered[filtered.length - 1]?.value || 0
        };
      }
    }
    
    return result;
  }

  getHealthStatus() {
    const avg = this.getAverageMetrics(10);
    
    let score = 100;
    let issues = [];
    
    if (avg.fps?.average < 30) {
      score -= 30;
      issues.push('Low FPS');
    } else if (avg.fps?.average < 50) {
      score -= 15;
      issues.push('Moderate FPS');
    }
    
    if (avg.memory?.average > 800) {
      score -= 20;
      issues.push('High memory usage');
    }
    
    if (avg.latency?.average > 100) {
      score -= 10;
      issues.push('High latency');
    }
    
    if (avg.network?.average > 200) {
      score -= 10;
      issues.push('High network latency');
    }
    
    const status = score >= 80 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
    
    return { score, status, issues };
  }

  addAlertCallback(callback) {
    this.alertCallbacks.push(callback);
  }

  _triggerAlert(type, message, data) {
    for (const callback of this.alertCallbacks) {
      try {
        callback(type, message, data);
      } catch (e) {
        console.error('[PerformanceMonitor] Alert callback error:', e);
      }
    }
  }

  setTargetFPS(fps) {
    this.targetFPS = fps;
  }

  setQualityLevel(level) {
    this.qualityLevel = level;
    if (level !== 'auto') {
      this._setQuality(level);
    }
  }

  reset() {
    for (const type of Object.keys(this.metrics)) {
      this.metrics[type] = [];
    }
    this.currentMetrics = {
      fps: 0,
      memory: 0,
      latency: 0,
      networkLatency: 0,
      renderTime: 0,
      frameTime: 0
    };
  }

  destroy() {
    this.stop();
    this.alertCallbacks = [];
    this.reset();
  }
}

/**
 * PerformanceDashboard - 性能监控面板UI
 */
class PerformanceDashboard {
  constructor(monitor, options = {}) {
    this.monitor = monitor;
    this.container = options.container || document.body;
    this.position = options.position || 'bottom-right';
    this.expanded = false;
    
    this.elements = {};
    this.updateInterval = null;
  }

  create() {
    const dashboard = document.createElement('div');
    dashboard.id = 'perf-dashboard';
    dashboard.className = `perf-dashboard perf-dashboard-${this.position}`;
    
    dashboard.innerHTML = `
      <div class="perf-header" onclick="window._perfDashboard?.toggle()">
        <span class="perf-title">性能监控</span>
        <span class="perf-toggle">${this.expanded ? '−' : '+'}</span>
      </div>
      <div class="perf-content" style="display: ${this.expanded ? 'block' : 'none'}">
        <div class="perf-metric" id="perf-fps">
          <span class="metric-label">FPS</span>
          <span class="metric-value">0</span>
        </div>
        <div class="perf-metric" id="perf-memory">
          <span class="metric-label">内存</span>
          <span class="metric-value">0 MB</span>
        </div>
        <div class="perf-metric" id="perf-latency">
          <span class="metric-label">延迟</span>
          <span class="metric-value">0 ms</span>
        </div>
        <div class="perf-chart" id="perf-chart"></div>
        <div class="perf-quality">
          <span class="quality-label">画质:</span>
          <select id="perf-quality-select">
            <option value="auto">自动</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
      </div>
    `;
    
    this.elements = {
      dashboard,
      fps: dashboard.querySelector('#perf-fps .metric-value'),
      memory: dashboard.querySelector('#perf-memory .metric-value'),
      latency: dashboard.querySelector('#perf-latency .metric-value'),
      chart: dashboard.querySelector('#perf-chart'),
      qualitySelect: dashboard.querySelector('#perf-quality-select')
    };
    
    const style = document.createElement('style');
    style.textContent = `
      .perf-dashboard {
        position: fixed;
        background: rgba(0, 0, 0, 0.85);
        border-radius: 8px;
        padding: 8px;
        font-family: monospace;
        font-size: 12px;
        color: #fff;
        z-index: 10000;
        min-width: 150px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      }
      .perf-dashboard-bottom-right { bottom: 10px; right: 10px; }
      .perf-dashboard-bottom-left { bottom: 10px; left: 10px; }
      .perf-header {
        display: flex;
        justify-content: space-between;
        cursor: pointer;
        padding: 4px;
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        margin-bottom: 8px;
      }
      .perf-header:hover { background: rgba(255,255,255,0.2); }
      .perf-metric {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .metric-value { color: #4ade80; }
      .metric-value.warning { color: #fbbf24; }
      .metric-value.critical { color: #ef4444; }
      .perf-quality {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }
      .perf-quality select {
        background: rgba(255,255,255,0.1);
        color: #fff;
        border: none;
        padding: 2px 4px;
        border-radius: 4px;
      }
      .perf-chart {
        height: 60px;
        margin-top: 8px;
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
      }
    `;
    
    document.head.appendChild(style);
    this.container.appendChild(dashboard);
    
    this.elements.qualitySelect.addEventListener('change', (e) => {
      this.monitor.setQualityLevel(e.target.value);
    });
    
    window._perfDashboard = this;
    
    return dashboard;
  }

  start() {
    this.monitor.start();
    
    this.updateInterval = setInterval(() => {
      this.update();
    }, 500);
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.monitor.stop();
  }

  update() {
    const metrics = this.monitor.getCurrentMetrics();
    const health = this.monitor.getHealthStatus();
    
    this.elements.fps.textContent = metrics.fps;
    this.elements.fps.className = `metric-value ${metrics.fps < 30 ? 'critical' : metrics.fps < 50 ? 'warning' : ''}`;
    
    this.elements.memory.textContent = `${metrics.memory} MB`;
    this.elements.memory.className = `metric-value ${metrics.memory > 800 ? 'critical' : metrics.memory > 500 ? 'warning' : ''}`;
    
    this.elements.latency.textContent = `${Math.round(metrics.latency)} ms`;
    this.elements.latency.className = `metric-value ${metrics.latency > 100 ? 'critical' : metrics.latency > 50 ? 'warning' : ''}`;
  }

  toggle() {
    this.expanded = !this.expanded;
    const content = this.elements.dashboard.querySelector('.perf-content');
    const toggle = this.elements.dashboard.querySelector('.perf-toggle');
    
    content.style.display = this.expanded ? 'block' : 'none';
    toggle.textContent = this.expanded ? '−' : '+';
  }

  destroy() {
    this.stop();
    if (this.elements.dashboard) {
      this.elements.dashboard.remove();
    }
  }
}

/**
 * NetworkLatencyTracker - 网络延迟追踪器
 */
class NetworkLatencyTracker {
  constructor() {
    this.pings = [];
    this.maxPings = 100;
    this.lastPingTime = 0;
    this.latency = 0;
  }

  ping(url = '/api/health') {
    const startTime = performance.now();
    
    return fetch(url, { method: 'HEAD', cache: 'no-cache' })
      .then(() => {
        this.latency = Math.round(performance.now() - startTime);
        this._addPing(this.latency);
        return this.latency;
      })
      .catch(() => {
        this.latency = -1;
        return -1;
      });
  }

  _addPing(latency) {
    this.pings.push({
      latency,
      timestamp: Date.now()
    });
    
    if (this.pings.length > this.maxPings) {
      this.pings.shift();
    }
  }

  getAverage(period = 10) {
    const cutoff = Date.now() - period * 1000;
    const recent = this.pings.filter(p => p.timestamp > cutoff);
    
    if (recent.length === 0) return 0;
    
    const sum = recent.reduce((acc, p) => acc + p.latency, 0);
    return Math.round(sum / recent.length);
  }

  getStats() {
    if (this.pings.length === 0) {
      return { avg: 0, min: 0, max: 0, jitter: 0 };
    }
    
    const latencies = this.pings.map(p => p.latency).filter(l => l > 0);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    
    const variance = latencies.reduce((acc, l) => acc + Math.pow(l - avg, 2), 0) / latencies.length;
    const jitter = Math.round(Math.sqrt(variance));
    
    return {
      avg: Math.round(avg),
      min,
      max,
      jitter
    };
  }

  reset() {
    this.pings = [];
    this.latency = 0;
  }
}

if (typeof window !== 'undefined') {
  window.PerformanceMonitor = PerformanceMonitor;
  window.PerformanceDashboard = PerformanceDashboard;
  window.NetworkLatencyTracker = NetworkLatencyTracker;
}

if (typeof module !== 'undefined') {
  module.exports = {
    PerformanceMonitor,
    PerformanceDashboard,
    NetworkLatencyTracker
  };
}
