/**
 * User Feedback Collection System
 * 用户反馈渠道与持续迭代管理
 */

class FeedbackCollector {
  constructor(options = {}) {
    this.feedback = [];
    this.suggestions = [];
    this.bugs = [];
    this.ratings = [];
    this.featureRequests = [];
    
    this.maxFeedback = options.maxFeedback || 1000;
    this.categories = [
      'performance',
      'usability',
      'features',
      'bug',
      'documentation',
      'security',
      'other'
    ];
  }
  
  submitFeedback(data) {
    const feedback = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: data.type || 'general',
      category: this.validateCategory(data.category),
      userId: data.userId || 'anonymous',
      rating: this.validateRating(data.rating),
      message: this.sanitizeMessage(data.message),
      context: {
        url: data.context?.url,
        userAgent: data.context?.userAgent,
        timestamp: Date.now()
      },
      status: 'new',
      priority: this.calculatePriority(data),
      tags: this.extractTags(data.message),
      responses: [],
      createdAt: new Date().toISOString()
    };
    
    this.feedback.push(feedback);
    this.trimFeedback();
    
    if (feedback.type === 'bug') {
      this.bugs.push(feedback);
    } else if (feedback.type === 'suggestion') {
      this.suggestions.push(feedback);
    } else if (feedback.rating) {
      this.ratings.push(feedback);
    }
    
    return feedback;
  }
  
  submitRating(userId, rating, metadata = {}) {
    const feedback = this.submitFeedback({
      type: 'rating',
      userId,
      rating,
      message: metadata.message || `Rating: ${rating}/5`,
      context: metadata.context
    });
    
    return feedback;
  }
  
  submitFeatureRequest(userId, request) {
    const feedback = this.submitFeedback({
      type: 'feature_request',
      userId,
      category: 'features',
      message: request.description,
      context: request.context
    });
    
    feedback.feature = {
      title: request.title,
      description: request.description,
      priority: request.priority || 'medium',
      useCases: request.useCases || [],
      impact: request.impact || 'medium',
      effort: request.effort || 'medium'
    };
    
    this.featureRequests.push(feedback);
    
    return feedback;
  }
  
  getFeedback(options = {}) {
    let result = [...this.feedback];
    
    if (options.type) {
      result = result.filter(f => f.type === options.type);
    }
    
    if (options.category) {
      result = result.filter(f => f.category === options.category);
    }
    
    if (options.status) {
      result = result.filter(f => f.status === options.status);
    }
    
    if (options.priority) {
      result = result.filter(f => f.priority === options.priority);
    }
    
    if (options.userId) {
      result = result.filter(f => f.userId === options.userId);
    }
    
    result.sort((a, b) => {
      if (options.sortBy === 'rating') {
        return (b.rating || 0) - (a.rating || 0);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
    
    if (options.limit) {
      result = result.slice(0, options.limit);
    }
    
    return result;
  }
  
  getStatistics() {
    const total = this.feedback.length;
    const byCategory = {};
    const byStatus = {};
    const byType = {};
    const byPriority = {};
    
    this.categories.forEach(c => byCategory[c] = 0);
    ['new', 'reviewed', 'in_progress', 'resolved', 'closed'].forEach(s => byStatus[s] = 0);
    ['general', 'bug', 'suggestion', 'feature_request', 'rating'].forEach(t => byType[t] = 0);
    ['low', 'medium', 'high', 'critical'].forEach(p => byPriority[p] = 0);
    
    this.feedback.forEach(f => {
      byCategory[f.category]++;
      byStatus[f.status]++;
      byType[f.type]++;
      byPriority[f.priority]++;
    });
    
    const ratings = this.ratings.map(f => f.rating).filter(r => r);
    const avgRating = ratings.length > 0 
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
      : 0;
    
    const recentFeedback = this.getFeedback({ limit: 10 });
    const highPriority = this.getFeedback({ priority: 'high', limit: 5 });
    const unresolvedBugs = this.getFeedback({ type: 'bug', status: 'new' });
    
    return {
      total,
      byCategory,
      byStatus,
      byType,
      byPriority,
      rating: {
        average: avgRating,
        count: ratings.length,
        distribution: this.getRatingDistribution()
      },
      recent: recentFeedback,
      highPriority,
      unresolvedBugs: unresolvedBugs.length,
      topSuggestions: this.getFeedback({ type: 'suggestion', limit: 5 })
    };
  }
  
  getRatingDistribution() {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    this.ratings.forEach(f => {
      if (f.rating >= 1 && f.rating <= 5) {
        distribution[f.rating]++;
      }
    });
    return distribution;
  }
  
  updateStatus(feedbackId, status, response = null) {
    const feedback = this.feedback.find(f => f.id === feedbackId);
    if (!feedback) return null;
    
    feedback.status = status;
    if (response) {
      feedback.responses.push({
        ...response,
        timestamp: new Date().toISOString()
      });
    }
    
    return feedback;
  }
  
  getRoadmap() {
    const features = this.featureRequests.filter(f => f.status !== 'closed');
    const highImpact = features.filter(f => f.feature?.impact === 'high');
    
    return {
      planned: features.filter(f => f.status === 'new'),
      inProgress: features.filter(f => f.status === 'in_progress'),
      highPriority: highImpact,
      voteCount: this.calculateVotes(features)
    };
  }
  
  calculateVotes(features) {
    const votes = {};
    features.forEach(f => {
      const key = f.feature?.title || f.id;
      votes[key] = (votes[key] || 0) + 1;
    });
    return Object.entries(votes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }
  
  validateCategory(category) {
    return this.categories.includes(category) ? category : 'other';
  }
  
  validateRating(rating) {
    const r = parseInt(rating);
    return (r >= 1 && r <= 5) ? r : null;
  }
  
  sanitizeMessage(message) {
    if (!message) return '';
    return String(message)
      .substring(0, 2000)
      .replace(/[<>]/g, '')
      .trim();
  }
  
  calculatePriority(data) {
    if (data.type === 'bug') {
      if (data.message?.toLowerCase().includes('crash') || 
          data.message?.toLowerCase().includes('data loss')) {
        return 'critical';
      }
      if (data.message?.toLowerCase().includes('error')) {
        return 'high';
      }
      return 'medium';
    }
    
    if (data.rating === 1) return 'high';
    if (data.rating === 2) return 'medium';
    
    return 'low';
  }
  
  extractTags(message) {
    if (!message) return [];
    
    const keywords = [
      'slow', 'fast', 'easy', 'difficult', 'intuitive',
      'bug', 'crash', 'error', 'feature', 'ui', 'api',
      'documentation', 'performance', 'security'
    ];
    
    const lower = message.toLowerCase();
    return keywords.filter(k => lower.includes(k));
  }
  
  trimFeedback() {
    while (this.feedback.length > this.maxFeedback) {
      const oldest = this.feedback.shift();
      if (oldest.type === 'bug') {
        this.bugs.shift();
      } else if (oldest.type === 'suggestion') {
        this.suggestions.shift();
      }
      if (oldest.rating) {
        this.ratings.shift();
      }
    }
  }
  
  exportJSON() {
    return {
      exportedAt: new Date().toISOString(),
      feedback: this.feedback,
      statistics: this.getStatistics(),
      roadmap: this.getRoadmap()
    };
  }
  
  importJSON(data) {
    if (data.feedback) {
      this.feedback = data.feedback;
      this.maxFeedback = Math.max(this.maxFeedback, this.feedback.length);
    }
  }
}

module.exports = { FeedbackCollector };
