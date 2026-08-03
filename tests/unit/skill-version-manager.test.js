const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('path');
jest.mock('../../src/utils/UltraWorkUtils', () => ({
  splitLines: jest.fn((c) => (c || '').replace(/\r\n/g, '\n').split('\n'))
}));

describe('SkillVersionManager', () => {
  let SkillVersionManager;
  let manager;

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    path.join.mockImplementation((...args) => args.join('/'));
    path.basename = jest.fn((p) => p.split('/').pop());
    path.dirname = jest.fn((p) => p.split('/').slice(0, -1).join('/'));
    path.resolve = jest.fn((...args) => args.join('/'));
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
    fs.readdirSync.mockReturnValue([]);
    fs.statSync.mockReturnValue({ isDirectory: () => false });
    jest.isolateModules(() => {
      SkillVersionManager = require('../../src/skills/SkillVersionManager');
      SkillVersionManager = SkillVersionManager.SkillVersionManager || SkillVersionManager;
      manager = new SkillVersionManager({ versionsDir: '/tmp/versions' });
    });
  });

  describe('constructor', () => {
    it('creates instance with default versionsDir', () => {
      const m = new SkillVersionManager();
      expect(m.versionsDir).toBeDefined();
      expect(m.currentVersions).toBeInstanceOf(Map);
      expect(m.versionHistory).toBeInstanceOf(Map);
    });

    it('creates instance with custom versionsDir', () => {
      expect(manager.versionsDir).toBe('/tmp/versions');
    });

    it('ensures directories on construction', () => {
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('loads version data if versions.json exists', () => {
      jest.clearAllMocks();
      const data = {
        currentVersions: [['test-skill', { version: '1.0.0' }]],
        versionHistory: [['test-skill', [{ version: '1.0.0' }]]]
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(data));
      const m = new SkillVersionManager({ versionsDir: '/tmp/versions' });
      expect(m.getCurrentVersion('test-skill')).toEqual({ version: '1.0.0' });
    });

    it('handles JSON parse error gracefully', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');
      const m = new SkillVersionManager({ versionsDir: '/tmp/versions' });
      expect(m.currentVersions.size).toBe(0);
    });
  });

  describe('_saveVersionData', () => {
    it('writes version data to file', () => {
      manager._saveVersionData();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/versions/versions.json',
        expect.any(String)
      );
    });

    it('handles write errors gracefully', () => {
      fs.writeFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
      expect(() => manager._saveVersionData()).not.toThrow();
    });
  });

  describe('createVersion', () => {
    it('creates a new version', async () => {
      const version = await manager.createVersion('my-skill', {
        version: '1.0.0',
        description: 'Initial release',
        author: 'test-user'
      });

      expect(version).toMatchObject({
        skillName: 'my-skill',
        version: '1.0.0',
        description: 'Initial release',
        author: 'test-user',
        status: 'active'
      });
      expect(version.id).toBeDefined();
      expect(version.checksum).toBeDefined();
      expect(version.createdAt).toBeDefined();
      expect(version.size).toBe(0);
    });

    it('throws if version number is missing', async () => {
      await expect(manager.createVersion('my-skill', {}))
        .rejects.toThrow('Version number is required');
    });

    it('throws if version format is invalid', async () => {
      await expect(manager.createVersion('my-skill', { version: 'abc' }))
        .rejects.toThrow('Invalid version format');
    });

    it('creates version directory', async () => {
      await manager.createVersion('my-skill', { version: '2.0.0' });
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/tmp/versions/my-skill/v2.0.0',
        { recursive: true }
      );
    });

    it('stores version metadata file', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/versions/my-skill/v1.0.0/version.json',
        expect.any(String)
      );
    });

    it('uses defaults for optional fields', async () => {
      const version = await manager.createVersion('my-skill', { version: '1.0.0' });
      expect(version.author).toBe('system');
      expect(version.description).toBe('');
      expect(version.changelog).toBe('');
      expect(version.files).toEqual([]);
      expect(version.dependencies).toEqual([]);
      expect(version.compatibility).toEqual({});
      expect(version.metadata).toEqual({});
    });

    it('appends to existing version history', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.createVersion('my-skill', { version: '2.0.0' });
      const history = manager.getVersionHistory('my-skill');
      expect(history.total).toBe(2);
    });

    it('updates current version', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      expect(manager.getCurrentVersion('my-skill').version).toBe('1.0.0');
    });

    it('computes size as files.length * 1024', async () => {
      const version = await manager.createVersion('my-skill', {
        version: '1.0.0',
        files: ['a.js', 'b.js', 'c.js']
      });
      expect(version.size).toBe(3072);
    });
  });

  describe('getCurrentVersion', () => {
    it('returns current version for a skill', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      const current = manager.getCurrentVersion('my-skill');
      expect(current.version).toBe('1.0.0');
    });

    it('returns null if no version exists', () => {
      expect(manager.getCurrentVersion('nonexistent')).toBeNull();
    });

    it('returns null for a skill with no versions', () => {
      expect(manager.getCurrentVersion('unknown-skill')).toBeNull();
    });
  });

  describe('getVersionHistory', () => {
    it('returns empty history for unknown skill', () => {
      const result = manager.getVersionHistory('unknown');
      expect(result.versions).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns versions sorted newest first', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.createVersion('my-skill', { version: '2.0.0' });
      await manager.createVersion('my-skill', { version: '3.0.0' });

      const result = manager.getVersionHistory('my-skill');
      expect(result.versions[0].version).toBe('3.0.0');
      expect(result.versions[1].version).toBe('2.0.0');
      expect(result.versions[2].version).toBe('1.0.0');
    });

    it('filters by status', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.createVersion('my-skill', { version: '2.0.0' });
      await manager.updateVersionStatus('my-skill', '2.0.0', 'deprecated');

      const active = manager.getVersionHistory('my-skill', { status: 'active' });
      expect(active.versions.length).toBe(1);
      expect(active.versions[0].version).toBe('1.0.0');

      const deprecated = manager.getVersionHistory('my-skill', { status: 'deprecated' });
      expect(deprecated.versions.length).toBe(1);
      expect(deprecated.versions[0].version).toBe('2.0.0');
    });

    it('paginates with limit and offset', async () => {
      for (let i = 1; i <= 10; i++) {
        await manager.createVersion('my-skill', { version: `${i}.0.0` });
      }

      const page1 = manager.getVersionHistory('my-skill', { limit: 3, offset: 0 });
      expect(page1.versions.length).toBe(3);
      expect(page1.total).toBe(10);
      expect(page1.hasMore).toBe(true);
      expect(page1.limit).toBe(3);
      expect(page1.offset).toBe(0);

      const page2 = manager.getVersionHistory('my-skill', { limit: 3, offset: 3 });
      expect(page2.versions.length).toBe(3);
      expect(page2.hasMore).toBe(true);

      const last = manager.getVersionHistory('my-skill', { limit: 3, offset: 9 });
      expect(last.versions.length).toBe(1);
      expect(last.hasMore).toBe(false);
    });
  });

  describe('getVersion', () => {
    it('returns specific version', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.createVersion('my-skill', { version: '2.0.0' });
      const v = manager.getVersion('my-skill', '1.0.0');
      expect(v).not.toBeNull();
      expect(v.version).toBe('1.0.0');
    });

    it('returns null for non-existent version', () => {
      expect(manager.getVersion('my-skill', '99.0.0')).toBeNull();
    });

    it('returns null for unknown skill', () => {
      expect(manager.getVersion('unknown', '1.0.0')).toBeNull();
    });
  });

  describe('updateVersionStatus', () => {
    it('updates version status', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      const updated = await manager.updateVersionStatus('my-skill', '1.0.0', 'deprecated');
      expect(updated.status).toBe('deprecated');
    });

    it('throws if version not found', async () => {
      await expect(manager.updateVersionStatus('my-skill', '99.0.0', 'deprecated'))
        .rejects.toThrow('Version 99.0.0 not found for skill my-skill');
    });

    it('adds reason if provided', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      const updated = await manager.updateVersionStatus('my-skill', '1.0.0', 'deprecated', 'No longer maintained');
      expect(updated.statusChangeReason).toBe('No longer maintained');
    });

    it('auto-switches current version when deactivating current', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.createVersion('my-skill', { version: '2.0.0' });

      await manager.updateVersionStatus('my-skill', '2.0.0', 'deprecated');
      expect(manager.getCurrentVersion('my-skill').version).toBe('1.0.0');
    });

    it('clears current version if no active version remains', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.updateVersionStatus('my-skill', '1.0.0', 'archived');
      expect(manager.getCurrentVersion('my-skill')).toBeNull();
    });

    it('persists after status update', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.updateVersionStatus('my-skill', '1.0.0', 'deprecated');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/versions/versions.json',
        expect.any(String)
      );
    });
  });

  describe('rollback', () => {
    it('creates a new version based on target', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0', files: ['a.js'] });
      await manager.createVersion('my-skill', { version: '2.0.0', files: ['b.js'] });

      const result = await manager.rollback('my-skill', '1.0.0');
      expect(result.rollback).toBe(true);
      expect(result.from).toBe('2.0.0');
      expect(result.to).toBe('1.0.0');
      expect(result.newVersion).toBe('2.0.1');
    });

    it('throws if no current version exists', async () => {
      await expect(manager.rollback('my-skill', '1.0.0'))
        .rejects.toThrow('No current version found for skill my-skill');
    });

    it('throws if target version not found', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await expect(manager.rollback('my-skill', '99.0.0'))
        .rejects.toThrow('Target version 99.0.0 not found for skill my-skill');
    });

    it('throws if target version is not active', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.createVersion('my-skill', { version: '2.0.0' });
      await manager.updateVersionStatus('my-skill', '1.0.0', 'deprecated');

      await expect(manager.rollback('my-skill', '1.0.0'))
        .rejects.toThrow('Cannot rollback to inactive version 1.0.0');
    });

    it('marks previous current version as superseded', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.createVersion('my-skill', { version: '2.0.0' });
      await manager.rollback('my-skill', '1.0.0');

      const oldVersion = manager.getVersion('my-skill', '2.0.0');
      expect(oldVersion.status).toBe('superseded');
    });
  });

  describe('_compareVersions', () => {
    it('returns 1 when v1 is greater', () => {
      expect(manager._compareVersions('2.0.0', '1.0.0')).toBe(1);
    });

    it('returns -1 when v1 is smaller', () => {
      expect(manager._compareVersions('1.0.0', '2.0.0')).toBe(-1);
    });

    it('returns 0 when versions are equal', () => {
      expect(manager._compareVersions('1.2.3', '1.2.3')).toBe(0);
    });

    it('compares by major version', () => {
      expect(manager._compareVersions('2.0.0', '1.9.9')).toBe(1);
    });

    it('compares by minor version', () => {
      expect(manager._compareVersions('1.2.0', '1.1.9')).toBe(1);
    });

    it('compares versions with different length parts', () => {
      expect(manager._compareVersions('1.0', '1.0.0')).toBe(0);
      expect(manager._compareVersions('1.1', '1.0.5')).toBe(1);
    });
  });

  describe('_incrementVersion', () => {
    it('increments patch by default', () => {
      expect(manager._incrementVersion('1.2.3')).toBe('1.2.4');
    });

    it('increments minor version', () => {
      expect(manager._incrementVersion('1.2.3', 'minor')).toBe('1.3.0');
    });

    it('increments major version', () => {
      expect(manager._incrementVersion('1.2.3', 'major')).toBe('2.0.0');
    });

    it('handles edge version numbers', () => {
      expect(manager._incrementVersion('0.0.9', 'patch')).toBe('0.0.10');
    });
  });

  describe('_isValidVersion', () => {
    it('returns true for valid semver', () => {
      expect(manager._isValidVersion('1.0.0')).toBe(true);
      expect(manager._isValidVersion('0.0.1')).toBe(true);
      expect(manager._isValidVersion('999.999.999')).toBe(true);
    });

    it('returns false for invalid formats', () => {
      expect(manager._isValidVersion('1.0')).toBe(false);
      expect(manager._isValidVersion('1')).toBe(false);
      expect(manager._isValidVersion('abc')).toBe(false);
      expect(manager._isValidVersion('v1.0.0')).toBe(false);
      expect(manager._isValidVersion('1.0.0-beta')).toBe(false);
      expect(manager._isValidVersion('')).toBe(false);
    });
  });

  describe('_generateVersionId', () => {
    it('generates unique version ID', () => {
      const id = manager._generateVersionId('my-skill', '1.0.0');
      expect(id).toContain('my-skill');
      expect(id).toContain('v1.0.0');
      expect(id.length).toBeGreaterThan('my-skill-v1.0.0'.length);
    });

    it('generates different IDs for different versions', () => {
      const id1 = manager._generateVersionId('my-skill', '1.0.0');
      const id2 = manager._generateVersionId('my-skill', '2.0.0');
      expect(id1).not.toBe(id2);
    });

    it('generates different IDs for different skills', () => {
      const id1 = manager._generateVersionId('skill-a', '1.0.0');
      const id2 = manager._generateVersionId('skill-b', '1.0.0');
      expect(id1).not.toBe(id2);
    });
  });

  describe('_generateChecksum', () => {
    it('generates a SHA-256 checksum', () => {
      const checksum = manager._generateChecksum({ version: '1.0.0' });
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates deterministic checksums', () => {
      const c1 = manager._generateChecksum({ version: '1.0.0' });
      const c2 = manager._generateChecksum({ version: '1.0.0' });
      expect(c1).toBe(c2);
    });
  });

  describe('_calculateSize', () => {
    it('returns 0 for empty files array', () => {
      expect(manager._calculateSize([])).toBe(0);
    });

    it('returns 1024 per file', () => {
      expect(manager._calculateSize(['a.js'])).toBe(1024);
      expect(manager._calculateSize(['a.js', 'b.js'])).toBe(2048);
    });
  });

  describe('_getVersionDir', () => {
    it('returns correct version directory path', () => {
      const dir = manager._getVersionDir('my-skill', '1.0.0');
      expect(dir).toBe('/tmp/versions/my-skill/v1.0.0');
    });
  });

  describe('getAllVersions', () => {
    it('returns all versions across skills', async () => {
      await manager.createVersion('skill-a', { version: '1.0.0' });
      await manager.createVersion('skill-b', { version: '2.0.0' });

      const all = manager.getAllVersions();
      expect(all.length).toBe(2);
    });

    it('filters by skillName', async () => {
      await manager.createVersion('skill-a', { version: '1.0.0' });
      await manager.createVersion('skill-b', { version: '2.0.0' });

      const filtered = manager.getAllVersions({ skillName: 'skill-a' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].skillName).toBe('skill-a');
    });

    it('filters by status', async () => {
      await manager.createVersion('skill-a', { version: '1.0.0' });
      await manager.createVersion('skill-a', { version: '2.0.0' });
      await manager.updateVersionStatus('skill-a', '2.0.0', 'deprecated');

      const active = manager.getAllVersions({ status: 'active' });
      expect(active.length).toBe(1);
    });

    it('sorts by createdAt desc by default', async () => {
      await manager.createVersion('skill-a', { version: '1.0.0' });
      await manager.createVersion('skill-a', { version: '2.0.0' });

      const all = manager.getAllVersions();
      expect(all[0].version).toBe('2.0.0');
      expect(all[1].version).toBe('1.0.0');
    });

    it('sorts by specified field and order', async () => {
      await manager.createVersion('skill-a', { version: '2.0.0' });
      await manager.createVersion('skill-a', { version: '1.0.0' });

      const all = manager.getAllVersions({ sortBy: 'version', sortOrder: 'asc' });
      expect(all[0].version).toBe('1.0.0');
      expect(all[1].version).toBe('2.0.0');
    });

    it('limits results', async () => {
      await manager.createVersion('skill-a', { version: '1.0.0' });
      await manager.createVersion('skill-a', { version: '2.0.0' });
      await manager.createVersion('skill-a', { version: '3.0.0' });

      const limited = manager.getAllVersions({ limit: 2 });
      expect(limited.length).toBe(2);
    });
  });

  describe('getStats', () => {
    it('returns zero stats for empty manager', () => {
      const stats = manager.getStats();
      expect(stats.totalSkills).toBe(0);
      expect(stats.totalVersions).toBe(0);
      expect(stats.activeVersions).toBe(0);
      expect(stats.averageVersionsPerSkill).toBe(0);
    });

    it('returns correct stats', async () => {
      await manager.createVersion('skill-a', { version: '1.0.0' });
      await manager.createVersion('skill-a', { version: '2.0.0' });
      await manager.createVersion('skill-b', { version: '1.0.0' });
      await manager.updateVersionStatus('skill-b', '1.0.0', 'deprecated');

      const stats = manager.getStats();
      expect(stats.totalSkills).toBe(2);
      expect(stats.totalVersions).toBe(3);
      expect(stats.activeVersions).toBe(2);
      expect(stats.averageVersionsPerSkill).toBe(1.5);
    });
  });

  describe('versionExists', () => {
    it('returns true if version exists', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      expect(manager.versionExists('my-skill', '1.0.0')).toBe(true);
    });

    it('returns false if version does not exist', () => {
      expect(manager.versionExists('my-skill', '1.0.0')).toBe(false);
    });
  });

  describe('getLatestVersion', () => {
    it('returns the latest version', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.createVersion('my-skill', { version: '3.0.0' });
      await manager.createVersion('my-skill', { version: '2.0.0' });

      const latest = manager.getLatestVersion('my-skill');
      expect(latest.version).toBe('3.0.0');
    });

    it('returns null if no versions exist', () => {
      expect(manager.getLatestVersion('my-skill')).toBeNull();
    });
  });

  describe('getCompatibleVersions', () => {
    it('returns active versions that satisfy requirements', async () => {
      await manager.createVersion('my-skill', {
        version: '1.0.0',
        dependencies: [{ name: 'core', version: '1.0' }]
      });
      await manager.createVersion('my-skill', {
        version: '2.0.0',
        dependencies: [{ name: 'core', version: '2.0' }]
      });
      await manager.createVersion('my-skill', {
        version: '3.0.0',
        dependencies: [{ name: 'core', version: '2.0' }]
      });

      const compatible = manager.getCompatibleVersions('my-skill', {
        minVersion: '2.0.0',
        maxVersion: '3.0.0',
        dependencies: { core: '2.0' }
      });

      expect(compatible.length).toBe(2);
      expect(compatible[0].version).toBe('2.0.0');
      expect(compatible[1].version).toBe('3.0.0');
    });

    it('excludes non-active versions', async () => {
      await manager.createVersion('my-skill', { version: '1.0.0' });
      await manager.updateVersionStatus('my-skill', '1.0.0', 'deprecated');

      const compatible = manager.getCompatibleVersions('my-skill', {});
      expect(compatible.length).toBe(0);
    });

    it('returns empty array for unknown skill', () => {
      expect(manager.getCompatibleVersions('unknown')).toEqual([]);
    });
  });

  describe('createVersionFromPackage', () => {
    const packagePath = '/tmp/skills/my-skill';

    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['skill.md', 'main.js']);
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('skill.md') || p.includes('README.md')) {
          return '# My Skill Package\nA great skill';
        }
        return '';
      });
      fs.statSync.mockImplementation((p) => ({
        isDirectory: () => p.endsWith('.') ? false : false
      }));
    });

    it('creates version from package with skill.md', async () => {
      const version = await manager.createVersionFromPackage('my-skill', packagePath, {
        version: '1.0.0',
        author: 'test-user'
      });

      expect(version.version).toBe('1.0.0');
      expect(version.author).toBe('test-user');
      expect(version.files).toBeDefined();
    });

    it('parses description from skill.md', async () => {
      const version = await manager.createVersionFromPackage('my-skill', packagePath, {});
      expect(version.description).toBe('My Skill Package');
      expect(version.metadata.description).toBe('My Skill Package');
    });

    it('falls back to README.md if skill.md not found', async () => {
      fs.existsSync.mockImplementation((p) => !p.includes('skill.md'));
      const version = await manager.createVersionFromPackage('my-skill', packagePath, { version: '2.0.0' });
      expect(version.version).toBe('2.0.0');
    });

    it('uses default version if none provided', async () => {
      fs.existsSync.mockReturnValue(false);
      const version = await manager.createVersionFromPackage('my-skill', packagePath, {});
      expect(version.version).toBe('1.0.0');
    });

    it('lists files in package directory', async () => {
      fs.readdirSync.mockReturnValue(['skill.md', 'main.js', 'utils']);
      fs.statSync.mockImplementation((p) => ({
        isDirectory: () => p.endsWith('utils')
      }));
      fs.readdirSync.mockImplementation((p) => {
        if (p.endsWith('utils')) return ['helper.js'];
        return ['skill.md', 'main.js', 'utils'];
      });

      const version = await manager.createVersionFromPackage('my-skill', packagePath, {
        version: '1.0.0'
      });

      expect(version.files).toContain('skill.md');
      expect(version.files).toContain('main.js');
    });
  });

  describe('_parseSkillMd', () => {
    it('extracts description from first heading', () => {
      const result = manager._parseSkillMd('# My Cool Skill\nSome description');
      expect(result.description).toBe('My Cool Skill');
    });

    it('extracts description from second-level heading fallback', () => {
      const result = manager._parseSkillMd('other\n## Overview\nSome text\n');
      expect(result.description).toBe(' Overview');
    });

    it('handles empty content', () => {
      const result = manager._parseSkillMd('');
      expect(result.description).toBe('');
      expect(result.version).toBe('1.0.0');
    });

    it('handles content without headings', () => {
      const result = manager._parseSkillMd('Just some text without headings');
      expect(result.description).toBe('');
    });
  });

  describe('_listFilesRecursive', () => {
    it('lists files in directory', () => {
      fs.readdirSync.mockReturnValue(['a.js', 'b.js', 'sub']);
      fs.statSync.mockImplementation((p) => ({
        isDirectory: () => p.endsWith('sub')
      }));
      fs.readdirSync.mockImplementation((p) => {
        if (p.endsWith('sub')) return ['c.js'];
        return ['a.js', 'b.js', 'sub'];
      });

      const files = manager._listFilesRecursive('/tmp/pkg');
      expect(files).toContain('a.js');
      expect(files).toContain('b.js');
      expect(files).toContain('sub/c.js');
    });

    it('skips hidden directories and node_modules', () => {
      fs.readdirSync.mockReturnValue(['.git', 'node_modules', 'a.js']);
      fs.statSync.mockImplementation((p) => ({
        isDirectory: () => p.endsWith('.git') || p.endsWith('node_modules')
      }));

      const files = manager._listFilesRecursive('/tmp/pkg');
      expect(files).toEqual(['a.js']);
    });

    it('returns empty array for empty directory', () => {
      fs.readdirSync.mockReturnValue([]);
      expect(manager._listFilesRecursive('/tmp/empty')).toEqual([]);
    });
  });
});
