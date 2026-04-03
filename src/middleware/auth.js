/**
 * JWT Authentication Middleware
 * 提供基于JWT的用户认证和授权
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = null;
}

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || 3600;
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || 86400 * 7;
const BCRYPT_ROUNDS = 12;

class JWTManager {
  constructor(options = {}) {
    this.secret = options.secret || process.env.JWT_SECRET || JWT_SECRET;
    this.expiresIn = options.expiresIn || TOKEN_EXPIRY;
    this.refreshExpiresIn = options.refreshExpiresIn || REFRESH_EXPIRY;
    this.issuer = options.issuer || 'ultrawork-ai';
    this.algorithm = 'HS256';
    this.refreshTokens = new Map();
  }

  sign(payload, options = {}) {
    const now = Math.floor(Date.now() / 1000);
    const tokenPayload = {
      ...payload,
      iat: now,
      iss: this.issuer
    };

    return jwt.sign(tokenPayload, this.secret, {
      expiresIn: options.refresh ? this.refreshExpiresIn : this.expiresIn,
      algorithm: this.algorithm
    });
  }

  verify(token) {
    try {
      return jwt.verify(token, this.secret, { issuer: this.issuer });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  refresh(oldToken) {
    const payload = this.verify(oldToken);
    return this.sign({
      sub: payload.sub,
      username: payload.username,
      role: payload.role
    });
  }

  generateRefreshToken(username) {
    const token = this.sign({ sub: username, type: 'refresh' }, { refresh: true });
    this.refreshTokens.set(token, {
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + (this.refreshExpiresIn * 1000)
    });
    return token;
  }

  verifyRefreshToken(token) {
    try {
      const payload = this.verify(token);
      if (payload.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }
      const stored = this.refreshTokens.get(token);
      if (!stored || stored.expiresAt < Date.now()) {
        throw new Error('Refresh token expired or revoked');
      }
      return payload;
    } catch (error) {
      throw new Error(`Refresh token verification failed: ${error.message}`);
    }
  }

  revokeRefreshToken(token) {
    this.refreshTokens.delete(token);
  }
}

/**
 * 用户角色定义
 */
const ROLES = {
  ADMIN: 'admin',
  DEVELOPER: 'developer',
  PUBLISHER: 'publisher',
  USER: 'user',
  GUEST: 'guest'
};

/**
 * 角色权限映射
 */
const PERMISSIONS = {
  [ROLES.ADMIN]: [
    'skills:create', 'skills:read', 'skills:update', 'skills:delete',
    'templates:create', 'templates:read', 'templates:update', 'templates:delete',
    'marketplace:publish', 'marketplace:manage',
    'export:execute', 'preview:create',
    'users:manage', 'system:configure'
  ],
  [ROLES.DEVELOPER]: [
    'skills:create', 'skills:read', 'skills:update',
    'templates:create', 'templates:read', 'templates:update',
    'marketplace:publish',
    'export:execute', 'preview:create'
  ],
  [ROLES.PUBLISHER]: [
    'skills:read',
    'templates:read',
    'marketplace:publish',
    'export:execute', 'preview:create'
  ],
  [ROLES.USER]: [
    'skills:read',
    'templates:read',
    'export:execute', 'preview:create'
  ],
  [ROLES.GUEST]: [
    'skills:read',
    'templates:read'
  ]
};

/**
 * 认证中间件工厂
 */
function createAuthMiddleware(options = {}) {
  const jwtManager = new JWTManager(options);
  const excludePaths = options.excludePaths || ['/api/health', '/api/public'];

  /**
   * 验证令牌中间件
   */
  const authenticate = (req, res, next) => {
    // 检查是否在排除路径中
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // 从header或cookie获取token
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : req.cookies?.token;

    if (!token) {
      // 如果没有token，设置为游客身份
      req.user = {
        id: 'anonymous',
        role: ROLES.GUEST,
        permissions: PERMISSIONS[ROLES.GUEST]
      };
      return next();
    }

    try {
      const payload = jwtManager.verify(token);
      req.user = {
        id: payload.sub || payload.id,
        username: payload.username,
        role: payload.role || ROLES.USER,
        permissions: PERMISSIONS[payload.role || ROLES.USER] || [],
        tokenExp: payload.exp
      };
      next();
    } catch (error) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        message: error.message 
      });
    }
  };

  /**
   * 角色检查中间件
   */
  const requireRole = (...roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: roles,
          current: req.user.role
        });
      }

      next();
    };
  };

  /**
   * 权限检查中间件
   */
  const requirePermission = (...permissions) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasPermission = permissions.every(p => 
        req.user.permissions.includes(p)
      );

      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Permission denied',
          required: permissions
        });
      }

      next();
    };
  };

  /**
   * 生成令牌端点
   */
  const generateToken = (userData) => {
    return jwtManager.sign({
      sub: userData.id,
      username: userData.username,
      role: userData.role || ROLES.USER
    });
  };

  const loginHandler = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const users = jwtManager.getUsers ? jwtManager.getUsers() : getEnvUsers();
    const user = users.find(u => u.username === username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = jwtManager.verifyPassword 
      ? jwtManager.verifyPassword(username, password)
      : await verifyEnvPassword(user, password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    const refreshToken = jwtManager.generateRefreshToken 
      ? jwtManager.generateRefreshToken(user.username)
      : null;
    
    res.json({
      ok: true,
      token,
      refreshToken,
      expiresIn: jwtManager.expiresIn,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  };

  function getEnvUsers() {
    const envUsers = process.env.JWT_USERS;
    if (!envUsers) {
      console.warn('[Auth] No JWT_USERS env configured, auth endpoint disabled');
      return [];
    }
    try {
      return JSON.parse(envUsers);
    } catch (e) {
      console.error('[Auth] Failed to parse JWT_USERS:', e.message);
      return [];
    }
  }

  async function verifyEnvPassword(user, password) {
    if (bcrypt && user.bcryptHash) {
      try {
        return await bcrypt.compare(password, user.bcryptHash);
      } catch (e) {
        console.error('[Auth] bcrypt compare failed:', e.message);
        return false;
      }
    }
    if (user.passwordHash) {
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      return hash === user.passwordHash;
    }
    if (user.salt && user.hash) {
      const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
      return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(user.hash, 'hex')
      );
    }
    return false;
  }

  async function hashPassword(password) {
    if (bcrypt) {
      return await bcrypt.hash(password, BCRYPT_ROUNDS);
    }
    const salt = crypto.randomBytes(16).toString('hex');
    return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
  }

  /**
   * 验证令牌端点
   */
  const verifyHandler = (req, res) => {
    res.json({
      ok: true,
      user: req.user
    });
  };

  return {
    jwtManager,
    authenticate,
    requireRole,
    requirePermission,
    generateToken,
    loginHandler,
    verifyHandler,
    ROLES,
    PERMISSIONS
  };
}

module.exports = { 
  JWTManager, 
  createAuthMiddleware, 
  ROLES, 
  PERMISSIONS 
};
