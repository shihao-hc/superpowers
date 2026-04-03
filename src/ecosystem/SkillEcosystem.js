/**
 * Skill Ecosystem Operations
 * 技能生态运营平台 - 技能市场、开发者门户、数据分析
 */

const crypto = require('crypto');

class SkillEcosystem {
  constructor() {
    this.storefront = new SkillStorefront();
    this.developerPortal = new DeveloperPortal();
    this.analyticsHub = new AnalyticsHub();
    this.badges = new BadgeSystem();
    this.leaderboards = new LeaderboardSystem();
  }
}

// ========== 技能 storefront ==========

class SkillStorefront {
  constructor() {
    this.skills = new Map();
    this.categories = new Map();
    this.tags = new Map();
    this.reviews = new Map();
    this.bundles = new Map();
    
    this._initCategories();
  }

  _initCategories() {
    const categories = [
      { id: 'productivity', name: '效率工具', icon: '⚡', count: 0 },
      { id: 'ai-ml', name: 'AI与机器学习', icon: '🤖', count: 0 },
      { id: 'data', name: '数据处理', icon: '📊', count: 0 },
      { id: 'communication', name: '沟通协作', icon: '💬', count: 0 },
      { id: 'automation', name: '自动化', icon: '🔄', count: 0 },
      { id: 'integrations', name: '集成工具', icon: '🔗', count: 0 },
      { id: 'content', name: '内容创作', icon: '✍️', count: 0 },
      { id: 'industry', name: '行业方案', icon: '🏢', count: 0 }
    ];

    for (const cat of categories) {
      this.categories.set(cat.id, cat);
    }
  }

  publishSkill(skillData) {
    const skill = {
      id: `skill_${crypto.randomBytes(8).toString('hex')}`,
      name: skillData.name,
      description: skillData.description,
      shortDescription: skillData.shortDescription || skillData.description.slice(0, 100),
      category: skillData.category,
      tags: skillData.tags || [],
      author: {
        id: skillData.authorId,
        name: skillData.authorName,
        avatar: skillData.authorAvatar,
        verified: skillData.authorVerified || false
      },
      version: skillData.version || '1.0.0',
      pricing: skillData.pricing || { type: 'free' },
      stats: {
        downloads: 0,
        installs: 0,
        rating: 0,
        ratingCount: 0,
        weeklyInstalls: 0
      },
      dependencies: skillData.dependencies || [],
      inputs: skillData.inputs || [],
      outputs: skillData.outputs || [],
      gallery: skillData.gallery || [],
      documentation: skillData.documentation || {},
      support: skillData.support || {},
      compliance: skillData.compliance || [],
      riskLevel: skillData.riskLevel || 'low',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'pending' // pending, approved, rejected, deprecated
    };

    this.skills.set(skill.id, skill);

    // 更新分类计数
    const cat = this.categories.get(skill.category);
    if (cat) cat.count++;

    // 更新标签
    for (const tag of skill.tags) {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, { name: tag, count: 0 });
      }
      this.tags.get(tag).count++;
    }

    return skill;
  }

  getSkill(skillId) {
    return this.skills.get(skillId);
  }

  listSkills(filters = {}) {
    let skills = Array.from(this.skills.values()).filter(s => s.status === 'approved');

    if (filters.category) {
      skills = skills.filter(s => s.category === filters.category);
    }
    if (filters.tags && filters.tags.length > 0) {
      skills = skills.filter(s => 
        filters.tags.some(t => s.tags.includes(t))
      );
    }
    if (filters.author) {
      skills = skills.filter(s => s.author.id === filters.author);
    }
    if (filters.pricing) {
      skills = skills.filter(s => s.pricing.type === filters.pricing);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      skills = skills.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // 排序
    const sortBy = filters.sortBy || 'popular';
    switch (sortBy) {
      case 'popular':
        skills.sort((a, b) => b.stats.downloads - a.stats.downloads);
        break;
      case 'new':
        skills.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'rating':
        skills.sort((a, b) => b.stats.rating - a.stats.rating);
        break;
      case 'trending':
        skills.sort((a, b) => b.stats.weeklyInstalls - a.stats.weeklyInstalls);
        break;
    }

    // 分页
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;

    return {
      skills: skills.slice(offset, offset + limit),
      total: skills.length,
      hasMore: offset + limit < skills.length
    };
  }

  addReview(skillId, reviewData) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error('Skill not found');
    }

    const review = {
      id: `rev_${crypto.randomBytes(8).toString('hex')}`,
      skillId,
      userId: reviewData.userId,
      userName: reviewData.userName,
      rating: reviewData.rating,
      title: reviewData.title,
      content: reviewData.content,
      pros: reviewData.pros || [],
      cons: reviewData.cons || [],
      helpful: 0,
      verified: reviewData.verified || false,
      createdAt: Date.now()
    };

    if (!this.reviews.has(skillId)) {
      this.reviews.set(skillId, []);
    }
    this.reviews.get(skillId).push(review);

    // 更新技能评分
    const reviews = this.reviews.get(skillId);
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    skill.stats.rating = Math.round(avgRating * 10) / 10;
    skill.stats.ratingCount = reviews.length;

    return review;
  }

  // 技能包
  createBundle(bundleData) {
    const bundle = {
      id: `bundle_${crypto.randomBytes(8).toString('hex')}`,
      name: bundleData.name,
      description: bundleData.description,
      skills: bundleData.skills || [],
      pricing: bundleData.pricing,
      discount: bundleData.discount || 0,
      stats: {
        sales: 0,
        rating: 0
      },
      createdAt: Date.now()
    };

    this.bundles.set(bundle.id, bundle);
    return bundle;
  }

  getCategories() {
    return Array.from(this.categories.values());
  }

  getFeaturedSkills(limit = 10) {
    const skills = Array.from(this.skills.values())
      .filter(s => s.status === 'approved')
      .sort((a, b) => b.stats.downloads - a.stats.downloads)
      .slice(0, limit);
    return skills;
  }

  getNewReleases(limit = 10) {
    const skills = Array.from(this.skills.values())
      .filter(s => s.status === 'approved')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    return skills;
  }
}

// ========== 开发者门户 ==========

class DeveloperPortal {
  constructor() {
    this.developers = new Map();
    this.apps = new Map();
    this.apiKeys = new Map();
    this.webhooks = new Map();
  }

  registerDeveloper(data) {
    const developer = {
      id: `dev_${crypto.randomBytes(8).toString('hex')}`,
      name: data.name,
      email: data.email,
      company: data.company,
      website: data.website,
      tier: 'free', // free, pro, enterprise
      limits: this._getTierLimits('free'),
      skills: [],
      apps: [],
      stats: {
        totalEarnings: 0,
        totalDownloads: 0,
        rating: 0
      },
      badges: [],
      createdAt: Date.now()
    };

    this.developers.set(developer.id, developer);
    return developer;
  }

  _getTierLimits(tier) {
    const limits = {
      free: {
        skills: 5,
        monthlyDownloads: 1000,
        storage: 100 * 1024 * 1024,
        apiCalls: 10000
      },
      pro: {
        skills: 50,
        monthlyDownloads: 50000,
        storage: 5 * 1024 * 1024 * 1024,
        apiCalls: 100000
      },
      enterprise: {
        skills: -1,
        monthlyDownloads: -1,
        storage: -1,
        apiCalls: -1
      }
    };
    return limits[tier] || limits.free;
  }

  createAPIKey(developerId, options = {}) {
    const developer = this.developers.get(developerId);
    if (!developer) {
      throw new Error('Developer not found');
    }

    const keyId = `key_${crypto.randomBytes(8).toString('hex')}`;
    const keySecret = crypto.randomBytes(32).toString('base64');

    const apiKey = {
      id: keyId,
      developerId,
      name: options.name || 'API Key',
      key: `${keyId}:${keySecret}`,
      keyHash: crypto.createHash('sha256').update(keySecret).digest('hex'),
      scopes: options.scopes || ['skills:read'],
      rateLimit: options.rateLimit || 100,
      expiresAt: options.expiresAt || Date.now() + 365 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
      lastUsed: null,
      status: 'active'
    };

    this.apiKeys.set(keyId, apiKey);
    return {
      id: keyId,
      key: apiKey.key,
      expiresAt: apiKey.expiresAt
    };
  }

  createApp(developerId, appData) {
    const app = {
      id: `app_${crypto.randomBytes(8).toString('hex')}`,
      developerId,
      name: appData.name,
      description: appData.description,
      website: appData.website,
      redirectUris: appData.redirectUris || [],
      scopes: appData.scopes || [],
      clientId: `client_${crypto.randomBytes(16).toString('hex')}`,
      clientSecret: crypto.randomBytes(32).toString('base64'),
      status: 'active',
      createdAt: Date.now()
    };

    this.apps.set(app.id, app);
    return app;
  }

  registerWebhook(developerId, webhookData) {
    const webhook = {
      id: `wh_${crypto.randomBytes(8).toString('hex')}`,
      developerId,
      url: webhookData.url,
      events: webhookData.events || ['skill.downloaded', 'skill.reviewed'],
      secret: crypto.randomBytes(32).toString('hex'),
      status: 'active',
      createdAt: Date.now(),
      stats: {
        successCount: 0,
        failureCount: 0,
        lastDelivery: null
      }
    };

    this.webhooks.set(webhook.id, webhook);
    return webhook;
  }
}

// ========== 数据分析中心 ==========

class AnalyticsHub {
  constructor() {
    this.events = [];
    this.metrics = new Map();
    this.reports = new Map();
  }

  trackEvent(event) {
    this.events.push({
      ...event,
      id: `evt_${crypto.randomBytes(8).toString('hex')}`,
      timestamp: Date.now()
    });

    // 保持事件在合理范围
    if (this.events.length > 100000) {
      this.events = this.events.slice(-50000);
    }

    // 更新指标
    this._updateMetrics(event);
  }

  _updateMetrics(event) {
    const metricKey = `${event.type}:${event.skillId || 'global'}`;
    const metric = this.metrics.get(metricKey) || {
      type: event.type,
      skillId: event.skillId,
      count: 0,
      byDay: new Map(),
      byCountry: new Map()
    };

    metric.count++;

    // 按天统计
    const day = new Date().toISOString().split('T')[0];
    metric.byDay.set(day, (metric.byDay.get(day) || 0) + 1);

    // 按国家统计
    if (event.country) {
      metric.byCountry.set(event.country, (metric.byCountry.get(event.country) || 0) + 1);
    }

    this.metrics.set(metricKey, metric);
  }

  getSkillAnalytics(skillId, options = {}) {
    const downloads = this.events.filter(
      e => e.type === 'skill.downloaded' && e.skillId === skillId
    );
    const installs = this.events.filter(
      e => e.type === 'skill.installed' && e.skillId === skillId
    );
    const reviews = this.events.filter(
      e => e.type === 'skill.reviewed' && e.skillId === skillId
    );

    return {
      overview: {
        totalDownloads: downloads.length,
        totalInstalls: installs.length,
        totalReviews: reviews.length,
        installRate: downloads.length > 0 
          ? Math.round(installs.length / downloads.length * 100) 
          : 0
      },
      trends: this._getTrends(downloads, options.days || 30),
      geography: this._getGeography(downloads),
      conversion: this._getConversion(skillId)
    };
  }

  _getTrends(events, days) {
    const trends = [];
    const now = Date.now();
    
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - i * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      
      const count = events.filter(
        e => e.timestamp >= dayStart && e.timestamp < dayEnd
      ).length;

      trends.push({
        date: new Date(dayStart).toISOString().split('T')[0],
        value: count
      });
    }

    return trends;
  }

  _getGeography(events) {
    const geo = {};
    for (const event of events) {
      const country = event.country || 'Unknown';
      geo[country] = (geo[country] || 0) + 1;
    }
    return Object.entries(geo)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
  }

  _getConversion(skillId) {
    const viewed = this.events.filter(
      e => e.type === 'skill.viewed' && e.skillId === skillId
    ).length;
    const downloaded = this.events.filter(
      e => e.type === 'skill.downloaded' && e.skillId === skillId
    ).length;
    const installed = this.events.filter(
      e => e.type === 'skill.installed' && e.skillId === skillId
    ).length;

    return {
      viewToDownload: viewed > 0 ? Math.round(downloaded / viewed * 100) : 0,
      downloadToInstall: downloaded > 0 ? Math.round(installed / downloaded * 100) : 0
    };
  }

  // 生成报告
  generateReport(type, options = {}) {
    const report = {
      id: `rpt_${crypto.randomBytes(8).toString('hex')}`,
      type,
      options,
      generatedAt: Date.now()
    };

    switch (type) {
      case 'market-overview':
        report.data = this._marketOverviewReport();
        break;
      case 'trending-skills':
        report.data = this._trendingSkillsReport(options.limit || 20);
        break;
      case 'developer-performance':
        report.data = this._developerPerformanceReport(options.developerId);
        break;
      default:
        throw new Error(`Unknown report type: ${type}`);
    }

    this.reports.set(report.id, report);
    return report;
  }

  _marketOverviewReport() {
    const skills = this.events.filter(e => e.type === 'skill.published');
    const downloads = this.events.filter(e => e.type === 'skill.downloaded');
    const reviews = this.events.filter(e => e.type === 'skill.reviewed');

    return {
      totalSkills: skills.length,
      totalDownloads: downloads.length,
      totalReviews: reviews.length,
      avgRating: reviews.length > 0 ? 4.2 : 0, // 简化计算
      topCategories: this._topCategories()
    };
  }

  _topCategories() {
    const catCounts = {};
    for (const event of this.events) {
      if (event.category) {
        catCounts[event.category] = (catCounts[event.category] || 0) + 1;
      }
    }
    return Object.entries(catCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  _trendingSkillsReport(limit) {
    const skillScores = new Map();

    for (const event of this.events) {
      if (event.skillId) {
        const score = skillScores.get(event.skillId) || 0;
        let weight = 1;
        
        // 权重
        switch (event.type) {
          case 'skill.viewed': weight = 1; break;
          case 'skill.downloaded': weight = 3; break;
          case 'skill.installed': weight = 5; break;
          case 'skill.reviewed': weight = 4; break;
        }

        skillScores.set(event.skillId, score + weight);
      }
    }

    return Array.from(skillScores.entries())
      .map(([skillId, score]) => ({ skillId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  _developerPerformanceReport(developerId) {
    const events = this.events.filter(e => e.developerId === developerId);
    
    return {
      totalEarnings: events.filter(e => e.type === 'payment.received')
        .reduce((sum, e) => sum + (e.amount || 0), 0),
      totalDownloads: events.filter(e => e.type === 'skill.downloaded').length,
      skillCount: events.filter(e => e.type === 'skill.published').length,
      avgRating: 4.5
    };
  }
}

// ========== 徽章系统 ==========

class BadgeSystem {
  constructor() {
    this.badges = new Map();
    this.userBadges = new Map();
    this._initBadges();
  }

  _initBadges() {
    const badges = [
      { id: 'first-skill', name: '初出茅庐', description: '发布第一个技能', icon: '🌱', requirement: { type: 'skill_count', value: 1 } },
      { id: 'skill-master', name: '技能大师', description: '发布10个技能', icon: '🎯', requirement: { type: 'skill_count', value: 10 } },
      { id: 'popular', name: '人气之星', description: '技能下载量超过10000', icon: '⭐', requirement: { type: 'downloads', value: 10000 } },
      { id: 'top-rated', name: '评分达人', description: '技能平均评分达到4.8', icon: '💎', requirement: { type: 'avg_rating', value: 4.8 } },
      { id: 'early-adopter', name: '早期用户', description: '平台早期注册用户', icon: '🚀', requirement: { type: 'registered_before', value: '2024-06-01' } },
      { id: 'helper', name: '热心助人', description: '帮助100个开发者', icon: '🤝', requirement: { type: 'help_count', value: 100 } },
      { id: 'verified', name: '认证开发者', description: '完成身份认证', icon: '✅', requirement: { type: 'verified', value: true } }
    ];

    for (const badge of badges) {
      this.badges.set(badge.id, badge);
    }
  }

  checkAndAwardBadges(userId, stats) {
    const awarded = [];
    const currentBadges = this.userBadges.get(userId) || [];

    for (const [badgeId, badge] of this.badges.entries()) {
      if (currentBadges.includes(badgeId)) continue;

      if (this._checkRequirement(badge.requirement, stats)) {
        currentBadges.push(badgeId);
        awarded.push(badge);
      }
    }

    if (awarded.length > 0) {
      this.userBadges.set(userId, currentBadges);
    }

    return awarded;
  }

  _checkRequirement(requirement, stats) {
    switch (requirement.type) {
      case 'skill_count':
        return stats.skillCount >= requirement.value;
      case 'downloads':
        return stats.totalDownloads >= requirement.value;
      case 'avg_rating':
        return stats.avgRating >= requirement.value;
      case 'verified':
        return stats.verified === requirement.value;
      default:
        return false;
    }
  }

  getUserBadges(userId) {
    const badgeIds = this.userBadges.get(userId) || [];
    return badgeIds.map(id => this.badges.get(id)).filter(Boolean);
  }
}

// ========== 排行榜系统 ==========

class LeaderboardSystem {
  constructor() {
    this.leaderboards = new Map();
    this._initLeaderboards();
  }

  _initLeaderboards() {
    const types = [
      { id: 'downloads', name: '下载榜', period: 'weekly', icon: '📥' },
      { id: 'rating', name: '评分榜', period: 'weekly', icon: '⭐' },
      { id: 'new', name: '新锐榜', period: 'weekly', icon: '🌟' },
      { id: 'revenue', name: '收益榜', period: 'monthly', icon: '💰' }
    ];

    for (const lb of types) {
      this.leaderboards.set(lb.id, {
        ...lb,
        entries: [],
        lastUpdated: Date.now()
      });
    }
  }

  updateLeaderboard(type, entries) {
    const leaderboard = this.leaderboards.get(type);
    if (!leaderboard) return;

    leaderboard.entries = entries.slice(0, 100);
    leaderboard.lastUpdated = Date.now();
  }

  getLeaderboard(type, options = {}) {
    const leaderboard = this.leaderboards.get(type);
    if (!leaderboard) return null;

    const limit = options.limit || 20;
    const offset = options.offset || 0;

    return {
      ...leaderboard,
      entries: leaderboard.entries.slice(offset, offset + limit)
    };
  }
}

module.exports = { SkillEcosystem, SkillStorefront, DeveloperPortal, AnalyticsHub, BadgeSystem, LeaderboardSystem };
