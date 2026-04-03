/**
 * Skill Preview System
 * @deprecated 请使用 SkillRenderer 替代
 * 
 * 已废弃功能 (2026-03-22):
 * - 此模块已被 src/skills/rendering/SkillRenderer.js 合并
 * - 新代码请使用 getSkillRenderer() 而非 getSkillPreview()
 * 
 * 迁移指南:
 *   旧: const { getSkillPreview } = require('./preview/SkillPreview');
 *   新: const { getSkillRenderer } = require('./rendering/SkillRenderer');
 */

console.warn('[弃用警告] SkillPreview 已弃用，请使用 SkillRenderer 替代。详见 src/skills/rendering/SkillRenderer.js');

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

class SkillPreview {
  constructor(options = {}) {
    this.previewDir = options.previewDir || path.join(process.cwd(), 'data', 'previews');
    this.maxPreviewSize = options.maxPreviewSize || 10 * 1024 * 1024; // 10MB
    this.cacheTTL = options.cacheTTL || 3600000; // 1 hour
    
    // Preview cache
    this.previewCache = new Map();
    
    // Supported preview formats
    this.supportedFormats = {
      image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
      html: ['html', 'htm'],
      markdown: ['md', 'markdown'],
      text: ['txt', 'json', 'xml', 'yaml', 'yml', 'csv'],
      pdf: ['pdf'],
      code: ['js', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'ts']
    };
    
    // 自动清理定时器
    this.cleanupInterval = null;
    this._startAutoCleanup();
    
    this._ensurePreviewDir();
  }

  /**
   * 启动自动清理定时器 - 每小时清理一次过期缓存
   */
  _startAutoCleanup() {
    // 每小时清理一次缓存 (3600000ms)
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpiredCache();
      console.log('[SkillPreview] 自动清理过期缓存完成');
    }, 3600000);
    
    // 防止定时器阻止进程退出
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * 停止自动清理定时器
   */
  _stopAutoCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  _ensurePreviewDir() {
    if (!fs.existsSync(this.previewDir)) {
      fs.mkdirSync(this.previewDir, { recursive: true });
    }
  }

  /**
   * 获取文件的预览类型
   */
  getPreviewType(filename) {
    const ext = path.extname(filename).toLowerCase().slice(1);
    
    for (const [type, extensions] of Object.entries(this.supportedFormats)) {
      if (extensions.includes(ext)) {
        return type;
      }
    }
    
    return 'unknown';
  }

  /**
   * 生成预览ID - 使用SHA-256替代MD5
   */
  _generatePreviewId(content, filename) {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    hash.update(filename);
    return hash.digest('hex').slice(0, 32); // 截取前32位作为ID
  }

  /**
   * 创建图片预览
   */
  createImagePreview(buffer, filename, options = {}) {
    // 验证文件大小
    if (buffer.length > this.maxPreviewSize) {
      throw new Error(`File size exceeds maximum limit: ${this.maxPreviewSize} bytes`);
    }
    
    const previewId = this._generatePreviewId(buffer.toString('base64'), filename);
    const ext = path.extname(filename).toLowerCase();
    
    // 验证扩展名
    const safeExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
    if (!safeExtensions.includes(ext)) {
      throw new Error(`Invalid image extension: ${ext}`);
    }
    
    // 安全的文件路径
    const previewPath = path.join(this.previewDir, `${previewId}${ext}`);
    if (!isPathSafe(this.previewDir, previewPath)) {
      throw new Error('Invalid preview path');
    }
    
    fs.writeFileSync(previewPath, buffer);
    
    // 生成缩略图（如果需要）
    let thumbnailPath = null;
    if (options.generateThumbnail !== false) {
      thumbnailPath = this._createThumbnail(buffer, previewId, ext);
    }
    
    return {
      id: previewId,
      type: 'image',
      format: ext.slice(1),
      path: previewPath,
      url: `/api/skills/preview/${previewId}`,
      thumbnailUrl: thumbnailPath ? `/api/skills/preview/${previewId}/thumbnail` : null,
      size: buffer.length,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 创建HTML预览
   */
  createHTMLPreview(content, filename, options = {}) {
    const previewId = this._generatePreviewId(content, filename);
    
    // 安全处理HTML
    const sanitizedHTML = this._sanitizeHTML(content);
    
    // 添加预览包装器
    const wrappedHTML = this._wrapHTMLForPreview(sanitizedHTML, options);
    
    // 存储预览文件
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

  /**
   * 创建Markdown预览
   */
  createMarkdownPreview(content, filename, options = {}) {
    const previewId = this._generatePreviewId(content, filename);
    
    // 转换Markdown为HTML
    const htmlContent = this._markdownToHTML(content);
    
    // 创建HTML预览
    const htmlPreview = this.createHTMLPreview(htmlContent, filename.replace(/\.md$/, '.html'), options);
    
    return {
      ...htmlPreview,
      type: 'markdown',
      format: 'markdown',
      originalContent: content
    };
  }

  /**
   * 创建文本预览
   */
  createTextPreview(content, filename, options = {}) {
    const previewId = this._generatePreviewId(content, filename);
    
    // 高亮语法（如果是代码）
    const highlightedContent = this._highlightSyntax(content, filename);
    
    // 转义文件名防止XSS
    const safeFilename = escapeHtml(filename);
    
    // 包装为HTML
    const wrappedHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>预览: ${safeFilename}</title>
  <style>
    body { 
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; 
      background: #1e1e1e; 
      color: #d4d4d4; 
      padding: 20px; 
      margin: 0;
      line-height: 1.5;
    }
    .line-numbers {
      color: #858585;
      text-align: right;
      padding-right: 10px;
      user-select: none;
    }
    .content { white-space: pre-wrap; word-break: break-all; }
    .filename { color: #569cd6; margin-bottom: 15px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="filename">${safeFilename}</div>
  <div class="content">${highlightedContent}</div>
</body>
</html>`;
    
    // 存储预览文件
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

  /**
   * 创建PDF预览
   */
  createPDFPreview(buffer, filename, options = {}) {
    const previewId = this._generatePreviewId(buffer.toString('base64'), filename);
    
    // 存储PDF文件
    const previewPath = path.join(this.previewDir, `${previewId}.pdf`);
    fs.writeFileSync(previewPath, buffer);
    
    // 创建PDF查看器HTML
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
      viewerUrl: `/api/skills/preview/${previewId}/viewer`,
      pdfUrl: `/api/skills/preview/${previewId}/raw`,
      size: buffer.length,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 通用预览创建方法
   */
  createPreview(data, filename, options = {}) {
    const previewType = this.getPreviewType(filename);
    
    switch (previewType) {
      case 'image':
        return this.createImagePreview(
          Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64'),
          filename,
          options
        );
        
      case 'html':
        return this.createHTMLPreview(
          typeof data === 'string' ? data : data.toString(),
          filename,
          options
        );
        
      case 'markdown':
        return this.createMarkdownPreview(
          typeof data === 'string' ? data : data.toString(),
          filename,
          options
        );
        
      case 'text':
      case 'code':
        return this.createTextPreview(
          typeof data === 'string' ? data : data.toString(),
          filename,
          options
        );
        
      case 'pdf':
        return this.createPDFPreview(
          Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64'),
          filename,
          options
        );
        
      default:
        return this.createTextPreview(
          typeof data === 'string' ? data : data.toString(),
          filename,
          options
        );
    }
  }

  /**
   * 获取预览 - 安全版本
   */
  getPreview(previewId) {
    // 验证previewId格式（只允许字母数字）
    if (!previewId || !/^[a-zA-Z0-9]+$/.test(previewId)) {
      return null;
    }
    
    // 检查缓存
    const cached = this.previewCache.get(previewId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.preview;
    }
    
    // 查找预览文件
    const files = fs.readdirSync(this.previewDir);
    const previewFile = files.find(f => f.startsWith(previewId));
    
    if (!previewFile) {
      return null;
    }
    
    const filePath = path.join(this.previewDir, previewFile);
    
    // 验证文件路径安全
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
    
    // 更新缓存
    this.previewCache.set(previewId, {
      preview,
      timestamp: Date.now()
    });
    
    return preview;
  }

  /**
   * 删除预览 - 安全版本
   */
  deletePreview(previewId) {
    // 验证previewId格式
    if (!previewId || !/^[a-zA-Z0-9]+$/.test(previewId)) {
      throw new Error('Invalid preview ID');
    }
    
    const files = fs.readdirSync(this.previewDir);
    const previewFiles = files.filter(f => f.startsWith(previewId));
    
    for (const file of previewFiles) {
      const filePath = path.join(this.previewDir, file);
      
      // 验证路径安全
      if (!isPathSafe(this.previewDir, filePath)) {
        console.warn('Path traversal attempt detected in delete:', previewId);
        continue;
      }
      
      fs.unlinkSync(filePath);
    }
    
    this.previewCache.delete(previewId);
    
    return { deleted: previewFiles.length };
  }

  /**
   * 清理过期预览 - 安全版本
   */
  cleanupExpiredPreviews(maxAge = 86400000) { // 24 hours
    const now = Date.now();
    const files = fs.readdirSync(this.previewDir);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(this.previewDir, file);
      
      // 验证路径安全
      if (!isPathSafe(this.previewDir, filePath)) {
        continue;
      }
      
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    // 同时清理过期的缓存条目
    this._cleanupExpiredCache();
    
    return { deleted: deletedCount };
  }

  /**
   * 清理过期的缓存条目
   */
  _cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, cached] of this.previewCache.entries()) {
      if (now - cached.timestamp >= this.cacheTTL) {
        this.previewCache.delete(key);
      }
    }
  }

  // ============ 辅助方法 ============

  _createThumbnail(buffer, previewId, ext) {
    // 简单的缩略图创建（实际项目中应使用sharp等库）
    const thumbnailPath = path.join(this.previewDir, `${previewId}_thumb${ext}`);
    fs.writeFileSync(thumbnailPath, buffer); // 简化处理
    return thumbnailPath;
  }

  /**
   * 更安全的HTML清理函数 - 增强版
   */
  _sanitizeHTML(html) {
    if (!html || typeof html !== 'string') return '';
    
    // 第一步：移除所有script标签及其内容
    let sanitized = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '<!-- script removed -->')
      .replace(/<script[^>]*>/gi, '<!-- script tag removed -->')
      .replace(/<\/script>/gi, '');
    
    // 第二步：移除事件处理器（支持各种引号格式）
    sanitized = sanitized
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/\son\w+\s*=\s*[^\s>"']*/gi, '');
    
    // 第三步：移除危险的属性
    sanitized = sanitized
      .replace(/\s(?:href|src|action)\s*=\s*["']?\s*javascript\s*:/gi, ' data-removed-')
      .replace(/\s(?:href|src|action)\s*=\s*["']?\s*data\s*:/gi, ' data-removed-');
    
    // 第四步：移除危险的标签
    const dangerousTags = ['iframe', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea'];
    for (const tag of dangerousTags) {
      const regex = new RegExp(`<${tag}\\b[^>]*>.*?</${tag}>|<${tag}\\b[^>]*/>`, 'gi');
      sanitized = sanitized.replace(regex, `<!-- ${tag} removed -->`);
    }
    
    // 第五步：移除style标签中的expression和import
    sanitized = sanitized
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (match) => {
        return match
          .replace(/expression\s*\([^)]*\)/gi, '')
          .replace(/@import\s+[^;]*;/gi, '');
      });
    
    return sanitized;
  }

  /**
   * 包装HTML用于预览 - 安全版本
   */
  _wrapHTMLForPreview(html, options) {
    // 转义标题中的特殊字符
    const safeTitle = escapeHtml(options?.title || 'HTML Preview');
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; img-src 'self' data: https:; script-src 'none';">
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body { 
      margin: 0; 
      padding: 10px; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #fff;
    }
    .preview-container { max-width: 100%; overflow: auto; }
  </style>
</head>
<body>
  <div class="preview-container">
    ${html}
  </div>
</body>
</html>`;
  }

  _markdownToHTML(markdown) {
    // 简单的Markdown转HTML（实际项目中应使用marked等库）
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
    
    // 简单的语法高亮
    let highlighted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // JavaScript/TypeScript
    if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) {
      highlighted = highlighted
        .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this)\b/g, '<span style="color:#c678dd;">$1</span>')
        .replace(/\b(console|document|window|Math|JSON)\b/g, '<span style="color:#e5c07b;">$1</span>')
        .replace(/(['"`])(.*?)\1/g, '<span style="color:#98c379;">$1$2$1</span>')
        .replace(/\/\/(.*?)$/gm, '<span style="color:#5c6370;">//$1</span>');
    }
    
    // Python
    if (ext === 'py') {
      highlighted = highlighted
        .replace(/\b(def|class|import|from|return|if|else|elif|for|while|try|except|finally|with|as|lambda|yield|raise|True|False|None)\b/g, '<span style="color:#c678dd;">$1</span>')
        .replace(/\b(print|len|range|str|int|float|list|dict|set|tuple)\b/g, '<span style="color:#e5c07b;">$1</span>')
        .replace(/(#.*?)$/gm, '<span style="color:#5c6370;">$1</span>');
    }
    
    return highlighted;
  }

  _createPDFViewer(previewId) {
    return `
<!DOCTYPE html>
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

  /**
   * 获取支持的格式列表
   */
  getSupportedFormats() {
    return this.supportedFormats;
  }

  /**
   * 获取预览统计信息
   */
  getStats() {
    const files = fs.readdirSync(this.previewDir);
    let totalSize = 0;
    
    for (const file of files) {
      const stats = fs.statSync(path.join(this.previewDir, file));
      totalSize += stats.size;
    }
    
    return {
      totalFiles: files.length,
      totalSize,
      cacheSize: this.previewCache.size
    };
  }
}

// Singleton instance
let instance = null;

function getSkillPreview(options) {
  console.warn('[弃用警告] getSkillPreview() 已弃用，请使用 getSkillRenderer()');
  if (!instance) {
    instance = new SkillPreview(options);
  }
  return instance;
}

// 标记类为已弃用
const DeprecatedSkillPreview = class extends SkillPreview {
  constructor(options = {}) {
    console.warn('[弃用警告] SkillPreview 类已弃用，请使用 SkillRenderer');
    super(options);
  }
};

module.exports = { 
  SkillPreview: DeprecatedSkillPreview, 
  getSkillPreview,
  DEPRECATED: true,
  REPLACEMENT: 'src/skills/rendering/SkillRenderer'
};
