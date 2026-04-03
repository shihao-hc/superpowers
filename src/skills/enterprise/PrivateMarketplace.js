/**
 * Private Marketplace System
 * 支持企业内部技能市场，供团队共享私有技能
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PrivateMarketplace {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'private-marketplace');
    this.configFile = path.join(this.dataDir, 'config.json');
    this.skillsFile = path.join(this.dataDir, 'skills.json');
    this.teamsFile = path.join(this.dataDir, 'teams.json');
    
    this.config = {
      organization: '',
      enableApproval: true,
      allowedUploaders: [],
      allowedTeams: [],
      storageQuota: 1024 * 1024 * 1024, // 1GB
      maxSkillSize: 50 * 1024 * 1024, // 50MB
      allowedFileTypes: ['.js', '.py', '.sh', '.md', '.json', '.yaml', '.yml'],
      requireSecurityScan: true,
      requireDocumentation: true
    };
    
    this.skills = new Map();
    this.teams = new Map();
    
    this._ensureDataDir();
    this._loadData();
  }

  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadData() {
    try {
      if (fs.existsSync(this.configFile)) {
        const configData = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        this.config = { ...this.config, ...configData };
      }
      
      if (fs.existsSync(this.skillsFile)) {
        const skillsData = JSON.parse(fs.readFileSync(this.skillsFile, 'utf8'));
        this.skills = new Map(Object.entries(skillsData.skills || {}));
      }
      
      if (fs.existsSync(this.teamsFile)) {
        const teamsData = JSON.parse(fs.readFileSync(this.teamsFile, 'utf8'));
        this.teams = new Map(Object.entries(teamsData.teams || {}));
      }
    } catch (error) {
      console.warn('Failed to load private marketplace data:', error.message);
    }
  }

  _saveData() {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
      
      fs.writeFileSync(this.skillsFile, JSON.stringify({
        skills: Object.fromEntries(this.skills),
        lastUpdated: new Date().toISOString()
      }, null, 2));
      
      fs.writeFileSync(this.teamsFile, JSON.stringify({
        teams: Object.fromEntries(this.teams),
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.warn('Failed to save private marketplace data:', error.message);
    }
  }

  /**
   * 配置企业市场
   */
  configure(configData) {
    this.config = { ...this.config, ...configData };
    this._saveData();
    return this.config;
  }

  /**
   * 获取配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 创建团队
   */
  createTeam(teamData) {
    const {
      name,
      description = '',
      members = [],
      admins = [],
      isPrivate = true
    } = teamData;

    if (!name) {
      throw new Error('Team name is required');
    }

    const teamId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    if (this.teams.has(teamId)) {
      throw new Error(`Team already exists: ${teamId}`);
    }

    const team = {
      id: teamId,
      name,
      description,
      members,
      admins,
      isPrivate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      skillCount: 0
    };

    this.teams.set(teamId, team);
    this._saveData();

    return team;
  }

  /**
   * 更新团队
   */
  updateTeam(teamId, updates) {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const updatedTeam = {
      ...team,
      ...updates,
      id: teamId,
      updatedAt: new Date().toISOString()
    };

    this.teams.set(teamId, updatedTeam);
    this._saveData();

    return updatedTeam;
  }

  /**
   * 删除团队
   */
  deleteTeam(teamId) {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    // 检查团队是否有技能
    const teamSkills = Array.from(this.skills.values())
      .filter(s => s.teamId === teamId);
    
    if (teamSkills.length > 0) {
      throw new Error('Cannot delete team with existing skills');
    }

    this.teams.delete(teamId);
    this._saveData();

    return { deleted: true };
  }

  /**
   * 添加团队成员
   */
  addTeamMember(teamId, userId, role = 'member') {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const existingMember = team.members.find(m => m.userId === userId);
    if (existingMember) {
      existingMember.role = role;
    } else {
      team.members.push({ userId, role, joinedAt: new Date().toISOString() });
    }

    team.updatedAt = new Date().toISOString();
    this.teams.set(teamId, team);
    this._saveData();

    return team;
  }

  /**
   * 移除团队成员
   */
  removeTeamMember(teamId, userId) {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    team.members = team.members.filter(m => m.userId !== userId);
    team.updatedAt = new Date().toISOString();
    this.teams.set(teamId, team);
    this._saveData();

    return team;
  }

  /**
   * 上传技能到私有市场
   */
  async uploadSkill(skillData, options = {}) {
    const {
      name,
      description,
      version,
      author,
      teamId,
      category = 'general',
      tags = [],
      visibility = 'team', // team, organization
      requiresApproval = true
    } = skillData;

    const { userId, userRole } = options;

    // 验证权限
    if (!this._canUpload(userId, userRole, teamId)) {
      throw new Error('Insufficient permissions to upload skills');
    }

    // 验证团队
    if (teamId && !this.teams.has(teamId)) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const skillId = this._generateSkillId(name, author);
    const now = new Date().toISOString();

    const skill = {
      id: skillId,
      name,
      description,
      version,
      author,
      teamId,
      category,
      tags,
      visibility,
      status: requiresApproval ? 'pending' : 'approved',
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      approvedBy: null,
      securityScanStatus: 'pending',
      documentationStatus: this.config.requireDocumentation ? 'pending' : 'complete'
    };

    this.skills.set(skillId, skill);
    
    // 更新团队技能计数
    if (teamId) {
      const team = this.teams.get(teamId);
      if (team) {
        team.skillCount = (team.skillCount || 0) + 1;
        this.teams.set(teamId, team);
      }
    }

    this._saveData();

    return skill;
  }

  /**
   * 审批技能
   */
  approveSkill(skillId, approverId, notes = '') {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    skill.status = 'approved';
    skill.approvedAt = new Date().toISOString();
    skill.approvedBy = approverId;
    skill.approvalNotes = notes;
    skill.updatedAt = new Date().toISOString();

    this.skills.set(skillId, skill);
    this._saveData();

    return skill;
  }

  /**
   * 拒绝技能
   */
  rejectSkill(skillId, reviewerId, reason = '') {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    skill.status = 'rejected';
    skill.rejectedAt = new Date().toISOString();
    skill.rejectedBy = reviewerId;
    skill.rejectionReason = reason;
    skill.updatedAt = new Date().toISOString();

    this.skills.set(skillId, skill);
    this._saveData();

    return skill;
  }

  /**
   * 获取技能
   */
  getSkill(skillId, userId = null) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return null;
    }

    // 检查可见性
    if (skill.visibility === 'team' && userId) {
      const team = this.teams.get(skill.teamId);
      if (team && !team.members.some(m => m.userId === userId)) {
        return null; // 无权查看
      }
    }

    return skill;
  }

  /**
   * 列出技能
   */
  listSkills(options = {}) {
    const { 
      teamId, 
      category, 
      status = 'approved',
      search, 
      tags, 
      visibility,
      limit = 50, 
      offset = 0,
      userId = null
    } = options;
    
    let skills = Array.from(this.skills.values());
    
    // 状态过滤
    if (status) {
      skills = skills.filter(s => s.status === status);
    }
    
    // 团队过滤
    if (teamId) {
      skills = skills.filter(s => s.teamId === teamId);
    }
    
    // 分类过滤
    if (category) {
      skills = skills.filter(s => s.category === category);
    }
    
    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase();
      skills = skills.filter(s => 
        s.name.toLowerCase().includes(searchLower) ||
        s.description.toLowerCase().includes(searchLower)
      );
    }
    
    // 标签过滤
    if (tags && tags.length > 0) {
      skills = skills.filter(s => 
        tags.some(tag => s.tags.includes(tag))
      );
    }
    
    // 可见性过滤
    if (visibility) {
      skills = skills.filter(s => s.visibility === visibility);
    }
    
    // 用户权限过滤
    if (userId) {
      skills = skills.filter(s => {
        if (s.visibility === 'public') return true;
        if (s.teamId) {
          const team = this.teams.get(s.teamId);
          return team && team.members.some(m => m.userId === userId);
        }
        return true;
      });
    }
    
    // 排序（按更新时间）
    skills.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    // 分页
    const total = skills.length;
    const paginatedSkills = skills.slice(offset, offset + limit);
    
    return {
      skills: paginatedSkills,
      total,
      limit,
      offset
    };
  }

  /**
   * 记录下载
   */
  recordDownload(skillId, userId = null) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    skill.downloads = (skill.downloads || 0) + 1;
    skill.updatedAt = new Date().toISOString();

    this.skills.set(skillId, skill);
    this._saveData();

    return { downloads: skill.downloads };
  }

  /**
   * 检查用户是否有上传权限
   */
  _canUpload(userId, userRole, teamId) {
    // 管理员可以上传到任何地方
    if (userRole === 'admin') return true;
    
    // 检查允许的上传者列表
    if (this.config.allowedUploaders.length > 0) {
      if (!this.config.allowedUploaders.includes(userId)) {
        return false;
      }
    }
    
    // 如果指定了团队，检查用户是否是团队成员
    if (teamId) {
      const team = this.teams.get(teamId);
      if (!team) return false;
      
      const member = team.members.find(m => m.userId === userId);
      if (!member) return false;
      
      // 只有管理员和开发者可以上传
      return ['admin', 'developer'].includes(member.role);
    }
    
    return true;
  }

  /**
   * 生成技能ID
   */
  _generateSkillId(name, author) {
    const base = `${author}-${name}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const hash = crypto.randomBytes(4).toString('hex');
    return `private-${base}-${hash}`;
  }

  /**
   * 获取待审批技能
   */
  getPendingSkills(limit = 50) {
    return Array.from(this.skills.values())
      .filter(s => s.status === 'pending')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, limit);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const skills = Array.from(this.skills.values());
    const teams = Array.from(this.teams.values());
    
    const stats = {
      totalSkills: skills.length,
      approvedSkills: skills.filter(s => s.status === 'approved').length,
      pendingSkills: skills.filter(s => s.status === 'pending').length,
      rejectedSkills: skills.filter(s => s.status === 'rejected').length,
      totalTeams: teams.length,
      totalDownloads: skills.reduce((sum, s) => sum + (s.downloads || 0), 0),
      storageUsed: 0, // TODO: 计算实际存储使用量
      storageQuota: this.config.storageQuota
    };
    
    return stats;
  }

  /**
   * 获取团队列表
   */
  listTeams() {
    return Array.from(this.teams.values());
  }

  /**
   * 获取团队信息
   */
  getTeam(teamId) {
    return this.teams.get(teamId) || null;
  }
}

module.exports = { PrivateMarketplace };
