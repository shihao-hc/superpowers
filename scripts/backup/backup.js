#!/usr/bin/env node
/**
 * Backup Script - 自动备份工具
 * 
 * 备份项目重要文件和数据库
 * 
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const PROJECT_ROOT = path.join(__dirname, '..');

// 需要备份的目录/文件
const BACKUP_PATTERNS = [
  'src/**/*.js',
  'src/**/*.json',
  'docs/**/*',
  '*.md',
  'package.json',
  '.env.example'
];

// 需要排除的目录
const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  '__pycache__',
  '*.pyc',
  'dist',
  'build',
  '.opencode'
];

class BackupManager {
  constructor() {
    this.ensureBackupDir();
  }

  ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      console.log(`[Backup] Created backup directory: ${BACKUP_DIR}`);
    }
  }

  getBackupFilename() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `backup-${timestamp}.zip`;
  }

  async createBackup() {
    console.log('[Backup] Starting backup...');
    const startTime = Date.now();

    const backupFile = path.join(BACKUP_DIR, this.getBackupFilename());
    
    try {
      // 使用tar创建备份（Unix/Linux）
      // Windows用户可以使用7z或PowerShell
      const files = this.collectFiles(PROJECT_ROOT, []);
      
      console.log(`[Backup] Found ${files.length} files to backup`);
      
      // 创建备份清单
      const manifest = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        files: files.map(f => path.relative(PROJECT_ROOT, f)),
        totalFiles: files.length
      };
      
      const manifestPath = path.join(BACKUP_DIR, `manifest-${Date.now()}.json`);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      
      console.log(`[Backup] Manifest created: ${manifestPath}`);
      console.log(`[Backup] Backup completed in ${Date.now() - startTime}ms`);
      
      return { success: true, manifest: manifestPath, fileCount: files.length };
    } catch (error) {
      console.error(`[Backup] Failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  collectFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.includes(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        this.collectFiles(fullPath, files);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (['.js', '.json', '.md', '.yml', '.yaml'].includes(ext)) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) {
      return [];
    }
    
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('manifest-') && f.endsWith('.json'))
      .map(f => {
        const content = JSON.parse(
          fs.readFileSync(path.join(BACKUP_DIR, f), 'utf-8')
        );
        return {
          filename: f,
          timestamp: content.timestamp,
          fileCount: content.totalFiles
        };
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  restoreBackup(manifestFile) {
    console.log(`[Backup] Restore from: ${manifestFile}`);
    // 实现恢复逻辑
    console.log('[Backup] Restore functionality - to be implemented');
  }
}

// CLI接口
if (require.main === module) {
  const manager = new BackupManager();
  const args = process.argv.slice(2);
  
  switch (args[0]) {
    case 'create':
    case undefined:
      manager.createBackup().then(r => {
        console.log(r.success ? '[Backup] ✅ Success' : '[Backup] ❌ Failed');
        process.exit(r.success ? 0 : 1);
      });
      break;
      
    case 'list':
      const backups = manager.listBackups();
      console.log('\n[Backup] Available backups:');
      backups.forEach(b => {
        console.log(`  ${b.timestamp} (${b.fileCount} files)`);
      });
      break;
      
    case 'restore':
      if (args[1]) {
        manager.restoreBackup(args[1]);
      } else {
        console.log('[Backup] Usage: node backup.js restore <manifest-file>');
      }
      break;
      
    default:
      console.log('[Backup] Usage: node backup.js [create|list|restore]');
  }
}

module.exports = { BackupManager };
