/**
 * Enterprise Collaboration System
 * 企业级团队协作与审批工作流
 */

const crypto = require('crypto');

class TeamWorkspace {
  constructor() {
    this.workspaces = new Map();
    this.teams = new Map();
    this.members = new Map();
    this.projects = new Map();
    this.activities = [];
    
    this._initDefaultRoles();
  }

  _initDefaultRoles() {
    this.roles = {
      'owner': {
        name: '所有者',
        permissions: ['*'],
        inherits: []
      },
      'admin': {
        name: '管理员',
        permissions: [
          'workspace.manage',
          'workspace.settings',
          'member.manage',
          'project.manage',
          'workflow.manage',
          'billing.manage'
        ],
        inherits: []
      },
      'editor': {
        name: '编辑',
        permissions: [
          'project.create',
          'project.edit',
          'project.view',
          'workflow.create',
          'workflow.edit',
          'workflow.execute'
        ],
        inherits: ['viewer']
      },
      'viewer': {
        name: '查看者',
        permissions: [
          'project.view',
          'workflow.view'
        ],
        inherits: []
      },
      'approver': {
        name: '审批者',
        permissions: [
          'approval.create',
          'approval.approve',
          'approval.reject',
          'project.view'
        ],
        inherits: ['viewer']
      }
    };
  }

  // 工作空间管理
  createWorkspace(data) {
    const workspace = {
      id: `ws_${crypto.randomBytes(8).toString('hex')}`,
      name: data.name,
      description: data.description || '',
      plan: data.plan || 'starter',
      settings: {
        allowGuestAccess: data.allowGuestAccess || false,
        enforceMFA: data.enforceMFA || false,
        defaultRole: data.defaultRole || 'viewer',
        approvalRequired: data.approvalRequired || false,
        auditRetention: data.auditRetention || 90
      },
      limits: this._getPlanLimits(data.plan || 'starter'),
      owner: data.ownerId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active'
    };

    this.workspaces.set(workspace.id, workspace);
    
    // 创建默认团队
    this.createTeam({
      workspaceId: workspace.id,
      name: 'Owners',
      description: 'Workspace owners team',
      role: 'owner',
      members: [data.ownerId]
    });

    return workspace;
  }

  _getPlanLimits(plan) {
    const limits = {
      starter: {
        members: 5,
        projects: 10,
        workflows: 20,
        storage: 5 * 1024 * 1024 * 1024, // 5GB
        apiCalls: 10000
      },
      professional: {
        members: 25,
        projects: 100,
        workflows: 200,
        storage: 100 * 1024 * 1024 * 1024,
        apiCalls: 100000
      },
      enterprise: {
        members: -1, // unlimited
        projects: -1,
        workflows: -1,
        storage: -1,
        apiCalls: -1
      }
    };
    return limits[plan] || limits.starter;
  }

  getWorkspace(workspaceId) {
    return this.workspaces.get(workspaceId);
  }

  updateWorkspace(workspaceId, updates) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    Object.assign(workspace, updates, {
      updatedAt: Date.now()
    });

    return workspace;
  }

  // 团队管理
  createTeam(data) {
    const team = {
      id: `team_${crypto.randomBytes(8).toString('hex')}`,
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description || '',
      role: data.role || 'editor',
      members: data.members || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.teams.set(team.id, team);

    // 添加成员
    for (const memberId of team.members) {
      this.addMemberToTeam(memberId, team.id);
    }

    return team;
  }

  addMemberToTeam(userId, teamId) {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (!team.members.includes(userId)) {
      team.members.push(userId);
    }

    // 更新成员的工作空间角色
    this.updateMemberRole(userId, team.workspaceId, team.role);
  }

  updateMemberRole(userId, workspaceId, role) {
    const key = `${userId}:${workspaceId}`;
    const member = this.members.get(key) || {
      userId,
      workspaceId,
      role: 'viewer',
      joinedAt: Date.now(),
      permissions: []
    };

    member.role = role;
    member.permissions = this._getRolePermissions(role);
    member.updatedAt = Date.now();

    this.members.set(key, member);
    return member;
  }

  _getRolePermissions(roleName) {
    const role = this.roles[roleName];
    if (!role) return [];

    let permissions = [...role.permissions];
    
    // 继承权限
    for (const inheritedRole of role.inherits) {
      permissions = permissions.concat(this._getRolePermissions(inheritedRole));
    }

    return [...new Set(permissions)];
  }

  // 成员管理
  inviteMember(workspaceId, email, role, inviterId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // 检查成员限制
    const currentMembers = this._getWorkspaceMembers(workspaceId);
    if (workspace.limits.members > 0 && currentMembers.length >= workspace.limits.members) {
      throw new Error('Member limit reached for this plan');
    }

    const invitation = {
      id: `inv_${crypto.randomBytes(8).toString('hex')}`,
      workspaceId,
      email,
      role,
      invitedBy: inviterId,
      status: 'pending',
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      createdAt: Date.now()
    };

    this.activities.push({
      type: 'member.invited',
      workspaceId,
      data: invitation,
      actor: inviterId,
      timestamp: Date.now()
    });

    return invitation;
  }

  acceptInvitation(invitationId, userId) {
    const invitation = this.activities.find(
      a => a.type === 'member.invited' && a.data.id === invitationId
    );

    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.data.status !== 'pending') {
      throw new Error('Invitation already processed');
    }

    if (invitation.data.expiresAt < Date.now()) {
      throw new Error('Invitation expired');
    }

    invitation.data.status = 'accepted';
    invitation.data.userId = userId;
    invitation.data.acceptedAt = Date.now();

    // 添加成员到工作空间
    const key = `${userId}:${invitation.workspaceId}`;
    this.members.set(key, {
      userId,
      workspaceId: invitation.workspaceId,
      role: invitation.data.role,
      permissions: this._getRolePermissions(invitation.data.role),
      joinedAt: Date.now()
    });

    return invitation.data;
  }

  _getWorkspaceMembers(workspaceId) {
    const members = [];
    for (const member of this.members.values()) {
      if (member.workspaceId === workspaceId) {
        members.push(member);
      }
    }
    return members;
  }

  // 项目管理
  createProject(data) {
    const workspace = this.workspaces.get(data.workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // 检查项目限制
    const currentProjects = this._getWorkspaceProjects(data.workspaceId);
    if (workspace.limits.projects > 0 && currentProjects.length >= workspace.limits.projects) {
      throw new Error('Project limit reached for this plan');
    }

    const project = {
      id: `proj_${crypto.randomBytes(8).toString('hex')}`,
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description || '',
      visibility: data.visibility || 'private',
      owner: data.ownerId,
      team: data.teamId,
      tags: data.tags || [],
      settings: {
        requireApproval: data.requireApproval || false,
        autoArchive: data.autoArchive || false,
        archiveAfter: data.archiveAfter || 90
      },
      stats: {
        workflows: 0,
        executions: 0,
        members: 1
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active'
    };

    this.projects.set(project.id, project);

    this.activities.push({
      type: 'project.created',
      workspaceId: data.workspaceId,
      projectId: project.id,
      actor: data.ownerId,
      timestamp: Date.now()
    });

    return project;
  }

  _getWorkspaceProjects(workspaceId) {
    const projects = [];
    for (const project of this.projects.values()) {
      if (project.workspaceId === workspaceId) {
        projects.push(project);
      }
    }
    return projects;
  }

  // 协作功能
  addProjectMember(projectId, userId, role) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (!project.members) {
      project.members = [];
    }

    const existingMember = project.members.find(m => m.userId === userId);
    if (existingMember) {
      existingMember.role = role;
    } else {
      project.members.push({
        userId,
        role,
        addedAt: Date.now()
      });
    }

    project.stats.members = project.members.length;
    project.updatedAt = Date.now();

    return project;
  }

  // 权限检查
  hasPermission(userId, workspaceId, permission) {
    const key = `${userId}:${workspaceId}`;
    const member = this.members.get(key);
    
    if (!member) {
      return false;
    }

    // 所有者有所有权限
    if (member.role === 'owner') {
      return true;
    }

    return member.permissions.includes(permission) || member.permissions.includes('*');
  }

  // 审计日志
  logActivity(type, data) {
    this.activities.push({
      id: `act_${crypto.randomBytes(8).toString('hex')}`,
      type,
      ...data,
      timestamp: Date.now()
    });

    // 保持日志在合理范围内
    if (this.activities.length > 10000) {
      this.activities = this.activities.slice(-5000);
    }
  }

  getActivities(workspaceId, options = {}) {
    let activities = this.activities.filter(a => a.workspaceId === workspaceId);
    
    if (options.type) {
      activities = activities.filter(a => a.type.startsWith(options.type));
    }
    if (options.actor) {
      activities = activities.filter(a => a.actor === options.actor);
    }
    if (options.since) {
      activities = activities.filter(a => a.timestamp >= options.since);
    }
    if (options.until) {
      activities = activities.filter(a => a.timestamp <= options.until);
    }

    // 分页
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    
    return {
      activities: activities.slice(offset, offset + limit),
      total: activities.length,
      hasMore: offset + limit < activities.length
    };
  }

  // 获取工作空间统计
  getWorkspaceStats(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return null;

    const members = this._getWorkspaceMembers(workspaceId);
    const projects = this._getWorkspaceProjects(workspaceId);
    const activities = this.activities.filter(a => a.workspaceId === workspaceId);

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        plan: workspace.plan,
        status: workspace.status
      },
      usage: {
        members: {
          current: members.length,
          limit: workspace.limits.members,
          percentage: workspace.limits.members > 0 
            ? Math.round(members.length / workspace.limits.members * 100) 
            : 0
        },
        projects: {
          current: projects.length,
          limit: workspace.limits.projects,
          percentage: workspace.limits.projects > 0 
            ? Math.round(projects.length / workspace.limits.projects * 100) 
            : 0
        }
      },
      activity: {
        last24h: activities.filter(a => a.timestamp > Date.now() - 24 * 60 * 60 * 1000).length,
        last7d: activities.filter(a => a.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000).length
      }
    };
  }
}

module.exports = { TeamWorkspace };
