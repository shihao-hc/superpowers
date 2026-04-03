/**
 * Optimization Dashboard
 * 优化仪表板 - 提供统一的优化管理和报告界面
 */

const fs = require('fs');
const path = require('path');

class OptimizationDashboard {
  constructor(options = {}) {
    this.optimizer = options.optimizer;
    this.monitor = options.monitor;
    this.staticAnalyzer = options.staticAnalyzer;
    this.trustScore = options.trustScore;
    this.rewardSystem = options.rewardSystem;
    this.reviewWorkflow = options.reviewWorkflow;
    
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'dashboard');
    this.reportsFile = path.join(this.dataDir, 'reports.json');
    
    this._ensureDataDir();
  }

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * 获取系统健康状态
   */
  async getSystemHealth() {
    const health = {
      status: 'healthy',
      components: {},
      issues: [],
      timestamp: new Date().toISOString()
    };

    // 检查监控系统
    if (this.monitor) {
      try {
        const perfStats = this.monitor.getPerformanceStats({ timeRange: '1h' });
        const errorStats = this.monitor.getErrorStats({ timeRange: '1h' });
        
        health.components.monitoring = {
          status: 'operational',
          dataPoints: perfStats.dataPoints,
          errorRate: errorStats.total
        };
        
        if (errorStats.total > 100) {
          health.issues.push({
            component: 'monitoring',
            severity: 'medium',
            message: `错误数量较高: ${errorStats.total}`
          });
        }
      } catch (error) {
        health.components.monitoring = { status: 'error', error: error.message };
        health.status = 'degraded';
      }
    }

    // 检查优化器
    if (this.optimizer) {
      try {
        const optimizerStats = this.optimizer.getStats();
        
        health.components.optimizer = {
          status: 'operational',
          totalOptimizations: optimizerStats.totalOptimizations,
          lastOptimization: optimizerStats.lastOptimization
        };
        
        // 检查是否长时间未优化
        if (optimizerStats.lastOptimization) {
          const daysSinceLastOptimization = (Date.now() - new Date(optimizerStats.lastOptimization).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastOptimization > 7) {
            health.issues.push({
              component: 'optimizer',
              severity: 'low',
              message: `${Math.floor(daysSinceLastOptimization)} 天未进行优化`
            });
          }
        }
      } catch (error) {
        health.components.optimizer = { status: 'error', error: error.message };
      }
    }

    // 检查信任分数系统
    if (this.trustScore) {
      try {
        const trustStats = this.trustScore.getStats();
        
        health.components.trustScore = {
          status: 'operational',
          totalSkills: trustStats.totalSkills,
          averageScore: trustStats.averageScore
        };
        
        if (trustStats.averageScore < 60) {
          health.issues.push({
            component: 'trustScore',
            severity: 'high',
            message: `平均信任分数过低: ${trustStats.averageScore}`
          });
          health.status = 'degraded';
        }
      } catch (error) {
        health.components.trustScore = { status: 'error', error: error.message };
      }
    }

    // 检查审核系统
    if (this.reviewWorkflow) {
      try {
        const reviewStats = this.reviewWorkflow.getStats();
        
        health.components.reviewWorkflow = {
          status: 'operational',
          pendingReviews: reviewStats.pending,
          approvalRate: reviewStats.approved / (reviewStats.approved + reviewStats.rejected || 1)
        };
        
        if (reviewStats.pending > 50) {
          health.issues.push({
            component: 'reviewWorkflow',
            severity: 'medium',
            message: `待审核技能积压: ${reviewStats.pending}`
          });
        }
      } catch (error) {
        health.components.reviewWorkflow = { status: 'error', error: error.message };
      }
    }

    // 更新总体状态
    const hasHighSeverityIssues = health.issues.some(i => i.severity === 'high');
    const hasMediumSeverityIssues = health.issues.some(i => i.severity === 'medium');
    
    if (hasHighSeverityIssues) {
      health.status = 'critical';
    } else if (hasMediumSeverityIssues) {
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * 获取优化报告
   */
  async generateOptimizationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      sections: {}
    };

    // 1. 系统健康
    report.sections.health = await this.getSystemHealth();

    // 2. 监控摘要
    if (this.monitor) {
      try {
        report.sections.monitoring = {
          executions: this.monitor.getExecutionStats({ timeRange: '24h' }),
          downloads: this.monitor.getDownloadStats({ timeRange: '7d' }),
          errors: this.monitor.getErrorStats({ timeRange: '24h' }),
          performance: this.monitor.getPerformanceStats({ timeRange: '1h' }),
          alerts: this.monitor.getAlerts()
        };
      } catch (error) {
        report.sections.monitoring = { error: error.message };
      }
    }

    // 3. 优化建议
    if (this.optimizer) {
      try {
        report.sections.optimization = {
          currentConfig: this.optimizer.getCurrentConfig(),
          recentHistory: this.optimizer.getHistory(5),
          stats: this.optimizer.getStats()
        };
      } catch (error) {
        report.sections.optimization = { error: error.message };
      }
    }

    // 4. 代码质量统计
    if (this.staticAnalyzer) {
      try {
        // 这里可以添加静态分析的汇总统计
        report.sections.codeQuality = {
          supportedLanguages: ['JavaScript', 'TypeScript', 'Python', 'Shell', 'Java', 'Go', 'Rust', 'C++'],
          totalPatterns: this._countSecurityPatterns()
        };
      } catch (error) {
        report.sections.codeQuality = { error: error.message };
      }
    }

    // 5. 社区统计
    if (this.trustScore && this.rewardSystem && this.reviewWorkflow) {
      try {
        report.sections.community = {
          trustScore: this.trustScore.getStats(),
          rewards: this.rewardSystem.getStats(),
          reviews: this.reviewWorkflow.getStats()
        };
      } catch (error) {
        report.sections.community = { error: error.message };
      }
    }

    return report;
  }

  /**
   * 统计安全模式数量
   */
  _countSecurityPatterns() {
    const languages = ['JavaScript', 'Python', 'Shell', 'Java', 'Go', 'Rust', 'C++'];
    const count = {};
    
    // 这里可以根据StaticAnalyzer的实际模式数量来计算
    for (const lang of languages) {
      count[lang] = {
        errors: 'multiple',
        warnings: 'multiple',
        info: 'multiple'
      };
    }
    
    return {
      byLanguage: count,
      totalLanguages: languages.length
    };
  }

  /**
   * 获取实时仪表板数据
   */
  async getDashboardData(timeRange = '24h') {
    const data = {
      timestamp: new Date().toISOString(),
      timeRange
    };

    // 监控数据
    if (this.monitor) {
      data.monitoring = {
        executions: this.monitor.getExecutionStats({ timeRange }),
        performance: this.monitor.getPerformanceStats({ timeRange: '1h' }),
        alerts: this.monitor.getAlerts()
      };
    }

    // 优化状态
    if (this.optimizer) {
      data.optimization = {
        currentConfig: this.optimizer.getCurrentConfig(),
        lastOptimization: this.optimizer.getStats().lastOptimization
      };
    }

    return data;
  }

  /**
   * 获取趋势数据
   */
  async getTrendData(metric, days = 7) {
    const trends = {
      metric,
      period: `${days} days`,
      data: [],
      summary: {}
    };

    // 模拟趋势数据（实际应从历史数据中获取）
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    for (let i = days; i >= 0; i--) {
      const date = new Date(now - i * dayMs);
      trends.data.push({
        date: date.toISOString().split('T')[0],
        value: Math.floor(Math.random() * 100) + 50 // 模拟数据
      });
    }

    // 计算趋势
    if (trends.data.length >= 2) {
      const firstValue = trends.data[0].value;
      const lastValue = trends.data[trends.data.length - 1].value;
      const change = ((lastValue - firstValue) / firstValue) * 100;
      
      trends.summary = {
        startValue: firstValue,
        endValue: lastValue,
        change: change.toFixed(2) + '%',
        trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
      };
    }

    return trends;
  }

  /**
   * 执行自动优化并生成报告
   */
  async runOptimizationAndReport() {
    let optimizationResult = null;
    
    if (this.optimizer) {
      optimizationResult = await this.optimizer.runOptimizationCycle();
    }
    
    const report = await this.generateOptimizationReport();
    
    // 保存报告
    const reportId = `report-${Date.now()}`;
    const savedReport = {
      id: reportId,
      ...report,
      optimizationResult,
      generatedAt: new Date().toISOString()
    };
    
    // 读取现有报告
    let reports = [];
    if (fs.existsSync(this.reportsFile)) {
      try {
        reports = JSON.parse(fs.readFileSync(this.reportsFile, 'utf8')).reports || [];
      } catch (error) {
        reports = [];
      }
    }
    
    // 添加新报告（保留最近50份）
    reports.push(savedReport);
    if (reports.length > 50) {
      reports = reports.slice(-50);
    }
    
    fs.writeFileSync(this.reportsFile, JSON.stringify({ reports, lastUpdated: new Date().toISOString() }, null, 2));
    
    return savedReport;
  }

  /**
   * 获取报告历史
   */
  getReportHistory(limit = 10) {
    if (!fs.existsSync(this.reportsFile)) {
      return [];
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(this.reportsFile, 'utf8'));
      return (data.reports || []).slice(-limit).reverse();
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取配置建议
   */
  getConfigurationSuggestions() {
    const suggestions = [];
    
    if (this.optimizer) {
      const config = this.optimizer.getCurrentConfig();
      
      // 检查审核阈值
      for (const [criterion, value] of Object.entries(config.reviewThresholds)) {
        if (value < 60) {
          suggestions.push({
            type: 'review_threshold',
            criterion,
            currentValue: value,
            suggestion: `${criterion} 阈值较低 (${value})，可能导致低质量技能被批准`,
            priority: 'medium'
          });
        }
      }
      
      // 检查奖励倍率
      for (const [rule, value] of Object.entries(config.rewardMultipliers)) {
        if (value > 1.5) {
          suggestions.push({
            type: 'reward_multiplier',
            rule,
            currentValue: value,
            suggestion: `${rule} 奖励倍率较高 (${value})，可能影响积分平衡`,
            priority: 'low'
          });
        }
      }
    }
    
    return suggestions;
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      }
    };

    if (this.monitor) {
      const perfStats = this.monitor.getPerformanceStats({ timeRange: '1h' });
      metrics.application = {
        avgResponseTime: perfStats.avgResponseTime,
        cacheHitRate: perfStats.cacheHitRate,
        dataPoints: perfStats.dataPoints
      };
    }

    return metrics;
  }

  /**
   * 生成摘要报告
   */
  generateSummaryReport() {
    return {
      timestamp: new Date().toISOString(),
      summary: {
        monitoringEnabled: !!this.monitor,
        optimizerEnabled: !!this.optimizer,
        staticAnalyzerEnabled: !!this.staticAnalyzer,
        trustScoreEnabled: !!this.trustScore,
        rewardSystemEnabled: !!this.rewardSystem,
        reviewWorkflowEnabled: !!this.reviewWorkflow
      },
      capabilities: {
        staticAnalysisLanguages: ['JavaScript', 'TypeScript', 'Python', 'Shell', 'Java', 'Go', 'Rust', 'C++'],
        adaptiveOptimization: !!this.optimizer,
        realTimeMonitoring: !!this.monitor,
        communityFeatures: !!(this.trustScore && this.rewardSystem && this.reviewWorkflow)
      },
      recommendations: this.getConfigurationSuggestions()
    };
  }
}

module.exports = { OptimizationDashboard };
