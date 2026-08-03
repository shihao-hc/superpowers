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
const { PrivateMarketplace } = require('../../src/skills/enterprise/PrivateMarketplace');

describe('PrivateMarketplace', () => {
  let marketplace;
  const NOW = '2026-07-30T12:00:00.000Z';

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(NOW);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    marketplace = new PrivateMarketplace({ dataDir: '/fake/private-marketplace' });
  });

  describe('constructor', () => {
    it('should initialize with default dataDir when not provided', () => {
      const m = new PrivateMarketplace();
      expect(m.skills).toBeInstanceOf(Map);
      expect(m.teams).toBeInstanceOf(Map);
      expect(m.config).toBeDefined();
      expect(m.config.storageQuota).toBe(1073741824);
      expect(m.config.maxSkillSize).toBe(52428800);
      expect(m.config.enableApproval).toBe(true);
    });

    it('should use custom dataDir when provided', () => {
      expect(marketplace.dataDir).toBe('/fake/private-marketplace');
      expect(marketplace.configFile).toBe('/fake/private-marketplace/config.json');
      expect(marketplace.skillsFile).toBe('/fake/private-marketplace/skills.json');
      expect(marketplace.teamsFile).toBe('/fake/private-marketplace/teams.json');
    });

    it('should create data directory if not exists', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/private-marketplace', { recursive: true });
    });

    it('should not create data directory if exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      marketplace = new PrivateMarketplace({ dataDir: '/fake/existing' });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_ensureDataDir', () => {
    it('should create directory when it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      marketplace._ensureDataDir();
      expect(fs.mkdirSync).toHaveBeenCalledWith('/fake/private-marketplace', { recursive: true });
    });

    it('should skip creation when directory exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      marketplace._ensureDataDir();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_calculateStorageUsage', () => {
    it('should sum sizes of existing data files', () => {
      const statMock = jest.fn()
        .mockReturnValueOnce({ isFile: () => true, size: 100 })
        .mockReturnValueOnce({ isFile: () => true, size: 200 })
        .mockReturnValueOnce({ isFile: () => true, size: 300 });
      fs.existsSync.mockReturnValue(true);
      fs.statSync = statMock;
      const usage = marketplace._calculateStorageUsage();
      expect(usage).toBe(600);
    });

    it('should skip non-existent files', () => {
      fs.existsSync.mockReturnValue(false);
      const usage = marketplace._calculateStorageUsage();
      expect(usage).toBe(0);
    });

    it('should handle stat errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync = jest.fn(() => { throw new Error('EPERM'); });
      expect(() => marketplace._calculateStorageUsage()).not.toThrow();
      expect(marketplace._calculateStorageUsage()).toBe(0);
    });
  });

  describe('_loadData', () => {
    it('should load config from file if exists', () => {
      const configData = { organization: 'Acme Corp', enableApproval: false };
      fs.existsSync.mockImplementation((p) => p.includes('config.json'));
      fs.readFileSync.mockReturnValue(JSON.stringify(configData));
      marketplace._loadData();
      expect(marketplace.config.organization).toBe('Acme Corp');
      expect(marketplace.config.enableApproval).toBe(false);
    });

    it('should load skills from file if exists', () => {
      const skillsData = { skills: { s1: { id: 's1', name: 'InternalTool' } } };
      fs.existsSync.mockImplementation((p) => p.includes('skills.json'));
      fs.readFileSync.mockReturnValue(JSON.stringify(skillsData));
      marketplace._loadData();
      expect(marketplace.skills.get('s1').name).toBe('InternalTool');
    });

    it('should load teams from file if exists', () => {
      const teamsData = { teams: { eng: { id: 'eng', name: 'Engineering' } } };
      fs.existsSync.mockImplementation((p) => p.includes('teams.json'));
      fs.readFileSync.mockReturnValue(JSON.stringify(teamsData));
      marketplace._loadData();
      expect(marketplace.teams.get('eng').name).toBe('Engineering');
    });

    it('should handle missing all files gracefully', () => {
      fs.existsSync.mockReturnValue(false);
      marketplace._loadData();
      expect(marketplace.skills.size).toBe(0);
      expect(marketplace.teams.size).toBe(0);
    });

    it('should handle JSON parse errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');
      marketplace._loadData();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should handle read errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('Permission denied'); });
      marketplace._loadData();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('_saveData', () => {
    it('should write config, skills, and teams files', () => {
      marketplace._saveData();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(3);
      const calls = fs.writeFileSync.mock.calls;
      expect(calls[0][0]).toBe('/fake/private-marketplace/config.json');
      expect(calls[1][0]).toBe('/fake/private-marketplace/skills.json');
      expect(calls[2][0]).toBe('/fake/private-marketplace/teams.json');
    });

    it('should include skills data in skills file', () => {
      marketplace.skills.set('s1', { id: 's1', name: 'Alpha' });
      marketplace._saveData();
      const jsonArg = fs.writeFileSync.mock.calls[1][1];
      const parsed = JSON.parse(jsonArg);
      expect(parsed.skills.s1.name).toBe('Alpha');
      expect(parsed.lastUpdated).toBe(NOW);
    });

    it('should include teams data in teams file', () => {
      marketplace.teams.set('eng', { id: 'eng', name: 'Engineering' });
      marketplace._saveData();
      const jsonArg = fs.writeFileSync.mock.calls[2][1];
      const parsed = JSON.parse(jsonArg);
      expect(parsed.teams.eng.name).toBe('Engineering');
      expect(parsed.lastUpdated).toBe(NOW);
    });

    it('should handle write failures gracefully', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('Disk full'); });
      expect(() => marketplace._saveData()).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('configure', () => {
    it('should merge provided config with defaults', () => {
      const result = marketplace.configure({ organization: 'Acme', enableApproval: false });
      expect(result.organization).toBe('Acme');
      expect(result.enableApproval).toBe(false);
      expect(result.storageQuota).toBe(1073741824);
    });

    it('should persist config via _saveData', () => {
      marketplace.configure({ organization: 'Acme' });
      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.organization).toBe('Acme');
    });

    it('should overwrite existing config values', () => {
      marketplace.configure({ maxSkillSize: 1048576 });
      expect(marketplace.config.maxSkillSize).toBe(1048576);
      marketplace.configure({ maxSkillSize: 2097152 });
      expect(marketplace.config.maxSkillSize).toBe(2097152);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the config', () => {
      const config = marketplace.getConfig();
      expect(config.organization).toBe('');
      expect(config.enableApproval).toBe(true);
    });

    it('should not allow mutation of internal config', () => {
      const config = marketplace.getConfig();
      config.organization = 'Hacked';
      expect(marketplace.config.organization).toBe('');
    });
  });

  describe('createTeam', () => {
    it('should create a team with required fields', () => {
      const team = marketplace.createTeam({ name: 'Engineering' });
      expect(team.id).toBe('engineering');
      expect(team.name).toBe('Engineering');
      expect(team.description).toBe('');
      expect(team.members).toEqual([]);
      expect(team.admins).toEqual([]);
      expect(team.isPrivate).toBe(true);
      expect(team.skillCount).toBe(0);
      expect(team.createdAt).toBe(NOW);
      expect(team.updatedAt).toBe(NOW);
    });

    it('should accept optional fields', () => {
      const team = marketplace.createTeam({
        name: 'Data Science',
        description: 'Data team',
        members: [{ userId: 'alice', role: 'member' }],
        admins: ['bob'],
        isPrivate: false
      });
      expect(team.description).toBe('Data team');
      expect(team.members).toEqual([{ userId: 'alice', role: 'member' }]);
      expect(team.admins).toEqual(['bob']);
      expect(team.isPrivate).toBe(false);
    });

    it('should throw if name is missing', () => {
      expect(() => marketplace.createTeam({})).toThrow('Team name is required');
    });

    it('should throw if team name is empty', () => {
      expect(() => marketplace.createTeam({ name: '' })).toThrow('Team name is required');
    });

    it('should throw if team already exists', () => {
      marketplace.createTeam({ name: 'Engineering' });
      expect(() => marketplace.createTeam({ name: 'Engineering' })).toThrow('Team already exists: engineering');
    });

    it('should normalize team ID (lowercase, no special chars)', () => {
      const team = marketplace.createTeam({ name: 'ML/AI Team!' });
      expect(team.id).toBe('ml-ai-team-');
    });

    it('should save data after creation', () => {
      fs.writeFileSync.mockClear();
      marketplace.createTeam({ name: 'DevOps' });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('updateTeam', () => {
    beforeEach(() => {
      marketplace.createTeam({ name: 'Engineering', description: 'Old desc' });
    });

    it('should update team fields', () => {
      const updated = marketplace.updateTeam('engineering', { description: 'New desc' });
      expect(updated.description).toBe('New desc');
      expect(updated.updatedAt).toBe(NOW);
    });

    it('should preserve team ID', () => {
      const updated = marketplace.updateTeam('engineering', { id: 'hacked', name: 'Hacked' });
      expect(updated.id).toBe('engineering');
      expect(updated.name).toBe('Hacked');
    });

    it('should throw for non-existent team', () => {
      expect(() => marketplace.updateTeam('nonexistent', {})).toThrow('Team not found: nonexistent');
    });

    it('should save data after update', () => {
      fs.writeFileSync.mockClear();
      marketplace.updateTeam('engineering', { description: 'Updated' });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('deleteTeam', () => {
    beforeEach(() => {
      marketplace.createTeam({ name: 'Engineering' });
    });

    it('should delete an empty team', () => {
      const result = marketplace.deleteTeam('engineering');
      expect(result.deleted).toBe(true);
      expect(marketplace.teams.has('engineering')).toBe(false);
    });

    it('should throw for non-existent team', () => {
      expect(() => marketplace.deleteTeam('nonexistent')).toThrow('Team not found: nonexistent');
    });

    it('should throw if team has skills', () => {
      marketplace.skills.set('s1', { id: 's1', name: 'Tool', teamId: 'engineering' });
      expect(() => marketplace.deleteTeam('engineering')).toThrow('Cannot delete team with existing skills');
    });

    it('should save data after deletion', () => {
      fs.writeFileSync.mockClear();
      marketplace.deleteTeam('engineering');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('addTeamMember', () => {
    beforeEach(() => {
      marketplace.createTeam({ name: 'Engineering' });
    });

    it('should add a new member with default role', () => {
      const team = marketplace.addTeamMember('engineering', 'alice');
      expect(team.members).toHaveLength(1);
      expect(team.members[0].userId).toBe('alice');
      expect(team.members[0].role).toBe('member');
      expect(team.members[0].joinedAt).toBe(NOW);
    });

    it('should add a new member with custom role', () => {
      const team = marketplace.addTeamMember('engineering', 'bob', 'admin');
      expect(team.members[0].role).toBe('admin');
    });

    it('should update role of existing member', () => {
      marketplace.addTeamMember('engineering', 'alice', 'member');
      const team = marketplace.addTeamMember('engineering', 'alice', 'admin');
      expect(team.members).toHaveLength(1);
      expect(team.members[0].role).toBe('admin');
    });

    it('should throw for non-existent team', () => {
      expect(() => marketplace.addTeamMember('none', 'alice')).toThrow('Team not found: none');
    });

    it('should update team updatedAt', () => {
      const team = marketplace.addTeamMember('engineering', 'alice');
      expect(team.updatedAt).toBe(NOW);
    });

    it('should save data after adding member', () => {
      fs.writeFileSync.mockClear();
      marketplace.addTeamMember('engineering', 'alice');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('removeTeamMember', () => {
    beforeEach(() => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.addTeamMember('engineering', 'alice');
      marketplace.addTeamMember('engineering', 'bob');
    });

    it('should remove an existing member', () => {
      const team = marketplace.removeTeamMember('engineering', 'alice');
      expect(team.members).toHaveLength(1);
      expect(team.members[0].userId).toBe('bob');
    });

    it('should do nothing if user is not a member', () => {
      const team = marketplace.removeTeamMember('engineering', 'carol');
      expect(team.members).toHaveLength(2);
    });

    it('should throw for non-existent team', () => {
      expect(() => marketplace.removeTeamMember('none', 'alice')).toThrow('Team not found: none');
    });

    it('should update team updatedAt', () => {
      const team = marketplace.removeTeamMember('engineering', 'alice');
      expect(team.updatedAt).toBe(NOW);
    });

    it('should save data after removing member', () => {
      fs.writeFileSync.mockClear();
      marketplace.removeTeamMember('engineering', 'alice');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('uploadSkill', () => {
    beforeEach(() => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.addTeamMember('engineering', 'alice', 'developer');
    });

    it('should upload a skill with required fields', async () => {
      const skill = await marketplace.uploadSkill(
        { name: 'MyTool', description: 'A tool', version: '1.0.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      expect(skill.name).toBe('MyTool');
      expect(skill.description).toBe('A tool');
      expect(skill.version).toBe('1.0.0');
      expect(skill.author).toBe('alice');
      expect(skill.teamId).toBe('engineering');
      expect(skill.category).toBe('general');
      expect(skill.visibility).toBe('team');
      expect(skill.status).toBe('pending');
      expect(skill.downloads).toBe(0);
      expect(skill.rating).toBe(0);
      expect(skill.ratingCount).toBe(0);
      expect(skill.securityScanStatus).toBe('pending');
      expect(skill.documentationStatus).toBe('pending');
      expect(skill.createdAt).toBe(NOW);
      expect(skill.updatedAt).toBe(NOW);
    });

    it('should auto-approve when requiresApproval is false', async () => {
      const skill = await marketplace.uploadSkill(
        { name: 'QuickTool', description: 'Fast', version: '1.0', author: 'bob', teamId: 'engineering', requiresApproval: false },
        { userId: 'alice', userRole: 'developer' }
      );
      expect(skill.status).toBe('approved');
    });

    it('should set documentationStatus to complete when requireDocumentation is false', async () => {
      marketplace.configure({ requireDocumentation: false });
      const skill = await marketplace.uploadSkill(
        { name: 'NoDoc', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      expect(skill.documentationStatus).toBe('complete');
    });

    it('should throw if user has insufficient permissions', async () => {
      marketplace.addTeamMember('engineering', 'eve', 'viewer');
      await expect(marketplace.uploadSkill(
        { name: 'Hack', description: 'x', version: '1.0', author: 'eve', teamId: 'engineering' },
        { userId: 'eve', userRole: 'viewer' }
      )).rejects.toThrow('Insufficient permissions to upload skills');
    });

    it('should throw if team does not exist', async () => {
      await expect(marketplace.uploadSkill(
        { name: 'Orphan', description: 'x', version: '1.0', author: 'admin', teamId: 'ghost-team' },
        { userId: 'admin', userRole: 'admin' }
      )).rejects.toThrow('Team not found: ghost-team');
    });

    it('should increment team skillCount', async () => {
      await marketplace.uploadSkill(
        { name: 'Tool1', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      const team = marketplace.teams.get('engineering');
      expect(team.skillCount).toBe(1);
    });

    it('should generate unique skill IDs', async () => {
      const s1 = await marketplace.uploadSkill(
        { name: 'Tool', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      const s2 = await marketplace.uploadSkill(
        { name: 'Tool', description: 'x', version: '1.0', author: 'bob', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      expect(s1.id).not.toBe(s2.id);
    });

    it('should save data after upload', async () => {
      fs.writeFileSync.mockClear();
      await marketplace.uploadSkill(
        { name: 'SaveTest', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should allow admin upload without team membership', async () => {
      const skill = await marketplace.uploadSkill(
        { name: 'AdminTool', description: 'x', version: '1.0', author: 'admin' },
        { userId: 'admin', userRole: 'admin' }
      );
      expect(skill.name).toBe('AdminTool');
    });
  });

  describe('approveSkill', () => {
    beforeEach(async () => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.addTeamMember('engineering', 'alice', 'developer');
      await marketplace.uploadSkill(
        { name: 'Tool', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
    });

    it('should set skill status to approved', () => {
      const skill = marketplace.approveSkill([...marketplace.skills.keys()][0], 'reviewer');
      expect(skill.status).toBe('approved');
      expect(skill.approvedBy).toBe('reviewer');
      expect(skill.approvedAt).toBe(NOW);
    });

    it('should store approval notes', () => {
      const skillId = [...marketplace.skills.keys()][0];
      const skill = marketplace.approveSkill(skillId, 'reviewer', 'Looks good');
      expect(skill.approvalNotes).toBe('Looks good');
    });

    it('should throw for non-existent skill', () => {
      expect(() => marketplace.approveSkill('nonexistent', 'reviewer')).toThrow('Skill not found: nonexistent');
    });

    it('should update updatedAt timestamp', () => {
      const skillId = [...marketplace.skills.keys()][0];
      const skill = marketplace.approveSkill(skillId, 'reviewer');
      expect(skill.updatedAt).toBe(NOW);
    });

    it('should save data after approval', () => {
      fs.writeFileSync.mockClear();
      marketplace.approveSkill([...marketplace.skills.keys()][0], 'reviewer');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('rejectSkill', () => {
    beforeEach(async () => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.addTeamMember('engineering', 'alice', 'developer');
      await marketplace.uploadSkill(
        { name: 'Tool', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
    });

    it('should set skill status to rejected', () => {
      const skillId = [...marketplace.skills.keys()][0];
      const skill = marketplace.rejectSkill(skillId, 'reviewer', 'Incomplete');
      expect(skill.status).toBe('rejected');
      expect(skill.rejectedBy).toBe('reviewer');
      expect(skill.rejectedAt).toBe(NOW);
      expect(skill.rejectionReason).toBe('Incomplete');
    });

    it('should accept empty reason', () => {
      const skillId = [...marketplace.skills.keys()][0];
      const skill = marketplace.rejectSkill(skillId, 'reviewer');
      expect(skill.rejectionReason).toBe('');
    });

    it('should throw for non-existent skill', () => {
      expect(() => marketplace.rejectSkill('nonexistent', 'reviewer')).toThrow('Skill not found: nonexistent');
    });

    it('should update updatedAt', () => {
      const skillId = [...marketplace.skills.keys()][0];
      const skill = marketplace.rejectSkill(skillId, 'reviewer');
      expect(skill.updatedAt).toBe(NOW);
    });

    it('should save data after rejection', () => {
      fs.writeFileSync.mockClear();
      marketplace.rejectSkill([...marketplace.skills.keys()][0], 'reviewer');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getSkill', () => {
    let skillId;

    beforeEach(async () => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.addTeamMember('engineering', 'alice', 'developer');
      const skill = await marketplace.uploadSkill(
        { name: 'Internal', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      skillId = skill.id;
    });

    it('should return skill by ID', () => {
      const result = marketplace.getSkill(skillId);
      expect(result.name).toBe('Internal');
    });

    it('should return null for non-existent skill', () => {
      expect(marketplace.getSkill('nonexistent')).toBeNull();
    });

    it('should allow team member to see team-visible skill', () => {
      const result = marketplace.getSkill(skillId, 'alice');
      expect(result).not.toBeNull();
      expect(result.name).toBe('Internal');
    });

    it('should return null for non-member accessing team-visible skill', () => {
      const result = marketplace.getSkill(skillId, 'eve');
      expect(result).toBeNull();
    });

    it('should return skill when no userId provided even if team-visible', () => {
      const result = marketplace.getSkill(skillId);
      expect(result).not.toBeNull();
    });

    it('should allow organization-visible skill for any user', async () => {
      const skill2 = await marketplace.uploadSkill(
        { name: 'OrgTool', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering', visibility: 'organization' },
        { userId: 'alice', userRole: 'developer' }
      );
      const result = marketplace.getSkill(skill2.id, 'eve');
      expect(result).not.toBeNull();
    });
  });

  describe('listSkills', () => {
    beforeEach(async () => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.createTeam({ name: 'Data Science' });
      marketplace.addTeamMember('engineering', 'alice', 'developer');
      marketplace.addTeamMember('data-science', 'bob', 'developer');

      const s1 = await marketplace.uploadSkill(
        { name: 'LogParser', description: 'Parse logs', author: 'alice', teamId: 'engineering', category: 'utilities', tags: ['log', 'parse'] },
        { userId: 'alice', userRole: 'developer' }
      );
      marketplace.approveSkill(s1.id, 'reviewer');

      const s2 = await marketplace.uploadSkill(
        { name: 'MLPredict', description: 'ML prediction', author: 'bob', teamId: 'data-science', category: 'ml', tags: ['ml'] },
        { userId: 'bob', userRole: 'developer' }
      );
      marketplace.approveSkill(s2.id, 'reviewer');

      const _s3 = await marketplace.uploadSkill(
        { name: 'PendingTool', description: 'Pending approval', author: 'alice', teamId: 'engineering', category: 'utilities' },
        { userId: 'alice', userRole: 'developer' }
      );

      const s4 = await marketplace.uploadSkill(
        { name: 'RejectedTool', description: 'Rejected', author: 'alice', teamId: 'engineering', category: 'utilities' },
        { userId: 'alice', userRole: 'developer' }
      );
      marketplace.rejectSkill(s4.id, 'reviewer');
    });

    it('should return approved skills by default', () => {
      const result = marketplace.listSkills();
      expect(result.skills).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by status', () => {
      const result = marketplace.listSkills({ status: 'pending' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('PendingTool');
    });

    it('should filter by teamId', () => {
      const result = marketplace.listSkills({ teamId: 'engineering' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('LogParser');
    });

    it('should filter by category', () => {
      const result = marketplace.listSkills({ category: 'ml' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('MLPredict');
    });

    it('should search by name', () => {
      const result = marketplace.listSkills({ search: 'log' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('LogParser');
    });

    it('should search by description', () => {
      const result = marketplace.listSkills({ search: 'prediction' });
      expect(result.skills).toHaveLength(1);
    });

    it('should search case-insensitively', () => {
      const result = marketplace.listSkills({ search: 'LOGPARSER' });
      expect(result.skills).toHaveLength(1);
    });

    it('should return empty for no match', () => {
      const result = marketplace.listSkills({ search: 'zzzzz' });
      expect(result.skills).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should filter by tags', () => {
      const result = marketplace.listSkills({ tags: ['ml'] });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('MLPredict');
    });

    it('should match any of multiple tags', () => {
      const result = marketplace.listSkills({ tags: ['log', 'ml'] });
      expect(result.skills).toHaveLength(2);
    });

    it('should filter by visibility', () => {
      const result = marketplace.listSkills({ visibility: 'organization' });
      expect(result.skills).toHaveLength(0);
    });

    it('should filter by userId to enforce team access', () => {
      const result = marketplace.listSkills({ userId: 'alice' });
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('LogParser');
    });

    it('should exclude team skills from non-member userId', () => {
      const result = marketplace.listSkills({ userId: 'eve' });
      expect(result.skills).toHaveLength(0);
    });

    it('should sort by updatedAt descending', () => {
      const result = marketplace.listSkills();
      for (let i = 1; i < result.skills.length; i++) {
        expect(new Date(result.skills[i].updatedAt).getTime())
          .toBeLessThanOrEqual(new Date(result.skills[i - 1].updatedAt).getTime());
      }
    });

    it('should paginate results', () => {
      const result = marketplace.listSkills({ limit: 1, offset: 0 });
      expect(result.skills).toHaveLength(1);
      expect(result.total).toBe(2);
    });

    it('should handle offset beyond total', () => {
      const result = marketplace.listSkills({ limit: 10, offset: 100 });
      expect(result.skills).toHaveLength(0);
      expect(result.total).toBe(2);
    });
  });

  describe('recordDownload', () => {
    beforeEach(async () => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.addTeamMember('engineering', 'alice', 'developer');
      const skill = await marketplace.uploadSkill(
        { name: 'Downloadable', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      marketplace.skillId = skill.id;
    });

    it('should throw for non-existent skill', () => {
      expect(() => marketplace.recordDownload('none')).toThrow('Skill not found: none');
    });

    it('should increment download count', () => {
      marketplace.recordDownload(marketplace.skillId);
      marketplace.recordDownload(marketplace.skillId);
      const skill = marketplace.skills.get(marketplace.skillId);
      expect(skill.downloads).toBe(2);
    });

    it('should return updated download count', () => {
      const result = marketplace.recordDownload(marketplace.skillId);
      expect(result).toEqual({ downloads: 1 });
    });

    it('should save data after recording download', () => {
      fs.writeFileSync.mockClear();
      marketplace.recordDownload(marketplace.skillId);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('_canUpload', () => {
    beforeEach(() => {
      marketplace.createTeam({ name: 'Engineering' });
    });

    it('should allow admin to upload anywhere', () => {
      expect(marketplace._canUpload('admin', 'admin', null)).toBe(true);
    });

    it('should allow team developer to upload to their team', () => {
      marketplace.addTeamMember('engineering', 'dev1', 'developer');
      expect(marketplace._canUpload('dev1', 'developer', 'engineering')).toBe(true);
    });

    it('should allow team admin to upload to their team', () => {
      marketplace.addTeamMember('engineering', 'admin1', 'admin');
      expect(marketplace._canUpload('admin1', 'admin', 'engineering')).toBe(true);
    });

    it('should deny viewer from uploading', () => {
      marketplace.addTeamMember('engineering', 'viewer1', 'viewer');
      expect(marketplace._canUpload('viewer1', 'viewer', 'engineering')).toBe(false);
    });

    it('should deny non-member from uploading to team', () => {
      expect(marketplace._canUpload('outsider', 'member', 'engineering')).toBe(false);
    });

    it('should deny user not in allowedUploaders when list is non-empty', () => {
      marketplace.configure({ allowedUploaders: ['trusted-user'] });
      expect(marketplace._canUpload('other-user', 'member', null)).toBe(false);
    });

    it('should allow user in allowedUploaders list', () => {
      marketplace.configure({ allowedUploaders: ['trusted-user'] });
      expect(marketplace._canUpload('trusted-user', 'member', null)).toBe(true);
    });

    it('should return true for any user when allowedUploaders is empty and no team', () => {
      expect(marketplace._canUpload('anyone', 'member', null)).toBe(true);
    });

    it('should return false if team does not exist', () => {
      expect(marketplace._canUpload('user', 'developer', 'nonexistent')).toBe(false);
    });
  });

  describe('_generateSkillId', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should produce ID with private prefix and author-name', () => {
      jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('aabbccdd', 'hex'));
      const id = marketplace._generateSkillId('Test Skill', 'Author Name');
      expect(id).toBe('private-author-name-test-skill-aabbccdd');
    });

    it('should handle special characters', () => {
      jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('12345678', 'hex'));
      const id = marketplace._generateSkillId('Hello@World!', 'Dev');
      expect(id).toBe('private-dev-hello-world--12345678');
    });

    it('should produce different IDs with different random bytes', () => {
      const id1 = marketplace._generateSkillId('Skill', 'A');
      const id2 = marketplace._generateSkillId('Skill', 'A');
      expect(id1).not.toBe(id2);
    });
  });

  describe('getPendingSkills', () => {
    beforeEach(async () => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.addTeamMember('engineering', 'alice', 'developer');
      await marketplace.uploadSkill(
        { name: 'Alpha', description: 'first', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      await marketplace.uploadSkill(
        { name: 'Beta', description: 'second', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
    });

    it('should return all pending skills sorted by createdAt ascending', () => {
      const pending = marketplace.getPendingSkills();
      expect(pending).toHaveLength(2);
      expect(pending[0].name).toBe('Alpha');
      expect(pending[1].name).toBe('Beta');
    });

    it('should respect limit', () => {
      const pending = marketplace.getPendingSkills(1);
      expect(pending).toHaveLength(1);
      expect(pending[0].name).toBe('Alpha');
    });

    it('should return empty array when no pending skills', () => {
      const skillIds = [...marketplace.skills.keys()];
      skillIds.forEach((id) => marketplace.approveSkill(id, 'reviewer'));
      const pending = marketplace.getPendingSkills();
      expect(pending).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.addTeamMember('engineering', 'alice', 'developer');
      const s1 = await marketplace.uploadSkill(
        { name: 'Tool1', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      marketplace.approveSkill(s1.id, 'reviewer');
      marketplace.recordDownload(s1.id);
      marketplace.recordDownload(s1.id);

      const _s2 = await marketplace.uploadSkill(
        { name: 'PendingX', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );

      const s3 = await marketplace.uploadSkill(
        { name: 'RejectedX', description: 'x', version: '1.0', author: 'alice', teamId: 'engineering' },
        { userId: 'alice', userRole: 'developer' }
      );
      marketplace.rejectSkill(s3.id, 'reviewer');
    });

    it('should return aggregate stats', () => {
      const stats = marketplace.getStats();
      expect(stats.totalSkills).toBe(3);
      expect(stats.approvedSkills).toBe(1);
      expect(stats.pendingSkills).toBe(1);
      expect(stats.rejectedSkills).toBe(1);
      expect(stats.totalTeams).toBe(1);
      expect(stats.totalDownloads).toBe(2);
      expect(stats.storageUsed).toBe(0);
      expect(stats.storageQuota).toBe(1073741824);
    });

    it('should return zeros for empty marketplace', () => {
      const empty = new PrivateMarketplace({ dataDir: '/fake/empty' });
      const stats = empty.getStats();
      expect(stats.totalSkills).toBe(0);
      expect(stats.approvedSkills).toBe(0);
      expect(stats.pendingSkills).toBe(0);
      expect(stats.rejectedSkills).toBe(0);
      expect(stats.totalTeams).toBe(0);
      expect(stats.totalDownloads).toBe(0);
    });
  });

  describe('listTeams', () => {
    it('should return all teams', () => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.createTeam({ name: 'Data Science' });
      const teams = marketplace.listTeams();
      expect(teams).toHaveLength(2);
      expect(teams.map((t) => t.name)).toContain('Engineering');
      expect(teams.map((t) => t.name)).toContain('Data Science');
    });

    it('should return empty array when no teams', () => {
      expect(marketplace.listTeams()).toEqual([]);
    });
  });

  describe('getTeam', () => {
    it('should return team by ID', () => {
      marketplace.createTeam({ name: 'Engineering' });
      const team = marketplace.getTeam('engineering');
      expect(team.name).toBe('Engineering');
    });

    it('should return null for non-existent team', () => {
      expect(marketplace.getTeam('nonexistent')).toBeNull();
    });
  });

  describe('error resilience', () => {
    it('should not crash when _loadData encounters corrupt files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('Corrupt file'); });
      expect(() => new PrivateMarketplace({ dataDir: '/fake/corrupt' })).not.toThrow();
    });

    it('should not crash when _saveData encounters write failures', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('Permission denied'); });
      marketplace.skills.set('s1', { id: 's1', name: 'Resilient' });
      expect(() => marketplace._saveData()).not.toThrow();
    });

    it('should handle concurrent team operations without crash', () => {
      marketplace.createTeam({ name: 'Engineering' });
      marketplace.addTeamMember('engineering', 'alice', 'developer');
      marketplace.addTeamMember('engineering', 'bob', 'viewer');
      marketplace.removeTeamMember('engineering', 'bob');
      const team = marketplace.getTeam('engineering');
      expect(team.members).toHaveLength(1);
      expect(team.members[0].userId).toBe('alice');
    });
  });
});
