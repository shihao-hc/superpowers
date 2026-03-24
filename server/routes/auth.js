/**
 * UltraWork AI 认证路由
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { authLimiter, generateToken, generateRefreshToken, authMiddleware } = require('../middleware');
const dataMaskService = require('../services/dataMaskService');

// 内存存储（生产环境应使用数据库）
const users = new Map();
const refreshTokens = new Map();

/**
 * POST /api/auth/register
 * 用户注册
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 验证输入
    if (!username || !email || !password) {
      return res.status(400).json({
        error: '用户名、邮箱和密码不能为空',
        code: 'MISSING_FIELDS'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: '密码长度至少为8位',
        code: 'PASSWORD_TOO_SHORT'
      });
    }

    // 检查用户是否已存在
    if (users.has(email)) {
      return res.status(409).json({
        error: '该邮箱已被注册',
        code: 'USER_EXISTS'
      });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    users.set(email, user);

    // 生成令牌
    const token = generateToken({
      id: user.id,
      username: user.username,
      email: user.email
    });

    const refreshToken = generateRefreshToken({
      id: user.id,
      type: 'refresh'
    });

    refreshTokens.set(user.id, refreshToken);

    // 注册成功后返回掩码后的用户数据
    const maskedUser = dataMaskService.maskUserData({
      id: user.id,
      username: user.username,
      email: user.email
    });

    res.status(201).json({
      success: true,
      data: {
        user: maskedUser,
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      error: '注册失败',
      code: 'REGISTER_ERROR'
    });
  }
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // 验证输入
    if (!email || !password) {
      return res.status(400).json({
        error: '邮箱和密码不能为空',
        code: 'MISSING_FIELDS'
      });
    }

    // 查找用户
    const user = users.get(email);

    if (!user) {
      return res.status(401).json({
        error: '邮箱或密码错误',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // 验证密码
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        error: '邮箱或密码错误',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // 生成令牌
    const token = generateToken({
      id: user.id,
      username: user.username,
      email: user.email
    });

    const refreshToken = generateRefreshToken({
      id: user.id,
      type: 'refresh'
    });

    refreshTokens.set(user.id, refreshToken);

    // 登录成功后返回掩码后的用户数据
    const maskedUser = dataMaskService.maskUserData({
      id: user.id,
      username: user.username,
      email: user.email
    });

    res.json({
      success: true,
      data: {
        user: maskedUser,
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: '登录失败',
      code: 'LOGIN_ERROR'
    });
  }
});

/**
 * POST /api/auth/refresh
 * 刷新令牌
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: '刷新令牌不能为空',
        code: 'MISSING_REFRESH_TOKEN'
      });
    }

    // 验证刷新令牌
    const jwt = require('jsonwebtoken');
    const config = require('../config');

    try {
      const decoded = jwt.verify(refreshToken, config.get('security.jwtSecret'));

      // 检查刷新令牌是否存在
      if (!refreshTokens.has(decoded.id) || refreshTokens.get(decoded.id) !== refreshToken) {
        return res.status(401).json({
          error: '无效的刷新令牌',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }

      // 查找用户
      let user = null;
      for (const [email, u] of users) {
        if (u.id === decoded.id) {
          user = u;
          break;
        }
      }

      if (!user) {
        return res.status(404).json({
          error: '用户不存在',
          code: 'USER_NOT_FOUND'
        });
      }

      // 生成新令牌
      const newToken = generateToken({
        id: user.id,
        username: user.username,
        email: user.email
      });

      const newRefreshToken = generateRefreshToken({
        id: user.id,
        type: 'refresh'
      });

      refreshTokens.set(user.id, newRefreshToken);

      res.json({
        success: true,
        data: {
          token: newToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (error) {
      return res.status(401).json({
        error: '刷新令牌已过期',
        code: 'REFRESH_TOKEN_EXPIRED'
      });
    }
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({
      error: '令牌刷新失败',
      code: 'REFRESH_ERROR'
    });
  }
});

/**
 * POST /api/auth/logout
 * 用户登出
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // 清除刷新令牌
    refreshTokens.delete(userId);

    res.json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: '登出失败',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // 查找用户
    let user = null;
    for (const [email, u] of users) {
      if (u.id === userId) {
        user = u;
        break;
      }
    }

    if (!user) {
      return res.status(404).json({
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 返回掩码后的用户信息
    const maskedUser = dataMaskService.maskUserData({
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });

    res.json({
      success: true,
      data: maskedUser
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: '获取用户信息失败',
      code: 'GET_USER_ERROR'
    });
  }
});

module.exports = router;