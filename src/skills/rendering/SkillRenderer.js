/**
 * Skill Renderer System
 * Consolidated skill for preview and template rendering
 * Combines SkillPreview and SkillTemplates functionality
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * HTML转义函数 - 防止XSS
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * 路径安全验证 - 防止路径遍历
 */
function isPathSafe(basePath, targetPath) {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

/**
 * 验证对象是否包含原型污染尝试
 */
function isPrototypePollutionSafe(obj) {
  if (typeof obj !== 'object' || obj === null) return true;
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(obj)) {
    if (dangerousKeys.includes(key)) return false;
  }
  return true;
}

class SkillRenderer {
  constructor(options = {}) {
    this.previewDir = options.previewDir || path.join(process.cwd(), 'data', 'previews');
    this.templatesDir = options.templatesDir || path.join(process.cwd(), 'data', 'templates');
    this.maxPreviewSize = options.maxPreviewSize || 10 * 1024 * 1024;
    this.cacheTTL = options.cacheTTL || 3600000;
    
    this.previewCache = new Map();
    this.templates = new Map();
    this.categories = new Map();
    
    this.supportedFormats = {
      image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
      html: ['html', 'htm'],
      markdown: ['md', 'markdown'],
      text: ['txt', 'json', 'xml', 'yaml', 'yml', 'csv'],
      pdf: ['pdf'],
      code: ['js', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'ts']
    };
    
    this._ensureDirs();
    this._loadTemplates();
    this._initDefaultTemplates();
    this._startAutoCleanup();
  }

  _ensureDirs() {
    if (!fs.existsSync(this.previewDir)) {
      fs.mkdirSync(this.previewDir, { recursive: true });
    }
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  _startAutoCleanup() {
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpiredCache();
    }, 3600000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  _cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, cached] of this.previewCache.entries()) {
      if (now - cached.timestamp >= this.cacheTTL) {
        this.previewCache.delete(key);
      }
    }
  }

  // ============ Preview Methods ============

  getPreviewType(filename) {
    const ext = path.extname(filename).toLowerCase().slice(1);
    for (const [type, extensions] of Object.entries(this.supportedFormats)) {
      if (extensions.includes(ext)) return type;
    }
    return 'unknown';
  }

  _generatePreviewId(content, filename) {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    hash.update(filename);
    return hash.digest('hex').slice(0, 32);
  }

  createImagePreview(buffer, filename, options = {}) {
    if (buffer.length > this.maxPreviewSize) {
      throw new Error(`File size exceeds maximum limit: ${this.maxPreviewSize} bytes`);
    }
    const previewId = this._generatePreviewId(buffer.toString('base64'), filename);
    const ext = path.extname(filename).toLowerCase();
    const safeExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
    if (!safeExtensions.includes(ext)) {
      throw new Error(`Invalid image extension: ${ext}`);
    }
    const previewPath = path.join(this.previewDir, `${previewId}${ext}`);
    if (!isPathSafe(this.previewDir, previewPath)) {
      throw new Error('Invalid preview path');
    }
    fs.writeFileSync(previewPath, buffer);
    return {
      id: previewId,
      type: 'image',
      format: ext.slice(1),
      path: previewPath,
      url: `/api/skills/preview/${previewId}`,
      size: buffer.length,
      createdAt: new Date().toISOString()
    };
  }

  createHTMLPreview(content, filename, options = {}) {
    const previewId = this._generatePreviewId(content, filename);
    const sanitizedHTML = this._sanitizeHTML(content);
    const wrappedHTML = this._wrapHTMLForPreview(sanitizedHTML, options);
    const previewPath = path.join(this.previewDir, `${previewId}.html`);
    fs.writeFileSync(previewPath, wrappedHTML, 'utf8');
    return {
      id: previewId,
      type: 'html',
      format: 'html',
      path: previewPath,
      url: `/api/skills/preview/${previewId}`,
      iframeUrl: `/api/skills/preview/${previewId}/iframe`,
      size: Buffer.byteLength(wrappedHTML),
      createdAt: new Date().toISOString()
    };
  }

  createMarkdownPreview(content, filename, options = {}) {
    const previewId = this._generatePreviewId(content, filename);
    const htmlContent = this._markdownToHTML(content);
    return this.createHTMLPreview(htmlContent, filename.replace(/\.md$/, '.html'), options);
  }

  createTextPreview(content, filename, options = {}) {
    const previewId = this._generatePreviewId(content, filename);
    const highlightedContent = this._highlightSyntax(content, filename);
    const safeFilename = escapeHtml(filename);
    const wrappedHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>预览: ${safeFilename}</title>
  <style>
    body { font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; background: #1e1e1e; color: #d4d4d4; padding: 20px; margin: 0; line-height: 1.5; }
    .line-numbers { color: #858585; text-align: right; padding-right: 10px; user-select: none; }
    .content { white-space: pre-wrap; word-break: break-all; }
    .filename { color: #569cd6; margin-bottom: 15px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="filename">${safeFilename}</div>
  <div class="content">${highlightedContent}</div>
</body>
</html>`;
    const previewPath = path.join(this.previewDir, `${previewId}.html`);
    fs.writeFileSync(previewPath, wrappedHTML, 'utf8');
    return {
      id: previewId,
      type: 'text',
      format: path.extname(filename).slice(1),
      path: previewPath,
      url: `/api/skills/preview/${previewId}`,
      size: Buffer.byteLength(content),
      createdAt: new Date().toISOString()
    };
  }

  createPDFPreview(buffer, filename, options = {}) {
    const previewId = this._generatePreviewId(buffer.toString('base64'), filename);
    const previewPath = path.join(this.previewDir, `${previewId}.pdf`);
    fs.writeFileSync(previewPath, buffer);
    const viewerHTML = this._createPDFViewer(previewId);
    const viewerPath = path.join(this.previewDir, `${previewId}_viewer.html`);
    fs.writeFileSync(viewerPath, viewerHTML, 'utf8');
    return {
      id: previewId,
      type: 'pdf',
      format: 'pdf',
      path: previewPath,
      viewerPath: viewerPath,
      url: `/api/skills/preview/${previewId}`,
      pdfUrl: `/api/skills/preview/${previewId}/raw`,
      size: buffer.length,
      createdAt: new Date().toISOString()
    };
  }

  createPreview(data, filename, options = {}) {
    const previewType = this.getPreviewType(filename);
    switch (previewType) {
      case 'image':
        return this.createImagePreview(Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64'), filename, options);
      case 'html':
        return this.createHTMLPreview(typeof data === 'string' ? data : data.toString(), filename, options);
      case 'markdown':
        return this.createMarkdownPreview(typeof data === 'string' ? data : data.toString(), filename, options);
      case 'text':
      case 'code':
        return this.createTextPreview(typeof data === 'string' ? data : data.toString(), filename, options);
      case 'pdf':
        return this.createPDFPreview(Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64'), filename, options);
      default:
        return this.createTextPreview(typeof data === 'string' ? data : data.toString(), filename, options);
    }
  }

  getPreview(previewId) {
    if (!previewId || !/^[a-zA-Z0-9]+$/.test(previewId)) {
      return null;
    }
    const cached = this.previewCache.get(previewId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.preview;
    }
    const files = fs.readdirSync(this.previewDir);
    const previewFile = files.find(f => f.startsWith(previewId));
    if (!previewFile) return null;
    const filePath = path.join(this.previewDir, previewFile);
    if (!isPathSafe(this.previewDir, filePath)) {
      console.warn('Path traversal attempt detected:', previewId);
      return null;
    }
    const stats = fs.statSync(filePath);
    const preview = {
      id: previewId,
      path: filePath,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString()
    };
    this.previewCache.set(previewId, { preview, timestamp: Date.now() });
    return preview;
  }

  deletePreview(previewId) {
    if (!previewId || !/^[a-zA-Z0-9]+$/.test(previewId)) {
      throw new Error('Invalid preview ID');
    }
    const files = fs.readdirSync(this.previewDir);
    const previewFiles = files.filter(f => f.startsWith(previewId));
    for (const file of previewFiles) {
      const filePath = path.join(this.previewDir, file);
      if (!isPathSafe(this.previewDir, filePath)) {
        console.warn('Path traversal attempt in delete:', previewId);
        continue;
      }
      fs.unlinkSync(filePath);
    }
    this.previewCache.delete(previewId);
    return { deleted: previewFiles.length };
  }

  cleanupExpiredPreviews(maxAge = 86400000) {
    const now = Date.now();
    const files = fs.readdirSync(this.previewDir);
    let deletedCount = 0;
    for (const file of files) {
      const filePath = path.join(this.previewDir, file);
      if (!isPathSafe(this.previewDir, filePath)) continue;
      const stats = fs.statSync(filePath);
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    this._cleanupExpiredCache();
    return { deleted: deletedCount };
  }

  // ============ Template Methods ============

  _loadTemplates() {
    const templatesFile = path.join(this.templatesDir, 'templates.json');
    try {
      if (fs.existsSync(templatesFile)) {
        const data = JSON.parse(fs.readFileSync(templatesFile, 'utf8'));
        this.templates = new Map(Object.entries(data.templates || {}));
        this.categories = new Map(Object.entries(data.categories || {}));
      }
    } catch (error) {
      console.warn('Failed to load templates:', error.message);
    }
  }

  _saveTemplates() {
    const templatesFile = path.join(this.templatesDir, 'templates.json');
    try {
      const data = {
        templates: Object.fromEntries(this.templates),
        categories: Object.fromEntries(this.categories),
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(templatesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save templates:', error.message);
    }
  }

  _initDefaultTemplates() {
    if (this.templates.size > 0) return;
    const defaultTemplates = [
      {
        id: 'weekly-report',
        name: '周报',
        description: '标准工作周报模板',
        category: 'report',
        type: 'markdown',
        tags: ['工作', '周报', '汇报'],
        fields: [
          { name: 'week', label: '周次', type: 'text', required: true },
          { name: 'author', label: '姓名', type: 'text', required: true },
          { name: 'completedTasks', label: '本周完成', type: 'textarea', required: true },
          { name: 'nextWeekPlan', label: '下周计划', type: 'textarea', required: true }
        ],
        template: `# 工作周报\n\n## 基本信息\n- **周次**: {{week}}\n- **姓名**: {{author}}\n\n## 本周完成工作\n{{completedTasks}}\n\n## 下周工作计划\n{{nextWeekPlan}}\n\n---\n*报告生成时间: {{generatedAt}}*`
      },
      {
        id: 'meeting-minutes',
        name: '会议纪要',
        description: '标准会议纪要模板',
        category: 'report',
        type: 'markdown',
        tags: ['会议', '纪要', '记录'],
        fields: [
          { name: 'title', label: '会议主题', type: 'text', required: true },
          { name: 'date', label: '会议日期', type: 'date', required: true },
          { name: 'attendees', label: '参会人员', type: 'textarea', required: true },
          { name: 'decisions', label: '决议事项', type: 'textarea', required: true }
        ],
        template: `# 会议纪要\n\n## 会议信息\n- **主题**: {{title}}\n- **日期**: {{date}}\n\n## 参会人员\n{{attendees}}\n\n## 决议事项\n{{decisions}}\n\n---\n*整理时间: {{generatedAt}}*`
      },
      {
        id: 'leave-request',
        name: '请假申请',
        description: '员工请假申请表',
        category: 'hr',
        type: 'markdown',
        tags: ['请假', '申请', '人事'],
        fields: [
          { name: 'applicant', label: '申请人', type: 'text', required: true },
          { name: 'leaveType', label: '请假类型', type: 'select', options: ['事假', '病假', '年假'], required: true },
          { name: 'startDate', label: '开始日期', type: 'date', required: true },
          { name: 'endDate', label: '结束日期', type: 'date', required: true },
          { name: 'reason', label: '请假原因', type: 'textarea', required: true }
        ],
        template: `# 请假申请\n\n## 申请人信息\n| 项目 | 内容 |\n|------|------|\n| 姓名 | {{applicant}} |\n| 请假类型 | {{leaveType}} |\n| 开始日期 | {{startDate}} |\n| 结束日期 | {{endDate}} |\n\n## 请假原因\n{{reason}}\n\n---\n\n**申请人签字**: ________________  **日期**: {{date}}`
      }
    ];
    const defaultCategories = [
      { id: 'report', name: '报告', description: '周报、月报、年报等' },
      { id: 'hr', name: '人事', description: '请假、入职等' },
      { id: 'legal', name: '法务', description: '合同、协议等' },
      { id: 'finance', name: '财务', description: '发票、报销等' },
      { id: 'other', name: '其他', description: '其他模板' }
    ];
    for (const category of defaultCategories) {
      this.categories.set(category.id, category);
    }
    for (const template of defaultTemplates) {
      this.templates.set(template.id, template);
    }
    this._saveTemplates();
  }

  listTemplates(options = {}) {
    const { category, search, tags, limit = 50, offset = 0 } = options;
    let templates = Array.from(this.templates.values());
    if (category) {
      templates = templates.filter(t => t.category === category);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      templates = templates.filter(t =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower)
      );
    }
    const total = templates.length;
    return {
      templates: templates.slice(offset, offset + limit),
      total,
      limit,
      offset
    };
  }

  getTemplate(templateId) {
    return this.templates.get(templateId) || null;
  }

  createTemplate(templateData) {
    const { id, name, template } = templateData;
    if (!id || !name || !template) {
      throw new Error('id, name, and template are required');
    }
    if (this.templates.has(id)) {
      throw new Error(`Template with id ${id} already exists`);
    }
    const newTemplate = {
      ...templateData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.templates.set(id, newTemplate);
    this._saveTemplates();
    return newTemplate;
  }

  updateTemplate(templateId, updates) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    if (!isPrototypePollutionSafe(updates)) {
      throw new Error('Invalid updates: potential prototype pollution attempt');
    }
    const allowedFields = ['name', 'description', 'category', 'type', 'tags', 'fields', 'template'];
    const safeUpdates = {};
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        safeUpdates[field] = updates[field];
      }
    }
    const updatedTemplate = {
      ...template,
      ...safeUpdates,
      id: templateId,
      updatedAt: new Date().toISOString()
    };
    this.templates.set(templateId, updatedTemplate);
    this._saveTemplates();
    return updatedTemplate;
  }

  deleteTemplate(templateId) {
    if (!this.templates.has(templateId)) {
      throw new Error(`Template not found: ${templateId}`);
    }
    this.templates.delete(templateId);
    this._saveTemplates();
    return { deleted: true };
  }

  renderTemplate(templateId, data) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    if (!isPrototypePollutionSafe(data)) {
      throw new Error('Invalid data: potential prototype pollution attempt');
    }
    let content = template.template;
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      if (template.type === 'html') {
        content = content.replace(regex, value !== undefined ? escapeHtml(String(value)) : '');
      } else {
        content = content.replace(regex, value !== undefined ? String(value) : '');
      }
    }
    const now = new Date();
    content = content.replace(/{{date}}/g, now.toISOString().split('T')[0]);
    content = content.replace(/{{generatedAt}}/g, now.toISOString());
    return {
      template: template,
      content: content,
      data: data,
      generatedAt: now.toISOString()
    };
  }

  validateTemplateData(templateId, data) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    const errors = [];
    for (const field of template.fields) {
      const value = data[field.name];
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push({ field: field.name, message: `${field.label} 是必填项` });
      }
    }
    return { valid: errors.length === 0, errors };
  }

  // ============ Helper Methods ============

  _sanitizeHTML(html) {
    if (!html || typeof html !== 'string') return '';
    let sanitized = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '<!-- script removed -->')
      .replace(/<script[^>]*>/gi, '<!-- script tag removed -->')
      .replace(/<\/script>/gi, '');
    sanitized = sanitized
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/\son\w+\s*=\s*[^\s>"']*/gi, '');
    sanitized = sanitized
      .replace(/\s(?:href|src|action)\s*=\s*["']?\s*javascript\s*:/gi, ' data-removed-')
      .replace(/\s(?:href|src|action)\s*=\s*["']?\s*data\s*:/gi, ' data-removed-');
    const dangerousTags = ['iframe', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea'];
    for (const tag of dangerousTags) {
      const regex = new RegExp(`<${tag}\\b[^>]*>.*?</${tag}>|<${tag}\\b[^>]*/>`, 'gi');
      sanitized = sanitized.replace(regex, `<!-- ${tag} removed -->`);
    }
    return sanitized;
  }

  _wrapHTMLForPreview(html, options) {
    const safeTitle = escapeHtml(options?.title || 'HTML Preview');
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; img-src 'self' data: https:; script-src 'none';">
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff; }
    .preview-container { max-width: 100%; overflow: auto; }
  </style>
</head>
<body>
  <div class="preview-container">${html}</div>
</body>
</html>`;
  }

  _markdownToHTML(markdown) {
    return markdown
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  _highlightSyntax(content, filename) {
    const ext = path.extname(filename).slice(1);
    let highlighted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) {
      highlighted = highlighted
        .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this)\b/g, '<span style="color:#c678dd;">$1</span>')
        .replace(/\b(console|document|window|Math|JSON)\b/g, '<span style="color:#e5c07b;">$1</span>')
        .replace(/(['"`])(.*?)\1/g, '<span style="color:#98c379;">$1$2$1</span>')
        .replace(/\/\/(.*?)$/gm, '<span style="color:#5c6370;">//$1</span>');
    }
    if (ext === 'py') {
      highlighted = highlighted
        .replace(/\b(def|class|import|from|return|if|else|elif|for|while|try|except|True|False|None)\b/g, '<span style="color:#c678dd;">$1</span>')
        .replace(/\b(print|len|range|str|int|float|list|dict)\b/g, '<span style="color:#e5c07b;">$1</span>')
        .replace(/(#.*?)$/gm, '<span style="color:#5c6370;">$1</span>');
    }
    return highlighted;
  }

  _createPDFViewer(previewId) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PDF 预览</title>
  <style>
    body { margin: 0; padding: 0; background: #525659; }
    #pdf-container { width: 100%; height: 100vh; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <div id="pdf-container">
    <iframe src="/api/skills/preview/${previewId}/raw" frameborder="0"></iframe>
  </div>
</body>
</html>`;
  }

  getStats() {
    const previewFiles = fs.readdirSync(this.previewDir);
    let totalSize = 0;
    for (const file of previewFiles) {
      const stats = fs.statSync(path.join(this.previewDir, file));
      totalSize += stats.size;
    }
    return {
      previews: { totalFiles: previewFiles.length, totalSize, cacheSize: this.previewCache.size },
      templates: { totalTemplates: this.templates.size, totalCategories: this.categories.size }
    };
  }
}

let instance = null;

function getSkillRenderer(options) {
  if (!instance) {
    instance = new SkillRenderer(options);
  }
  return instance;
}

module.exports = { SkillRenderer, getSkillRenderer, escapeHtml, isPathSafe, isPrototypePollutionSafe };
