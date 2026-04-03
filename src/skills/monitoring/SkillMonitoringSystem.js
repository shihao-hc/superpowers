/**
 * Enhanced Skill Monitoring System
 * Tracks success rates, response times, user retention, and provides analytics
 */

class SkillMonitoringSystem {
  constructor(options = {}) {
    this.metrics = {
      skillCalls: new Map(),
      responseTimes: new Map(),
      errors: new Map(),
      userSessions: new Map(),
      retention: new Map()
    };

    this.alerts = [];
    this.alertThreshold = options.alertThreshold || {
      successRate: { min: 0.95, max: 1.0 },
      responseTime: { p95: 5000 },
      errorRate: { max: 0.05 }
    };

    this.retentionWindows = [
      { name: 'daily', ms: 86400000 },
      { name: 'weekly', ms: 604800000 },
      { name: 'monthly', ms: 2592000000 }
    ];

    this.storage = options.storage || null;
    this._loadMetrics();
    
    // Start periodic cleanup
    this._startPeriodicTasks();
  }

  /**
   * Record skill call
   */
  recordSkillCall(skillName, callData = {}) {
    const { 
      success = true, 
      duration = 0, 
      userId = null,
      sessionId = null,
      domain = null,
      error = null,
      timestamp = Date.now()
    } = callData;

    // Initialize if not exists
    if (!this.metrics.skillCalls.has(skillName)) {
      this.metrics.skillCalls.set(skillName, {
        total: 0,
        successful: 0,
        failed: 0,
        totalDuration: 0,
        avgDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        lastCall: null,
        firstCall: null,
        domain,
        hourlyDistribution: new Array(24).fill(0),
        dailyDistribution: new Array(7).fill(0),
        errorTypes: new Map()
      });
    }

    const stats = this.metrics.skillCalls.get(skillName);
    stats.total++;
    stats.lastCall = timestamp;
    if (!stats.firstCall) stats.firstCall = timestamp;

    if (success) {
      stats.successful++;
    } else {
      stats.failed++;
      if (error) {
        const errorCount = stats.errorTypes.get(error) || 0;
        stats.errorTypes.set(error, errorCount + 1);
      }
    }

    // Update duration stats
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.total;
    this._updatePercentiles(skillName, duration);

    // Update time distributions
    const hour = new Date(timestamp).getHours();
    const day = new Date(timestamp).getDay();
    stats.hourlyDistribution[hour]++;
    stats.dailyDistribution[day]++;

    // Track user session if provided
    if (userId && sessionId) {
      this._trackUserSession(userId, sessionId, skillName, success);
    }

    // Check for alerts
    this._checkAlerts(skillName, stats);

    return stats;
  }

  /**
   * Update percentiles
   */
  _updatePercentiles(skillName, duration) {
    const stats = this.metrics.skillCalls.get(skillName);
    if (!stats) return;

    // Maintain a small sample for percentile calculation
    if (!stats.durationSamples) {
      stats.durationSamples = [];
    }

    stats.durationSamples.push(duration);
    if (stats.durationSamples.length > 1000) {
      stats.durationSamples = stats.durationSamples.slice(-1000);
    }

    // Calculate percentiles
    const sorted = [...stats.durationSamples].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    stats.p50Duration = sorted[p50Index] || 0;
    stats.p95Duration = sorted[p95Index] || 0;
    stats.p99Duration = sorted[p99Index] || 0;
  }

  /**
   * Track user session
   */
  _trackUserSession(userId, sessionId, skillName, success) {
    // Initialize user metrics
    if (!this.metrics.userSessions.has(userId)) {
      this.metrics.userSessions.set(userId, {
        userId,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        sessions: new Map(),
        skillsUsed: new Map(),
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0
      });
    }

    const userStats = this.metrics.userSessions.get(userId);
    userStats.lastSeen = Date.now();
    userStats.totalCalls++;

    if (success) {
      userStats.successfulCalls++;
    } else {
      userStats.failedCalls++;
    }

    // Track session
    if (!userStats.sessions.has(sessionId)) {
      userStats.sessions.set(sessionId, {
        sessionId,
        startTime: Date.now(),
        lastActivity: Date.now(),
        calls: 0,
        skillsUsed: new Set()
      });
    }

    const sessionStats = userStats.sessions.get(sessionId);
    sessionStats.lastActivity = Date.now();
    sessionStats.calls++;
    sessionStats.skillsUsed.add(skillName);

    // Track skill usage
    const skillCount = userStats.skillsUsed.get(skillName) || 0;
    userStats.skillsUsed.set(skillName, skillCount + 1);

    // Update retention tracking
    this._updateRetention(userId);
  }

  /**
   * Update retention metrics
   */
  _updateRetention(userId) {
    const userStats = this.metrics.userSessions.get(userId);
    if (!userStats) return;

    const now = Date.now();

    for (const window of this.retentionWindows) {
      if (!this.metrics.retention.has(window.name)) {
        this.metrics.retention.set(window.name, new Map());
      }

      const retentionMap = this.metrics.retention.get(window.name);
      const windowStart = now - window.ms;

      // Check if user was active in this window
      let wasActive = false;
      
      // Check last activity
      if (userStats.lastSeen >= windowStart) {
        wasActive = true;
      }

      // Check sessions
      for (const [sessionId, session] of userStats.sessions) {
        if (session.lastActivity >= windowStart) {
          wasActive = true;
          break;
        }
      }

      const currentRetention = retentionMap.get('activeUsers') || new Set();
      if (wasActive) {
        currentRetention.add(userId);
      }
      retentionMap.set('activeUsers', currentRetention);
    }
  }

  /**
   * Check for alerts
   */
  _checkAlerts(skillName, stats) {
    const alerts = [];

    // Success rate alert
    if (stats.total >= 10) {
      const successRate = stats.successful / stats.total;
      if (successRate < this.alertThreshold.successRate.min) {
        alerts.push({
          type: 'success_rate',
          skill: skillName,
          severity: successRate < 0.8 ? 'critical' : 'warning',
          message: `Success rate dropped to ${(successRate * 100).toFixed(1)}%`,
          value: successRate,
          threshold: this.alertThreshold.successRate.min,
          timestamp: Date.now()
        });
      }
    }

    // Response time alert
    if (stats.p95Duration > this.alertThreshold.responseTime.p95) {
      alerts.push({
        type: 'response_time',
        skill: skillName,
        severity: stats.p95Duration > this.alertThreshold.responseTime.p95 * 2 ? 'critical' : 'warning',
        message: `P95 response time: ${stats.p95Duration}ms`,
        value: stats.p95Duration,
        threshold: this.alertThreshold.responseTime.p95,
        timestamp: Date.now()
      });
    }

    // Error rate alert
    if (stats.total >= 10) {
      const errorRate = stats.failed / stats.total;
      if (errorRate > this.alertThreshold.errorRate.max) {
        alerts.push({
          type: 'error_rate',
          skill: skillName,
          severity: errorRate > 0.1 ? 'critical' : 'warning',
          message: `Error rate: ${(errorRate * 100).toFixed(1)}%`,
          value: errorRate,
          threshold: this.alertThreshold.errorRate.max,
          timestamp: Date.now()
        });
      }
    }

    // Add new alerts
    for (const alert of alerts) {
      // Avoid duplicate alerts within 5 minutes
      const isDuplicate = this.alerts.some(a => 
        a.skill === alert.skill && 
        a.type === alert.type && 
        alert.timestamp - a.timestamp < 300000
      );

      if (!isDuplicate) {
        this.alerts.unshift(alert);
        if (this.alerts.length > 100) {
          this.alerts = this.alerts.slice(0, 100);
        }
      }
    }
  }

  /**
   * Get skill metrics
   */
  getSkillMetrics(skillName, options = {}) {
    const stats = this.metrics.skillCalls.get(skillName);
    if (!stats) return null;

    const { 
      successRate = 0, 
      total = 0, 
      avgDuration = 0,
      p95Duration = 0 
    } = stats;

    return {
      skillName,
      totalCalls: total,
      successfulCalls: stats.successful,
      failedCalls: stats.failed,
      successRate: total > 0 ? stats.successful / total : 0,
      averageResponseTime: avgDuration,
      p50ResponseTime: stats.p50Duration,
      p95ResponseTime: p95Duration,
      p99ResponseTime: stats.p99Duration,
      firstCall: stats.firstCall,
      lastCall: stats.lastCall,
      hourlyDistribution: stats.hourlyDistribution,
      dailyDistribution: stats.dailyDistribution,
      topErrors: Array.from(stats.errorTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([error, count]) => ({ error, count }))
    };
  }

  /**
   * Get all skills metrics summary
   */
  getAllSkillsMetrics(options = {}) {
    const { domain = null, sortBy = 'totalCalls' } = options;

    const results = [];
    
    for (const [skillName, stats] of this.metrics.skillCalls) {
      if (domain && stats.domain !== domain) continue;

      results.push({
        skillName,
        domain: stats.domain,
        totalCalls: stats.total,
        successRate: stats.total > 0 ? stats.successful / stats.total : 0,
        averageResponseTime: stats.avgDuration,
        p95ResponseTime: stats.p95Duration,
        lastCall: stats.lastCall
      });
    }

    // Sort
    switch (sortBy) {
      case 'totalCalls':
        results.sort((a, b) => b.totalCalls - a.totalCalls);
        break;
      case 'successRate':
        results.sort((a, b) => b.successRate - a.successRate);
        break;
      case 'responseTime':
        results.sort((a, b) => b.p95ResponseTime - a.p95ResponseTime);
        break;
    }

    return results;
  }

  /**
   * Get user retention metrics
   */
  getRetentionMetrics(options = {}) {
    const { window = 'weekly' } = options;
    const retentionMap = this.metrics.retention.get(window);
    
    if (!retentionMap) {
      return { window, activeUsers: 0, retention: {} };
    }

    const activeUsers = retentionMap.get('activeUsers')?.size || 0;

    // Calculate retention by cohort
    const retention = {};
    const now = Date.now();

    for (const [cohortDate, cohortData] of retentionMap) {
      if (cohortDate === 'activeUsers') continue;
      
      const cohortRetention = Array.from(cohortData.values())
        .filter(userId => {
          const userStats = this.metrics.userSessions.get(userId);
          return userStats && userStats.lastSeen >= now - 86400000;
        }).length;

      retention[cohortDate] = {
        originalSize: cohortData.size,
        retainedSize: cohortRetention,
        retentionRate: cohortData.size > 0 ? cohortRetention / cohortData.size : 0
      };
    }

    return {
      window,
      activeUsers,
      retention,
      totalUsers: this.metrics.userSessions.size
    };
  }

  /**
   * Get user engagement metrics
   */
  getUserEngagementMetrics(options = {}) {
    const { limit = 50, sortBy = 'lastSeen' } = options;

    const users = Array.from(this.metrics.userSessions.values())
      .map(user => ({
        userId: user.userId,
        firstSeen: user.firstSeen,
        lastSeen: user.lastSeen,
        totalCalls: user.totalCalls,
        successfulCalls: user.successfulCalls,
        failedCalls: user.failedCalls,
        successRate: user.totalCalls > 0 ? user.successfulCalls / user.totalCalls : 0,
        sessionCount: user.sessions.size,
        skillsUsed: user.skillsUsed.size,
        daysActive: Math.floor((user.lastSeen - user.firstSeen) / 86400000) + 1,
        avgCallsPerDay: Math.floor(user.totalCalls / Math.max(1, Math.floor((user.lastSeen - user.firstSeen) / 86400000) + 1))
      }));

    // Sort
    switch (sortBy) {
      case 'totalCalls':
        users.sort((a, b) => b.totalCalls - a.totalCalls);
        break;
      case 'lastSeen':
        users.sort((a, b) => b.lastSeen - a.lastSeen);
        break;
      case 'engagement':
        users.sort((a, b) => b.avgCallsPerDay - a.avgCallsPerDay);
        break;
    }

    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => Date.now() - u.lastSeen < 86400000).length,
      users: users.slice(0, limit)
    };
  }

  /**
   * Get dashboard summary
   */
  getDashboardSummary() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    let totalCalls = 0;
    let successfulCalls = 0;
    let totalDuration = 0;
    let recentCalls = 0;
    let recentSuccessful = 0;

    for (const [skillName, stats] of this.metrics.skillCalls) {
      totalCalls += stats.total;
      successfulCalls += stats.successful;
      totalDuration += stats.totalDuration;

      if (stats.lastCall >= oneHourAgo) {
        recentCalls += stats.total;
        recentSuccessful += stats.successful;
      }
    }

    const overallSuccessRate = totalCalls > 0 ? successfulCalls / totalCalls : 0;
    const recentSuccessRate = recentCalls > 0 ? recentSuccessful / recentCalls : 0;
    const avgResponseTime = totalCalls > 0 ? totalDuration / totalCalls : 0;

    return {
      overall: {
        totalCalls,
        successfulCalls,
        failedCalls: totalCalls - successfulCalls,
        successRate: overallSuccessRate,
        averageResponseTime: avgResponseTime
      },
      recent: {
        lastHour: {
          calls: recentCalls,
          successRate: recentSuccessRate
        }
      },
      users: {
        total: this.metrics.userSessions.size,
        active: this.metrics.userSessions.size
      },
      skills: {
        total: this.metrics.skillCalls.size,
        withErrors: this.alerts.filter(a => a.severity === 'critical').length
      },
      alerts: {
        critical: this.alerts.filter(a => a.severity === 'critical').length,
        warning: this.alerts.filter(a => a.severity === 'warning').length,
        total: this.alerts.length
      }
    };
  }

  /**
   * Get alerts
   */
  getAlerts(options = {}) {
    const { severity = null, skill = null, limit = 20 } = options;

    let alerts = [...this.alerts];

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }

    if (skill) {
      alerts = alerts.filter(a => a.skill === skill);
    }

    return alerts.slice(0, limit);
  }

  /**
   * Dismiss alert
   */
  dismissAlert(alertIndex) {
    if (alertIndex >= 0 && alertIndex < this.alerts.length) {
      this.alerts.splice(alertIndex, 1);
      return true;
    }
    return false;
  }

  /**
   * Export metrics for Prometheus
   */
  exportPrometheusMetrics() {
    const lines = [];

    // Overall metrics
    lines.push('# HELP ultrawork_skill_calls_total Total skill calls');
    lines.push('# TYPE ultrawork_skill_calls_total counter');
    
    for (const [skillName, stats] of this.metrics.skillCalls) {
      lines.push(`ultrawork_skill_calls_total{skill="${skillName}"} ${stats.total}`);
    }

    // Success rate
    lines.push('\n# HELP ultrawork_skill_success_rate Skill success rate');
    lines.push('# TYPE ultrawork_skill_success_rate gauge');
    
    for (const [skillName, stats] of this.metrics.skillCalls) {
      const rate = stats.total > 0 ? stats.successful / stats.total : 0;
      lines.push(`ultrawork_skill_success_rate{skill="${skillName}"} ${rate}`);
    }

    // Response time
    lines.push('\n# HELP ultrawork_skill_response_time_ms Skill response time (ms)');
    lines.push('# TYPE ultrawork_skill_response_time_ms gauge');
    
    for (const [skillName, stats] of this.metrics.skillCalls) {
      lines.push(`ultrawork_skill_response_time_ms_avg{skill="${skillName}"} ${stats.avgDuration}`);
      lines.push(`ultrawork_skill_response_time_ms_p95{skill="${skillName}"} ${stats.p95Duration}`);
    }

    // User metrics
    lines.push('\n# HELP ultrawork_active_users Active users');
    lines.push('# TYPE ultrawork_active_users gauge');
    lines.push(`ultrawork_active_users ${this.metrics.userSessions.size}`);

    return lines.join('\n');
  }

  /**
   * Generate improvement recommendations
   */
  generateImprovementRecommendations() {
    const recommendations = [];

    // Low success rate skills
    for (const [skillName, stats] of this.metrics.skillCalls) {
      if (stats.total >= 10) {
        const successRate = stats.successful / stats.total;
        
        if (successRate < 0.8) {
          recommendations.push({
            priority: 'high',
            type: 'reliability',
            skill: skillName,
            issue: `Low success rate: ${(successRate * 100).toFixed(1)}%`,
            suggestion: 'Review error logs and improve error handling',
            metrics: {
              totalCalls: stats.total,
              failures: stats.failed,
              topErrors: Array.from(stats.errorTypes.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
            }
          });
        }

        // High latency
        if (stats.p95Duration > 10000) {
          recommendations.push({
            priority: 'medium',
            type: 'performance',
            skill: skillName,
            issue: `High P95 latency: ${stats.p95Duration}ms`,
            suggestion: 'Consider adding caching or optimizing the algorithm',
            metrics: {
              avgDuration: stats.avgDuration,
              p95Duration: stats.p95Duration,
              p99Duration: stats.p99Duration
            }
          });
        }
      }
    }

    // User retention issues
    const retention = this.getRetentionMetrics();
    if (retention.totalUsers > 0) {
      const churnRate = 1 - (retention.activeUsers / retention.totalUsers);
      
      if (churnRate > 0.3) {
        recommendations.push({
          priority: 'high',
          type: 'retention',
          issue: `High user churn: ${(churnRate * 100).toFixed(1)}%`,
          suggestion: 'Analyze user feedback and improve onboarding experience',
          metrics: {
            totalUsers: retention.totalUsers,
            activeUsers: retention.activeUsers,
            churnRate
          }
        });
      }
    }

    // Sort by priority
    recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return recommendations;
  }

  /**
   * Start periodic tasks
   */
  _startPeriodicTasks() {
    // Cleanup old alerts every hour
    setInterval(() => {
      const oneDayAgo = Date.now() - 86400000;
      this.alerts = this.alerts.filter(a => a.timestamp > oneDayAgo);
    }, 3600000);

    // Save metrics periodically
    if (this.storage?.save) {
      setInterval(() => {
        this._saveMetrics();
      }, 300000); // Every 5 minutes
    }
  }

  /**
   * Load metrics from storage
   */
  async _loadMetrics() {
    if (this.storage?.load) {
      try {
        const data = await this.storage.load('skillMetrics');
        if (data) {
          // Restore metrics (simplified)
          console.log('[SkillMonitoring] Loaded metrics from storage');
        }
      } catch (e) {
        console.error('[SkillMonitoring] Failed to load metrics:', e);
      }
    }
  }

  /**
   * Save metrics to storage
   */
  async _saveMetrics() {
    if (this.storage?.save) {
      try {
        // Save simplified metrics (exclude Maps)
        const simplified = {
          skillCalls: Array.from(this.metrics.skillCalls.entries()),
          retention: Array.from(this.metrics.retention.entries()),
          alerts: this.alerts
        };
        await this.storage.save('skillMetrics', simplified);
      } catch (e) {
        console.error('[SkillMonitoring] Failed to save metrics:', e);
      }
    }
  }
}

module.exports = { SkillMonitoringSystem };