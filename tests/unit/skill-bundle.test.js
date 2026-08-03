jest.mock('fs');
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/').replace(/\\/g, '/')),
  basename: jest.fn((p) => p.split('/').pop() || p.split('\\').pop()),
  extname: jest.fn((p) => { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : ''; }),
  dirname: jest.fn((p) => p.replace(/[/\\][^/\\]*$/, '') || '.'),
  resolve: jest.fn((...args) => args.join('/'))
}));

const fs = require('fs');
const crypto = require('crypto');
const { SkillBundle } = require('../../src/skills/bundles/SkillBundle');

describe('SkillBundle', () => {
  let bundleSystem;
  const NOW_ISO = '2024-06-01T00:00:00.000Z';
  const FAKE_DIR = '/fake/bundles';
  const BUNDLES_FILE = `${FAKE_DIR}/bundles.json`;

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(NOW_ISO);
    jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('aabbccdd', 'hex'));
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    bundleSystem = new SkillBundle({ dataDir: FAKE_DIR });
  });

  describe('constructor', () => {
    it('should initialize with default dataDir when not provided', () => {
      const bs = new SkillBundle();
      expect(bs.bundles).toBeInstanceOf(Map);
      expect(bs.bundlesFile).toBeDefined();
      expect(bs.dataDir).toBeDefined();
    });

    it('should use custom dataDir when provided', () => {
      expect(bundleSystem.dataDir).toBe(FAKE_DIR);
      expect(bundleSystem.bundlesFile).toBe(BUNDLES_FILE);
    });

    it('should call _ensureDataDir and _loadData', () => {
      expect(fs.existsSync).toHaveBeenCalledWith(FAKE_DIR);
      expect(fs.mkdirSync).toHaveBeenCalledWith(FAKE_DIR, { recursive: true });
    });

    it('should initialize default bundles when no existing data', () => {
      expect(bundleSystem.bundles.size).toBe(4);
      expect(bundleSystem.bundles.has('document-processing')).toBe(true);
      expect(bundleSystem.bundles.has('ai-integration')).toBe(true);
      expect(bundleSystem.bundles.has('data-analytics')).toBe(true);
      expect(bundleSystem.bundles.has('web-scraping')).toBe(true);
    });

    it('should load existing bundles from file when present', () => {
      const existingData = {
        bundles: {
          'custom-bundle': {
            id: 'custom-bundle', name: 'Custom',
            skills: [{ skillId: 's1', version: '1.0.0', required: true }]
          }
        }
      };
      fs.existsSync.mockImplementation((p) => p.includes('bundles.json'));
      fs.readFileSync.mockReturnValue(JSON.stringify(existingData));
      const bs = new SkillBundle({ dataDir: FAKE_DIR });
      expect(bs.bundles.size).toBe(1);
      expect(bs.bundles.has('custom-bundle')).toBe(true);
    });
  });

  describe('_ensureDataDir', () => {
    it('should create directory if not exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(false);
      bundleSystem._ensureDataDir();
      expect(fs.mkdirSync).toHaveBeenCalledWith(FAKE_DIR, { recursive: true });
    });

    it('should not create directory if exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      bundleSystem._ensureDataDir();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_loadData', () => {
    it('should load bundles from file if exists', () => {
      const data = { bundles: { b1: { id: 'b1', name: 'LoadedBundle' } } };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(data));
      bundleSystem._loadData();
      expect(bundleSystem.bundles.get('b1').name).toBe('LoadedBundle');
    });

    it('should handle missing file gracefully', () => {
      fs.existsSync.mockReturnValue(false);
      expect(() => bundleSystem._loadData()).not.toThrow();
    });

    it('should handle JSON parse errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');
      expect(() => bundleSystem._loadData()).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('_saveData', () => {
    it('should write bundles file with proper structure', () => {
      bundleSystem._saveData();
      expect(fs.writeFileSync).toHaveBeenCalledWith(BUNDLES_FILE, expect.any(String));
      const parsed = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(parsed.bundles).toBeDefined();
      expect(parsed.lastUpdated).toBe(NOW_ISO);
    });

    it('should include all bundles in output', () => {
      bundleSystem.bundles.clear();
      bundleSystem.bundles.set('b1', { id: 'b1', name: 'B1' });
      bundleSystem.bundles.set('b2', { id: 'b2', name: 'B2' });
      bundleSystem._saveData();
      const lastCall = fs.writeFileSync.mock.calls.length - 1;
      const parsed = JSON.parse(fs.writeFileSync.mock.calls[lastCall][1]);
      expect(Object.keys(parsed.bundles)).toHaveLength(2);
    });

    it('should handle write failures gracefully', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('Disk full'); });
      expect(() => bundleSystem._saveData()).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('_generateBundleId', () => {
    it('should produce ID containing author and name', () => {
      const id = bundleSystem._generateBundleId('Test Skill', 'Author Name');
      expect(id).toContain('author-name-test-skill-');
    });

    it('should handle special characters', () => {
      const id = bundleSystem._generateBundleId('Hello@World!', 'Dev');
      expect(id).toContain('dev-hello-world-');
    });

    it('should append random hex suffix', () => {
      const id = bundleSystem._generateBundleId('Skill', 'Me');
      expect(id).toBe('me-skill-aabbccdd');
    });
  });

  describe('createBundle', () => {
    it('should throw if name is missing', () => {
      expect(() => bundleSystem.createBundle({ skills: [{ skillId: 's1' }] }))
        .toThrow('Bundle name is required');
    });

    it('should throw if skills is empty array', () => {
      expect(() => bundleSystem.createBundle({ name: 'Test', skills: [] }))
        .toThrow('At least one skill is required');
    });

    it('should throw if skills is not an array', () => {
      expect(() => bundleSystem.createBundle({ name: 'Test', skills: 'not-array' }))
        .toThrow('At least one skill is required');
    });

    it('should throw if skills is missing', () => {
      expect(() => bundleSystem.createBundle({ name: 'Test' }))
        .toThrow('At least one skill is required');
    });

    it('should create bundle with default values', () => {
      const bundle = bundleSystem.createBundle({
        name: 'My Bundle',
        skills: [{ skillId: 'skill1' }]
      });
      expect(bundle.id).toContain('anonymous-my-bundle-');
      expect(bundle.name).toBe('My Bundle');
      expect(bundle.description).toBe('');
      expect(bundle.category).toBe('general');
      expect(bundle.icon).toBe('📦');
      expect(bundle.author).toBe('anonymous');
      expect(bundle.downloads).toBe(0);
      expect(bundle.rating).toBe(0);
      expect(bundle.ratingCount).toBe(0);
      expect(bundle.tags).toEqual([]);
      expect(bundle.isPublic).toBe(true);
      expect(bundle.status).toBe('active');
      expect(bundle.createdAt).toBe(NOW_ISO);
      expect(bundle.updatedAt).toBe(NOW_ISO);
    });

    it('should accept custom values', () => {
      const bundle = bundleSystem.createBundle({
        name: 'Advanced',
        description: 'Advanced bundle',
        category: 'security',
        icon: '🔒',
        skills: [{ skillId: 's1', version: '2.0.0', required: true }],
        author: 'pro',
        tags: ['security', 'advanced'],
        isPublic: false
      });
      expect(bundle.description).toBe('Advanced bundle');
      expect(bundle.category).toBe('security');
      expect(bundle.icon).toBe('🔒');
      expect(bundle.author).toBe('pro');
      expect(bundle.tags).toEqual(['security', 'advanced']);
      expect(bundle.isPublic).toBe(false);
    });

    it('should normalize skill entries', () => {
      const bundle = bundleSystem.createBundle({
        name: 'Normalized',
        skills: [
          { skillId: 's1', version: '2.0.0', required: true },
          { skillId: 's2' }
        ]
      });
      expect(bundle.skills).toHaveLength(2);
      expect(bundle.skills[0]).toEqual({ skillId: 's1', version: '2.0.0', required: true });
      expect(bundle.skills[1]).toEqual({ skillId: 's2', version: '*', required: true });
    });

    it('should save data after creation', () => {
      fs.writeFileSync.mockClear();
      bundleSystem.createBundle({ name: 'SaveTest', skills: [{ skillId: 's1' }] });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should store bundle in map', () => {
      const bundle = bundleSystem.createBundle({ name: 'MapTest', skills: [{ skillId: 's1' }] });
      expect(bundleSystem.bundles.get(bundle.id)).toBe(bundle);
    });
  });

  describe('getBundle', () => {
    it('should return bundle by ID', () => {
      const created = bundleSystem.createBundle({ name: 'GetTest', skills: [{ skillId: 's1' }] });
      const result = bundleSystem.getBundle(created.id);
      expect(result.id).toBe(created.id);
      expect(result.name).toBe('GetTest');
    });

    it('should return null for non-existent bundle', () => {
      expect(bundleSystem.getBundle('nonexistent')).toBeNull();
    });
  });

  describe('updateBundle', () => {
    it('should throw for non-existent bundle', () => {
      expect(() => bundleSystem.updateBundle('none', { name: 'New' }))
        .toThrow('Bundle not found: none');
    });

    it('should update bundle fields', () => {
      const created = bundleSystem.createBundle({ name: 'UpdateTest', skills: [{ skillId: 's1' }] });
      const updated = bundleSystem.updateBundle(created.id, { description: 'New desc', category: 'ai' });
      expect(updated.description).toBe('New desc');
      expect(updated.category).toBe('ai');
    });

    it('should preserve bundle ID', () => {
      const created = bundleSystem.createBundle({ name: 'IDTest', skills: [{ skillId: 's1' }] });
      const updated = bundleSystem.updateBundle(created.id, { name: 'Renamed' });
      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe('Renamed');
    });

    it('should set updatedAt timestamp', () => {
      const created = bundleSystem.createBundle({ name: 'TimeTest', skills: [{ skillId: 's1' }] });
      const updated = bundleSystem.updateBundle(created.id, { description: 'Updated' });
      expect(updated.updatedAt).toBe(NOW_ISO);
    });

    it('should save data after update', () => {
      const created = bundleSystem.createBundle({ name: 'SaveUpdate', skills: [{ skillId: 's1' }] });
      fs.writeFileSync.mockClear();
      bundleSystem.updateBundle(created.id, { description: 'Changed' });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('deleteBundle', () => {
    it('should throw for non-existent bundle', () => {
      expect(() => bundleSystem.deleteBundle('none'))
        .toThrow('Bundle not found: none');
    });

    it('should remove bundle from map', () => {
      const created = bundleSystem.createBundle({ name: 'DeleteMe', skills: [{ skillId: 's1' }] });
      bundleSystem.deleteBundle(created.id);
      expect(bundleSystem.bundles.has(created.id)).toBe(false);
    });

    it('should return deleted confirmation', () => {
      const created = bundleSystem.createBundle({ name: 'DelConfirm', skills: [{ skillId: 's1' }] });
      const result = bundleSystem.deleteBundle(created.id);
      expect(result).toEqual({ deleted: true });
    });

    it('should save data after delete', () => {
      const created = bundleSystem.createBundle({ name: 'SaveDel', skills: [{ skillId: 's1' }] });
      fs.writeFileSync.mockClear();
      bundleSystem.deleteBundle(created.id);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('listBundles', () => {
    beforeEach(() => {
      const b1 = bundleSystem.createBundle({
        name: 'Network Tools', description: 'Network utilities',
        author: 'alice', category: 'network', tags: ['network', 'tools'],
        skills: [{ skillId: 's1' }]
      });
      bundleSystem.bundles.get(b1.id).downloads = 10;

      const b2 = bundleSystem.createBundle({
        name: 'Security Suite', description: 'Security tools',
        author: 'bob', category: 'security', tags: ['security', 'tools'],
        skills: [{ skillId: 's2' }]
      });
      bundleSystem.bundles.get(b2.id).downloads = 20;

      const b3 = bundleSystem.createBundle({
        name: 'Data Viz', description: 'Chart and visualization tools',
        author: 'alice', category: 'data', tags: ['data', 'charts'],
        skills: [{ skillId: 's3' }]
      });
      bundleSystem.bundles.get(b3.id).downloads = 5;

      bundleSystem.createBundle({
        name: 'Private', description: 'Private bundle',
        author: 'alice', category: 'private', isPublic: false,
        skills: [{ skillId: 's4' }]
      });
    });

    it('should return all public bundles sorted by downloads descending', () => {
      const result = bundleSystem.listBundles();
      expect(result.bundles).toHaveLength(3);
      expect(result.bundles[0].name).toBe('Security Suite');
      expect(result.bundles[1].name).toBe('Network Tools');
      expect(result.bundles[2].name).toBe('Data Viz');
    });

    it('should filter by category', () => {
      const result = bundleSystem.listBundles({ category: 'security' });
      expect(result.bundles).toHaveLength(1);
      expect(result.bundles[0].name).toBe('Security Suite');
    });

    it('should filter by author', () => {
      const result = bundleSystem.listBundles({ author: 'alice' });
      expect(result.bundles).toHaveLength(2);
    });

    it('should search by name', () => {
      const result = bundleSystem.listBundles({ search: 'network' });
      expect(result.bundles).toHaveLength(1);
      expect(result.bundles[0].name).toBe('Network Tools');
    });

    it('should search by description', () => {
      const result = bundleSystem.listBundles({ search: 'chart' });
      expect(result.bundles).toHaveLength(1);
      expect(result.bundles[0].name).toBe('Data Viz');
    });

    it('should search by tag', () => {
      const result = bundleSystem.listBundles({ search: 'network' });
      expect(result.bundles).toHaveLength(1);
      expect(result.bundles[0].name).toBe('Network Tools');
    });

    it('should search case-insensitively', () => {
      const result = bundleSystem.listBundles({ search: 'NETWORK' });
      expect(result.bundles).toHaveLength(1);
    });

    it('should filter by tags array', () => {
      const result = bundleSystem.listBundles({ tags: ['charts'] });
      expect(result.bundles).toHaveLength(1);
      expect(result.bundles[0].name).toBe('Data Viz');
    });

    it('should match any of multiple tags', () => {
      const result = bundleSystem.listBundles({ tags: ['charts', 'tools'] });
      expect(result.bundles).toHaveLength(3);
    });

    it('should return empty for no match', () => {
      const result = bundleSystem.listBundles({ search: 'zzzzz' });
      expect(result.bundles).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should paginate with limit', () => {
      const result = bundleSystem.listBundles({ limit: 2 });
      expect(result.bundles).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    it('should paginate with offset', () => {
      const result = bundleSystem.listBundles({ limit: 2, offset: 1 });
      expect(result.bundles).toHaveLength(2);
      expect(result.bundles[0].name).toBe('Network Tools');
    });

    it('should handle offset beyond total', () => {
      const result = bundleSystem.listBundles({ offset: 100 });
      expect(result.bundles).toHaveLength(0);
    });

    it('should return metadata in result', () => {
      const result = bundleSystem.listBundles({ limit: 2, offset: 0 });
      expect(result).toEqual({
        bundles: expect.any(Array),
        total: 3,
        limit: 2,
        offset: 0
      });
    });

    it('should exclude non-public bundles', () => {
      const result = bundleSystem.listBundles();
      expect(result.bundles.every((b) => b.isPublic !== false)).toBe(true);
    });
  });

  describe('recordDownload', () => {
    it('should throw for non-existent bundle', () => {
      expect(() => bundleSystem.recordDownload('none'))
        .toThrow('Bundle not found: none');
    });

    it('should increment download count', () => {
      const bundle = bundleSystem.createBundle({ name: 'DLTest', skills: [{ skillId: 's1' }] });
      bundleSystem.recordDownload(bundle.id);
      bundleSystem.recordDownload(bundle.id);
      expect(bundleSystem.getBundle(bundle.id).downloads).toBe(2);
    });

    it('should return updated download count', () => {
      const bundle = bundleSystem.createBundle({ name: 'DLReturn', skills: [{ skillId: 's1' }] });
      const result = bundleSystem.recordDownload(bundle.id);
      expect(result).toEqual({ downloads: 1 });
    });

    it('should handle zero or undefined initial downloads', () => {
      const bundle = bundleSystem.createBundle({ name: 'DLUndef', skills: [{ skillId: 's1' }] });
      bundleSystem.bundles.get(bundle.id).downloads = undefined;
      bundleSystem.recordDownload(bundle.id);
      expect(bundleSystem.getBundle(bundle.id).downloads).toBe(1);
    });

    it('should save data after recording', () => {
      const bundle = bundleSystem.createBundle({ name: 'DLSave', skills: [{ skillId: 's1' }] });
      fs.writeFileSync.mockClear();
      bundleSystem.recordDownload(bundle.id);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('addRating', () => {
    it('should throw for non-existent bundle', () => {
      expect(() => bundleSystem.addRating('none', 5))
        .toThrow('Bundle not found: none');
    });

    it('should throw if rating is below 1', () => {
      const bundle = bundleSystem.createBundle({ name: 'RatingLo', skills: [{ skillId: 's1' }] });
      expect(() => bundleSystem.addRating(bundle.id, 0))
        .toThrow('Rating must be between 1 and 5');
    });

    it('should throw if rating is above 5', () => {
      const bundle = bundleSystem.createBundle({ name: 'RatingHi', skills: [{ skillId: 's1' }] });
      expect(() => bundleSystem.addRating(bundle.id, 6))
        .toThrow('Rating must be between 1 and 5');
    });

    it('should calculate average rating correctly', () => {
      const bundle = bundleSystem.createBundle({ name: 'RatingAvg', skills: [{ skillId: 's1' }] });
      bundleSystem.addRating(bundle.id, 4);
      bundleSystem.addRating(bundle.id, 5);
      const result = bundleSystem.getBundle(bundle.id);
      expect(result.rating).toBe(4.5);
      expect(result.ratingCount).toBe(2);
    });

    it('should round to one decimal place', () => {
      const bundle = bundleSystem.createBundle({ name: 'RatingRound', skills: [{ skillId: 's1' }] });
      bundleSystem.addRating(bundle.id, 3);
      bundleSystem.addRating(bundle.id, 4);
      expect(bundleSystem.getBundle(bundle.id).rating).toBe(3.5);
    });

    it('should return rating and count', () => {
      const bundle = bundleSystem.createBundle({ name: 'RatingRet', skills: [{ skillId: 's1' }] });
      const result = bundleSystem.addRating(bundle.id, 5);
      expect(result).toEqual({ rating: 5, ratingCount: 1 });
    });

    it('should save data after rating', () => {
      const bundle = bundleSystem.createBundle({ name: 'RatingSave', skills: [{ skillId: 's1' }] });
      fs.writeFileSync.mockClear();
      bundleSystem.addRating(bundle.id, 3);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('validateBundle', () => {
    let skillManager;

    beforeEach(() => {
      skillManager = {
        getSkillInfo: jest.fn((id) => {
          const skills = { s1: { id: 's1', version: '1.0.0' }, s2: { id: 's2', version: '2.0.0' } };
          return skills[id] || null;
        })
      };
    });

    it('should return valid when all skills exist', async () => {
      const result = await bundleSystem.validateBundle(
        { skills: [{ skillId: 's1' }, { skillId: 's2' }] },
        skillManager
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should report missing skills', async () => {
      const result = await bundleSystem.validateBundle(
        { skills: [{ skillId: 's1' }, { skillId: 'missing-skill' }] },
        skillManager
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Skill not found: missing-skill');
      expect(result.missingSkills).toContain('missing-skill');
    });

    it('should report version mismatch as warning', async () => {
      const result = await bundleSystem.validateBundle(
        { skills: [{ skillId: 's1', version: '99.0.0' }] },
        skillManager
      );
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Version mismatch');
    });

    it('should handle bundle with empty skills', async () => {
      const result = await bundleSystem.validateBundle({ skills: [] }, skillManager);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle missing skillManager.getSkillInfo', async () => {
      const result = await bundleSystem.validateBundle(
        { skills: [{ skillId: 's1' }] },
        {}
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('getBundleInstallInfo', () => {
    let skillManager;

    beforeEach(() => {
      skillManager = {
        getSkillInfo: jest.fn((id) => {
          const skills = { s1: { id: 's1', version: '1.0.0' }, s2: { id: 's2', version: '2.0.0' } };
          return skills[id] || null;
        })
      };
    });

    it('should throw for non-existent bundle', () => {
      expect(() => bundleSystem.getBundleInstallInfo('none', skillManager))
        .toThrow('Bundle not found: none');
    });

    it('should return install info with skill details', () => {
      const bundle = bundleSystem.createBundle({
        name: 'InstallTest',
        skills: [
          { skillId: 's1', version: '1.0.0', required: true },
          { skillId: 's2', version: '2.0.0', required: false }
        ]
      });
      const info = bundleSystem.getBundleInstallInfo(bundle.id, skillManager);
      expect(info.bundle.id).toBe(bundle.id);
      expect(info.totalSkills).toBe(2);
      expect(info.requiredSkills).toBe(1);
      expect(info.optionalSkills).toBe(1);
      expect(info.skills).toHaveLength(2);
      expect(info.skills[0].available).toBe(true);
      expect(info.skills[0].currentVersion).toBe('1.0.0');
      expect(info.skills[1].available).toBe(true);
      expect(info.skills[1].currentVersion).toBe('2.0.0');
    });

    it('should mark missing skills as unavailable', () => {
      const bundle = bundleSystem.createBundle({
        name: 'MissingTest',
        skills: [{ skillId: 'ghost', version: '1.0.0', required: true }]
      });
      const info = bundleSystem.getBundleInstallInfo(bundle.id, skillManager);
      expect(info.skills[0].available).toBe(false);
      expect(info.skills[0].currentVersion).toBeNull();
    });

    it('should work with empty skillManager', () => {
      const bundle = bundleSystem.createBundle({
        name: 'EmptyMgr',
        skills: [{ skillId: 's1', version: '1.0.0', required: true }]
      });
      const info = bundleSystem.getBundleInstallInfo(bundle.id, {});
      expect(info.skills[0].available).toBe(false);
      expect(info.skills[0].currentVersion).toBeNull();
    });
  });

  describe('getCategories', () => {
    it('should return categories with counts', () => {
      bundleSystem.createBundle({ name: 'A1', category: 'security', skills: [{ skillId: 's1' }] });
      bundleSystem.createBundle({ name: 'A2', category: 'security', skills: [{ skillId: 's2' }] });
      bundleSystem.createBundle({ name: 'B1', category: 'data', skills: [{ skillId: 's3' }] });
      const categories = bundleSystem.getCategories();
      expect(categories).toHaveLength(2);
      expect(categories.find((c) => c.name === 'security').count).toBe(2);
      expect(categories.find((c) => c.name === 'data').count).toBe(1);
    });

    it('should exclude non-public bundles from counts', () => {
      bundleSystem.createBundle({ name: 'Pub', category: 'tools', skills: [{ skillId: 's1' }] });
      bundleSystem.createBundle({ name: 'Priv', category: 'secret', isPublic: false, skills: [{ skillId: 's2' }] });
      const categories = bundleSystem.getCategories();
      expect(categories).toHaveLength(1);
      expect(categories[0].name).toBe('tools');
    });

    it('should return empty array when no public bundles', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(false);
      const empty = new SkillBundle({ dataDir: '/fake/empty' });
      expect(empty.getCategories()).toEqual([]);
    });
  });

  describe('getRecommendedBundles', () => {
    it('should return top bundles by composite score', () => {
      const b1 = bundleSystem.createBundle({ name: 'Top', category: 'a', skills: [{ skillId: 's1' }] });
      bundleSystem.bundles.get(b1.id).downloads = 100;
      bundleSystem.bundles.get(b1.id).rating = 5;

      const b2 = bundleSystem.createBundle({ name: 'Mid', category: 'b', skills: [{ skillId: 's2' }] });
      bundleSystem.bundles.get(b2.id).downloads = 50;
      bundleSystem.bundles.get(b2.id).rating = 3;

      const result = bundleSystem.getRecommendedBundles(2);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Top');
      expect(result[1].name).toBe('Mid');
    });

    it('should default limit to 5', () => {
      for (let i = 0; i < 6; i++) {
        const b = bundleSystem.createBundle({ name: `B${i}`, category: 'x', skills: [{ skillId: `s${i}` }] });
        bundleSystem.bundles.get(b.id).downloads = i * 10;
      }
      const result = bundleSystem.getRecommendedBundles();
      expect(result).toHaveLength(5);
    });

    it('should exclude non-public bundles', () => {
      const b1 = bundleSystem.createBundle({ name: 'Public', category: 'x', skills: [{ skillId: 's1' }] });
      bundleSystem.bundles.get(b1.id).downloads = 100;
      const b2 = bundleSystem.createBundle({ name: 'Private', isPublic: false, category: 'x', skills: [{ skillId: 's2' }] });
      bundleSystem.bundles.get(b2.id).downloads = 999;
      const names = bundleSystem.getRecommendedBundles(10).map((b) => b.name);
      expect(names).toContain('Public');
      expect(names).not.toContain('Private');
    });
  });

  describe('getStats', () => {
    it('should return aggregate stats for public bundles only', () => {
      const b1 = bundleSystem.createBundle({ name: 'S1', category: 'a', skills: [{ skillId: 's1' }] });
      bundleSystem.bundles.get(b1.id).downloads = 10;
      bundleSystem.bundles.get(b1.id).rating = 4;

      const b2 = bundleSystem.createBundle({ name: 'S2', category: 'b', skills: [{ skillId: 's2' }] });
      bundleSystem.bundles.get(b2.id).downloads = 20;
      bundleSystem.bundles.get(b2.id).rating = 5;
      bundleSystem.bundles.get(b2.id).isPublic = false;

      const stats = bundleSystem.getStats();
      expect(stats.totalBundles).toBe(6);
      expect(stats.publicBundles).toBe(1);
      expect(stats.totalDownloads).toBe(10);
      expect(stats.averageRating).toBe(4);
      expect(stats.categories).toBe(1);
    });

    it('should handle system with only non-public bundles', () => {
      bundleSystem.createBundle({ name: 'Priv1', isPublic: false, category: 'x', skills: [{ skillId: 's1' }] });
      bundleSystem.createBundle({ name: 'Priv2', isPublic: false, category: 'y', skills: [{ skillId: 's2' }] });
      const stats = bundleSystem.getStats();
      expect(stats.totalBundles).toBe(6);
      expect(stats.publicBundles).toBe(0);
      expect(stats.totalDownloads).toBe(0);
      expect(stats.averageRating).toBe(0);
      expect(stats.categories).toBe(0);
    });

    it('should handle zero public bundles to avoid division by zero', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(false);
      const empty = new SkillBundle({ dataDir: '/fake/empty2' });
      const stats = empty.getStats();
      expect(stats.averageRating).toBe(0);
    });
  });

  describe('error resilience', () => {
    it('should not crash when _loadData encounters corrupt file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('Corrupt file'); });
      expect(() => new SkillBundle({ dataDir: '/fake/corrupt' })).not.toThrow();
    });

    it('should not crash when _saveData encounters write failure', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('Permission denied'); });
      expect(() => {
        bundleSystem.createBundle({ name: 'Resilient', skills: [{ skillId: 's1' }] });
      }).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });
});
