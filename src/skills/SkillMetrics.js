/**
 * Skill Metrics Tracker
 * Tracks skill executions, downloads, views, and other usage metrics
 */

const fs = require('fs');
const path = require('path');

class SkillMetrics {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'metrics');
    this.metricsFile = path.join(this.dataDir, 'skill-metrics.json');
    
    // In-memory metrics storage
    this.metrics = {
      executions: {
        total: 0,
        successful: 0,
        failed: 0,
        bySkill: new Map(),
        byType: new Map(), // 'python', 'javascript', 'docker'
        averageExecutionTime: 0
      },
      downloads: {
        total: 0,
        bySkill: new Map(),
        byUser: new Map()
      },
      views: {
        total: 0,
        bySkill: new Map(),
        uniqueVisitors: new Map()
      },
      errors: {
        total: 0,
        byType: new Map(),
        bySkill: new Map()
      },
      performance: {
        cacheHits: 0,
        cacheMisses: 0,
        dockerExecutions: 0,
        localExecutions: 0
      }
    };
    
    // Execution times for average calculation
    this.executionTimes = [];
    this.maxExecutionTimes = 1000; // Keep last 1000 execution times
    
    this._ensureDataDir();
    this._loadMetrics();
  }

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadMetrics() {
    try {
      if (fs.existsSync(this.metricsFile)) {
        const data = JSON.parse(fs.readFileSync(this.metricsFile, 'utf8'));
        
        // Convert arrays back to Maps
        if (data.executions && data.executions.bySkill) {
          this.metrics.executions.bySkill = new Map(Object.entries(data.executions.bySkill));
        }
        if (data.executions && data.executions.byType) {
          this.metrics.executions.byType = new Map(Object.entries(data.executions.byType));
        }
        if (data.downloads && data.downloads.bySkill) {
          this.metrics.downloads.bySkill = new Map(Object.entries(data.downloads.bySkill));
        }
        if (data.downloads && data.downloads.byUser) {
          this.metrics.downloads.byUser = new Map(Object.entries(data.downloads.byUser));
        }
        if (data.views && data.views.bySkill) {
          this.metrics.views.bySkill = new Map(Object.entries(data.views.bySkill));
        }
        if (data.views && data.views.uniqueVisitors) {
          this.metrics.views.uniqueVisitors = new Map(Object.entries(data.views.uniqueVisitors));
        }
        if (data.errors && data.errors.byType) {
          this.metrics.errors.byType = new Map(Object.entries(data.errors.byType));
        }
        if (data.errors && data.errors.bySkill) {
          this.metrics.errors.bySkill = new Map(Object.entries(data.errors.bySkill));
        }
        
        // Copy scalar values
        this.metrics.executions.total = data.executions?.total || 0;
        this.metrics.executions.successful = data.executions?.successful || 0;
        this.metrics.executions.failed = data.executions?.failed || 0;
        this.metrics.executions.averageExecutionTime = data.executions?.averageExecutionTime || 0;
        
        this.metrics.downloads.total = data.downloads?.total || 0;
        this.metrics.views.total = data.views?.total || 0;
        this.metrics.errors.total = data.errors?.total || 0;
        
        this.metrics.performance.cacheHits = data.performance?.cacheHits || 0;
        this.metrics.performance.cacheMisses = data.performance?.cacheMisses || 0;
        this.metrics.performance.dockerExecutions = data.performance?.dockerExecutions || 0;
        this.metrics.performance.localExecutions = data.performance?.localExecutions || 0;
      }
    } catch (error) {
      console.warn('Failed to load skill metrics:', error.message);
    }
  }

  _saveMetrics() {
    try {
      const data = {
        executions: {
          ...this.metrics.executions,
          bySkill: Object.fromEntries(this.metrics.executions.bySkill),
          byType: Object.fromEntries(this.metrics.executions.byType)
        },
        downloads: {
          ...this.metrics.downloads,
          bySkill: Object.fromEntries(this.metrics.downloads.bySkill),
          byUser: Object.fromEntries(this.metrics.downloads.byUser)
        },
        views: {
          ...this.metrics.views,
          bySkill: Object.fromEntries(this.metrics.views.bySkill),
          uniqueVisitors: Object.fromEntries(this.metrics.views.uniqueVisitors)
        },
        errors: {
          ...this.metrics.errors,
          byType: Object.fromEntries(this.metrics.errors.byType),
          bySkill: Object.fromEntries(this.metrics.errors.bySkill)
        },
        performance: this.metrics.performance,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.metricsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save skill metrics:', error.message);
    }
  }

  /**
   * Record a skill execution
   */
  recordExecution(skillName, options = {}) {
    const { success = true, duration = 0, type = 'unknown', error = null } = options;
    
    this.metrics.executions.total++;
    
    if (success) {
      this.metrics.executions.successful++;
    } else {
      this.metrics.executions.failed++;
    }
    
    // Track by skill
    const skillCount = this.metrics.executions.bySkill.get(skillName) || 0;
    this.metrics.executions.bySkill.set(skillName, skillCount + 1);
    
    // Track by type
    const typeCount = this.metrics.executions.byType.get(type) || 0;
    this.metrics.executions.byType.set(type, typeCount + 1);
    
    // Update execution times
    if (duration > 0) {
      this.executionTimes.push(duration);
      if (this.executionTimes.length > this.maxExecutionTimes) {
        this.executionTimes.shift();
      }
      
      // Calculate average
      const sum = this.executionTimes.reduce((a, b) => a + b, 0);
      this.metrics.executions.averageExecutionTime = Math.round(sum / this.executionTimes.length);
    }
    
    // Track error if provided
    if (error) {
      this.recordError(skillName, error);
    }
    
    this._saveMetrics();
  }

  /**
   * Record a skill download
   */
  recordDownload(skillName, userId = 'anonymous') {
    this.metrics.downloads.total++;
    
    // Track by skill
    const skillCount = this.metrics.downloads.bySkill.get(skillName) || 0;
    this.metrics.downloads.bySkill.set(skillName, skillCount + 1);
    
    // Track by user
    const userCount = this.metrics.downloads.byUser.get(userId) || 0;
    this.metrics.downloads.byUser.set(userId, userCount + 1);
    
    this._saveMetrics();
  }

  /**
   * Record a skill view
   */
  recordView(skillName, visitorId = 'anonymous') {
    this.metrics.views.total++;
    
    // Track by skill
    const skillCount = this.metrics.views.bySkill.get(skillName) || 0;
    this.metrics.views.bySkill.set(skillName, skillCount + 1);
    
    // Track unique visitors
    const visitorKey = `${skillName}:${visitorId}`;
    const visitorCount = this.metrics.views.uniqueVisitors.get(visitorKey) || 0;
    this.metrics.views.uniqueVisitors.set(visitorKey, visitorCount + 1);
    
    this._saveMetrics();
  }

  /**
   * Record an error
   */
  recordError(skillName, errorType = 'unknown') {
    this.metrics.errors.total++;
    
    // Track by type
    const typeCount = this.metrics.errors.byType.get(errorType) || 0;
    this.metrics.errors.byType.set(errorType, typeCount + 1);
    
    // Track by skill
    const skillCount = this.metrics.errors.bySkill.get(skillName) || 0;
    this.metrics.errors.bySkill.set(skillName, skillCount + 1);
    
    this._saveMetrics();
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit() {
    this.metrics.performance.cacheHits++;
    this._saveMetrics();
  }

  recordCacheMiss() {
    this.metrics.performance.cacheMisses++;
    this._saveMetrics();
  }

  /**
   * Record execution environment
   */
  recordDockerExecution() {
    this.metrics.performance.dockerExecutions++;
    this._saveMetrics();
  }

  recordLocalExecution() {
    this.metrics.performance.localExecutions++;
    this._saveMetrics();
  }

  /**
   * Get metrics for Prometheus export
   */
  getMetricsForPrometheus() {
    return {
      executions: {
        total: this.metrics.executions.total,
        successful: this.metrics.executions.successful,
        failed: this.metrics.executions.failed,
        averageTime: this.metrics.executions.averageExecutionTime,
        bySkill: Object.fromEntries(this.metrics.executions.bySkill),
        byType: Object.fromEntries(this.metrics.executions.byType)
      },
      downloads: {
        total: this.metrics.downloads.total,
        bySkill: Object.fromEntries(this.metrics.downloads.bySkill)
      },
      views: {
        total: this.metrics.views.total,
        bySkill: Object.fromEntries(this.metrics.views.bySkill)
      },
      errors: {
        total: this.metrics.errors.total,
        byType: Object.fromEntries(this.metrics.errors.byType),
        bySkill: Object.fromEntries(this.metrics.errors.bySkill)
      },
      performance: { ...this.metrics.performance }
    };
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const successRate = this.metrics.executions.total > 0 
      ? (this.metrics.executions.successful / this.metrics.executions.total * 100).toFixed(2)
      : 0;
    
    const cacheHitRate = (this.metrics.performance.cacheHits + this.metrics.performance.cacheMisses) > 0
      ? (this.metrics.performance.cacheHits / (this.metrics.performance.cacheHits + this.metrics.performance.cacheMisses) * 100).toFixed(2)
      : 0;
    
    return {
      totalExecutions: this.metrics.executions.total,
      successRate: parseFloat(successRate),
      totalDownloads: this.metrics.downloads.total,
      totalViews: this.metrics.views.total,
      totalErrors: this.metrics.errors.total,
      averageExecutionTime: this.metrics.executions.averageExecutionTime,
      cacheHitRate: parseFloat(cacheHitRate),
      topSkills: this._getTopSkills(),
      errorRate: this.metrics.executions.total > 0 
        ? (this.metrics.errors.total / this.metrics.executions.total * 100).toFixed(2)
        : 0
    };
  }

  /**
   * Get top skills by usage
   */
  _getTopSkills(limit = 10) {
    const skillUsage = new Map();
    
    // Combine execution, download, and view counts
    for (const [skill, count] of this.metrics.executions.bySkill) {
      skillUsage.set(skill, (skillUsage.get(skill) || 0) + count);
    }
    for (const [skill, count] of this.metrics.downloads.bySkill) {
      skillUsage.set(skill, (skillUsage.get(skill) || 0) + count);
    }
    for (const [skill, count] of this.metrics.views.bySkill) {
      skillUsage.set(skill, (skillUsage.get(skill) || 0) + count);
    }
    
    // Sort by usage
    const sorted = Array.from(skillUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
    
    return sorted.map(([skill, usage]) => ({ skill, usage }));
  }

  /**
   * Reset metrics (for testing or maintenance)
   */
  reset() {
    this.metrics = {
      executions: { total: 0, successful: 0, failed: 0, bySkill: new Map(), byType: new Map(), averageExecutionTime: 0 },
      downloads: { total: 0, bySkill: new Map(), byUser: new Map() },
      views: { total: 0, bySkill: new Map(), uniqueVisitors: new Map() },
      errors: { total: 0, byType: new Map(), bySkill: new Map() },
      performance: { cacheHits: 0, cacheMisses: 0, dockerExecutions: 0, localExecutions: 0 }
    };
    this.executionTimes = [];
    this._saveMetrics();
  }
}

// Singleton instance
let instance = null;

function getSkillMetrics(options) {
  if (!instance) {
    instance = new SkillMetrics(options);
  }
  return instance;
}

module.exports = { SkillMetrics, getSkillMetrics };
