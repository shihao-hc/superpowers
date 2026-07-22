/**
 * Alert Notification System
 * 告警通知系统
 */

const { EventEmitter } = require('events');

class Alert extends EventEmitter {
  constructor(id, config) {
    super();
    this.id = id;
    this.name = config.name;
    this.condition = config.condition;
    this.severity = config.severity || 'warning';
    this.message = config.message;
    this.threshold = config.threshold;
    this.cooldown = config.cooldown || 60000;

    this.lastTriggered = null;
    this.isActive = false;
    this.triggerCount = 0;
  }

  check(value) {
    const result = this.condition(value);

    if (result && this.canTrigger()) {
      this.trigger(result);
      return true;
    }

    if (!result && this.isActive) {
      this.resolve();
    }

    return false;
  }

  canTrigger() {
    if (!this.lastTriggered) {return true;}
    return Date.now() - this.lastTriggered > this.cooldown;
  }

  trigger(context) {
    this.isActive = true;
    this.lastTriggered = Date.now();
    this.triggerCount++;

    this.emit('triggered', {
      alert: this,
      context,
      timestamp: this.lastTriggered
    });
  }

  resolve() {
    this.isActive = false;

    this.emit('resolved', {
      alert: this,
      duration: Date.now() - this.lastTriggered
    });
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      severity: this.severity,
      isActive: this.isActive,
      lastTriggered: this.lastTriggered,
      triggerCount: this.triggerCount
    };
  }
}

class AlertManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      enableNotifications: options.enableNotifications !== false,
      ...options
    };

    this.alerts = new Map();
    this.handlers = new Map();
    this.notificationChannels = new Set();

    this.on('triggered', this.handleTriggered.bind(this));
  }

  /**
   * 创建告警规则
   */
  createAlert(name, config) {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alert = new Alert(id, { name, ...config });
    this.alerts.set(id, alert);

    alert.on('triggered', (data) => this.emit('alert:triggered', data));
    alert.on('resolved', (data) => this.emit('alert:resolved', data));

    return alert;
  }

  /**
   * 添加告警处理器
   */
  addHandler(alertId, handler) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.on('triggered', handler);
    }
  }

  /**
   * 注册通知渠道
   */
  registerChannel(channel) {
    this.notificationChannels.add(channel);
  }

  /**
   * 移除通知渠道
   */
  unregisterChannel(channel) {
    this.notificationChannels.delete(channel);
  }

  /**
   * 处理触发事件
   */
  handleTriggered(data) {
    if (!this.options.enableNotifications) {return;}

    for (const channel of this.notificationChannels) {
      try {
        channel.send(data);
      } catch (error) {
        console.error('Notification failed:', error.message);
      }
    }
  }

  /**
   * 检查所有告警
   */
  checkAll(metrics) {
    const results = [];

    for (const alert of this.alerts.values()) {
      const value = this.getMetricValue(metrics, alert.name);
      if (value !== undefined) {
        const triggered = alert.check(value);
        results.push({
          alertId: alert.id,
          triggered
        });
      }
    }

    return results;
  }

  /**
   * 获取指标值
   */
  getMetricValue(metrics, name) {
    if (typeof metrics === 'object') {
      return metrics[name];
    }
    return undefined;
  }

  /**
   * 获取所有告警状态
   */
  getStatus() {
    const alerts = [];

    for (const alert of this.alerts.values()) {
      alerts.push(alert.getStatus());
    }

    return {
      total: alerts.length,
      active: alerts.filter((a) => a.isActive).length,
      bySeverity: {
        critical: alerts.filter((a) => a.severity === 'critical' && a.isActive).length,
        error: alerts.filter((a) => a.severity === 'error' && a.isActive).length,
        warning: alerts.filter((a) => a.severity === 'warning' && a.isActive).length,
        info: alerts.filter((a) => a.severity === 'info' && a.isActive).length
      },
      alerts
    };
  }

  /**
   * 预设告警
   */
  static createPresetAlerts(manager) {
    // CPU 使用率
    manager.createAlert('high_cpu', {
      name: 'high_cpu',
      severity: 'warning',
      threshold: 80,
      condition: (value) => value > 80,
      message: 'CPU 使用率过高',
      cooldown: 300000
    });

    // 内存使用率
    manager.createAlert('high_memory', {
      name: 'high_memory',
      severity: 'warning',
      threshold: 85,
      condition: (value) => value > 85,
      message: '内存使用率过高',
      cooldown: 300000
    });

    // 错误率
    manager.createAlert('high_error_rate', {
      name: 'high_error_rate',
      severity: 'error',
      threshold: 0.05,
      condition: (value) => value > 0.05,
      message: '错误率过高',
      cooldown: 60000
    });

    // 延迟
    manager.createAlert('high_latency', {
      name: 'high_latency',
      severity: 'warning',
      threshold: 1000,
      condition: (value) => value > 1000,
      message: '响应延迟过高',
      cooldown: 180000
    });

    return manager;
  }
}

// 通知渠道示例：Console Channel
class ConsoleChannel {
  send(data) {
    const { alert, context } = data;
    const severity = alert.severity.toUpperCase().padEnd(8);
    console.log(`[${severity}] ${alert.message}`, context);
  }
}

// 通知渠道示例：Webhook Channel
class WebhookChannel {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
  }

  async send(data) {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers
      },
      body: JSON.stringify({
        alert: data.alert.name,
        severity: data.alert.severity,
        message: data.alert.message,
        context: data.context,
        timestamp: new Date(data.timestamp).toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  }
}

module.exports = { AlertManager, Alert, ConsoleChannel, WebhookChannel };
