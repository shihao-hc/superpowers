/**
 * Skill Marketplace
 * 技能市场 - 技能发布、发现、评分
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sanitizeFilename } = require('../utils/SafePath');

class SkillListing {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.version = data.version || '1.0.0';
    this.author = data.author;
    this.category = data.category || 'general';
    this.tags = data.tags || [];
    this.price = data.price || 0;
    this.downloads = data.downloads || 0;
    this.rating = data.rating || 0;
    this.ratingCount = data.ratingCount || 0;
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    this.verified = data.verified || false;
    this.featured = data.featured || false;
    this.files = data.files || [];
    this.dependencies = data.dependencies || [];
    this.metadata = data.metadata || {};
  }
}

class SkillMarketplace {
  constructor(options = {}) {
    this.options = {
      storageDir: options.storageDir || './marketplace',
      featuredWeight: options.featuredWeight || 2,
      ratingWeight: options.ratingWeight || 3,
      downloadsWeight: options.downloadsWeight || 1,
      ...options
    };

    this.listings = new Map();
    this.reviews = new Map();
    this.categories = new Set();
    this.tags = new Set();

    this.ensureStorage();
    this.load();
  }

  ensureStorage() {
    const dirs = ['skills', 'reviews', 'temp'];
    for (const dir of dirs) {
      const dirPath = path.join(this.options.storageDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  /**
   * 发布技能
   */
  publish(skillData) {
    const id = this.generateId();

    const listing = new SkillListing({
      id,
      ...skillData,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    this.listings.set(id, listing);

    // 更新分类和标签
    this.categories.add(listing.category);
    listing.tags.forEach((tag) => this.tags.add(tag));

    // 保存到文件
    this.saveListing(listing);

    return listing;
  }

  /**
   * 更新技能
   */
  update(id, updates) {
    const listing = this.listings.get(id);
    if (!listing) {return null;}

    Object.assign(listing, updates, { updatedAt: Date.now() });
    this.saveListing(listing);

    return listing;
  }

  /**
   * 获取技能详情
   */
  get(id) {
    return this.listings.get(id) || null;
  }

  /**
   * 搜索技能
   */
  search(query, options = {}) {
    const {
      category = null,
      tags = [],
      minRating = 0,
      maxPrice = Infinity,
      sortBy = 'relevance',
      limit = 20
    } = options;

    let results = Array.from(this.listings.values());

    // 文本搜索
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter((skill) =>
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery) ||
        skill.tags.some((t) => t.toLowerCase().includes(lowerQuery))
      );
    }

    // 过滤
    if (category) {
      results = results.filter((skill) => skill.category === category);
    }

    if (tags.length > 0) {
      results = results.filter((skill) =>
        tags.some((tag) => skill.tags.includes(tag))
      );
    }

    if (minRating > 0) {
      results = results.filter((skill) => skill.rating >= minRating);
    }

    if (maxPrice < Infinity) {
      results = results.filter((skill) => skill.price <= maxPrice);
    }

    // 排序
    switch (sortBy) {
    case 'rating':
      results.sort((a, b) => b.rating - a.rating);
      break;
    case 'downloads':
      results.sort((a, b) => b.downloads - a.downloads);
      break;
    case 'price_low':
      results.sort((a, b) => a.price - b.price);
      break;
    case 'price_high':
      results.sort((a, b) => b.price - a.price);
      break;
    case 'newest':
      results.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case 'relevance':
    default:
      results = this.sortByRelevance(results, query);
    }

    return results.slice(0, limit);
  }

  /**
   * 按相关性排序
   */
  sortByRelevance(skills, query) {
    return skills.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      const lowerQuery = query.toLowerCase();

      // 名称匹配
      if (a.name.toLowerCase().includes(lowerQuery)) {scoreA += 10;}
      if (b.name.toLowerCase().includes(lowerQuery)) {scoreB += 10;}

      // 标签匹配
      if (a.tags.some((t) => t.toLowerCase().includes(lowerQuery))) {scoreA += 5;}
      if (b.tags.some((t) => t.toLowerCase().includes(lowerQuery))) {scoreB += 5;}

      // 加权评分
      scoreA += a.rating * this.options.ratingWeight;
      scoreB += b.rating * this.options.ratingWeight;

      // 下载量
      scoreA += Math.log(a.downloads + 1) * this.options.downloadsWeight;
      scoreB += Math.log(b.downloads + 1) * this.options.downloadsWeight;

      // 精选
      if (a.featured) {scoreA *= this.options.featuredWeight;}
      if (b.featured) {scoreB *= this.options.featuredWeight;}

      return scoreB - scoreA;
    });
  }

  /**
   * 获取精选技能
   */
  getFeatured(limit = 10) {
    return Array.from(this.listings.values())
      .filter((skill) => skill.featured)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }

  /**
   * 获取分类技能
   */
  getByCategory(category, limit = 20) {
    return Array.from(this.listings.values())
      .filter((skill) => skill.category === category)
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  /**
   * 获取热门技能
   */
  getPopular(limit = 20) {
    return Array.from(this.listings.values())
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  /**
   * 添加评分
   */
  addReview(listingId, review) {
    const listing = this.listings.get(listingId);
    if (!listing) {return null;}

    const reviewId = this.generateId();

    const reviewData = {
      id: reviewId,
      listingId,
      rating: review.rating,
      title: review.title,
      content: review.content,
      author: review.author,
      createdAt: Date.now()
    };

    this.reviews.set(reviewId, reviewData);

    // 更新技能评分
    const listingReviews = this.getListingReviews(listingId);
    const avgRating = listingReviews.reduce((sum, r) => sum + r.rating, 0) / listingReviews.length;

    listing.rating = Math.round(avgRating * 10) / 10;
    listing.ratingCount = listingReviews.length;

    this.saveListing(listing);

    return reviewData;
  }

  /**
   * 获取技能的所有评论
   */
  getListingReviews(listingId) {
    return Array.from(this.reviews.values())
      .filter((r) => r.listingId === listingId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 下载技能
   */
  download(id) {
    const listing = this.listings.get(id);
    if (!listing) {return null;}

    listing.downloads++;
    this.saveListing(listing);

    return {
      id: listing.id,
      name: listing.name,
      version: listing.version,
      files: listing.files
    };
  }

  /**
   * 删除技能
   */
  remove(id) {
    return this.listings.delete(id);
  }

  /**
   * 获取统计数据
   */
  getStats() {
    const listings = Array.from(this.listings.values());

    return {
      totalSkills: listings.length,
      totalDownloads: listings.reduce((sum, l) => sum + l.downloads, 0),
      categories: this.categories.size,
      tags: this.tags.size,
      avgRating: listings.length > 0
        ? listings.reduce((sum, l) => sum + l.rating, 0) / listings.length
        : 0,
      byCategory: this.getCategoryStats()
    };
  }

  /**
   * 获取分类统计
   */
  getCategoryStats() {
    const stats = {};

    for (const listing of this.listings.values()) {
      if (!stats[listing.category]) {
        stats[listing.category] = { count: 0, downloads: 0, avgRating: 0 };
      }
      stats[listing.category].count++;
      stats[listing.category].downloads += listing.downloads;
      stats[listing.category].avgRating += listing.rating;
    }

    for (const category of Object.keys(stats)) {
      const count = stats[category].count;
      stats[category].avgRating = count > 0
        ? Math.round(stats[category].avgRating / count * 10) / 10
        : 0;
    }

    return stats;
  }

  /**
   * 保存技能到文件
   */
  saveListing(listing) {
    const filePath = path.join(this.options.storageDir, 'skills', `${sanitizeFilename(listing.id || 'unknown')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(listing, null, 2));
  }

  /**
   * 从文件加载
   */
  load() {
    const skillsDir = path.join(this.options.storageDir, 'skills');

    if (!fs.existsSync(skillsDir)) {return;}

    const files = fs.readdirSync(skillsDir);

    for (const file of files) {
      if (!file.endsWith('.json')) {continue;}

      try {
        const content = fs.readFileSync(path.join(skillsDir, file), 'utf-8');
        const listing = new SkillListing(JSON.parse(content));
        this.listings.set(listing.id, listing);
        this.categories.add(listing.category);
        listing.tags.forEach((tag) => this.tags.add(tag));
      } catch (error) {
        console.error(`Failed to load skill ${file}:`, error.message);
      }
    }
  }

  /**
   * 生成ID
   */
  generateId() {
    return `skill_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 获取所有分类
   */
  getCategories() {
    return Array.from(this.categories).sort();
  }

  /**
   * 获取所有标签
   */
  getTags() {
    return Array.from(this.tags).sort();
  }
}

module.exports = { SkillMarketplace, SkillListing };
