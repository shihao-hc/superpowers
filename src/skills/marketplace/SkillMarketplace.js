const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SkillMarketplace {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'marketplace');
    this.skillsFile = path.join(this.dataDir, 'skills.json');
    this.reviewsFile = path.join(this.dataDir, 'reviews.json');
    this.statsFile = path.join(this.dataDir, 'stats.json');
    
    this.skills = new Map();
    this.reviews = new Map();
    this.stats = new Map();
    
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
      if (fs.existsSync(this.skillsFile)) {
        const skillsData = JSON.parse(fs.readFileSync(this.skillsFile, 'utf8'));
        this.skills = new Map(Object.entries(skillsData));
      }
      
      if (fs.existsSync(this.reviewsFile)) {
        const reviewsData = JSON.parse(fs.readFileSync(this.reviewsFile, 'utf8'));
        this.reviews = new Map(Object.entries(reviewsData));
      }
      
      if (fs.existsSync(this.statsFile)) {
        const statsData = JSON.parse(fs.readFileSync(this.statsFile, 'utf8'));
        this.stats = new Map(Object.entries(statsData));
      }
    } catch (error) {
      console.warn('Failed to load marketplace data:', error.message);
    }
  }

  _saveData() {
    try {
      fs.writeFileSync(this.skillsFile, JSON.stringify(Object.fromEntries(this.skills), null, 2));
      fs.writeFileSync(this.reviewsFile, JSON.stringify(Object.fromEntries(this.reviews), null, 2));
      fs.writeFileSync(this.statsFile, JSON.stringify(Object.fromEntries(this.stats), null, 2));
    } catch (error) {
      console.warn('Failed to save marketplace data:', error.message);
    }
  }

  /**
   * Publish a skill to the marketplace
   * @param {Object} skillInfo - Skill information
   * @returns {Promise<Object>} Published skill data
   */
  async publishSkill(skillInfo) {
    const { 
      name, 
      description, 
      version = '1.0.0',
      author = 'Anonymous',
      category = 'General',
      riskLevel = 'low',
      pure = false,
      dependencies = [],
      license = 'MIT',
      repository = null,
      keywords = []
    } = skillInfo;

    if (!name) {
      throw new Error('Skill name is required');
    }

    const skillId = this._generateSkillId(name, author);
    const now = new Date().toISOString();

    const skill = {
      id: skillId,
      name,
      description,
      version,
      author,
      category,
      riskLevel,
      pure,
      dependencies,
      license,
      repository,
      keywords,
      publishedAt: now,
      updatedAt: now,
      status: 'published', // published, deprecated, archived
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      verified: false,
      featured: false
    };

    this.skills.set(skillId, skill);
    
    // Initialize stats
    this.stats.set(skillId, {
      downloads: 0,
      uniqueDownloaders: 0,
      lastDownload: null,
      rating: 0,
      ratingCount: 0,
      viewCount: 0,
      lastView: null
    });

    // Initialize reviews
    this.reviews.set(skillId, []);

    this._saveData();
    
    return skill;
  }

  /**
   * Update a skill in the marketplace
   * @param {string} skillId - Skill ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated skill data
   */
  async updateSkill(skillId, updates) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const now = new Date().toISOString();
    const updatedSkill = {
      ...skill,
      ...updates,
      updatedAt: now
    };

    // If version changed, update version history
    if (updates.version && updates.version !== skill.version) {
      updatedSkill.versionHistory = skill.versionHistory || [];
      updatedSkill.versionHistory.push({
        version: skill.version,
        updatedAt: now,
        changes: updates.changelog || 'No changelog provided'
      });
    }

    this.skills.set(skillId, updatedSkill);
    this._saveData();
    
    return updatedSkill;
  }

  /**
   * Get a skill from the marketplace
   * @param {string} skillId - Skill ID
   * @returns {Object|null} Skill data
   */
  getSkill(skillId) {
    return this.skills.get(skillId) || null;
  }

  /**
   * List skills in the marketplace
   * @param {Object} options - List options
   * @returns {Array} List of skills
   */
  listSkills(options = {}) {
    const { 
      category, 
      author, 
      status = 'published',
      sortBy = 'updatedAt',
      sortOrder = 'desc',
      limit = 50,
      offset = 0,
      search = ''
    } = options;

    let skills = Array.from(this.skills.values());

    // Filter by status
    if (status) {
      skills = skills.filter(skill => skill.status === status);
    }

    // Filter by category
    if (category) {
      skills = skills.filter(skill => skill.category === category);
    }

    // Filter by author
    if (author) {
      skills = skills.filter(skill => skill.author === author);
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      skills = skills.filter(skill => 
        skill.name.toLowerCase().includes(searchLower) ||
        skill.description.toLowerCase().includes(searchLower) ||
        skill.keywords.some(kw => kw.toLowerCase().includes(searchLower))
      );
    }

    // Sort
    skills.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (sortBy === 'downloads' || sortBy === 'rating' || sortBy === 'ratingCount') {
        aVal = aVal || 0;
        bVal = bVal || 0;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Pagination
    const total = skills.length;
    const paginatedSkills = skills.slice(offset, offset + limit);

    return {
      skills: paginatedSkills,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  /**
   * Add a review to a skill
   * @param {string} skillId - Skill ID
   * @param {Object} review - Review data
   * @returns {Promise<Object>} Created review
   */
  async addReview(skillId, review) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const { rating, title, content, reviewer = 'Anonymous' } = review;
    
    if (!rating || rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const reviewId = crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    const newReview = {
      id: reviewId,
      skillId,
      rating,
      title,
      content,
      reviewer,
      createdAt: now,
      updatedAt: now,
      helpful: 0,
      reported: false
    };

    // Add review
    const skillReviews = this.reviews.get(skillId) || [];
    skillReviews.push(newReview);
    this.reviews.set(skillId, skillReviews);

    // Update skill rating
    const totalRating = skillReviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRating / skillReviews.length;
    
    skill.rating = Math.round(averageRating * 10) / 10;
    skill.ratingCount = skillReviews.length;
    skill.updatedAt = now;
    this.skills.set(skillId, skill);

    // Update stats
    const stats = this.stats.get(skillId) || {};
    stats.rating = skill.rating;
    stats.ratingCount = skill.ratingCount;
    this.stats.set(skillId, stats);

    this._saveData();
    
    return newReview;
  }

  /**
   * Get reviews for a skill
   * @param {string} skillId - Skill ID
   * @param {Object} options - Options
   * @returns {Array} Reviews
   */
  getReviews(skillId, options = {}) {
    const { limit = 20, offset = 0, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    
    const reviews = this.reviews.get(skillId) || [];
    
    // Sort
    const sortedReviews = [...reviews].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

    // Paginate
    const total = sortedReviews.length;
    const paginatedReviews = sortedReviews.slice(offset, offset + limit);

    return {
      reviews: paginatedReviews,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  /**
   * Record a download
   * @param {string} skillId - Skill ID
   * @param {string} downloader - Downloader identifier
   * @returns {Promise<void>}
   */
  async recordDownload(skillId, downloader = 'anonymous') {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // Update skill download count
    skill.downloads = (skill.downloads || 0) + 1;
    skill.updatedAt = new Date().toISOString();
    this.skills.set(skillId, skill);

    // Update stats
    const stats = this.stats.get(skillId) || {
      downloads: 0,
      uniqueDownloaders: 0,
      lastDownload: null,
      rating: 0,
      ratingCount: 0,
      viewCount: 0,
      lastView: null
    };
    
    stats.downloads = (stats.downloads || 0) + 1;
    stats.lastDownload = new Date().toISOString();
    
    // Track unique downloaders
    if (!stats.downloaders) {
      stats.downloaders = new Set();
    }
    if (!stats.downloaders.has(downloader)) {
      stats.downloaders.add(downloader);
      stats.uniqueDownloaders = stats.downloaders.size;
    }
    
    this.stats.set(skillId, stats);
    this._saveData();
  }

  /**
   * Record a view
   * @param {string} skillId - Skill ID
   * @returns {Promise<void>}
   */
  async recordView(skillId) {
    const stats = this.stats.get(skillId) || {
      downloads: 0,
      uniqueDownloaders: 0,
      lastDownload: null,
      rating: 0,
      ratingCount: 0,
      viewCount: 0,
      lastView: null
    };
    
    stats.viewCount = (stats.viewCount || 0) + 1;
    stats.lastView = new Date().toISOString();
    
    this.stats.set(skillId, stats);
    this._saveData();
  }

  /**
   * Get skill statistics
   * @param {string} skillId - Skill ID
   * @returns {Object} Statistics
   */
  getStats(skillId) {
    const stats = this.stats.get(skillId) || {};
    const skill = this.skills.get(skillId);
    
    return {
      ...stats,
      skillId,
      name: skill ? skill.name : null,
      version: skill ? skill.version : null
    };
  }

  /**
   * Search skills
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} Search results
   */
  searchSkills(query, options = {}) {
    return this.listSkills({ ...options, search: query });
  }

  /**
   * Get featured skills
   * @param {number} limit - Number of skills to return
   * @returns {Array} Featured skills
   */
  getFeaturedSkills(limit = 10) {
    const featured = Array.from(this.skills.values())
      .filter(skill => skill.featured && skill.status === 'published')
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
    
    return featured;
  }

  /**
   * Get popular skills
   * @param {number} limit - Number of skills to return
   * @returns {Array} Popular skills
   */
  getPopularSkills(limit = 10) {
    const popular = Array.from(this.skills.values())
      .filter(skill => skill.status === 'published')
      .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
      .slice(0, limit);
    
    return popular;
  }

  /**
   * Get categories
   * @returns {Array} Categories with counts
   */
  getCategories() {
    const categories = {};
    
    for (const skill of this.skills.values()) {
      if (skill.status === 'published') {
        categories[skill.category] = (categories[skill.category] || 0) + 1;
      }
    }
    
    return Object.entries(categories).map(([name, count]) => ({ name, count }));
  }

  /**
   * Deprecate a skill
   * @param {string} skillId - Skill ID
   * @param {string} reason - Deprecation reason
   * @returns {Promise<Object>} Updated skill
   */
  async deprecateSkill(skillId, reason = '') {
    return this.updateSkill(skillId, {
      status: 'deprecated',
      deprecationReason: reason,
      deprecatedAt: new Date().toISOString()
    });
  }

  /**
   * Archive a skill
   * @param {string} skillId - Skill ID
   * @returns {Promise<Object>} Updated skill
   */
  async archiveSkill(skillId) {
    return this.updateSkill(skillId, {
      status: 'archived',
      archivedAt: new Date().toISOString()
    });
  }

  /**
   * Generate skill ID - 使用SHA-256替代MD5
   */
  _generateSkillId(name, author) {
    const base = `${author}-${name}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const hash = crypto.createHash('sha256').update(`${name}-${author}-${Date.now()}`).digest('hex').substring(0, 12);
    return `${base}-${hash}`;
  }

  /**
   * Get marketplace statistics
   * @returns {Object} Marketplace stats
   */
  getMarketplaceStats() {
    const skills = Array.from(this.skills.values());
    const published = skills.filter(s => s.status === 'published');
    
    return {
      totalSkills: skills.length,
      publishedSkills: published.length,
      totalDownloads: published.reduce((sum, s) => sum + (s.downloads || 0), 0),
      totalReviews: Array.from(this.reviews.values()).reduce((sum, reviews) => sum + reviews.length, 0),
      averageRating: published.length > 0 ? 
        published.reduce((sum, s) => sum + (s.rating || 0), 0) / published.length : 0,
      categories: this.getCategories().length,
      authors: [...new Set(published.map(s => s.author))].length
    };
  }
}

module.exports = { SkillMarketplace };