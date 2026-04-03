/**
 * Multi-tenant Enterprise System
 * Provides tenant isolation, SSO, audit logging, and enterprise features
 */

const crypto = require('crypto');

class EnterpriseSystem {
  constructor(options = {}) {
    this.tenants = new Map();
    this.users = new Map();
    this.sessions = new Map();
    this.auditLogs = [];
    this.ssoProviders = new Map();
    this.apiKeys = new Map();
    
    this._initSSOProviders();
  }

  _initSSOProviders() {
    this.ssoProviders.set('oauth2', {
      type: 'oauth2',
      authorizeUrl: '/oauth/authorize',
      tokenUrl: '/oauth/token',
      userInfoUrl: '/oauth/userinfo',
      scopes: ['openid', 'profile', 'email']
    });
    
    this.ssoProviders.set('saml', {
      type: 'saml',
      metadataUrl: '/saml/metadata',
      acsUrl: '/saml/acs',
      logoutUrl: '/saml/logout'
    });
  }

  // Tenant Management
  createTenant(data) {
    const tenant = {
      id: crypto.randomUUID(),
      name: data.name,
      displayName: data.displayName || data.name,
      plan: data.plan || 'enterprise',
      status: 'active',
      settings: {
        maxUsers: data.maxUsers || 100,
        maxStorage: data.maxStorage || 10 * 1024 * 1024 * 1024,
        features: data.features || ['basic_skills', 'chat', 'monitoring'],
        allowedDomains: data.allowedDomains || [],
        branding: data.branding || {}
      },
      quotas: {
      users: 0,
      storage: 0,
      apiCalls: 0,
      skills: []
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.tenants.set(tenant.id, tenant);
    this._logAudit('tenant', 'create', tenant.id, { name: tenant.name });
    
    return tenant;
  }

  getTenant(tenantId) {
    return this.tenants.get(tenantId);
  }

  updateTenant(tenantId, data) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return null;
    
    Object.assign(tenant, data, { updatedAt: Date.now() });
    this._logAudit('tenant', 'update', tenantId, data);
    
    return tenant;
  }

  deleteTenant(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;
    
    // Delete all users in tenant
    for (const [userId, user] of this.users) {
      if (user.tenantId === tenantId) {
        this.users.delete(userId);
      }
    }
    
    this.tenants.delete(tenantId);
    this._logAudit('tenant', 'delete', tenantId, { name: tenant.name });
    
    return true;
  }

  // User Management
  createUser(tenantId, data) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return { error: 'Tenant not found' };
    
    if (tenant.quotas.users >= tenant.settings.maxUsers) {
      return { error: 'User quota exceeded' };
    }
    
    const user = {
      id: crypto.randomUUID(),
      tenantId,
      email: data.email,
      name: data.name,
      role: data.role || 'user',
      status: 'active',
      permissions: this._getDefaultPermissions(data.role),
      sso: data.sso || null,
      lastLogin: null,
      createdAt: Date.now()
    };
    
    this.users.set(user.id, user);
    tenant.quotas.users++;
    
    this._logAudit('user', 'create', user.id, { email: user.email, tenantId });
    
    return user;
  }

  _getDefaultPermissions(role) {
    const permissions = {
      admin: ['*'],
      manager: ['skills.use', 'skills.create', 'skills.share', 'reports.view', 'users.view'],
      user: ['skills.use', 'reports.view'],
      viewer: ['skills.use']
    };
    return permissions[role] || permissions.user;
  }

  authenticateUser(tenantId, credentials) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant || tenant.status !== 'active') {
      return { error: 'Tenant not found or inactive' };
    }
    
    // Find user by email
    let user = null;
    for (const u of this.users.values()) {
      if (u.tenantId === tenantId && u.email === credentials.email) {
        user = u;
        break;
      }
    }
    
    if (!user) {
      return { error: 'User not found' };
    }
    
    // Verify password using constant-time comparison
    const passwordMatch = this._secureCompare(
      credentials.password, 
      user.passwordHash
    );
    if (!passwordMatch) {
      this._logAudit('auth', 'login_failed', user.id, { reason: 'invalid_password' });
      return { error: 'Invalid credentials' };
    }
    
    // Update last login
    user.lastLogin = Date.now();
    
    // Create session
    const session = this.createSession(user.id);
    
    this._logAudit('auth', 'login', user.id);
    
    return { user, session };
  }

  _hashPassword(password) {
    // Use SHA-256 with salt for password hashing
    // In production, use bcrypt or argon2
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  _verifyPassword(password, storedHash) {
    // Verify password with stored salt:hash format
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return this._secureCompare(hash, verifyHash);
  }

  _secureCompare(a, b) {
    // Constant-time comparison to prevent timing attacks
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  createSession(userId) {
    const session = {
      id: crypto.randomUUID(),
      userId,
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      createdAt: Date.now()
    };
    
    this.sessions.set(session.token, session);
    return session;
  }

  validateSession(token) {
    const session = this.sessions.get(token);
    if (!session) return null;
    
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    
    return session;
  }

  // SSO Integration
  initiateSSOLogin(tenantId, provider, redirectUri) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return { error: 'Tenant not found' };
    
    const ssoConfig = tenant.settings.sso || {};
    const providerConfig = this.ssoProviders.get(provider);
    if (!providerConfig) return { error: 'SSO provider not supported' };
    
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = this._buildAuthUrl(provider, providerConfig, redirectUri, state);
    
    return { authUrl, state };
  }

  _buildAuthUrl(provider, config, redirectUri, state) {
    if (provider === 'oauth2') {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: config.scopes.join(' '),
        state
      });
      return `${config.authorizeUrl}?${params}`;
    }
    return null;
  }

  handleSSOCallback(provider, code, state) {
    // In production, exchange code for tokens and get user info
    return { success: true, user: null };
  }

  // Permission Checking
  hasPermission(userId, permission) {
    const user = this.users.get(userId);
    if (!user) return false;
    
    if (user.permissions.includes('*')) return true;
    return user.permissions.includes(permission);
  }

  // Resource Isolation
  filterByTenant(resource, userId) {
    const user = this.users.get(userId);
    if (!user) return [];
    
    if (user.role === 'admin') return resource;
    
    return resource.filter(r => r.tenantId === user.tenantId);
  }

  // Audit Logging
  _logAudit(action, type, resourceId, details) {
    this.auditLogs.push({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      action,
      type,
      resourceId,
      details,
      ip: null
    });
    
    // Keep last 10000 logs
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-5000);
    }
  }

  getAuditLogs(filters = {}) {
    let logs = [...this.auditLogs];
    
    if (filters.tenantId) {
      logs = logs.filter(l => l.details?.tenantId === filters.tenantId);
    }
    if (filters.userId) {
      logs = logs.filter(l => l.resourceId === filters.userId);
    }
    if (filters.type) {
      logs = logs.filter(l => l.type === filters.type);
    }
    if (filters.from || filters.to) {
      logs = logs.filter(l => {
        if (filters.from && l.timestamp < filters.from) return false;
        if (filters.to && l.timestamp > filters.to) return false;
        return true;
      });
    }
    
    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }

  exportAuditReport(tenantId, format = 'csv') {
    const logs = this.getAuditLogs({ tenantId });
    
    if (format === 'csv') {
      const headers = ['Timestamp', 'Action', 'Type', 'Resource', 'Details'];
      const rows = logs.map(l => [
        new Date(l.timestamp).toISOString(),
        l.action,
        l.type,
        l.resourceId,
        JSON.stringify(l.details)
      ]);
      return [headers, ...rows].map(r => r.join(',')).join('\n');
    }
    
    return logs;
  }

  // API Key Management
  createApiKey(tenantId, userId, name, permissions) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return { error: 'Tenant not found' };
    
    const apiKey = {
      id: crypto.randomUUID(),
      tenantId,
      userId,
      name,
      key: `uw_${crypto.randomBytes(24).toString('base64')}`,
      permissions: permissions || ['skills.use'],
      rateLimit: 1000,
      createdAt: Date.now(),
      lastUsed: null
    };
    
    this.apiKeys.set(apiKey.key, apiKey);
    return { key: apiKey.key, id: apiKey.id };
  }

  validateApiKey(key) {
    const apiKey = this.apiKeys.get(key);
    if (!apiKey) return null;
    
    apiKey.lastUsed = Date.now();
    return apiKey;
  }

  revokeApiKey(key) {
    return this.apiKeys.delete(key);
  }

  // Storage Quota Management
  checkStorageQuota(tenantId, size) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;
    
    return (tenant.quotas.storage + size) <= tenant.settings.maxStorage;
  }

  updateStorageUsage(tenantId, delta) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;
    
    tenant.quotas.storage += delta;
    return true;
  }

  // Branding
  getTenantBranding(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return null;
    
    return {
      logo: tenant.settings.branding.logo || '/default-logo.png',
      colors: tenant.settings.branding.colors || {
        primary: '#10a37f',
        secondary: '#1a1a1a'
      },
      companyName: tenant.displayName
    };
  }
}

module.exports = { EnterpriseSystem };
