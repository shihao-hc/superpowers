const { SkillContributionSystem } = require('../../src/skills/community/SkillContributionSystem');

describe('SkillContributionSystem', () => {
  let system;
  let mockContributor;
  let mockReviewer;
  let validSkillData;

  beforeEach(() => {
    system = new SkillContributionSystem();
    mockContributor = { id: 'user1', username: 'alice', reputation: 10 };
    mockReviewer = { id: 'reviewer1', username: 'bob', role: 'moderator' };
    validSkillData = {
      name: 'Data Cleaner',
      description: 'A utility skill that cleans and normalizes datasets for further processing',
      category: 'data-analysis',
      tags: ['data', 'cleanup'],
      code: 'function clean(data) { return data.filter(Boolean); }',
      examples: [{ input: '[1, null, 2]', output: '[1, 2]' }],
      documentation: 'Detailed documentation for the data cleaner skill covering usage and edge cases.'
    };
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(system.contributions).toBeInstanceOf(Map);
      expect(system.maxContributionsPerDay).toBe(5);
      expect(system.minQualityScore).toBe(0.6);
      expect(system.storage).toBeNull();
    });

    it('should accept custom options', () => {
      const mockStorage = { load: jest.fn(), save: jest.fn() };
      const custom = new SkillContributionSystem({
        maxContributionsPerDay: 3,
        minQualityScore: 0.8,
        storage: mockStorage
      });
      expect(custom.maxContributionsPerDay).toBe(3);
      expect(custom.minQualityScore).toBe(0.8);
      expect(custom.storage).toBe(mockStorage);
    });

    it('should load contributions from storage if available', async () => {
      const existing = {
        contrib_abc: { id: 'contrib_abc', status: 'approved', contributor: { id: 'u1' } }
      };
      const mockStorage = {
        load: jest.fn().mockResolvedValue(existing),
        save: jest.fn()
      };
      const sys = new SkillContributionSystem({ storage: mockStorage });
      await new Promise(process.nextTick);
      expect(mockStorage.load).toHaveBeenCalledWith('contributions');
      expect(sys.contributions.get('contrib_abc').status).toBe('approved');
    });
  });

  describe('submitContribution', () => {
    it('should submit a valid contribution', async () => {
      const result = await system.submitContribution(mockContributor, validSkillData);
      expect(result.id).toMatch(/^contrib_/);
      expect(result.status).toBe('pending');
      expect(result.contributor.id).toBe('user1');
      expect(result.contributor.username).toBe('alice');
      expect(result.skill.name).toBe('Data Cleaner');
      expect(result.skill.category).toBe('data-analysis');
      expect(result.qualityScore).toBe(0);
      expect(result.rewards.tier).toBe('bronze');
      expect(result.rewards.points).toBe(0);
      expect(typeof result.submittedAt).toBe('number');
      expect(typeof result.updatedAt).toBe('number');
    });

    it('should store contribution in the map', async () => {
      const result = await system.submitContribution(mockContributor, validSkillData);
      const stored = system.getContribution(result.id);
      expect(stored).toBe(result);
    });

    it('should throw if name is too short', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, name: 'AB' }))
        .rejects.toThrow('Name must be at least 3 characters');
    });

    it('should throw if description is too short', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, description: 'Short' }))
        .rejects.toThrow('Description must be at least 20 characters');
    });

    it('should throw if category is missing', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, category: '' }))
        .rejects.toThrow('Category is required');
    });

    it('should throw if both code and implementation are missing', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, code: '', implementation: '' }))
        .rejects.toThrow('Code or implementation is required');
    });

    it('should accept implementation field as alternative to code', async () => {
      const data = { ...validSkillData, code: '', implementation: 'function x() {}' };
      const result = await system.submitContribution(mockContributor, data);
      expect(result.status).toBe('pending');
    });

    it('should reject code with eval', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, code: 'eval("x")' }))
        .rejects.toThrow('Code contains prohibited patterns');
    });

    it('should reject code with exec', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, code: 'exec("cmd")' }))
        .rejects.toThrow('Code contains prohibited patterns');
    });

    it('should reject code with child_process', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, code: 'require("child_process")' }))
        .rejects.toThrow('Code contains prohibited patterns');
    });

    it('should reject code with process.env', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, code: 'process.env.SECRET' }))
        .rejects.toThrow('Code contains prohibited patterns');
    });

    it('should reject code with .env', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, code: 'fs.readFile(".env")' }))
        .rejects.toThrow('Code contains prohibited patterns');
    });

    it('should detect prohibited patterns in implementation field', async () => {
      await expect(system.submitContribution(mockContributor, { ...validSkillData, code: '', implementation: 'eval("x")' }))
        .rejects.toThrow('Code contains prohibited patterns');
    });

    it('should enforce daily contribution limit', async () => {
      const limitedSystem = new SkillContributionSystem({ maxContributionsPerDay: 2 });
      await limitedSystem.submitContribution(mockContributor, validSkillData);
      await limitedSystem.submitContribution(mockContributor, { ...validSkillData, name: 'Tool B', description: 'Another valid description that is long enough' });
      await expect(limitedSystem.submitContribution(mockContributor, { ...validSkillData, name: 'Tool C', description: 'Third valid description that is long enough' }))
        .rejects.toThrow('Daily contribution limit (2) reached');
    });

    it('should call onEvent on submission when set', async () => {
      const eventHandler = jest.fn();
      system.onEvent = eventHandler;
      await system.submitContribution(mockContributor, validSkillData);
      expect(eventHandler).toHaveBeenCalledWith('contribution_submitted', expect.objectContaining({
        status: 'pending'
      }));
    });

    it('should use defaults for missing optional fields', async () => {
      const minimal = { name: 'Min', description: 'Minimal skill that is long enough for validation', category: 'api', code: 'fn()' };
      const result = await system.submitContribution(mockContributor, minimal);
      expect(result.skill.tags).toEqual([]);
      expect(result.skill.inputs).toEqual([]);
      expect(result.skill.outputs).toEqual([]);
      expect(result.skill.code).toBe('fn()');
      expect(result.skill.examples).toEqual([]);
      expect(result.skill.documentation).toBe('');
      expect(result.skill.license).toBe('MIT');
    });

    it('should save to storage after submission', async () => {
      const mockStorage = { load: jest.fn().mockResolvedValue(null), save: jest.fn() };
      const sys = new SkillContributionSystem({ storage: mockStorage });
      await sys.submitContribution(mockContributor, validSkillData);
      expect(mockStorage.save).toHaveBeenCalledWith('contributions', expect.any(Object));
    });
  });

  describe('getContribution', () => {
    it('should retrieve contribution by ID', async () => {
      const result = await system.submitContribution(mockContributor, validSkillData);
      expect(system.getContribution(result.id)).toBe(result);
    });

    it('should return undefined for non-existent ID', () => {
      expect(system.getContribution('nonexistent')).toBeUndefined();
    });
  });

  describe('getContributionsByStatus', () => {
    it('should return contributions filtered by status', async () => {
      await system.submitContribution(mockContributor, validSkillData);
      await system.submitContribution(mockContributor, { ...validSkillData, name: 'Tool B', description: 'Another valid description that is long enough' });
      const pending = system.getContributionsByStatus('pending');
      expect(pending).toHaveLength(2);
      expect(pending.every(c => c.status === 'pending')).toBe(true);
    });

    it('should sort by submittedAt descending', async () => {
      const c1 = await system.submitContribution(mockContributor, validSkillData);
      await new Promise(r => setTimeout(r, 5));
      const c2 = await system.submitContribution(mockContributor, { ...validSkillData, name: 'Tool B', description: 'Another valid description that is long enough' });
      const results = system.getContributionsByStatus('pending');
      expect(results[0].id).toBe(c2.id);
      expect(results[1].id).toBe(c1.id);
    });

    it('should support limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await system.submitContribution(mockContributor, { ...validSkillData, name: `Tool ${i}`, description: `Desc for tool ${i} that is long enough for validation` });
      }
      const page1 = system.getContributionsByStatus('pending', { limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);
      const page2 = system.getContributionsByStatus('pending', { limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('getPendingContributions', () => {
    it('should return pending contributions with quality score >= minQualityScore', async () => {
      const c1 = await system.submitContribution(mockContributor, validSkillData);
      c1.qualityScore = 0.7;
      const c2 = await system.submitContribution(mockContributor, { ...validSkillData, name: 'Tool B', description: 'Another valid description that is long enough' });
      c2.qualityScore = 0.5;
      const results = system.getPendingContributions();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(c1.id);
    });

    it('should use default limit of 20', async () => {
      for (let i = 0; i < 25; i++) {
        const c = await system.submitContribution(
          { id: `user${i}`, username: `User${i}`, reputation: 0 },
          { ...validSkillData, name: `Tool ${i}`, description: `Desc for tool ${i} that is long enough for validation` }
        );
        c.qualityScore = 0.8;
      }
      expect(system.getPendingContributions()).toHaveLength(20);
    });
  });

  describe('reviewContribution', () => {
    it('should approve a contribution', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      const result = await system.reviewContribution(contribution.id, mockReviewer, {
        decision: 'approved',
        scores: { quality: 0.9, usefulness: 0.8 }
      });
      expect(result.status).toBe('approved');
      expect(result.qualityScore).toBeCloseTo(0.85, 5);
      expect(result.reviewHistory).toHaveLength(1);
      expect(result.reviewHistory[0].reviewer.id).toBe('reviewer1');
      expect(result.reviewHistory[0].decision).toBe('approved');
    });

    it('should reject a contribution', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      const result = await system.reviewContribution(contribution.id, mockReviewer, {
        decision: 'rejected',
        comments: 'Does not meet quality standards'
      });
      expect(result.status).toBe('rejected');
    });

    it('should mark as needs_revision', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      const result = await system.reviewContribution(contribution.id, mockReviewer, {
        decision: 'needs_revision',
        comments: 'Please add more examples'
      });
      expect(result.status).toBe('revision_needed');
    });

    it('should leave as pending for unknown decision', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      const result = await system.reviewContribution(contribution.id, mockReviewer, {
        decision: 'unknown_value'
      });
      expect(result.status).toBe('pending');
    });

    it('should throw if contribution not found', async () => {
      await expect(system.reviewContribution('nonexistent', mockReviewer, { decision: 'approved' }))
        .rejects.toThrow('Contribution not found');
    });

    it('should throw if contribution is not pending', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(contribution.id, mockReviewer, { decision: 'approved', scores: { q: 0.9 } });
      await expect(system.reviewContribution(contribution.id, mockReviewer, { decision: 'rejected' }))
        .rejects.toThrow('Contribution is not pending review');
    });

    it('should award rewards on approval', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      const result = await system.reviewContribution(contribution.id, mockReviewer, {
        decision: 'approved',
        scores: { quality: 0.9 }
      });
      expect(result.rewards.points).toBeGreaterThan(0);
      expect(result.rewards.badges).toBeInstanceOf(Array);
      expect(['bronze', 'silver', 'gold', 'platinum']).toContain(result.rewards.tier);
    });

    it('should call onEvent after review', async () => {
      const eventHandler = jest.fn();
      system.onEvent = eventHandler;
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(contribution.id, mockReviewer, { decision: 'approved', scores: { q: 0.8 } });
      expect(eventHandler).toHaveBeenCalledWith('contribution_reviewed', expect.objectContaining({
        contribution: expect.any(Object),
        review: expect.any(Object)
      }));
    });
  });

  describe('updateContribution', () => {
    it('should update a revision_needed contribution and reset to pending', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(contribution.id, mockReviewer, { decision: 'needs_revision' });
      const result = await system.updateContribution(contribution.id, {
        name: 'Updated Tool',
        description: 'An updated description that is long enough for validation'
      });
      expect(result.status).toBe('pending');
      expect(result.skill.name).toBe('Updated Tool');
      expect(result.qualityScore).toBe(0);
    });

    it('should update a rejected contribution without resetting status', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(contribution.id, mockReviewer, { decision: 'rejected' });
      const result = await system.updateContribution(contribution.id, {
        name: 'Updated Rejected'
      });
      expect(result.status).toBe('rejected');
      expect(result.skill.name).toBe('Updated Rejected');
    });

    it('should throw if contribution not found', async () => {
      await expect(system.updateContribution('nonexistent', { name: 'New' }))
        .rejects.toThrow('Contribution not found');
    });

    it('should not update approved contributions', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(contribution.id, mockReviewer, { decision: 'approved', scores: { q: 0.9 } });
      const result = await system.updateContribution(contribution.id, { name: 'Should Not Change' });
      expect(result.skill.name).toBe('Data Cleaner');
    });

    it('should update multiple fields', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(contribution.id, mockReviewer, { decision: 'needs_revision' });
      await system.updateContribution(contribution.id, {
        category: 'automation',
        tags: ['updated'],
        code: 'function newCode() {}',
        examples: [{ input: 'test', output: 'result' }],
        documentation: 'Updated documentation that is long enough to pass validation easily'
      });
      const updated = system.getContribution(contribution.id);
      expect(updated.skill.category).toBe('automation');
      expect(updated.skill.tags).toEqual(['updated']);
      expect(updated.skill.code).toBe('function newCode() {}');
      expect(updated.skill.examples).toEqual([{ input: 'test', output: 'result' }]);
    });

    it('should call onEvent on update', async () => {
      const eventHandler = jest.fn();
      system.onEvent = eventHandler;
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(contribution.id, mockReviewer, { decision: 'needs_revision' });
      await system.updateContribution(contribution.id, { name: 'Updated' });
      expect(eventHandler).toHaveBeenCalledWith('contribution_updated', expect.any(Object));
    });
  });

  describe('trackView / trackDownload', () => {
    it('should increment view count', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.trackView(contribution.id);
      expect(system.getContribution(contribution.id).stats.views).toBe(1);
    });

    it('should increment download count', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.trackDownload(contribution.id);
      expect(system.getContribution(contribution.id).stats.downloads).toBe(1);
    });

    it('should not throw for non-existent contribution', async () => {
      await expect(system.trackView('nonexistent')).resolves.toBeUndefined();
      await expect(system.trackDownload('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('addRating', () => {
    it('should add a rating', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.addRating(contribution.id, 'userX', 5);
      expect(contribution.stats.ratings).toHaveLength(1);
      expect(contribution.stats.ratings[0].rating).toBe(5);
      expect(contribution.stats.ratings[0].userId).toBe('userX');
    });

    it('should replace existing rating from same user', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.addRating(contribution.id, 'userX', 3);
      await system.addRating(contribution.id, 'userX', 5);
      expect(contribution.stats.ratings).toHaveLength(1);
      expect(contribution.stats.ratings[0].rating).toBe(5);
    });

    it('should allow multiple users to rate', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.addRating(contribution.id, 'userA', 4);
      await system.addRating(contribution.id, 'userB', 5);
      expect(contribution.stats.ratings).toHaveLength(2);
    });

    it('should throw if contribution not found', async () => {
      await expect(system.addRating('nonexistent', 'userX', 3))
        .rejects.toThrow('Contribution not found');
    });
  });

  describe('addComment', () => {
    it('should add a comment', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      const comment = await system.addComment(contribution.id, { id: 'u1', username: 'user1' }, 'Great skill!');
      expect(comment.id).toMatch(/^comment_/);
      expect(comment.user.id).toBe('u1');
      expect(comment.text).toBe('Great skill!');
      expect(comment.replies).toEqual([]);
      expect(typeof comment.timestamp).toBe('number');
    });

    it('should store comment in contribution', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.addComment(contribution.id, { id: 'u1', username: 'user1' }, 'Nice work');
      expect(contribution.stats.comments).toHaveLength(1);
    });

    it('should throw if contribution not found', async () => {
      await expect(system.addComment('nonexistent', { id: 'u1' }, 'test'))
        .rejects.toThrow('Contribution not found');
    });
  });

  describe('getContributorStats', () => {
    it('should return stats for a contributor', async () => {
      const c1 = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(c1.id, mockReviewer, { decision: 'approved', scores: { q: 0.9 } });
      const stats = system.getContributorStats('user1');
      expect(stats.totalContributions).toBe(1);
      expect(stats.approved).toBe(1);
      expect(stats.pending).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.totalPoints).toBeGreaterThan(0);
      expect(stats.averageQuality).toBe(0.9);
    });

    it('should handle contributor with no contributions', () => {
      const stats = system.getContributorStats('nonexistent');
      expect(stats.totalContributions).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.totalPoints).toBe(0);
      expect(stats.averageQuality).toBe(0);
      expect(stats.tier).toBe('bronze');
    });

    it('should aggregate badges from approved contributions', async () => {
      const c1 = await system.submitContribution(mockContributor, {
        ...validSkillData,
        examples: [{ i: '1' }, { i: '2' }, { i: '3' }],
        documentation: 'x'.repeat(500)
      });
      await system.reviewContribution(c1.id, mockReviewer, { decision: 'approved', scores: { q: 0.95 } });
      const stats = system.getContributorStats('user1');
      expect(stats.badges).toContain('quality-master');
      expect(stats.badges).toContain('documenter');
      expect(stats.badges).toContain('thorough');
      expect(stats.badges).toContain('first-contribution');
    });
  });

  describe('getLeaderboard', () => {
    it('should return contributors sorted by points descending', async () => {
      const contributorA = { id: 'a', username: 'Alice', reputation: 10 };
      const contributorB = { id: 'b', username: 'Bob', reputation: 10 };

      const c1 = await system.submitContribution(contributorA, validSkillData);
      await system.reviewContribution(c1.id, mockReviewer, { decision: 'approved', scores: { q: 0.9 } });

      const c2 = await system.submitContribution(contributorB, validSkillData);
      await system.reviewContribution(c2.id, mockReviewer, { decision: 'approved', scores: { q: 0.9 } });

      const board = system.getLeaderboard();
      expect(board).toHaveLength(2);
      expect(board[0].points).toBeGreaterThanOrEqual(board[1].points);
    });

    it('should respect limit option', async () => {
      for (let i = 0; i < 5; i++) {
        const c = await system.submitContribution(
          { id: `u${i}`, username: `User${i}`, reputation: 0 },
          { ...validSkillData, name: `Tool ${i}`, description: `Desc for tool ${i} that is long enough for validation` }
        );
        await system.reviewContribution(c.id, mockReviewer, { decision: 'approved', scores: { q: 0.8 } });
      }
      expect(system.getLeaderboard({ limit: 3 })).toHaveLength(3);
    });

    it('should only include approved contributions', async () => {
      await system.submitContribution(mockContributor, validSkillData);
      const board = system.getLeaderboard();
      expect(board).toHaveLength(0);
    });
  });

  describe('getDashboardStats', () => {
    it('should return aggregated stats', async () => {
      const c1 = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(c1.id, mockReviewer, { decision: 'approved', scores: { q: 0.8 } });
      const c2 = await system.submitContribution(mockContributor, { ...validSkillData, name: 'Tool B', description: 'Another valid description that is long enough' });
      await system.reviewContribution(c2.id, mockReviewer, { decision: 'rejected' });
      await system.submitContribution(mockContributor, { ...validSkillData, name: 'Tool C', description: 'Third valid description that is long enough' });

      const stats = system.getDashboardStats();
      expect(stats.total).toBe(3);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.revisionNeeded).toBe(0);
    });

    it('should calculate average quality from scored contributions only', async () => {
      const c1 = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(c1.id, mockReviewer, { decision: 'approved', scores: { q: 0.8 } });
      const c2 = await system.submitContribution(mockContributor, { ...validSkillData, name: 'Tool B', description: 'Another valid description that is long enough' });
      await system.reviewContribution(c2.id, mockReviewer, { decision: 'approved', scores: { q: 1.0 } });
      const stats = system.getDashboardStats();
      expect(stats.averageQuality).toBe(0.9);
    });

    it('should aggregate views and downloads', async () => {
      const c = await system.submitContribution(mockContributor, validSkillData);
      await system.trackView(c.id);
      await system.trackView(c.id);
      await system.trackDownload(c.id);
      const stats = system.getDashboardStats();
      expect(stats.totalViews).toBe(2);
      expect(stats.totalDownloads).toBe(1);
    });
  });

  describe('exportApprovedSkills', () => {
    it('should export only approved skills', async () => {
      const c1 = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(c1.id, mockReviewer, { decision: 'approved', scores: { q: 0.85 } });
      await system.submitContribution(mockContributor, { ...validSkillData, name: 'Tool B', description: 'Another valid description that is long enough' });
      const exported = system.exportApprovedSkills();
      expect(exported).toHaveLength(1);
      expect(exported[0].name).toBe('Data Cleaner');
    });

    it('should include expected fields in export', async () => {
      const c = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(c.id, mockReviewer, { decision: 'approved', scores: { q: 0.85 } });
      const exported = system.exportApprovedSkills()[0];
      expect(exported).toHaveProperty('id');
      expect(exported).toHaveProperty('name');
      expect(exported).toHaveProperty('description');
      expect(exported).toHaveProperty('category');
      expect(exported).toHaveProperty('tags');
      expect(exported).toHaveProperty('code');
      expect(exported).toHaveProperty('contributor', 'alice');
      expect(exported).toHaveProperty('qualityScore');
      expect(exported).toHaveProperty('stats');
      expect(exported).not.toHaveProperty('reviewHistory');
      expect(exported).not.toHaveProperty('rewards');
    });
  });

  describe('Reward system internals', () => {
    it('should calculate correct tier based on points', () => {
      expect(system._calculateTier(0)).toBe('bronze');
      expect(system._calculateTier(149)).toBe('bronze');
      expect(system._calculateTier(150)).toBe('silver');
      expect(system._calculateTier(299)).toBe('silver');
      expect(system._calculateTier(300)).toBe('gold');
      expect(system._calculateTier(499)).toBe('gold');
      expect(system._calculateTier(500)).toBe('platinum');
      expect(system._calculateTier(1000)).toBe('platinum');
    });

    it('should return correct category bonus', () => {
      expect(system._getCategoryBonus('machine-learning')).toBe(40);
      expect(system._getCategoryBonus('security')).toBe(35);
      expect(system._getCategoryBonus('data-analysis')).toBe(30);
      expect(system._getCategoryBonus('automation')).toBe(25);
      expect(system._getCategoryBonus('devops')).toBe(25);
      expect(system._getCategoryBonus('web-development')).toBe(20);
      expect(system._getCategoryBonus('database')).toBe(20);
      expect(system._getCategoryBonus('api')).toBe(20);
      expect(system._getCategoryBonus('unknown-category')).toBe(10);
    });

    it('should determine badges for quality score >= 0.9', () => {
      const badges = system._determineBadges({
        qualityScore: 0.95,
        skill: { examples: [], documentation: '' },
        contributor: { id: 'newUser' }
      });
      expect(badges).toContain('quality-master');
    });

    it('should determine badges for 3+ examples', () => {
      const badges = system._determineBadges({
        qualityScore: 0.5,
        skill: { examples: [1, 2, 3], documentation: '' },
        contributor: { id: 'newUser' }
      });
      expect(badges).toContain('documenter');
    });

    it('should determine badges for documentation >= 500 chars', () => {
      const badges = system._determineBadges({
        qualityScore: 0.5,
        skill: { examples: [], documentation: 'x'.repeat(500) },
        contributor: { id: 'newUser' }
      });
      expect(badges).toContain('thorough');
    });

    it('should determine first-contribution badge', async () => {
      const contribution = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(contribution.id, mockReviewer, { decision: 'approved', scores: { q: 0.8 } });
      expect(contribution.rewards.badges).toContain('first-contribution');
    });

    it('should not give first-contribution bonus on second approval', async () => {
      const sys = new SkillContributionSystem({ maxContributionsPerDay: 10 });
      const c1 = await sys.submitContribution(mockContributor, validSkillData);
      await sys.reviewContribution(c1.id, mockReviewer, { decision: 'approved', scores: { q: 0.8 } });
      const pointsAfterFirst = c1.rewards.points;
      const c2 = await sys.submitContribution(mockContributor, { ...validSkillData, name: 'Tool B', description: 'Another valid description that is long enough' });
      await sys.reviewContribution(c2.id, mockReviewer, { decision: 'approved', scores: { q: 0.8 } });
      expect(c2.rewards.points).toBeLessThan(pointsAfterFirst);
    });
  });

  describe('Contribution lifecycle', () => {
    it('should follow full lifecycle: draft → pending → review → approval', async () => {
      const result = await system.submitContribution(mockContributor, validSkillData);
      expect(result.status).toBe('pending');

      await system.reviewContribution(result.id, mockReviewer, {
        decision: 'approved',
        scores: { quality: 0.9, usefulness: 0.85 }
      });
      expect(result.status).toBe('approved');
      expect(result.qualityScore).toBe(0.875);
    });

    it('should follow lifecycle: pending → needs_revision → pending → approved', async () => {
      const result = await system.submitContribution(mockContributor, validSkillData);
      expect(result.status).toBe('pending');

      await system.reviewContribution(result.id, mockReviewer, { decision: 'needs_revision', comments: 'Fix docs' });
      expect(result.status).toBe('revision_needed');

      await system.updateContribution(result.id, { documentation: 'Updated documentation that is now long enough to pass' });
      expect(result.status).toBe('pending');

      await system.reviewContribution(result.id, mockReviewer, { decision: 'approved', scores: { q: 0.95 } });
      expect(result.status).toBe('approved');
    });

    it('should follow lifecycle: pending → rejected → update → rejected (no reset)', async () => {
      const result = await system.submitContribution(mockContributor, validSkillData);
      await system.reviewContribution(result.id, mockReviewer, { decision: 'rejected' });
      expect(result.status).toBe('rejected');

      await system.updateContribution(result.id, { name: 'Improved Name' });
      expect(result.status).toBe('rejected');
      expect(result.skill.name).toBe('Improved Name');
    });
  });

  describe('Storage integration', () => {
    it('should save after review', async () => {
      const mockStorage = { load: jest.fn().mockResolvedValue(null), save: jest.fn() };
      const sys = new SkillContributionSystem({ storage: mockStorage });
      const c = await sys.submitContribution(mockContributor, validSkillData);
      mockStorage.save.mockClear();
      await sys.reviewContribution(c.id, mockReviewer, { decision: 'approved', scores: { q: 0.9 } });
      expect(mockStorage.save).toHaveBeenCalledTimes(2);
    });

    it('should save after update', async () => {
      const mockStorage = { load: jest.fn().mockResolvedValue(null), save: jest.fn() };
      const sys = new SkillContributionSystem({ storage: mockStorage });
      const c = await sys.submitContribution(mockContributor, validSkillData);
      await sys.reviewContribution(c.id, mockReviewer, { decision: 'needs_revision' });
      mockStorage.save.mockClear();
      await sys.updateContribution(c.id, { name: 'Updated' });
      expect(mockStorage.save).toHaveBeenCalledTimes(1);
    });

    it('should not save contributions when storage is null', async () => {
      const sys = new SkillContributionSystem();
      const c = await sys.submitContribution(mockContributor, validSkillData);
      await sys.reviewContribution(c.id, mockReviewer, { decision: 'approved', scores: { q: 0.9 } });
      expect(c.status).toBe('approved');
    });
  });
});
