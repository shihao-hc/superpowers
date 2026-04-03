/**
 * Skill Contribution System
 * Enables community members to contribute skills with review workflow and incentives
 */

class SkillContributionSystem {
  constructor(options = {}) {
    this.contributions = new Map();
    this.maxContributionsPerDay = options.maxContributionsPerDay || 5;
    this.minQualityScore = options.minQualityScore || 0.6;
    this.storage = options.storage || null;
    
    this._loadContributions();
  }

  /**
   * Submit a new skill contribution
   */
  async submitContribution(contributor, skillData) {
    const contributionId = this._generateContributionId();
    
    // Validate contribution
    const validation = this._validateContribution(skillData);
    if (!validation.valid) {
      throw new Error(`Invalid contribution: ${validation.errors.join(', ')}`);
    }

    // Check daily limit
    const dailyContributions = this._getDailyContributions(contributor.id);
    if (dailyContributions >= this.maxContributionsPerDay) {
      throw new Error(`Daily contribution limit (${this.maxContributionsPerDay}) reached`);
    }

    const contribution = {
      id: contributionId,
      contributor: {
        id: contributor.id,
        username: contributor.username,
        reputation: contributor.reputation || 0
      },
      skill: {
        name: skillData.name,
        description: skillData.description,
        category: skillData.category,
        tags: skillData.tags || [],
        inputs: skillData.inputs || [],
        outputs: skillData.outputs || [],
        code: skillData.code || '',
        examples: skillData.examples || [],
        documentation: skillData.documentation || '',
        license: skillData.license || 'MIT'
      },
      status: 'pending',
      qualityScore: 0,
      reviewHistory: [],
      submittedAt: Date.now(),
      updatedAt: Date.now(),
      stats: {
        views: 0,
        downloads: 0,
        ratings: [],
        comments: []
      },
      rewards: {
        points: 0,
        badges: [],
        tier: 'bronze'
      }
    };

    this.contributions.set(contributionId, contribution);
    await this._saveContributions();

    // Emit event
    this._emitEvent('contribution_submitted', contribution);

    return contribution;
  }

  /**
   * Validate contribution
   */
  _validateContribution(skillData) {
    const errors = [];

    if (!skillData.name || skillData.name.length < 3) {
      errors.push('Name must be at least 3 characters');
    }

    if (!skillData.description || skillData.description.length < 20) {
      errors.push('Description must be at least 20 characters');
    }

    if (!skillData.category) {
      errors.push('Category is required');
    }

    if (!skillData.code && !skillData.implementation) {
      errors.push('Code or implementation is required');
    }

    // Check for prohibited content
    const prohibitedPatterns = [
      /eval\s*\(/,
      /exec\s*\(/,
      /child_process/,
      /require\s*\(\s*'child_process'\s*\)/,
      /process\.env/,
      /\.env/
    ];

    const code = skillData.code || skillData.implementation || '';
    for (const pattern of prohibitedPatterns) {
      if (pattern.test(code)) {
        errors.push('Code contains prohibited patterns');
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get contribution by ID
   */
  getContribution(contributionId) {
    return this.contributions.get(contributionId);
  }

  /**
   * Get contributions by status
   */
  getContributionsByStatus(status, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    let contributions = Array.from(this.contributions.values())
      .filter(c => c.status === status)
      .sort((a, b) => b.submittedAt - a.submittedAt);

    return contributions.slice(offset, offset + limit);
  }

  /**
   * Get pending contributions for review
   */
  getPendingContributions(options = {}) {
    const { limit = 20, offset = 0 } = options;
    
    const pending = this.getContributionsByStatus('pending')
      .filter(c => c.qualityScore >= this.minQualityScore);

    return pending.slice(offset, offset + limit);
  }

  /**
   * Review a contribution
   */
  async reviewContribution(contributionId, reviewer, reviewData) {
    const contribution = this.contributions.get(contributionId);
    if (!contribution) {
      throw new Error('Contribution not found');
    }

    if (contribution.status !== 'pending') {
      throw new Error('Contribution is not pending review');
    }

    const review = {
      id: this._generateReviewId(),
      reviewer: {
        id: reviewer.id,
        username: reviewer.username,
        role: reviewer.role
      },
      decision: reviewData.decision, // 'approved', 'rejected', 'needs_revision'
      scores: reviewData.scores || {},
      comments: reviewData.comments || '',
      timestamp: Date.now()
    };

    contribution.reviewHistory.push(review);
    contribution.updatedAt = Date.now();

    // Calculate quality score
    if (reviewData.scores) {
      const scores = Object.values(reviewData.scores);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      contribution.qualityScore = avgScore;
    }

    // Update status based on decision
    if (reviewData.decision === 'approved') {
      contribution.status = 'approved';
      await this._awardRewards(contribution);
    } else if (reviewData.decision === 'rejected') {
      contribution.status = 'rejected';
    } else if (reviewData.decision === 'needs_revision') {
      contribution.status = 'revision_needed';
    }

    await this._saveContributions();

    // Emit event
    this._emitEvent('contribution_reviewed', {
      contribution,
      review
    });

    return contribution;
  }

  /**
   * Award rewards for approved contribution
   */
  async _awardRewards(contribution) {
    const basePoints = 50;
    const qualityBonus = Math.round(contribution.qualityScore * 50);
    const categoryBonus = this._getCategoryBonus(contribution.skill.category);
    const firstContributionBonus = this._isFirstContribution(contribution.contributor.id) ? 100 : 0;

    contribution.rewards.points = basePoints + qualityBonus + categoryBonus + firstContributionBonus;
    contribution.rewards.badges = this._determineBadges(contribution);
    contribution.rewards.tier = this._calculateTier(contribution.rewards.points);

    await this._saveContributions();
  }

  /**
   * Get category bonus
   */
  _getCategoryBonus(category) {
    const bonuses = {
      'data-analysis': 30,
      'machine-learning': 40,
      'web-development': 20,
      'automation': 25,
      'security': 35,
      'devops': 25,
      'database': 20,
      'api': 20
    };
    return bonuses[category] || 10;
  }

  /**
   * Check if first contribution
   */
  _isFirstContribution(userId) {
    const userContributions = Array.from(this.contributions.values())
      .filter(c => c.contributor.id === userId && c.status === 'approved');
    return userContributions.length === 1;
  }

  /**
   * Determine badges earned
   */
  _determineBadges(contribution) {
    const badges = [];
    
    if (contribution.qualityScore >= 0.9) {
      badges.push('quality-master');
    }
    
    if (contribution.skill.examples?.length >= 3) {
      badges.push('documenter');
    }
    
    if (contribution.skill.documentation?.length >= 500) {
      badges.push('thorough');
    }

    if (this._isFirstContribution(contribution.contributor.id)) {
      badges.push('first-contribution');
    }

    return badges;
  }

  /**
   * Calculate tier
   */
  _calculateTier(points) {
    if (points >= 500) return 'platinum';
    if (points >= 300) return 'gold';
    if (points >= 150) return 'silver';
    return 'bronze';
  }

  /**
   * Update contribution
   */
  async updateContribution(contributionId, updates) {
    const contribution = this.contributions.get(contributionId);
    if (!contribution) {
      throw new Error('Contribution not found');
    }

    if (contribution.status === 'revision_needed' || contribution.status === 'rejected') {
      // Update skill data
      if (updates.name) contribution.skill.name = updates.name;
      if (updates.description) contribution.skill.description = updates.description;
      if (updates.category) contribution.skill.category = updates.category;
      if (updates.tags) contribution.skill.tags = updates.tags;
      if (updates.code) contribution.skill.code = updates.code;
      if (updates.examples) contribution.skill.examples = updates.examples;
      if (updates.documentation) contribution.skill.documentation = updates.documentation;

      // Reset to pending if revision was needed
      if (contribution.status === 'revision_needed') {
        contribution.status = 'pending';
        contribution.qualityScore = 0;
      }

      contribution.updatedAt = Date.now();
      await this._saveContributions();

      this._emitEvent('contribution_updated', contribution);
    }

    return contribution;
  }

  /**
   * Track view
   */
  async trackView(contributionId) {
    const contribution = this.contributions.get(contributionId);
    if (contribution) {
      contribution.stats.views++;
      await this._saveContributions();
    }
  }

  /**
   * Track download
   */
  async trackDownload(contributionId) {
    const contribution = this.contributions.get(contributionId);
    if (contribution) {
      contribution.stats.downloads++;
      await this._saveContributions();
    }
  }

  /**
   * Add rating
   */
  async addRating(contributionId, userId, rating) {
    const contribution = this.contributions.get(contributionId);
    if (!contribution) {
      throw new Error('Contribution not found');
    }

    // Remove existing rating from same user
    contribution.stats.ratings = contribution.stats.ratings
      .filter(r => r.userId !== userId);

    // Add new rating
    contribution.stats.ratings.push({
      userId,
      rating,
      timestamp: Date.now()
    });

    await this._saveContributions();
  }

  /**
   * Add comment
   */
  async addComment(contributionId, user, comment) {
    const contribution = this.contributions.get(contributionId);
    if (!contribution) {
      throw new Error('Contribution not found');
    }

    contribution.stats.comments.push({
      id: this._generateCommentId(),
      user: {
        id: user.id,
        username: user.username
      },
      text: comment,
      timestamp: Date.now(),
      replies: []
    });

    await this._saveContributions();

    return contribution.stats.comments[contribution.stats.comments.length - 1];
  }

  /**
   * Get contributor stats
   */
  getContributorStats(userId) {
    const contributions = Array.from(this.contributions.values())
      .filter(c => c.contributor.id === userId);

    const approved = contributions.filter(c => c.status === 'approved');
    const pending = contributions.filter(c => c.status === 'pending');
    const rejected = contributions.filter(c => c.status === 'rejected');

    const totalPoints = approved.reduce((sum, c) => sum + c.rewards.points, 0);
    const avgQuality = approved.length > 0
      ? approved.reduce((sum, c) => sum + c.qualityScore, 0) / approved.length
      : 0;

    return {
      totalContributions: contributions.length,
      approved: approved.length,
      pending: pending.length,
      rejected: rejected.length,
      totalPoints,
      averageQuality: avgQuality,
      tier: this._calculateTier(totalPoints),
      badges: [...new Set(approved.flatMap(c => c.rewards.badges))]
    };
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(options = {}) {
    const { limit = 20 } = options;
    
    const contributorPoints = new Map();
    
    for (const contribution of this.contributions.values()) {
      if (contribution.status === 'approved') {
        const id = contribution.contributor.id;
        const current = contributorPoints.get(id) || {
          id,
          username: contribution.contributor.username,
          points: 0,
          contributions: 0,
          avgQuality: 0,
          qualities: []
        };
        
        current.points += contribution.rewards.points;
        current.contributions++;
        current.qualities.push(contribution.qualityScore);
        
        contributorPoints.set(id, current);
      }
    }

    return Array.from(contributorPoints.values())
      .map(c => ({
        ...c,
        avgQuality: c.qualities.reduce((a, b) => a + b, 0) / c.qualities.length,
        tier: this._calculateTier(c.points)
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);
  }

  /**
   * Get dashboard stats
   */
  getDashboardStats() {
    const all = Array.from(this.contributions.values());
    
    return {
      total: all.length,
      pending: all.filter(c => c.status === 'pending').length,
      approved: all.filter(c => c.status === 'approved').length,
      rejected: all.filter(c => c.status === 'rejected').length,
      revisionNeeded: all.filter(c => c.status === 'revision_needed').length,
      totalDownloads: all.reduce((sum, c) => sum + c.stats.downloads, 0),
      totalViews: all.reduce((sum, c) => sum + c.stats.views, 0),
      averageQuality: all.filter(c => c.qualityScore > 0)
        .reduce((sum, c, _, arr) => sum + c.qualityScore / arr.length, 0)
    };
  }

  /**
   * Export approved skills
   */
  exportApprovedSkills() {
    return Array.from(this.contributions.values())
      .filter(c => c.status === 'approved')
      .map(c => ({
        id: c.id,
        name: c.skill.name,
        description: c.skill.description,
        category: c.skill.category,
        tags: c.skill.tags,
        inputs: c.skill.inputs,
        outputs: c.skill.outputs,
        code: c.skill.code,
        examples: c.skill.examples,
        documentation: c.skill.documentation,
        license: c.skill.license,
        contributor: c.contributor.username,
        qualityScore: c.qualityScore,
        stats: c.stats
      }));
  }

  /**
   * Generate IDs
   */
  _generateContributionId() {
    return `contrib_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _generateReviewId() {
    return `review_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _generateCommentId() {
    return `comment_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get daily contributions
   */
  _getDailyContributions(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return Array.from(this.contributions.values())
      .filter(c => 
        c.contributor.id === userId && 
        c.submittedAt >= today.getTime()
      ).length;
  }

  /**
   * Load contributions from storage
   */
  async _loadContributions() {
    if (this.storage?.load) {
      const data = await this.storage.load('contributions');
      if (data) {
        for (const [id, contribution] of Object.entries(data)) {
          this.contributions.set(id, contribution);
        }
      }
    }
  }

  /**
   * Save contributions to storage
   */
  async _saveContributions() {
    if (this.storage?.save) {
      const data = Object.fromEntries(this.contributions);
      await this.storage.save('contributions', data);
    }
  }

  /**
   * Emit event
   */
  _emitEvent(event, data) {
    if (typeof this.onEvent === 'function') {
      this.onEvent(event, data);
    }
  }
}

module.exports = { SkillContributionSystem };