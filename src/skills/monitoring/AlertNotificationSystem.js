/**
 * Alert Notification System
 * Sends alerts via Slack, Email, Webhook, etc.
 */

class AlertNotificationSystem {
  constructor(options = {}) {
    this.channels = new Map();
    this.alertRules = [];
    this.alertHistory = [];
    this.maxHistory = 1000;
    
    this._initializeChannels(options.channels || {});
    this._initializeDefaultRules();
  }

  /**
   * Initialize notification channels
   */
  _initializeChannels(channels) {
    // Slack channel
    if (channels.slack) {
      this.channels.set('slack', {
        type: 'slack',
        webhookUrl: channels.slack.webhookUrl,
        channel: channels.slack.channel || '#alerts',
        enabled: channels.slack.enabled !== false,
        rateLimit: channels.slack.rateLimit || 10, // per minute
        lastSent: 0
      });
    }

    // Email channel
    if (channels.email) {
      this.channels.set('email', {
        type: 'email',
        smtp: channels.email.smtp,
        from: channels.email.from,
        to: channels.email.to || [],
        enabled: channels.email.enabled !== false
      });
    }

    // Webhook channel
    if (channels.webhook) {
      this.channels.set('webhook', {
        type: 'webhook',
        url: channels.webhook.url,
        method: channels.webhook.method || 'POST',
        headers: channels.webhook.headers || {},
        enabled: channels.webhook.enabled !== false
      });
    }

    // PagerDuty channel
    if (channels.pagerduty) {
      this.channels.set('pagerduty', {
        type: 'pagerduty',
        integrationKey: channels.pagerduty.integrationKey,
        enabled: channels.pagerduty.enabled !== false
      });
    }
  }

  /**
   * Initialize default alert rules
   */
  _initializeDefaultRules() {
    this.alertRules = [
      {
        id: 'low-success-rate',
        name: '成功率过低',
        condition: (metrics) => metrics.successRate < 0.95,
        severity: 'critical',
        channels: ['slack', 'email'],
        throttle: 300000, // 5 minutes
        lastTriggered: 0
      },
      {
        id: 'high-latency',
        name: '响应延迟过高',
        condition: (metrics) => metrics.p95ResponseTime > 5000,
        severity: 'warning',
        channels: ['slack'],
        throttle: 600000, // 10 minutes
        lastTriggered: 0
      },
      {
        id: 'high-error-rate',
        name: '错误率过高',
        condition: (metrics) => metrics.failedCalls > 10 && (metrics.failedCalls / metrics.totalCalls) > 0.1,
        severity: 'warning',
        channels: ['slack'],
        throttle: 600000,
        lastTriggered: 0
      },
      {
        id: 'critical-failure',
        name: '严重故障',
        condition: (metrics) => metrics.failedCalls > 50,
        severity: 'critical',
        channels: ['slack', 'email', 'pagerduty'],
        throttle: 300000,
        lastTriggered: 0
      },
      {
        id: 'user-churn',
        name: '用户流失预警',
        condition: (retention) => retention.churnRate > 0.3,
        severity: 'warning',
        channels: ['slack'],
        throttle: 3600000, // 1 hour
        lastTriggered: 0
      }
    ];
  }

  /**
   * Add custom alert rule
   */
  addRule(rule) {
    const newRule = {
      id: rule.id || `custom-${Date.now()}`,
      name: rule.name,
      condition: rule.condition,
      severity: rule.severity || 'warning',
      channels: rule.channels || ['slack'],
      throttle: rule.throttle || 300000,
      lastTriggered: 0
    };
    
    this.alertRules.push(newRule);
    return newRule;
  }

  /**
   * Check and send alerts based on metrics
   */
  async checkAndAlert(skillMetrics, context = {}) {
    const now = Date.now();
    const triggeredAlerts = [];

    for (const rule of this.alertRules) {
      try {
        if (rule.condition(skillMetrics, context)) {
          // Check throttle
          if (now - rule.lastTriggered < rule.throttle) {
            continue;
          }

          const alert = {
            id: `alert-${Date.now()}-${rule.id}`,
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            skillName: skillMetrics.skillName,
            metrics: skillMetrics,
            context,
            timestamp: now,
            channels: rule.channels
          };

          // Send to each channel
          for (const channelName of rule.channels) {
            await this._sendToChannel(channelName, alert);
          }

          rule.lastTriggered = now;
          this._recordAlert(alert);
          triggeredAlerts.push(alert);
        }
      } catch (error) {
        console.error(`[AlertSystem] Error checking rule ${rule.id}:`, error);
      }
    }

    return triggeredAlerts;
  }

  /**
   * Send alert to specific channel
   */
  async _sendToChannel(channelName, alert) {
    const channel = this.channels.get(channelName);
    if (!channel || !channel.enabled) return;

    try {
      switch (channel.type) {
        case 'slack':
          await this._sendSlack(channel, alert);
          break;
        case 'email':
          await this._sendEmail(channel, alert);
          break;
        case 'webhook':
          await this._sendWebhook(channel, alert);
          break;
        case 'pagerduty':
          await this._sendPagerDuty(channel, alert);
          break;
      }
    } catch (error) {
      console.error(`[AlertSystem] Failed to send to ${channelName}:`, error);
    }
  }

  /**
   * Send to Slack
   */
  async _sendSlack(channel, alert) {
    // Rate limiting
    const now = Date.now();
    if (now - channel.lastSent < (60000 / channel.rateLimit)) {
      return;
    }

    const severityEmoji = {
      critical: '🔴',
      warning: '🟡',
      info: 'ℹ️'
    };

    const fields = [];
    
    if (alert.metrics) {
      if (alert.metrics.successRate !== undefined) {
        fields.push({
          title: '成功率',
          value: `${(alert.metrics.successRate * 100).toFixed(1)}%`,
          short: true
        });
      }
      if (alert.metrics.p95ResponseTime !== undefined) {
        fields.push({
          title: 'P95延迟',
          value: `${alert.metrics.p95ResponseTime}ms`,
          short: true
        });
      }
      if (alert.metrics.totalCalls !== undefined) {
        fields.push({
          title: '总调用',
          value: alert.metrics.totalCalls.toString(),
          short: true
        });
      }
    }

    const payload = {
      channel: channel.channel,
      username: 'UltraWork AI Alerts',
      icon_emoji: ':warning:',
      attachments: [{
        color: alert.severity === 'critical' ? '#ff0000' : '#ffa500',
        title: `${severityEmoji[alert.severity]} ${alert.ruleName}`,
        title_link: `https://ultrawork.ai/dashboard/skills/${alert.skillName}`,
        text: `技能 *${alert.skillName}* 触发了告警规则`,
        fields,
        footer: 'UltraWork AI Monitoring',
        ts: Math.floor(alert.timestamp / 1000)
      }]
    };

    const response = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    channel.lastSent = now;
  }

  /**
   * Send Email
   */
  async _sendEmail(channel, alert) {
    const severityColors = {
      critical: '#ff0000',
      warning: '#ffa500',
      info: '#0000ff'
    };

    const metricsHtml = alert.metrics ? `
      <h3>指标数据</h3>
      <table style="border-collapse: collapse; width: 100%;">
        <tr style="background: #f5f5f5;">
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>指标</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>值</strong></td>
        </tr>
        ${alert.metrics.successRate !== undefined ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">成功率</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${(alert.metrics.successRate * 100).toFixed(1)}%</td>
          </tr>
        ` : ''}
        ${alert.metrics.p95ResponseTime !== undefined ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">P95延迟</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${alert.metrics.p95ResponseTime}ms</td>
          </tr>
        ` : ''}
        ${alert.metrics.totalCalls !== undefined ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">总调用</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${alert.metrics.totalCalls}</td>
          </tr>
        ` : ''}
      </table>
    ` : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${severityColors[alert.severity]}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">${alert.ruleName}</h1>
          <p style="margin: 10px 0 0;">严重程度: ${alert.severity.toUpperCase()}</p>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2 style="color: #333;">技能: ${alert.skillName}</h2>
          <p style="color: #666;">检测时间: ${new Date(alert.timestamp).toLocaleString()}</p>
          ${metricsHtml}
          <p style="margin-top: 20px;">
            <a href="https://ultrawork.ai/dashboard/skills/${alert.skillName}" 
               style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              查看详情
            </a>
          </p>
        </div>
      </div>
    `;

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport(channel.smtp);

    await transporter.sendMail({
      from: channel.from,
      to: channel.to.join(', '),
      subject: `[${alert.severity.toUpperCase()}] UltraWork AI - ${alert.ruleName}: ${alert.skillName}`,
      html
    });
  }

  /**
   * Send to Webhook
   */
  async _sendWebhook(channel, alert) {
    const payload = {
      event: 'alert',
      alert: {
        id: alert.id,
        name: alert.ruleName,
        severity: alert.severity,
        skill: alert.skillName,
        metrics: alert.metrics,
        timestamp: alert.timestamp
      }
    };

    await fetch(channel.url, {
      method: channel.method,
      headers: {
        'Content-Type': 'application/json',
        ...channel.headers
      },
      body: JSON.stringify(payload)
    });
  }

  /**
   * Send to PagerDuty
   */
  async _sendPagerDuty(channel, alert) {
    const severityMap = {
      critical: 'critical',
      warning: 'warning',
      info: 'info'
    };

    const payload = {
      routing_key: channel.integrationKey,
      event_action: 'trigger',
      dedup_key: alert.id,
      payload: {
        summary: `${alert.ruleName} - ${alert.skillName}`,
        severity: severityMap[alert.severity],
        source: 'ultrawork-ai',
        timestamp: new Date(alert.timestamp).toISOString(),
        custom_details: {
          skill_name: alert.skillName,
          rule_name: alert.ruleName,
          metrics: alert.metrics
        }
      }
    };

    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  /**
   * Record alert history
   */
  _recordAlert(alert) {
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxHistory) {
      this.alertHistory = this.alertHistory.slice(0, this.maxHistory);
    }
  }

  /**
   * Get alert history
   */
  getHistory(options = {}) {
    const { skillName, severity, limit = 50 } = options;
    
    let history = [...this.alertHistory];
    
    if (skillName) {
      history = history.filter(a => a.skillName === skillName);
    }
    
    if (severity) {
      history = history.filter(a => a.severity === severity);
    }
    
    return history.slice(0, limit);
  }

  /**
   * Get alert statistics
   */
  getStats() {
    const stats = {
      total: this.alertHistory.length,
      bySeverity: { critical: 0, warning: 0, info: 0 },
      byChannel: {},
      recentAlerts: []
    };

    for (const alert of this.alertHistory) {
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
      
      for (const channel of alert.channels) {
        stats.byChannel[channel] = (stats.byChannel[channel] || 0) + 1;
      }
    }

    stats.recentAlerts = this.alertHistory.slice(0, 10);

    return stats;
  }

  /**
   * Configure channel
   */
  configureChannel(name, config) {
    const channel = this.channels.get(name);
    if (channel) {
      Object.assign(channel, config);
    }
  }

  /**
   * Enable/disable channel
   */
  setChannelEnabled(name, enabled) {
    const channel = this.channels.get(name);
    if (channel) {
      channel.enabled = enabled;
    }
  }
}

// Alert configuration schema
const AlertConfigSchema = {
  slack: {
    webhookUrl: { type: 'string', required: true },
    channel: { type: 'string', default: '#alerts' },
    enabled: { type: 'boolean', default: true },
    rateLimit: { type: 'number', default: 10 }
  },
  email: {
    smtp: {
      host: { type: 'string', required: true },
      port: { type: 'number', default: 587 },
      secure: { type: 'boolean', default: false },
      auth: {
        user: { type: 'string', required: true },
        pass: { type: 'string', required: true }
      }
    },
    from: { type: 'string', required: true },
    to: { type: 'array', required: true },
    enabled: { type: 'boolean', default: true }
  },
  webhook: {
    url: { type: 'string', required: true },
    method: { type: 'string', default: 'POST' },
    headers: { type: 'object', default: {} },
    enabled: { type: 'boolean', default: true }
  },
  pagerduty: {
    integrationKey: { type: 'string', required: true },
    enabled: { type: 'boolean', default: true }
  }
};

module.exports = { AlertNotificationSystem, AlertConfigSchema };