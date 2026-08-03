jest.mock('fs');
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/').replace(/\\/g, '/')),
  basename: jest.fn((p) => p.split('/').pop() || p.split('\\').pop()),
  extname: jest.fn((p) => { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : ''; }),
  dirname: jest.fn((p) => p.replace(/[/\\][^/\\]*$/, '') || '.'),
  resolve: jest.fn((...args) => args.join('/'))
}));

const fs = require('fs');
const { RewardSystem } = require('../../src/skills/community/RewardSystem');

describe('RewardSystem', () => {
  let system;

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    system = new RewardSystem({ dataDir: '/fake/rewards' });
  });

  describe('constructor', () => {
    it('initializes with default dataDir when not provided', () => {
      const s = new RewardSystem();
      expect(s.profiles).toBeInstanceOf(Map);
      expect(s.rewards).toBeInstanceOf(Array);
      expect(s.profilesFile).toContain('profiles.json');
      expect(s.rewardsFile).toContain('rewards.json');
    });

    it('uses custom dataDir when provided', () => {
      expect(system.dataDir).toBe('/fake/rewards');
      expect(system.profilesFile).toBe('/fake/rewards/profiles.json');
      expect(system.rewardsFile).toBe('/fake/rewards/rewards.json');
    });

    it('calls _ensureDataDir and _loadData', () => {
      expect(fs.existsSync).toHaveBeenCalledWith('/fake/rewards');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/rewards', { recursive: true });
    });

    it('has all point rules defined', () => {
      expect(system.pointRules.skillPublished).toBe(100);
      expect(system.pointRules.skillDownloaded).toBe(1);
      expect(system.pointRules.skillRated).toBe(5);
      expect(system.pointRules.skillFeatured).toBe(200);
      expect(system.pointRules.reviewWritten).toBe(10);
      expect(system.pointRules.bugReported).toBe(20);
      expect(system.pointRules.bugFixed).toBe(50);
      expect(system.pointRules.suggestionAccepted).toBe(30);
      expect(system.pointRules.majorVersionUpdate).toBe(50);
      expect(system.pointRules.minorVersionUpdate).toBe(20);
      expect(system.pointRules.patchVersionUpdate).toBe(5);
      expect(system.pointRules.securityScanPassed).toBe(30);
      expect(system.pointRules.highTrustScore).toBe(50);
      expect(system.pointRules.zeroBugs).toBe(20);
    });

    it('has all badges defined', () => {
      expect(Object.keys(system.badges)).toHaveLength(16);
    });
  });

  describe('_ensureDataDir', () => {
    it('creates directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      system._ensureDataDir();
      expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/rewards', { recursive: true });
    });

    it('does not create directory if exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      system._ensureDataDir();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_loadData', () => {
    it('loads profiles and rewards from files if they exist', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('profiles.json')) return JSON.stringify({ profiles: { u1: { userId: 'u1', points: 500 } } });
        if (p.includes('rewards.json')) return JSON.stringify({ rewards: [{ userId: 'u1', type: 'points', value: 100 }] });
        return '{}';
      });
      const s = new RewardSystem({ dataDir: '/fake/rewards' });
      expect(s.profiles.get('u1').points).toBe(500);
      expect(s.rewards).toHaveLength(1);
    });

    it('handles missing files gracefully', () => {
      fs.existsSync.mockReturnValue(false);
      const s = new RewardSystem({ dataDir: '/fake/rewards' });
      expect(s.profiles.size).toBe(0);
      expect(s.rewards).toEqual([]);
    });

    it('handles JSON parse error gracefully', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');
      const s = new RewardSystem({ dataDir: '/fake/rewards' });
      expect(s.profiles.size).toBe(0);
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('_saveData', () => {
    it('writes profiles and rewards to files', () => {
      fs.writeFileSync.mockImplementation(() => {});
      system.profiles.set('u1', { userId: 'u1', points: 100 });
      system.rewards.push({ userId: 'u1', value: 50 });
      system._saveData();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/fake/rewards/profiles.json',
        expect.stringContaining('u1')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/fake/rewards/rewards.json',
        expect.stringContaining('u1')
      );
    });

    it('handles write error gracefully', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('permission denied'); });
      system._saveData();
      expect(console.warn).toHaveBeenCalledWith('Failed to save reward data:', 'permission denied');
    });
  });

  describe('getOrCreateProfile', () => {
    it('creates a new profile with default values', () => {
      const profile = system.getOrCreateProfile('u1', 'testuser');
      expect(profile.userId).toBe('u1');
      expect(profile.username).toBe('testuser');
      expect(profile.points).toBe(0);
      expect(profile.level).toBe(1);
      expect(profile.badges).toEqual([]);
      expect(profile.stats.skillsPublished).toBe(0);
      expect(profile.stats.totalDownloads).toBe(0);
      expect(profile.createdAt).toBeDefined();
      expect(profile.updatedAt).toBeDefined();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('returns existing profile if already created', () => {
      system.getOrCreateProfile('u1', 'testuser');
      jest.clearAllMocks();
      const profile = system.getOrCreateProfile('u1', 'othername');
      expect(profile.username).toBe('testuser');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('addPoints', () => {
    it('adds points to user profile', () => {
      system.getOrCreateProfile('u1', 'testuser');
      jest.clearAllMocks();
      const result = system.addPoints('u1', 50, 'skill_published');
      expect(result.added).toBe(50);
      expect(result.points).toBe(50);
      expect(system.profiles.get('u1').points).toBe(50);
      expect(system.rewards).toHaveLength(1);
      expect(system.rewards[0].type).toBe('points');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('throws if user not found', () => {
      expect(() => system.addPoints('nonexistent', 10, 'test')).toThrow('User not found: nonexistent');
    });

    it('records points history', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.addPoints('u1', 30, 'bug_fixed', { bugId: 'b1' });
      const history = system.profiles.get('u1').history;
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('points');
      expect(history[0].points).toBe(30);
      expect(history[0].reason).toBe('bug_fixed');
      expect(history[0].metadata.bugId).toBe('b1');
    });

    it('trims history to last 50 when exceeding 100 entries', () => {
      system.getOrCreateProfile('u1', 'testuser');
      for (let i = 0; i < 101; i++) {
        system.addPoints('u1', 1, `event_${i}`);
      }
      expect(system.profiles.get('u1').history.length).toBe(50);
    });

    it('updates level based on total points', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.addPoints('u1', 600, 'bulk');
      expect(system.profiles.get('u1').level).toBe(4);
    });
  });

  describe('_calculateLevel', () => {
    it('returns level 1 for points < 100', () => {
      expect(system._calculateLevel(0)).toBe(1);
      expect(system._calculateLevel(99)).toBe(1);
    });

    it('returns level 2 for points 100-299', () => {
      expect(system._calculateLevel(100)).toBe(2);
      expect(system._calculateLevel(299)).toBe(2);
    });

    it('returns level 3 for points 300-599', () => {
      expect(system._calculateLevel(300)).toBe(3);
      expect(system._calculateLevel(599)).toBe(3);
    });

    it('returns level 4 for points 600-999', () => {
      expect(system._calculateLevel(600)).toBe(4);
    });

    it('returns level 5 for points 1000-1499', () => {
      expect(system._calculateLevel(1000)).toBe(5);
    });

    it('returns level 6 for points 1500-2499', () => {
      expect(system._calculateLevel(1500)).toBe(6);
    });

    it('returns level 7 for points 2500-3999', () => {
      expect(system._calculateLevel(2500)).toBe(7);
    });

    it('returns level 8 for points 4000-5999', () => {
      expect(system._calculateLevel(4000)).toBe(8);
    });

    it('returns level 9 for points 6000-9999', () => {
      expect(system._calculateLevel(6000)).toBe(9);
    });

    it('returns level 10 for points >= 10000', () => {
      expect(system._calculateLevel(10000)).toBe(10);
      expect(system._calculateLevel(99999)).toBe(10);
    });
  });

  describe('awardBadge', () => {
    it('awards badge to user', () => {
      system.getOrCreateProfile('u1', 'testuser');
      const result = system.awardBadge('u1', 'first_skill');
      expect(result.awarded).toBe(true);
      expect(result.badge.name).toBe('初出茅庐');
      expect(system.profiles.get('u1').badges).toHaveLength(1);
      expect(system.profiles.get('u1').badges[0].id).toBe('first_skill');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('throws if user not found', () => {
      expect(() => system.awardBadge('nonexistent', 'first_skill')).toThrow('User not found: nonexistent');
    });

    it('throws if badge not found', () => {
      system.getOrCreateProfile('u1', 'testuser');
      expect(() => system.awardBadge('u1', 'nonexistent_badge')).toThrow('Badge not found: nonexistent_badge');
    });

    it('does not award duplicate badge', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.awardBadge('u1', 'first_skill');
      const result = system.awardBadge('u1', 'first_skill');
      expect(result.awarded).toBe(false);
      expect(result.reason).toBe('Already拥有');
      expect(system.profiles.get('u1').badges).toHaveLength(1);
    });

    it('records badge in history and rewards', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.awardBadge('u1', 'first_skill');
      const history = system.profiles.get('u1').history;
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('badge');
      expect(history[0].badgeId).toBe('first_skill');
      expect(system.rewards).toHaveLength(1);
      expect(system.rewards[0].type).toBe('badge');
    });
  });

  describe('_hasBadge', () => {
    it('returns true if user has badge', () => {
      const profile = { badges: [{ id: 'first_skill' }] };
      expect(system._hasBadge(profile, 'first_skill')).toBe(true);
    });

    it('returns false if user does not have badge', () => {
      const profile = { badges: [] };
      expect(system._hasBadge(profile, 'first_skill')).toBe(false);
    });
  });

  describe('checkAndAwardBadges', () => {
    it('returns empty array for nonexistent user', () => {
      const result = system.checkAndAwardBadges('nonexistent');
      expect(result).toEqual([]);
    });

    it('awards first_skill badge when skillsPublished >= 1', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.profiles.get('u1').stats.skillsPublished = 1;
      const result = system.checkAndAwardBadges('u1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('初出茅庐');
    });

    it('awards multiple skill badges progressively', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.profiles.get('u1').stats.skillsPublished = 10;
      const result = system.checkAndAwardBadges('u1');
      expect(result).toHaveLength(3);
      const names = result.map((b) => b.name);
      expect(names).toContain('初出茅庐');
      expect(names).toContain('多产作者');
      expect(names).toContain('技能大师');
    });

    it('awards skill_25 badge when skillsPublished >= 25', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.profiles.get('u1').stats.skillsPublished = 25;
      const result = system.checkAndAwardBadges('u1');
      expect(result).toHaveLength(4);
    });

    it('awards download badges progressively', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.profiles.get('u1').stats.totalDownloads = 1000;
      const result = system.checkAndAwardBadges('u1');
      const names = result.map((b) => b.name);
      expect(names).toContain('小有名气');
      expect(names).toContain('广受欢迎');
    });

    it('does not award already held badges', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.profiles.get('u1').stats.skillsPublished = 5;
      system.awardBadge('u1', 'first_skill');
      jest.clearAllMocks();
      const result = system.checkAndAwardBadges('u1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('多产作者');
    });
  });

  describe('recordSkillPublished', () => {
    it('creates profile and increments skillsPublished stat', () => {
      system.recordSkillPublished('u1', 'testuser');
      expect(system.profiles.get('u1').stats.skillsPublished).toBe(1);
    });

    it('adds skillPublished points', () => {
      system.recordSkillPublished('u1', 'testuser');
      expect(system.profiles.get('u1').points).toBe(100);
    });

    it('checks and awards badges', () => {
      for (let i = 0; i < 5; i++) { system.recordSkillPublished('u1', 'testuser'); }
      expect(system.profiles.get('u1').badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('recordDownload', () => {
    it('adds points to downloader', () => {
      system.getOrCreateProfile('u1', 'downloader');
      system.recordDownload('u1', 'u2', 'author');
      expect(system.profiles.get('u1').points).toBe(1);
    });

    it('adds points and increments download stat for author', () => {
      system.getOrCreateProfile('u1', 'downloader');
      system.getOrCreateProfile('u2', 'author');
      jest.clearAllMocks();
      system.recordDownload('u1', 'u2', 'author');
      expect(system.profiles.get('u2').stats.totalDownloads).toBe(1);
      expect(system.profiles.get('u2').points).toBe(1);
    });

    it('skips author processing if skillAuthorId is falsy', () => {
      system.getOrCreateProfile('u1', 'downloader');
      jest.clearAllMocks();
      system.recordDownload('u1', null, null);
      expect(system.profiles.get('u1').points).toBe(1);
    });
  });

  describe('recordRating', () => {
    it('adds points to rater', () => {
      system.getOrCreateProfile('u1', 'rater');
      system.recordRating('u1', 'u2', 'author');
      expect(system.profiles.get('u1').points).toBe(5);
    });

    it('increments totalRatings for skill author', () => {
      system.getOrCreateProfile('u1', 'rater');
      system.getOrCreateProfile('u2', 'author');
      jest.clearAllMocks();
      system.recordRating('u1', 'u2', 'author');
      expect(system.profiles.get('u2').stats.totalRatings).toBe(1);
    });

    it('skips author processing if skillAuthorId is falsy', () => {
      system.getOrCreateProfile('u1', 'rater');
      jest.clearAllMocks();
      system.recordRating('u1', null, null);
      expect(system.profiles.get('u1').points).toBe(5);
    });
  });

  describe('getProfile', () => {
    it('returns profile for existing user', () => {
      system.getOrCreateProfile('u1', 'testuser');
      const profile = system.getProfile('u1');
      expect(profile).not.toBeNull();
      expect(profile.userId).toBe('u1');
    });

    it('returns null for nonexistent user', () => {
      expect(system.getProfile('nonexistent')).toBeNull();
    });
  });

  describe('getLeaderboard', () => {
    it('returns profiles sorted by points by default', () => {
      system.getOrCreateProfile('u1', 'user1');
      system.getOrCreateProfile('u2', 'user2');
      system.profiles.get('u1').points = 200;
      system.profiles.get('u2').points = 100;
      const board = system.getLeaderboard();
      expect(board).toHaveLength(2);
      expect(board[0].userId).toBe('u1');
      expect(board[1].userId).toBe('u2');
    });

    it('sorts by skills when sortBy=skills', () => {
      system.getOrCreateProfile('u1', 'user1');
      system.getOrCreateProfile('u2', 'user2');
      system.profiles.get('u1').stats.skillsPublished = 5;
      system.profiles.get('u2').stats.skillsPublished = 10;
      const board = system.getLeaderboard({ sortBy: 'skills' });
      expect(board[0].userId).toBe('u2');
    });

    it('sorts by downloads when sortBy=downloads', () => {
      system.getOrCreateProfile('u1', 'user1');
      system.getOrCreateProfile('u2', 'user2');
      system.profiles.get('u1').stats.totalDownloads = 100;
      system.profiles.get('u2').stats.totalDownloads = 50;
      const board = system.getLeaderboard({ sortBy: 'downloads' });
      expect(board[0].userId).toBe('u1');
    });

    it('respects limit option', () => {
      for (let i = 1; i <= 5; i++) {
        system.getOrCreateProfile(`u${i}`, `user${i}`);
        system.profiles.get(`u${i}`).points = i * 10;
      }
      const board = system.getLeaderboard({ limit: 3 });
      expect(board).toHaveLength(3);
    });

    it('includes rank, username, level, badges count, and skills count', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.addPoints('u1', 100, 'test');
      system.profiles.get('u1').badges = [{ id: 'b1' }];
      const board = system.getLeaderboard();
      expect(board[0]).toEqual({
        rank: 1,
        userId: 'u1',
        username: 'testuser',
        points: 100,
        level: 2,
        badges: 1,
        skills: 0
      });
    });
  });

  describe('getBadges', () => {
    it('returns all badges with id included', () => {
      const badges = system.getBadges();
      expect(badges).toHaveLength(16);
      expect(badges[0]).toHaveProperty('id');
      expect(badges[0]).toHaveProperty('name');
      expect(badges[0]).toHaveProperty('description');
      expect(badges[0]).toHaveProperty('icon');
      expect(badges[0]).toHaveProperty('tier');
    });

    it('includes first_skill badge', () => {
      const badges = system.getBadges();
      const first = badges.find((b) => b.id === 'first_skill');
      expect(first.name).toBe('初出茅庐');
      expect(first.tier).toBe('bronze');
    });
  });

  describe('getStats', () => {
    it('returns correct stats for empty system', () => {
      const stats = system.getStats();
      expect(stats.totalUsers).toBe(0);
      expect(stats.totalPointsAwarded).toBe(0);
      expect(stats.totalBadgesAwarded).toBe(0);
      expect(stats.topUsers).toEqual([]);
      expect(stats.recentRewards).toEqual([]);
    });

    it('returns correct stats with data', () => {
      system.getOrCreateProfile('u1', 'testuser');
      system.rewards.push({ userId: 'u1', type: 'points', value: 100, timestamp: '2026-01-01' });
      system.rewards.push({ userId: 'u1', type: 'badge', badgeId: 'first_skill', timestamp: '2026-01-02' });
      const stats = system.getStats();
      expect(stats.totalUsers).toBe(1);
      expect(stats.totalPointsAwarded).toBe(1);
      expect(stats.totalBadgesAwarded).toBe(1);
      expect(stats.topUsers).toHaveLength(1);
      expect(stats.recentRewards).toHaveLength(2);
    });
  });

  describe('getLevelInfo', () => {
    it('returns correct info for level 1', () => {
      const info = system.getLevelInfo(1);
      expect(info.title).toBe('新手');
      expect(info.minPoints).toBe(0);
    });

    it('returns correct info for level 10', () => {
      const info = system.getLevelInfo(10);
      expect(info.title).toBe('至高');
      expect(info.minPoints).toBe(10000);
    });

    it('returns level 1 info for invalid level', () => {
      const info = system.getLevelInfo(999);
      expect(info.title).toBe('新手');
    });
  });
});
