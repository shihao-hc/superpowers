/**
 * Skill Monitoring System
 * Prometheus指标监控、自动版本清理
 */

const fs = require('fs');
const path = require('path');

class SkillMonitor {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'monitoring');
    this.metricsFile = path.join(this.dataDir, 'metrics.json');
    this.configFile = path.join(this.dataDir, 'config.json');
    
    // 监控配置
    this.config = {
      retentionDays: 90, // 保留90天的指标数据
      cleanupInterval: 24 * 60 * 60 * 1000, // 每天清理一次
      versionRetention: {
        keepLastVersions: 5, // 保留最近5个版本
        keepMajorVersions: true, // 保留主要版本
        minDaysToKeep: 30 // 至少保留30天
      },
      alerts: {
        errorRateThreshold: 0.05, // 5%错误率
        responseTimeThreshold: 5000, // 5秒响应时间
        cacheHitRateThreshold: 0.7 // 70%缓存命中率
      }
    };
    
    // 内存中的指标数据
    this.metrics = {
      executions: [],
      downloads: [],
      views: [],
      errors: [],
      performance: []
    };
    
    this._ensureDataDir();
    this._loadData();
    
    // 启动自动清理
    this._startAutoCleanup();
  }

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadData() {
    try {
      if (fs.existsSync(this.configFile)) {
        const configData = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        this.config = { ...this.config, ...configData };
      }
      
      if (fs.existsSync(this.metricsFile)) {
        const metricsData = JSON.parse(fs.readFileSync(this.metricsFile, 'utf8'));
        this.metrics = metricsData;
      }
    } catch (error) {
      console.warn('Failed to load monitoring data:', error.message);
    }
  }

  _saveData() {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
      fs.writeFileSync(this.metricsFile, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      console.warn('Failed to save monitoring data:', error.message);
    }
  }

  /**
   * 启动自动清理定时器
   */
  _startAutoCleanup() {
    setInterval(() => {
      this._cleanupOldMetrics();
      console.log('[SkillMonitor] 清理过期指标数据完成');
    }, this.config.cleanupInterval);
  }

  /**
   * 清理过期指标数据
   */
  _cleanupOldMetrics() {
    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    
    for (const key of Object.keys(this.metrics)) {
      if (Array.isArray(this.metrics[key])) {
        this.metrics[key] = this.metrics[key].filter(m => 
          new Date(m.timestamp) > cutoffDate
        );
      }
    }
    
    this._saveData();
  }

  /**
   * 记录执行指标
   */
  recordExecution(data) {
    const metric = {
      timestamp: new Date().toISOString(),
      skillId: data.skillId,
      success: data.success,
      duration: data.duration,
      error: data.error || null,
      ...data
    };
    
    this.metrics.executions.push(metric);
    
    // 限制保存数量
    if (this.metrics.executions.length > 10000) {
      this.metrics.executions = this.metrics.executions.slice(-5000);
    }
    
    this._saveData();
  }

  /**
   * 记录下载指标
   */
  recordDownload(data) {
    const metric = {
      timestamp: new Date().toISOString(),
      skillId: data.skillId,
      userId: data.userId,
      ...data
    };
    
    this.metrics.downloads.push(metric);
    this._saveData();
  }

  /**
   * 记录访问指标
   */
  recordView(data) {
    const metric = {
      timestamp: new Date().toISOString(),
      skillId: data.skillId,
      userId: data.userId,
      ...data
    };
    
    this.metrics.views.push(metric);
    
    if (this.metrics.views.length > 10000) {
      this.metrics.views = this.metrics.views.slice(-5000);
    }
    
    this._saveData();
  }

  /**
   * 记录错误
   */
  recordError(data) {
    const metric = {
      timestamp: new Date().toISOString(),
      skillId: data.skillId,
      errorType: data.errorType,
      errorMessage: data.errorMessage,
      stack: data.stack || null,
      ...data
    };
    
    this.metrics.errors.push(metric);
    
    if (this.metrics.errors.length > 5000) {
      this.metrics.errors = this.metrics.errors.slice(-2500);
    }
    
    this._saveData();
  }

  /**
   * 记录性能指标
   */
  recordPerformance(data) {
    const metric = {
      timestamp: new Date().toISOString(),
      cacheHits: data.cacheHits || 0,
      cacheMisses: data.cacheMisses || 0,
      avgResponseTime: data.avgResponseTime || 0,
      memoryUsage: data.memoryUsage || 0,
      cpuUsage: data.cpuUsage || 0,
      ...data
    };
    
    this.metrics.performance.push(metric);
    
    if (this.metrics.performance.length > 1000) {
      this.metrics.performance = this.metrics.performance.slice(-500);
    }
    
    this._saveData();
  }

  /**
   * 获取执行统计
   */
  getExecutionStats(options = {}) {
    const { timeRange = '24h', skillId = null } = options;
    const cutoff = this._getCutoffTime(timeRange);
    
    let executions = this.metrics.executions.filter(e => 
      new Date(e.timestamp) > cutoff
    );
    
    if (skillId) {
      executions = executions.filter(e => e.skillId === skillId);
    }
    
    const total = executions.length;
    const successful = executions.filter(e => e.success).length;
    const failed = total - successful;
    const avgDuration = total > 0 
      ? executions.reduce((sum, e) => sum + (e.duration || 0), 0) / total
      : 0;
    
    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : '0%',
      avgDuration: Math.round(avgDuration),
      timeRange,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取下载统计
   */
  getDownloadStats(options = {}) {
    const { timeRange = '24h', skillId = null } = options;
    const cutoff = this._getCutoffTime(timeRange);
    
    let downloads = this.metrics.downloads.filter(d => 
      new Date(d.timestamp) > cutoff
    );
    
    if (skillId) {
      downloads = downloads.filter(d => d.skillId === skillId);
    }
    
    // 按技能分组
    const bySkill = {};
    for (const d of downloads) {
      bySkill[d.skillId] = (bySkill[d.skillId] || 0) + 1;
    }
    
    // 排序
    const topSkills = Object.entries(bySkill)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([skillId, count]) => ({ skillId, count }));
    
    return {
      total: downloads.length,
      bySkill,
      topSkills,
      timeRange,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取错误统计
   */
  getErrorStats(options = {}) {
    const { timeRange = '24h', skillId = null } = options;
    const cutoff = this._getCutoffTime(timeRange);
    
    let errors = this.metrics.errors.filter(e => 
      new Date(e.timestamp) > cutoff
    );
    
    if (skillId) {
      errors = errors.filter(e => e.skillId === skillId);
    }
    
    // 按错误类型分组
    const byType = {};
    for (const e of errors) {
      byType[e.errorType || 'unknown'] = (byType[e.errorType || 'unknown'] || 0) + 1;
    }
    
    // 按技能分组
    const bySkill = {};
    for (const e of errors) {
      bySkill[e.skillId] = (bySkill[e.skillId] || 0) + 1;
    }
    
    return {
      total: errors.length,
      byType,
      bySkill,
      timeRange,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(options = {}) {
    const { timeRange = '1h' } = options;
    const cutoff = this._getCutoffTime(timeRange);
    
    const perfData = this.metrics.performance.filter(p => 
      new Date(p.timestamp) > cutoff
    );
    
    if (perfData.length === 0) {
      return {
        avgResponseTime: 0,
        cacheHitRate: '0%',
        avgMemoryUsage: 0,
        avgCpuUsage: 0,
        dataPoints: 0
      };
    }
    
    const avgResponseTime = perfData.reduce((sum, p) => sum + (p.avgResponseTime || 0), 0) / perfData.length;
    const totalCacheHits = perfData.reduce((sum, p) => sum + (p.cacheHits || 0), 0);
    const totalCacheMisses = perfData.reduce((sum, p) => sum + (p.cacheMisses || 0), 0);
    const cacheHitRate = (totalCacheHits + totalCacheMisses) > 0 
      ? totalCacheHits / (totalCacheHits + totalCacheMisses) * 100 
      : 0;
    const avgMemoryUsage = perfData.reduce((sum, p) => sum + (p.memoryUsage || 0), 0) / perfData.length;
    const avgCpuUsage = perfData.reduce((sum, p) => sum + (p.cpuUsage || 0), 0) / perfData.length;
    
    return {
      avgResponseTime: Math.round(avgResponseTime),
      cacheHitRate: cacheHitRate.toFixed(2) + '%',
      avgMemoryUsage: Math.round(avgMemoryUsage),
      avgCpuUsage: avgCpuUsage.toFixed(2) + '%',
      dataPoints: perfData.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取告警
   */
  getAlerts() {
    const alerts = [];
    
    // 检查错误率
    const execStats = this.getExecutionStats({ timeRange: '1h' });
    const errorRate = execStats.total > 0 ? execStats.failed / execStats.total : 0;
    if (errorRate > this.config.alerts.errorRateThreshold) {
      alerts.push({
        type: 'error_rate',
        severity: 'high',
        message: `错误率 ${(errorRate * 100).toFixed(2)}% 超过阈值 ${(this.config.alerts.errorRateThreshold * 100)}%`,
        timestamp: new Date().toISOString()
      });
    }
    
    // 检查响应时间
    const perfStats = this.getPerformanceStats({ timeRange: '1h' });
    if (perfStats.avgResponseTime > this.config.alerts.responseTimeThreshold) {
      alerts.push({
        type: 'response_time',
        severity: 'medium',
        message: `平均响应时间 ${perfStats.avgResponseTime}ms 超过阈值 ${this.config.alerts.responseTimeThreshold}ms`,
        timestamp: new Date().toISOString()
      });
    }
    
    // 检查缓存命中率
    const cacheHitRate = parseFloat(perfStats.cacheHitRate) / 100;
    if (cacheHitRate < this.config.alerts.cacheHitRateThreshold && perfStats.dataPoints > 0) {
      alerts.push({
        type: 'cache_hit_rate',
        severity: 'low',
        message: `缓存命中率 ${perfStats.cacheHitRate} 低于阈值 ${(this.config.alerts.cacheHitRateThreshold * 100)}%`,
        timestamp: new Date().toISOString()
      });
    }
    
    return alerts;
  }

  /**
   * 清理旧版本
   */
  async cleanupOldVersions(versionManager, options = {}) {
    const { dryRun = false } = options;
    const results = {
      checked: 0,
      archived: 0,
      deleted: 0,
      kept: 0,
      details: []
    };

    try {
      const allVersions = versionManager.getAllVersions();
      
      // 按技能分组
      const versionsBySkill = {};
      for (const v of allVersions) {
        if (!versionsBySkill[v.skillName]) {
          versionsBySkill[v.skillName] = [];
        }
        versionsBySkill[v.skillName].push(v);
      }

      for (const [skillName, versions] of Object.entries(versionsBySkill)) {
        // 按版本号排序（最新在前）
        versions.sort((a, b) => 
          versionManager._compareVersions(b.version, a.version)
        );

        results.checked += versions.length;

        // 保留策略
        const toKeep = new Set();
        
        // 1. 保留最近的N个版本
        for (let i = 0; i < Math.min(this.config.versionRetention.keepLastVersions, versions.length); i++) {
          toKeep.add(versions[i].version);
        }

        // 2. 保留主要版本
        if (this.config.versionRetention.keepMajorVersions) {
          const majorVersions = new Set();
          for (const v of versions) {
            const major = v.version.split('.')[0];
            if (!majorVersions.has(major)) {
              majorVersions.add(major);
              toKeep.add(v.version);
            }
          }
        }

        // 3. 检查保留天数
        const minKeepDate = new Date(Date.now() - this.config.versionRetention.minDaysToKeep * 24 * 60 * 60 * 1000);

        for (const version of versions) {
          if (toKeep.has(version.version)) {
            results.kept++;
            results.details.push({
              skillName,
              version: version.version,
              action: 'kept',
              reason: 'Within retention policy'
            });
            continue;
          }

          const createdDate = new Date(version.createdAt);
          if (createdDate > minKeepDate) {
            results.kept++;
            results.details.push({
              skillName,
              version: version.version,
              action: 'kept',
              reason: 'Within minimum retention period'
            });
            continue;
          }

          // 可以归档或删除
          if (!dryRun) {
            try {
              await versionManager.updateVersionStatus(skillName, version.version, 'archived', 'Auto-archived by retention policy');
              results.archived++;
              results.details.push({
                skillName,
                version: version.version,
                action: 'archived'
              });
            } catch (error) {
              results.details.push({
                skillName,
                version: version.version,
                action: 'failed',
                error: error.message
              });
            }
          } else {
            results.archived++;
            results.details.push({
              skillName,
              version: version.version,
              action: 'would_archive',
              reason: 'Dry run'
            });
          }
        }
      }

    } catch (error) {
      results.error = error.message;
    }

    return results;
  }

  /**
   * 获取截止时间
   */
  _getCutoffTime(timeRange) {
    const now = Date.now();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    
    return new Date(now - (ranges[timeRange] || ranges['24h']));
  }

  /**
   * 生成Prometheus格式指标
   */
  generatePrometheusMetrics() {
    const lines = [];
    
    // 执行指标
    const execStats = this.getExecutionStats({ timeRange: '1h' });
    lines.push('# HELP skill_executions_total Total skill executions');
    lines.push('# TYPE skill_executions_total counter');
    lines.push(`skill_executions_total ${execStats.total}`);
    
    lines.push('# HELP skill_executions_successful Successful executions');
    lines.push('# TYPE skill_executions_successful counter');
    lines.push(`skill_executions_successful ${execStats.successful}`);
    
    lines.push('# HELP skill_executions_failed Failed executions');
    lines.push('# TYPE skill_executions_failed counter');
    lines.push(`skill_executions_failed ${execStats.failed}`);
    
    lines.push('# HELP skill_avg_duration_ms Average execution duration');
    lines.push('# TYPE skill_avg_duration_ms gauge');
    lines.push(`skill_avg_duration_ms ${execStats.avgDuration}`);
    
    // 下载指标
    const dlStats = this.getDownloadStats({ timeRange: '24h' });
    lines.push('# HELP skill_downloads_total Total downloads');
    lines.push('# TYPE skill_downloads_total counter');
    lines.push(`skill_downloads_total ${dlStats.total}`);
    
    // 性能指标
    const perfStats = this.getPerformanceStats({ timeRange: '1h' });
    lines.push('# HELP skill_cache_hit_rate Cache hit rate');
    lines.push('# TYPE skill_cache_hit_rate gauge');
    lines.push(`skill_cache_hit_rate ${parseFloat(perfStats.cacheHitRate) / 100}`);
    
    lines.push('# HELP skill_avg_response_time_ms Average response time');
    lines.push('# TYPE skill_avg_response_time_ms gauge');
    lines.push(`skill_avg_response_time_ms ${perfStats.avgResponseTime}`);
    
    // 错误指标
    const errStats = this.getErrorStats({ timeRange: '1h' });
    lines.push('# HELP skill_errors_total Total errors');
    lines.push('# TYPE skill_errors_total counter');
    lines.push(`skill_errors_total ${errStats.total}`);
    
    // 告警指标
    const alerts = this.getAlerts();
    lines.push('# HELP skill_alerts_active Active alerts');
    lines.push('# TYPE skill_alerts_active gauge');
    lines.push(`skill_alerts_active ${alerts.length}`);
    
    return lines.join('\n');
  }

  /**
   * 获取仪表板数据
   */
  getDashboardData() {
    return {
      summary: {
        executions: this.getExecutionStats({ timeRange: '24h' }),
        downloads: this.getDownloadStats({ timeRange: '7d' }),
        errors: this.getErrorStats({ timeRange: '24h' }),
        performance: this.getPerformanceStats({ timeRange: '1h' })
      },
      alerts: this.getAlerts(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { SkillMonitor };
