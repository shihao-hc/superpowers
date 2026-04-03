/**
 * MCP 实时告警管理器
 * 监控敏感操作并通过 PlatformBridge 发送告警
 */

const { PlatformBridge } = require('../agent/PlatformBridge');

const SENSITIVE_TOOLS = [
  { pattern: /delete/i, severity: 'high', name: '删除操作' },
  { pattern: /create_release/i, severity: 'high', name: '创建Release' },
  { pattern: /write_file/i, severity: 'medium', name: '写入文件' },
  { pattern: /create_issue/i, severity: 'low', name: '创建Issue' },
  { pattern: /move_file/i, severity: 'high', name: '移动文件' },
  { pattern: /drop_table/i, severity: 'critical', name: '删除表' },
  { pattern: /create_database/i, severity: 'high', name: '创建数据库' }
];

const SEVERITY_COLORS = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵'
};

class MCPAlertManager {
  constructor(options = {}) {
    this.platformBridge = options.platformBridge || new PlatformBridge();
    this.alertChannels = new Map();
    this.alertRules = [];
    this.alertHistory = [];
    this.maxHistory = options.maxHistory || 1000;
    this.onAlert = options.onAlert || (() => {});
    this.alertCounters = new Map();
    this.rateLimitWindows = new Map();

    this._setupDefaultRules();
  }

  _setupDefaultRules() {
    this.addRule({
      id: 'sensitive_ops',
      name: '敏感操作告警',
      enabled: true,
      match: (toolName) => {
        return SENSITIVE_TOOLS.some(s => s.pattern.test(toolName));
      },
      severity: (toolName) => {
        const match = SENSITIVE_TOOLS.find(s => s.pattern.test(toolName));
        return match ? match.severity : 'low';
      },
      rateLimit: 60,
      platforms: ['slack', 'wechat_work'],
      template: (data) => ({
        content: this._formatAlertMessage(data)
      })
    });

    this.addRule({
      id: 'failed_auth',
      name: '认证失败告警',
      enabled: true,
      match: (toolName, context) => {
        return context.result?.error?.includes('access_denied') ||
               context.result?.error?.includes('Unauthorized');
      },
      severity: () => 'medium',
      rateLimit: 300,
      platforms: ['slack'],
      template: (data) => ({
        content: `🔐 *认证失败告警*\n\n用户 \`${data.username}\` 尝试调用 \`${data.toolFullName}\` 失败\n\n原因: ${data.result?.error || '未知错误'}\n\n时间: ${new Date().toISOString()}`
      })
    });

    this.addRule({
      id: 'high_failure_rate',
      name: '高频失败告警',
      enabled: true,
      match: (toolName, context) => {
        const key = `${context.username}:${toolName}`;
        const count = this.alertCounters.get(key) || 0;
        return count >= 5;
      },
      severity: () => 'high',
      rateLimit: 600,
      platforms: ['slack', 'wechat_work'],
      template: (data) => ({
        content: `⚠️ *高频失败告警*\n\n用户 \`${data.username}\` 调用 \`${data.toolFullName}\` 连续失败\n\n失败次数: ${this.alertCounters.get(`${data.username}:${data.toolFullName}`) || 0}\n\n建议: 检查权限配置或账号状态`
      })
    });

    this.addRule({
      id: 'unusual_activity',
      name: '异常活动告警',
      enabled: true,
      match: (toolName, context) => {
        const hour = new Date().getHours();
        return (hour < 6 || hour > 22) && context.role !== 'admin';
      },
      severity: () => 'low',
      rateLimit: 3600,
      platforms: ['slack'],
      template: (data) => ({
        content: `🌙 *异常时间活动*\n\n非工作时段调用: \`${data.toolFullName}\`\n\n用户: ${data.username} (${data.role})\n\n时间: ${new Date().toISOString()}`
      })
    });
  }

  addRule(rule) {
    this.alertRules.push({
      id: rule.id || `rule_${Date.now()}`,
      enabled: rule.enabled !== false,
      match: rule.match,
      severity: typeof rule.severity === 'function' ? rule.severity : () => rule.severity || 'low',
      rateLimit: rule.rateLimit || 60,
      platforms: rule.platforms || ['slack'],
      template: rule.template
    });
  }

  removeRule(ruleId) {
    const index = this.alertRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.alertRules.splice(index, 1);
      return true;
    }
    return false;
  }

  registerAlertChannel(channelId, config) {
    this.alertChannels.set(channelId, {
      id: channelId,
      platform: config.platform || 'slack',
      channel: config.channel,
      enabled: config.enabled !== false,
      severityFilter: config.severityFilter || ['critical', 'high', 'medium', 'low']
    });

    this.platformBridge.registerPlatform(channelId, {
      name: config.name || channelId,
      type: config.platform,
      ...config
    });

    return this.alertChannels.get(channelId);
  }

  async connectChannel(channelId) {
    return this.platformBridge.connect(channelId);
  }

  async processAlert(callData) {
    const alerts = [];

    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      if (!this._checkRateLimit(rule.id, rule.rateLimit)) {
        continue;
      }

      if (rule.match(callData.toolFullName, callData)) {
        const severity = rule.severity(callData.toolFullName, callData);
        const alert = await this._sendAlert(rule, severity, callData);
        if (alert) {
          alerts.push(alert);
          this._incrementCounter(callData);
        }
      }
    }

    return alerts;
  }

  async _sendAlert(rule, severity, callData) {
    const channelIds = this._getChannelsForSeverity(severity, rule.platforms);

    if (channelIds.length === 0) {
      return null;
    }

    const templateData = {
      ...callData,
      severity,
      timestamp: new Date().toISOString(),
      traceId: callData.traceId
    };

    const message = rule.template(templateData);

    const results = [];
    for (const channelId of channelIds) {
      try {
        const result = await this.platformBridge.send(channelId, message);
        results.push({ channelId, ...result });

        this._recordAlert({
          ruleId: rule.id,
          severity,
          toolFullName: callData.toolFullName,
          username: callData.username,
          role: callData.role,
          channelId,
          timestamp: Date.now()
        });
      } catch (error) {
        results.push({ channelId, error: error.message });
      }
    }

    this.onAlert({
      rule: rule.id,
      severity,
      callData,
      results
    });

    return { rule: rule.id, severity, results };
  }

  _getChannelsForSeverity(severity, preferredPlatforms) {
    const channelIds = [];
    const severityOrder = ['critical', 'high', 'medium', 'low'];
    const severityIndex = severityOrder.indexOf(severity);

    for (const [channelId, config] of this.alertChannels) {
      if (!config.enabled) continue;
      if (!config.severityFilter.includes(severity)) continue;
      if (!preferredPlatforms.includes(config.platform)) continue;

      channelIds.push(channelId);
    }

    return channelIds;
  }

  _checkRateLimit(ruleId, windowSeconds) {
    const key = `ratelimit:${ruleId}`;
    const now = Date.now();
    const window = this.rateLimitWindows.get(key);

    if (!window) {
      this.rateLimitWindows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return true;
    }

    if (now > window.resetAt) {
      this.rateLimitWindows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return true;
    }

    if (window.count >= 5) {
      return false;
    }

    window.count++;
    return true;
  }

  _incrementCounter(callData) {
    const key = `${callData.username}:${callData.toolFullName}`;
    const count = this.alertCounters.get(key) || 0;
    this.alertCounters.set(key, count + 1);

    setTimeout(() => {
      const current = this.alertCounters.get(key) || 0;
      if (current > 0) {
        this.alertCounters.set(key, current - 1);
      }
    }, 60000);
  }

  _formatAlertMessage(data) {
    const severityIcon = SEVERITY_COLORS[data.severity] || '⚪';
    const severityText = {
      critical: '严重',
      high: '高危',
      medium: '中等',
      low: '低危'
    };

    const sensitiveInfo = SENSITIVE_TOOLS.find(s => s.pattern.test(data.toolFullName));

    return [
      `${severityIcon} *${severityText[data.severity]}告警* - MCP 敏感操作`,
      '',
      `📌 操作: \`${data.toolFullName}\``,
      `👤 用户: ${data.username} (${data.role})`,
      `🖥️ IP: ${data.ip || '未知'}`,
      `⏱️ 时间: ${new Date(data.timestamp || Date.now()).toLocaleString('zh-CN')}`,
      `🔖 Trace: \`${data.traceId || 'N/A'}\``,
      sensitiveInfo ? `⚠️ 类型: ${sensitiveInfo.name}` : '',
      '',
      data.result?.success === false ? `❌ 状态: 失败 (${data.result?.error || '未知错误'})` : '',
      '',
      '---',
      '_由 MCP 告警系统自动发送_'
    ].filter(Boolean).join('\n');
  }

  _recordAlert(alert) {
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.maxHistory) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistory / 2);
    }
  }

  getAlertHistory(options = {}) {
    let history = [...this.alertHistory];

    if (options.since) {
      const since = typeof options.since === 'number' ? options.since : Date.now() - options.since;
      history = history.filter(a => a.timestamp >= since);
    }

    if (options.severity) {
      history = history.filter(a => a.severity === options.severity);
    }

    if (options.ruleId) {
      history = history.filter(a => a.ruleId === options.ruleId);
    }

    if (options.username) {
      history = history.filter(a => a.username === options.username);
    }

    return history;
  }

  getStats() {
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    const byRule = {};

    for (const alert of this.alertHistory) {
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
      byRule[alert.ruleId] = (byRule[alert.ruleId] || 0) + 1;
    }

    return {
      total: this.alertHistory.length,
      bySeverity,
      byRule,
      activeRules: this.alertRules.filter(r => r.enabled).length,
      configuredChannels: this.alertChannels.size
    };
  }

  exportConfig() {
    return {
      rules: this.alertRules.map(r => ({
        id: r.id,
        enabled: r.enabled,
        rateLimit: r.rateLimit,
        platforms: r.platforms
      })),
      channels: Array.from(this.alertChannels.entries()).map(([id, config]) => ({
        id,
        ...config
      }))
    };
  }

  destroy() {
    this.alertRules = [];
    this.alertHistory = [];
    this.alertChannels.clear();
    this.alertCounters.clear();
    this.rateLimitWindows.clear();
  }
}

let globalAlertManager = null;

function getMCPAlertManager(options = {}) {
  if (!globalAlertManager) {
    globalAlertManager = new MCPAlertManager(options);
  }
  return globalAlertManager;
}

async function alertSensitiveOperation(callData) {
  const manager = getMCPAlertManager();
  return manager.processAlert(callData);
}

module.exports = {
  MCPAlertManager,
  getMCPAlertManager,
  alertSensitiveOperation,
  SENSITIVE_TOOLS
};
