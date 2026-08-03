const fs = require('fs');
const path = require('path');

jest.mock('fs');

const { ReviewWorkflow } = require('../../src/skills/community/ReviewWorkflow');

describe('ReviewWorkflow', () => {
  let workflow;
  const defaultDataDir = path.join(process.cwd(), 'data', 'reviews');

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    workflow = new ReviewWorkflow();
  });

  const sampleSkillData = (overrides = {}) => ({
    id: 'skill-test-001',
    name: 'Test Skill',
    version: '1.0.0',
    author: 'author-123',
    category: 'utility',
    riskLevel: 'low',
    ...overrides
  });

  const sampleMember = (overrides = {}) => ({
    userId: 'user-001',
    username: 'reviewer1',
    role: 'reviewer',
    expertise: ['security'],
    ...overrides
  });

  const sampleScores = () => ({
    codeQuality: 85,
    security: 90,
    documentation: 80,
    functionality: 85,
    maintainability: 75
  });

  describe('constructor', () => {
    test('should create instance with default config', () => {
      expect(workflow).toBeInstanceOf(ReviewWorkflow);
      expect(workflow.dataDir).toBe(defaultDataDir);
      expect(workflow.config.minReviewers).toBe(2);
      expect(workflow.config.autoApproveThreshold).toBe(90);
      expect(workflow.committee).toEqual([]);
      expect(workflow.reviews.size).toBe(0);
    });

    test('should create data directory if it does not exist', () => {
      expect(fs.existsSync).toHaveBeenCalledWith(defaultDataDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(defaultDataDir, { recursive: true });
    });

    test('should load existing data when files exist', () => {
      jest.clearAllMocks();
      fs.existsSync.mockImplementation((p) => {
        if (p.endsWith('config.json')) {return true;}
        if (p.endsWith('committee.json')) {return true;}
        if (p.endsWith('reviews.json')) {return true;}
        return false;
      });
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('config.json')) {
          return JSON.stringify({ minReviewers: 3, autoApproveThreshold: 95 });
        }
        if (p.endsWith('committee.json')) {
          return JSON.stringify({ members: [{ userId: 'user-001', username: 'alice' }] });
        }
        if (p.endsWith('reviews.json')) {
          return JSON.stringify({ reviews: { 'review-1': { id: 'review-1', status: 'pending' } } });
        }
        return '{}';
      });

      const loaded = new ReviewWorkflow();

      expect(loaded.config.minReviewers).toBe(3);
      expect(loaded.committee).toHaveLength(1);
      expect(loaded.reviews.size).toBe(1);
    });

    test('should handle load errors gracefully', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('Read error'); });

      const loaded = new ReviewWorkflow();
      expect(loaded.committee).toEqual([]);
      expect(loaded.reviews.size).toBe(0);
    });

    test('should accept custom dataDir', () => {
      const custom = new ReviewWorkflow({ dataDir: '/custom/path' });
      expect(custom.dataDir).toBe('/custom/path');
    });
  });

  describe('addCommitteeMember', () => {
    test('should add a committee member', () => {
      const member = workflow.addCommitteeMember(sampleMember());

      expect(member.userId).toBe('user-001');
      expect(member.username).toBe('reviewer1');
      expect(member.role).toBe('reviewer');
      expect(member.isActive).toBe(true);
      expect(member.reviewsCompleted).toBe(0);
      expect(member.joinedAt).toBeDefined();
      expect(workflow.committee).toHaveLength(1);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should throw if user is already in committee', () => {
      workflow.addCommitteeMember(sampleMember());

      expect(() => workflow.addCommitteeMember(sampleMember())).toThrow('User already in committee');
    });

    test('should allow multiple members', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'user-001', username: 'alice' }));
      workflow.addCommitteeMember(sampleMember({ userId: 'user-002', username: 'bob' }));

      expect(workflow.committee).toHaveLength(2);
    });

    test('should set defaults for optional fields', () => {
      const member = workflow.addCommitteeMember({ userId: 'user-003', username: 'charlie' });

      expect(member.role).toBe('reviewer');
      expect(member.expertise).toEqual([]);
    });
  });

  describe('removeCommitteeMember', () => {
    test('should remove a committee member', () => {
      workflow.addCommitteeMember(sampleMember());
      const result = workflow.removeCommitteeMember('user-001');

      expect(result).toEqual({ removed: true });
      expect(workflow.committee).toHaveLength(0);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should throw if user not in committee', () => {
      expect(() => workflow.removeCommitteeMember('user-999')).toThrow('User not in committee');
    });
  });

  describe('submitForReview', () => {
    test('should create a pending review', () => {
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');

      expect(review.id).toContain('review-skill-test-001');
      expect(review.skillId).toBe('skill-test-001');
      expect(review.skillName).toBe('Test Skill');
      expect(review.submitterId).toBe('submitter-001');
      expect(review.status).toBe('pending');
      expect(review.reviews).toEqual([]);
      expect(review.scores).toEqual({});
      expect(review.metadata.author).toBe('author-123');
      expect(workflow.reviews.size).toBe(1);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('assignReviewer', () => {
    test('should assign a reviewer to a review', () => {
      workflow.addCommitteeMember(sampleMember());
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');

      const assignment = workflow.assignReviewer(review.id, 'user-001');

      expect(assignment.reviewerId).toBe('user-001');
      expect(assignment.status).toBe('assigned');
      expect(assignment.scores).toBeNull();

      const updatedReview = workflow.getReview(review.id);
      expect(updatedReview.status).toBe('in_review');
      expect(updatedReview.reviews).toHaveLength(1);
    });

    test('should throw if review not found', () => {
      expect(() => workflow.assignReviewer('nonexistent', 'user-001'))
        .toThrow('Review not found: nonexistent');
    });

    test('should throw if user is not a committee member', () => {
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');

      expect(() => workflow.assignReviewer(review.id, 'not-member'))
        .toThrow('User is not a committee member');
    });

    test('should throw if reviewer already assigned', () => {
      workflow.addCommitteeMember(sampleMember());
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');
      workflow.assignReviewer(review.id, 'user-001');

      expect(() => workflow.assignReviewer(review.id, 'user-001'))
        .toThrow('Reviewer already assigned');
    });
  });

  describe('submitReview', () => {
    test('should throw if review not found', () => {
      expect(() => workflow.submitReview('nonexistent', 'user-001', { scores: {}, comments: '' }))
        .toThrow('Review not found: nonexistent');
    });

    test('should throw if reviewer not assigned', () => {
      workflow.addCommitteeMember(sampleMember());
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');

      expect(() => workflow.submitReview(review.id, 'user-001', { scores: {}, comments: '' }))
        .toThrow('Reviewer not assigned to this review');
    });

    test('should throw if scores sum to zero', () => {
      workflow.addCommitteeMember(sampleMember());
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');
      workflow.assignReviewer(review.id, 'user-001');

      expect(() => workflow.submitReview(review.id, 'user-001', {
        scores: { codeQuality: 0, security: 0, documentation: 0, functionality: 0, maintainability: 0 },
        comments: 'no scores'
      })).toThrow('Scores are required');
    });

    test('should record reviewer submission and update stats', () => {
      workflow.addCommitteeMember(sampleMember());
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');
      workflow.assignReviewer(review.id, 'user-001');

      const result = workflow.submitReview(review.id, 'user-001', {
        scores: sampleScores(),
        comments: 'Looks good',
        recommendation: 'approve'
      });

      expect(result.status).toBe('completed');
      expect(result.scores).toEqual(sampleScores());
      expect(result.recommendation).toBe('approve');
      expect(result.completedAt).toBeDefined();

      const member = workflow.getCommitteeMember('user-001');
      expect(member.reviewsCompleted).toBe(1);
    });

    test('should auto-approve when all scores meet minimums', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'user-001' }));
      workflow.addCommitteeMember(sampleMember({ userId: 'user-002', username: 'reviewer2' }));
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');
      workflow.assignReviewer(review.id, 'user-001');
      workflow.assignReviewer(review.id, 'user-002');

      workflow.submitReview(review.id, 'user-001', {
        scores: sampleScores(), comments: 'Good', recommendation: 'approve'
      });
      expect(workflow.getReview(review.id).status).toBe('in_review');

      workflow.submitReview(review.id, 'user-002', {
        scores: sampleScores(), comments: 'LGTM', recommendation: 'approve'
      });

      const updated = workflow.getReview(review.id);
      expect(updated.status).toBe('approved');
      expect(updated.decision).toBe('approved');
      expect(updated.decisionAt).toBeDefined();
      expect(updated.finalScore).toBeGreaterThanOrEqual(80);
    });

    test('should auto-reject when one criterion is below minimum', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'user-001' }));
      workflow.addCommitteeMember(sampleMember({ userId: 'user-002', username: 'reviewer2' }));
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');
      workflow.assignReviewer(review.id, 'user-001');
      workflow.assignReviewer(review.id, 'user-002');

      workflow.submitReview(review.id, 'user-001', {
        scores: { ...sampleScores(), security: 50 },
        comments: 'Security concerns', recommendation: 'reject'
      });
      workflow.submitReview(review.id, 'user-002', {
        scores: { ...sampleScores(), security: 55 },
        comments: 'Needs security fix', recommendation: 'reject'
      });

      const updated = workflow.getReview(review.id);
      expect(updated.status).toBe('rejected');
      expect(updated.decision).toBe('rejected');
    });

    test('should use weighted average for final score', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'user-001' }));
      workflow.addCommitteeMember(sampleMember({ userId: 'user-002', username: 'reviewer2' }));
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');
      workflow.assignReviewer(review.id, 'user-001');
      workflow.assignReviewer(review.id, 'user-002');

      workflow.submitReview(review.id, 'user-001', {
        scores: { codeQuality: 100, security: 100, documentation: 100, functionality: 100, maintainability: 100 },
        comments: 'Perfect', recommendation: 'approve'
      });
      workflow.submitReview(review.id, 'user-002', {
        scores: { codeQuality: 100, security: 100, documentation: 100, functionality: 100, maintainability: 100 },
        comments: 'Perfect', recommendation: 'approve'
      });

      const updated = workflow.getReview(review.id);
      expect(updated.finalScore).toBe(100);
    });
  });

  describe('getReview', () => {
    test('should return review by id', () => {
      const review = workflow.submitForReview(sampleSkillData(), 'submitter-001');
      expect(workflow.getReview(review.id)).toBe(review);
    });

    test('should return null for nonexistent review', () => {
      expect(workflow.getReview('nonexistent')).toBeNull();
    });
  });

  describe('getPendingReviews', () => {
    test('should return pending and in_review reviews sorted by oldest first', () => {
      workflow.submitForReview(sampleSkillData({ id: 's1' }), 'u1');
      workflow.submitForReview(sampleSkillData({ id: 's2' }), 'u2');

      const pending = workflow.getPendingReviews();
      expect(pending).toHaveLength(2);
    });

    test('should not return approved or rejected reviews', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'u1' }));
      workflow.addCommitteeMember(sampleMember({ userId: 'u2', username: 'r2' }));
      const r = workflow.submitForReview(sampleSkillData({ id: 's1' }), 'u-sub');
      workflow.assignReviewer(r.id, 'u1');
      workflow.assignReviewer(r.id, 'u2');
      workflow.submitReview(r.id, 'u1', { scores: sampleScores(), comments: '', recommendation: 'approve' });
      workflow.submitReview(r.id, 'u2', { scores: sampleScores(), comments: '', recommendation: 'approve' });

      workflow.submitForReview(sampleSkillData({ id: 's2' }), 'u-sub2');

      const pending = workflow.getPendingReviews();
      expect(pending).toHaveLength(1);
      expect(pending[0].skillId).toBe('s2');
    });

    test('should limit results', () => {
      for (let i = 0; i < 5; i++) {
        workflow.submitForReview(sampleSkillData({ id: `s${i}` }), 'u-sub');
      }

      expect(workflow.getPendingReviews(3)).toHaveLength(3);
    });
  });

  describe('getReviewHistory', () => {
    test('should return paginated history sorted newest first', () => {
      workflow.submitForReview(sampleSkillData({ id: 's1' }), 'u1');
      workflow.submitForReview(sampleSkillData({ id: 's2' }), 'u2');

      const result = workflow.getReviewHistory();
      expect(result.reviews).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    test('should filter by status', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'u1' }));
      workflow.addCommitteeMember(sampleMember({ userId: 'u2', username: 'r2' }));
      const r = workflow.submitForReview(sampleSkillData({ id: 's1' }), 'u-sub');
      workflow.assignReviewer(r.id, 'u1');
      workflow.assignReviewer(r.id, 'u2');
      workflow.submitReview(r.id, 'u1', { scores: sampleScores(), comments: '', recommendation: 'approve' });
      workflow.submitReview(r.id, 'u2', { scores: sampleScores(), comments: '', recommendation: 'approve' });

      const result = workflow.getReviewHistory({ status: 'approved' });
      expect(result.reviews).toHaveLength(1);
    });

    test('should filter by skillId', () => {
      workflow.submitForReview(sampleSkillData({ id: 's1' }), 'u1');
      workflow.submitForReview(sampleSkillData({ id: 's2' }), 'u2');

      const result = workflow.getReviewHistory({ skillId: 's1' });
      expect(result.reviews).toHaveLength(1);
    });

    test('should filter by reviewerId', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'u-r1' }));
      const r = workflow.submitForReview(sampleSkillData({ id: 's1' }), 'u-sub');
      workflow.assignReviewer(r.id, 'u-r1');

      const result = workflow.getReviewHistory({ reviewerId: 'u-r1' });
      expect(result.reviews).toHaveLength(1);
    });

    test('should support offset and limit', () => {
      for (let i = 0; i < 10; i++) {
        workflow.submitForReview(sampleSkillData({ id: `s${i}` }), 'u-sub');
      }

      const result = workflow.getReviewHistory({ offset: 5, limit: 3 });
      expect(result.reviews).toHaveLength(3);
      expect(result.total).toBe(10);
    });
  });

  describe('getStats', () => {
    test('should return zero stats when no reviews', () => {
      const stats = workflow.getStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.inReview).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.avgReviewTime).toBe(0);
      expect(stats.committeeSize).toBe(0);
    });

    test('should reflect current state', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'u1' }));
      workflow.addCommitteeMember(sampleMember({ userId: 'u2', username: 'r2' }));
      workflow.submitForReview(sampleSkillData({ id: 's1' }), 'u-sub');

      const stats1 = workflow.getStats();
      expect(stats1.total).toBe(1);
      expect(stats1.pending).toBe(1);
      expect(stats1.committeeSize).toBe(2);
    });
  });

  describe('getCommittee / getCommitteeMember', () => {
    test('should return committee list copy', () => {
      workflow.addCommitteeMember(sampleMember());
      const list = workflow.getCommittee();

      expect(list).toHaveLength(1);
      list.push({});
      expect(workflow.committee).toHaveLength(1);
    });

    test('should find committee member by userId', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'u1', username: 'alice' }));
      workflow.addCommitteeMember(sampleMember({ userId: 'u2', username: 'bob' }));

      const found = workflow.getCommitteeMember('u1');
      expect(found.username).toBe('alice');
    });

    test('should return null for missing member', () => {
      expect(workflow.getCommitteeMember('nobody')).toBeNull();
    });
  });

  describe('updateConfig / getConfig', () => {
    test('should merge config and persist', () => {
      const updated = workflow.updateConfig({ minReviewers: 5, reviewTimeoutDays: 14 });

      expect(updated.minReviewers).toBe(5);
      expect(updated.reviewTimeoutDays).toBe(14);
      expect(updated.autoApproveThreshold).toBe(90);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should return a copy of config', () => {
      const config = workflow.getConfig();
      config.minReviewers = 999;

      expect(workflow.config.minReviewers).toBe(2);
    });
  });

  describe('generateReport', () => {
    test('should throw if review not found', () => {
      expect(() => workflow.generateReport('nonexistent')).toThrow('Review not found: nonexistent');
    });

    test('should generate a complete report for completed review', () => {
      workflow.addCommitteeMember(sampleMember({ userId: 'u1', username: 'alice' }));
      workflow.addCommitteeMember(sampleMember({ userId: 'u2', username: 'bob' }));
      const r = workflow.submitForReview(sampleSkillData(), 'u-sub');
      workflow.assignReviewer(r.id, 'u1');
      workflow.assignReviewer(r.id, 'u2');
      workflow.submitReview(r.id, 'u1', { scores: sampleScores(), comments: 'ok', recommendation: 'approve' });
      workflow.submitReview(r.id, 'u2', { scores: sampleScores(), comments: 'fine', recommendation: 'approve' });

      const report = workflow.generateReport(r.id);

      expect(report.skill.id).toBe('skill-test-001');
      expect(report.skill.name).toBe('Test Skill');
      expect(report.status).toBe('approved');
      expect(report.decision).toBe('approved');
      expect(report.finalScore).toBeDefined();
      expect(report.reviewers).toHaveLength(2);
      expect(report.reviewers[0].name).toBe('alice');
      expect(report.reviewers[1].name).toBe('bob');
      expect(report.duration).toBe(0);
    });

    test('should return null duration for pending review', () => {
      const r = workflow.submitForReview(sampleSkillData(), 'u-sub');
      const report = workflow.generateReport(r.id);

      expect(report.status).toBe('pending');
      expect(report.duration).toBeNull();
    });
  });

  describe('_checkMinimumScores', () => {
    test('should return true when all scores meet minimums', () => {
      const scores = { codeQuality: 70, security: 80, documentation: 60, functionality: 70, maintainability: 60 };
      expect(workflow._checkMinimumScores(scores)).toBe(true);
    });

    test('should return false when a criterion is below minimum', () => {
      const scores = { codeQuality: 70, security: 30, documentation: 60, functionality: 70, maintainability: 60 };
      expect(workflow._checkMinimumScores(scores)).toBe(false);
    });

    test('should skip criteria not present in scores', () => {
      const scores = { codeQuality: 70, security: 80 };
      expect(workflow._checkMinimumScores(scores)).toBe(true);
    });
  });

  describe('_calculateAvgReviewTime', () => {
    test('should return 0 when no completed reviews', () => {
      expect(workflow._calculateAvgReviewTime([])).toBe(0);
    });

    test('should calculate average review time in days', () => {
      const reviews = [
        {
          submittedAt: '2026-07-01T00:00:00.000Z',
          decisionAt: '2026-07-03T00:00:00.000Z'
        },
        {
          submittedAt: '2026-07-01T00:00:00.000Z',
          decisionAt: '2026-07-05T00:00:00.000Z'
        }
      ];

      const avg = workflow._calculateAvgReviewTime(reviews);
      expect(avg).toBe(3);
    });
  });

  describe('_saveData error handling', () => {
    test('should handle write errors gracefully', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('Disk full'); });

      expect(() => workflow.addCommitteeMember(sampleMember())).not.toThrow();
    });
  });
});
