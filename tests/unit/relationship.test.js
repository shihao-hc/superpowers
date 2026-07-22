describe('Relationship', () => {
  let Relationship;
  let fs;
  let rel;

  beforeAll(() => {
    fs = require('fs');
    Relationship = require('../../src/core/Relationship');
  });

  beforeEach(() => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    rel = new Relationship({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('sets default state', () => {
      expect(rel.current).toBe('stranger');
      expect(rel.stats.totalInteractions).toBe(0);
      expect(rel.stats.successfulInteractions).toBe(0);
      expect(rel.stats.failedInteractions).toBe(0);
    });

    it('defines 5 relationship types', () => {
      expect(Object.keys(rel.types)).toEqual(['stranger', 'acquaintance', 'friend', 'partner', 'mentor']);
    });
  });

  describe('getRelationship', () => {
    it('returns a new relationship for unknown userId', () => {
      const r = rel.getRelationship('user-1');
      expect(r.type).toBe('stranger');
      expect(r.intimacy).toBe(0);
      expect(r.trust).toBe(0);
      expect(r.interactions).toBe(0);
      expect(r.userId).toBe('user-1');
    });

    it('returns existing relationship when already stored', () => {
      rel.recordInteraction('user-1', { success: true });
      const r = rel.getRelationship('user-1');
      expect(r.interactions).toBe(1);
      expect(r.type).not.toBe('stranger');
    });
  });

  describe('recordInteraction', () => {
    it('increments totalInteractions on success', () => {
      rel.recordInteraction('user-1', { success: true });
      expect(rel.stats.totalInteractions).toBe(1);
      expect(rel.stats.successfulInteractions).toBe(1);
    });

    it('increments failedInteractions on failure', () => {
      rel.recordInteraction('user-1', { success: false });
      expect(rel.stats.totalInteractions).toBe(1);
      expect(rel.stats.failedInteractions).toBe(1);
    });

    it('increases trust on successful interaction', () => {
      rel.recordInteraction('user-1', { success: true });
      expect(rel.getRelationship('user-1').trust).toBe(0.05);
    });

    it('does not increase trust on failed interaction', () => {
      rel.recordInteraction('user-1', { success: false });
      expect(rel.getRelationship('user-1').trust).toBe(0);
    });

    it('saves after recording', () => {
      rel.recordInteraction('user-1', { success: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('adjustRelationship', () => {
    it('adjusts intimacy within [0, 1]', () => {
      rel.getRelationship('user-1');
      rel.adjustRelationship('user-1', { intimacy: 0.5 });
      expect(rel.getRelationship('user-1').intimacy).toBe(0.5);
    });

    it('clamps intimacy at 1', () => {
      rel.getRelationship('user-1');
      rel.adjustRelationship('user-1', { intimacy: 5 });
      expect(rel.getRelationship('user-1').intimacy).toBe(1);
    });

    it('clamps intimacy at 0', () => {
      rel.getRelationship('user-1');
      rel.adjustRelationship('user-1', { intimacy: -5 });
      expect(rel.getRelationship('user-1').intimacy).toBe(0);
    });

    it('adjusts trust within [0, 1]', () => {
      rel.getRelationship('user-1');
      rel.adjustRelationship('user-1', { trust: 0.7 });
      expect(rel.getRelationship('user-1').trust).toBe(0.7);
    });

    it('saves after adjustment', () => {
      rel.adjustRelationship('user-1', { intimacy: 0.2 });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('rememberPreference / recallPreference', () => {
    it('stores preferences for a user', () => {
      rel.recordInteraction('user-1', { success: true });
      rel.rememberPreference('user-1', { tone: 'formal', language: 'zh' });
      expect(rel.getRelationship('user-1').preferences).toEqual({ tone: 'formal', language: 'zh' });
    });

    it('merges new preferences with existing', () => {
      rel.recordInteraction('user-1', { success: true });
      rel.rememberPreference('user-1', { tone: 'casual' });
      rel.rememberPreference('user-1', { language: 'en' });
      expect(rel.getRelationship('user-1').preferences).toEqual({ tone: 'casual', language: 'en' });
    });

    it('recallPreference returns preferences for existing user', () => {
      rel.recordInteraction('user-1', { success: true });
      rel.rememberPreference('user-1', { theme: 'dark' });
      expect(rel.recallPreference('user-1')).toEqual({ theme: 'dark' });
    });

    it('recallPreference returns empty object for unknown user', () => {
      expect(rel.recallPreference('ghost')).toEqual({});
    });
  });

  describe('buildConnection', () => {
    it('adds shared topics and increases intimacy', () => {
      rel.recordInteraction('user-1', { success: true });
      const r = rel.buildConnection('user-1', { topics: ['music', 'coding'] });
      expect(r.sharedTopics).toContain('music');
      expect(r.sharedTopics).toContain('coding');
      expect(r.intimacy).toBeGreaterThan(0);
    });

    it('does not duplicate shared topics', () => {
      rel.recordInteraction('user-1', { success: true });
      rel.buildConnection('user-1', { topics: ['music'] });
      const r = rel.buildConnection('user-1', { topics: ['music'] });
      expect(r.sharedTopics).toEqual(['music']);
    });

    it('initializes sharedTopics array when missing from relationship', () => {
      rel.getRelationship('user-no-st');
      delete rel.relationships['user-no-st'].sharedTopics;
      rel.buildConnection('user-no-st', { topics: ['music'] });
      expect(rel.getRelationship('user-no-st').sharedTopics).toEqual(['music']);
    });

    it('increases trust when helpful', () => {
      rel.recordInteraction('user-1', { success: true });
      const r = rel.buildConnection('user-1', { helpful: true });
      expect(r.trust).toBeGreaterThan(0);
      expect(r.trustBuilding).toBe(true);
    });

    it('saves after building connection', () => {
      rel.recordInteraction('user-1', { success: true });
      rel.buildConnection('user-1', { topics: ['music'], helpful: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getAdvice', () => {
    it('suggests introduction for strangers', () => {
      const advice = rel.getAdvice('stranger-user');
      expect(advice.some(a => a.includes('自我介绍'))).toBe(true);
    });

    it('suggests building intimacy when low', () => {
      const r = rel.getRelationship('new-user');
      r.intimacy = 0.1;
      const advice = rel.getAdvice('new-user');
      expect(advice.some(a => a.includes('增加互动'))).toBe(true);
    });

    it('suggests building trust when low', () => {
      const r = rel.getRelationship('low-trust-user');
      r.intimacy = 0.5;
      r.trust = 0;
      const advice = rel.getAdvice('low-trust-user');
      expect(advice.some(a => a.includes('建立信任'))).toBe(true);
    });

    it('mentions shared topics when available', () => {
      rel.getRelationship('topic-user');
      rel.buildConnection('topic-user', { topics: ['gaming'] });
      const advice = rel.getAdvice('topic-user');
      expect(advice.some(a => a.includes('共同话题'))).toBe(true);
    });

    it('omits stranger suggestion for non-stranger type', () => {
      const r = rel.getRelationship('known-user');
      r.type = 'friend';
      r.intimacy = 0.6;
      r.trust = 0.7;
      const advice = rel.getAdvice('known-user');
      expect(advice.some(a => a.includes('自我介绍'))).toBe(false);
    });

    it('omits trust suggestion when trust is already high', () => {
      const r = rel.getRelationship('trusted-user');
      r.intimacy = 0.3;
      r.trust = 0.7;
      const advice = rel.getAdvice('trusted-user');
      expect(advice.some(a => a.includes('建立信任'))).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns aggregated stats', () => {
      rel.recordInteraction('user-1', { success: true });
      rel.recordInteraction('user-1', { success: false });
      rel.recordInteraction('user-2', { success: true });
      const stats = rel.getStats();
      expect(stats.totalInteractions).toBe(3);
      expect(stats.successfulInteractions).toBe(2);
      expect(stats.failedInteractions).toBe(1);
      expect(stats.relationshipCount).toBe(2);
    });

    it('averageIntimacy is 0 when no relationships', () => {
      const stats = rel.getStats();
      expect(stats.averageIntimacy).toBe(0);
    });
  });

  describe('_updateIntimacy', () => {
    it('computes intimacy from interactions, success rate, and trust', () => {
      const fakeRel = { interactions: 5, successfulInteractions: 4, trust: 0.5 };
      rel._updateIntimacy(fakeRel);
      const expected = Math.min(1, (5 * 0.1) + ((4 / 5) * 0.4) + (0.5 * 0.5));
      expect(fakeRel.intimacy).toBe(expected);
    });

    it('handles zero interactions', () => {
      const fakeRel = { interactions: 0, successfulInteractions: 0, trust: 0 };
      rel._updateIntimacy(fakeRel);
      expect(fakeRel.intimacy).toBe(0);
    });
  });

  describe('_updateType', () => {
    it('returns stranger for intimacy < 0.3', () => {
      const fakeRel = { intimacy: 0.2 };
      rel._updateType(fakeRel);
      expect(fakeRel.type).toBe('stranger');
    });

    it('returns acquaintance for intimacy >= 0.3', () => {
      const fakeRel = { intimacy: 0.3 };
      rel._updateType(fakeRel);
      expect(fakeRel.type).toBe('acquaintance');
    });

    it('returns friend for intimacy >= 0.6', () => {
      const fakeRel = { intimacy: 0.6 };
      rel._updateType(fakeRel);
      expect(fakeRel.type).toBe('friend');
    });

    it('returns partner for intimacy >= 0.8', () => {
      const fakeRel = { intimacy: 0.8 };
      rel._updateType(fakeRel);
      expect(fakeRel.type).toBe('partner');
    });
  });

  describe('_save error handling', () => {
    it('catches and logs write errors', () => {
      fs.writeFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
      rel.recordInteraction('user-1', { success: true });
      expect(console.log).toHaveBeenLastCalledWith(expect.stringContaining('保存失败'), expect.any(String));
    });
  });

  describe('_load error handling', () => {
    it('catches and logs parse errors', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');
      new Relationship({});
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('加载失败'), expect.any(String));
    });
  });

  describe('_load (success path)', () => {
    it('loads existing relationships and stats from file', () => {
      fs.existsSync.mockReturnValueOnce(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        relationships: { 'existing-user': { intimacy: 0.5, type: 'friend' } },
        stats: { totalInteractions: 10, successfulInteractions: 3 }
      }));
      const rel2 = new Relationship({});
      expect(rel2.relationships['existing-user'].intimacy).toBe(0.5);
      expect(rel2.stats.totalInteractions).toBe(10);
    });

    it('falls back to defaults when file lacks stats and relationships', () => {
      fs.existsSync.mockReturnValueOnce(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({}));
      const rel2 = new Relationship({});
      expect(rel2.stats.totalInteractions).toBe(0);
      expect(Object.keys(rel2.relationships)).toHaveLength(0);
    });
  });

  describe('rememberPreference edge cases', () => {
    it('initializes preferences when loaded relationship has none', () => {
      fs.existsSync.mockReturnValueOnce(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        relationships: {
          'nopref': { userId: 'nopref', type: 'stranger', intimacy: 0, trust: 0, interactions: 0 }
        },
        stats: { totalInteractions: 1 }
      }));
      const rel2 = new Relationship({});
      rel2.rememberPreference('nopref', { color: 'blue' });
      expect(rel2.relationships['nopref'].preferences).toEqual({ color: 'blue' });
    });
  });

  describe('_save directory exists', () => {
    it('skips mkdir when relationships directory already exists', () => {
      fs.existsSync.mockImplementation((p) => p.includes('.opencode'));
      rel.recordInteraction('user-dir', { success: true });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});
