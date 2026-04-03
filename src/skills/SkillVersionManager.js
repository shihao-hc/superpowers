const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SkillVersionManager {
  constructor(options = {}) {
    this.versionsDir = options.versionsDir || path.join(process.cwd(), 'uploads', 'skill-versions');
    this.currentVersions = new Map(); // skillName -> current version info
    this.versionHistory = new Map(); // skillName -> array of versions
    
    this._ensureDirectories();
    this._loadVersionData();
  }

  _ensureDirectories() {
    if (!fs.existsSync(this.versionsDir)) {
      fs.mkdirSync(this.versionsDir, { recursive: true });
    }
  }

  _loadVersionData() {
    try {
      const dataFile = path.join(this.versionsDir, 'versions.json');
      if (fs.existsSync(dataFile)) {
        const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        this.currentVersions = new Map(data.currentVersions || []);
        this.versionHistory = new Map(data.versionHistory || []);
      }
    } catch (error) {
      console.warn('Failed to load version data:', error.message);
    }
  }

  _saveVersionData() {
    try {
      const dataFile = path.join(this.versionsDir, 'versions.json');
      const data = {
        currentVersions: Array.from(this.currentVersions.entries()),
        versionHistory: Array.from(this.versionHistory.entries()),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save version data:', error.message);
    }
  }

  /**
   * Create a new version for a skill
   * @param {string} skillName - Skill name
   * @param {Object} versionInfo - Version information
   * @returns {Promise<Object>} Created version
   */
  async createVersion(skillName, versionInfo) {
    const { 
      version,
      description = '',
      changelog = '',
      author = 'system',
      files = [],
      dependencies = [],
      compatibility = {},
      metadata = {}
    } = versionInfo;

    if (!version) {
      throw new Error('Version number is required');
    }

    // Validate version format (semver-like)
    if (!this._isValidVersion(version)) {
      throw new Error('Invalid version format. Use semantic versioning (e.g., 1.0.0)');
    }

    const versionId = this._generateVersionId(skillName, version);
    const now = new Date().toISOString();

    const versionData = {
      id: versionId,
      skillName,
      version,
      description,
      changelog,
      author,
      files,
      dependencies,
      compatibility,
      metadata,
      createdAt: now,
      updatedAt: now,
      status: 'active', // active, deprecated, archived
      checksum: this._generateChecksum(versionInfo),
      size: this._calculateSize(files)
    };

    // Store version
    const history = this.versionHistory.get(skillName) || [];
    history.push(versionData);
    this.versionHistory.set(skillName, history);

    // Update current version
    this.currentVersions.set(skillName, versionData);

    // Create version directory
    const versionDir = this._getVersionDir(skillName, version);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    // Store version metadata
    const metadataFile = path.join(versionDir, 'version.json');
    fs.writeFileSync(metadataFile, JSON.stringify(versionData, null, 2));

    this._saveVersionData();

    return versionData;
  }

  /**
   * Get current version of a skill
   * @param {string} skillName - Skill name
   * @returns {Object|null} Current version
   */
  getCurrentVersion(skillName) {
    return this.currentVersions.get(skillName) || null;
  }

  /**
   * Get version history for a skill
   * @param {string} skillName - Skill name
   * @param {Object} options - Options
   * @returns {Array} Version history
   */
  getVersionHistory(skillName, options = {}) {
    const { limit = 50, offset = 0, status = null } = options;
    
    let versions = this.versionHistory.get(skillName) || [];
    
    // Filter by status
    if (status) {
      versions = versions.filter(v => v.status === status);
    }
    
    // Sort by version (newest first)
    versions.sort((a, b) => this._compareVersions(b.version, a.version));
    
    // Paginate
    const total = versions.length;
    const paginatedVersions = versions.slice(offset, offset + limit);

    return {
      versions: paginatedVersions,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  /**
   * Get a specific version
   * @param {string} skillName - Skill name
   * @param {string} version - Version number
   * @returns {Object|null} Version data
   */
  getVersion(skillName, version) {
    const history = this.versionHistory.get(skillName) || [];
    return history.find(v => v.version === version) || null;
  }

  /**
   * Update version status
   * @param {string} skillName - Skill name
   * @param {string} version - Version number
   * @param {string} status - New status
   * @param {string} reason - Reason for change
   * @returns {Promise<Object>} Updated version
   */
  async updateVersionStatus(skillName, version, status, reason = '') {
    const history = this.versionHistory.get(skillName) || [];
    const versionIndex = history.findIndex(v => v.version === version);
    
    if (versionIndex === -1) {
      throw new Error(`Version ${version} not found for skill ${skillName}`);
    }

    const versionData = history[versionIndex];
    versionData.status = status;
    versionData.updatedAt = new Date().toISOString();
    
    if (reason) {
      versionData.statusChangeReason = reason;
    }

    // Update current version if this was the current version
    const current = this.currentVersions.get(skillName);
    if (current && current.version === version) {
      if (status !== 'active') {
        // Find the next active version
        const activeVersions = history.filter(v => v.status === 'active' && v.version !== version);
        if (activeVersions.length > 0) {
          // Get the highest active version
          activeVersions.sort((a, b) => this._compareVersions(b.version, a.version));
          this.currentVersions.set(skillName, activeVersions[0]);
        } else {
          this.currentVersions.delete(skillName);
        }
      }
    }

    this._saveVersionData();
    return versionData;
  }

  /**
   * Rollback to a previous version
   * @param {string} skillName - Skill name
   * @param {string} targetVersion - Target version to rollback to
   * @returns {Promise<Object>} Rollback result
   */
  async rollback(skillName, targetVersion) {
    const current = this.getCurrentVersion(skillName);
    if (!current) {
      throw new Error(`No current version found for skill ${skillName}`);
    }

    const target = this.getVersion(skillName, targetVersion);
    if (!target) {
      throw new Error(`Target version ${targetVersion} not found for skill ${skillName}`);
    }

    if (target.status !== 'active') {
      throw new Error(`Cannot rollback to inactive version ${targetVersion}`);
    }

    // Create a new version based on the target (with incremented patch version)
    const newVersion = this._incrementVersion(current.version, 'patch');
    const rollbackVersion = await this.createVersion(skillName, {
      version: newVersion,
      description: `Rollback to version ${targetVersion}`,
      changelog: `Rolled back from ${current.version} to ${targetVersion}`,
      author: 'system-rollback',
      files: target.files,
      dependencies: target.dependencies,
      compatibility: target.compatibility,
      metadata: {
        ...target.metadata,
        rollback: {
          from: current.version,
          to: targetVersion,
          timestamp: new Date().toISOString()
        }
      }
    });

    // Mark the previous current version as superseded
    await this.updateVersionStatus(skillName, current.version, 'superseded', `Rolled back to ${targetVersion}`);

    return {
      rollback: true,
      from: current.version,
      to: targetVersion,
      newVersion: rollbackVersion.version,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Compare two versions
   * @param {string} v1 - Version 1
   * @param {string} v2 - Version 2
   * @returns {number} Comparison result (-1, 0, 1)
   */
  _compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    
    return 0;
  }

  /**
   * Increment version number
   * @param {string} version - Current version
   * @param {string} type - Increment type (major, minor, patch)
   * @returns {string} New version
   */
  _incrementVersion(version, type = 'patch') {
    const parts = version.split('.').map(Number);
    
    switch (type) {
      case 'major':
        parts[0] += 1;
        parts[1] = 0;
        parts[2] = 0;
        break;
      case 'minor':
        parts[1] += 1;
        parts[2] = 0;
        break;
      case 'patch':
      default:
        parts[2] += 1;
        break;
    }
    
    return parts.join('.');
  }

  /**
   * Validate version format
   * @param {string} version - Version to validate
   * @returns {boolean} Is valid
   */
  _isValidVersion(version) {
    return /^\d+\.\d+\.\d+$/.test(version);
  }

  /**
   * Generate version ID - 使用SHA-256替代MD5
   * @param {string} skillName - Skill name
   * @param {string} version - Version number
   * @returns {string} Version ID
   */
  _generateVersionId(skillName, version) {
    const hash = crypto.createHash('sha256').update(`${skillName}-${version}`).digest('hex');
    return `${skillName}-v${version}-${hash.substring(0, 12)}`;
  }

  /**
   * Generate checksum for version data
   * @param {Object} data - Data to checksum
   * @returns {string} Checksum
   */
  _generateChecksum(data) {
    const content = JSON.stringify(data);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Calculate size of files
   * @param {Array} files - Array of file paths
   * @returns {number} Total size in bytes
   */
  _calculateSize(files) {
    // In a real implementation, this would calculate actual file sizes
    // For now, return a placeholder
    return files.length * 1024; // Assume 1KB per file
  }

  /**
   * Get version directory
   * @param {string} skillName - Skill name
   * @param {string} version - Version number
   * @returns {string} Version directory path
   */
  _getVersionDir(skillName, version) {
    return path.join(this.versionsDir, skillName, `v${version}`);
  }

  /**
   * Get all versions across all skills
   * @param {Object} options - Options
   * @returns {Array} All versions
   */
  getAllVersions(options = {}) {
    const { skillName, status, sortBy = 'createdAt', sortOrder = 'desc', limit = 100 } = options;
    
    let allVersions = [];
    
    for (const [name, versions] of this.versionHistory.entries()) {
      if (skillName && name !== skillName) continue;
      
      for (const version of versions) {
        if (status && version.status !== status) continue;
        allVersions.push({ ...version, skillName: name });
      }
    }
    
    // Sort
    allVersions.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      return sortOrder === 'desc' ? (aVal < bVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
    });
    
    // Limit
    return allVersions.slice(0, limit);
  }

  /**
   * Get version statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const skills = Array.from(this.versionHistory.keys());
    let totalVersions = 0;
    let activeVersions = 0;
    
    for (const versions of this.versionHistory.values()) {
      totalVersions += versions.length;
      activeVersions += versions.filter(v => v.status === 'active').length;
    }
    
    return {
      totalSkills: skills.length,
      totalVersions,
      activeVersions,
      averageVersionsPerSkill: skills.length > 0 ? totalVersions / skills.length : 0
    };
  }

  /**
   * Check if a version exists
   * @param {string} skillName - Skill name
   * @param {string} version - Version number
   * @returns {boolean} Exists
   */
  versionExists(skillName, version) {
    return this.getVersion(skillName, version) !== null;
  }

  /**
   * Get latest version
   * @param {string} skillName - Skill name
   * @returns {Object|null} Latest version
   */
  getLatestVersion(skillName) {
    const history = this.versionHistory.get(skillName) || [];
    if (history.length === 0) return null;
    
    // Sort by version (newest first)
    const sorted = [...history].sort((a, b) => this._compareVersions(b.version, a.version));
    return sorted[0];
  }

  /**
   * Get compatible versions
   * @param {string} skillName - Skill name
   * @param {Object} requirements - Compatibility requirements
   * @returns {Array} Compatible versions
   */
  getCompatibleVersions(skillName, requirements = {}) {
    const history = this.versionHistory.get(skillName) || [];
    
    return history.filter(version => {
      if (version.status !== 'active') return false;
      
      // Check compatibility requirements
      if (requirements.minVersion && this._compareVersions(version.version, requirements.minVersion) < 0) {
        return false;
      }
      
      if (requirements.maxVersion && this._compareVersions(version.version, requirements.maxVersion) > 0) {
        return false;
      }
      
      // Check dependency compatibility
      if (requirements.dependencies) {
        const versionDeps = version.dependencies || [];
        for (const [dep, depVersion] of Object.entries(requirements.dependencies)) {
          const hasDep = versionDeps.some(d => d.name === dep && d.version === depVersion);
          if (!hasDep) return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Create version from skill package
   * @param {string} skillName - Skill name
   * @param {string} packagePath - Path to skill package
   * @param {Object} options - Options
   * @returns {Promise<Object>} Created version
   */
  async createVersionFromPackage(skillName, packagePath, options = {}) {
    const { 
      version,
      description = '',
      changelog = '',
      author = 'system'
    } = options;

    // Read skill.md if exists
    let skillData = {};
    const skillMdPath = path.join(packagePath, 'skill.md');
    const readmePath = path.join(packagePath, 'README.md');
    
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf8');
      skillData = this._parseSkillMd(content);
    } else if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, 'utf8');
      skillData = this._parseSkillMd(content);
    }

    // Get version from skill data or use provided version
    const finalVersion = version || skillData.version || '1.0.0';
    
    // List all files in package
    const files = this._listFilesRecursive(packagePath);
    
    return this.createVersion(skillName, {
      version: finalVersion,
      description: description || skillData.description || '',
      changelog,
      author,
      files,
      dependencies: skillData.dependencies || [],
      compatibility: skillData.compatibility || {},
      metadata: {
        ...skillData,
        packagePath
      }
    });
  }

  /**
   * Parse skill.md content
   */
  _parseSkillMd(content) {
    const result = {
      name: '',
      description: '',
      version: '1.0.0',
      dependencies: []
    };

    try {
      // Simple parsing
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('# ') || line.startsWith('## ')) {
          result.description = line.substring(2);
          break;
        }
      }
    } catch (error) {
      // Ignore parsing errors
    }

    return result;
  }

  /**
   * List files recursively
   */
  _listFilesRecursive(dirPath, basePath = '') {
    const files = [];
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const relativePath = basePath ? `${basePath}/${item}` : item;
      
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        if (!item.startsWith('.') && item !== 'node_modules') {
          files.push(...this._listFilesRecursive(itemPath, relativePath));
        }
      } else {
        files.push(relativePath);
      }
    }
    
    return files;
  }
}

module.exports = { SkillVersionManager };