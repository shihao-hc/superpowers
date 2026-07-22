const { TeamWorkspace } = require('../../src/enterprise/collaboration/TeamWorkspace');

describe('TeamWorkspace', () => {
  let tw;

  beforeEach(() => {
    tw = new TeamWorkspace();
  });

  /* ===== Constructor & Roles ===== */
  describe('constructor', () => {
    it('should initialize empty Maps and arrays', () => {
      expect(tw.workspaces).toBeInstanceOf(Map);
      expect(tw.workspaces.size).toBe(0);
      expect(tw.teams).toBeInstanceOf(Map);
      expect(tw.teams.size).toBe(0);
      expect(tw.members).toBeInstanceOf(Map);
      expect(tw.members.size).toBe(0);
      expect(tw.projects).toBeInstanceOf(Map);
      expect(tw.projects.size).toBe(0);
      expect(tw.activities).toEqual([]);
    });

    it('should call _initDefaultRoles', () => {
      expect(tw.roles).toBeDefined();
      expect(Object.keys(tw.roles)).toHaveLength(5);
    });
  });

  describe('_initDefaultRoles', () => {
    it('should define owner role with wildcard permissions', () => {
      const owner = tw.roles.owner;
      expect(owner).toBeDefined();
      expect(owner.permissions).toEqual(['*']);
      expect(owner.inherits).toEqual([]);
    });

    it('should define admin role with management permissions', () => {
      const admin = tw.roles.admin;
      expect(admin).toBeDefined();
      expect(admin.permissions).toContain('workspace.manage');
      expect(admin.permissions).toContain('member.manage');
      expect(admin.permissions).toContain('project.manage');
    });

    it('should define editor role with inherits from viewer', () => {
      const editor = tw.roles.editor;
      expect(editor).toBeDefined();
      expect(editor.permissions).toContain('project.create');
      expect(editor.permissions).toContain('project.edit');
      expect(editor.inherits).toContain('viewer');
    });

    it('should define viewer role', () => {
      const viewer = tw.roles.viewer;
      expect(viewer).toBeDefined();
      expect(viewer.permissions).toContain('project.view');
      expect(viewer.permissions).toContain('workflow.view');
      expect(viewer.inherits).toEqual([]);
    });

    it('should define approver role with inherits from viewer', () => {
      const approver = tw.roles.approver;
      expect(approver).toBeDefined();
      expect(approver.permissions).toContain('approval.create');
      expect(approver.permissions).toContain('approval.approve');
      expect(approver.inherits).toContain('viewer');
    });
  });

  /* ===== Workspace Management ===== */
  describe('createWorkspace', () => {
    it('should generate an id prefixed with ws_', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      expect(ws.id).toMatch(/^ws_[a-f0-9]{16}$/);
    });

    it('should set defaults for optional fields', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      expect(ws.description).toBe('');
      expect(ws.plan).toBe('starter');
      expect(ws.settings.allowGuestAccess).toBe(false);
      expect(ws.settings.enforceMFA).toBe(false);
      expect(ws.settings.defaultRole).toBe('viewer');
      expect(ws.settings.approvalRequired).toBe(false);
      expect(ws.settings.auditRetention).toBe(90);
    });

    it('should respect provided optional fields', () => {
      const ws = tw.createWorkspace({
        name: 'Pro WS',
        ownerId: 'user1',
        description: 'A pro workspace',
        plan: 'professional',
        allowGuestAccess: true,
        enforceMFA: true,
        defaultRole: 'editor',
        approvalRequired: true,
        auditRetention: 180
      });
      expect(ws.description).toBe('A pro workspace');
      expect(ws.plan).toBe('professional');
      expect(ws.settings.allowGuestAccess).toBe(true);
      expect(ws.settings.enforceMFA).toBe(true);
      expect(ws.settings.defaultRole).toBe('editor');
      expect(ws.settings.approvalRequired).toBe(true);
      expect(ws.settings.auditRetention).toBe(180);
    });

    it('should set owner, createdAt, updatedAt, and status', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      expect(ws.owner).toBe('user1');
      expect(ws.createdAt).toBeGreaterThan(0);
      expect(ws.updatedAt).toBeGreaterThan(0);
      expect(ws.status).toBe('active');
    });

    it('should call _getPlanLimits and assign limits', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      expect(ws.limits).toBeDefined();
      expect(ws.limits.members).toBe(5);
      expect(ws.limits.projects).toBe(10);
    });

    it('should store workspace in the map', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      expect(tw.workspaces.get(ws.id)).toBe(ws);
    });

    it('should create an Owners team with the owner as member', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const teams = Array.from(tw.teams.values());
      expect(teams).toHaveLength(1);
      expect(teams[0].name).toBe('Owners');
      expect(teams[0].workspaceId).toBe(ws.id);
      expect(teams[0].members).toContain('user1');
    });
  });

  describe('_getPlanLimits', () => {
    it('should return starter limits by default', () => {
      const limits = tw._getPlanLimits('unknown');
      expect(limits.members).toBe(5);
      expect(limits.projects).toBe(10);
      expect(limits.workflows).toBe(20);
      expect(limits.storage).toBe(5 * 1024 * 1024 * 1024);
      expect(limits.apiCalls).toBe(10000);
    });

    it('should return professional limits', () => {
      const limits = tw._getPlanLimits('professional');
      expect(limits.members).toBe(25);
      expect(limits.projects).toBe(100);
    });

    it('should return enterprise limits with -1 (unlimited)', () => {
      const limits = tw._getPlanLimits('enterprise');
      expect(limits.members).toBe(-1);
      expect(limits.projects).toBe(-1);
      expect(limits.workflows).toBe(-1);
      expect(limits.storage).toBe(-1);
      expect(limits.apiCalls).toBe(-1);
    });

    it('should fallback to starter for unknown plan', () => {
      const limits = tw._getPlanLimits('nonexistent');
      expect(limits.members).toBe(5);
    });
  });

  describe('getWorkspace', () => {
    it('should return the workspace by id', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      expect(tw.getWorkspace(ws.id)).toBe(ws);
    });

    it('should return undefined for non-existent workspace', () => {
      expect(tw.getWorkspace('ws_nonexistent')).toBeUndefined();
    });
  });

  describe('updateWorkspace', () => {
    it('should merge updates into the workspace', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const updated = tw.updateWorkspace(ws.id, { name: 'Updated', description: 'New desc' });
      expect(updated.name).toBe('Updated');
      expect(updated.description).toBe('New desc');
    });

    it('should set updatedAt timestamp', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const before = ws.updatedAt;
      const updated = tw.updateWorkspace(ws.id, { name: 'Changed' });
      expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('should throw if workspace not found', () => {
      expect(() => tw.updateWorkspace('ws_nonexistent', { name: 'X' })).toThrow('Workspace not found');
    });
  });

  /* ===== Team Management ===== */
  describe('createTeam', () => {
    it('should generate an id prefixed with team_', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const team = tw.createTeam({ workspaceId: ws.id, name: 'Devs', members: ['user2'] });
      expect(team.id).toMatch(/^team_[a-f0-9]{16}$/);
    });

    it('should set defaults for optional fields', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const team = tw.createTeam({ workspaceId: ws.id, name: 'Devs' });
      expect(team.description).toBe('');
      expect(team.role).toBe('editor');
      expect(team.members).toEqual([]);
    });

    it('should store the team in the map', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const team = tw.createTeam({ workspaceId: ws.id, name: 'Devs', members: ['user2'] });
      expect(tw.teams.get(team.id)).toBe(team);
    });

    it('should add each member via addMemberToTeam', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      tw.createTeam({ workspaceId: ws.id, name: 'Devs', members: ['user2', 'user3'] });
      const key2 = `user2:${ws.id}`;
      const key3 = `user3:${ws.id}`;
      expect(tw.members.get(key2)).toBeDefined();
      expect(tw.members.get(key2).role).toBe('editor');
      expect(tw.members.get(key3)).toBeDefined();
    });
  });

  describe('addMemberToTeam', () => {
    it('should throw if team not found', () => {
      expect(() => tw.addMemberToTeam('user1', 'team_nonexistent')).toThrow('Team not found');
    });

    it('should add user to team.members', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const team = tw.createTeam({ workspaceId: ws.id, name: 'Devs' });
      tw.addMemberToTeam('user2', team.id);
      expect(team.members).toContain('user2');
    });

    it('should not duplicate a member', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const team = tw.createTeam({ workspaceId: ws.id, name: 'Devs', members: ['user2'] });
      tw.addMemberToTeam('user2', team.id);
      expect(team.members.filter((m) => m === 'user2')).toHaveLength(1);
    });

    it('should update the member role via updateMemberRole', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const team = tw.createTeam({ workspaceId: ws.id, name: 'Devs', role: 'editor' });
      tw.addMemberToTeam('user2', team.id);
      const key = `user2:${ws.id}`;
      expect(tw.members.get(key).role).toBe('editor');
    });
  });

  describe('updateMemberRole', () => {
    it('should create a new member entry if one does not exist', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const member = tw.updateMemberRole('user_new', ws.id, 'viewer');
      expect(member.userId).toBe('user_new');
      expect(member.workspaceId).toBe(ws.id);
      expect(member.role).toBe('viewer');
    });

    it('should update an existing member entry', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const member = tw.updateMemberRole('user1', ws.id, 'editor');
      expect(member.role).toBe('editor');
      const updated = tw.updateMemberRole('user1', ws.id, 'admin');
      expect(updated.role).toBe('admin');
    });

    it('should set resolved permissions via _getRolePermissions', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const member = tw.updateMemberRole('user1', ws.id, 'approver');
      expect(member.permissions).toContain('approval.create');
      expect(member.permissions).toContain('approval.approve');
      expect(member.permissions).toContain('project.view');
    });
  });

  describe('_getRolePermissions', () => {
    it('should return permissions for a role without inheritance', () => {
      const perms = tw._getRolePermissions('viewer');
      expect(perms).toEqual(['project.view', 'workflow.view']);
    });

    it('should resolve inherited permissions', () => {
      const perms = tw._getRolePermissions('editor');
      expect(perms).toContain('project.create');
      expect(perms).toContain('project.view');
      expect(perms).toContain('workflow.view');
    });

    it('should return permissions for approver including inherited viewer', () => {
      const perms = tw._getRolePermissions('approver');
      expect(perms).toContain('approval.create');
      expect(perms).toContain('approval.approve');
      expect(perms).toContain('approval.reject');
      expect(perms).toContain('project.view');
    });

    it('should deduplicate permissions', () => {
      const perms = tw._getRolePermissions('editor');
      const unique = new Set(perms);
      expect(perms.length).toBe(unique.size);
    });

    it('should return empty array for unknown role', () => {
      const perms = tw._getRolePermissions('unknown_role');
      expect(perms).toEqual([]);
    });
  });

  /* ===== Member Management ===== */
  describe('inviteMember', () => {
    it('should throw if workspace not found', () => {
      expect(() => tw.inviteMember('ws_nonexistent', 'a@b.com', 'viewer', 'inviter'))
        .toThrow('Workspace not found');
    });

    it('should throw if member limit reached', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1', plan: 'starter' });
      ws.limits.members = 1;
      expect(() => tw.inviteMember(ws.id, 'a@b.com', 'viewer', 'inviter'))
        .toThrow('Member limit reached for this plan');
    });

    it('should create an invitation with inv_ prefixed id', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const inv = tw.inviteMember(ws.id, 'a@b.com', 'editor', 'user1');
      expect(inv.id).toMatch(/^inv_[a-f0-9]{16}$/);
    });

    it('should set invitation properties', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const inv = tw.inviteMember(ws.id, 'a@b.com', 'editor', 'user1');
      expect(inv.workspaceId).toBe(ws.id);
      expect(inv.email).toBe('a@b.com');
      expect(inv.role).toBe('editor');
      expect(inv.invitedBy).toBe('user1');
      expect(inv.status).toBe('pending');
    });

    it('should set expiresAt to 7 days from now', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const inv = tw.inviteMember(ws.id, 'a@b.com', 'viewer', 'user1');
      const expectedExpiry = 7 * 24 * 60 * 60 * 1000;
      expect(inv.expiresAt - inv.createdAt).toBeCloseTo(expectedExpiry, -2);
    });

    it('should log a member.invited activity', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      tw.inviteMember(ws.id, 'a@b.com', 'viewer', 'user1');
      const activities = tw.activities.filter((a) => a.type === 'member.invited');
      expect(activities).toHaveLength(1);
      expect(activities[0].workspaceId).toBe(ws.id);
      expect(activities[0].actor).toBe('user1');
    });
  });

  describe('acceptInvitation', () => {
    it('should throw if invitation not found', () => {
      expect(() => tw.acceptInvitation('inv_nonexistent', 'user2'))
        .toThrow('Invitation not found');
    });

    it('should throw if invitation already processed', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const inv = tw.inviteMember(ws.id, 'a@b.com', 'editor', 'user1');
      tw.acceptInvitation(inv.id, 'user2');
      expect(() => tw.acceptInvitation(inv.id, 'user3'))
        .toThrow('Invitation already processed');
    });

    it('should throw if invitation expired', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const inv = tw.inviteMember(ws.id, 'a@b.com', 'viewer', 'user1');
      inv.expiresAt = Date.now() - 1000;
      expect(() => tw.acceptInvitation(inv.id, 'user2'))
        .toThrow('Invitation expired');
    });

    it('should set status to accepted and store userId', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const inv = tw.inviteMember(ws.id, 'a@b.com', 'editor', 'user1');
      const result = tw.acceptInvitation(inv.id, 'user2');
      expect(result.status).toBe('accepted');
      expect(result.userId).toBe('user2');
      expect(result.acceptedAt).toBeGreaterThan(0);
    });

    it('should add the user as a workspace member', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const inv = tw.inviteMember(ws.id, 'a@b.com', 'editor', 'user1');
      tw.acceptInvitation(inv.id, 'user2');
      const key = `user2:${ws.id}`;
      const member = tw.members.get(key);
      expect(member).toBeDefined();
      expect(member.role).toBe('editor');
      expect(member.workspaceId).toBe(ws.id);
    });
  });

  describe('_getWorkspaceMembers', () => {
    it('should return all members for a workspace', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      tw.updateMemberRole('user2', ws.id, 'viewer');
      tw.updateMemberRole('user3', ws.id, 'editor');
      const members = tw._getWorkspaceMembers(ws.id);
      expect(members).toHaveLength(3);
    });

    it('should return empty array if no members', () => {
      const members = tw._getWorkspaceMembers('ws_empty');
      expect(members).toEqual([]);
    });

    it('should exclude members from other workspaces', () => {
      const ws1 = tw.createWorkspace({ name: 'A', ownerId: 'user1' });
      const ws2 = tw.createWorkspace({ name: 'B', ownerId: 'user2' });
      tw.updateMemberRole('user3', ws1.id, 'viewer');
      tw.updateMemberRole('user4', ws2.id, 'viewer');
      const members1 = tw._getWorkspaceMembers(ws1.id);
      expect(members1).toHaveLength(2);
      expect(members1.every(m => m.workspaceId === ws1.id)).toBe(true);
    });
  });

  /* ===== Project Management ===== */
  describe('createProject', () => {
    it('should throw if workspace not found', () => {
      expect(() => tw.createProject({ workspaceId: 'ws_nonexistent', name: 'P1', ownerId: 'u1' }))
        .toThrow('Workspace not found');
    });

    it('should throw if project limit reached', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1', plan: 'starter' });
      ws.limits.projects = 1;
      tw.createProject({ workspaceId: ws.id, name: 'P1', ownerId: 'user1' });
      expect(() => tw.createProject({ workspaceId: ws.id, name: 'P2', ownerId: 'user1' }))
        .toThrow('Project limit reached for this plan');
    });

    it('should generate a proj_ prefixed id', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const proj = tw.createProject({ workspaceId: ws.id, name: 'P1', ownerId: 'user1' });
      expect(proj.id).toMatch(/^proj_[a-f0-9]{16}$/);
    });

    it('should set project properties with defaults', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const proj = tw.createProject({ workspaceId: ws.id, name: 'P1', ownerId: 'user1' });
      expect(proj.name).toBe('P1');
      expect(proj.workspaceId).toBe(ws.id);
      expect(proj.owner).toBe('user1');
      expect(proj.description).toBe('');
      expect(proj.visibility).toBe('private');
      expect(proj.tags).toEqual([]);
      expect(proj.settings.requireApproval).toBe(false);
      expect(proj.settings.autoArchive).toBe(false);
      expect(proj.settings.archiveAfter).toBe(90);
      expect(proj.stats).toEqual({ workflows: 0, executions: 0, members: 1 });
      expect(proj.status).toBe('active');
    });

    it('should respect provided project options', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const proj = tw.createProject({
        workspaceId: ws.id,
        name: 'P1',
        ownerId: 'user1',
        description: 'Desc',
        visibility: 'public',
        tags: ['urgent'],
        teamId: 'team1',
        requireApproval: true,
        autoArchive: true,
        archiveAfter: 30
      });
      expect(proj.description).toBe('Desc');
      expect(proj.visibility).toBe('public');
      expect(proj.tags).toEqual(['urgent']);
      expect(proj.team).toBe('team1');
      expect(proj.settings.requireApproval).toBe(true);
      expect(proj.settings.autoArchive).toBe(true);
      expect(proj.settings.archiveAfter).toBe(30);
    });

    it('should store project and log activity', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const proj = tw.createProject({ workspaceId: ws.id, name: 'P1', ownerId: 'user1' });
      expect(tw.projects.get(proj.id)).toBe(proj);
      const activity = tw.activities.find((a) => a.type === 'project.created');
      expect(activity).toBeDefined();
      expect(activity.projectId).toBe(proj.id);
      expect(activity.actor).toBe('user1');
    });
  });

  describe('_getWorkspaceProjects', () => {
    it('should filter projects by workspace', () => {
      const ws1 = tw.createWorkspace({ name: 'A', ownerId: 'user1' });
      const ws2 = tw.createWorkspace({ name: 'B', ownerId: 'user2' });
      tw.createProject({ workspaceId: ws1.id, name: 'P1', ownerId: 'user1' });
      tw.createProject({ workspaceId: ws2.id, name: 'P2', ownerId: 'user2' });
      const projects = tw._getWorkspaceProjects(ws1.id);
      expect(projects).toHaveLength(1);
      expect(projects[0].workspaceId).toBe(ws1.id);
    });
  });

  describe('addProjectMember', () => {
    it('should throw if project not found', () => {
      expect(() => tw.addProjectMember('proj_nonexistent', 'u1', 'editor'))
        .toThrow('Project not found');
    });

    it('should add a new member to project', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const proj = tw.createProject({ workspaceId: ws.id, name: 'P1', ownerId: 'user1' });
      const result = tw.addProjectMember(proj.id, 'user2', 'editor');
      expect(result.members).toHaveLength(1);
      expect(result.members[0].userId).toBe('user2');
      expect(result.members[0].role).toBe('editor');
      expect(result.members[0].addedAt).toBeGreaterThan(0);
    });

    it('should update an existing member role instead of adding duplicate', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const proj = tw.createProject({ workspaceId: ws.id, name: 'P1', ownerId: 'user1' });
      tw.addProjectMember(proj.id, 'user2', 'editor');
      tw.addProjectMember(proj.id, 'user2', 'viewer');
      expect(proj.members).toHaveLength(1);
      expect(proj.members[0].role).toBe('viewer');
    });

    it('should update stats.members and updatedAt', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      const proj = tw.createProject({ workspaceId: ws.id, name: 'P1', ownerId: 'user1' });
      const before = proj.updatedAt;
      tw.addProjectMember(proj.id, 'user2', 'editor');
      expect(proj.stats.members).toBe(1);
      expect(proj.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  /* ===== Permissions ===== */
  describe('hasPermission', () => {
    it('should return false for non-member', () => {
      expect(tw.hasPermission('nonexistent', 'ws_any', 'project.view')).toBe(false);
    });

    it('should return true for owner regardless of permission', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      expect(tw.hasPermission('user1', ws.id, 'anything.at.all')).toBe(true);
    });

    it('should return true if member has the specific permission', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      tw.updateMemberRole('user2', ws.id, 'viewer');
      expect(tw.hasPermission('user2', ws.id, 'project.view')).toBe(true);
    });

    it('should return false if member does not have the permission', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      tw.updateMemberRole('user2', ws.id, 'viewer');
      expect(tw.hasPermission('user2', ws.id, 'project.create')).toBe(false);
    });

    it('should return true for admin with workspace.manage', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      tw.updateMemberRole('user2', ws.id, 'admin');
      expect(tw.hasPermission('user2', ws.id, 'workspace.manage')).toBe(true);
    });
  });

  /* ===== Audit ===== */
  describe('logActivity', () => {
    it('should create an activity with act_ prefixed id', () => {
      tw.logActivity('test.event', { workspaceId: 'ws1', actor: 'user1' });
      expect(tw.activities[0].id).toMatch(/^act_[a-f0-9]{16}$/);
    });

    it('should merge data into the activity entry', () => {
      tw.logActivity('test.event', { workspaceId: 'ws1', actor: 'user1', detail: 'hello' });
      const act = tw.activities[0];
      expect(act.type).toBe('test.event');
      expect(act.workspaceId).toBe('ws1');
      expect(act.actor).toBe('user1');
      expect(act.detail).toBe('hello');
    });

    it('should set a timestamp', () => {
      tw.logActivity('test.event', { workspaceId: 'ws1' });
      expect(tw.activities[0].timestamp).toBeGreaterThan(0);
    });

    it('should truncate to last 5000 when exceeding 10000', () => {
      for (let i = 0; i < 10001; i++) {
        tw.logActivity('bulk', { workspaceId: `ws_${i}`, index: i });
      }
      expect(tw.activities.length).toBe(5000);
    });

    it('should keep the most recent activities after truncation', () => {
      for (let i = 0; i < 10001; i++) {
        tw.logActivity('bulk', { workspaceId: 'main', index: i });
      }
      const firstIndex = tw.activities[0].index;
      const lastIndex = tw.activities[tw.activities.length - 1].index;
      expect(lastIndex).toBe(10000);
      expect(firstIndex).toBe(5001);
    });
  });

  describe('getActivities', () => {
    it('should filter activities by workspaceId', () => {
      tw.logActivity('test', { workspaceId: 'ws1', actor: 'u1' });
      tw.logActivity('test', { workspaceId: 'ws2', actor: 'u2' });
      const result = tw.getActivities('ws1');
      expect(result.activities).toHaveLength(1);
    });

    it('should filter by type prefix', () => {
      tw.logActivity('member.invited', { workspaceId: 'ws1', actor: 'u1' });
      tw.logActivity('project.created', { workspaceId: 'ws1', actor: 'u1' });
      const result = tw.getActivities('ws1', { type: 'member' });
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].type).toBe('member.invited');
    });

    it('should filter by actor', () => {
      tw.logActivity('test', { workspaceId: 'ws1', actor: 'alice' });
      tw.logActivity('test', { workspaceId: 'ws1', actor: 'bob' });
      const result = tw.getActivities('ws1', { actor: 'alice' });
      expect(result.activities).toHaveLength(1);
    });

    it('should filter by since timestamp', () => {
      jest.useFakeTimers();
      tw.logActivity('test', { workspaceId: 'ws1', actor: 'u1' });
      jest.advanceTimersByTime(100);
      tw.logActivity('test2', { workspaceId: 'ws1', actor: 'u1' });
      const since = Date.now() - 50;
      const result = tw.getActivities('ws1', { since });
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].type).toBe('test2');
      jest.useRealTimers();
    });

    it('should filter by until timestamp', () => {
      jest.useFakeTimers();
      tw.logActivity('test', { workspaceId: 'ws1', actor: 'u1' });
      const until = Date.now() + 50;
      jest.advanceTimersByTime(100);
      tw.logActivity('test2', { workspaceId: 'ws1', actor: 'u1' });
      const result = tw.getActivities('ws1', { until });
      expect(result.activities).toHaveLength(1);
      expect(result.activities[0].type).toBe('test');
      jest.useRealTimers();
    });

    it('should paginate with limit and offset', () => {
      for (let i = 0; i < 10; i++) {
        tw.logActivity('test', { workspaceId: 'ws1', actor: 'u1', idx: i });
      }
      const result = tw.getActivities('ws1', { limit: 3, offset: 0 });
      expect(result.activities).toHaveLength(3);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should have hasMore false when offset+limit >= total', () => {
      for (let i = 0; i < 3; i++) {
        tw.logActivity('test', { workspaceId: 'ws1', actor: 'u1', idx: i });
      }
      const result = tw.getActivities('ws1', { limit: 5, offset: 0 });
      expect(result.hasMore).toBe(false);
    });

    it('should use default limit of 50', () => {
      for (let i = 0; i < 60; i++) {
        tw.logActivity('test', { workspaceId: 'ws1', actor: 'u1' });
      }
      const result = tw.getActivities('ws1');
      expect(result.activities).toHaveLength(50);
    });
  });

  /* ===== Stats ===== */
  describe('getWorkspaceStats', () => {
    it('should return null if workspace not found', () => {
      expect(tw.getWorkspaceStats('ws_nonexistent')).toBeNull();
    });

    it('should return workspace info', () => {
      const ws = tw.createWorkspace({ name: 'StatsTest', ownerId: 'user1' });
      const stats = tw.getWorkspaceStats(ws.id);
      expect(stats.workspace).toEqual({
        id: ws.id,
        name: 'StatsTest',
        plan: 'starter',
        status: 'active'
      });
    });

    it('should return usage percentages (non-zero limit)', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1', plan: 'starter' });
      tw.updateMemberRole('user2', ws.id, 'viewer');
      tw.updateMemberRole('user3', ws.id, 'editor');
      const stats = tw.getWorkspaceStats(ws.id);
      expect(stats.usage.members.current).toBe(3);
      expect(stats.usage.members.limit).toBe(5);
      expect(stats.usage.members.percentage).toBe(60);
      expect(stats.usage.projects.current).toBe(0);
      expect(stats.usage.projects.percentage).toBe(0);
    });

    it('should return 0 for unlimited (-1) limits', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1', plan: 'enterprise' });
      tw.updateMemberRole('user2', ws.id, 'viewer');
      const stats = tw.getWorkspaceStats(ws.id);
      expect(stats.usage.members.limit).toBe(-1);
      expect(stats.usage.members.percentage).toBe(0);
      expect(stats.usage.projects.limit).toBe(-1);
      expect(stats.usage.projects.percentage).toBe(0);
    });

    it('should return 24h and 7d activity counts', () => {
      const ws = tw.createWorkspace({ name: 'Test', ownerId: 'user1' });
      tw.logActivity('test', { workspaceId: ws.id, actor: 'user1' });
      const stats = tw.getWorkspaceStats(ws.id);
      expect(stats.activity.last24h).toBe(1);
      expect(stats.activity.last7d).toBe(1);
    });
  });
});
