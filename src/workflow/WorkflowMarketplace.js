const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MCP_WORKFLOW_TEMPLATES = [
  {
    name: '日志监控告警流水线',
    description: '监控仓库 Issue → 读取本地日志 → AI分析 → 生成报告并上链存证',
    category: 'devops',
    tags: ['日志', '监控', 'GitHub', 'MCP', '自动化'],
    author: 'UltraWork MCP',
    version: '1.0.0',
    mcpNodes: [
      { type: 'mcp.filesystem.read_file', label: '读取日志' },
      { type: 'mcp.sequential-thinking.think', label: 'AI分析' },
      { type: 'mcp.github.create_issue', label: '创建Issue' },
      { type: 'mcp.filesystem.write_file', label: '保存报告' }
    ],
    file: 'examples/workflows/mcp-log-monitor.json'
  },
  {
    name: 'GitHub监控报表',
    description: '监控仓库Issue状态 → 生成统计报表 → 保存到本地',
    category: 'devops',
    tags: ['GitHub', '监控', '报表', 'MCP'],
    author: 'UltraWork MCP',
    version: '1.0.0',
    mcpNodes: [
      { type: 'mcp.github.search_repositories', label: '搜索仓库' },
      { type: 'mcp.github.list_issues', label: '获取Issues' },
      { type: 'mcp.sequential-thinking.think', label: '趋势分析' },
      { type: 'mcp.filesystem.write_file', label: '保存报告' }
    ],
    file: 'examples/workflows/mcp-github-monitor.json'
  },
  {
    name: '跨平台智能搜索报告',
    description: 'Brave搜索 → 读取本地数据 → AI分析 → 生成综合报告',
    category: 'research',
    tags: ['搜索', '研究', '报告', '跨平台', 'MCP'],
    author: 'UltraWork MCP',
    version: '1.0.0',
    mcpNodes: [
      { type: 'mcp.brave-search.search', label: '网络搜索' },
      { type: 'mcp.filesystem.read_file', label: '读取本地数据' },
      { type: 'mcp.sequential-thinking.think', label: '深度分析' },
      { type: 'mcp.filesystem.write_file', label: '保存报告' }
    ],
    file: 'examples/workflows/mcp-cross-platform.json'
  },
  {
    name: '代码审查助手',
    description: '自动审查代码变更，生成审查意见并提交',
    category: 'development',
    tags: ['代码审查', 'GitHub', 'MCP', '自动化'],
    author: 'UltraWork MCP',
    version: '1.0.0',
    mcpNodes: [
      { type: 'mcp.github.get_pull_request', label: '获取PR信息' },
      { type: 'mcp.filesystem.read_file', label: '读取代码文件' },
      { type: 'mcp.sequential-thinking.think', label: '代码分析' },
      { type: 'mcp.github.create_review_comment', label: '添加审查意见' }
    ]
  }
];

class WorkflowMarketplace {
  constructor(options = {}) {
    this.workflows = new Map();
    this.plugins = new Map();
    this.downloads = new Map();
    this.ratings = new Map();
    this.versions = new Map();
    this.versionHistory = new Map();
    this.maxWorkflows = options.maxWorkflows || 1000;
    this.mcpTemplates = new Map();
    
    this._loadMCPTemplates();
  }

  _parseVersion(version) {
    const parts = version.split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
      raw: version
    };
  }

  _compareVersions(v1, v2) {
    const a = this._parseVersion(v1);
    const b = this._parseVersion(v2);
    
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
  }

  _bumpVersion(version, type) {
    const v = this._parseVersion(version);
    switch (type) {
      case 'major': v.major++; v.minor = 0; v.patch = 0; break;
      case 'minor': v.minor++; v.patch = 0; break;
      case 'patch': v.patch++; break;
    }
    return `${v.major}.${v.minor}.${v.patch}`;
  }

  publishVersion(workflowId, config) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { error: 'Workflow not found' };

    const newVersion = config.version || this._bumpVersion(workflow.version, 'patch');
    const changelog = config.changelog || 'No changelog provided';

    if (!this.versionHistory.has(workflowId)) {
      this.versionHistory.set(workflowId, []);
    }

    const history = this.versionHistory.get(workflowId);
    history.push({
      version: workflow.version,
      publishedAt: workflow.updatedAt,
      nodes: [...workflow.nodes],
      connections: [...workflow.connections]
    });

    workflow.version = newVersion;
    workflow.nodes = config.nodes || workflow.nodes;
    workflow.connections = config.connections || workflow.connections;
    workflow.updatedAt = Date.now();
    workflow.changelog = changelog;

    this.versions.get(workflowId).push({
      version: newVersion,
      publishedAt: Date.now(),
      changelog,
      author: config.author || workflow.author
    });

    return { 
      success: true, 
      workflowId,
      previousVersion: history[history.length - 1]?.version,
      newVersion 
    };
  }

  getVersionHistory(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { error: 'Workflow not found' };

    const history = this.versionHistory.get(workflowId) || [];
    const versions = this.versions.get(workflowId) || [];

    return {
      currentVersion: workflow.version,
      history: history.map((h, i) => ({
        version: h.version,
        publishedAt: new Date(h.publishedAt).toISOString(),
        isCurrent: h.version === workflow.version
      })),
      changelog: versions.map(v => ({
        version: v.version,
        changelog: v.changelog,
        publishedAt: new Date(v.publishedAt).toISOString(),
        author: v.author
      }))
    };
  }

  getLatestVersion(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;
    return workflow.version;
  }

  listVersions(workflowId) {
    const versions = this.versions.get(workflowId) || [];
    return versions.map(v => ({
      version: v.version,
      publishedAt: new Date(v.publishedAt).toISOString(),
      changelog: v.changelog,
      author: v.author,
      isCurrent: this.workflows.get(workflowId)?.version === v.version
    }));
  }

  rollbackToVersion(workflowId, version) {
    const workflow = this.workflows.get(workflowId);
    const history = this.versionHistory.get(workflowId);
    
    if (!workflow || !history) {
      return { error: 'Workflow or version history not found' };
    }

    const targetEntry = history.find(h => h.version === version);
    if (!targetEntry) {
      return { error: `Version ${version} not found in history` };
    }

    history.push({
      version: workflow.version,
      publishedAt: Date.now(),
      nodes: [...workflow.nodes],
      connections: [...workflow.connections],
      note: `Rollback from ${workflow.version}`
    });

    workflow.nodes = targetEntry.nodes;
    workflow.connections = targetEntry.connections;
    workflow.updatedAt = Date.now();

    return { 
      success: true, 
      workflowId,
      rolledBackTo: version,
      currentVersion: workflow.version
    };
  }

  getOutdatedWorkflows(currentMarketplaceVersions) {
    const outdated = [];
    
    for (const [id, workflow] of this.workflows) {
      if (currentMarketplaceVersions && currentMarketplaceVersions[id]) {
        const latest = currentMarketplaceVersions[id].version;
        if (this._compareVersions(workflow.version, latest) < 0) {
          outdated.push({
            id,
            name: workflow.name,
            currentVersion: workflow.version,
            latestVersion: latest,
            needsUpdate: true
          });
        }
      }
    }
    
    return outdated;
  }

  _loadMCPTemplates() {
    for (const template of MCP_WORKFLOW_TEMPLATES) {
      let workflowData = null;
      
      if (template.file) {
        try {
          const filePath = path.resolve(process.cwd(), template.file);
          if (fs.existsSync(filePath)) {
            workflowData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          }
        } catch (e) {
          console.warn(`[Marketplace] Failed to load MCP template: ${template.name}`);
        }
      }
      
      this.mcpTemplates.set(template.name, {
        ...template,
        workflowData,
        isMCP: true
      });
    }
  }

  publishWorkflow(config) {
    if (!config.name || typeof config.name !== 'string') {
      return { error: 'name required' };
    }

    const sanitize = (s) => typeof s === 'string'
      ? s.replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c]))
      : s;

    const workflowId = `wf_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const workflow = {
      id: workflowId,
      name: sanitize(config.name).substring(0, 100),
      description: sanitize(config.description || '').substring(0, 500),
      category: sanitize(config.category || 'general').substring(0, 50),
      tags: Array.isArray(config.tags) ? config.tags.slice(0, 10).map(t => sanitize(t).substring(0, 30)) : [],
      author: sanitize(config.author || 'anonymous').substring(0, 50),
      version: config.version || '1.0.0',
      nodes: config.nodes || [],
      connections: config.connections || [],
      preview: config.preview || null,
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      reviews: [],
      status: 'published',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (this.workflows.size >= this.maxWorkflows) {
      return { error: 'Marketplace full' };
    }

    this.workflows.set(workflowId, workflow);

    if (!this.versions.has(workflowId)) {
      this.versions.set(workflowId, []);
    }
    this.versions.get(workflowId).push({
      version: workflow.version,
      publishedAt: Date.now()
    });

    return { id: workflowId, workflow };
  }

  updateWorkflow(workflowId, config) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { error: 'Workflow not found' };

    if (config.name) workflow.name = config.name;
    if (config.description) workflow.description = config.description;
    if (config.nodes) workflow.nodes = config.nodes;
    if (config.connections) workflow.connections = config.connections;
    if (config.version) {
      workflow.version = config.version;
      workflow.updatedAt = Date.now();

      const versions = this.versions.get(workflowId) || [];
      versions.push({ version: config.version, publishedAt: Date.now() });
      this.versions.set(workflowId, versions);
    }

    return { id: workflowId, workflow };
  }

  downloadWorkflow(workflowId, userId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { error: 'Workflow not found' };

    workflow.downloads++;

    if (!this.downloads.has(userId)) {
      this.downloads.set(userId, []);
    }
    this.downloads.get(userId).push({
      workflowId,
      downloadedAt: Date.now()
    });

    return {
      workflow: {
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        version: workflow.version
      }
    };
  }

  rateWorkflow(workflowId, userId, rating, review = '') {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { error: 'Workflow not found' };

    rating = Math.max(1, Math.min(5, rating));

    const existing = workflow.reviews.findIndex(r => r.userId === userId);
    if (existing > -1) {
      workflow.reviews[existing] = { userId, rating, review, date: Date.now() };
    } else {
      workflow.reviews.push({ userId, rating, review, date: Date.now() });
      workflow.ratingCount++;
    }

    workflow.rating = workflow.reviews.reduce((sum, r) => sum + r.rating, 0) / workflow.reviews.length;

    return { rating: workflow.rating, reviewCount: workflow.reviews.length };
  }

  searchWorkflows(query = {}) {
    let results = Array.from(this.workflows.values());

    if (query.category) {
      results = results.filter(w => w.category === query.category);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(w =>
        query.tags.some(tag => w.tags.includes(tag))
      );
    }

    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter(w =>
        w.name.toLowerCase().includes(kw) ||
        w.description.toLowerCase().includes(kw) ||
        w.tags.some(t => t.toLowerCase().includes(kw))
      );
    }

    if (query.minRating) {
      results = results.filter(w => w.rating >= query.minRating);
    }

    if (query.author) {
      results = results.filter(w => w.author === query.author);
    }

    switch (query.sortBy) {
      case 'downloads':
        results.sort((a, b) => b.downloads - a.downloads);
        break;
      case 'rating':
        results.sort((a, b) => b.rating - a.rating);
        break;
      case 'newest':
        results.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'updated':
        results.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      default:
        results.sort((a, b) => b.downloads - a.downloads);
    }

    return results.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      category: w.category,
      tags: w.tags,
      author: w.author,
      version: w.version,
      downloads: w.downloads,
      rating: w.rating,
      ratingCount: w.ratingCount,
      createdAt: w.createdAt
    }));
  }

  registerPlugin(config) {
    const pluginId = `plugin_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const plugin = {
      id: pluginId,
      name: config.name,
      description: config.description || '',
      author: config.author || 'anonymous',
      version: config.version || '1.0.0',
      nodeTypes: config.nodeTypes || [],
      dependencies: config.dependencies || [],
      downloads: 0,
      status: 'active',
      createdAt: Date.now()
    };

    this.plugins.set(pluginId, plugin);
    return { id: pluginId, plugin };
  }

  installPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return { error: 'Plugin not found' };

    plugin.downloads++;
    return { success: true, plugin: { ...plugin } };
  }

  searchPlugins(query = {}) {
    let results = Array.from(this.plugins.values());

    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter(p =>
        p.name.toLowerCase().includes(kw) ||
        p.description.toLowerCase().includes(kw)
      );
    }

    return results.sort((a, b) => b.downloads - a.downloads);
  }

  getWorkflow(workflowId) {
    return this.workflows.get(workflowId);
  }

  getWorkflowVersions(workflowId) {
    return this.versions.get(workflowId) || [];
  }

  getPlugin(pluginId) {
    return this.plugins.get(pluginId);
  }

  getUserDownloads(userId) {
    return this.downloads.get(userId) || [];
  }

  getStats() {
    const workflows = Array.from(this.workflows.values());
    const plugins = Array.from(this.plugins.values());

    return {
      workflows: {
        total: workflows.length,
        totalDownloads: workflows.reduce((sum, w) => sum + w.downloads, 0),
        avgRating: workflows.length > 0
          ? (workflows.reduce((sum, w) => sum + w.rating, 0) / workflows.length).toFixed(2)
          : '0'
      },
      plugins: {
        total: plugins.length,
        totalDownloads: plugins.reduce((sum, p) => sum + p.downloads, 0)
      }
    };
  }

  toJSON() {
    return {
      workflows: Array.from(this.workflows.values()),
      plugins: Array.from(this.plugins.values()),
      mcpTemplates: Array.from(this.mcpTemplates.values()).map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
        tags: t.tags,
        author: t.author,
        version: t.version,
        mcpNodes: t.mcpNodes,
        isMCP: t.isMCP
      }))
    };
  }

  getMCPTemplates(options = {}) {
    let templates = Array.from(this.mcpTemplates.values());
    
    if (options.category) {
      templates = templates.filter(t => t.category === options.category);
    }
    
    if (options.tag) {
      templates = templates.filter(t => t.tags.includes(options.tag));
    }
    
    if (options.search) {
      const search = options.search.toLowerCase();
      templates = templates.filter(t => 
        t.name.toLowerCase().includes(search) ||
        t.description.toLowerCase().includes(search) ||
        t.tags.some(tag => tag.toLowerCase().includes(search))
      );
    }
    
    return templates.map(t => ({
      name: t.name,
      description: t.description,
      category: t.category,
      tags: t.tags,
      author: t.author,
      version: t.version,
      mcpNodes: t.mcpNodes,
      isMCP: t.isMCP,
      hasFile: !!t.workflowData
    }));
  }

  installMCPTemplate(templateName, targetPath = 'workflows/') {
    const template = this.mcpTemplates.get(templateName);
    if (!template) {
      return { error: 'MCP template not found' };
    }
    
    if (!template.workflowData) {
      return { error: 'Template file not available' };
    }
    
    try {
      const outputPath = path.resolve(process.cwd(), targetPath, `${template.name.replace(/\s+/g, '_').toLowerCase()}.json`);
      const dir = path.dirname(outputPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, JSON.stringify(template.workflowData, null, 2));
      
      const workflowId = this.publishWorkflow({
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        author: template.author,
        version: template.version,
        nodes: template.workflowData.nodes,
        connections: template.workflowData.connections
      });
      
      return { 
        success: true, 
        workflowId,
        outputPath,
        message: `Template installed to ${outputPath}`
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  installAllMCPTemplates(targetPath = 'workflows/') {
    const results = [];
    
    for (const [name, template] of this.mcpTemplates) {
      const result = this.installMCPTemplate(name, targetPath);
      results.push({ name, ...result });
    }
    
    return {
      total: this.mcpTemplates.size,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => r.error).length,
      results
    };
  }

  destroy() {
    this.workflows.clear();
    this.plugins.clear();
    this.downloads.clear();
    this.ratings.clear();
    this.versions.clear();
  }
}

module.exports = { WorkflowMarketplace };
