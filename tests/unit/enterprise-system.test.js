const { EnterpriseSystem } = require('../../src/skills/enterprise/EnterpriseSystem');

describe('EnterpriseSystem', () => {
  let system;

  beforeEach(() => {
    system = new EnterpriseSystem();
  });

  describe('constructor', () => {
    it('initializes maps and SSO providers', () => {
      expect(system.tenants).toBeInstanceOf(Map);
      expect(system.users).toBeInstanceOf(Map);
      expect(system.sessions).toBeInstanceOf(Map);
      expect(system.auditLogs).toEqual([]);
      expect(system.ssoProviders).toBeInstanceOf(Map);
      expect(system.apiKeys).toBeInstanceOf(Map);
    });

    it('registers default SSO providers', () => {
      expect(system.ssoProviders.has('oauth2')).toBe(true);
      expect(system.ssoProviders.has('saml')).toBe(true);
    });
  });

  describe('createTenant', () => {
    it('creates tenant with default settings', () => {
      const tenant = system.createTenant({ name: 'Acme Corp' });
      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe('Acme Corp');
      expect(tenant.displayName).toBe('Acme Corp');
      expect(tenant.plan).toBe('enterprise');
      expect(tenant.status).toBe('active');
      expect(tenant.settings.maxUsers).toBe(100);
      expect(tenant.settings.features).toEqual(['basic_skills', 'chat', 'monitoring']);
      expect(tenant.quotas.users).toBe(0);
      expect(tenant.createdAt).toBeDefined();
      expect(tenant.updatedAt).toBeDefined();
    });

    it('creates tenant with custom options', () => {
      const tenant = system.createTenant({
        name: 'Startup Inc',
        displayName: 'Startup Inc Display',
        plan: 'basic',
        maxUsers: 10,
        features: ['basic_skills']
      });
      expect(tenant.displayName).toBe('Startup Inc Display');
      expect(tenant.plan).toBe('basic');
      expect(tenant.settings.maxUsers).toBe(10);
      expect(tenant.settings.features).toEqual(['basic_skills']);
    });

    it('logs audit on create', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      expect(system.auditLogs.length).toBe(1);
      expect(system.auditLogs[0].action).toBe('tenant');
      expect(system.auditLogs[0].type).toBe('create');
      expect(system.auditLogs[0].resourceId).toBe(tenant.id);
    });
  });

  describe('getTenant', () => {
    it('returns tenant by id', () => {
      const created = system.createTenant({ name: 'Acme' });
      const found = system.getTenant(created.id);
      expect(found).toEqual(created);
    });

    it('returns undefined for unknown tenant', () => {
      expect(system.getTenant('nonexistent')).toBeUndefined();
    });
  });

  describe('updateTenant', () => {
    it('updates tenant fields', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const updated = system.updateTenant(tenant.id, { name: 'Acme Updated' });
      expect(updated.name).toBe('Acme Updated');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(tenant.createdAt);
    });

    it('returns null for unknown tenant', () => {
      expect(system.updateTenant('nonexistent', {})).toBeNull();
    });

    it('logs audit on update', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      system.updateTenant(tenant.id, { name: 'Changed' });
      const audit = system.auditLogs.find((l) => l.type === 'update');
      expect(audit).toBeDefined();
      expect(audit.action).toBe('tenant');
    });
  });

  describe('deleteTenant', () => {
    it('deletes tenant and its users', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'a@a.com', name: 'A' });
      const result = system.deleteTenant(tenant.id);
      expect(result).toBe(true);
      expect(system.tenants.has(tenant.id)).toBe(false);
      expect(system.users.has(user.id)).toBe(false);
    });

    it('returns false for unknown tenant', () => {
      expect(system.deleteTenant('nonexistent')).toBe(false);
    });

    it('logs audit on delete', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      system.deleteTenant(tenant.id);
      const audit = system.auditLogs.find((l) => l.type === 'delete');
      expect(audit).toBeDefined();
    });

    it('should not affect users from other tenants', () => {
      const t1 = system.createTenant({ name: 'Acme' });
      const t2 = system.createTenant({ name: 'Beta' });
      const user2 = system.createUser(t2.id, { email: 'u@beta.com', name: 'U' });
      system.deleteTenant(t1.id);
      expect(system.users.has(user2.id)).toBe(true);
    });
  });

  describe('createUser', () => {
    it('creates user in tenant', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'user@acme.com', name: 'John' });
      expect(user.id).toBeDefined();
      expect(user.tenantId).toBe(tenant.id);
      expect(user.email).toBe('user@acme.com');
      expect(user.name).toBe('John');
      expect(user.role).toBe('user');
      expect(user.status).toBe('active');
      expect(tenant.quotas.users).toBe(1);
    });

    it('creates admin user with full permissions', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'admin@acme.com', name: 'Admin', role: 'admin' });
      expect(user.permissions).toEqual(['*']);
    });

    it('creates manager user with manager permissions', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'mgr@acme.com', name: 'Mgr', role: 'manager' });
      expect(user.permissions).toContain('skills.create');
      expect(user.permissions).toContain('users.view');
    });

    it('creates viewer user with viewer permissions', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'view@acme.com', name: 'View', role: 'viewer' });
      expect(user.permissions).toEqual(['skills.use']);
    });

    it('returns error for nonexistent tenant', () => {
      const result = system.createUser('nonexistent', { email: 'a@a.com', name: 'A' });
      expect(result).toEqual({ error: 'Tenant not found' });
    });

    it('returns error when quota exceeded', () => {
      const tenant = system.createTenant({ name: 'Acme', maxUsers: 1 });
      system.createUser(tenant.id, { email: 'first@acme.com', name: 'First' });
      const result = system.createUser(tenant.id, { email: 'second@acme.com', name: 'Second' });
      expect(result).toEqual({ error: 'User quota exceeded' });
    });

    it('supports SSO-linked user creation', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'sso@acme.com', name: 'SSO', sso: { provider: 'oauth2', sub: 'abc123' } });
      expect(user.sso).toEqual({ provider: 'oauth2', sub: 'abc123' });
    });
  });

  describe('authenticateUser', () => {
    it('authenticates with valid password', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'user@acme.com', name: 'John' });
      user.passwordHash = 'correct-password';
      const result = system.authenticateUser(tenant.id, { email: 'user@acme.com', password: 'correct-password' });
      expect(result.error).toBeUndefined();
      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.user.lastLogin).toBeDefined();
    });

    it('fails with invalid password', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'user@acme.com', name: 'John' });
      user.passwordHash = 'correct-password';
      const result = system.authenticateUser(tenant.id, { email: 'user@acme.com', password: 'wrong-password' });
      expect(result).toEqual({ error: 'Invalid credentials' });
    });

    it('returns error for inactive tenant', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      tenant.status = 'inactive';
      const result = system.authenticateUser(tenant.id, { email: 'x@x.com', password: 'pwd' });
      expect(result).toEqual({ error: 'Tenant not found or inactive' });
    });

    it('returns error for nonexistent tenant', () => {
      const result = system.authenticateUser('nonexistent', { email: 'x@x.com', password: 'pwd' });
      expect(result).toEqual({ error: 'Tenant not found or inactive' });
    });

    it('returns error when user not found', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const result = system.authenticateUser(tenant.id, { email: 'nobody@acme.com', password: 'pwd' });
      expect(result).toEqual({ error: 'User not found' });
    });

    it('should fail when user exists in different tenant', () => {
      const t1 = system.createTenant({ name: 'Acme' });
      const t2 = system.createTenant({ name: 'Beta' });
      system.createUser(t1.id, { email: 'u@acme.com', name: 'U' });
      const result = system.authenticateUser(t2.id, { email: 'u@acme.com', password: 'pwd' });
      expect(result).toEqual({ error: 'User not found' });
    });
  });

  describe('_secureCompare', () => {
    it('returns true for equal strings', () => {
      expect(system._secureCompare('hello', 'hello')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(system._secureCompare('hello', 'world')).toBe(false);
    });

    it('returns false for non-string types', () => {
      expect(system._secureCompare(null, 'test')).toBe(false);
      expect(system._secureCompare('test', undefined)).toBe(false);
      expect(system._secureCompare(123, '123')).toBe(false);
    });

    it('returns false for different lengths', () => {
      expect(system._secureCompare('abc', 'abcd')).toBe(false);
    });
  });

  describe('_verifyPassword', () => {
    it('verifies password correctly', () => {
      const hash = system._hashPassword('mypassword');
      expect(system._verifyPassword('mypassword', hash)).toBe(true);
    });

    it('rejects wrong password', () => {
      const hash = system._hashPassword('mypassword');
      expect(system._verifyPassword('wrong', hash)).toBe(false);
    });

    it('returns false for malformed hash', () => {
      expect(system._verifyPassword('pwd', 'invalid-hash')).toBe(false);
      expect(system._verifyPassword('pwd', '')).toBe(false);
    });
  });

  describe('createSession / validateSession', () => {
    it('creates session with token and expiry', () => {
      const session = system.createSession('user-1');
      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-1');
      expect(session.token).toBeDefined();
      expect(session.expiresAt).toBeGreaterThan(Date.now());
    });

    it('validates active session', () => {
      const session = system.createSession('user-1');
      const validated = system.validateSession(session.token);
      expect(validated).toEqual(session);
    });

    it('returns null for invalid token', () => {
      expect(system.validateSession('badtoken')).toBeNull();
    });

    it('returns null for expired session', () => {
      const session = system.createSession('user-1');
      session.expiresAt = Date.now() - 1000;
      expect(system.validateSession(session.token)).toBeNull();
      expect(system.sessions.has(session.token)).toBe(false);
    });
  });

  describe('initiateSSOLogin', () => {
    it('returns auth URL for OAuth2', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      system.ssoProviders.get('oauth2').clientId = 'client-123';
      const result = system.initiateSSOLogin(tenant.id, 'oauth2', 'https://app.com/callback');
      expect(result.authUrl).toContain('/oauth/authorize?');
      expect(result.authUrl).toContain('client_id=client-123');
      expect(result.state).toBeDefined();
    });

    it('returns null auth URL for SAML (non-OAuth2 provider)', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const result = system.initiateSSOLogin(tenant.id, 'saml', 'https://app.com/callback');
      expect(result.authUrl).toBeNull();
    });

    it('returns error for unsupported provider', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const result = system.initiateSSOLogin(tenant.id, 'unknown', 'https://app.com/callback');
      expect(result).toEqual({ error: 'SSO provider not supported' });
    });

    it('returns error for nonexistent tenant', () => {
      const result = system.initiateSSOLogin('nonexistent', 'oauth2', 'https://app.com/callback');
      expect(result).toEqual({ error: 'Tenant not found' });
    });
  });

  describe('handleSSOCallback', () => {
    it('returns success with null user', () => {
      const result = system.handleSSOCallback('oauth2', 'code', 'state');
      expect(result).toEqual({ success: true, user: null });
    });
  });

  describe('hasPermission', () => {
    it('allows admin all permissions', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'a@a.com', name: 'A', role: 'admin' });
      expect(system.hasPermission(user.id, 'anything')).toBe(true);
    });

    it('checks user-level permissions', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'a@a.com', name: 'A', role: 'user' });
      expect(system.hasPermission(user.id, 'skills.use')).toBe(true);
      expect(system.hasPermission(user.id, 'skills.create')).toBe(false);
    });

    it('returns false for nonexistent user', () => {
      expect(system.hasPermission('nonexistent', 'skills.use')).toBe(false);
    });
  });

  describe('filterByTenant', () => {
    it('filters resources by user tenant', () => {
      const t1 = system.createTenant({ name: 'Acme' });
      const t2 = system.createTenant({ name: 'Beta' });
      const user = system.createUser(t1.id, { email: 'a@a.com', name: 'A' });
      const resources = [
        { tenantId: t1.id, data: 'foo' },
        { tenantId: t2.id, data: 'bar' }
      ];
      const filtered = system.filterByTenant(resources, user.id);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].data).toBe('foo');
    });

    it('returns all resources for admin', () => {
      const t1 = system.createTenant({ name: 'Acme' });
      const user = system.createUser(t1.id, { email: 'a@a.com', name: 'A', role: 'admin' });
      const resources = [{ tenantId: 'other', data: 'x' }];
      expect(system.filterByTenant(resources, user.id)).toEqual(resources);
    });

    it('returns empty array for nonexistent user', () => {
      expect(system.filterByTenant([], 'nonexistent')).toEqual([]);
    });
  });

  describe('getAuditLogs', () => {
    it('returns logs in reverse chronological order', () => {
      const _t1 = system.createTenant({ name: 'Acme' });
      const _t2 = system.createTenant({ name: 'Beta' });
      const logs = system.getAuditLogs();
      expect(logs.length).toBe(2);
      expect(logs[0].timestamp).toBeGreaterThanOrEqual(logs[1].timestamp);
    });

    it('filters by tenantId', () => {
      const t = system.createTenant({ name: 'Acme' });
      const logs = system.getAuditLogs({ tenantId: t.id });
      expect(logs.every((l) => l.details && l.details.tenantId === t.id)).toBe(true);
    });

    it('filters by type', () => {
      system.createTenant({ name: 'Acme' });
      const logs = system.getAuditLogs({ type: 'create' });
      expect(logs.every((l) => l.type === 'create')).toBe(true);
    });

    it('filters by time range', () => {
      system.createTenant({ name: 'Acme' });
      const from = Date.now() - 60000;
      const to = Date.now() + 60000;
      const logs = system.getAuditLogs({ from, to });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('filters by userId', () => {
      const t = system.createTenant({ name: 'Acme' });
      const user = system.createUser(t.id, { email: 'a@a.com', name: 'A' });
      const logs = system.getAuditLogs({ userId: user.id });
      expect(logs.every((l) => l.resourceId === user.id)).toBe(true);
    });

    it('excludes logs before from timestamp', () => {
      system.createTenant({ name: 'Acme' });
      system.auditLogs.push({ timestamp: Date.now() - 120000, action: 'old', type: 'test', resourceId: 'r1' });
      const from = Date.now();
      const logs = system.getAuditLogs({ from });
      expect(logs.every((l) => l.timestamp >= from)).toBe(true);
    });

    it('excludes logs after to timestamp', () => {
      system.createTenant({ name: 'Acme' });
      system.auditLogs.push({ timestamp: Date.now() + 120000, action: 'future', type: 'test', resourceId: 'r1' });
      const to = Date.now();
      const logs = system.getAuditLogs({ to });
      expect(logs.every((l) => l.timestamp <= to)).toBe(true);
    });
  });

  describe('exportAuditReport', () => {
    it('exports CSV format', () => {
      system.createTenant({ name: 'Acme' });
      const csv = system.exportAuditReport(undefined, 'csv');
      expect(csv).toContain('Timestamp,Action,Type,Resource,Details');
      expect(csv.split('\n').length).toBeGreaterThan(1);
    });

    it('returns raw logs for non-CSV format', () => {
      system.createTenant({ name: 'Acme' });
      const logs = system.exportAuditReport(undefined, 'json');
      expect(Array.isArray(logs)).toBe(true);
    });

    it('uses default CSV format', () => {
      system.createTenant({ name: 'Acme' });
      const csv = system.exportAuditReport(undefined);
      expect(csv).toContain('Timestamp,Action,Type,Resource,Details');
    });
  });

  describe('createApiKey', () => {
    it('creates API key with prefix', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'a@a.com', name: 'A' });
      const result = system.createApiKey(tenant.id, user.id, 'My Key');
      expect(result.key).toMatch(/^uw_/);
      expect(result.id).toBeDefined();
    });

    it('returns error for nonexistent tenant', () => {
      const result = system.createApiKey('nonexistent', 'u1', 'Key');
      expect(result).toEqual({ error: 'Tenant not found' });
    });
  });

  describe('validateApiKey', () => {
    it('returns API key details', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'a@a.com', name: 'A' });
      const { key } = system.createApiKey(tenant.id, user.id, 'Key');
      const validated = system.validateApiKey(key);
      expect(validated).toBeDefined();
      expect(validated.lastUsed).toBeDefined();
    });

    it('returns null for unknown key', () => {
      expect(system.validateApiKey('bad-key')).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('removes API key', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const user = system.createUser(tenant.id, { email: 'a@a.com', name: 'A' });
      const { key } = system.createApiKey(tenant.id, user.id, 'Key');
      expect(system.revokeApiKey(key)).toBe(true);
      expect(system.validateApiKey(key)).toBeNull();
    });

    it('returns false for nonexistent key', () => {
      expect(system.revokeApiKey('bad-key')).toBe(false);
    });
  });

  describe('checkStorageQuota', () => {
    it('returns true when under limit', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      expect(system.checkStorageQuota(tenant.id, 100)).toBe(true);
    });

    it('returns false when over limit', () => {
      const tenant = system.createTenant({ name: 'Acme', maxStorage: 50 });
      expect(system.checkStorageQuota(tenant.id, 100)).toBe(false);
    });

    it('returns false for nonexistent tenant', () => {
      expect(system.checkStorageQuota('nonexistent', 100)).toBe(false);
    });
  });

  describe('updateStorageUsage', () => {
    it('increments storage', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      expect(system.updateStorageUsage(tenant.id, 500)).toBe(true);
      expect(tenant.quotas.storage).toBe(500);
    });

    it('returns false for nonexistent tenant', () => {
      expect(system.updateStorageUsage('nonexistent', 100)).toBe(false);
    });
  });

  describe('getTenantBranding', () => {
    it('returns default branding when no custom branding', () => {
      const tenant = system.createTenant({ name: 'Acme' });
      const branding = system.getTenantBranding(tenant.id);
      expect(branding.logo).toBe('/default-logo.png');
      expect(branding.colors.primary).toBe('#10a37f');
      expect(branding.companyName).toBe('Acme');
    });

    it('returns custom branding when set', () => {
      const tenant = system.createTenant({ name: 'Acme', branding: { logo: '/custom.png', colors: { primary: '#ff0000' } } });
      const branding = system.getTenantBranding(tenant.id);
      expect(branding.logo).toBe('/custom.png');
      expect(branding.colors.primary).toBe('#ff0000');
    });

    it('returns null for nonexistent tenant', () => {
      expect(system.getTenantBranding('nonexistent')).toBeNull();
    });
  });

  describe('audit log size limit', () => {
    it('trims to 5000 entries when exceeding 10000', () => {
      for (let i = 0; i < 10001; i++) {
        system._logAudit('test', 'test', `r-${i}`, {});
      }
      expect(system.auditLogs.length).toBe(5000);
    });
  });
});
