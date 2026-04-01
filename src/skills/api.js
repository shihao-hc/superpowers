const express = require('express');
const path = require('path');
const fs = require('fs');
const { SkillToNode } = require('./SkillToNode');
const { SkillValidator } = require('./SkillValidator');
const { SkillMarketplace } = require('./marketplace/SkillMarketplace');
const { SkillVersionManager } = require('./SkillVersionManager');
const { createSkillMetricsHandler } = require('./metrics');
const { getSkillMetrics } = require('./SkillMetrics');

class SkillsApi {
  constructor(skillManager) {
    this.skillManager = skillManager;
    this.validator = new SkillValidator();
    this.marketplace = new SkillMarketplace();
    this.versionManager = new SkillVersionManager();
    this.metrics = getSkillMetrics();
    this.router = express.Router();
    this._bindRoutes();
    this._bindMarketplaceRoutes();
    this._bindVersionRoutes();
  }

  _bindRoutes() {
    const m = this;
    // List skills
    this.router.get('/', async (req, res) => {
      try {
        const skills = m.skillManager.getAllSkills();
        res.json({ skills });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Toggle enable/disable a skill
    this.router.post('/:skillName/toggle', async (req, res) => {
      const { skillName } = req.params;
      const { enable } = req.body;
      if (typeof enable !== 'boolean') {
        return res.status(400).json({ error: 'enable must be boolean' });
      }
      try {
        if (enable) {
          await m.skillManager.enableSkill(skillName);
        } else {
          await m.skillManager.disableSkill(skillName);
        }
        res.json({ ok: true, skill: skillName, enabled: enable });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Test call a skill
    this.router.post('/:skillName/test', async (req, res) => {
      const { skillName } = req.params;
      const role = (req.headers && req.headers['x-role']) || 'user';
      const inputs = req.body.inputs || {};
      const startTime = Date.now();
      
      try {
        // Security gate: high risk skills require admin role
        const skillForTest = (m.skillLoader && m.skillLoader.getSkill) ? m.skillLoader.getSkill(skillName) : null;
        if (skillForTest && (skillForTest.riskLevel || 'low') === 'high' && role !== 'admin') {
          m.metrics.recordExecution(skillName, { success: false, duration: Date.now() - startTime, error: 'permission_denied' });
          return res.status(403).json({ error: 'Forbidden for high-risk skill' });
        }
        
        // Try per-skill executor first
        const skill = m.skillManager.getSkillInfo(skillName);
        const explicitPath = path.join(process.cwd(), 'src', 'skills', 'executors', `${skillName}Executor.js`);
        let result;
        if (fs.existsSync(explicitPath)) {
          const Executor = require(explicitPath);
          let execFn = null;
          let execType = 'custom';
          if (Executor && typeof Executor.execute === 'function') {
            execFn = Executor.execute.bind(Executor);
          } else if (Executor && Executor.DocxExecutor && typeof Executor.DocxExecutor.execute === 'function') {
            execFn = Executor.DocxExecutor.execute.bind(Executor);
            execType = 'docx';
          } else if (Executor && Executor.PdfExecutor && typeof Executor.PdfExecutor.execute === 'function') {
            execFn = Executor.PdfExecutor.execute.bind(Executor);
            execType = 'pdf';
          } else if (Executor && Executor.CanvasExecutor && typeof Executor.CanvasExecutor.execute === 'function') {
            execFn = Executor.CanvasExecutor.execute.bind(Executor);
            execType = 'canvas';
          }
          if (execFn) {
            result = await execFn({ action: 'test', inputs });
            const duration = Date.now() - startTime;
            m.metrics.recordExecution(skillName, { success: true, duration, type: execType });
            return res.json({ ok: true, result });
          }
        }
        
        // Fallback to generic test by invoking the node script if exists
        const duration = Date.now() - startTime;
        m.metrics.recordExecution(skillName, { success: true, duration, type: 'fallback' });
        res.json({ ok: true, message: 'Test path not implemented for this skill in this environment' });
      } catch (e) {
        const duration = Date.now() - startTime;
        m.metrics.recordExecution(skillName, { success: false, duration, error: e.message });
        res.status(500).json({ error: e.message });
      }
    });

    // New: nodes info endpoint for stage A tooling
    this.router.get('/:skillName/nodes', async (req, res) => {
      const { skillName } = req.params;
      const skill = (m.skillLoader && m.skillLoader.getSkill) ? m.skillLoader.getSkill(skillName) : null;
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const action = (skill.inputs && skill.inputs.find(i => i.name === 'action')?.enum?.[0]) || 'execute';
      const nodeTypeName = `skill.${skill.name}.${action}`;
      const nodes = [
        { type: nodeTypeName, name: `Skill: ${skill.name} - ${action}`, inputs: skill.inputs, outputs: skill.outputs },
        { type: `skill.${skill.name}.generic`, name: `Skill: ${skill.name} (generic)`, inputs: skill.inputs, outputs: skill.outputs }
      ];
      res.json({ nodes, skill: skill.name });
    });

    // Stage A: Dependencies for a skill
    this.router.get('/:skillName/dependencies', async (req, res) => {
      const { skillName } = req.params;
      const skill = (m.skillLoader && m.skillLoader.getSkill) ? m.skillLoader.getSkill(skillName) : null;
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      res.json({
        skill: skill.name,
        name: skill.name,
        version: skill.version,
        riskLevel: skill.riskLevel || 'low',
        dependencies: skill.dependencies || []
      });
    });

    // Skill metrics endpoint - cache hit rates and execution statistics
    this.router.get('/metrics', async (req, res) => {
      try {
        // Get Python environment metrics
        const pythonMetrics = SkillToNode.getPythonEnvMetrics();
        const pythonCacheStats = SkillToNode.getPythonEnvCacheStats();
        
        // Get all skills
        const skills = m.skillManager.getAllSkills();
        
        // Calculate per-skill metrics (simplified - in production would track per skill)
        const skillMetrics = skills.map(skill => ({
          name: skill.name,
          riskLevel: skill.riskLevel || 'low',
          pure: skill.pure || false,
          dependencies: skill.dependencies || [],
          enabled: skill.enabled !== false // default to true
        }));
        
        res.json({
          python: {
            metrics: pythonMetrics,
            cacheStats: pythonCacheStats
          },
          skills: skillMetrics,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Clear Python environment cache
    this.router.post('/cache/clear', async (req, res) => {
      try {
        SkillToNode.clearPythonEnvCache();
        res.json({ ok: true, message: 'Python environment cache cleared' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Prometheus metrics endpoint
    this.router.get('/prometheus', createSkillMetricsHandler(m.skillManager, m.marketplace, m.metrics));

    // Stage C: Custom skill upload with validation and role-based access
    this.router.post('/upload', async (req, res) => {
      // Check user role - only admin or specific roles can upload initially
      const userRole = req.headers['x-role'] || req.body.role || 'user';
      const allowedRoles = ['admin', 'uploader', 'developer'];
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Forbidden: Insufficient permissions to upload skills',
          requiredRoles: allowedRoles,
          currentRole: userRole,
          message: 'Initially, only administrators and authorized users can upload skills. This restriction will be relaxed as the system matures.'
        });
      }
      
      const { name, payloadBase64, validate = true, autoLoad = false } = req.body;
      if (!name || !payloadBase64) return res.status(400).json({ error: 'name and payloadBase64 required' });
      
      try {
        const buf = Buffer.from(payloadBase64, 'base64');
        const uploadsDir = path.join(process.cwd(), 'uploads', 'skills-custom');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        
        // Validate ZIP if requested
        let validationResult = null;
        if (validate) {
          validationResult = await m.validator.validateZipPackage(buf, name);
          
          if (!validationResult.valid) {
            return res.status(400).json({ 
              error: 'Skill package validation failed',
              validation: m.validator.generateReport(validationResult)
            });
          }
        }
        
        // Save ZIP file
        const zipPath = path.join(uploadsDir, `${name}.zip`);
        fs.writeFileSync(zipPath, buf);
        
        // If auto-load is enabled, extract and load the skill
        let skillInfo = null;
        if (autoLoad && (!validationResult || validationResult.valid)) {
          try {
            // Extract ZIP to skill directory
            const skillDir = path.join(uploadsDir, name);
            const unzip = require('unzipper');
            await unzip.Open.buffer(buf).then(d => d.extract({ path: skillDir, concurrency: 5 }));
            
            // Try to load the skill
            const skillLoader = m.skillManager.skillLoader;
            const skill = skillLoader.loadSkill(name);
            if (skill) {
              skillInfo = {
                name: skill.name,
                version: skill.version,
                description: skill.description,
                loaded: true
              };
            }
          } catch (loadError) {
            console.warn('Auto-load failed:', loadError.message);
          }
        }
        
        res.json({ 
          ok: true, 
          name, 
          path: zipPath, 
          url: `/uploads/skills-custom/${name}.zip`,
          validation: validationResult ? m.validator.generateReport(validationResult) : null,
          skill: skillInfo
        });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Stage C: Git import with validation and role-based access
    this.router.post('/import/git', async (req, res) => {
      // Check user role - only admin or specific roles can import Git repositories
      const userRole = req.headers['x-role'] || req.body.role || 'user';
      const allowedRoles = ['admin', 'developer'];
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Forbidden: Insufficient permissions to import Git repositories',
          requiredRoles: allowedRoles,
          currentRole: userRole,
          message: 'Git repository import is restricted to administrators and developers.'
        });
      }
      
      const { repo, target, validate = true, autoLoad = false } = req.body;
      if (!repo) return res.status(400).json({ error: 'repo is required' });
      
      try {
        // Validate Git URL
        let validationResult = null;
        if (validate) {
          validationResult = await m.validator.validateGitRepository(repo, target);
          if (!validationResult.valid) {
            return res.status(400).json({ 
              error: 'Git repository validation failed',
              validation: m.validator.generateReport(validationResult)
            });
          }
        }
        
        const skillName = target || path.basename(repo, '.git').replace('.git', '');
        
        // Sanitize skill name to prevent path traversal
        const sanitizedSkillName = skillName.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100);
        if (!sanitizedSkillName) {
          return res.status(400).json({ error: 'Invalid skill name' });
        }
        
        const dest = path.join(process.cwd(), 'uploads', 'skills-custom', sanitizedSkillName);
        
        // Ensure directory exists and is within allowed path
        const allowedBase = path.join(process.cwd(), 'uploads', 'skills-custom');
        if (!dest.startsWith(allowedBase)) {
          return res.status(400).json({ error: 'Invalid destination path' });
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        
        // Use spawn instead of exec to avoid shell injection
        const { spawn } = require('child_process');
        const gitProcess = spawn('git', ['clone', '--depth', '1', repo, dest], { 
          timeout: 60000,
          shell: false  // Prevent shell injection
        });
        
        let stdout = '';
        let stderr = '';
        
        gitProcess.stdout.on('data', (data) => { stdout += data.toString(); });
        gitProcess.stderr.on('data', (data) => { stderr += data.toString(); });
        
        gitProcess.on('close', (code) => {
          if (code !== 0) return res.status(500).json({ error: `Git clone failed with code ${code}`, stderr });
          
          // If auto-load is enabled, try to load the skill
          let skillInfo = null;
          if (autoLoad) {
            try {
              const skillLoader = m.skillManager.skillLoader;
              const skill = skillLoader.loadSkill(sanitizedSkillName);
              if (skill) {
                skillInfo = {
                  name: skill.name,
                  version: skill.version,
                  description: skill.description,
                  loaded: true
                };
              }
            } catch (loadError) {
              console.warn('Auto-load failed:', loadError.message);
            }
          }
          
          res.json({ 
            ok: true, 
            name: sanitizedSkillName,
            dest, 
            stdout, 
            stderr,
            validation: validationResult ? m.validator.generateReport(validationResult) : null,
            skill: skillInfo
          });
        });
        
        gitProcess.on('error', (err) => {
          return res.status(500).json({ error: err.message, stderr });
        });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Stage C: Skill validation endpoint
    this.router.post('/validate', async (req, res) => {
      const { name, payloadBase64 } = req.body;
      if (!name || !payloadBase64) return res.status(400).json({ error: 'name and payloadBase64 required' });
      
      try {
        const buf = Buffer.from(payloadBase64, 'base64');
        const validationResult = await m.validator.validateZipPackage(buf, name);
        const report = m.validator.generateReport(validationResult);
        
        res.json({ ok: true, report });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Stage C: Get custom skills list
    this.router.get('/custom', async (req, res) => {
      try {
        const uploadsDir = path.join(process.cwd(), 'uploads', 'skills-custom');
        if (!fs.existsSync(uploadsDir)) {
          return res.json({ skills: [] });
        }
        
        const items = fs.readdirSync(uploadsDir);
        const skills = [];
        
        for (const item of items) {
          const itemPath = path.join(uploadsDir, item);
          const stats = fs.statSync(itemPath);
          
          if (stats.isFile() && item.endsWith('.zip')) {
            skills.push({
              name: path.basename(item, '.zip'),
              type: 'zip',
              size: stats.size,
              uploaded: stats.mtime,
              path: itemPath
            });
          } else if (stats.isDirectory()) {
            // Check if it's a skill directory
            const skillMdPath = path.join(itemPath, 'skill.md');
            const readmePath = path.join(itemPath, 'README.md');
            
            if (fs.existsSync(skillMdPath) || fs.existsSync(readmePath)) {
              skills.push({
                name: item,
                type: 'directory',
                uploaded: stats.mtime,
                path: itemPath
              });
            }
          }
        }
        
        res.json({ skills });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
  }

  _bindMarketplaceRoutes() {
    const m = this;

    // Marketplace: List skills
    this.router.get('/marketplace', async (req, res) => {
      try {
        const { category, author, search, sortBy = 'updatedAt', sortOrder = 'desc', limit = 50, offset = 0 } = req.query;
        
        const result = m.marketplace.listSkills({
          category,
          author,
          search,
          sortBy,
          sortOrder,
          limit: parseInt(limit),
          offset: parseInt(offset)
        });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Get skill details
    this.router.get('/marketplace/:skillId', async (req, res) => {
      try {
        const { skillId } = req.params;
        const skill = m.marketplace.getSkill(skillId);
        
        if (!skill) {
          return res.status(404).json({ error: 'Skill not found' });
        }
        
        // Record view
        await m.marketplace.recordView(skillId);
        
        // Track view in metrics
        const visitorId = req.headers['x-visitor-id'] || req.ip || 'anonymous';
        m.metrics.recordView(skill.name, visitorId);
        
        // Get stats and reviews
        const stats = m.marketplace.getStats(skillId);
        const reviews = m.marketplace.getReviews(skillId, { limit: 10 });
        
        res.json({ skill, stats, reviews });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Publish a skill with role-based access
    this.router.post('/marketplace/publish', async (req, res) => {
      // Check user role - only authorized users can publish to marketplace
      const userRole = req.headers['x-role'] || req.body.role || 'user';
      const allowedRoles = ['admin', 'developer', 'publisher'];
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Forbidden: Insufficient permissions to publish skills',
          requiredRoles: allowedRoles,
          currentRole: userRole
        });
      }
      
      try {
        const skillInfo = req.body;
        // Set author from user role if not provided
        if (!skillInfo.author) {
          skillInfo.author = req.headers['x-username'] || 'Anonymous';
        }
        
        const skill = await m.marketplace.publishSkill(skillInfo);
        res.json({ ok: true, skill });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Update a skill
    this.router.put('/marketplace/:skillId', async (req, res) => {
      try {
        const { skillId } = req.params;
        const updates = req.body;
        const skill = await m.marketplace.updateSkill(skillId, updates);
        res.json({ ok: true, skill });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Add review
    this.router.post('/marketplace/:skillId/reviews', async (req, res) => {
      try {
        const { skillId } = req.params;
        const review = req.body;
        const newReview = await m.marketplace.addReview(skillId, review);
        res.json({ ok: true, review: newReview });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Get reviews
    this.router.get('/marketplace/:skillId/reviews', async (req, res) => {
      try {
        const { skillId } = req.params;
        const { limit = 20, offset = 0, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        
        const result = m.marketplace.getReviews(skillId, {
          limit: parseInt(limit),
          offset: parseInt(offset),
          sortBy,
          sortOrder
        });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Download skill (increments count)
    this.router.post('/marketplace/:skillId/download', async (req, res) => {
      try {
        const { skillId } = req.params;
        const { downloader = 'anonymous' } = req.body;
        await m.marketplace.recordDownload(skillId, downloader);
        
        // Get skill name for metrics
        const skill = m.marketplace.getSkill(skillId);
        if (skill) {
          m.metrics.recordDownload(skill.name, downloader);
        }
        
        res.json({ ok: true, message: 'Download recorded' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Get statistics
    this.router.get('/marketplace/:skillId/stats', async (req, res) => {
      try {
        const { skillId } = req.params;
        const stats = m.marketplace.getStats(skillId);
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Search skills
    this.router.get('/marketplace/search', async (req, res) => {
      try {
        const { q, limit = 50, offset = 0 } = req.query;
        
        if (!q) {
          return res.status(400).json({ error: 'Search query required' });
        }
        
        const result = m.marketplace.searchSkills(q, {
          limit: parseInt(limit),
          offset: parseInt(offset)
        });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Get featured skills
    this.router.get('/marketplace/featured', async (req, res) => {
      try {
        const { limit = 10 } = req.query;
        const skills = m.marketplace.getFeaturedSkills(parseInt(limit));
        res.json({ skills });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Get popular skills
    this.router.get('/marketplace/popular', async (req, res) => {
      try {
        const { limit = 10 } = req.query;
        const skills = m.marketplace.getPopularSkills(parseInt(limit));
        res.json({ skills });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Get categories
    this.router.get('/marketplace/categories', async (req, res) => {
      try {
        const categories = m.marketplace.getCategories();
        res.json({ categories });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Get overall stats
    this.router.get('/marketplace/stats', async (req, res) => {
      try {
        const stats = m.marketplace.getMarketplaceStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Deprecate skill
    this.router.post('/marketplace/:skillId/deprecate', async (req, res) => {
      try {
        const { skillId } = req.params;
        const { reason = '' } = req.body;
        const skill = await m.marketplace.deprecateSkill(skillId, reason);
        res.json({ ok: true, skill });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Marketplace: Archive skill
    this.router.post('/marketplace/:skillId/archive', async (req, res) => {
      try {
        const { skillId } = req.params;
        const skill = await m.marketplace.archiveSkill(skillId);
        res.json({ ok: true, skill });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  _bindVersionRoutes() {
    const m = this;

    // Version Management: Create new version with role-based access
    this.router.post('/versions/:skillName', async (req, res) => {
      // Check user role - only skill owners, developers, or admins can create versions
      const userRole = req.headers['x-role'] || req.body.role || 'user';
      const allowedRoles = ['admin', 'developer', 'maintainer'];
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Forbidden: Insufficient permissions to create versions',
          requiredRoles: allowedRoles,
          currentRole: userRole
        });
      }
      
      try {
        const { skillName } = req.params;
        const versionInfo = req.body;
        
        // Set author from user if not provided
        if (!versionInfo.author) {
          versionInfo.author = req.headers['x-username'] || 'Anonymous';
        }
        
        // Validate version format (SemVer)
        if (versionInfo.version && !this._isValidSemVer(versionInfo.version)) {
          return res.status(400).json({ 
            error: 'Invalid version format',
            message: 'Version must follow Semantic Versioning (e.g., 1.0.0)',
            providedVersion: versionInfo.version
          });
        }
        
        const version = await m.versionManager.createVersion(skillName, versionInfo);
        res.json({ ok: true, version });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Get current version
    this.router.get('/versions/:skillName/current', async (req, res) => {
      try {
        const { skillName } = req.params;
        const version = m.versionManager.getCurrentVersion(skillName);
        if (!version) {
          return res.status(404).json({ error: 'No current version found' });
        }
        res.json(version);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Get version history
    this.router.get('/versions/:skillName/history', async (req, res) => {
      try {
        const { skillName } = req.params;
        const { limit = 50, offset = 0, status } = req.query;
        
        const result = m.versionManager.getVersionHistory(skillName, {
          limit: parseInt(limit),
          offset: parseInt(offset),
          status
        });
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Get specific version
    this.router.get('/versions/:skillName/:version', async (req, res) => {
      try {
        const { skillName, version } = req.params;
        const versionData = m.versionManager.getVersion(skillName, version);
        if (!versionData) {
          return res.status(404).json({ error: 'Version not found' });
        }
        res.json(versionData);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Update version status
    this.router.put('/versions/:skillName/:version/status', async (req, res) => {
      try {
        const { skillName, version } = req.params;
        const { status, reason = '' } = req.body;
        const updatedVersion = await m.versionManager.updateVersionStatus(skillName, version, status, reason);
        res.json({ ok: true, version: updatedVersion });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Rollback to previous version
    this.router.post('/versions/:skillName/rollback', async (req, res) => {
      try {
        const { skillName } = req.params;
        const { targetVersion } = req.body;
        const result = await m.versionManager.rollback(skillName, targetVersion);
        res.json({ ok: true, result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Get latest version
    this.router.get('/versions/:skillName/latest', async (req, res) => {
      try {
        const { skillName } = req.params;
        const version = m.versionManager.getLatestVersion(skillName);
        if (!version) {
          return res.status(404).json({ error: 'No versions found' });
        }
        res.json(version);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Get compatible versions
    this.router.post('/versions/:skillName/compatible', async (req, res) => {
      try {
        const { skillName } = req.params;
        const requirements = req.body;
        const versions = m.versionManager.getCompatibleVersions(skillName, requirements);
        res.json({ versions });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Create version from package
    this.router.post('/versions/:skillName/from-package', async (req, res) => {
      try {
        const { skillName } = req.params;
        const { packagePath, version, description, changelog, author } = req.body;
        
        if (!packagePath) {
          return res.status(400).json({ error: 'packagePath required' });
        }
        
        const versionData = await m.versionManager.createVersionFromPackage(skillName, packagePath, {
          version,
          description,
          changelog,
          author
        });
        
        res.json({ ok: true, version: versionData });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Get all versions (across all skills)
    this.router.get('/versions', async (req, res) => {
      try {
        const { skillName, status, sortBy = 'createdAt', sortOrder = 'desc', limit = 100 } = req.query;
        
        const versions = m.versionManager.getAllVersions({
          skillName,
          status,
          sortBy,
          sortOrder,
          limit: parseInt(limit)
        });
        
        res.json({ versions });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Get version statistics
    this.router.get('/versions/stats', async (req, res) => {
      try {
        const stats = m.versionManager.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Version Management: Check if version exists
    this.router.get('/versions/:skillName/:version/exists', async (req, res) => {
      try {
        const { skillName, version } = req.params;
        const exists = m.versionManager.versionExists(skillName, version);
        res.json({ exists });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Validate Semantic Version format
   */
  _isValidSemVer(version) {
    // Basic SemVer validation: major.minor.patch
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(version);
  }

  getRouter() {
    return this.router;
  }
}

/**
 * Skill Auto Router - 自动技能路由
 */
class SkillAutoRouter {
  constructor(skillAutoLoader) {
    this.router = express.Router();
    this.skillAutoLoader = skillAutoLoader;
    this._setupRoutes();
  }

  _setupRoutes() {
    // 自动技能检测 - 根据消息返回应加载的技能
    this.router.post('/auto-detect', async (req, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        const result = this.skillAutoLoader.getSkillsForMessage(message);
        
        res.json({
          ok: true,
          taskType: result.taskType,
          skills: result.skills,
          shouldLoad: result.shouldLoad,
          config: this.skillAutoLoader.getConfig()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 获取启动配置
    this.router.get('/startup', async (req, res) => {
      try {
        res.json({
          ok: true,
          enabled: this.skillAutoLoader.isEnabled(),
          startupSkills: this.skillAutoLoader.getStartupSkills(),
          rules: this.skillAutoLoader.getRules()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 获取所有配置技能
    this.router.get('/config', async (req, res) => {
      try {
        res.json({
          ok: true,
          skills: this.skillAutoLoader.getConfiguredSkills()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 根据任务类型获取技能
    this.router.get('/type/:taskType', async (req, res) => {
      try {
        const { taskType } = req.params;
        const skills = this.skillAutoLoader.getSkillsForTaskType(taskType);
        
        res.json({
          ok: true,
          taskType,
          skills
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  getRouter() {
    return this.router;
  }
}

module.exports = { SkillsApi, SkillAutoRouter };

module.exports = { SkillsApi };
