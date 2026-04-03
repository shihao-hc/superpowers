/**
 * Skill Bundle System
 * 允许用户将多个技能打包为"技能组合"，一键安装
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SkillBundle {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'bundles');
    this.bundlesFile = path.join(this.dataDir, 'bundles.json');
    
    this.bundles = new Map();
    
    this._ensureDataDir();
    this._loadData();
    this._initDefaultBundles();
  }

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadData() {
    try {
      if (fs.existsSync(this.bundlesFile)) {
        const data = JSON.parse(fs.readFileSync(this.bundlesFile, 'utf8'));
        this.bundles = new Map(Object.entries(data.bundles || {}));
      }
    } catch (error) {
      console.warn('Failed to load bundles:', error.message);
    }
  }

  _saveData() {
    try {
      const data = {
        bundles: Object.fromEntries(this.bundles),
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.bundlesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save bundles:', error.message);
    }
  }

  /**
   * 初始化默认技能组合
   */
  _initDefaultBundles() {
    if (this.bundles.size > 0) return;

    const defaultBundles = [
      {
        id: 'document-processing',
        name: '文档处理套件',
        description: '包含PDF、Word、Excel等文档处理相关技能',
        category: 'document',
        icon: '📄',
        skills: [
          { skillId: 'pdf-generator', version: '1.0.0', required: true },
          { skillId: 'docx-parser', version: '1.2.0', required: true },
          { skillId: 'excel-export', version: '1.0.0', required: false },
          { skillId: 'markdown-converter', version: '1.1.0', required: false }
        ],
        author: 'system',
        downloads: 1250,
        rating: 4.5,
        tags: ['文档', 'PDF', 'Word', 'Excel'],
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-03-01T00:00:00Z'
      },
      {
        id: 'ai-integration',
        name: 'AI集成工具包',
        description: 'AI模型调用、文本生成、图像处理等技能集合',
        category: 'ai',
        icon: '🤖',
        skills: [
          { skillId: 'text-generator', version: '2.0.0', required: true },
          { skillId: 'image-analyzer', version: '1.5.0', required: true },
          { skillId: 'translation', version: '1.3.0', required: false },
          { skillId: 'summarization', version: '1.2.0', required: false },
          { skillId: 'sentiment-analysis', version: '1.0.0', required: false }
        ],
        author: 'system',
        downloads: 2100,
        rating: 4.8,
        tags: ['AI', '文本', '图像', 'NLP'],
        createdAt: '2024-01-20T00:00:00Z',
        updatedAt: '2024-03-05T00:00:00Z'
      },
      {
        id: 'data-analytics',
        name: '数据分析套件',
        description: '数据处理、统计分析、可视化相关技能',
        category: 'data',
        icon: '📊',
        skills: [
          { skillId: 'csv-parser', version: '1.0.0', required: true },
          { skillId: 'data-cleaner', version: '1.1.0', required: true },
          { skillId: 'statistics', version: '1.0.0', required: true },
          { skillId: 'chart-generator', version: '1.2.0', required: false },
          { skillId: 'report-builder', version: '1.0.0', required: false }
        ],
        author: 'system',
        downloads: 890,
        rating: 4.3,
        tags: ['数据', '分析', '可视化', '统计'],
        createdAt: '2024-02-01T00:00:00Z',
        updatedAt: '2024-02-28T00:00:00Z'
      },
      {
        id: 'web-scraping',
        name: '网络爬虫工具包',
        description: '网页抓取、数据提取、内容解析技能集合',
        category: 'web',
        icon: '🕷️',
        skills: [
          { skillId: 'html-fetcher', version: '1.2.0', required: true },
          { skillId: 'html-parser', version: '1.1.0', required: true },
          { skillId: 'data-extractor', version: '1.0.0', required: true },
          { skillId: 'proxy-manager', version: '1.0.0', required: false }
        ],
        author: 'system',
        downloads: 650,
        rating: 4.0,
        tags: ['爬虫', '网页', '数据提取'],
        createdAt: '2024-02-10T00:00:00Z',
        updatedAt: '2024-03-10T00:00:00Z'
      }
    ];

    for (const bundle of defaultBundles) {
      this.bundles.set(bundle.id, bundle);
    }

    this._saveData();
  }

  /**
   * 生成Bundle ID
   */
  _generateBundleId(name, author) {
    const base = `${author}-${name}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const hash = crypto.randomBytes(4).toString('hex');
    return `${base}-${hash}`;
  }

  /**
   * 创建技能组合
   */
  createBundle(bundleData) {
    const {
      name,
      description = '',
      category = 'general',
      icon = '📦',
      skills = [],
      author = 'anonymous',
      tags = [],
      isPublic = true
    } = bundleData;

    if (!name) {
      throw new Error('Bundle name is required');
    }

    if (!Array.isArray(skills) || skills.length === 0) {
      throw new Error('At least one skill is required');
    }

    const bundleId = this._generateBundleId(name, author);
    const now = new Date().toISOString();

    const bundle = {
      id: bundleId,
      name,
      description,
      category,
      icon,
      skills: skills.map(s => ({
        skillId: s.skillId,
        version: s.version || '*',
        required: s.required !== false
      })),
      author,
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      tags,
      isPublic,
      createdAt: now,
      updatedAt: now,
      status: 'active'
    };

    this.bundles.set(bundleId, bundle);
    this._saveData();

    return bundle;
  }

  /**
   * 获取技能组合
   */
  getBundle(bundleId) {
    return this.bundles.get(bundleId) || null;
  }

  /**
   * 更新技能组合
   */
  updateBundle(bundleId, updates) {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundleId}`);
    }

    const updatedBundle = {
      ...bundle,
      ...updates,
      id: bundleId,
      updatedAt: new Date().toISOString()
    };

    this.bundles.set(bundleId, updatedBundle);
    this._saveData();

    return updatedBundle;
  }

  /**
   * 删除技能组合
   */
  deleteBundle(bundleId) {
    if (!this.bundles.has(bundleId)) {
      throw new Error(`Bundle not found: ${bundleId}`);
    }

    this.bundles.delete(bundleId);
    this._saveData();

    return { deleted: true };
  }

  /**
   * 列出技能组合
   */
  listBundles(options = {}) {
    const { category, author, search, tags, limit = 50, offset = 0 } = options;
    
    let bundles = Array.from(this.bundles.values());
    
    // 只显示公开的组合
    bundles = bundles.filter(b => b.isPublic);
    
    // 分类过滤
    if (category) {
      bundles = bundles.filter(b => b.category === category);
    }
    
    // 作者过滤
    if (author) {
      bundles = bundles.filter(b => b.author === author);
    }
    
    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase();
      bundles = bundles.filter(b => 
        b.name.toLowerCase().includes(searchLower) ||
        b.description.toLowerCase().includes(searchLower) ||
        b.tags.some(t => t.toLowerCase().includes(searchLower))
      );
    }
    
    // 标签过滤
    if (tags && tags.length > 0) {
      bundles = bundles.filter(b => 
        tags.some(tag => b.tags.includes(tag))
      );
    }
    
    // 排序（按下载量）
    bundles.sort((a, b) => b.downloads - a.downloads);
    
    // 分页
    const total = bundles.length;
    const paginatedBundles = bundles.slice(offset, offset + limit);
    
    return {
      bundles: paginatedBundles,
      total,
      limit,
      offset
    };
  }

  /**
   * 记录下载
   */
  recordDownload(bundleId) {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundleId}`);
    }

    bundle.downloads = (bundle.downloads || 0) + 1;
    bundle.updatedAt = new Date().toISOString();
    
    this.bundles.set(bundleId, bundle);
    this._saveData();

    return { downloads: bundle.downloads };
  }

  /**
   * 添加评分
   */
  addRating(bundleId, rating, reviewer = 'anonymous') {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundleId}`);
    }

    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // 更新平均评分
    const currentCount = bundle.ratingCount || 0;
    const currentRating = bundle.rating || 0;
    const newCount = currentCount + 1;
    const newRating = (currentRating * currentCount + rating) / newCount;

    bundle.rating = Math.round(newRating * 10) / 10;
    bundle.ratingCount = newCount;
    bundle.updatedAt = new Date().toISOString();
    
    this.bundles.set(bundleId, bundle);
    this._saveData();

    return { 
      rating: bundle.rating, 
      ratingCount: bundle.ratingCount 
    };
  }

  /**
   * 验证组合中的技能是否存在
   */
  async validateBundle(bundleData, skillManager) {
    const { skills = [] } = bundleData;
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      missingSkills: []
    };

    for (const skillRef of skills) {
      const skill = skillManager.getSkillInfo ? 
        skillManager.getSkillInfo(skillRef.skillId) : null;
      
      if (!skill) {
        results.missingSkills.push(skillRef.skillId);
        results.errors.push(`Skill not found: ${skillRef.skillId}`);
        results.valid = false;
      } else if (skillRef.version && skill.version !== skillRef.version) {
        results.warnings.push(
          `Version mismatch for ${skillRef.skillId}: requested ${skillRef.version}, found ${skill.version}`
        );
      }
    }

    return results;
  }

  /**
   * 获取组合安装信息
   */
  getBundleInstallInfo(bundleId, skillManager) {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) {
      throw new Error(`Bundle not found: ${bundleId}`);
    }

    const installInfo = {
      bundle,
      skills: [],
      totalSkills: bundle.skills.length,
      requiredSkills: bundle.skills.filter(s => s.required).length,
      optionalSkills: bundle.skills.filter(s => !s.required).length
    };

    for (const skillRef of bundle.skills) {
      const skill = skillManager.getSkillInfo ? 
        skillManager.getSkillInfo(skillRef.skillId) : null;
      
      installInfo.skills.push({
        skillId: skillRef.skillId,
        version: skillRef.version,
        required: skillRef.required,
        available: !!skill,
        currentVersion: skill?.version || null
      });
    }

    return installInfo;
  }

  /**
   * 获取分类列表
   */
  getCategories() {
    const categories = new Map();
    
    for (const bundle of this.bundles.values()) {
      if (!bundle.isPublic) continue;
      
      const cat = bundle.category || 'general';
      if (!categories.has(cat)) {
        categories.set(cat, { id: cat, name: cat, count: 0 });
      }
      categories.get(cat).count++;
    }
    
    return Array.from(categories.values());
  }

  /**
   * 获取推荐组合
   */
  getRecommendedBundles(limit = 5) {
    return Array.from(this.bundles.values())
      .filter(b => b.isPublic)
      .sort((a, b) => {
        // 综合评分：下载量 * 0.4 + 评分 * 0.6
        const scoreA = (a.downloads || 0) * 0.4 + (a.rating || 0) * 20 * 0.6;
        const scoreB = (b.downloads || 0) * 0.4 + (b.rating || 0) * 20 * 0.6;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const bundles = Array.from(this.bundles.values());
    const publicBundles = bundles.filter(b => b.isPublic);
    
    const totalDownloads = publicBundles.reduce((sum, b) => sum + (b.downloads || 0), 0);
    const avgRating = publicBundles.length > 0
      ? publicBundles.reduce((sum, b) => sum + (b.rating || 0), 0) / publicBundles.length
      : 0;

    return {
      totalBundles: bundles.length,
      publicBundles: publicBundles.length,
      totalDownloads,
      averageRating: Math.round(avgRating * 10) / 10,
      categories: this.getCategories().length
    };
  }
}

module.exports = { SkillBundle };
