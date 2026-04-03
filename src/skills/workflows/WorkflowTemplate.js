/**
 * Workflow Template System
 * 在市场中提供基于技能的工作流模板，降低使用门槛
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class WorkflowTemplate {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'workflows');
    this.templatesFile = path.join(this.dataDir, 'templates.json');
    
    this.templates = new Map();
    
    this._ensureDataDir();
    this._loadData();
    this._initDefaultTemplates();
  }

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadData() {
    try {
      if (fs.existsSync(this.templatesFile)) {
        const data = JSON.parse(fs.readFileSync(this.templatesFile, 'utf8'));
        this.templates = new Map(Object.entries(data.templates || {}));
      }
    } catch (error) {
      console.warn('Failed to load workflow templates:', error.message);
    }
  }

  _saveData() {
    try {
      const data = {
        templates: Object.fromEntries(this.templates),
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.templatesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save workflow templates:', error.message);
    }
  }

  /**
   * 初始化默认工作流模板
   */
  _initDefaultTemplates() {
    if (this.templates.size > 0) return;

    const defaultTemplates = [
      {
        id: 'weekly-report-workflow',
        name: '自动生成周报',
        description: '自动收集本周工作数据，生成格式化周报',
        category: 'productivity',
        icon: '📝',
        difficulty: 'beginner',
        estimatedTime: '5分钟',
        skills: [
          { skillId: 'data-collector', action: 'collect' },
          { skillId: 'text-generator', action: 'generate' },
          { skillId: 'pdf-generator', action: 'export' }
        ],
        nodes: [
          {
            id: 'start',
            type: 'trigger',
            name: '每周五触发',
            config: { schedule: '0 17 * * 5' }
          },
          {
            id: 'collect',
            type: 'skill',
            skillId: 'data-collector',
            name: '收集工作数据',
            config: { source: 'git,issues,tasks' },
            inputs: { dateRange: '{{weekRange}}' }
          },
          {
            id: 'generate',
            type: 'skill',
            skillId: 'text-generator',
            name: '生成周报文本',
            config: { template: 'weekly-report' },
            inputs: { data: '{{collect.output}}' }
          },
          {
            id: 'export',
            type: 'skill',
            skillId: 'pdf-generator',
            name: '导出PDF',
            config: { format: 'pdf' },
            inputs: { content: '{{generate.output}}' }
          },
          {
            id: 'notify',
            type: 'action',
            name: '发送通知',
            config: { channel: 'email' },
            inputs: { file: '{{export.output}}' }
          }
        ],
        connections: [
          { from: 'start', to: 'collect' },
          { from: 'collect', to: 'generate' },
          { from: 'generate', to: 'export' },
          { from: 'export', to: 'notify' }
        ],
        variables: [
          { name: 'weekRange', type: 'date-range', default: 'last-week' },
          { name: 'recipients', type: 'string', default: 'team@company.com' }
        ],
        author: 'system',
        downloads: 520,
        rating: 4.6,
        tags: ['周报', '自动化', '生产力'],
        createdAt: '2024-01-10T00:00:00Z',
        updatedAt: '2024-03-01T00:00:00Z'
      },
      {
        id: 'data-pipeline-workflow',
        name: '数据处理管道',
        description: '从多种数据源提取、转换、加载数据',
        category: 'data',
        icon: '🔄',
        difficulty: 'intermediate',
        estimatedTime: '15分钟',
        skills: [
          { skillId: 'csv-parser', action: 'parse' },
          { skillId: 'data-cleaner', action: 'clean' },
          { skillId: 'statistics', action: 'analyze' },
          { skillId: 'chart-generator', action: 'visualize' }
        ],
        nodes: [
          {
            id: 'input',
            type: 'input',
            name: '数据输入',
            config: { type: 'file', format: 'csv' }
          },
          {
            id: 'parse',
            type: 'skill',
            skillId: 'csv-parser',
            name: '解析CSV'
          },
          {
            id: 'clean',
            type: 'skill',
            skillId: 'data-cleaner',
            name: '数据清洗',
            config: { operations: ['remove-null', 'deduplicate'] }
          },
          {
            id: 'analyze',
            type: 'skill',
            skillId: 'statistics',
            name: '统计分析',
            config: { metrics: ['mean', 'median', 'stddev'] }
          },
          {
            id: 'visualize',
            type: 'skill',
            skillId: 'chart-generator',
            name: '生成图表',
            config: { types: ['bar', 'line', 'pie'] }
          },
          {
            id: 'output',
            type: 'output',
            name: '输出结果',
            config: { formats: ['html', 'pdf', 'json'] }
          }
        ],
        connections: [
          { from: 'input', to: 'parse' },
          { from: 'parse', to: 'clean' },
          { from: 'clean', to: 'analyze' },
          { from: 'analyze', to: 'visualize' },
          { from: 'visualize', to: 'output' }
        ],
        variables: [
          { name: 'inputFile', type: 'file', accept: '.csv' },
          { name: 'outputFormat', type: 'select', options: ['html', 'pdf', 'json'] }
        ],
        author: 'system',
        downloads: 380,
        rating: 4.4,
        tags: ['数据', 'ETL', '分析', '可视化'],
        createdAt: '2024-01-25T00:00:00Z',
        updatedAt: '2024-02-20T00:00:00Z'
      },
      {
        id: 'content-generation-workflow',
        name: '内容生成流水线',
        description: '基于主题自动生成文章、配图、发布',
        category: 'content',
        icon: '✍️',
        difficulty: 'intermediate',
        estimatedTime: '10分钟',
        skills: [
          { skillId: 'text-generator', action: 'write' },
          { skillId: 'image-generator', action: 'illustrate' },
          { skillId: 'seo-optimizer', action: 'optimize' },
          { skillId: 'markdown-converter', action: 'format' }
        ],
        nodes: [
          {
            id: 'topic',
            type: 'input',
            name: '输入主题',
            config: { type: 'text' }
          },
          {
            id: 'outline',
            type: 'skill',
            skillId: 'text-generator',
            name: '生成大纲',
            config: { mode: 'outline' }
          },
          {
            id: 'write',
            type: 'skill',
            skillId: 'text-generator',
            name: '撰写文章',
            config: { mode: 'article', length: 'medium' }
          },
          {
            id: 'image',
            type: 'skill',
            skillId: 'image-generator',
            name: '生成配图',
            config: { style: 'modern' }
          },
          {
            id: 'seo',
            type: 'skill',
            skillId: 'seo-optimizer',
            name: 'SEO优化'
          },
          {
            id: 'format',
            type: 'skill',
            skillId: 'markdown-converter',
            name: '格式化输出'
          }
        ],
        connections: [
          { from: 'topic', to: 'outline' },
          { from: 'outline', to: 'write' },
          { from: 'write', to: 'image' },
          { from: 'image', to: 'seo' },
          { from: 'seo', to: 'format' }
        ],
        variables: [
          { name: 'topic', type: 'text', required: true },
          { name: 'tone', type: 'select', options: ['professional', 'casual', 'technical'] },
          { name: 'length', type: 'select', options: ['short', 'medium', 'long'] }
        ],
        author: 'system',
        downloads: 290,
        rating: 4.2,
        tags: ['内容', '写作', 'AI', 'SEO'],
        createdAt: '2024-02-05T00:00:00Z',
        updatedAt: '2024-03-05T00:00:00Z'
      },
      {
        id: 'document-conversion-workflow',
        name: '文档格式转换',
        description: '在多种文档格式之间自动转换',
        category: 'document',
        icon: '🔄',
        difficulty: 'beginner',
        estimatedTime: '2分钟',
        skills: [
          { skillId: 'docx-parser', action: 'read' },
          { skillId: 'pdf-generator', action: 'convert' },
          { skillId: 'markdown-converter', action: 'format' }
        ],
        nodes: [
          {
            id: 'input',
            type: 'input',
            name: '选择文件',
            config: { accept: '.docx,.pdf,.md,.html' }
          },
          {
            id: 'detect',
            type: 'logic',
            name: '检测格式',
            config: { type: 'condition' }
          },
          {
            id: 'convert',
            type: 'skill',
            skillId: 'pdf-generator',
            name: '转换格式'
          },
          {
            id: 'output',
            type: 'output',
            name: '下载文件'
          }
        ],
        connections: [
          { from: 'input', to: 'detect' },
          { from: 'detect', to: 'convert' },
          { from: 'convert', to: 'output' }
        ],
        variables: [
          { name: 'inputFile', type: 'file', required: true },
          { name: 'outputFormat', type: 'select', options: ['pdf', 'html', 'markdown'] }
        ],
        author: 'system',
        downloads: 450,
        rating: 4.5,
        tags: ['文档', '转换', '格式'],
        createdAt: '2024-02-15T00:00:00Z',
        updatedAt: '2024-02-28T00:00:00Z'
      }
    ];

    for (const template of defaultTemplates) {
      this.templates.set(template.id, template);
    }

    this._saveData();
  }

  /**
   * 生成模板ID
   */
  _generateTemplateId(name, author) {
    const base = `${author}-${name}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const hash = crypto.randomBytes(4).toString('hex');
    return `${base}-${hash}`;
  }

  /**
   * 创建工作流模板
   */
  createTemplate(templateData) {
    const {
      name,
      description = '',
      category = 'general',
      icon = '⚡',
      difficulty = 'beginner',
      estimatedTime = '5分钟',
      skills = [],
      nodes = [],
      connections = [],
      variables = [],
      author = 'anonymous',
      tags = [],
      isPublic = true
    } = templateData;

    if (!name) {
      throw new Error('Template name is required');
    }

    const templateId = this._generateTemplateId(name, author);
    const now = new Date().toISOString();

    const template = {
      id: templateId,
      name,
      description,
      category,
      icon,
      difficulty,
      estimatedTime,
      skills,
      nodes,
      connections,
      variables,
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

    this.templates.set(templateId, template);
    this._saveData();

    return template;
  }

  /**
   * 获取工作流模板
   */
  getTemplate(templateId) {
    return this.templates.get(templateId) || null;
  }

  /**
   * 更新工作流模板
   */
  updateTemplate(templateId, updates) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const updatedTemplate = {
      ...template,
      ...updates,
      id: templateId,
      updatedAt: new Date().toISOString()
    };

    this.templates.set(templateId, updatedTemplate);
    this._saveData();

    return updatedTemplate;
  }

  /**
   * 删除工作流模板
   */
  deleteTemplate(templateId) {
    if (!this.templates.has(templateId)) {
      throw new Error(`Template not found: ${templateId}`);
    }

    this.templates.delete(templateId);
    this._saveData();

    return { deleted: true };
  }

  /**
   * 列出工作流模板
   */
  listTemplates(options = {}) {
    const { category, difficulty, author, search, skills, limit = 50, offset = 0 } = options;
    
    let templates = Array.from(this.templates.values());
    
    // 只显示公开的模板
    templates = templates.filter(t => t.isPublic);
    
    // 分类过滤
    if (category) {
      templates = templates.filter(t => t.category === category);
    }
    
    // 难度过滤
    if (difficulty) {
      templates = templates.filter(t => t.difficulty === difficulty);
    }
    
    // 作者过滤
    if (author) {
      templates = templates.filter(t => t.author === author);
    }
    
    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase();
      templates = templates.filter(t => 
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    
    // 技能过滤
    if (skills && skills.length > 0) {
      templates = templates.filter(t => 
        skills.some(skillId => 
          t.skills.some(s => s.skillId === skillId)
        )
      );
    }
    
    // 排序（按评分和下载量）
    templates.sort((a, b) => {
      const scoreA = (a.rating || 0) * 20 + (a.downloads || 0) * 0.1;
      const scoreB = (b.rating || 0) * 20 + (b.downloads || 0) * 0.1;
      return scoreB - scoreA;
    });
    
    // 分页
    const total = templates.length;
    const paginatedTemplates = templates.slice(offset, offset + limit);
    
    return {
      templates: paginatedTemplates,
      total,
      limit,
      offset
    };
  }

  /**
   * 记录下载
   */
  recordDownload(templateId) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    template.downloads = (template.downloads || 0) + 1;
    template.updatedAt = new Date().toISOString();
    
    this.templates.set(templateId, template);
    this._saveData();

    return { downloads: template.downloads };
  }

  /**
   * 添加评分
   */
  addRating(templateId, rating, reviewer = 'anonymous') {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const currentCount = template.ratingCount || 0;
    const currentRating = template.rating || 0;
    const newCount = currentCount + 1;
    const newRating = (currentRating * currentCount + rating) / newCount;

    template.rating = Math.round(newRating * 10) / 10;
    template.ratingCount = newCount;
    template.updatedAt = new Date().toISOString();
    
    this.templates.set(templateId, template);
    this._saveData();

    return { 
      rating: template.rating, 
      ratingCount: template.ratingCount 
    };
  }

  /**
   * 导出工作流模板
   */
  exportTemplate(templateId) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return {
      format: 'ultrawork-workflow',
      version: '1.0.0',
      template: {
        ...template,
        exportedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 导入工作流模板
   */
  importTemplate(templateData, options = {}) {
    const { overwrite = false, author = 'imported' } = options;
    
    if (templateData.format !== 'ultrawork-workflow') {
      throw new Error('Invalid template format');
    }

    const template = templateData.template;
    
    // 检查是否已存在
    if (this.templates.has(template.id) && !overwrite) {
      throw new Error(`Template already exists: ${template.id}`);
    }

    // 更新元数据
    template.author = author;
    template.importedAt = new Date().toISOString();
    template.updatedAt = new Date().toISOString();
    template.downloads = 0;
    template.rating = 0;
    template.ratingCount = 0;

    this.templates.set(template.id, template);
    this._saveData();

    return template;
  }

  /**
   * 获取分类列表
   */
  getCategories() {
    const categories = new Map();
    
    for (const template of this.templates.values()) {
      if (!template.isPublic) continue;
      
      const cat = template.category || 'general';
      if (!categories.has(cat)) {
        categories.set(cat, { id: cat, name: cat, count: 0 });
      }
      categories.get(cat).count++;
    }
    
    return Array.from(categories.values());
  }

  /**
   * 获取推荐模板
   */
  getRecommendedTemplates(limit = 5) {
    return Array.from(this.templates.values())
      .filter(t => t.isPublic)
      .sort((a, b) => {
        const scoreA = (a.rating || 0) * 20 + (a.downloads || 0) * 0.1;
        const scoreB = (b.rating || 0) * 20 + (b.downloads || 0) * 0.1;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const templates = Array.from(this.templates.values());
    const publicTemplates = templates.filter(t => t.isPublic);
    
    const totalDownloads = publicTemplates.reduce((sum, t) => sum + (t.downloads || 0), 0);
    const avgRating = publicTemplates.length > 0
      ? publicTemplates.reduce((sum, t) => sum + (t.rating || 0), 0) / publicTemplates.length
      : 0;

    return {
      totalTemplates: templates.length,
      publicTemplates: publicTemplates.length,
      totalDownloads,
      averageRating: Math.round(avgRating * 10) / 10,
      categories: this.getCategories().length
    };
  }

  /**
   * 生成工作流可视化配置
   */
  generateVisualization(templateId) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const nodes = template.nodes.map((node, index) => ({
      ...node,
      position: this._calculateNodePosition(index, template.nodes.length)
    }));

    return {
      nodes,
      edges: template.connections.map(conn => ({
        id: `${conn.from}-${conn.to}`,
        source: conn.from,
        target: conn.to,
        type: 'smoothstep'
      })),
      viewport: { x: 0, y: 0, zoom: 1 }
    };
  }

  /**
   * 计算节点位置（简单的自动布局）
   */
  _calculateNodePosition(index, total) {
    const nodeWidth = 200;
    const nodeHeight = 100;
    const gap = 50;
    
    // 水平排列
    return {
      x: index * (nodeWidth + gap),
      y: 100
    };
  }
}

module.exports = { WorkflowTemplate };
