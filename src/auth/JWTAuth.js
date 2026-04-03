const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class JWTAuth {
  constructor(options = {}) {
    this.secret = options.secret || process.env.JWT_SECRET;
    if (!this.secret) {
      this.secret = crypto.randomBytes(32).toString('hex');
      console.warn('[JWTAuth] No JWT_SECRET set, using random key (tokens invalid on restart)');
    }
    this.expiresIn = options.expiresIn || 86400000;
    this.refreshExpiresIn = options.refreshExpiresIn || (7 * 86400000);
    this.issuer = options.issuer || 'ultrawork';
    this.tokens = new Map();
    this.refreshTokens = new Map();
    this.users = new Map();
    this.roles = new Map();
    this._setupDefaultRoles();
    this._startCleanup();
  }

  _startCleanup() {
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [token, data] of this.tokens) {
        if (data.exp && data.exp * 1000 < now) {
          this.tokens.delete(token);
        }
      }
      for (const [token, data] of this.refreshTokens) {
        if (data.expiresAt < now) {
          this.refreshTokens.delete(token);
        }
      }
    }, 60000);
  }

  _setupDefaultRoles() {
    this.roles.set('admin', {
      permissions: ['*'],
      description: 'Full access'
    });
    this.roles.set('operator', {
      permissions: ['workflow:*', 'marketplace:read', 'agent:*', 'task:*'],
      description: 'Operational access'
    });
    this.roles.set('viewer', {
      permissions: ['workflow:read', 'marketplace:read', 'task:read'],
      description: 'Read-only access'
    });
  }

  createUser(username, password, role = 'viewer') {
    if (this.users.has(username)) {
      return { error: 'User already exists' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');

    const user = {
      username,
      hash,
      salt,
      role: this.roles.has(role) ? role : 'viewer',
      createdAt: Date.now(),
      lastLogin: null,
      active: true
    };

    this.users.set(username, user);
    return { username, role: user.role };
  }

  verifyPassword(username, password) {
    const user = this.users.get(username);
    if (!user || !user.active) return false;

    const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
    
    if (hash.length !== user.hash.length) return false;
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(user.hash, 'hex')
      );
    } catch (e) {
      return false;
    }
  }

  login(username, password) {
    if (!this.verifyPassword(username, password)) {
      return { error: 'Invalid credentials' };
    }

    const user = this.users.get(username);
    user.lastLogin = Date.now();

    const accessToken = this._generateToken(username, user.role);
    const refreshToken = this._generateRefreshToken(username);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.expiresIn / 1000,
      user: {
        username: user.username,
        role: user.role
      }
    };
  }

  _generateToken(username, role) {
    const payload = {
      sub: username,
      role,
      type: 'access'
    };

    const token = jwt.sign(payload, this.secret, {
      expiresIn: this.expiresIn / 1000,
      issuer: this.issuer,
      jwtid: crypto.randomBytes(16).toString('hex')
    });

    const decoded = jwt.decode(token);
    this.tokens.set(token, { username, role, exp: decoded.exp });

    return token;
  }

  _generateRefreshToken(username) {
    const token = jwt.sign({ sub: username, type: 'refresh' }, this.secret, {
      expiresIn: this.refreshExpiresIn / 1000,
      issuer: this.issuer,
      jwtid: crypto.randomBytes(16).toString('hex')
    });

    const decoded = jwt.decode(token);
    this.refreshTokens.set(token, {
      username,
      createdAt: Date.now(),
      expiresAt: decoded.exp * 1000
    });

    return token;
  }

  verify(token) {
    if (!token) return { valid: false, error: 'No token provided' };

    try {
      const payload = jwt.verify(token, this.secret, {
        issuer: this.issuer
      });

      if (payload.type !== 'access') {
        return { valid: false, error: 'Invalid token type' };
      }

      return { valid: true, payload, username: payload.sub, role: payload.role };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'Token expired' };
      }
      if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid token' };
      }
      return { valid: false, error: error.message };
    }
  }

  verifySocketToken(token) {
    if (!token) return { valid: false, error: 'No token provided' };

    try {
      const payload = jwt.verify(token, this.secret, {
        issuer: this.issuer
      });

      return { valid: true, payload, username: payload.sub, role: payload.role };

    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  refresh(refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, this.secret, {
        issuer: this.issuer
      });

      if (payload.type !== 'refresh') {
        return { error: 'Invalid refresh token' };
      }

      const stored = this.refreshTokens.get(refreshToken);
      if (!stored) return { error: 'Invalid refresh token' };

      const user = this.users.get(stored.username);
      if (!user || !user.active) return { error: 'User not found' };

      const newAccessToken = this._generateToken(user.username, user.role);
      const newRefreshToken = this._generateRefreshToken(user.username);

      this.refreshTokens.delete(refreshToken);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: this.expiresIn / 1000
      };
    } catch (error) {
      return { error: 'Invalid refresh token' };
    }
  }

  logout(token) {
    this.tokens.delete(token);
    this.refreshTokens.delete(token);
    return { success: true };
  }

  logoutAll(username) {
    for (const [token, data] of this.tokens) {
      if (data.username === username) {
        this.tokens.delete(token);
      }
    }
    for (const [token, data] of this.refreshTokens) {
      if (data.username === username) {
        this.refreshTokens.delete(token);
      }
    }
    return { success: true };
  }

  middleware(options = {}) {
    const requiredRole = options.role || null;
    const requiredPermission = options.permission || null;

    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.slice(7);
      const result = this.verify(token);

      if (!result.valid) {
        return res.status(401).json({ error: result.error });
      }

      req.user = {
        username: result.username,
        role: result.role
      };

      if (requiredRole && result.role !== requiredRole) {
        return res.status(403).json({ error: 'Insufficient role' });
      }

      if (requiredPermission) {
        const userRole = this.roles.get(result.role);
        if (!userRole) {
          return res.status(403).json({ error: 'Unknown role' });
        }

        const hasPermission = userRole.permissions.includes('*') ||
          userRole.permissions.some(p => {
            const [resource, action] = p.split(':');
            const [reqResource, reqAction] = requiredPermission.split(':');
            return (resource === reqResource || resource === '*') &&
                   (action === reqAction || action === '*');
          });

        if (!hasPermission) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      }

      next();
    };
  }

  adminMiddleware() {
    return this.middleware({ role: 'admin' });
  }

  getStats() {
    return {
      users: this.users.size,
      activeTokens: this.tokens.size,
      refreshTokens: this.refreshTokens.size,
      roles: this.roles.size
    };
  }

  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this.tokens.clear();
    this.refreshTokens.clear();
    this.users.clear();
  }
}

module.exports = { JWTAuth };
