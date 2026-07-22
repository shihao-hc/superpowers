const { VerticalDomainMarket } = require('../../src/skills/market/VerticalDomainMarket');

describe('VerticalDomainMarket', () => {
  let market;

  beforeEach(() => {
    market = new VerticalDomainMarket();
  });

  describe('constructor', () => {
    it('initializes 6 domains', () => {
      const domains = market.getDomains();
      expect(domains).toHaveLength(6);
      expect(domains.map(d => d.id)).toEqual([
        'finance', 'healthcare', 'legal', 'manufacturing', 'education', 'retail'
      ]);
    });

    it('each domain has name, icon, color, compliance, certifications', () => {
      const domains = market.getDomains();
      domains.forEach(d => {
        expect(d.name).toBeTruthy();
        expect(d.nameEn).toBeTruthy();
        expect(d.icon).toBeTruthy();
        expect(d.color).toMatch(/^#[0-9a-f]{6}$/);
        expect(Array.isArray(d.compliance)).toBe(true);
        expect(Array.isArray(d.certifications)).toBe(true);
        expect(d.skillsCount).toBe(6);
        expect(d.templatesCount).toBe(2);
        expect(d.createdAt).toBeGreaterThan(0);
      });
    });
  });

  describe('getDomains', () => {
    it('returns domains without skills/templates arrays', () => {
      const domains = market.getDomains();
      domains.forEach(d => {
        expect(d.skills).toBeUndefined();
        expect(d.templates).toBeUndefined();
        expect(d.skillsCount).toBe(6);
        expect(d.templatesCount).toBe(2);
      });
    });
  });

  describe('getDomain', () => {
    it('returns full domain object by ID', () => {
      const finance = market.getDomain('finance');
      expect(finance).toBeTruthy();
      expect(finance.id).toBe('finance');
      expect(finance.name).toBe('金融领域');
      expect(finance.nameEn).toBe('Finance');
      expect(Array.isArray(finance.skills)).toBe(true);
      expect(finance.skills).toHaveLength(6);
    });

    it('returns undefined for unknown domain', () => {
      expect(market.getDomain('nonexistent')).toBeUndefined();
    });
  });

  describe('getDomainSkills', () => {
    it('returns all active skills for domain', () => {
      const skills = market.getDomainSkills('finance');
      expect(skills).toHaveLength(6);
      skills.forEach(s => {
        expect(s.status).toBe('active');
        expect(s.domainId).toBe('finance');
      });
    });

    it('returns empty array for unknown domain', () => {
      expect(market.getDomainSkills('unknown')).toEqual([]);
    });

    it('filters by category', () => {
      const skills = market.getDomainSkills('finance', { category: 'stocks' });
      expect(skills).toHaveLength(2);
      expect(skills.every(s => s.category === 'stocks')).toBe(true);
    });

    it('filters by search query (name)', () => {
      const skills = market.getDomainSkills('finance', { search: '股票' });
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.every(s =>
        s.name.includes('股票') || s.description.includes('股票') || s.tags.some(t => t.includes('股票'))
      )).toBe(true);
    });

    it('filters by search query (description)', () => {
      const skills = market.getDomainSkills('healthcare', { search: '检查' });
      expect(skills.length).toBeGreaterThan(0);
    });

    it('filters by search query (tags)', () => {
      const skills = market.getDomainSkills('finance', { search: 'MACD' });
      expect(skills).toHaveLength(1);
      expect(skills[0].id).toBe('finance-stock-analysis');
    });

    it('sorts by rating descending by default', () => {
      const skills = market.getDomainSkills('finance');
      for (let i = 1; i < skills.length; i++) {
        expect(skills[i - 1].rating).toBeGreaterThanOrEqual(skills[i].rating);
      }
    });

    it('sorts by downloads', () => {
      const skills = market.getDomainSkills('finance', { sort: 'downloads' });
      for (let i = 1; i < skills.length; i++) {
        expect(skills[i - 1].downloads).toBeGreaterThanOrEqual(skills[i].downloads);
      }
    });

    it('sorts by newest', () => {
      const skills = market.getDomainSkills('finance', { sort: 'newest' });
      for (let i = 1; i < skills.length; i++) {
        expect(skills[i - 1].registeredAt).toBeGreaterThanOrEqual(skills[i].registeredAt);
      }
    });

    it('sorts by name', () => {
      const skills = market.getDomainSkills('finance', { sort: 'name' });
      for (let i = 1; i < skills.length; i++) {
        expect(skills[i - 1].name.localeCompare(skills[i].name)).toBeLessThanOrEqual(0);
      }
    });

    it('limits results', () => {
      const skills = market.getDomainSkills('finance', { limit: 2 });
      expect(skills).toHaveLength(2);
    });

    it('returns empty array for category with no matches', () => {
      const skills = market.getDomainSkills('finance', { category: 'nonexistent' });
      expect(skills).toEqual([]);
    });

    it('returns empty array for search with no matches', () => {
      const skills = market.getDomainSkills('finance', { search: 'ZZZNOTFOUND' });
      expect(skills).toEqual([]);
    });
  });

  describe('getSkill', () => {
    it('returns skill by full ID', () => {
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill).toBeTruthy();
      expect(skill.name).toBe('股票技术分析');
      expect(skill.category).toBe('stocks');
    });

    it('returns undefined for unknown skill', () => {
      expect(market.getSkill('unknown')).toBeUndefined();
    });
  });

  describe('getDomainTemplates', () => {
    it('returns templates for domain', () => {
      const templates = market.getDomainTemplates('finance');
      expect(templates).toHaveLength(2);
      expect(templates.map(t => t.id)).toEqual([
        'finance-quarterly-report', 'finance-loan-approval'
      ]);
    });

    it('returns empty array for unknown domain', () => {
      expect(market.getDomainTemplates('unknown')).toEqual([]);
    });
  });

  describe('getTemplate', () => {
    it('returns template by full ID', () => {
      const template = market.getTemplate('finance-quarterly-report');
      expect(template).toBeTruthy();
      expect(template.name).toBe('季度财报分析');
      expect(template.steps).toHaveLength(3);
    });

    it('returns undefined for unknown template', () => {
      expect(market.getTemplate('unknown')).toBeUndefined();
    });
  });

  describe('search', () => {
    it('finds skills matching query across all domains', () => {
      const results = market.search('股票');
      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => {
        expect(r.matchScore).toBeGreaterThan(0);
      });
    });

    it('calculates match scores in descending order', () => {
      const results = market.search('股票');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].matchScore).toBeGreaterThanOrEqual(results[i].matchScore);
      }
    });

    it('filters by specific domains', () => {
      const results = market.search('stock', { domains: ['finance'] });
      expect(results.every(r => r.domainId === 'finance')).toBe(true);
    });

    it('returns empty array when no match found', () => {
      const results = market.search('XYZZYX_NOMATCH');
      expect(results).toEqual([]);
    });

    it('limits results', () => {
      const results = market.search('a', { limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('matches by name (score 0.5)', () => {
      const results = market.search('股票技术分析');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matchScore).toBeGreaterThanOrEqual(0.5);
    });

    it('matches by description (score 0.3)', () => {
      const results = market.search('基于技术指标');
      expect(results.length).toBeGreaterThan(0);
    });

    it('matches by tags (score 0.2)', () => {
      const results = market.search('K线');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('updateSkillMetrics', () => {
    it('updates successRate', () => {
      market.updateSkillMetrics('finance-stock-analysis', { successRate: 0.95 });
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.successRate).toBe(0.95);
    });

    it('updates avgResponseTime', () => {
      market.updateSkillMetrics('finance-stock-analysis', { avgResponseTime: 250 });
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.avgResponseTime).toBe(250);
    });

    it('updates usageCount', () => {
      market.updateSkillMetrics('finance-stock-analysis', { usageCount: 100 });
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.usageCount).toBe(100);
    });

    it('updates satisfactionScore', () => {
      market.updateSkillMetrics('finance-stock-analysis', { satisfactionScore: 4.5 });
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.satisfactionScore).toBe(4.5);
    });

    it('does partial update without affecting other metrics', () => {
      market.updateSkillMetrics('finance-stock-analysis', { successRate: 0.9 });
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.successRate).toBe(0.9);
      expect(skill.metrics.avgResponseTime).toBe(0);
    });

    it('does nothing for unknown skill', () => {
      market.updateSkillMetrics('unknown', { successRate: 0.5 });
      expect(market.getSkill('unknown')).toBeUndefined();
    });
  });

  describe('recordUsage', () => {
    it('increments usageCount', () => {
      market.recordUsage('finance-stock-analysis', { success: true });
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.usageCount).toBe(1);
    });

    it('updates success rate with running average', () => {
      market.recordUsage('finance-stock-analysis', { success: true });
      market.recordUsage('finance-stock-analysis', { success: true });
      market.recordUsage('finance-stock-analysis', { success: false });
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.successRate).toBeCloseTo(2 / 3, 10);
    });

    it('updates avg response time with running average', () => {
      market.recordUsage('finance-stock-analysis', { responseTime: 100 });
      market.recordUsage('finance-stock-analysis', { responseTime: 200 });
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.avgResponseTime).toBe(150);
    });

    it('increments domain totalDownloads', () => {
      const before = market.getDomain('finance').stats.totalDownloads;
      market.recordUsage('finance-stock-analysis', { success: true });
      expect(market.getDomain('finance').stats.totalDownloads).toBe(before + 1);
    });

    it('does nothing for unknown skill', () => {
      market.recordUsage('unknown', { success: true });
      expect(market.getDomain('finance').stats.totalDownloads).toBe(0);
    });

    it('handles usageData without success field', () => {
      market.recordUsage('finance-stock-analysis', {});
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.usageCount).toBe(1);
      expect(skill.metrics.successRate).toBe(0);
    });

    it('handles usageData without responseTime field', () => {
      market.recordUsage('finance-stock-analysis', { success: true });
      const skill = market.getSkill('finance-stock-analysis');
      expect(skill.metrics.avgResponseTime).toBe(0);
    });
  });

  describe('getDomainStats', () => {
    it('returns domain info and aggregated stats', () => {
      const stats = market.getDomainStats('finance');
      expect(stats.domain).toEqual({
        id: 'finance', name: '金融领域', nameEn: 'Finance', icon: '💰'
      });
      expect(stats.skillsCount).toBe(6);
      expect(stats.totalDownloads).toBeGreaterThan(0);
      expect(stats.totalUsage).toBe(0);
      expect(stats.averageRating).toBeGreaterThan(0);
      expect(stats.averageSuccessRate).toBe(0);
      expect(stats.averageResponseTime).toBe(0);
    });

    it('returns top 5 skills sorted by rating', () => {
      const stats = market.getDomainStats('finance');
      expect(stats.topSkills).toHaveLength(5);
      for (let i = 1; i < stats.topSkills.length; i++) {
        expect(stats.topSkills[i - 1].rating).toBeGreaterThanOrEqual(stats.topSkills[i].rating);
      }
      stats.topSkills.forEach(s => {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('rating');
        expect(s).toHaveProperty('downloads');
      });
    });

    it('includes usage in totalUsage after recording', () => {
      market.recordUsage('finance-stock-analysis', { success: true });
      market.recordUsage('finance-risk-assessment', { success: false });
      const stats = market.getDomainStats('finance');
      expect(stats.totalUsage).toBe(2);
    });

    it('calculates averageSuccessRate after recording', () => {
      market.recordUsage('finance-stock-analysis', { success: true });
      market.recordUsage('finance-risk-assessment', { success: true });
      const stats = market.getDomainStats('finance');
      expect(stats.averageSuccessRate).toBeGreaterThan(0);
    });

    it('calculates averageResponseTime across all domain skills', () => {
      market.recordUsage('finance-stock-analysis', { responseTime: 100 });
      market.recordUsage('finance-risk-assessment', { responseTime: 300 });
      const stats = market.getDomainStats('finance');
      expect(stats.averageResponseTime).toBeCloseTo(66.67, 1);
    });

    it('returns null for unknown domain', () => {
      expect(market.getDomainStats('unknown')).toBeNull();
    });

    it('aggregates totalDownloads from skill data', () => {
      const stats = market.getDomainStats('finance');
      const expected = market.getDomainSkills('finance').reduce((sum, s) => sum + s.downloads, 0);
      expect(stats.totalDownloads).toBe(expected);
    });
  });

  describe('getComplianceInfo', () => {
    it('returns regulations and certifications for domain', () => {
      const info = market.getComplianceInfo('healthcare');
      expect(info.regulations).toEqual(['HIPAA', 'GDPR', 'FDA', 'HL7']);
      expect(info.certifications).toEqual(['RN', 'MD', 'PharmD', 'RHIT']);
    });

    it('returns requirements for finance domain', () => {
      const info = market.getComplianceInfo('finance');
      expect(info.requirements.length).toBeGreaterThan(0);
      info.requirements.forEach(r => {
        expect(r).toHaveProperty('regulation');
        expect(r).toHaveProperty('description');
        expect(r).toHaveProperty('penalty');
      });
    });

    it('returns empty requirements for domain with no specific rules', () => {
      const info = market.getComplianceInfo('manufacturing');
      expect(info.requirements).toEqual([]);
    });

    it('returns null for unknown domain', () => {
      expect(market.getComplianceInfo('unknown')).toBeNull();
    });
  });

  describe('cross-domain validation', () => {
    it('skill IDs are unique and domain-prefixed', () => {
      const allIds = [];
      for (const id of market.skills.keys()) {
        expect(id).toMatch(/^[a-z]+-[a-z-]+$/);
        allIds.push(id);
      }
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('template IDs are unique and domain-prefixed', () => {
      const allIds = [];
      for (const id of market.templates.keys()) {
        expect(id).toMatch(/^[a-z]+-[a-z-]+$/);
        allIds.push(id);
      }
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('all templates reference valid skills', () => {
      for (const [, template] of market.templates) {
        template.steps.forEach(step => {
          const fullId = `${template.domainId}-${step}`;
          expect(market.skills.has(fullId)).toBe(true);
        });
      }
    });
  });

  describe('edge cases', () => {
    it('search with empty query matches all skills (String.includes("") is true)', () => {
      const results = market.search('');
      expect(results.length).toBeGreaterThan(0);
    });

    it('search with whitespace-only query returns empty', () => {
      expect(market.search('   ')).toEqual([]);
    });

    it('getDomainSkills with empty options uses defaults', () => {
      const skills = market.getDomainSkills('finance', {});
      expect(skills).toHaveLength(6);
    });

    it('_registerSkill with unknown domain does not crash', () => {
      market._registerSkill('nonexistent-domain', { id: 'orphan-skill', name: 'Orphan' });
      const skill = market.getSkill('nonexistent-domain-orphan-skill');
      expect(skill).toBeTruthy();
      expect(skill.name).toBe('Orphan');
    });

    it('_registerTemplate with unknown domain does not crash', () => {
      market._registerTemplate('absent-domain', { id: 'tpl', name: 'Orphan Tpl', steps: [] });
      const tpl = market.getTemplate('absent-domain-tpl');
      expect(tpl).toBeTruthy();
      expect(tpl.name).toBe('Orphan Tpl');
    });

    it('recordUsage with skill from unknown domain does not crash', () => {
      market._registerSkill('ghost', { id: 'x', name: 'Ghost' });
      market.recordUsage('ghost-x', { success: true, responseTime: 50 });
      const skill = market.getSkill('ghost-x');
      expect(skill.metrics.usageCount).toBe(1);
      expect(skill.metrics.successRate).toBe(1);
    });

    it('getDomainStats returns zeros for domain with no skills', () => {
      market.domains.get('finance').skills = [];
      const stats = market.getDomainStats('finance');
      expect(stats.skillsCount).toBe(0);
      expect(stats.totalDownloads).toBe(0);
      expect(stats.totalUsage).toBe(0);
      expect(stats.averageRating).toBe(0);
      expect(stats.averageSuccessRate).toBe(0);
      expect(stats.averageResponseTime).toBe(0);
      expect(stats.topSkills).toEqual([]);
    });
  });
});
