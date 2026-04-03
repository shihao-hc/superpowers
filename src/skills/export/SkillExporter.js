/**
 * Skill Export/Import System
 * 提供技能导出/导入功能，便于迁移和备份
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const unzipper = require('unzipper');

class SkillExporter {
  constructor(options = {}) {
    this.exportDir = options.exportDir || path.join(process.cwd(), 'data', 'exports', 'skills');
    this.tempDir = options.tempDir || path.join(process.cwd(), 'temp', 'exports');
    
    this._ensureDirectories();
  }

  _ensureDirectories() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * 导出单个技能
   */
  async exportSkill(skillData, options = {}) {
    const {
      includeVersions = true,
      includeDependencies = true,
      includeMetadata = true,
      format = 'zip'
    } = options;

    const skillId = skillData.id || skillData.name;
    const exportId = `export-${skillId}-${Date.now()}`;
    
    // 准备导出数据
    const exportData = {
      format: 'ultrawork-skill-export',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      skill: {
        id: skillData.id,
        name: skillData.name,
        version: skillData.version,
        description: skillData.description,
        author: skillData.author,
        category: skillData.category,
        tags: skillData.tags || [],
        riskLevel: skillData.riskLevel,
        dependencies: skillData.dependencies || [],
        metadata: includeMetadata ? {
          createdAt: skillData.createdAt,
          updatedAt: skillData.updatedAt,
          downloads: skillData.downloads || 0,
          rating: skillData.rating || 0
        } : null
      }
    };

    // 如果需要版本历史
    if (includeVersions && skillData.versionHistory) {
      exportData.versions = skillData.versionHistory;
    }

    // 生成导出文件名
    const filename = `${skillData.name}-v${skillData.version || '1.0.0'}-${Date.now()}.zip`;
    const exportPath = path.join(this.exportDir, filename);

    try {
      // 创建ZIP文件
      await this._createZipArchive(exportPath, exportData, skillData);
      
      // 计算校验和
      const checksum = await this._calculateChecksum(exportPath);
      const stats = fs.statSync(exportPath);

      return {
        exportId,
        filename,
        path: exportPath,
        size: stats.size,
        checksum,
        format,
        exportedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * 导出技能包（多个技能）
   */
  async exportBundle(skillIds, skillManager, options = {}) {
    const exportId = `bundle-${Date.now()}`;
    const skills = [];

    // 收集所有技能数据
    for (const skillId of skillIds) {
      const skillData = skillManager.getSkillInfo ? 
        skillManager.getSkillInfo(skillId) : null;
      
      if (skillData) {
        skills.push(skillData);
      }
    }

    if (skills.length === 0) {
      throw new Error('No valid skills found for export');
    }

    const bundleData = {
      format: 'ultrawork-bundle-export',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      bundle: {
        name: options.name || 'skill-bundle',
        description: options.description || `Exported ${skills.length} skills`,
        skillCount: skills.length,
        skills: skills.map(s => ({
          id: s.id,
          name: s.name,
          version: s.version
        }))
      },
      skills: skills
    };

    // 生成导出文件名
    const filename = `bundle-${options.name || 'skills'}-${Date.now()}.zip`;
    const exportPath = path.join(this.exportDir, filename);

    try {
      await this._createZipArchive(exportPath, bundleData, null, true);
      
      const checksum = await this._calculateChecksum(exportPath);
      const stats = fs.statSync(exportPath);

      return {
        exportId,
        filename,
        path: exportPath,
        size: stats.size,
        checksum,
        skillCount: skills.length,
        exportedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Bundle export failed: ${error.message}`);
    }
  }

  /**
   * 导入技能
   */
  async importSkill(importPath, options = {}) {
    const { overwrite = false, validateIntegrity = true } = options;

    try {
      // 读取ZIP文件
      const zipData = await unzipper.Open.file(importPath);
      
      // 查找元数据文件
      const metadataFile = zipData.files.find(f => 
        f.path === 'export-metadata.json' || 
        f.path.endsWith('.json')
      );

      if (!metadataFile) {
        throw new Error('Invalid import file: missing metadata');
      }

      // 读取元数据
      const metadataContent = await metadataFile.buffer();
      const metadata = JSON.parse(metadataContent.toString());

      // 验证格式
      if (!metadata.format || !metadata.format.startsWith('ultrawork-')) {
        throw new Error('Invalid import format');
      }

      // 验证完整性
      if (validateIntegrity && metadata.checksum) {
        const fileChecksum = await this._calculateChecksum(importPath);
        if (fileChecksum !== metadata.checksum) {
          throw new Error('Checksum mismatch - file may be corrupted');
        }
      }

      // 提取技能数据
      let skillData = null;
      let skillsData = [];

      if (metadata.skill) {
        skillData = metadata.skill;
      } else if (metadata.skills) {
        skillsData = metadata.skills;
      }

      return {
        success: true,
        format: metadata.format,
        version: metadata.version,
        skill: skillData,
        skills: skillsData,
        exportedAt: metadata.exportedAt,
        importedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  /**
   * 创建ZIP归档
   */
  async _createZipArchive(outputPath, data, skillData, isBundle = false) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', reject);

      archive.pipe(output);

      // 添加元数据
      archive.append(JSON.stringify(data, null, 2), { name: 'export-metadata.json' });

      // 如果有技能文件
      if (skillData && skillData.files) {
        for (const file of skillData.files) {
          if (file.content) {
            archive.append(file.content, { name: `files/${file.name}` });
          } else if (file.path && fs.existsSync(file.path)) {
            archive.file(file.path, { name: `files/${file.name || path.basename(file.path)}` });
          }
        }
      }

      // 添加skill.md
      if (skillData && skillData.skillMd) {
        archive.append(skillData.skillMd, { name: 'skill.md' });
      }

      archive.finalize();
    });
  }

  /**
   * 计算文件校验和
   */
  async _calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * 导出到云存储
   */
  async exportToCloud(skillData, storageAdapter, options = {}) {
    const exportResult = await this.exportSkill(skillData, options);
    
    // 上传到云存储
    const fileBuffer = fs.readFileSync(exportResult.path);
    const uploadResult = await storageAdapter.upload(fileBuffer, {
      key: `skill-exports/${exportResult.filename}`,
      contentType: 'application/zip',
      metadata: {
        skillId: skillData.id,
        skillName: skillData.name,
        version: skillData.version,
        exportedAt: exportResult.exportedAt
      }
    });

    // 清理本地文件
    fs.unlinkSync(exportResult.path);

    return {
      ...exportResult,
      cloudUrl: uploadResult.url,
      cloudKey: uploadResult.key
    };
  }

  /**
   * 从云存储导入
   */
  async importFromCloud(cloudKey, storageAdapter, options = {}) {
    // 下载文件
    const downloadResult = await storageAdapter.download(cloudKey);
    
    // 保存到临时文件
    const tempPath = path.join(this.tempDir, `import-${Date.now()}.zip`);
    fs.writeFileSync(tempPath, downloadResult.buffer);

    try {
      // 导入
      const importResult = await this.importSkill(tempPath, options);
      
      // 清理临时文件
      fs.unlinkSync(tempPath);
      
      return importResult;
    } catch (error) {
      // 清理临时文件
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  /**
   * 备份所有技能
   */
  async backupAllSkills(skillManager, options = {}) {
    const skills = skillManager.getAllSkills ? skillManager.getAllSkills() : [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}`;
    
    const skillIds = skills.map(s => s.id || s.name);
    
    return this.exportBundle(skillIds, skillManager, {
      name: backupName,
      description: `Full backup of ${skills.length} skills`,
      ...options
    });
  }

  /**
   * 生成导出报告
   */
  generateReport(exportResult) {
    return {
      summary: {
        exportId: exportResult.exportId,
        filename: exportResult.filename,
        size: this._formatSize(exportResult.size),
        checksum: exportResult.checksum,
        exportedAt: exportResult.exportedAt
      },
      verification: {
        checksumAlgorithm: 'SHA-256',
        format: exportResult.format || 'zip'
      }
    };
  }

  /**
   * 格式化文件大小
   */
  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * 列出本地导出文件
   */
  listExports(limit = 50) {
    try {
      const files = fs.readdirSync(this.exportDir)
        .filter(f => f.endsWith('.zip'))
        .map(f => {
          const filePath = path.join(this.exportDir, f);
          const stats = fs.statSync(filePath);
          return {
            filename: f,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
          };
        })
        .sort((a, b) => b.modifiedAt - a.modifiedAt)
        .slice(0, limit);
      
      return files;
    } catch (error) {
      return [];
    }
  }

  /**
   * 删除导出文件
   */
  deleteExport(filename) {
    const filePath = path.join(this.exportDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { deleted: true };
    }
    return { deleted: false, error: 'File not found' };
  }

  /**
   * 清理过期导出文件
   */
  cleanupOldExports(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
    const now = Date.now();
    const files = this.listExports();
    let deletedCount = 0;

    for (const file of files) {
      if (now - file.modifiedAt.getTime() > maxAge) {
        this.deleteExport(file.filename);
        deletedCount++;
      }
    }

    return { deleted: deletedCount };
  }
}

module.exports = { SkillExporter };
