/**
 * User Feedback Collection System
 * Collects and analyzes user feedback for skill improvement
 */

class FeedbackCollectionSystem {
  constructor(options = {}) {
    this.feedback = new Map();
    this.sessions = new Map();
    this.recommendationLogs = [];
    this.maxFeedbackPerSkill = options.maxFeedbackPerSkill || 1000;
    this.sessionTimeout = options.sessionTimeout || 3600000;
    
    this.storage = options.storage || null;
    this._loadFeedback();
  }

  /**
   * Create feedback session
   */
  createSession(userId, sessionData = {}) {
    const sessionId = this._generateSessionId();
    
    const session = {
      id: sessionId,
      userId,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      interactions: [],
      skillUsage: new Map(),
      feedback: [],
      context: sessionData.context || {},
      metadata: {
        userAgent: sessionData.userAgent,
        locale: sessionData.locale,
        platform: sessionData.platform
      }
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get session
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  /**
   * Track skill usage
   */
  trackSkillUsage(sessionId, skillData) {
    const session = this.getSession(sessionId);
    if (!session) return;

    const { skillName, action, parameters, result, duration } = skillData;

    const usage = {
      id: this._generateUsageId(),
      skillName,
      action, // 'discovered', 'selected', 'executed', 'completed', 'failed'
      parameters,
      result,
      duration,
      timestamp: Date.now(),
      success: result?.success !== false
    };

    session.interactions.push(usage);

    // Update skill usage map
    const skillStats = session.skillUsage.get(skillName) || {
      discovered: 0,
      selected: 0,
      executed: 0,
      completed: 0,
      failed: 0,
      totalDuration: 0,
      avgDuration: 0
    };

    skillStats[action === 'completed' ? 'completed' : action]++;
    if (duration) {
      skillStats.totalDuration += duration;
      skillStats.avgDuration = skillStats.totalDuration / (skillStats.completed || 1);
    }

    session.skillUsage.set(skillName, skillStats);
  }

  /**
   * Log recommendation
   */
  logRecommendation(recommendationData) {
    const log = {
      id: this._generateLogId(),
      timestamp: Date.now(),
      sessionId: recommendationData.sessionId,
      userInput: recommendationData.userInput,
      recommendations: recommendationData.recommendations || [],
      selectedSkill: recommendationData.selectedSkill,
      wasAccepted: recommendationData.wasAccepted,
      confidence: recommendationData.confidence,
      context: recommendationData.context
    };

    this.recommendationLogs.push(log);

    // Keep only last 10000 logs
    if (this.recommendationLogs.length > 10000) {
      this.recommendationLogs = this.recommendationLogs.slice(-5000);
    }

    this._saveLogs();
    return log;
  }

  /**
   * Submit feedback
   */
  async submitFeedback(sessionId, feedbackData) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const feedback = {
      id: this._generateFeedbackId(),
      sessionId,
      userId: session.userId,
      type: feedbackData.type, // 'rating', 'comment', 'bug_report', 'feature_request'
      target: feedbackData.target, // skill name, feature, etc.
      rating: feedbackData.rating, // 1-5
      comment: feedbackData.comment,
      tags: feedbackData.tags || [],
      metadata: feedbackData.metadata || {},
      timestamp: Date.now(),
      status: 'new'
    };

    session.feedback.push(feedback);
    this.feedback.set(feedback.id, feedback);

    // Update skill feedback index
    if (feedback.target) {
      this._updateSkillFeedbackIndex(feedback.target, feedback);
    }

    await this._saveFeedback();
    
    return feedback;
  }

  /**
   * Rate skill execution
   */
  async rateSkillExecution(sessionId, skillName, executionId, rating, comment = '') {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const execution = session.interactions.find(i => 
      i.id === executionId || (i.skillName === skillName && i.action === 'executed')
    );

    if (execution) {
      execution.rating = rating;
      if (comment) {
        execution.comment = comment;
      }
      execution.ratedAt = Date.now();
    }

    // Create feedback entry
    const feedback = await this.submitFeedback(sessionId, {
      type: 'rating',
      target: skillName,
      rating,
      comment,
      metadata: { executionId }
    });

    return feedback;
  }

  /**
   * Get feedback for skill
   */
  getSkillFeedback(skillName, options = {}) {
    const { limit = 50, offset = 0, minRating = 0 } = options;
    
    const skillFeedback = Array.from(this.feedback.values())
      .filter(f => 
        f.target === skillName && 
        f.type === 'rating' &&
        f.rating >= minRating
      )
      .sort((a, b) => b.timestamp - a.timestamp);

    return {
      feedback: skillFeedback.slice(offset, offset + limit),
      total: skillFeedback.length,
      averageRating: skillFeedback.length > 0
        ? skillFeedback.reduce((sum, f) => sum + f.rating, 0) / skillFeedback.length
        : 0,
      ratingDistribution: this._getRatingDistribution(skillFeedback)
    };
  }

  /**
   * Get rating distribution
   */
  _getRatingDistribution(feedback) {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const f of feedback) {
      if (f.rating >= 1 && f.rating <= 5) {
        distribution[f.rating]++;
      }
    }
    return distribution;
  }

  /**
   * Get recommendation accuracy
   */
  getRecommendationAccuracy() {
    const total = this.recommendationLogs.length;
    if (total === 0) return { accuracy: 0, total: 0 };

    const accepted = this.recommendationLogs.filter(l => l.wasAccepted).length;
    const highConfidence = this.recommendationLogs.filter(l => l.confidence >= 0.7);
    const highConfidenceAccepted = highConfidence.filter(l => l.wasAccepted).length;

    return {
      total,
      accepted,
      rejected: total - accepted,
      accuracy: accepted / total,
      highConfidenceTotal: highConfidence.length,
      highConfidenceAccuracy: highConfidence.length > 0 
        ? highConfidenceAccepted / highConfidence.length 
        : 0,
      averageConfidence: this.recommendationLogs.reduce((sum, l) => sum + (l.confidence || 0), 0) / total
    };
  }

  /**
   * Get skill performance stats
   */
  getSkillPerformanceStats() {
    const stats = new Map();

    for (const session of this.sessions.values()) {
      for (const [skillName, skillStats] of session.skillUsage) {
        const current = stats.get(skillName) || {
          skillName,
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          totalDuration: 0,
          avgDuration: 0,
          discoveryCount: 0,
          selectionRate: 0,
          completionRate: 0,
          ratings: [],
          recentFeedback: []
        };

        current.totalExecutions += skillStats.executed || 0;
        current.successfulExecutions += skillStats.completed || 0;
        current.failedExecutions += skillStats.failed || 0;
        current.discoveryCount += skillStats.discovered || 0;
        current.totalDuration += skillStats.totalDuration || 0;

        // Calculate rates
        if (current.discoveryCount > 0) {
          current.selectionRate = current.totalExecutions / current.discoveryCount;
        }
        if (current.totalExecutions > 0) {
          current.completionRate = current.successfulExecutions / current.totalExecutions;
          current.avgDuration = current.totalDuration / current.successfulExecutions;
        }

        stats.set(skillName, current);
      }
    }

    // Add ratings from feedback
    for (const [id, feedback] of this.feedback) {
      if (feedback.target && feedback.rating) {
        const current = stats.get(feedback.target);
        if (current) {
          current.ratings.push(feedback.rating);
          if (current.recentFeedback.length < 10) {
            current.recentFeedback.push({
              rating: feedback.rating,
              comment: feedback.comment,
              timestamp: feedback.timestamp
            });
          }
        }
      }
    }

    // Calculate average ratings
    for (const [skillName, stat] of stats) {
      if (stat.ratings.length > 0) {
        stat.averageRating = stat.ratings.reduce((a, b) => a + b, 0) / stat.ratings.length;
      }
    }

    return Array.from(stats.values())
      .sort((a, b) => b.totalExecutions - a.totalExecutions);
  }

  /**
   * Analyze recommendation patterns
   */
  analyzeRecommendationPatterns() {
    const patterns = {
      byCategory: new Map(),
      byContext: new Map(),
      commonInputs: new Map(),
      successFactors: []
    };

    for (const log of this.recommendationLogs) {
      // By category
      for (const rec of log.recommendations || []) {
        const category = rec.category || 'unknown';
        const catStats = patterns.byCategory.get(category) || {
          total: 0,
          accepted: 0,
          avgConfidence: 0,
          confidences: []
        };
        
        catStats.total++;
        if (log.wasAccepted && log.selectedSkill === rec.name) {
          catStats.accepted++;
        }
        catStats.confidences.push(rec.confidence || 0);
        
        patterns.byCategory.set(category, catStats);
      }

      // By context keywords
      if (log.context?.keywords) {
        for (const keyword of log.context.keywords) {
          const kwStats = patterns.byContext.get(keyword) || {
            total: 0,
            accepted: 0
          };
          kwStats.total++;
          if (log.wasAccepted) {
            kwStats.accepted++;
          }
          patterns.byContext.set(keyword, kwStats);
        }
      }
    }

    // Calculate average confidences
    for (const [category, catStats] of patterns.byCategory) {
      catStats.avgConfidence = catStats.confidences.reduce((a, b) => a + b, 0) / catStats.confidences.length;
      catStats.acceptanceRate = catStats.total > 0 ? catStats.accepted / catStats.total : 0;
      delete catStats.confidences;
    }

    return {
      byCategory: Object.fromEntries(patterns.byCategory),
      byContext: Object.fromEntries(patterns.byContext),
      topKeywords: Array.from(patterns.byContext.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 20)
        .map(([keyword, stats]) => ({ keyword, ...stats, acceptanceRate: stats.total > 0 ? stats.accepted / stats.total : 0 }))
    };
  }

  /**
   * Generate improvement recommendations
   */
  generateImprovementRecommendations() {
    const recommendations = [];
    const stats = this.getSkillPerformanceStats();
    const accuracy = this.getRecommendationAccuracy();

    // Low completion rate skills
    for (const stat of stats) {
      if (stat.totalExecutions >= 5 && stat.completionRate < 0.7) {
        recommendations.push({
          type: 'skill_quality',
          priority: 'high',
          skill: stat.skillName,
          issue: `Completion rate is ${(stat.completionRate * 100).toFixed(1)}%`,
          suggestion: 'Review skill implementation for errors or improve documentation'
        });
      }

      // Low ratings
      if (stat.ratings.length >= 3 && stat.averageRating < 3) {
        recommendations.push({
          type: 'skill_quality',
          priority: 'high',
          skill: stat.skillName,
          issue: `Average rating is ${stat.averageRating.toFixed(1)}/5`,
          suggestion: 'Review user feedback and improve skill functionality'
        });
      }
    }

    // Recommendation accuracy
    if (accuracy.total >= 10 && accuracy.accuracy < 0.5) {
      recommendations.push({
        type: 'recommendation_model',
        priority: 'medium',
        issue: `Recommendation accuracy is ${(accuracy.accuracy * 100).toFixed(1)}%`,
        suggestion: 'Improve skill matching algorithm or add more skill metadata'
      });
    }

    // High confidence but low acceptance
    if (accuracy.highConfidenceAccuracy < 0.5) {
      recommendations.push({
        type: 'recommendation_model',
        priority: 'medium',
        issue: 'High confidence recommendations often rejected',
        suggestion: 'Review confidence threshold and intent matching'
      });
    }

    return recommendations;
  }

  /**
   * Get user satisfaction score
   */
  getUserSatisfactionScore(userId) {
    const userFeedback = Array.from(this.feedback.values())
      .filter(f => f.userId === userId && f.type === 'rating');

    if (userFeedback.length === 0) return null;

    const avgRating = userFeedback.reduce((sum, f) => sum + f.rating, 0) / userFeedback.length;
    const recentFeedback = userFeedback
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
    
    const recentAvg = recentFeedback.reduce((sum, f) => sum + f.rating, 0) / recentFeedback.length;

    return {
      averageRating: avgRating,
      recentRating: recentAvg,
      totalFeedback: userFeedback.length,
      trend: recentAvg > avgRating ? 'improving' : recentAvg < avgAvg ? 'declining' : 'stable'
    };
  }

  /**
   * Update skill feedback index
   */
  _updateSkillFeedbackIndex(skillName, feedback) {
    // This would update an external index for quick lookups
  }

  /**
   * Generate IDs
   */
  _generateSessionId() { return `sess_${Date.now().toString(36)}_${this._randomId()}`; }
  _generateFeedbackId() { return `fb_${Date.now().toString(36)}_${this._randomId()}`; }
  _generateUsageId() { return `use_${Date.now().toString(36)}_${this._randomId()}`; }
  _generateLogId() { return `log_${Date.now().toString(36)}_${this._randomId()}`; }
  
  _randomId() {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Load from storage
   */
  async _loadFeedback() {
    if (this.storage?.load) {
      const data = await this.storage.load('feedback');
      if (data) {
        this.feedback = new Map(Object.entries(data.feedback || {}));
        this.recommendationLogs = data.recommendationLogs || [];
      }
    }
  }

  /**
   * Save to storage
   */
  async _saveFeedback() {
    if (this.storage?.save) {
      await this.storage.save('feedback', {
        feedback: Object.fromEntries(this.feedback),
        recommendationLogs: this.recommendationLogs
      });
    }
  }

  async _saveLogs() {
    // Logs are saved with feedback
    await this._saveFeedback();
  }

  /**
   * Cleanup old sessions
   */
  cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.sessionTimeout) {
        this.sessions.delete(id);
      }
    }
  }
}

module.exports = { FeedbackCollectionSystem };