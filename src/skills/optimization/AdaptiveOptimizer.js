/**
 * Adaptive Optimization System
 * 根据监控数据自动调整审核阈值、奖励规则
 */

const fs = require('fs');
const path = require('path');

class AdaptiveOptimizer {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'optimization');
    this.configFile = path.join(this.dataDir, 'optimizer-config.json');
    this.historyFile = path.join(this.dataDir, 'optimization-history.json');
    this.rulesFile = path.join(this.dataDir, 'adaptive-rules.json');
    
    // 依赖的系统
    this.monitor = options.monitor;
    this.reviewWorkflow = options.reviewWorkflow;
    this.rewardSystem = options.rewardSystem;
    this.trustScore = options.trustScore;
    
    // 优化配置
    this.config = {
      enabled: true,
      analysisInterval: 24 * 60 * 60 * 1000, // 每天分析一次
      minDataPoints: 100, // 最少数据点
      confidenceLevel: 0.8, // 置信度阈值
      maxAdjustmentPercent: 20, // 单次最大调整百分比
      cooldownPeriod: 7 * 24 * 60 * 60 * 1000, // 7天冷却期
    };
    
    // 自适应规则
    this.rules = {
      // 审核阈值调整规则
      reviewThresholds: {
        codeQuality: { min: 60, max: 85, current: 70 },
        security: { min: 70, max: 95, current: 80 },
        documentation: { min: 50, max: 80, current: 60 },
        functionality: { min: 60, max: 85, current: 70 },
        maintainability: { min: 50, max: 80, current: 60 }
      },
      
      // 奖励规则调整
      rewardMultipliers: {
        skillPublished: { min: 0.5, max: 2.0, current: 1.0 },
        skillDownloaded: { min: 0.5, max: 3.0, current: 1.0 },
        reviewWritten: { min: 0.5, max: 2.0, current: 1.0 },
        securityScanPassed: { min: 0.5, max: 2.0, current: 1.0 }
      },
      
      // 信任分数权重调整
      trustScoreWeights: {
        codeQuality: { min: 0.2, max: 0.4, current: 0.30 },
        communityFeedback: { min: 0.15, max: 0.35, current: 0.25 },
        downloadPopularity: { min: 0.1, max: 0.25, current: 0.15 },
        updateFrequency: { min: 0.05, max: 0.15, current: 0.10 },
        authorReputation: { min: 0.05, max: 0.15, current: 0.10 },
        verificationStatus: { min: 0.05, max: 0.15, current: 0.10 }
      },
      
      // 自动审批阈值
      autoApproval: {
        trustScoreThreshold: { min: 70, max: 95, current: 90 },
        minReviewsRequired: { min: 1, max: 5, current: 2 }
      }
    };
    
    // 优化历史
    this.history = [];
    
    // 上次优化时间
    this.lastOptimization = null;
    
    this._ensureDataDir();
    this._loadData();
    
    // 启动自动优化
    this._startAutoOptimization();
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
      
      if (fs.existsSync(this.rulesFile)) {
        const rulesData = JSON.parse(fs.readFileSync(this.rulesFile, 'utf8'));
        this.rules = { ...this.rules, ...rulesData };
      }
      
      if (fs.existsSync(this.historyFile)) {
        const historyData = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        this.history = historyData.optimizations || [];
        this.lastOptimization = historyData.lastOptimization;
      }
    } catch (error) {
      console.warn('Failed to load optimizer data:', error.message);
    }
  }

  _saveData() {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
      fs.writeFileSync(this.rulesFile, JSON.stringify(this.rules, null, 2));
      fs.writeFileSync(this.historyFile, JSON.stringify({
        optimizations: this.history.slice(-100), // 保留最近100条
        lastOptimization: this.lastOptimization,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.warn('Failed to save optimizer data:', error.message);
    }
  }

  /**
   * 启动自动优化
   */
  _startAutoOptimization() {
    if (!this.config.enabled) return;
    
    setInterval(() => {
      this.runOptimizationCycle();
    }, this.config.analysisInterval);
    
    console.log('[AdaptiveOptimizer] 自动优化已启动，间隔:', this.config.analysisInterval / 1000 / 60, '分钟');
  }

  /**
   * 运行优化周期
   */
  async runOptimizationCycle() {
    // 检查冷却期
    if (this.lastOptimization) {
      const timeSinceLastOptimization = Date.now() - new Date(this.lastOptimization).getTime();
      if (timeSinceLastOptimization < this.config.cooldownPeriod) {
        console.log('[AdaptiveOptimizer] 冷却期中，跳过优化');
        return { skipped: true, reason: 'cooldown' };
      }
    }

    console.log('[AdaptiveOptimizer] 开始优化周期...');

    const results = {
      timestamp: new Date().toISOString(),
      adjustments: [],
      recommendations: [],
      metrics: {}
    };

    try {
      // 1. 收集监控数据
      const monitorData = this._collectMonitorData();
      results.metrics = monitorData;

      // 2. 分析并调整审核阈值
      const reviewAdjustments = this._analyzeAndAdjustReviewThresholds(monitorData);
      if (reviewAdjustments.length > 0) {
        results.adjustments.push(...reviewAdjustments);
        this._applyReviewThresholdAdjustments(reviewAdjustments);
      }

      // 3. 分析并调整奖励规则
      const rewardAdjustments = this._analyzeAndAdjustRewardRules(monitorData);
      if (rewardAdjustments.length > 0) {
        results.adjustments.push(...rewardAdjustments);
        this._applyRewardAdjustments(rewardAdjustments);
      }

      // 4. 分析并调整信任分数权重
      const trustAdjustments = this._analyzeAndAdjustTrustWeights(monitorData);
      if (trustAdjustments.length > 0) {
        results.adjustments.push(...trustAdjustments);
        this._applyTrustWeightAdjustments(trustAdjustments);
      }

      // 5. 生成优化建议
      results.recommendations = this._generateRecommendations(monitorData);

      // 保存历史
      this.history.push(results);
      this.lastOptimization = new Date().toISOString();
      this._saveData();

      console.log('[AdaptiveOptimizer] 优化完成，调整数:', results.adjustments.length);
      
    } catch (error) {
      console.error('[AdaptiveOptimizer] 优化失败:', error.message);
      results.error = error.message;
    }

    return results;
  }

  /**
   * 收集监控数据
   */
  _collectMonitorData() {
    const data = {
      executions: { total: 0, successful: 0, failed: 0, avgDuration: 0 },
      downloads: { total: 0, topSkills: [] },
      errors: { total: 0, byType: {} },
      reviews: { pending: 0, approved: 0, rejected: 0, avgScore: 0 },
      trustScores: { distribution: {}, avgScore: 0 },
      rewards: { totalPoints: 0, badgesAwarded: 0 },
      timestamp: new Date().toISOString()
    };

    // 从监控系统获取数据
    if (this.monitor) {
      try {
        const execStats = this.monitor.getExecutionStats({ timeRange: '7d' });
        data.executions = {
          total: execStats.total,
          successful: execStats.successful,
          failed: execStats.failed,
          avgDuration: execStats.avgDuration
        };

        const dlStats = this.monitor.getDownloadStats({ timeRange: '7d' });
        data.downloads = {
          total: dlStats.total,
          topSkills: dlStats.topSkills
        };

        const errStats = this.monitor.getErrorStats({ timeRange: '7d' });
        data.errors = {
          total: errStats.total,
          byType: errStats.byType
        };
      } catch (error) {
        console.warn('Failed to collect monitor data:', error.message);
      }
    }

    // 从审核系统获取数据
    if (this.reviewWorkflow) {
      try {
        const reviewStats = this.reviewWorkflow.getStats();
        data.reviews = {
          pending: reviewStats.pending,
          approved: reviewStats.approved,
          rejected: reviewStats.rejected,
          avgScore: reviewStats.avgScore || 0
        };
      } catch (error) {
        console.warn('Failed to collect review data:', error.message);
      }
    }

    // 从信任分数系统获取数据
    if (this.trustScore) {
      try {
        const trustStats = this.trustScore.getStats();
        data.trustScores = {
          distribution: trustStats.distribution,
          avgScore: trustStats.averageScore
        };
      } catch (error) {
        console.warn('Failed to collect trust score data:', error.message);
      }
    }

    // 从奖励系统获取数据
    if (this.rewardSystem) {
      try {
        const rewardStats = this.rewardSystem.getStats();
        data.rewards = {
          totalPoints: rewardStats.totalPointsAwarded,
          badgesAwarded: rewardStats.totalBadgesAwarded
        };
      } catch (error) {
        console.warn('Failed to collect reward data:', error.message);
      }
    }

    return data;
  }

  /**
   * 分析并调整审核阈值
   */
  _analyzeAndAdjustReviewThresholds(data) {
    const adjustments = [];
    
    if (data.reviews.approved + data.reviews.rejected < this.config.minDataPoints) {
      return adjustments; // 数据不足
    }

    const approvalRate = data.reviews.approved / (data.reviews.approved + data.reviews.rejected);
    
    // 如果通过率过高 (>90%)，考虑提高阈值
    if (approvalRate > 0.9) {
      for (const [criterion, config] of Object.entries(this.rules.reviewThresholds)) {
        const increase = Math.min(this.config.maxAdjustmentPercent, 5);
        const newValue = Math.min(config.max, config.current * (1 + increase / 100));
        
        if (newValue !== config.current) {
          adjustments.push({
            type: 'review_threshold',
            criterion,
            oldValue: config.current,
            newValue,
            reason: `Approval rate too high (${(approvalRate * 100).toFixed(1)}%), increasing threshold`
          });
        }
      }
    }
    
    // 如果通过率过低 (<50%)，考虑降低阈值
    if (approvalRate < 0.5) {
      for (const [criterion, config] of Object.entries(this.rules.reviewThresholds)) {
        const decrease = Math.min(this.config.maxAdjustmentPercent, 5);
        const newValue = Math.max(config.min, config.current * (1 - decrease / 100));
        
        if (newValue !== config.current) {
          adjustments.push({
            type: 'review_threshold',
            criterion,
            oldValue: config.current,
            newValue,
            reason: `Approval rate too low (${(approvalRate * 100).toFixed(1)}%), decreasing threshold`
          });
        }
      }
    }

    return adjustments;
  }

  /**
   * 分析并调整奖励规则
   */
  _analyzeAndAdjustRewardRules(data) {
    const adjustments = [];
    
    // 如果下载量增长缓慢，考虑增加下载奖励
    if (data.executions.total > 1000 && data.downloads.total < data.executions.total * 0.1) {
      const config = this.rules.rewardMultipliers.skillDownloaded;
      const newValue = Math.min(config.max, config.current * 1.2);
      
      if (newValue !== config.current) {
        adjustments.push({
          type: 'reward_multiplier',
          rule: 'skillDownloaded',
          oldValue: config.current,
          newValue,
          reason: 'Download rate low, increasing download rewards'
        });
      }
    }
    
    // 如果审核参与度低，考虑增加审核奖励
    if (data.reviews.approved + data.reviews.rejected < data.executions.total * 0.05) {
      const config = this.rules.rewardMultipliers.reviewWritten;
      const newValue = Math.min(config.max, config.current * 1.15);
      
      if (newValue !== config.current) {
        adjustments.push({
          type: 'reward_multiplier',
          rule: 'reviewWritten',
          oldValue: config.current,
          newValue,
          reason: 'Review participation low, increasing review rewards'
        });
      }
    }
    
    // 如果错误率高，考虑增加安全扫描奖励
    const errorRate = data.executions.total > 0 ? data.errors.total / data.executions.total : 0;
    if (errorRate > 0.1) {
      const config = this.rules.rewardMultipliers.securityScanPassed;
      const newValue = Math.min(config.max, config.current * 1.25);
      
      if (newValue !== config.current) {
        adjustments.push({
          type: 'reward_multiplier',
          rule: 'securityScanPassed',
          oldValue: config.current,
          newValue,
          reason: `Error rate high (${(errorRate * 100).toFixed(1)}%), increasing security scan rewards`
        });
      }
    }

    return adjustments;
  }

  /**
   * 分析并调整信任分数权重
   */
  _analyzeAndAdjustTrustWeights(data) {
    const adjustments = [];
    
    if (data.trustScores.avgScore === 0) {
      return adjustments; // 无数据
    }

    // 如果平均信任分过低，增加代码质量权重
    if (data.trustScores.avgScore < 60) {
      const config = this.rules.trustScoreWeights.codeQuality;
      const newValue = Math.min(config.max, config.current + 0.02);
      
      if (newValue !== config.current) {
        adjustments.push({
          type: 'trust_weight',
          weight: 'codeQuality',
          oldValue: config.current,
          newValue,
          reason: `Average trust score low (${data.trustScores.avgScore.toFixed(1)}), increasing code quality weight`
        });
      }
    }

    // 如果下载量与信任分不匹配，调整下载权重
    const downloadsPerSkill = data.downloads.total > 0 && data.trustScores.distribution 
      ? data.downloads.total / (data.trustScores.distribution.excellent + data.trustScores.distribution.good + 1)
      : 0;
    
    if (downloadsPerSkill < 10) {
      const config = this.rules.trustScoreWeights.downloadPopularity;
      const newValue = Math.min(config.max, config.current + 0.01);
      
      if (newValue !== config.current) {
        adjustments.push({
          type: 'trust_weight',
          weight: 'downloadPopularity',
          oldValue: config.current,
          newValue,
          reason: 'Downloads per skill low, adjusting download weight'
        });
      }
    }

    return adjustments;
  }

  /**
   * 应用审核阈值调整
   */
  _applyReviewThresholdAdjustments(adjustments) {
    for (const adj of adjustments) {
      if (adj.type === 'review_threshold' && this.rules.reviewThresholds[adj.criterion]) {
        this.rules.reviewThresholds[adj.criterion].current = adj.newValue;
      }
    }
    
    // 更新审核工作流配置
    if (this.reviewWorkflow && adjustments.length > 0) {
      const newMinScores = {};
      for (const [criterion, config] of Object.entries(this.rules.reviewThresholds)) {
        newMinScores[criterion] = config.current;
      }
      
      try {
        this.reviewWorkflow.updateConfig({
          reviewCriteria: {
            ...this.reviewWorkflow.getConfig().reviewCriteria,
            ...Object.fromEntries(
              Object.entries(newMinScores).map(([k, v]) => [k, { 
                ...(this.reviewWorkflow.getConfig().reviewCriteria[k] || {}),
                minScore: v 
              }])
            )
          }
        });
      } catch (error) {
        console.warn('Failed to update review workflow config:', error.message);
      }
    }
  }

  /**
   * 应用奖励调整
   */
  _applyRewardAdjustments(adjustments) {
    for (const adj of adjustments) {
      if (adj.type === 'reward_multiplier' && this.rules.rewardMultipliers[adj.rule]) {
        this.rules.rewardMultipliers[adj.rule].current = adj.newValue;
      }
    }
    
    // 注意：奖励系统的实际调整需要重新配置pointRules
    // 这里只更新配置，实际应用需要额外的集成
  }

  /**
   * 应用信任权重调整
   */
  _applyTrustWeightAdjustments(adjustments) {
    for (const adj of adjustments) {
      if (adj.type === 'trust_weight' && this.rules.trustScoreWeights[adj.weight]) {
        this.rules.trustScoreWeights[adj.weight].current = adj.newValue;
      }
    }
    
    // 归一化权重
    this._normalizeTrustWeights();
  }

  /**
   * 归一化信任分数权重（确保总和为1）
   */
  _normalizeTrustWeights() {
    const weights = this.rules.trustScoreWeights;
    const total = Object.values(weights).reduce((sum, w) => sum + w.current, 0);
    
    if (Math.abs(total - 1.0) > 0.01) {
      const factor = 1.0 / total;
      for (const key of Object.keys(weights)) {
        weights[key].current *= factor;
        weights[key].current = Math.round(weights[key].current * 100) / 100;
      }
    }
  }

  /**
   * 生成优化建议
   */
  _generateRecommendations(data) {
    const recommendations = [];
    
    // 审核效率建议
    if (data.reviews.pending > 50) {
      recommendations.push({
        category: 'review_efficiency',
        priority: 'high',
        message: `待审核技能过多 (${data.reviews.pending})，建议增加审核委员会成员`,
        action: 'add_reviewers'
      });
    }
    
    // 错误率建议
    const errorRate = data.executions.total > 0 ? data.errors.total / data.executions.total : 0;
    if (errorRate > 0.15) {
      recommendations.push({
        category: 'quality',
        priority: 'high',
        message: `错误率过高 (${(errorRate * 100).toFixed(1)}%)，建议加强代码审查和安全扫描`,
        action: 'increase_review_strictness'
      });
    }
    
    // 社区参与建议
    if (data.rewards.badgesAwarded < data.rewards.totalPoints * 0.01) {
      recommendations.push({
        category: 'community',
        priority: 'medium',
        message: '徽章授予率低，建议调整徽章获取条件或增加引导',
        action: 'adjust_badge_requirements'
      });
    }
    
    // 信任分数分布建议
    if (data.trustScores.distribution) {
      const { poor, below } = data.trustScores.distribution;
      const lowTrustCount = (poor || 0) + (below || 0);
      if (lowTrustCount > 10) {
        recommendations.push({
          category: 'trust',
          priority: 'medium',
          message: `低信任度技能较多 (${lowTrustCount})，建议提供技能改进指南`,
          action: 'provide_improvement_guide'
        });
      }
    }
    
    // 性能建议
    if (data.executions.avgDuration > 5000) {
      recommendations.push({
        category: 'performance',
        priority: 'medium',
        message: `平均执行时间过长 (${data.executions.avgDuration}ms)，建议优化热门技能`,
        action: 'optimize热门_skills'
      });
    }
    
    return recommendations;
  }

  /**
   * 获取当前配置
   */
  getCurrentConfig() {
    return {
      reviewThresholds: Object.fromEntries(
        Object.entries(this.rules.reviewThresholds).map(([k, v]) => [k, v.current])
      ),
      rewardMultipliers: Object.fromEntries(
        Object.entries(this.rules.rewardMultipliers).map(([k, v]) => [k, v.current])
      ),
      trustScoreWeights: Object.fromEntries(
        Object.entries(this.rules.trustScoreWeights).map(([k, v]) => [k, v.current])
      ),
      autoApproval: {
        trustScoreThreshold: this.rules.autoApproval.trustScoreThreshold.current,
        minReviewsRequired: this.rules.autoApproval.minReviewsRequired.current
      }
    };
  }

  /**
   * 手动设置配置
   */
  setConfig(category, key, value) {
    if (category === 'reviewThresholds' && this.rules.reviewThresholds[key]) {
      const config = this.rules.reviewThresholds[key];
      config.current = Math.max(config.min, Math.min(config.max, value));
    } else if (category === 'rewardMultipliers' && this.rules.rewardMultipliers[key]) {
      const config = this.rules.rewardMultipliers[key];
      config.current = Math.max(config.min, Math.min(config.max, value));
    } else if (category === 'trustScoreWeights' && this.rules.trustScoreWeights[key]) {
      const config = this.rules.trustScoreWeights[key];
      config.current = Math.max(config.min, Math.min(config.max, value));
      this._normalizeTrustWeights();
    } else {
      throw new Error(`Invalid configuration: ${category}.${key}`);
    }
    
    this._saveData();
    return this.getCurrentConfig();
  }

  /**
   * 获取优化历史
   */
  getHistory(limit = 20) {
    return this.history.slice(-limit).reverse();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalOptimizations: this.history.length,
      lastOptimization: this.lastOptimization,
      config: this.config,
      currentRules: this.getCurrentConfig()
    };
  }

  /**
   * 生成优化报告
   */
  generateReport() {
    const recentOptimizations = this.history.slice(-10);
    
    const totalAdjustments = recentOptimizations.reduce(
      (sum, opt) => sum + (opt.adjustments?.length || 0), 0
    );
    
    const adjustmentsByType = {};
    for (const opt of recentOptimizations) {
      for (const adj of opt.adjustments || []) {
        const key = adj.type;
        adjustmentsByType[key] = (adjustmentsByType[key] || 0) + 1;
      }
    }
    
    return {
      summary: {
        totalOptimizations: this.history.length,
        totalAdjustments,
        adjustmentsByType,
        lastOptimization: this.lastOptimization
      },
      currentConfig: this.getCurrentConfig(),
      recentOptimizations: recentOptimizations.map(opt => ({
        timestamp: opt.timestamp,
        adjustments: opt.adjustments?.length || 0,
        recommendations: opt.recommendations?.length || 0
      }))
    };
  }
}

module.exports = { AdaptiveOptimizer };
