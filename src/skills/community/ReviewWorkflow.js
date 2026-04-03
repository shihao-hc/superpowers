/**
 * Skill Review Workflow
 * 建立技能审核委员会，确保市场内容质量
 */

const fs = require('fs');
const path = require('path');

class ReviewWorkflow {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'reviews');
    this.reviewsFile = path.join(this.dataDir, 'reviews.json');
    this.committeeFile = path.join(this.dataDir, 'committee.json');
    this.configFile = path.join(this.dataDir, 'config.json');
    
    // 审核配置
    this.config = {
      requireReview: true,
      minReviewers: 2,
      autoApproveThreshold: 90, // 信任分数超过90自动审批
      reviewTimeoutDays: 7,
      requireSecurityScan: true,
      requireDocumentation: true,
      reviewCriteria: {
        codeQuality: { weight: 30, minScore: 70 },
        security: { weight: 25, minScore: 80 },
        documentation: { weight: 20, minScore: 60 },
        functionality: { weight: 15, minScore: 70 },
        maintainability: { weight: 10, minScore: 60 }
      }
    };
    
    // 审核委员会
    this.committee = [];
    
    // 审核记录
    this.reviews = new Map();
    
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
      if (fs.existsSync(this.configFile)) {
        const configData = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        this.config = { ...this.config, ...configData };
      }
      
      if (fs.existsSync(this.committeeFile)) {
        const data = JSON.parse(fs.readFileSync(this.committeeFile, 'utf8'));
        this.committee = data.members || [];
      }
      
      if (fs.existsSync(this.reviewsFile)) {
        const data = JSON.parse(fs.readFileSync(this.reviewsFile, 'utf8'));
        this.reviews = new Map(Object.entries(data.reviews || {}));
      }
    } catch (error) {
      console.warn('Failed to load review data:', error.message);
    }
  }

  _saveData() {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
      
      fs.writeFileSync(this.committeeFile, JSON.stringify({
        members: this.committee,
        lastUpdated: new Date().toISOString()
      }, null, 2));
      
      fs.writeFileSync(this.reviewsFile, JSON.stringify({
        reviews: Object.fromEntries(this.reviews),
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.warn('Failed to save review data:', error.message);
    }
  }

  /**
   * 添加审核委员会成员
   */
  addCommitteeMember(memberData) {
    const { userId, username, role = 'reviewer', expertise = [] } = memberData;
    
    const existing = this.committee.find(m => m.userId === userId);
    if (existing) {
      throw new Error('User already in committee');
    }
    
    const member = {
      userId,
      username,
      role,
      expertise,
      joinedAt: new Date().toISOString(),
      reviewsCompleted: 0,
      isActive: true
    };
    
    this.committee.push(member);
    this._saveData();
    
    return member;
  }

  /**
   * 移除审核委员会成员
   */
  removeCommitteeMember(userId) {
    const index = this.committee.findIndex(m => m.userId === userId);
    if (index === -1) {
      throw new Error('User not in committee');
    }
    
    this.committee.splice(index, 1);
    this._saveData();
    
    return { removed: true };
  }

  /**
   * 提交技能审核
   */
  submitForReview(skillData, submitterId) {
    const reviewId = `review-${skillData.id}-${Date.now()}`;
    
    const review = {
      id: reviewId,
      skillId: skillData.id,
      skillName: skillData.name,
      skillVersion: skillData.version,
      submitterId,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      reviews: [],
      scores: {},
      decision: null,
      decisionAt: null,
      decisionBy: null,
      notes: '',
      metadata: {
        author: skillData.author,
        category: skillData.category,
        riskLevel: skillData.riskLevel
      }
    };
    
    this.reviews.set(reviewId, review);
    this._saveData();
    
    return review;
  }

  /**
   * 分配审核者
   */
  assignReviewer(reviewId, reviewerId) {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    const committeeMember = this.committee.find(m => m.userId === reviewerId);
    if (!committeeMember) {
      throw new Error('User is not a committee member');
    }
    
    // 检查是否已经分配
    if (review.reviews.some(r => r.reviewerId === reviewerId)) {
      throw new Error('Reviewer already assigned');
    }
    
    const reviewerAssignment = {
      reviewerId,
      reviewerName: committeeMember.username,
      assignedAt: new Date().toISOString(),
      status: 'assigned',
      scores: null,
      comments: null,
      completedAt: null
    };
    
    review.reviews.push(reviewerAssignment);
    review.status = 'in_review';
    
    this.reviews.set(reviewId, review);
    this._saveData();
    
    return reviewerAssignment;
  }

  /**
   * 提交审核意见
   */
  submitReview(reviewId, reviewerId, reviewData) {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    const reviewerReview = review.reviews.find(r => r.reviewerId === reviewerId);
    if (!reviewerReview) {
      throw new Error('Reviewer not assigned to this review');
    }
    
    const { scores, comments, recommendation } = reviewData;
    
    // 验证分数
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (totalScore === 0) {
      throw new Error('Scores are required');
    }
    
    reviewerReview.scores = scores;
    reviewerReview.comments = comments;
    reviewerReview.recommendation = recommendation; // approve, reject, request_changes
    reviewerReview.status = 'completed';
    reviewerReview.completedAt = new Date().toISOString();
    
    // 更新审核者统计
    const committeeMember = this.committee.find(m => m.userId === reviewerId);
    if (committeeMember) {
      committeeMember.reviewsCompleted++;
    }
    
    // 检查是否所有审核者都完成了
    this._checkReviewCompletion(reviewId);
    
    this.reviews.set(reviewId, review);
    this._saveData();
    
    return reviewerReview;
  }

  /**
   * 检查审核是否完成
   */
  _checkReviewCompletion(reviewId) {
    const review = this.reviews.get(reviewId);
    if (!review) return;
    
    const completedReviews = review.reviews.filter(r => r.status === 'completed');
    
    if (completedReviews.length >= this.config.minReviewers) {
      // 计算平均分数
      const avgScores = {};
      const criteria = Object.keys(this.config.reviewCriteria);
      
      for (const criterion of criteria) {
        const scores = completedReviews
          .filter(r => r.scores && r.scores[criterion] !== undefined)
          .map(r => r.scores[criterion]);
        
        if (scores.length > 0) {
          avgScores[criterion] = scores.reduce((a, b) => a + b, 0) / scores.length;
        }
      }
      
      // 计算总分
      let totalScore = 0;
      let totalWeight = 0;
      
      for (const [criterion, config] of Object.entries(this.config.reviewCriteria)) {
        if (avgScores[criterion] !== undefined) {
          totalScore += avgScores[criterion] * (config.weight / 100);
          totalWeight += config.weight;
        }
      }
      
      const finalScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
      review.scores = avgScores;
      review.finalScore = Math.round(finalScore);
      
      // 确定是否通过
      const passed = this._checkMinimumScores(avgScores);
      
      if (passed) {
        review.status = 'approved';
        review.decision = 'approved';
      } else {
        review.status = 'rejected';
        review.decision = 'rejected';
      }
      
      review.decisionAt = new Date().toISOString();
    }
  }

  /**
   * 检查最低分数要求
   */
  _checkMinimumScores(scores) {
    for (const [criterion, config] of Object.entries(this.config.reviewCriteria)) {
      if (scores[criterion] !== undefined && scores[criterion] < config.minScore) {
        return false;
      }
    }
    return true;
  }

  /**
   * 获取审核详情
   */
  getReview(reviewId) {
    return this.reviews.get(reviewId) || null;
  }

  /**
   * 获取待审核列表
   */
  getPendingReviews(limit = 50) {
    return Array.from(this.reviews.values())
      .filter(r => r.status === 'pending' || r.status === 'in_review')
      .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))
      .slice(0, limit);
  }

  /**
   * 获取审核历史
   */
  getReviewHistory(options = {}) {
    const { skillId, reviewerId, status, limit = 50, offset = 0 } = options;
    
    let reviews = Array.from(this.reviews.values());
    
    if (skillId) {
      reviews = reviews.filter(r => r.skillId === skillId);
    }
    
    if (reviewerId) {
      reviews = reviews.filter(r => r.reviews.some(rev => rev.reviewerId === reviewerId));
    }
    
    if (status) {
      reviews = reviews.filter(r => r.status === status);
    }
    
    reviews.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    
    return {
      reviews: reviews.slice(offset, offset + limit),
      total: reviews.length
    };
  }

  /**
   * 获取审核统计
   */
  getStats() {
    const reviews = Array.from(this.reviews.values());
    
    const stats = {
      total: reviews.length,
      pending: reviews.filter(r => r.status === 'pending').length,
      inReview: reviews.filter(r => r.status === 'in_review').length,
      approved: reviews.filter(r => r.status === 'approved').length,
      rejected: reviews.filter(r => r.status === 'rejected').length,
      avgReviewTime: this._calculateAvgReviewTime(reviews),
      committeeSize: this.committee.length,
      activeReviewers: this.committee.filter(m => m.isActive).length
    };
    
    return stats;
  }

  _calculateAvgReviewTime(reviews) {
    const completedReviews = reviews.filter(r => r.decisionAt);
    if (completedReviews.length === 0) return 0;
    
    const totalTime = completedReviews.reduce((sum, r) => {
      const submitted = new Date(r.submittedAt);
      const decided = new Date(r.decisionAt);
      return sum + (decided - submitted);
    }, 0);
    
    return Math.round(totalTime / completedReviews.length / (1000 * 60 * 60 * 24)); // 天
  }

  /**
   * 获取委员会成员列表
   */
  getCommittee() {
    return [...this.committee];
  }

  /**
   * 获取委员会成员详情
   */
  getCommitteeMember(userId) {
    return this.committee.find(m => m.userId === userId) || null;
  }

  /**
   * 更新审核配置
   */
  updateConfig(configData) {
    this.config = { ...this.config, ...configData };
    this._saveData();
    return this.config;
  }

  /**
   * 获取审核配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 生成审核报告
   */
  generateReport(reviewId) {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    const report = {
      skill: {
        id: review.skillId,
        name: review.skillName,
        version: review.skillVersion,
        author: review.metadata.author
      },
      status: review.status,
      scores: review.scores,
      finalScore: review.finalScore,
      reviewers: review.reviews.map(r => ({
        name: r.reviewerName,
        status: r.status,
        recommendation: r.recommendation,
        completedAt: r.completedAt
      })),
      decision: review.decision,
      decisionAt: review.decisionAt,
      submittedAt: review.submittedAt,
      duration: review.decisionAt 
        ? Math.round((new Date(review.decisionAt) - new Date(review.submittedAt)) / (1000 * 60 * 60 * 24))
        : null
    };
    
    return report;
  }
}

module.exports = { ReviewWorkflow };
