/**
 * Audit Reporter
 * 企业审计报告系统
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { splitLines } = require('../utils/UltraWorkUtils');

class AuditEntry {
  constructor(data) {
    this.id = data.id || this.generateId();
    this.timestamp = data.timestamp || Date.now();
    this.eventType = data.eventType;
    this.severity = data.severity || 'info';
    this.userId = data.userId;
    this.userName = data.userName;
    this.action = data.action;
    this.resource = data.resource;
    this.resourceId = data.resourceId;
    this.details = data.details || {};
    this.ipAddress = data.ipAddress;
    this.userAgent = data.userAgent;
    this.sessionId = data.sessionId;
    this.changes = data.changes || [];
    this.metadata = data.metadata || {};
  }

  generateId() {
    return `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
}

class AuditReporter {
  constructor(options = {}) {
    this.options = {
      storageDir: options.storageDir || './audit',
      retentionDays: options.retentionDays || 365,
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024,
      compressOld: options.compressOld !== false,
      ...options
    };

    this.entries = [];
    this.currentFile = null;
    this.currentFileSize = 0;

    this.ensureStorage();
    this.rotateFile();
  }

  ensureStorage() {
    if (!fs.existsSync(this.options.storageDir)) {
      fs.mkdirSync(this.options.storageDir, { recursive: true });
    }
  }

  /**
   * 记录审计事件
   */
  log(eventType, data = {}) {
    const entry = new AuditEntry({
      eventType,
      ...data
    });

    this.entries.push(entry);
    this.writeEntry(entry);

    return entry;
  }

  /**
   * 快捷方法
   */
  logUserAction(user, action, resource, details = {}) {
    return this.log('user_action', {
      userId: user.id,
      userName: user.name,
      action,
      resource,
      severity: 'info',
      details
    });
  }

  logSecurityEvent(user, event, details = {}) {
    return this.log('security', {
      userId: user?.id,
      userName: user?.name,
      action: event,
      severity: 'warning',
      details
    });
  }

  logSystemEvent(event, details = {}) {
    return this.log('system', {
      action: event,
      severity: 'info',
      details
    });
  }

  logDataChange(user, resource, changes, details = {}) {
    return this.log('data_change', {
      userId: user?.id,
      userName: user?.name,
      action: 'update',
      resource,
      changes,
      severity: 'info',
      details
    });
  }

  logError(user, error, context = {}) {
    return this.log('error', {
      userId: user?.id,
      userName: user?.name,
      action: 'error',
      severity: 'error',
      details: { message: error.message, stack: error.stack, ...context }
    });
  }

  /**
   * 写入条目
   */
  writeEntry(entry) {
    const line = `${JSON.stringify(entry)}\n`;

    if (this.currentFileSize + line.length > this.options.maxFileSize) {
      this.rotateFile();
    }

    fs.appendFileSync(this.currentFile, line);
    this.currentFileSize += line.length;
  }

  /**
   * 轮换文件
   */
  rotateFile() {
    if (this.currentFile) {
      const stats = fs.statSync(this.currentFile);
      if (stats.size > 0) {
        // 压缩旧文件
        if (this.options.compressOld) {
          this.compressFile(this.currentFile);
        }
      }
    }

    const date = new Date().toISOString().split('T')[0];
    this.currentFile = path.join(this.options.storageDir, `audit_${date}.log`);
    this.currentFileSize = 0;
  }

  /**
   * 压缩文件
   */
  compressFile(filePath) {
    // 简化实现：实际应该使用 zlib
    const gzip = require('zlib').createGzip;
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(`${filePath}.gz`);

    input.pipe(gzip()).pipe(output);
  }

  /**
   * 查询审计记录
   */
  query(options = {}) {
    const {
      startDate = 0,
      endDate = Date.now(),
      eventType = null,
      userId = null,
      severity = null,
      resource = null,
      action = null,
      limit = 100,
      offset = 0
    } = options;

    const results = [];
    const files = this.getLogFiles();

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = splitLines(content).filter((l) => l.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);

            // 过滤
            if (entry.timestamp < startDate || entry.timestamp > endDate) {continue;}
            if (eventType && entry.eventType !== eventType) {continue;}
            if (userId && entry.userId !== userId) {continue;}
            if (severity && entry.severity !== severity) {continue;}
            if (resource && entry.resource !== resource) {continue;}
            if (action && entry.action !== action) {continue;}

            results.push(entry);
          } catch {
            // 跳过无效行
          }
        }
      } catch {
        // 跳过无法读取的文件
      }
    }

    // 排序（按时间倒序）
    results.sort((a, b) => b.timestamp - a.timestamp);

    return {
      total: results.length,
      data: results.slice(offset, offset + limit),
      hasMore: offset + limit < results.length
    };
  }

  /**
   * 获取用户活动
   */
  getUserActivity(userId, options = {}) {
    return this.query({
      ...options,
      userId
    });
  }

  /**
   * 获取资源历史
   */
  getResourceHistory(resourceId, options = {}) {
    return this.query({
      ...options,
      resourceId
    });
  }

  /**
   * 生成报告
   */
  generateReport(options = {}) {
    const {
      startDate = Date.now() - 7 * 24 * 60 * 60 * 1000,
      endDate = Date.now()
    } = options;

    const data = this.query({ startDate, endDate, limit: 10000 });

    // 统计
    const stats = {
      total: data.data.length,
      byType: {},
      bySeverity: {},
      byUser: {},
      byResource: {},
      timeDistribution: {}
    };

    for (const entry of data.data) {
      // 按类型
      stats.byType[entry.eventType] = (stats.byType[entry.eventType] || 0) + 1;

      // 按严重级别
      stats.bySeverity[entry.severity] = (stats.bySeverity[entry.severity] || 0) + 1;

      // 按用户
      if (entry.userId) {
        stats.byUser[entry.userId] = (stats.byUser[entry.userId] || 0) + 1;
      }

      // 按资源
      if (entry.resource) {
        stats.byResource[entry.resource] = (stats.byResource[entry.resource] || 0) + 1;
      }

      // 时间分布（按小时）
      const hour = new Date(entry.timestamp).getHours();
      stats.timeDistribution[hour] = (stats.timeDistribution[hour] || 0) + 1;
    }

    // 活跃用户 Top 10
    const topUsers = Object.entries(stats.byUser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ userId: id, count }));

    return {
      period: { startDate, endDate },
      stats,
      topUsers,
      generatedAt: Date.now()
    };
  }

  /**
   * 导出报告
   */
  exportReport(format = 'json', options = {}) {
    const report = this.generateReport(options);

    switch (format) {
    case 'json':
      return JSON.stringify(report, null, 2);

    case 'csv': {
      const lines = ['Type,Count'];
      for (const [type, count] of Object.entries(report.stats.byType)) {
        lines.push(`${type},${count}`);
      }
      return lines.join('\n');
    }

    case 'html':
      return this.generateHTMLReport(report);

    default:
      return JSON.stringify(report);
    }
  }

  /**
   * 生成 HTML 报告
   */
  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Audit Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f4f4f4; }
    .severity-critical { color: red; }
    .severity-warning { color: orange; }
    .severity-info { color: blue; }
  </style>
</head>
<body>
  <h1>Audit Report</h1>
  <p>Period: ${new Date(report.period.startDate).toISOString()} to ${new Date(report.period.endDate).toISOString()}</p>
  <p>Total Events: ${report.stats.total}</p>
  
  <h2>Events by Type</h2>
  <table>
    <tr><th>Type</th><th>Count</th></tr>
    ${Object.entries(report.stats.byType).map(([t, c]) => `<tr><td>${t}</td><td>${c}</td></tr>`).join('')}
  </table>
  
  <h2>Events by Severity</h2>
  <table>
    <tr><th>Severity</th><th>Count</th></tr>
    ${Object.entries(report.stats.bySeverity).map(([s, c]) => `<tr><td class="severity-${s}">${s}</td><td>${c}</td></tr>`).join('')}
  </table>
</body>
</html>`;
  }

  /**
   * 获取日志文件列表
   */
  getLogFiles() {
    const files = fs.readdirSync(this.options.storageDir);
    return files
      .filter((f) => f.startsWith('audit_') && (f.endsWith('.log') || f.endsWith('.log.gz')))
      .map((f) => path.join(this.options.storageDir, f))
      .sort();
  }

  /**
   * 清理旧记录
   */
  cleanup() {
    const _cutoff = Date.now() - (this.options.retentionDays * 24 * 60 * 60 * 1000);
    const files = this.getLogFiles();
    let cleaned = 0;

    for (const file of files) {
      const _stats = fs.statSync(file);
      // 这里简化处理，实际应该检查文件内容的日期
      cleaned++;
    }

    return cleaned;
  }
}

module.exports = { AuditReporter, AuditEntry };
