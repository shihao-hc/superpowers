/**
 * Skill Author Reward System
 * 为优质技能作者提供奖励机制（积分、荣誉徽章）
 */

const fs = require('fs');
const path = require('path');

class RewardSystem {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'rewards');
    this.profilesFile = path.join(this.dataDir, 'profiles.json');
    this.rewardsFile = path.join(this.dataDir, 'rewards.json');
    
    // 积分规则
    this.pointRules = {
      // 技能相关
      skillPublished: 100,      // 发布技能
      skillDownloaded: 1,       // 每次下载
      skillRated: 5,           // 收到评分
      skillFeatured: 200,      // 被推荐
      
      // 社区贡献
      reviewWritten: 10,       // 写评价
      bugReported: 20,         // 报告bug
      bugFixed: 50,           // 修复bug
      suggestionAccepted: 30,  // 建议被采纳
      
      // 版本更新
      majorVersionUpdate: 50,  // 大版本更新
      minorVersionUpdate: 20,  // 小版本更新
      patchVersionUpdate: 5,   // 补丁更新
      
      // 安全和质量
      securityScanPassed: 30,  // 通过安全扫描
      highTrustScore: 50,      // 高信任分数
      zeroBugs: 20,           // 零bug
    };
    
    // 徽章定义
    this.badges = {
      // 发布相关
      first_skill: { name: '初出茅庐', description: '发布第一个技能', icon: '🌟', tier: 'bronze' },
      skill_5: { name: '多产作者', description: '发布5个技能', icon: '📚', tier: 'silver' },
      skill_10: { name: '技能大师', description: '发布10个技能', icon: '🏆', tier: 'gold' },
      skill_25: { name: '传奇作者', description: '发布25个技能', icon: '👑', tier: 'platinum' },
      
      // 下载相关
      downloads_100: { name: '小有名气', description: '技能下载100次', icon: '📈', tier: 'bronze' },
      downloads_1000: { name: '广受欢迎', description: '技能下载1000次', icon: '🔥', tier: 'silver' },
      downloads_10000: { name: '万人追捧', description: '技能下载10000次', icon: '💎', tier: 'gold' },
      downloads_100000: { name: '现象级', description: '技能下载100000次', icon: '🚀', tier: 'platinum' },
      
      // 评分相关
      rating_5: { name: '完美之作', description: '获得5星评分', icon: '⭐', tier: 'silver' },
      rating_10: { name: '好评如潮', description: '获得10个5星评分', icon: '🌟', tier: 'gold' },
      
      // 安全相关
      security_pro: { name: '安全卫士', description: '通过安全扫描', icon: '🛡️', tier: 'bronze' },
      trusted_developer: { name: '可信开发者', description: '获得高信任分数', icon: '✅', tier: 'silver' },
      
      // 社区贡献
      helpful_reviewer: { name: '热心评审', description: '撰写10条评价', icon: '💬', tier: 'bronze' },
      bug_hunter: { name: '漏洞猎人', description: '报告5个有效bug', icon: '🐛', tier: 'silver' },
      
      // 版本维护
      active_maintainer: { name: '活跃维护者', description: '连续更新技能3个月', icon: '🔄', tier: 'silver' },
      long_term_support: { name: '长期支持', description: '技能维护超过1年', icon: '📅', tier: 'gold' }
    };
    
    this.profiles = new Map();
    this.rewards = [];
    
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
      if (fs.existsSync(this.profilesFile)) {
        const data = JSON.parse(fs.readFileSync(this.profilesFile, 'utf8'));
        this.profiles = new Map(Object.entries(data.profiles || {}));
      }
      
      if (fs.existsSync(this.rewardsFile)) {
        const data = JSON.parse(fs.readFileSync(this.rewardsFile, 'utf8'));
        this.rewards = data.rewards || [];
      }
    } catch (error) {
      console.warn('Failed to load reward data:', error.message);
    }
  }

  _saveData() {
    try {
      fs.writeFileSync(this.profilesFile, JSON.stringify({
        profiles: Object.fromEntries(this.profiles),
        lastUpdated: new Date().toISOString()
      }, null, 2));
      
      fs.writeFileSync(this.rewardsFile, JSON.stringify({
        rewards: this.rewards,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.warn('Failed to save reward data:', error.message);
    }
  }

  /**
   * 获取或创建用户档案
   */
  getOrCreateProfile(userId, username) {
    if (!this.profiles.has(userId)) {
      const profile = {
        userId,
        username,
        points: 0,
        level: 1,
        badges: [],
        achievements: [],
        stats: {
          skillsPublished: 0,
          totalDownloads: 0,
          totalRatings: 0,
          reviewsWritten: 0,
          bugsReported: 0
        },
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.profiles.set(userId, profile);
      this._saveData();
    }
    return this.profiles.get(userId);
  }

  /**
   * 添加积分
   */
  addPoints(userId, points, reason, metadata = {}) {
    const profile = this.profiles.get(userId);
    if (!profile) {
      throw new Error(`User not found: ${userId}`);
    }

    profile.points += points;
    profile.updatedAt = new Date().toISOString();
    
    // 记录历史
    profile.history.push({
      type: 'points',
      points,
      reason,
      metadata,
      timestamp: new Date().toISOString()
    });
    
    // 限制历史记录数量
    if (profile.history.length > 100) {
      profile.history = profile.history.slice(-50);
    }
    
    // 更新等级
    profile.level = this._calculateLevel(profile.points);
    
    // 记录奖励
    this.rewards.push({
      userId,
      type: 'points',
      value: points,
      reason,
      timestamp: new Date().toISOString()
    });
    
    this._saveData();
    
    return {
      points: profile.points,
      level: profile.level,
      added: points
    };
  }

  /**
   * 授予徽章
   */
  awardBadge(userId, badgeId) {
    const profile = this.profiles.get(userId);
    if (!profile) {
      throw new Error(`User not found: ${userId}`);
    }

    const badge = this.badges[badgeId];
    if (!badge) {
      throw new Error(`Badge not found: ${badgeId}`);
    }

    // 检查是否已拥有
    if (profile.badges.some(b => b.id === badgeId)) {
      return { awarded: false, reason: 'Already拥有' };
    }

    profile.badges.push({
      id: badgeId,
      ...badge,
      awardedAt: new Date().toISOString()
    });
    
    profile.updatedAt = new Date().toISOString();
    
    // 记录历史
    profile.history.push({
      type: 'badge',
      badgeId,
      badgeName: badge.name,
      timestamp: new Date().toISOString()
    });
    
    // 记录奖励
    this.rewards.push({
      userId,
      type: 'badge',
      badgeId,
      badgeName: badge.name,
      timestamp: new Date().toISOString()
    });
    
    this._saveData();
    
    return { awarded: true, badge };
  }

  /**
   * 计算等级
   */
  _calculateLevel(points) {
    // 等级公式：每1000点升级，等级越高需要越多积分
    if (points < 100) return 1;
    if (points < 300) return 2;
    if (points < 600) return 3;
    if (points < 1000) return 4;
    if (points < 1500) return 5;
    if (points < 2500) return 6;
    if (points < 4000) return 7;
    if (points < 6000) return 8;
    if (points < 10000) return 9;
    return 10;
  }

  /**
   * 检查并授予徽章
   */
  checkAndAwardBadges(userId) {
    const profile = this.profiles.get(userId);
    if (!profile) return [];

    const awarded = [];

    // 检查发布技能徽章
    if (profile.stats.skillsPublished >= 1 && !this._hasBadge(profile, 'first_skill')) {
      const result = this.awardBadge(userId, 'first_skill');
      if (result.awarded) awarded.push(result.badge);
    }
    if (profile.stats.skillsPublished >= 5 && !this._hasBadge(profile, 'skill_5')) {
      const result = this.awardBadge(userId, 'skill_5');
      if (result.awarded) awarded.push(result.badge);
    }
    if (profile.stats.skillsPublished >= 10 && !this._hasBadge(profile, 'skill_10')) {
      const result = this.awardBadge(userId, 'skill_10');
      if (result.awarded) awarded.push(result.badge);
    }
    if (profile.stats.skillsPublished >= 25 && !this._hasBadge(profile, 'skill_25')) {
      const result = this.awardBadge(userId, 'skill_25');
      if (result.awarded) awarded.push(result.badge);
    }

    // 检查下载徽章
    if (profile.stats.totalDownloads >= 100 && !this._hasBadge(profile, 'downloads_100')) {
      const result = this.awardBadge(userId, 'downloads_100');
      if (result.awarded) awarded.push(result.badge);
    }
    if (profile.stats.totalDownloads >= 1000 && !this._hasBadge(profile, 'downloads_1000')) {
      const result = this.awardBadge(userId, 'downloads_1000');
      if (result.awarded) awarded.push(result.badge);
    }
    if (profile.stats.totalDownloads >= 10000 && !this._hasBadge(profile, 'downloads_10000')) {
      const result = this.awardBadge(userId, 'downloads_10000');
      if (result.awarded) awarded.push(result.badge);
    }

    return awarded;
  }

  _hasBadge(profile, badgeId) {
    return profile.badges.some(b => b.id === badgeId);
  }

  /**
   * 记录技能发布
   */
  recordSkillPublished(userId, username) {
    const profile = this.getOrCreateProfile(userId, username);
    profile.stats.skillsPublished++;
    profile.updatedAt = new Date().toISOString();
    this._saveData();
    
    // 添加积分
    this.addPoints(userId, this.pointRules.skillPublished, 'skill_published');
    
    // 检查徽章
    return this.checkAndAwardBadges(userId);
  }

  /**
   * 记录下载
   */
  recordDownload(userId, skillAuthorId, skillAuthorName) {
    // 为下载者添加积分
    this.addPoints(userId, 1, 'skill_downloaded');
    
    // 为作者添加积分
    if (skillAuthorId) {
      const authorProfile = this.getOrCreateProfile(skillAuthorId, skillAuthorName);
      authorProfile.stats.totalDownloads++;
      authorProfile.updatedAt = new Date().toISOString();
      this._saveData();
      
      this.addPoints(skillAuthorId, this.pointRules.skillDownloaded, 'skill_downloaded_by_others');
      this.checkAndAwardBadges(skillAuthorId);
    }
  }

  /**
   * 记录评分
   */
  recordRating(userId, skillAuthorId, skillAuthorName) {
    this.addPoints(userId, this.pointRules.skillRated, 'rated_skill');
    
    if (skillAuthorId) {
      const authorProfile = this.getOrCreateProfile(skillAuthorId, skillAuthorName);
      authorProfile.stats.totalRatings++;
      authorProfile.updatedAt = new Date().toISOString();
      this._saveData();
    }
  }

  /**
   * 获取用户档案
   */
  getProfile(userId) {
    return this.profiles.get(userId) || null;
  }

  /**
   * 获取排行榜
   */
  getLeaderboard(options = {}) {
    const { sortBy = 'points', limit = 20 } = options;
    
    let profiles = Array.from(this.profiles.values());
    
    profiles.sort((a, b) => {
      if (sortBy === 'points') return b.points - a.points;
      if (sortBy === 'skills') return b.stats.skillsPublished - a.stats.skillsPublished;
      if (sortBy === 'downloads') return b.stats.totalDownloads - a.stats.totalDownloads;
      return b.points - a.points;
    });
    
    return profiles.slice(0, limit).map((p, index) => ({
      rank: index + 1,
      userId: p.userId,
      username: p.username,
      points: p.points,
      level: p.level,
      badges: p.badges.length,
      skills: p.stats.skillsPublished
    }));
  }

  /**
   * 获取徽章列表
   */
  getBadges() {
    return Object.entries(this.badges).map(([id, badge]) => ({
      id,
      ...badge
    }));
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const profiles = Array.from(this.profiles.values());
    
    return {
      totalUsers: profiles.length,
      totalPointsAwarded: this.rewards.filter(r => r.type === 'points').length,
      totalBadgesAwarded: this.rewards.filter(r => r.type === 'badge').length,
      topUsers: this.getLeaderboard({ limit: 5 }),
      recentRewards: this.rewards.slice(-10).reverse()
    };
  }

  /**
   * 获取等级信息
   */
  getLevelInfo(level) {
    const levels = {
      1: { title: '新手', minPoints: 0 },
      2: { title: '学徒', minPoints: 100 },
      3: { title: '熟练者', minPoints: 300 },
      4: { title: '专家', minPoints: 600 },
      5: { title: '大师', minPoints: 1000 },
      6: { title: '宗师', minPoints: 1500 },
      7: { title: '泰斗', minPoints: 2500 },
      8: { title: '传奇', minPoints: 4000 },
      9: { title: '神话', minPoints: 6000 },
      10: { title: '至高', minPoints: 10000 }
    };
    
    return levels[level] || levels[1];
  }
}

module.exports = { RewardSystem };
