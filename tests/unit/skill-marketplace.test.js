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
const { SkillMarketplace } = require('../../src/skills/marketplace/SkillMarketplace');

describe('SkillMarketplace', () => {
  let marketplace;
  const NOW = 1719000000000;

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    marketplace = new SkillMarketplace({ dataDir: '/fake/marketplace' });
  });

  describe('constructor', () => {
    it('should initialize with default dataDir when not provided', () => {
      const m = new SkillMarketplace();
      expect(m.skills).toBeInstanceOf(Map);
      expect(m.reviews).toBeInstanceOf(Map);
      expect(m.stats).toBeInstanceOf(Map);
      expect(m.skillsFile).toContain('skills.json');
      expect(m.reviewsFile).toContain('reviews.json');
      expect(m.statsFile).toContain('stats.json');
    });

    it('should use custom dataDir when provided', () => {
      expect(marketplace.dataDir).toBe('/fake/marketplace');
      expect(marketplace.skillsFile).toBe('/fake/marketplace/skills.json');
      expect(marketplace.reviewsFile).toBe('/fake/marketplace/reviews.json');
      expect(marketplace.statsFile).toBe('/fake/marketplace/stats.json');
    });

    it('should call _ensureDataDir and _loadData', () => {
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/marketplace', { recursive: true });
    });
  });

  describe('_ensureDataDir', () => {
    it('should create directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      marketplace._ensureDataDir();
      expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/marketplace', { recursive: true });
    });

    it('should not create directory if exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      marketplace._ensureDataDir();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_loadData', () => {
    it('should load skills from file if exists', () => {
      const skillsData = { s1: { id: 's1', name: 'LoadedSkill' } };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('skills.json')) return JSON.stringify(skillsData);
        if (p.includes('reviews.json')) return '{}';
        if (p.includes('stats.json')) return '{}';
        return '{}';
      });
      marketplace._loadData();
      expect(marketplace.skills.get('s1').name).toBe('LoadedSkill');
    });

    it('should load reviews from file if exists', () => {
      const reviewsData = { s1: [{ id: 'r1', rating: 5, reviewer: 'alice' }] };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('reviews.json')) return JSON.stringify(reviewsData);
        return '{}';
      });
      marketplace._loadData();
      expect(marketplace.reviews.get('s1')[0].rating).toBe(5);
    });

    it('should load stats from file if exists', () => {
      const statsData = { s1: { downloads: 42, viewCount: 100 } };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('stats.json')) return JSON.stringify(statsData);
        return '{}';
      });
      marketplace._loadData();
      expect(marketplace.stats.get('s1').downloads).toBe(42);
    });

    it('should handle missing files gracefully', () => {
      fs.existsSync.mockReturnValue(false);
      expect(() => marketplace._loadData()).not.toThrow();
      expect(marketplace.skills.size).toBe(0);
    });

    it('should handle JSON parse errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');
      expect(() => marketplace._loadData()).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('_saveData', () => {
    it('should write skills, reviews, and stats files', () => {
      marketplace.skills.set('s1', { id: 's1', name: 'Alpha' });
      marketplace.reviews.set('s1', [{ id: 'r1', rating: 5 }]);
      marketplace.stats.set('s1', { downloads: 10 });
      marketplace._saveData();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(3);
      const calls = fs.writeFileSync.mock.calls;
      expect(calls[0][0]).toBe('/fake/marketplace/skills.json');
      expect(calls[1][0]).toBe('/fake/marketplace/reviews.json');
      expect(calls[2][0]).toBe('/fake/marketplace/stats.json');
    });

    it('should include proper JSON content', () => {
      marketplace.skills.set('s1', { id: 's1', name: 'Alpha' });
      marketplace._saveData();
      const jsonArg = fs.writeFileSync.mock.calls[0][1];
      const parsed = JSON.parse(jsonArg);
      expect(parsed.s1.name).toBe('Alpha');
    });

    it('should handle write failures gracefully', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('Disk full'); });
      marketplace.skills.set('s1', { id: 's1' });
      expect(() => marketplace._saveData()).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('publishSkill', () => {
    it('should throw if name is missing', async () => {
      await expect(marketplace.publishSkill({})).rejects.toThrow('Skill name is required');
    });

    it('should create a skill with default values', async () => {
      const skill = await marketplace.publishSkill({ name: 'Test Skill', description: 'A test skill' });
      expect(skill.id).toContain('test-skill');
      expect(skill.name).toBe('Test Skill');
      expect(skill.description).toBe('A test skill');
      expect(skill.version).toBe('1.0.0');
      expect(skill.author).toBe('Anonymous');
      expect(skill.category).toBe('General');
      expect(skill.riskLevel).toBe('low');
      expect(skill.license).toBe('MIT');
      expect(skill.status).toBe('published');
      expect(skill.downloads).toBe(0);
      expect(skill.rating).toBe(0);
      expect(skill.ratingCount).toBe(0);
      expect(skill.verified).toBe(false);
      expect(skill.featured).toBe(false);
      expect(skill.publishedAt).toBeDefined();
      expect(skill.updatedAt).toBeDefined();
    });

    it('should accept custom fields', async () => {
      const skill = await marketplace.publishSkill({
        name: 'Advanced', description: 'Advanced skill', version: '2.0.0',
        author: 'pro', category: 'Security', riskLevel: 'high',
        license: 'Apache-2.0', dependencies: ['lodash'],
        keywords: ['security', 'advanced'], pure: true
      });
      expect(skill.version).toBe('2.0.0');
      expect(skill.author).toBe('pro');
      expect(skill.category).toBe('Security');
      expect(skill.riskLevel).toBe('high');
      expect(skill.license).toBe('Apache-2.0');
      expect(skill.dependencies).toEqual(['lodash']);
      expect(skill.keywords).toEqual(['security', 'advanced']);
      expect(skill.pure).toBe(true);
    });

    it('should initialize stats and reviews for the skill', async () => {
      const skill = await marketplace.publishSkill({ name: 'StatsTest' });
      const stats = marketplace.stats.get(skill.id);
      expect(stats).toBeDefined();
      expect(stats.downloads).toBe(0);
      expect(stats.uniqueDownloaders).toBe(0);
      expect(stats.viewCount).toBe(0);
      expect(marketplace.reviews.get(skill.id)).toEqual([]);
    });

    it('should save data after publishing', async () => {
      fs.writeFileSync.mockClear();
      await marketplace.publishSkill({ name: 'SaveTest' });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should generate unique IDs for different skills', async () => {
      const s1 = await marketplace.publishSkill({ name: 'Unique', author: 'a' });
      const s2 = await marketplace.publishSkill({ name: 'Unique', author: 'b' });
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe('getSkill', () => {
    it('should return skill by ID', async () => {
      const published = await marketplace.publishSkill({ name: 'GetTest' });
      const result = marketplace.getSkill(published.id);
      expect(result.id).toBe(published.id);
      expect(result.name).toBe('GetTest');
    });

    it('should return null for non-existent skill', () => {
      expect(marketplace.getSkill('nonexistent')).toBeNull();
    });
  });

  describe('updateSkill', () => {
    let skillId;

    beforeEach(async () => {
      const skill = await marketplace.publishSkill({ name: 'UpdateTest', version: '1.0.0' });
      skillId = skill.id;
    });

    it('should throw for non-existent skill', async () => {
      await expect(marketplace.updateSkill('none', {})).rejects.toThrow('Skill not found: none');
    });

    it('should update skill fields', async () => {
      const updated = await marketplace.updateSkill(skillId, { description: 'Updated desc', category: 'AI' });
      expect(updated.description).toBe('Updated desc');
      expect(updated.category).toBe('AI');
    });

    it('should set updatedAt timestamp', async () => {
      const updated = await marketplace.updateSkill(skillId, { description: 'New' });
      expect(updated.updatedAt).toBeDefined();
      expect(() => new Date(updated.updatedAt)).not.toThrow();
    });

    it('should track version history when version changes', async () => {
      const updated = await marketplace.updateSkill(skillId, { version: '2.0.0', changelog: 'Major rewrite' });
      expect(updated.versionHistory).toHaveLength(1);
      expect(updated.versionHistory[0].version).toBe('1.0.0');
      expect(updated.versionHistory[0].changes).toBe('Major rewrite');
    });

    it('should append to existing version history', async () => {
      await marketplace.updateSkill(skillId, { version: '2.0.0', changelog: 'First update' });
      await marketplace.updateSkill(skillId, { version: '3.0.0', changelog: 'Second update' });
      const skill = marketplace.getSkill(skillId);
      expect(skill.versionHistory).toHaveLength(2);
    });

    it('should use default changelog when not provided', async () => {
      const updated = await marketplace.updateSkill(skillId, { version: '2.0.0' });
      expect(updated.versionHistory[0].changes).toBe('No changelog provided');
    });

    it('should save data after update', async () => {
      fs.writeFileSync.mockClear();
      await marketplace.updateSkill(skillId, { description: 'Updated' });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('listSkills', () => {
    let skillIds;

    beforeEach(async () => {
      skillIds = {};
      const s1 = await marketplace.publishSkill({
        name: 'Firewall', description: 'Network security scanning',
        author: 'alice', category: 'Security', keywords: ['firewall', 'security']
      });
      marketplace.stats.set(s1.id, { downloads: 10, rating: 4.5, ratingCount: 2, viewCount: 50 });
      marketplace.skills.get(s1.id).downloads = 10;
      marketplace.skills.get(s1.id).rating = 4.5;
      skillIds.firewall = s1.id;

      const s2 = await marketplace.publishSkill({
        name: 'Logger', description: 'Log management tool',
        author: 'bob', category: 'Utilities', keywords: ['log', 'monitor']
      });
      marketplace.stats.set(s2.id, { downloads: 5, rating: 3.0, ratingCount: 1, viewCount: 20 });
      marketplace.skills.get(s2.id).downloads = 5;
      marketplace.skills.get(s2.id).rating = 3.0;
      marketplace.skills.get(s2.id).featured = true;
      skillIds.logger = s2.id;

      const s3 = await marketplace.publishSkill({
        name: 'Deprecated Skill', description: 'Old skill',
        author: 'alice', category: 'Security'
      });
      marketplace.skills.get(s3.id).status = 'deprecated';
      marketplace.skills.get(s3.id).downloads = 0;
      skillIds.deprecated = s3.id;

      const s4 = await marketplace.publishSkill({
        name: 'Dashboard', description: 'Visual dashboard tool',
        author: 'carol', category: 'Utilities', keywords: ['dashboard', 'ui']
      });
      marketplace.stats.set(s4.id, { downloads: 20, rating: 5.0, ratingCount: 3, viewCount: 100 });
      marketplace.skills.get(s4.id).downloads = 20;
      marketplace.skills.get(s4.id).rating = 5.0;
      skillIds.dashboard = s4.id;
    });

    it('should return all published skills by default', () => {
      const result = marketplace.listSkills();
      expect(result.skills).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter by category', () => {
      const result = marketplace.listSkills({ category: 'Security' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('Firewall');
    });

    it('should filter by author', () => {
      const result = marketplace.listSkills({ author: 'alice' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('Firewall');
    });

    it('should filter by status', () => {
      const result = marketplace.listSkills({ status: 'deprecated' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('Deprecated Skill');
    });

    it('should filter by status all', () => {
      const result = marketplace.listSkills({ status: '' });
      expect(result.skills).toHaveLength(4);
    });

    it('should search by name', () => {
      const result = marketplace.listSkills({ search: 'firewall' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('Firewall');
    });

    it('should search by description', () => {
      const result = marketplace.listSkills({ search: 'log management' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('Logger');
    });

    it('should search by keyword', () => {
      const result = marketplace.listSkills({ search: 'dashboard' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('Dashboard');
    });

    it('should search case-insensitively', () => {
      const result = marketplace.listSkills({ search: 'FIREWALL' });
      expect(result.skills).toHaveLength(1);
    });

    it('should return empty array for no match', () => {
      const result = marketplace.listSkills({ search: 'zzzzz' });
      expect(result.skills).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should sort by downloads descending by default order', () => {
      const result = marketplace.listSkills({ sortBy: 'downloads', sortOrder: 'desc' });
      expect(result.skills[0].downloads).toBe(20);
      expect(result.skills[1].downloads).toBe(10);
      expect(result.skills[2].downloads).toBe(5);
    });

    it('should sort by downloads ascending', () => {
      const result = marketplace.listSkills({ sortBy: 'downloads', sortOrder: 'asc' });
      expect(result.skills[0].downloads).toBe(5);
      expect(result.skills[2].downloads).toBe(20);
    });

    it('should sort by rating', () => {
      const result = marketplace.listSkills({ sortBy: 'rating', sortOrder: 'desc' });
      expect(result.skills[0].rating).toBe(5.0);
    });

    it('should paginate results', () => {
      const result = marketplace.listSkills({ limit: 2, offset: 0 });
      expect(result.skills).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should not set hasMore on last page', () => {
      const result = marketplace.listSkills({ limit: 2, offset: 2 });
      expect(result.skills).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle offset beyond total', () => {
      const result = marketplace.listSkills({ limit: 10, offset: 100 });
      expect(result.skills).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('searchSkills', () => {
    beforeEach(async () => {
      await marketplace.publishSkill({
        name: 'Firewall', description: 'Network security',
        author: 'alice', category: 'Security', keywords: ['firewall']
      });
    });

    it('should delegate to listSkills with search query', () => {
      const spy = jest.spyOn(marketplace, 'listSkills');
      const result = marketplace.searchSkills('firewall', { category: 'Security' });
      expect(spy).toHaveBeenCalledWith({ category: 'Security', search: 'firewall' });
      expect(result.skills).toHaveLength(1);
    });
  });

  describe('addReview', () => {
    let skillId;

    beforeEach(async () => {
      const skill = await marketplace.publishSkill({ name: 'ReviewTest' });
      skillId = skill.id;
    });

    it('should throw for non-existent skill', async () => {
      await expect(marketplace.addReview('none', { rating: 5 })).rejects.toThrow('Skill not found: none');
    });

    it('should throw if rating is below 1', async () => {
      await expect(marketplace.addReview(skillId, { rating: 0 })).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should throw if rating is above 5', async () => {
      await expect(marketplace.addReview(skillId, { rating: 6 })).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should throw if rating is missing', async () => {
      await expect(marketplace.addReview(skillId, {})).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should create a review with defaults', async () => {
      const review = await marketplace.addReview(skillId, { rating: 4, title: 'Good', content: 'Works well' });
      expect(review.skillId).toBe(skillId);
      expect(review.rating).toBe(4);
      expect(review.title).toBe('Good');
      expect(review.content).toBe('Works well');
      expect(review.reviewer).toBe('Anonymous');
      expect(review.helpful).toBe(0);
      expect(review.reported).toBe(false);
      expect(review.id).toBeDefined();
    });

    it('should update skill average rating', async () => {
      await marketplace.addReview(skillId, { rating: 4, reviewer: 'alice' });
      await marketplace.addReview(skillId, { rating: 5, reviewer: 'bob' });
      const skill = marketplace.getSkill(skillId);
      expect(skill.rating).toBe(4.5);
      expect(skill.ratingCount).toBe(2);
    });

    it('should update stats rating', async () => {
      await marketplace.addReview(skillId, { rating: 3, reviewer: 'carol' });
      const stats = marketplace.stats.get(skillId);
      expect(stats.rating).toBe(3);
      expect(stats.ratingCount).toBe(1);
    });

    it('should save data after adding review', async () => {
      fs.writeFileSync.mockClear();
      await marketplace.addReview(skillId, { rating: 5 });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getReviews', () => {
    let skillId;

    beforeEach(async () => {
      const skill = await marketplace.publishSkill({ name: 'ReviewListTest' });
      skillId = skill.id;
      await marketplace.addReview(skillId, { rating: 4, title: 'Great', reviewer: 'alice' });
      await marketplace.addReview(skillId, { rating: 2, title: 'Bad', reviewer: 'bob' });
      await marketplace.addReview(skillId, { rating: 5, title: 'Excellent', reviewer: 'carol' });
    });

    it('should return all reviews for a skill', () => {
      const result = marketplace.getReviews(skillId);
      expect(result.reviews).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should sort by createdAt desc by default', () => {
      const result = marketplace.getReviews(skillId);
      const dates = result.reviews.map((r) => r.createdAt);
      for (let i = 1; i < dates.length; i++) {
        expect(new Date(dates[i]).getTime()).toBeLessThanOrEqual(new Date(dates[i - 1]).getTime());
      }
    });

    it('should sort by rating ascending', () => {
      const result = marketplace.getReviews(skillId, { sortBy: 'rating', sortOrder: 'asc' });
      expect(result.reviews[0].rating).toBe(2);
      expect(result.reviews[2].rating).toBe(5);
    });

    it('should paginate reviews', () => {
      const result = marketplace.getReviews(skillId, { limit: 2, offset: 0 });
      expect(result.reviews).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('should return empty for skill with no reviews', () => {
      const result = marketplace.getReviews('unknown-skill');
      expect(result.reviews).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('recordDownload', () => {
    let skillId;

    beforeEach(async () => {
      const skill = await marketplace.publishSkill({ name: 'DownloadTest' });
      skillId = skill.id;
    });

    it('should throw for non-existent skill', async () => {
      await expect(marketplace.recordDownload('none')).rejects.toThrow('Skill not found: none');
    });

    it('should increment download count on skill', async () => {
      await marketplace.recordDownload(skillId);
      await marketplace.recordDownload(skillId);
      const skill = marketplace.getSkill(skillId);
      expect(skill.downloads).toBe(2);
    });

    it('should update stats download count', async () => {
      await marketplace.recordDownload(skillId, 'user1');
      const stats = marketplace.stats.get(skillId);
      expect(stats.downloads).toBe(1);
      expect(stats.lastDownload).toBeDefined();
    });

    it('should track unique downloaders', async () => {
      await marketplace.recordDownload(skillId, 'user1');
      await marketplace.recordDownload(skillId, 'user2');
      const stats = marketplace.stats.get(skillId);
      expect(stats.uniqueDownloaders).toBe(2);
    });

    it('should not count duplicate downloaders', async () => {
      await marketplace.recordDownload(skillId, 'user1');
      await marketplace.recordDownload(skillId, 'user1');
      const stats = marketplace.stats.get(skillId);
      expect(stats.uniqueDownloaders).toBe(1);
      expect(stats.downloads).toBe(2);
    });

    it('should save data after recording download', async () => {
      fs.writeFileSync.mockClear();
      await marketplace.recordDownload(skillId);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('recordView', () => {
    let skillId;

    beforeEach(async () => {
      const skill = await marketplace.publishSkill({ name: 'ViewTest' });
      skillId = skill.id;
    });

    it('should increment view count', async () => {
      await marketplace.recordView(skillId);
      await marketplace.recordView(skillId);
      const stats = marketplace.stats.get(skillId);
      expect(stats.viewCount).toBe(2);
    });

    it('should update lastView timestamp', async () => {
      await marketplace.recordView(skillId);
      const stats = marketplace.stats.get(skillId);
      expect(stats.lastView).toBeDefined();
    });

    it('should create stats entry if not exists', async () => {
      await marketplace.recordView('new-skill');
      const stats = marketplace.stats.get('new-skill');
      expect(stats.viewCount).toBe(1);
    });

    it('should save data after recording view', async () => {
      fs.writeFileSync.mockClear();
      await marketplace.recordView(skillId);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    let skillId;

    beforeEach(async () => {
      const skill = await marketplace.publishSkill({ name: 'StatsTest', version: '2.0.0' });
      skillId = skill.id;
    });

    it('should return stats with skill info', () => {
      const stats = marketplace.getStats(skillId);
      expect(stats.skillId).toBe(skillId);
      expect(stats.name).toBe('StatsTest');
      expect(stats.version).toBe('2.0.0');
    });

    it('should return empty stats for non-existent skill', () => {
      const stats = marketplace.getStats('none');
      expect(stats.skillId).toBe('none');
      expect(stats.name).toBeNull();
    });
  });

  describe('getFeaturedSkills', () => {
    beforeEach(async () => {
      const s1 = await marketplace.publishSkill({ name: 'Featured1', author: 'a', category: 'Security' });
      marketplace.skills.get(s1.id).featured = true;
      marketplace.skills.get(s1.id).rating = 4.0;

      const s2 = await marketplace.publishSkill({ name: 'NotFeatured', author: 'b' });
      marketplace.skills.get(s2.id).rating = 5.0;

      const s3 = await marketplace.publishSkill({ name: 'Featured2', author: 'c' });
      marketplace.skills.get(s3.id).featured = true;
      marketplace.skills.get(s3.id).rating = 4.5;
    });

    it('should return only featured published skills', () => {
      const result = marketplace.getFeaturedSkills();
      expect(result).toHaveLength(2);
      expect(result.every((s) => s.featured)).toBe(true);
    });

    it('should sort by rating descending', () => {
      const result = marketplace.getFeaturedSkills();
      expect(result[0].rating).toBe(4.5);
      expect(result[1].rating).toBe(4.0);
    });

    it('should respect limit', () => {
      const result = marketplace.getFeaturedSkills(1);
      expect(result).toHaveLength(1);
    });
  });

  describe('getPopularSkills', () => {
    beforeEach(async () => {
      const s1 = await marketplace.publishSkill({ name: 'Pop1', author: 'a' });
      marketplace.skills.get(s1.id).downloads = 100;

      const s2 = await marketplace.publishSkill({ name: 'Pop2', author: 'b' });
      marketplace.skills.get(s2.id).downloads = 200;

      const s3 = await marketplace.publishSkill({ name: 'DeprecatedPop', author: 'c' });
      marketplace.skills.get(s3.id).status = 'deprecated';
      marketplace.skills.get(s3.id).downloads = 999;
    });

    it('should return published skills sorted by downloads', () => {
      const result = marketplace.getPopularSkills();
      expect(result).toHaveLength(2);
      expect(result[0].downloads).toBe(200);
      expect(result[1].downloads).toBe(100);
    });

    it('should not include deprecated or archived skills', () => {
      const names = marketplace.getPopularSkills().map((s) => s.name);
      expect(names).not.toContain('DeprecatedPop');
    });

    it('should respect limit', () => {
      const result = marketplace.getPopularSkills(1);
      expect(result).toHaveLength(1);
    });
  });

  describe('getCategories', () => {
    beforeEach(async () => {
      await marketplace.publishSkill({ name: 'S1', author: 'a', category: 'Security' });
      await marketplace.publishSkill({ name: 'S2', author: 'b', category: 'Utilities' });
      await marketplace.publishSkill({ name: 'S3', author: 'c', category: 'Security' });
      const s4 = await marketplace.publishSkill({ name: 'S4', author: 'd', category: 'Old' });
      marketplace.skills.get(s4.id).status = 'archived';
    });

    it('should return categories with counts for published skills', () => {
      const categories = marketplace.getCategories();
      expect(categories).toHaveLength(2);
      expect(categories.find((c) => c.name === 'Security').count).toBe(2);
      expect(categories.find((c) => c.name === 'Utilities').count).toBe(1);
    });

    it('should not include categories from non-published skills', () => {
      const names = marketplace.getCategories().map((c) => c.name);
      expect(names).not.toContain('Old');
    });

    it('should return empty array when no skills', () => {
      const emptyMarket = new SkillMarketplace({ dataDir: '/fake/empty' });
      expect(emptyMarket.getCategories()).toEqual([]);
    });
  });

  describe('deprecateSkill', () => {
    let skillId;

    beforeEach(async () => {
      const skill = await marketplace.publishSkill({ name: 'DeprecateMe' });
      skillId = skill.id;
    });

    it('should set status to deprecated', async () => {
      const result = await marketplace.deprecateSkill(skillId, 'No longer maintained');
      expect(result.status).toBe('deprecated');
      expect(result.deprecationReason).toBe('No longer maintained');
      expect(result.deprecatedAt).toBeDefined();
    });

    it('should throw for non-existent skill', async () => {
      await expect(marketplace.deprecateSkill('none')).rejects.toThrow('Skill not found: none');
    });
  });

  describe('archiveSkill', () => {
    let skillId;

    beforeEach(async () => {
      const skill = await marketplace.publishSkill({ name: 'ArchiveMe' });
      skillId = skill.id;
    });

    it('should set status to archived', async () => {
      const result = await marketplace.archiveSkill(skillId);
      expect(result.status).toBe('archived');
      expect(result.archivedAt).toBeDefined();
    });

    it('should throw for non-existent skill', async () => {
      await expect(marketplace.archiveSkill('none')).rejects.toThrow('Skill not found: none');
    });
  });

  describe('getMarketplaceStats', () => {
    it('should return zeros for empty marketplace', () => {
      const stats = marketplace.getMarketplaceStats();
      expect(stats.totalSkills).toBe(0);
      expect(stats.publishedSkills).toBe(0);
      expect(stats.totalDownloads).toBe(0);
      expect(stats.totalReviews).toBe(0);
      expect(stats.averageRating).toBe(0);
      expect(stats.categories).toBe(0);
      expect(stats.authors).toBe(0);
    });

    it('should calculate aggregate stats', async () => {
      const s1 = await marketplace.publishSkill({ name: 'Stats1', author: 'alice', category: 'Security' });
      marketplace.skills.get(s1.id).downloads = 10;
      marketplace.skills.get(s1.id).rating = 4.0;

      const s2 = await marketplace.publishSkill({ name: 'Stats2', author: 'bob', category: 'Utilities' });
      marketplace.skills.get(s2.id).downloads = 20;
      marketplace.skills.get(s2.id).rating = 3.0;

      const s3 = await marketplace.publishSkill({ name: 'Stats3', author: 'alice', category: 'Security' });
      marketplace.skills.get(s3.id).status = 'deprecated';

      const stats = marketplace.getMarketplaceStats();
      expect(stats.totalSkills).toBe(3);
      expect(stats.publishedSkills).toBe(2);
      expect(stats.totalDownloads).toBe(30);
      expect(stats.averageRating).toBe(3.5);
      expect(stats.categories).toBe(2);
      expect(stats.authors).toBe(2);
      expect(stats.totalReviews).toBe(0);
    });
  });

  describe('_generateSkillId', () => {
    it('should produce ID containing author and name', () => {
      jest.spyOn(crypto, 'createHash').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('abc123def456')
      });
      const id = marketplace._generateSkillId('Test Skill', 'Author Name');
      expect(id).toContain('author-name-test-skill-');
    });

    it('should handle special characters in name', () => {
      jest.spyOn(crypto, 'createHash').mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('xyz789')
      });
      const id = marketplace._generateSkillId('Hello@World!', 'Dev');
      expect(id).toContain('dev-hello-world-');
    });
  });

  describe('error resilience', () => {
    it('should not crash when _loadData encounters corrupt files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('Corrupt file'); });
      expect(() => new SkillMarketplace({ dataDir: '/fake/corrupt' })).not.toThrow();
    });

    it('should not crash when _saveData encounters write failures', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('Permission denied'); });
      const skill = { id: 's1', name: 'Resilient' };
      marketplace.skills.set('s1', skill);
      expect(() => marketplace._saveData()).not.toThrow();
    });
  });
});
