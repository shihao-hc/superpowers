const path = require('path');

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  createWriteStream: jest.fn(),
  createReadStream: jest.fn()
}));

const fs = require('fs');

const mockArchiverFactory = jest.fn();
jest.mock('archiver', () => mockArchiverFactory, { virtual: true });

let mockUnzipper;
jest.mock('unzipper', () => {
  mockUnzipper = {
    Extract: jest.fn(() => ({ on: jest.fn().mockReturnThis() })),
    Open: { file: jest.fn() }
  };
  return mockUnzipper;
}, { virtual: true });

jest.mock('../../server/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn()
}), { virtual: true });

describe('SkillExporter', () => {
  let SkillExporter;
  let exporter;
  let mockArchive;
  let mockOutput;
  let outputCloseHandler;

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  function setupArchiveMock() {
    outputCloseHandler = null;
    mockOutput = {
      on: jest.fn((event, handler) => {
        if (event === 'close') outputCloseHandler = handler;
        return mockOutput;
      }),
      close: jest.fn(),
      end: jest.fn()
    };
    mockArchive = {
      pipe: jest.fn().mockReturnThis(),
      directory: jest.fn().mockReturnThis(),
      file: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      finalize: jest.fn(() => {
        if (outputCloseHandler) outputCloseHandler();
      })
    };
    mockArchiverFactory.mockReturnValue(mockArchive);
    fs.createWriteStream = jest.fn(() => mockOutput);
  }

  function setupReadStreamMock() {
    fs.createReadStream = jest.fn(() => ({
      on: jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('test'));
        if (event === 'end') handler();
        return undefined;
      })
    }));
  }

  function setupFsDefaults() {
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.readdirSync.mockReturnValue([]);
    fs.statSync.mockReturnValue({ size: 1024, birthtime: new Date(), mtime: new Date() });
    fs.readFileSync.mockReturnValue(Buffer.from('{}'));
    fs.writeFileSync.mockImplementation(() => {});
    fs.unlinkSync.mockImplementation(() => {});
  }

  function setupPathMocks() {
    jest.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
    jest.spyOn(path, 'basename').mockImplementation((p) => p.split('/').pop());
  }

  function loadExporter(options) {
    jest.isolateModules(() => {
      SkillExporter = require('../../src/skills/export/SkillExporter');
      SkillExporter = SkillExporter.SkillExporter || SkillExporter;
      exporter = new SkillExporter(options || { exportDir: '/exports/skills', tempDir: '/temp/exports' });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    setupArchiveMock();
    setupReadStreamMock();
    setupFsDefaults();
    setupPathMocks();
    loadExporter();
  });

  describe('constructor', () => {
    it('creates instance with default directories', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      jest.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
      loadExporter({});
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('creates instance with custom directories', () => {
      expect(exporter.exportDir).toBe('/exports/skills');
      expect(exporter.tempDir).toBe('/temp/exports');
    });

    it('does not create directories if they already exist', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.mkdirSync.mockImplementation(() => {});
      jest.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
      loadExporter({ exportDir: '/exports', tempDir: '/temp' });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('exportSkill', () => {
    const skillData = {
      id: 'test-skill',
      name: 'TestSkill',
      version: '1.0.0',
      description: 'A test skill',
      author: 'tester',
      category: 'utility',
      tags: ['test'],
      riskLevel: 'low',
      dependencies: ['dep1'],
      createdAt: '2024-01-01',
      updatedAt: '2024-06-01',
      downloads: 100,
      rating: 4.5
    };

    it('exports a skill successfully', async () => {
      const result = await exporter.exportSkill(skillData);
      expect(result.exportId).toContain('export-test-skill-');
      expect(result.filename).toContain('TestSkill-v1.0.0-');
      expect(result.path).toContain('.zip');
      expect(result.size).toBe(1024);
      expect(result.checksum).toBeDefined();
      expect(result.format).toBe('zip');
      expect(result.exportedAt).toBeDefined();
    });

    it('includes version history when available and includeVersions is true', async () => {
      const data = { ...skillData, versionHistory: [{ version: '0.9.0' }, { version: '1.0.0' }] };
      await exporter.exportSkill(data);
      const metadataCall = mockArchive.append.mock.calls.find(c => c[0].includes && c[0].includes('ultrawork-skill-export'));
      expect(metadataCall).toBeDefined();
      const metadata = JSON.parse(metadataCall[0]);
      expect(metadata.versions).toEqual([{ version: '0.9.0' }, { version: '1.0.0' }]);
    });

    it('omits version history when includeVersions is false', async () => {
      const data = { ...skillData, versionHistory: [{ version: '0.9.0' }] };
      await exporter.exportSkill(data, { includeVersions: false });
      const metadataCall = mockArchive.append.mock.calls.find(c => c[0].includes && c[0].includes('ultrawork-skill-export'));
      const metadata = JSON.parse(metadataCall[0]);
      expect(metadata.versions).toBeUndefined();
    });

    it('omits metadata when includeMetadata is false', async () => {
      await exporter.exportSkill(skillData, { includeMetadata: false });
      const metadataCall = mockArchive.append.mock.calls.find(c => c[0].includes && c[0].includes('ultrawork-skill-export'));
      const metadata = JSON.parse(metadataCall[0]);
      expect(metadata.skill.metadata).toBeNull();
    });

    it('adds skill files when skillData has files', async () => {
      const data = {
        ...skillData,
        files: [
          { name: 'main.js', content: 'console.log("hi");' },
          { name: 'config.json', path: '/tmp/config.json' }
        ]
      };
      fs.existsSync.mockReturnValue(true);
      const n = mockArchive.append.mock.calls.length;
      await exporter.exportSkill(data);
      expect(mockArchive.append).toHaveBeenCalledTimes(n + 2);
    });

    it('does not append missing file from path', async () => {
      const data = {
        ...skillData,
        files: [{ name: 'missing.js', path: '/tmp/missing.js' }]
      };
      fs.existsSync.mockReturnValue(false);
      await exporter.exportSkill(data);
      const appendCalls = mockArchive.append.mock.calls;
      const fileAppend = appendCalls.filter(c => c[1] && c[1].name && c[1].name.startsWith('files/'));
      expect(fileAppend).toHaveLength(0);
    });

    it('adds skillMd when present', async () => {
      const data = { ...skillData, skillMd: '# Skill\nContent' };
      await exporter.exportSkill(data);
      const mdCall = mockArchive.append.mock.calls.find(c => c[0] === '# Skill\nContent');
      expect(mdCall).toBeDefined();
    });

    it('throws on archive creation error', async () => {
      mockArchive.finalize.mockImplementation(() => {
        throw new Error('archive error');
      });
      await expect(exporter.exportSkill(skillData)).rejects.toThrow('Export failed: archive error');
    });

    it('uses skill name as id when id is missing', async () => {
      const data = { name: 'NoIdSkill', version: '1.0.0' };
      const result = await exporter.exportSkill(data);
      expect(result.exportId).toContain('export-NoIdSkill-');
    });
  });

  describe('exportBundle', () => {
    const skillIds = ['skill1', 'skill2'];
    const skillManager = {
      getSkillInfo: jest.fn((id) => {
        if (id === 'skill1') return { id: 'skill1', name: 'Skill1', version: '1.0.0' };
        if (id === 'skill2') return { id: 'skill2', name: 'Skill2', version: '2.0.0' };
        return null;
      })
    };

    it('exports a bundle of skills successfully', async () => {
      const result = await exporter.exportBundle(skillIds, skillManager);
      expect(result.exportId).toContain('bundle-');
      expect(result.filename).toContain('.zip');
      expect(result.skillCount).toBe(2);
      expect(result.checksum).toBeDefined();
    });

    it('throws when no valid skills found', async () => {
      const emptyManager = { getSkillInfo: jest.fn(() => null) };
      await expect(exporter.exportBundle(['nonexistent'], emptyManager)).rejects.toThrow('No valid skills found for export');
    });

    it('uses bundle name from options', async () => {
      const result = await exporter.exportBundle(skillIds, skillManager, { name: 'my-bundle', description: 'My bundle' });
      expect(result.filename).toContain('bundle-my-bundle-');
    });

    it('handles skillManager without getSkillInfo', async () => {
      const badManager = {};
      await expect(exporter.exportBundle(skillIds, badManager)).rejects.toThrow('No valid skills found for export');
    });

    it('creates bundle metadata with correct format', async () => {
      await exporter.exportBundle(skillIds, skillManager);
      const metadataCall = mockArchive.append.mock.calls.find(c => c[0].includes && c[0].includes('ultrawork-bundle-export'));
      const metadata = JSON.parse(metadataCall[0]);
      expect(metadata.format).toBe('ultrawork-bundle-export');
      expect(metadata.bundle.skillCount).toBe(2);
      expect(metadata.bundle.skills).toHaveLength(2);
    });

    it('rethrows bundle export error', async () => {
      mockArchive.finalize.mockImplementation(() => {
        throw new Error('bundle err');
      });
      await expect(exporter.exportBundle(skillIds, skillManager)).rejects.toThrow('Bundle export failed: bundle err');
    });
  });

  describe('importSkill', () => {
    const validMetadata = {
      format: 'ultrawork-skill-export',
      version: '1.0.0',
      exportedAt: '2024-06-01T00:00:00.000Z',
      skill: { id: 'test', name: 'Test', version: '1.0.0' },
      checksum: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    };

    function mockOpenFile(files) {
      mockUnzipper.Open.file.mockResolvedValue({ files });
    }

    it('imports a skill successfully', async () => {
      mockOpenFile([
        { path: 'export-metadata.json', buffer: () => Promise.resolve(Buffer.from(JSON.stringify(validMetadata))) }
      ]);
      const result = await exporter.importSkill('/imports/skill.zip');
      expect(result.success).toBe(true);
      expect(result.skill).toEqual({ id: 'test', name: 'Test', version: '1.0.0' });
      expect(result.format).toBe('ultrawork-skill-export');
      expect(result.importedAt).toBeDefined();
    });

    it('imports bundle with multiple skills', async () => {
      const bundleMeta = {
        format: 'ultrawork-bundle-export',
        version: '1.0.0',
        exportedAt: '2024-06-01T00:00:00.000Z',
        skills: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
      };
      mockOpenFile([
        { path: 'export-metadata.json', buffer: () => Promise.resolve(Buffer.from(JSON.stringify(bundleMeta))) }
      ]);
      const result = await exporter.importSkill('/imports/bundle.zip');
      expect(result.success).toBe(true);
      expect(result.skills).toHaveLength(2);
      expect(result.skill).toBeNull();
    });

    it('finds JSON file when metadata file is not found by exact name', async () => {
      const meta = { ...validMetadata, checksum: undefined };
      mockOpenFile([
        { path: 'some-other-file.json', buffer: () => Promise.resolve(Buffer.from(JSON.stringify(meta))) }
      ]);
      const result = await exporter.importSkill('/imports/skill.zip');
      expect(result.success).toBe(true);
    });

    it('throws when no metadata file found', async () => {
      mockOpenFile([
        { path: 'readme.txt', buffer: () => Promise.resolve(Buffer.from('hello')) }
      ]);
      await expect(exporter.importSkill('/imports/skill.zip')).rejects.toThrow('Invalid import file: missing metadata');
    });

    it('throws when format is not ultrawork', async () => {
      mockOpenFile([
        { path: 'export-metadata.json', buffer: () => Promise.resolve(Buffer.from(JSON.stringify({ format: 'unknown' }))) }
      ]);
      await expect(exporter.importSkill('/imports/skill.zip')).rejects.toThrow('Invalid import format');
    });

    it('validates checksum when validateIntegrity is true and checksum present', async () => {
      const meta = { ...validMetadata, checksum: 'mismatch' };
      mockOpenFile([
        { path: 'export-metadata.json', buffer: () => Promise.resolve(Buffer.from(JSON.stringify(meta))) }
      ]);
      await expect(exporter.importSkill('/imports/skill.zip', { validateIntegrity: true })).rejects.toThrow('Checksum mismatch');
    });

    it('skips checksum validation when validateIntegrity is false', async () => {
      const meta = { ...validMetadata, checksum: 'mismatch' };
      mockOpenFile([
        { path: 'export-metadata.json', buffer: () => Promise.resolve(Buffer.from(JSON.stringify(meta))) }
      ]);
      const result = await exporter.importSkill('/imports/skill.zip', { validateIntegrity: false });
      expect(result.success).toBe(true);
    });

    it('skips checksum validation when no checksum in metadata', async () => {
      const meta = { ...validMetadata, checksum: undefined };
      mockOpenFile([
        { path: 'export-metadata.json', buffer: () => Promise.resolve(Buffer.from(JSON.stringify(meta))) }
      ]);
      const result = await exporter.importSkill('/imports/skill.zip');
      expect(result.success).toBe(true);
    });

    it('rethrows import error with prefix', async () => {
      mockUnzipper.Open.file.mockRejectedValueOnce(new Error('corrupt file'));
      await expect(exporter.importSkill('/imports/bad.zip')).rejects.toThrow('Import failed: corrupt file');
    });
  });

  describe('_createZipArchive', () => {
    it('resolves on output close event', async () => {
      await expect(exporter._createZipArchive('/out.zip', { data: 1 }, null)).resolves.toBeUndefined();
    });

    it('rejects on archive error event', async () => {
      mockArchive.on.mockImplementation((event, handler) => {
        if (event === 'error') handler(new Error('archive error'));
        return mockArchive;
      });
      await expect(exporter._createZipArchive('/out.zip', { data: 1 }, null)).rejects.toThrow('archive error');
    });

    it('appends skill files with content', async () => {
      const skillData = { files: [{ name: 'main.js', content: 'code' }] };
      await exporter._createZipArchive('/out.zip', { meta: true }, skillData);
      expect(mockArchive.append).toHaveBeenCalledWith('code', { name: 'files/main.js' });
    });

    it('appends file from path when exists', async () => {
      fs.existsSync.mockReturnValue(true);
      const skillData = { files: [{ name: 'lib.js', path: '/tmp/lib.js' }] };
      await exporter._createZipArchive('/out.zip', { meta: true }, skillData);
      expect(mockArchive.file).toHaveBeenCalledWith('/tmp/lib.js', { name: 'files/lib.js' });
    });

    it('appends skill.md when present', async () => {
      const skillData = { skillMd: '# Skill Doc' };
      await exporter._createZipArchive('/out.zip', { meta: true }, skillData);
      expect(mockArchive.append).toHaveBeenCalledWith('# Skill Doc', { name: 'skill.md' });
    });
  });

  describe('_calculateChecksum', () => {
    it('computes sha256 hex checksum', async () => {
      const expected = require('crypto').createHash('sha256').update('test').digest('hex');
      const result = await exporter._calculateChecksum('/file.zip');
      expect(result).toBe(expected);
    });

    it('rejects on stream error', async () => {
      fs.createReadStream = jest.fn(() => ({
        on: jest.fn((event, handler) => {
          if (event === 'error') setTimeout(() => handler(new Error('read error')), 10);
          return undefined;
        })
      }));
      await expect(exporter._calculateChecksum('/bad.zip')).rejects.toThrow('read error');
    });
  });

  describe('exportToCloud', () => {
    const skillData = { id: 's1', name: 'S1', version: '1.0.0' };
    const storageAdapter = {
      upload: jest.fn().mockResolvedValue({ url: 'https://cloud.example.com/skill.zip', key: 'skill-exports/s1.zip' })
    };

    it('exports and uploads to cloud', async () => {
      const result = await exporter.exportToCloud(skillData, storageAdapter);
      expect(result.cloudUrl).toBe('https://cloud.example.com/skill.zip');
      expect(result.cloudKey).toBe('skill-exports/s1.zip');
      expect(storageAdapter.upload).toHaveBeenCalled();
    });

    it('cleans up local file after upload', async () => {
      await exporter.exportToCloud(skillData, storageAdapter);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('forwards export options', async () => {
      await exporter.exportToCloud(skillData, storageAdapter, { includeVersions: false });
      const metadataCall = mockArchive.append.mock.calls.find(c => c[0].includes && c[0].includes('ultrawork-skill-export'));
      const metadata = JSON.parse(metadataCall[0]);
      expect(metadata.versions).toBeUndefined();
    });
  });

  describe('importFromCloud', () => {
    const storageAdapter = {
      download: jest.fn().mockResolvedValue({ buffer: Buffer.from('{}') })
    };

    it('downloads from cloud and imports', async () => {
      const validMeta = { format: 'ultrawork-skill-export', version: '1.0.0', exportedAt: '2024-01-01', skill: { id: 't' } };
      mockUnzipper.Open.file.mockResolvedValue({
        files: [{ path: 'export-metadata.json', buffer: () => Promise.resolve(Buffer.from(JSON.stringify(validMeta))) }]
      });
      const result = await exporter.importFromCloud('key', storageAdapter);
      expect(result.success).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('cleans up temp file on import error', async () => {
      mockUnzipper.Open.file.mockRejectedValueOnce(new Error('bad file'));
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => {});
      await expect(exporter.importFromCloud('bad-key', storageAdapter)).rejects.toThrow('Import failed: bad file');
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('handles missing temp file during error cleanup', async () => {
      mockUnzipper.Open.file.mockRejectedValueOnce(new Error('fail'));
      fs.existsSync.mockReturnValue(false);
      fs.unlinkSync.mockImplementation(() => {});
      await expect(exporter.importFromCloud('key', storageAdapter)).rejects.toThrow();
    });
  });

  describe('backupAllSkills', () => {
    it('exports all skills as a bundle', async () => {
      const skillManager = {
        getAllSkills: jest.fn(() => [
          { id: 'a', name: 'SkillA' },
          { id: 'b', name: 'SkillB' }
        ]),
        getSkillInfo: jest.fn((id) => {
          if (id === 'a') return { id: 'a', name: 'SkillA', version: '1.0.0' };
          if (id === 'b') return { id: 'b', name: 'SkillB', version: '2.0.0' };
          return null;
        })
      };
      const result = await exporter.backupAllSkills(skillManager);
      expect(result.skillCount).toBe(2);
      expect(result.filename).toContain('backup-');
    });

    it('handles empty skill list', async () => {
      const skillManager = { getAllSkills: jest.fn(() => []), getSkillInfo: jest.fn() };
      await expect(exporter.backupAllSkills(skillManager)).rejects.toThrow();
    });

    it('handles skillManager without getAllSkills', async () => {
      const skillManager = {};
      await expect(exporter.backupAllSkills(skillManager)).rejects.toThrow();
    });
  });

  describe('generateReport', () => {
    it('generates report from export result', () => {
      const result = { exportId: 'e1', filename: 'f.zip', size: 2048, checksum: 'abc', exportedAt: '2024-01-01', format: 'zip' };
      const report = exporter.generateReport(result);
      expect(report.summary.exportId).toBe('e1');
      expect(report.summary.filename).toBe('f.zip');
      expect(report.summary.size).toBe('2.0 KB');
      expect(report.verification).toEqual({ checksumAlgorithm: 'SHA-256', format: 'zip' });
    });

    it('formats size in bytes for small files', () => {
      const result = { exportId: 'e2', filename: 's.zip', size: 500, checksum: 'def', exportedAt: '2024-01-01' };
      const report = exporter.generateReport(result);
      expect(report.summary.size).toBe('500 B');
    });

    it('formats size in MB for large files', () => {
      const result = { exportId: 'e3', filename: 'l.zip', size: 3145728, checksum: 'ghi', exportedAt: '2024-01-01' };
      const report = exporter.generateReport(result);
      expect(report.summary.size).toBe('3.0 MB');
    });
  });

  describe('_formatSize', () => {
    it('formats bytes', () => {
      expect(exporter._formatSize(0)).toBe('0 B');
      expect(exporter._formatSize(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(exporter._formatSize(1024)).toBe('1.0 KB');
      expect(exporter._formatSize(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(exporter._formatSize(1048576)).toBe('1.0 MB');
      expect(exporter._formatSize(2097152)).toBe('2.0 MB');
    });
  });

  describe('listExports', () => {
    it('returns most recently modified files first', () => {
      const now = Date.now();
      const older = { size: 100, birthtime: new Date(now - 2000), mtime: new Date(now - 2000) };
      const newer = { size: 200, birthtime: new Date(now - 1000), mtime: new Date(now - 1000) };
      fs.readdirSync.mockReturnValue(['a.zip', 'b.zip']);
      fs.statSync.mockReturnValueOnce(older).mockReturnValueOnce(newer);
      const result = exporter.listExports();
      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('b.zip');
    });

    it('filters non-zip files', () => {
      fs.readdirSync.mockReturnValue(['a.zip', 'b.txt', 'c.zip']);
      fs.statSync.mockReturnValue({ size: 100, birthtime: new Date(), mtime: new Date() });
      const result = exporter.listExports();
      expect(result).toHaveLength(2);
    });

    it('respects limit parameter', () => {
      fs.readdirSync.mockReturnValue(['a.zip', 'b.zip', 'c.zip']);
      fs.statSync.mockReturnValue({ size: 100, birthtime: new Date(), mtime: new Date() });
      const result = exporter.listExports(2);
      expect(result).toHaveLength(2);
    });

    it('returns empty array on error', () => {
      fs.readdirSync.mockImplementation(() => { throw new Error('permission denied'); });
      const result = exporter.listExports();
      expect(result).toEqual([]);
    });
  });

  describe('deleteExport', () => {
    it('deletes existing file', () => {
      fs.existsSync.mockReturnValue(true);
      const result = exporter.deleteExport('test.zip');
      expect(result).toEqual({ deleted: true });
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('returns delete failed for non-existent file', () => {
      fs.existsSync.mockReturnValue(false);
      const result = exporter.deleteExport('missing.zip');
      expect(result).toEqual({ deleted: false, error: 'Delete failed' });
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('logs warning on unlink error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => { throw new Error('permission denied'); });
      const result = exporter.deleteExport('protected.zip');
      expect(result).toEqual({ deleted: false, error: 'Delete failed' });
    });
  });

  describe('cleanupOldExports', () => {
    it('deletes files older than maxAge', () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const newDate = new Date();
      fs.readdirSync.mockReturnValue(['old.zip', 'new.zip']);
      fs.statSync.mockReturnValueOnce({ size: 100, birthtime: oldDate, mtime: oldDate })
        .mockReturnValueOnce({ size: 100, birthtime: newDate, mtime: newDate });
      fs.existsSync.mockReturnValue(true);
      const result = exporter.cleanupOldExports(7 * 24 * 60 * 60 * 1000);
      expect(result.deleted).toBe(1);
    });

    it('deletes nothing when all files are recent', () => {
      const now = new Date();
      fs.readdirSync.mockReturnValue(['a.zip', 'b.zip']);
      fs.statSync.mockReturnValue({ size: 100, birthtime: now, mtime: now });
      const result = exporter.cleanupOldExports(7 * 24 * 60 * 60 * 1000);
      expect(result.deleted).toBe(0);
    });

    it('returns zero for empty export dir', () => {
      fs.readdirSync.mockReturnValue([]);
      const result = exporter.cleanupOldExports();
      expect(result.deleted).toBe(0);
    });
  });
});
