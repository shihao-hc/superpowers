const { SkillEcosystem, SkillStorefront, DeveloperPortal, AnalyticsHub, BadgeSystem, LeaderboardSystem } = require('../../src/ecosystem/SkillEcosystem');

describe('SkillEcosystem', () => {
  let ecosystem;

  beforeEach(() => {
    ecosystem = new SkillEcosystem();
  });

  it('instantiates all 5 sub-systems', () => {
    expect(ecosystem.storefront).toBeInstanceOf(SkillStorefront);
    expect(ecosystem.developerPortal).toBeInstanceOf(DeveloperPortal);
    expect(ecosystem.analyticsHub).toBeInstanceOf(AnalyticsHub);
    expect(ecosystem.badges).toBeInstanceOf(BadgeSystem);
    expect(ecosystem.leaderboards).toBeInstanceOf(LeaderboardSystem);
  });
});

describe('SkillStorefront', () => {
  let sf;
  const baseSkill = {
    name: 'Test Skill',
    description: 'A skill for testing purposes with enough length to test shortDescription truncation',
    category: 'productivity',
    authorId: 'dev_001',
    authorName: 'Tester',
    authorAvatar: 'https://avatar.test/1',
    tags: ['test', 'utility']
  };

  beforeEach(() => {
    sf = new SkillStorefront();
  });

  describe('constructor', () => {
    it('initializes 8 categories', () => {
      const cats = sf.getCategories();
      expect(cats).toHaveLength(8);
      expect(cats.map(c => c.id)).toEqual([
        'productivity', 'ai-ml', 'data', 'communication',
        'automation', 'integrations', 'content', 'industry'
      ]);
    });
  });

  describe('publishSkill', () => {
    it('creates skill with skill_ ID prefix', () => {
      const skill = sf.publishSkill(baseSkill);
      expect(skill.id).toMatch(/^skill_[a-f0-9]{16}$/);
      expect(skill.name).toBe('Test Skill');
      expect(skill.status).toBe('pending');
    });

    it('defaults optional fields', () => {
      const minimal = { name: 'Min', description: 'Desc', category: 'data', authorId: 'd1', authorName: 'A' };
      const skill = sf.publishSkill(minimal);
      expect(skill.tags).toEqual([]);
      expect(skill.version).toBe('1.0.0');
      expect(skill.pricing).toEqual({ type: 'free' });
      expect(skill.riskLevel).toBe('low');
      expect(skill.shortDescription).toBe('Desc');
      expect(skill.stats).toEqual({ downloads: 0, installs: 0, rating: 0, ratingCount: 0, weeklyInstalls: 0 });
    });

    it('generates shortDescription from first 100 chars if not provided', () => {
      const longDesc = 'x'.repeat(200);
      const skill = sf.publishSkill({ name: 'N', description: longDesc, category: 'data', authorId: 'd1', authorName: 'A' });
      expect(skill.shortDescription).toBe(longDesc.slice(0, 100));
    });

    it('increments category count', () => {
      sf.publishSkill(baseSkill);
      expect(sf.categories.get('productivity').count).toBe(1);
    });

    it('builds tag index on publish', () => {
      sf.publishSkill(baseSkill);
      expect(sf.tags.get('test').count).toBe(1);
      expect(sf.tags.get('utility').count).toBe(1);
    });

    it('handles empty tags gracefully', () => {
      sf.publishSkill({ ...baseSkill, tags: [] });
      expect(sf.tags.size).toBe(0);
    });

    it('creates author with defaults', () => {
      const skill = sf.publishSkill({ name: 'N', description: 'D', category: 'x', authorId: 'd1', authorName: 'A' });
      expect(skill.author).toEqual({ id: 'd1', name: 'A', avatar: undefined, verified: false });
    });

    it('accepts custom version and pricing', () => {
      const skill = sf.publishSkill({ ...baseSkill, version: '2.0.0', pricing: { type: 'paid', price: 9.99 } });
      expect(skill.version).toBe('2.0.0');
      expect(skill.pricing.price).toBe(9.99);
    });

    it('accepts custom riskLevel', () => {
      const skill = sf.publishSkill({ ...baseSkill, riskLevel: 'high' });
      expect(skill.riskLevel).toBe('high');
    });
  });

  describe('getSkill', () => {
    it('returns skill by ID', () => {
      const skill = sf.publishSkill(baseSkill);
      expect(sf.getSkill(skill.id)).toBe(skill);
    });

    it('returns undefined for missing skill', () => {
      expect(sf.getSkill('skill_nonexistent')).toBeUndefined();
    });
  });

  describe('listSkills', () => {
    function publishApproved(overrides = {}) {
      const skill = sf.publishSkill({ ...baseSkill, ...overrides });
      skill.status = 'approved';
      return skill;
    }

    it('returns only approved skills', () => {
      sf.publishSkill(baseSkill);
      publishApproved({ name: 'Approved One' });
      const result = sf.listSkills();
      expect(result.total).toBe(1);
      expect(result.skills[0].name).toBe('Approved One');
    });

    it('filters by category', () => {
      publishApproved({ name: 'A', category: 'data' });
      publishApproved({ name: 'B', category: 'ai-ml' });
      const result = sf.listSkills({ category: 'data' });
      expect(result.total).toBe(1);
      expect(result.skills[0].name).toBe('A');
    });

    it('filters by tags (any match)', () => {
      publishApproved({ name: 'A', tags: ['alpha', 'beta'] });
      publishApproved({ name: 'B', tags: ['gamma'] });
      const result = sf.listSkills({ tags: ['beta'] });
      expect(result.total).toBe(1);
      expect(result.skills[0].name).toBe('A');
    });

    it('filters by author', () => {
      publishApproved({ name: 'A', authorId: 'dev1' });
      publishApproved({ name: 'B', authorId: 'dev2' });
      const result = sf.listSkills({ author: 'dev1' });
      expect(result.total).toBe(1);
    });

    it('filters by pricing type', () => {
      publishApproved({ name: 'A', pricing: { type: 'free' } });
      publishApproved({ name: 'B', pricing: { type: 'paid' } });
      const result = sf.listSkills({ pricing: 'paid' });
      expect(result.total).toBe(1);
    });

    it('searches by name case-insensitively', () => {
      publishApproved({ name: 'Data Processor' });
      publishApproved({ name: 'Image Analyzer' });
      const result = sf.listSkills({ search: 'data' });
      expect(result.total).toBe(1);
    });

    it('searches by description case-insensitively', () => {
      publishApproved({ name: 'A', description: 'This tool processes CSV files' });
      publishApproved({ name: 'B', description: 'Renders HTML templates' });
      const result = sf.listSkills({ search: 'csv' });
      expect(result.total).toBe(1);
    });

    it('searches by tag case-insensitively', () => {
      publishApproved({ name: 'A', tags: ['machine-learning'] });
      publishApproved({ name: 'B', tags: ['frontend'] });
      const result = sf.listSkills({ search: 'Machine' });
      expect(result.total).toBe(1);
    });

    it('sorts by popular (downloads) by default', () => {
      const a = publishApproved({ name: 'A' });
      const b = publishApproved({ name: 'B' });
      a.stats.downloads = 50;
      b.stats.downloads = 100;
      const result = sf.listSkills();
      expect(result.skills[0].name).toBe('B');
    });

    it('sorts by new (createdAt)', () => {
      const a = publishApproved({ name: 'A' });
      const b = publishApproved({ name: 'B' });
      a.createdAt = 1000;
      b.createdAt = 2000;
      const result = sf.listSkills({ sortBy: 'new' });
      expect(result.skills[0].name).toBe('B');
    });

    it('sorts by rating', () => {
      const a = publishApproved({ name: 'A' });
      const b = publishApproved({ name: 'B' });
      a.stats.rating = 3.5;
      b.stats.rating = 4.5;
      const result = sf.listSkills({ sortBy: 'rating' });
      expect(result.skills[0].name).toBe('B');
    });

    it('sorts by trending (weeklyInstalls)', () => {
      const a = publishApproved({ name: 'A' });
      const b = publishApproved({ name: 'B' });
      a.stats.weeklyInstalls = 10;
      b.stats.weeklyInstalls = 20;
      const result = sf.listSkills({ sortBy: 'trending' });
      expect(result.skills[0].name).toBe('B');
    });

    it('paginates results with limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        publishApproved({ name: `Skill ${i}` });
      }
      const result = sf.listSkills({ limit: 2, offset: 1 });
      expect(result.skills).toHaveLength(2);
      expect(result.skills[0].name).toBe('Skill 1');
    });

    it('sets hasMore when more results exist', () => {
      for (let i = 0; i < 3; i++) {
        publishApproved({ name: `Skill ${i}` });
      }
      const result = sf.listSkills({ limit: 2, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('sets hasMore false when at end', () => {
      for (let i = 0; i < 2; i++) {
        publishApproved({ name: `Skill ${i}` });
      }
      const result = sf.listSkills({ limit: 2 });
      expect(result.hasMore).toBe(false);
    });

    it('returns empty array when no skills match', () => {
      publishApproved({ name: 'A' });
      const result = sf.listSkills({ search: 'nonexistent' });
      expect(result.skills).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('addReview', () => {
    it('throws for non-existent skill', () => {
      expect(() => sf.addReview('skill_none', { rating: 5 })).toThrow('Skill not found');
    });

    it('creates review with rev_ ID', () => {
      const skill = sf.publishSkill(baseSkill);
      const review = sf.addReview(skill.id, { userId: 'u1', userName: 'User', rating: 4, title: 'Great', content: 'Works well' });
      expect(review.id).toMatch(/^rev_[a-f0-9]{16}$/);
      expect(review.rating).toBe(4);
    });

    it('updates skill average rating', () => {
      const skill = sf.publishSkill(baseSkill);
      sf.addReview(skill.id, { userId: 'u1', userName: 'U', rating: 5, title: 'T', content: 'C' });
      sf.addReview(skill.id, { userId: 'u2', userName: 'U', rating: 3, title: 'T', content: 'C' });
      expect(skill.stats.rating).toBe(4.0);
      expect(skill.stats.ratingCount).toBe(2);
    });

    it('stores review defaults', () => {
      const skill = sf.publishSkill(baseSkill);
      const review = sf.addReview(skill.id, { userId: 'u1', userName: 'U', rating: 4, title: 'T', content: 'C' });
      expect(review.pros).toEqual([]);
      expect(review.cons).toEqual([]);
      expect(review.helpful).toBe(0);
      expect(review.verified).toBe(false);
    });
  });

  describe('createBundle', () => {
    it('creates bundle with bundle_ ID', () => {
      const bundle = sf.createBundle({ name: 'Starter Pack', description: 'Bundle desc', pricing: { type: 'free' } });
      expect(bundle.id).toMatch(/^bundle_[a-f0-9]{16}$/);
      expect(bundle.name).toBe('Starter Pack');
      expect(bundle.skills).toEqual([]);
    });

    it('stores bundle in bundles map', () => {
      const bundle = sf.createBundle({ name: 'Pro Pack', description: 'D', skills: ['s1', 's2'], pricing: { type: 'paid', price: 19.99 }, discount: 20 });
      expect(sf.bundles.get(bundle.id)).toBe(bundle);
      expect(bundle.skills).toEqual(['s1', 's2']);
      expect(bundle.discount).toBe(20);
    });
  });

  describe('getCategories', () => {
    it('returns array of 8 category objects', () => {
      const cats = sf.getCategories();
      expect(cats).toHaveLength(8);
      cats.forEach(cat => {
        expect(cat).toHaveProperty('id');
        expect(cat).toHaveProperty('name');
        expect(cat).toHaveProperty('icon');
        expect(cat).toHaveProperty('count');
      });
    });
  });

  describe('getFeaturedSkills', () => {
    it('returns only approved skills sorted by downloads', () => {
      const a = sf.publishSkill({ ...baseSkill, name: 'A' });
      const b = sf.publishSkill({ ...baseSkill, name: 'B' });
      a.status = 'approved'; a.stats.downloads = 10;
      b.status = 'approved'; b.stats.downloads = 20;
      sf.publishSkill({ ...baseSkill, name: 'Pending' });
      const featured = sf.getFeaturedSkills();
      expect(featured).toHaveLength(2);
      expect(featured[0].name).toBe('B');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        const s = sf.publishSkill({ ...baseSkill, name: `S${i}` });
        s.status = 'approved';
      }
      expect(sf.getFeaturedSkills(2)).toHaveLength(2);
    });
  });

  describe('getNewReleases', () => {
    it('returns approved skills sorted by createdAt descending', () => {
      const a = sf.publishSkill({ ...baseSkill, name: 'A' });
      const b = sf.publishSkill({ ...baseSkill, name: 'B' });
      a.status = 'approved'; a.createdAt = 1000;
      b.status = 'approved'; b.createdAt = 2000;
      const releases = sf.getNewReleases();
      expect(releases[0].name).toBe('B');
    });

    it('respects limit', () => {
      for (let i = 0; i < 3; i++) {
        const s = sf.publishSkill({ ...baseSkill, name: `S${i}` });
        s.status = 'approved';
      }
      expect(sf.getNewReleases(1)).toHaveLength(1);
    });
  });
});

describe('DeveloperPortal', () => {
  let dp;

  beforeEach(() => {
    dp = new DeveloperPortal();
  });

  describe('registerDeveloper', () => {
    it('creates developer with dev_ ID and default tier', () => {
      const dev = dp.registerDeveloper({ name: 'Dev', email: 'dev@test.com', company: 'ACME' });
      expect(dev.id).toMatch(/^dev_[a-f0-9]{16}$/);
      expect(dev.name).toBe('Dev');
      expect(dev.email).toBe('dev@test.com');
      expect(dev.company).toBe('ACME');
      expect(dev.tier).toBe('free');
    });

    it('sets free tier limits', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      expect(dev.limits).toEqual({
        skills: 5,
        monthlyDownloads: 1000,
        storage: 100 * 1024 * 1024,
        apiCalls: 10000
      });
    });

    it('initializes empty stats, skills, apps, badges', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      expect(dev.stats).toEqual({ totalEarnings: 0, totalDownloads: 0, rating: 0 });
      expect(dev.skills).toEqual([]);
      expect(dev.apps).toEqual([]);
      expect(dev.badges).toEqual([]);
    });

    it('stores developer in map', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      expect(dp.developers.get(dev.id)).toBe(dev);
    });
  });

  describe('createAPIKey', () => {
    it('throws for missing developer', () => {
      expect(() => dp.createAPIKey('dev_none')).toThrow('Developer not found');
    });

    it('creates API key with key_ prefix', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      const result = dp.createAPIKey(dev.id);
      expect(result.id).toMatch(/^key_[a-f0-9]{16}$/);
      expect(result.key).toMatch(/^key_[a-f0-9]{16}:/);
    });

    it('stores full key object in apiKeys map', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      dp.createAPIKey(dev.id, { name: 'My Key', scopes: ['skills:write'], rateLimit: 200 });
      const keys = Array.from(dp.apiKeys.values());
      expect(keys).toHaveLength(1);
      expect(keys[0].name).toBe('My Key');
      expect(keys[0].scopes).toEqual(['skills:write']);
      expect(keys[0].rateLimit).toBe(200);
      expect(keys[0].status).toBe('active');
      expect(keys[0].lastUsed).toBeNull();
    });

    it('hashes the key secret', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      dp.createAPIKey(dev.id);
      const key = Array.from(dp.apiKeys.values())[0];
      expect(key.keyHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('createApp', () => {
    it('creates app with app_ ID', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      const app = dp.createApp(dev.id, { name: 'MyApp', description: 'An app' });
      expect(app.id).toMatch(/^app_[a-f0-9]{16}$/);
      expect(app.name).toBe('MyApp');
      expect(app.developerId).toBe(dev.id);
    });

    it('generates clientId and clientSecret', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      const app = dp.createApp(dev.id, { name: 'App', description: 'D' });
      expect(app.clientId).toMatch(/^client_[a-f0-9]{32}$/);
      expect(app.clientSecret.length).toBeGreaterThan(10);
      expect(app.status).toBe('active');
    });
  });

  describe('registerWebhook', () => {
    it('creates webhook with wh_ ID', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      const wh = dp.registerWebhook(dev.id, { url: 'https://hook.test/callback' });
      expect(wh.id).toMatch(/^wh_[a-f0-9]{16}$/);
      expect(wh.url).toBe('https://hook.test/callback');
    });

    it('defaults events and generates secret', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      const wh = dp.registerWebhook(dev.id, { url: 'https://hook.test/cb' });
      expect(wh.events).toEqual(['skill.downloaded', 'skill.reviewed']);
      expect(wh.secret.length).toBeGreaterThan(10);
    });

    it('initializes delivery stats', () => {
      const dev = dp.registerDeveloper({ name: 'N', email: 'e@e.com' });
      const wh = dp.registerWebhook(dev.id, { url: 'https://hook.test/cb' });
      expect(wh.stats).toEqual({ successCount: 0, failureCount: 0, lastDelivery: null });
    });
  });
});

describe('AnalyticsHub', () => {
  let ah;

  beforeEach(() => {
    ah = new AnalyticsHub();
  });

  describe('trackEvent', () => {
    it('adds event with id and timestamp', () => {
      ah.trackEvent({ type: 'skill.viewed', skillId: 's1' });
      expect(ah.events).toHaveLength(1);
      expect(ah.events[0].id).toMatch(/^evt_[a-f0-9]{16}$/);
      expect(ah.events[0].timestamp).toBeGreaterThan(0);
      expect(ah.events[0].type).toBe('skill.viewed');
    });

    it('trims to last 50000 when exceeding 100000', () => {
      for (let i = 0; i < 100001; i++) {
        ah.trackEvent({ type: 'skill.viewed' });
      }
      expect(ah.events.length).toBe(50000);
    });

    it('does not trim when below 100000', () => {
      for (let i = 0; i < 500; i++) {
        ah.trackEvent({ type: 'skill.viewed' });
      }
      expect(ah.events.length).toBe(500);
    });

    it('updates metric count', () => {
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      const metric = ah.metrics.get('skill.downloaded:s1');
      expect(metric.count).toBe(1);
    });

    it('tracks by-day in metrics', () => {
      ah.trackEvent({ type: 'skill.viewed' });
      const today = new Date().toISOString().split('T')[0];
      const metric = ah.metrics.get('skill.viewed:global');
      expect(metric.byDay.get(today)).toBe(1);
    });

    it('tracks country in metrics', () => {
      ah.trackEvent({ type: 'skill.downloaded', country: 'CN' });
      expect(ah.metrics.get('skill.downloaded:global').byCountry.get('CN')).toBe(1);
    });

    it('aggregates same metric key across events', () => {
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      expect(ah.metrics.get('skill.downloaded:s1').count).toBe(2);
    });

    it('uses global key when no skillId', () => {
      ah.trackEvent({ type: 'skill.viewed' });
      expect(ah.metrics.has('skill.viewed:global')).toBe(true);
    });
  });

  describe('getSkillAnalytics', () => {
    it('returns zeroed overview for skill with no events', () => {
      const analytics = ah.getSkillAnalytics('s1');
      expect(analytics.overview).toEqual({ totalDownloads: 0, totalInstalls: 0, totalReviews: 0, installRate: 0 });
    });

    it('calculates overview counts and install rate', () => {
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      ah.trackEvent({ type: 'skill.installed', skillId: 's1' });
      const analytics = ah.getSkillAnalytics('s1');
      expect(analytics.overview.totalDownloads).toBe(2);
      expect(analytics.overview.totalInstalls).toBe(1);
      expect(analytics.overview.installRate).toBe(50);
    });

    it('returns trends array with correct length', () => {
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      const analytics = ah.getSkillAnalytics('s1', { days: 7 });
      expect(analytics.trends).toHaveLength(7);
      expect(analytics.trends[0]).toHaveProperty('date');
      expect(analytics.trends[0]).toHaveProperty('value');
    });

    it('returns geography breakdown', () => {
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1', country: 'US' });
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1', country: 'CN' });
      const analytics = ah.getSkillAnalytics('s1');
      expect(analytics.geography).toHaveLength(2);
      expect(analytics.geography[0]).toHaveProperty('country');
      expect(analytics.geography[0]).toHaveProperty('count');
    });

    it('returns conversion rates', () => {
      ah.trackEvent({ type: 'skill.viewed', skillId: 's1' });
      ah.trackEvent({ type: 'skill.viewed', skillId: 's1' });
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      ah.trackEvent({ type: 'skill.installed', skillId: 's1' });
      const analytics = ah.getSkillAnalytics('s1');
      expect(analytics.conversion.viewToDownload).toBe(50);
      expect(analytics.conversion.downloadToInstall).toBe(100);
    });

    it('handles zero views in conversion', () => {
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      const analytics = ah.getSkillAnalytics('s1');
      expect(analytics.conversion.viewToDownload).toBe(0);
    });
  });

  describe('generateReport', () => {
    it('generates market-overview report with id and timestamp', () => {
      const report = ah.generateReport('market-overview');
      expect(report.id).toMatch(/^rpt_[a-f0-9]{16}$/);
      expect(report.type).toBe('market-overview');
      expect(report.generatedAt).toBeGreaterThan(0);
    });

    it('market-overview reports zero totals when no events', () => {
      const report = ah.generateReport('market-overview');
      expect(report.data.totalSkills).toBe(0);
      expect(report.data.totalDownloads).toBe(0);
      expect(report.data.totalReviews).toBe(0);
      expect(report.data.avgRating).toBe(0);
    });

    it('market-overview calculates from events', () => {
      ah.trackEvent({ type: 'skill.published', category: 'productivity' });
      ah.trackEvent({ type: 'skill.downloaded', category: 'ai-ml' });
      ah.trackEvent({ type: 'skill.reviewed', category: 'productivity' });
      const report = ah.generateReport('market-overview');
      expect(report.data.totalSkills).toBe(1);
      expect(report.data.totalDownloads).toBe(1);
      expect(report.data.totalReviews).toBe(1);
      expect(report.data.topCategories).toHaveLength(2);
    });

    it('generates trending-skills report with weighted scoring', () => {
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      ah.trackEvent({ type: 'skill.installed', skillId: 's2' });
      ah.trackEvent({ type: 'skill.viewed', skillId: 's1' });
      const report = ah.generateReport('trending-skills', { limit: 5 });
      expect(report.data).toHaveLength(2);
    });

    it('trending-skills weights downloads (3) and installs (5) correctly', () => {
      ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
      ah.trackEvent({ type: 'skill.installed', skillId: 's2' });
      ah.trackEvent({ type: 'skill.installed', skillId: 's1' });
      const report = ah.generateReport('trending-skills', { limit: 5 });
      const s1 = report.data.find(d => d.skillId === 's1');
      const s2 = report.data.find(d => d.skillId === 's2');
      expect(s1.score).toBe(8);
      expect(s2.score).toBe(5);
    });

    it('trending-skills handles all event types', () => {
      ah.trackEvent({ type: 'skill.reviewed', skillId: 's1' });
      ah.trackEvent({ type: 'skill.viewed', skillId: 's2' });
      const report = ah.generateReport('trending-skills');
      expect(report.data).toHaveLength(2);
      const s1 = report.data.find(d => d.skillId === 's1');
      expect(s1.score).toBe(4);
    });

    it('generates developer-performance report', () => {
      ah.trackEvent({ type: 'skill.downloaded', developerId: 'dev1' });
      ah.trackEvent({ type: 'skill.published', developerId: 'dev1' });
      const report = ah.generateReport('developer-performance', { developerId: 'dev1' });
      expect(report.data.totalDownloads).toBe(1);
      expect(report.data.skillCount).toBe(1);
    });

    it('developer-performance calculates earnings', () => {
      ah.trackEvent({ type: 'payment.received', developerId: 'dev1', amount: 100 });
      ah.trackEvent({ type: 'payment.received', developerId: 'dev1', amount: 50 });
      const report = ah.generateReport('developer-performance', { developerId: 'dev1' });
      expect(report.data.totalEarnings).toBe(150);
    });

    it('stores report in reports map', () => {
      const report = ah.generateReport('market-overview');
      expect(ah.reports.get(report.id)).toBe(report);
    });

    it('throws for unknown report type', () => {
      expect(() => ah.generateReport('unknown')).toThrow('Unknown report type: unknown');
    });
  });
});

describe('BadgeSystem', () => {
  let bs;

  beforeEach(() => {
    bs = new BadgeSystem();
  });

  describe('constructor', () => {
    it('initializes 7 default badges', () => {
      expect(bs.badges.size).toBe(7);
      expect(bs.badges.has('first-skill')).toBe(true);
      expect(bs.badges.has('skill-master')).toBe(true);
      expect(bs.badges.has('popular')).toBe(true);
      expect(bs.badges.has('top-rated')).toBe(true);
      expect(bs.badges.has('early-adopter')).toBe(true);
      expect(bs.badges.has('helper')).toBe(true);
      expect(bs.badges.has('verified')).toBe(true);
    });
  });

  describe('checkAndAwardBadges', () => {
    it('awards first-skill when skillCount >= 1', () => {
      const awarded = bs.checkAndAwardBadges('u1', { skillCount: 1 });
      expect(awarded).toHaveLength(1);
      expect(awarded[0].id).toBe('first-skill');
    });

    it('awards first-skill and skill-master when skillCount >= 10', () => {
      const awarded = bs.checkAndAwardBadges('u1', { skillCount: 10, totalDownloads: 0, avgRating: 0 });
      expect(awarded).toHaveLength(2);
      const ids = awarded.map(b => b.id);
      expect(ids).toContain('first-skill');
      expect(ids).toContain('skill-master');
    });

    it('awards popular badge when downloads >= 10000', () => {
      const awarded = bs.checkAndAwardBadges('u1', { totalDownloads: 10000 });
      expect(awarded.map(b => b.id)).toContain('popular');
    });

    it('does not award popular when downloads below threshold', () => {
      const awarded = bs.checkAndAwardBadges('u1', { totalDownloads: 9999 });
      expect(awarded.map(b => b.id)).not.toContain('popular');
    });

    it('awards top-rated when avgRating >= 4.8', () => {
      const awarded = bs.checkAndAwardBadges('u1', { avgRating: 4.8 });
      expect(awarded.map(b => b.id)).toContain('top-rated');
    });

    it('does not award top-rated when rating below 4.8', () => {
      const awarded = bs.checkAndAwardBadges('u1', { avgRating: 4.7 });
      expect(awarded.map(b => b.id)).not.toContain('top-rated');
    });

    it('awards verified when verified === true', () => {
      const awarded = bs.checkAndAwardBadges('u1', { verified: true });
      expect(awarded.map(b => b.id)).toContain('verified');
    });

    it('does not award verified when verified === false', () => {
      const awarded = bs.checkAndAwardBadges('u1', { verified: false });
      expect(awarded.map(b => b.id)).not.toContain('verified');
    });

    it('does not award badges with unknown requirement type', () => {
      bs.badges.set('custom', { id: 'custom', requirement: { type: 'nonexistent', value: 1 } });
      const awarded = bs.checkAndAwardBadges('u1', {});
      expect(awarded).toHaveLength(0);
    });

    it('does not award duplicate badges on subsequent calls', () => {
      bs.checkAndAwardBadges('u1', { skillCount: 1 });
      const awarded = bs.checkAndAwardBadges('u1', { skillCount: 1 });
      expect(awarded).toHaveLength(0);
    });

    it('returns empty array when no requirements met', () => {
      const awarded = bs.checkAndAwardBadges('u1', { skillCount: 0, totalDownloads: 0, avgRating: 0, verified: false });
      expect(awarded).toEqual([]);
    });

    it('persists badges to userBadges map', () => {
      bs.checkAndAwardBadges('u1', { skillCount: 1 });
      expect(bs.userBadges.get('u1')).toEqual(['first-skill']);
    });

    it('can award badges to different users independently', () => {
      bs.checkAndAwardBadges('u1', { skillCount: 1 });
      bs.checkAndAwardBadges('u2', { skillCount: 10 });
      expect(bs.userBadges.get('u1')).toHaveLength(1);
      expect(bs.userBadges.get('u2')).toHaveLength(2);
    });
  });

  describe('getUserBadges', () => {
    it('returns empty array for user with no badges', () => {
      expect(bs.getUserBadges('unknown')).toEqual([]);
    });

    it('returns badge objects for user with badges', () => {
      bs.checkAndAwardBadges('u1', { skillCount: 1 });
      const badges = bs.getUserBadges('u1');
      expect(badges).toHaveLength(1);
      expect(badges[0].id).toBe('first-skill');
      expect(badges[0].name).toBe('初出茅庐');
    });
  });
});

describe('LeaderboardSystem', () => {
  let lb;

  beforeEach(() => {
    lb = new LeaderboardSystem();
  });

  describe('constructor', () => {
    it('initializes 4 leaderboard categories', () => {
      expect(lb.leaderboards.size).toBe(4);
      expect(lb.leaderboards.has('downloads')).toBe(true);
      expect(lb.leaderboards.has('rating')).toBe(true);
      expect(lb.leaderboards.has('new')).toBe(true);
      expect(lb.leaderboards.has('revenue')).toBe(true);
    });

    it('each leaderboard starts with empty entries', () => {
      for (const [, lbConfig] of lb.leaderboards) {
        expect(lbConfig.entries).toEqual([]);
        expect(lbConfig.lastUpdated).toBeGreaterThan(0);
      }
    });
  });

  describe('updateLeaderboard', () => {
    it('sets entries for existing category', () => {
      const entries = [{ userId: 'u1', score: 100 }, { userId: 'u2', score: 50 }];
      lb.updateLeaderboard('downloads', entries);
      expect(lb.leaderboards.get('downloads').entries).toEqual(entries);
    });

    it('silently ignores unknown category', () => {
      lb.updateLeaderboard('unknown', [{ userId: 'u1', score: 10 }]);
      expect(lb.leaderboards.get('unknown')).toBeUndefined();
    });

    it('caps entries at 100', () => {
      const entries = Array.from({ length: 150 }, (_, i) => ({ userId: `u${i}`, score: i }));
      lb.updateLeaderboard('downloads', entries);
      expect(lb.leaderboards.get('downloads').entries).toHaveLength(100);
    });

    it('updates lastUpdated timestamp on each call', () => {
      const before = lb.leaderboards.get('downloads').lastUpdated;
      lb.updateLeaderboard('downloads', [{ userId: 'u1', score: 10 }]);
      expect(lb.leaderboards.get('downloads').lastUpdated).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getLeaderboard', () => {
    it('returns null for unknown type', () => {
      expect(lb.getLeaderboard('unknown')).toBeNull();
    });

    it('returns leaderboard metadata and entries', () => {
      const entries = [{ userId: 'u1', score: 100 }];
      lb.updateLeaderboard('downloads', entries);
      const result = lb.getLeaderboard('downloads');
      expect(result.id).toBe('downloads');
      expect(result.name).toBe('下载榜');
      expect(result.entries).toEqual(entries);
    });

    it('paginates with offset and limit', () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({ userId: `u${i}`, score: i }));
      lb.updateLeaderboard('downloads', entries);
      const result = lb.getLeaderboard('downloads', { limit: 3, offset: 2 });
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].userId).toBe('u2');
    });

    it('defaults to limit 20 and offset 0', () => {
      const entries = Array.from({ length: 25 }, (_, i) => ({ userId: `u${i}`, score: i }));
      lb.updateLeaderboard('downloads', entries);
      const result = lb.getLeaderboard('downloads');
      expect(result.entries).toHaveLength(20);
    });
  });
});

describe('DeveloperPortal._getTierLimits', () => {
  let dp;

  beforeEach(() => {
    dp = new DeveloperPortal();
  });

  it('should return free limits for unknown tier', () => {
    const limits = dp._getTierLimits('nonexistent');
    expect(limits.skills).toBe(5);
    expect(limits.monthlyDownloads).toBe(1000);
  });

  it('should return pro limits for pro tier', () => {
    const limits = dp._getTierLimits('pro');
    expect(limits.skills).toBe(50);
  });

  it('should return enterprise limits for enterprise tier', () => {
    const limits = dp._getTierLimits('enterprise');
    expect(limits.skills).toBe(-1);
  });
});

describe('AnalyticsHub additional coverage', () => {
  let ah;

  beforeEach(() => {
    ah = new AnalyticsHub();
  });

  it('should include reviewed events in analytics', () => {
    ah.trackEvent({ type: 'skill.reviewed', skillId: 's1' });
    const analytics = ah.getSkillAnalytics('s1');
    expect(analytics.overview.totalReviews).toBe(1);
  });

  it('should skip events without category in topCategories', () => {
    ah.trackEvent({ type: 'skill.published', category: 'productivity' });
    ah.trackEvent({ type: 'skill.downloaded' });
    const report = ah.generateReport('market-overview');
    expect(report.data.topCategories).toHaveLength(1);
    expect(report.data.topCategories[0].category).toBe('productivity');
  });

  it('should skip events without skillId in trending skills', () => {
    ah.trackEvent({ type: 'skill.downloaded', skillId: 's1' });
    ah.trackEvent({ type: 'skill.viewed' });
    const report = ah.generateReport('trending-skills');
    expect(report.data).toHaveLength(1);
    expect(report.data[0].skillId).toBe('s1');
  });

  it('should handle payment events without amount', () => {
    ah.trackEvent({ type: 'payment.received', developerId: 'dev1' });
    ah.trackEvent({ type: 'payment.received', developerId: 'dev1', amount: 100 });
    const report = ah.generateReport('developer-performance', { developerId: 'dev1' });
    expect(report.data.totalEarnings).toBe(100);
  });
});
