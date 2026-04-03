/**
 * Enhanced Skills API
 * 包含预览、模板库、多格式导出等功能
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getSkillPreview } = require('./preview/SkillPreview');
const { getSkillTemplates } = require('./templates/SkillTemplates');
const { MultiFormatExporter } = require('./export/StorageAdapter');
const { createRateLimiters } = require('../middleware/rateLimiter');
const { createAuthMiddleware } = require('../middleware/auth');

/**
 * 输入验证工具函数
 */
const Validation = {
  /**
   * 验证预览ID格式
   */
  isValidPreviewId(id) {
    return id && /^[a-zA-Z0-9]+$/.test(id) && id.length <= 64;
  },
  
  /**
   * 验证模板ID格式
   */
  isValidTemplateId(id) {
    return id && /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 64;
  },
  
  /**
   * 验证文件名
   */
  isValidFilename(filename) {
    if (!filename || typeof filename !== 'string') return false;
    // 检查路径遍历
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
    // 检查长度
    if (filename.length > 255) return false;
    // 检查特殊字符
    return /^[a-zA-Z0-9_\-.]+$/.test(filename);
  },
  
  /**
   * 清理字符串输入
   */
  sanitizeString(str, maxLength = 1000) {
    if (typeof str !== 'string') return '';
    return str.slice(0, maxLength).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  },
  
  /**
   * 验证导出格式
   */
  isValidExportFormat(format) {
    const validFormats = ['json', 'csv', 'markdown', 'html', 'pdf'];
    return validFormats.includes(format);
  },
  
  /**
   * 验证用户角色
   */
  isValidRole(role) {
    const validRoles = ['user', 'developer', 'admin', 'publisher'];
    return validRoles.includes(role);
  }
};

class EnhancedSkillsApi {
  constructor(skillsApi) {
    this.skillsApi = skillsApi;
    this.router = express.Router();
    
    // 初始化组件
    this.preview = getSkillPreview();
    this.templates = getSkillTemplates();
    this.exporter = new MultiFormatExporter({
      provider: process.env.STORAGE_PROVIDER || 'local',
      bucket: process.env.STORAGE_BUCKET || 'skill-exports',
      region: process.env.STORAGE_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      localPath: path.join(process.cwd(), 'data', 'exports')
    });
    
    // 配置multer用于文件上传
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 } // 50MB
    });

    // 初始化限流器
    this.rateLimiters = createRateLimiters();

    // 初始化认证中间件
    this.auth = createAuthMiddleware({
      secret: process.env.JWT_SECRET || undefined,
      excludePaths: ['/api/skills/preview/', '/api/skills/templates'] // 只读操作排除认证
    });
    
    this._bindRoutes();
  }

  _bindRoutes() {
    // 应用通用限流器到所有路由
    this.router.use(this.rateLimiters.general.middleware());
    
    // 应用认证中间件
    this.router.use(this.auth.authenticate);

    // ============ 预览相关路由 ============
    
    /**
     * POST /api/skills/preview/create
     * 创建预览 - 添加输入验证和上传限流
     */
    this.router.post('/preview/create', 
      this.rateLimiters.upload.middleware(),
      this.upload.single('file'), 
      async (req, res) => {
      try {
        const { content, filename, type } = req.body;
        const file = req.file;
        
        let previewData;
        let previewFilename;
        
        if (file) {
          previewData = file.buffer;
          previewFilename = Validation.sanitizeString(file.originalname, 255);
          
          // 验证文件名
          if (!Validation.isValidFilename(previewFilename)) {
            return res.status(400).json({ error: 'Invalid filename' });
          }
          
          // 验证文件大小
          if (file.size > 50 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large (max 50MB)' });
          }
        } else if (content && filename) {
          // 验证内容
          if (typeof content !== 'string') {
            return res.status(400).json({ error: 'Content must be a string' });
          }
          
          previewFilename = Validation.sanitizeString(filename, 255);
          
          // 验证文件名
          if (!Validation.isValidFilename(previewFilename)) {
            return res.status(400).json({ error: 'Invalid filename' });
          }
          
          // 验证内容大小
          if (content.length > 50 * 1024 * 1024) {
            return res.status(400).json({ error: 'Content too large (max 50MB)' });
          }
          
          previewData = content;
        } else {
          return res.status(400).json({ error: 'Either file or content+filename is required' });
        }
        
        const preview = this.preview.createPreview(previewData, previewFilename, {
          title: Validation.sanitizeString(req.body.title || previewFilename, 200)
        });
        
        res.json({ ok: true, preview });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/preview/:previewId
     * 获取预览 - 添加输入验证
     */
    this.router.get('/preview/:previewId', async (req, res) => {
      try {
        const { previewId } = req.params;
        
        // 验证previewId格式
        if (!Validation.isValidPreviewId(previewId)) {
          return res.status(400).json({ error: 'Invalid preview ID format' });
        }
        
        const preview = this.preview.getPreview(previewId);
        
        if (!preview) {
          return res.status(404).json({ error: 'Preview not found' });
        }
        
        // 添加安全头
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        // 根据文件类型返回内容
        const ext = path.extname(preview.path).toLowerCase();
        
        if (['.html', '.htm'].includes(ext)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline'; script-src 'none'; object-src 'none';");
          res.sendFile(preview.path);
        } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
          res.setHeader('Content-Type', `image/${ext.slice(1)}`);
          res.sendFile(preview.path);
        } else if (ext === '.pdf') {
          res.setHeader('Content-Type', 'application/pdf');
          res.sendFile(preview.path);
        } else {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.sendFile(preview.path);
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/preview/:previewId/iframe
     * 获取iframe预览（用于HTML）
     */
    this.router.get('/preview/:previewId/iframe', async (req, res) => {
      try {
        const { previewId } = req.params;
        const preview = this.preview.getPreview(previewId);
        
        if (!preview) {
          return res.status(404).json({ error: 'Preview not found' });
        }
        
        res.setHeader('Content-Type', 'text/html');
        res.sendFile(preview.path);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/preview/:previewId/raw
     * 获取原始文件（用于PDF等）
     */
    this.router.get('/preview/:previewId/raw', async (req, res) => {
      try {
        const { previewId } = req.params;
        const preview = this.preview.getPreview(previewId);
        
        if (!preview) {
          return res.status(404).json({ error: 'Preview not found' });
        }
        
        res.sendFile(preview.path);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * DELETE /api/skills/preview/:previewId
     * 删除预览
     */
    this.router.delete('/preview/:previewId', async (req, res) => {
      try {
        const { previewId } = req.params;
        const result = this.preview.deletePreview(previewId);
        res.json({ ok: true, ...result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/preview/stats
     * 获取预览统计
     */
    this.router.get('/preview/stats', async (req, res) => {
      try {
        const stats = this.preview.getStats();
        const formats = this.preview.getSupportedFormats();
        res.json({ stats, formats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ============ 模板相关路由 ============

    /**
     * GET /api/skills/templates
     * 获取模板列表
     */
    this.router.get('/templates', async (req, res) => {
      try {
        const { category, search, tags, limit, offset } = req.query;
        
        const result = this.templates.listTemplates({
          category,
          search,
          tags: tags ? tags.split(',') : undefined,
          limit: limit ? parseInt(limit) : undefined,
          offset: offset ? parseInt(offset) : undefined
        });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/templates/categories
     * 获取模板分类
     */
    this.router.get('/templates/categories', async (req, res) => {
      try {
        const categories = this.templates.listCategories();
        res.json({ categories });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/templates/:templateId
     * 获取单个模板 - 添加输入验证
     */
    this.router.get('/templates/:templateId', async (req, res) => {
      try {
        const { templateId } = req.params;
        
        // 验证templateId格式
        if (!Validation.isValidTemplateId(templateId)) {
          return res.status(400).json({ error: 'Invalid template ID format' });
        }
        
        const template = this.templates.getTemplate(templateId);
        
        if (!template) {
          return res.status(404).json({ error: 'Template not found' });
        }
        
        res.json({ template });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /api/skills/templates
     * 创建新模板 - 添加输入验证和权限检查
     */
    this.router.post('/templates', 
      this.auth.requireRole('admin', 'developer'),
      async (req, res) => {
      try {
        const userRole = req.user.role;
        const allowedRoles = ['admin', 'developer'];
        
        // 验证角色格式
        if (!Validation.isValidRole(userRole) || !allowedRoles.includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        // 验证必需字段
        const { id, name, template } = req.body;
        if (!id || !name || !template) {
          return res.status(400).json({ error: 'id, name, and template are required' });
        }
        
        // 验证ID格式
        if (!Validation.isValidTemplateId(id)) {
          return res.status(400).json({ error: 'Invalid template ID format' });
        }
        
        // 清理输入
        const sanitizedData = {
          id: Validation.sanitizeString(id, 64),
          name: Validation.sanitizeString(name, 100),
          description: Validation.sanitizeString(req.body.description || '', 500),
          category: Validation.sanitizeString(req.body.category || 'other', 50),
          type: ['markdown', 'html', 'text'].includes(req.body.type) ? req.body.type : 'markdown',
          tags: Array.isArray(req.body.tags) ? req.body.tags.slice(0, 10).map(t => Validation.sanitizeString(t, 50)) : [],
          fields: Array.isArray(req.body.fields) ? req.body.fields : [],
          template: Validation.sanitizeString(template, 50000)
        };
        
        const templateResult = this.templates.createTemplate(sanitizedData);
        res.json({ ok: true, template: templateResult });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * PUT /api/skills/templates/:templateId
     * 更新模板
     */
    this.router.put('/templates/:templateId', async (req, res) => {
      try {
        const userRole = req.headers['x-role'] || 'user';
        const allowedRoles = ['admin', 'developer'];
        
        if (!allowedRoles.includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        const { templateId } = req.params;
        const template = this.templates.updateTemplate(templateId, req.body);
        res.json({ ok: true, template });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * DELETE /api/skills/templates/:templateId
     * 删除模板
     */
    this.router.delete('/templates/:templateId', async (req, res) => {
      try {
        const userRole = req.headers['x-role'] || 'user';
        const allowedRoles = ['admin'];
        
        if (!allowedRoles.includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
        
        const { templateId } = req.params;
        const result = this.templates.deleteTemplate(templateId);
        res.json({ ok: true, ...result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /api/skills/templates/:templateId/render
     * 使用模板生成内容 - 添加输入验证
     */
    this.router.post('/templates/:templateId/render', async (req, res) => {
      try {
        const { templateId } = req.params;
        const { data } = req.body;
        
        // 验证templateId格式
        if (!Validation.isValidTemplateId(templateId)) {
          return res.status(400).json({ error: 'Invalid template ID format' });
        }
        
        // 验证数据
        if (!data || typeof data !== 'object') {
          return res.status(400).json({ error: 'Data object is required' });
        }
        
        // 清理数据值
        const sanitizedData = {};
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'string') {
            sanitizedData[key] = Validation.sanitizeString(value, 5000);
          } else if (typeof value === 'number' || typeof value === 'boolean') {
            sanitizedData[key] = value;
          }
        }
        
        const validation = this.templates.validateTemplateData(templateId, sanitizedData);
        if (!validation.valid) {
          return res.status(400).json({ 
            error: 'Validation failed', 
            errors: validation.errors,
            warnings: validation.warnings
          });
        }
        
        const result = this.templates.renderTemplate(templateId, sanitizedData);
        res.json({ ok: true, ...result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /api/skills/templates/:templateId/validate
     * 验证模板数据
     */
    this.router.post('/templates/:templateId/validate', async (req, res) => {
      try {
        const { templateId } = req.params;
        const { data } = req.body;
        
        const validation = this.templates.validateTemplateData(templateId, data);
        res.json({ ok: true, ...validation });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/templates/stats
     * 获取模板统计
     */
    this.router.get('/templates/stats', async (req, res) => {
      try {
        const stats = this.templates.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ============ 导出相关路由 ============

    /**
     * POST /api/skills/export
     * 导出数据到云存储 - 添加输入验证和限流
     */
    this.router.post('/export', 
      this.rateLimiters.export.middleware(),
      async (req, res) => {
      try {
        const { data, format, filename, metadata } = req.body;
        
        if (!data) {
          return res.status(400).json({ error: 'Data is required' });
        }
        
        // 验证格式
        if (format && !Validation.isValidExportFormat(format)) {
          return res.status(400).json({ error: 'Invalid export format' });
        }
        
        // 验证文件名
        if (filename && !Validation.isValidFilename(filename)) {
          return res.status(400).json({ error: 'Invalid filename' });
        }
        
        // 清理元数据
        let sanitizedMetadata = {};
        if (metadata && typeof metadata === 'object') {
          for (const [key, value] of Object.entries(metadata)) {
            if (typeof value === 'string') {
              sanitizedMetadata[key] = Validation.sanitizeString(value, 500);
            } else if (typeof value === 'number' || typeof value === 'boolean') {
              sanitizedMetadata[key] = value;
            }
          }
        }
        
        const result = await this.exporter.export(data, {
          format: format || 'json',
          filename: filename ? Validation.sanitizeString(filename, 255) : undefined,
          metadata: sanitizedMetadata
        });
        
        res.json({ ok: true, ...result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * POST /api/skills/export/file
     * 导出文件到云存储
     */
    this.router.post('/export/file', this.upload.single('file'), async (req, res) => {
      try {
        const file = req.file;
        const { format, metadata } = req.body;
        
        if (!file) {
          return res.status(400).json({ error: 'File is required' });
        }
        
        const result = await this.exporter.storage.upload(file.buffer, {
          key: `exports/${file.originalname}`,
          contentType: file.mimetype,
          metadata: {
            ...JSON.parse(metadata || '{}'),
            originalName: file.originalname,
            uploadedAt: new Date().toISOString()
          }
        });
        
        const permanentUrl = await this.exporter.storage.getSignedURL(result.key, {
          expiresIn: 365 * 24 * 60 * 60 // 1 year
        });
        
        res.json({ 
          ok: true, 
          ...result,
          permanentUrl: permanentUrl.url,
          expiresAt: permanentUrl.expiresAt
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/export/formats
     * 获取支持的导出格式
     */
    this.router.get('/export/formats', async (req, res) => {
      try {
        const formats = this.exporter.getSupportedFormats();
        res.json({ formats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/export/stats
     * 获取导出统计
     */
    this.router.get('/export/stats', async (req, res) => {
      try {
        const stats = await this.exporter.getStorageStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/export/:key/url
     * 获取文件的预签名URL
     */
    this.router.get('/export/:key/url', async (req, res) => {
      try {
        const { key } = req.params;
        const { expiresIn } = req.query;
        
        const result = await this.exporter.storage.getSignedURL(key, {
          expiresIn: expiresIn ? parseInt(expiresIn) : 3600
        });
        
        res.json({ ok: true, ...result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * DELETE /api/skills/export/:key
     * 删除导出文件
     */
    this.router.delete('/export/:key', async (req, res) => {
      try {
        const { key } = req.params;
        const result = await this.exporter.storage.delete(key);
        res.json({ ok: true, ...result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * GET /api/skills/export/list
     * 列出导出文件
     */
    this.router.get('/export/list', async (req, res) => {
      try {
        const { prefix, limit } = req.query;
        
        const result = await this.exporter.storage.list(prefix || 'exports/', {
          limit: limit ? parseInt(limit) : 100
        });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ============ 认证相关路由 ============

    /**
     * POST /api/skills/auth/login
     * 用户登录 - 使用严格限流器
     */
    this.router.post('/auth/login', 
      this.rateLimiters.login.middleware(),
      this.auth.loginHandler
    );

    /**
     * GET /api/skills/auth/verify
     * 验证令牌
     */
    this.router.get('/auth/verify', this.auth.verifyHandler);

    /**
     * GET /api/skills/auth/me
     * 获取当前用户信息
     */
    this.router.get('/auth/me', (req, res) => {
      res.json({ user: req.user });
    });

    // ============ 系统信息路由 ============

    /**
     * GET /api/skills/system/rate-limit-stats
     * 获取限流统计（管理员）
     */
    this.router.get('/system/rate-limit-stats', 
      this.auth.requireRole('admin'),
      (req, res) => {
        const stats = {};
        for (const [name, limiter] of Object.entries(this.rateLimiters)) {
          stats[name] = limiter.getStats();
        }
        res.json({ stats });
      }
    );
  }

  /**
   * 获取路由器
   */
  getRouter() {
    return this.router;
  }
}

module.exports = { EnhancedSkillsApi };
