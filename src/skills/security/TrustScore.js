/**
 * Skill Trust Score System
 * 基于社区反馈、下载量、代码质量的可信度评分体系
 */

const fs = require('fs');
const path = require('path');

class TrustScore {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'trust');
    this.dataFile = path.join(this.dataDir, 'trust-scores.json');
    
    // 评分权重配置
    this.weights = {
      codeQuality: 0.30,      // 代码质量
      communityFeedback: 0.25, // 社区反馈
      downloadPopularity: 0.15, // 下载量
      updateFrequency: 0.10,   // 更新频率
      authorReputation: 0.10,  // 作者信誉
      verificationStatus: 0.10 // 认证状态
    };
    
    // 评分阈值
    this.thresholds = {
      excellent: 90,
      good: 75,
      average: 60,
      below: 40,
      poor: 0
    };
    
    this.scores = new Map();
    this._ensureDataDir();
    this._loadData();
  }

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
        this.scores = new Map(Object.entries(data.scores || {}));
      }
    } catch (error) {
      console.warn('Failed to load trust scores:', error.message);
    }
  }

  _saveData() {
    try {
      const data = {
        scores: Object.fromEntries(this.scores),
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save trust scores:', error.message);
    }
  }

  /**
   * 计算技能可信度分数
   */
  calculateScore(skillId, metrics) {
    const {
      codeQualityScore = 50,      // 0-100
      averageRating = 3,           // 1-5
      reviewCount = 0,             // 评论数
      downloadCount = 0,           // 下载量
      lastUpdateDays = 365,        // 距上次更新天数
      authorScore = 50,            // 作者信誉分 0-100
      isVerified = false,          // 是否已验证
      isOfficial = false,          // 是否官方
      securityScanPassed = false   // 安全扫描是否通过
    } = metrics;

    // 1. 代码质量分数 (直接使用)
    const codeQuality = codeQualityScore;

    // 2. 社区反馈分数
    const ratingScore = (averageRating / 5) * 70;
    const reviewBonus = Math.min(reviewCount * 2, 30); // 最多30分
    const communityFeedback = Math.min(ratingScore + reviewBonus, 100);

    // 3. 下载量分数 (对数缩放)
    const downloadScore = downloadCount > 0 
      ? Math.min(Math.log10(downloadCount + 1) * 20, 100)
      : 0;

    // 4. 更新频率分数
    let updateScore = 100;
    if (lastUpdateDays > 365) {
      updateScore = Math.max(0, 100 - (lastUpdateDays - 365) / 10);
    } else if (lastUpdateDays > 90) {
      updateScore = 80;
    } else if (lastUpdateDays > 30) {
      updateScore = 90;
    }

    // 5. 作者信誉分数
    const authorReputation = authorScore;

    // 6. 认证状态分数
    let verificationScore = 0;
    if (isVerified) verificationScore += 50;
    if (isOfficial) verificationScore += 30;
    if (securityScanPassed) verificationScore += 20;

    // 计算加权总分
    const totalScore = 
      codeQuality * this.weights.codeQuality +
      communityFeedback * this.weights.communityFeedback +
      downloadScore * this.weights.downloadPopularity +
      updateScore * this.weights.updateFrequency +
      authorReputation * this.weights.authorReputation +
      verificationScore * this.weights.verificationStatus;

    // 确定信任等级
    let trustLevel;
    if (totalScore >= this.thresholds.excellent) {
      trustLevel = 'excellent';
    } else if (totalScore >= this.thresholds.good) {
      trustLevel = 'good';
    } else if (totalScore >= this.thresholds.average) {
      trustLevel = 'average';
    } else if (totalScore >= this.thresholds.below) {
      trustLevel = 'below';
    } else {
      trustLevel = 'poor';
    }

    const result = {
      skillId,
      score: Math.round(totalScore * 10) / 10,
      trustLevel,
      breakdown: {
        codeQuality: Math.round(codeQuality),
        communityFeedback: Math.round(communityFeedback),
        downloadScore: Math.round(downloadScore),
        updateScore: Math.round(updateScore),
        authorReputation: Math.round(authorReputation),
        verificationScore: Math.round(verificationScore)
      },
      metrics: {
        averageRating,
        reviewCount,
        downloadCount,
        lastUpdateDays,
        isVerified,
        isOfficial,
        securityScanPassed
      },
      calculatedAt: new Date().toISOString()
    };

    // 保存分数
    this.scores.set(skillId, result);
    this._saveData();

    return result;
  }

  /**
   * 获取技能信任分数
   */
  getScore(skillId) {
    return this.scores.get(skillId) || null;
  }

  /**
   * 获取信任等级描述
   */
  getTrustLevelDescription(trustLevel) {
    const descriptions = {
      excellent: {
        label: '优秀',
        description: '代码质量高，社区反馈好，下载量大，持续维护',
        badge: '🏆',
        color: '#22c55e'
      },
      good: {
        label: '良好',
        description: '代码质量较好，有一定用户基础',
        badge: '✅',
        color: '#84cc16'
      },
      average: {
        label: '一般',
        description: '基本可用，但有改进空间',
        badge: '📊',
        color: '#eab308'
      },
      below: {
        label: '较差',
        description: '存在一些问题，使用需谨慎',
        badge: '⚠️',
        color: '#f97316'
      },
      poor: {
        label: '风险',
        description: '存在严重问题或缺乏维护，不建议使用',
        badge: '🚨',
        color: '#ef4444'
      }
    };
    
    return descriptions[trustLevel] || descriptions.average;
  }

  /**
   * 获取所有技能分数（排序）
   */
  getAllScores(options = {}) {
    const { sortBy = 'score', sortOrder = 'desc', limit = 100 } = options;
    
    let scores = Array.from(this.scores.values());
    
    // 排序
    scores.sort((a, b) => {
      const aVal = a[sortBy] || a.score;
      const bVal = b[sortBy] || b.score;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    return scores.slice(0, limit);
  }

  /**
   * 获取高信任度技能列表
   */
  getTrustedSkills(minScore = 70) {
    return Array.from(this.scores.values())
      .filter(s => s.score >= minScore)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * 获取需要关注的技能列表
   */
  getSkillsNeedingAttention(maxScore = 50) {
    return Array.from(this.scores.values())
      .filter(s => s.score <= maxScore)
      .sort((a, b) => a.score - b.score);
  }

  /**
   * 批量更新分数
   */
  batchUpdateScores(skillMetricsArray) {
    const results = [];
    
    for (const { skillId, metrics } of skillMetricsArray) {
      try {
        const score = this.calculateScore(skillId, metrics);
        results.push({ skillId, success: true, score: score.score });
      } catch (error) {
        results.push({ skillId, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const scores = Array.from(this.scores.values());
    
    if (scores.length === 0) {
      return {
        totalSkills: 0,
        averageScore: 0,
        distribution: {},
        topSkills: []
      };
    }

    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
    const distribution = {
      excellent: 0,
      good: 0,
      average: 0,
      below: 0,
      poor: 0
    };

    for (const score of scores) {
      distribution[score.trustLevel]++;
    }

    const topSkills = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(s => ({ skillId: s.skillId, score: s.score, trustLevel: s.trustLevel }));

    return {
      totalSkills: scores.length,
      averageScore: Math.round(totalScore / scores.length * 10) / 10,
      distribution,
      topSkills,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 生成信任徽章
   */
  generateBadge(trustLevel, format = 'svg') {
    const levelInfo = this.getTrustLevelDescription(trustLevel);
    
    // 简化的徽章生成（实际应使用SVG模板）
    return {
      badge: levelInfo.badge,
      label: levelInfo.label,
      color: levelInfo.color,
      description: levelInfo.description,
      format
    };
  }

  /**
   * 生成信任报告
   */
  generateReport(skillId) {
    const score = this.getScore(skillId);
    if (!score) {
      return { error: 'Skill not found' };
    }

    const levelInfo = this.getTrustLevelDescription(score.trustLevel);
    const recommendations = this._generateRecommendations(score);

    return {
      skillId,
      summary: {
        score: score.score,
        trustLevel: score.trustLevel,
        levelLabel: levelInfo.label,
        badge: levelInfo.badge
      },
      breakdown: score.breakdown,
      metrics: score.metrics,
      recommendations,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 生成改进建议
   */
  _generateRecommendations(score) {
    const recommendations = [];
    const { breakdown } = score;

    if (breakdown.codeQuality < 60) {
      recommendations.push({
        area: 'codeQuality',
        priority: 'high',
        message: '代码质量需要提升，建议进行代码审查和重构',
        action: '运行静态代码分析，修复高风险问题'
      });
    }

    if (breakdown.communityFeedback < 50) {
      recommendations.push({
        area: 'communityFeedback',
        priority: 'medium',
        message: '社区反馈较少，建议鼓励用户评价',
        action: '在文档中添加评价引导，提升用户体验'
      });
    }

    if (breakdown.downloadScore < 30) {
      recommendations.push({
        area: 'downloadPopularity',
        priority: 'low',
        message: '下载量较低，建议提升可见度',
        action: '完善文档，添加使用示例，参与社区推广'
      });
    }

    if (breakdown.updateScore < 70) {
      recommendations.push({
        area: 'updateFrequency',
        priority: 'medium',
        message: '更新不够频繁，用户可能担心维护状态',
        action: '定期更新依赖，修复已知问题，发布更新日志'
      });
    }

    if (breakdown.verificationScore < 50) {
      recommendations.push({
        area: 'verificationStatus',
        priority: 'medium',
        message: '缺少认证标识，降低用户信任',
        action: '申请官方验证，通过安全扫描'
      });
    }

    return recommendations;
  }
}

module.exports = { TrustScore };
