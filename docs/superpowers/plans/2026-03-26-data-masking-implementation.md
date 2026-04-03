# 数据掩码功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 UltraWork AI 登录系统实现数据掩码功能，保护用户敏感信息（邮箱、手机号、身份证、银行卡、IP地址、设备指纹），支持可逆掩码

**Architecture:** 采用混合实现方案：工具函数 + 中间件 + 服务。工具函数处理基础掩码逻辑，中间件自动拦截HTTP响应/请求，服务提供高级封装和批量处理能力。

**Tech Stack:** Node.js, Express, Crypto (Node.js 内置)

---

## 文件结构

```
server/
├── utils/
│   └── dataMask.js              # 工具函数库 - 基础掩码逻辑
├── middleware/
│   └── dataMask.js              # 中间件 - 请求/响应自动掩码
├── services/
│   └── dataMaskService.js       # 服务 - 高级封装和批量处理
└── routes/
    └── auth.js                  # 修改 - 集成数据掩码

config/
└── mask.js                      # 创建 - 掩码配置文件

tests/
├── unit/
│   └── dataMask.test.js         # 创建 - 工具函数单元测试
├── integration/
│   └── dataMask.integration.test.js  # 创建 - 集成测试
```

---

## 任务清单

### 任务 1: 创建配置文件

**Files:**
- Create: `config/mask.js`

- [ ] **Step 1: 创建配置文件**

```javascript
module.exports = {
  enabled: process.env.MASK_ENABLED === 'true',
  secretKey: process.env.MASK_SECRET_KEY || 'default-secret-key-change-in-production',
  fields: (process.env.MASK_FIELDS || 'email,phone,idCard,bankCard,ip,deviceFingerprint').split(','),
  reversible: true,
  algorithm: 'aes-256-gcm',
  ivLength: 16,
  authTagLength: 16
}
```

- [ ] **Step 2: 提交**

---

### 任务 2: 创建数据掩码工具函数库

**Files:**
- Create: `server/utils/dataMask.js`
- Test: `tests/unit/dataMask.test.js`

- [ ] **Step 1: 编写单元测试**

```javascript
const { maskEmail, maskPhone, maskIdCard, maskBankCard, maskIP, maskDeviceFingerprint, maskObject, reversibleMask, reversibleUnmask } = require('../../server/utils/dataMask');

describe('dataMask utilities', () => {
  describe('maskEmail', () => {
    it('should mask email correctly', () => {
      expect(maskEmail('user@example.com')).toBe('u***@example.com');
      expect(maskEmail('test@domain.org')).toBe('t***@domain.org');
    });
  });

  describe('maskPhone', () => {
    it('should mask phone correctly', () => {
      expect(maskPhone('13812345678')).toBe('138****5678');
      expect(maskPhone('15987654321')).toBe('159****4321');
    });
  });

  describe('maskIdCard', () => {
    it('should mask idCard correctly', () => {
      expect(maskIdCard('110101199001011234')).toBe('110101********1234');
    });
  });

  describe('maskBankCard', () => {
    it('should mask bankCard correctly', () => {
      expect(maskBankCard('6222021234567890123')).toBe('622202****90123');
    });
  });

  describe('maskIP', () => {
    it('should mask IP correctly', () => {
      expect(maskIP('192.168.1.100')).toBe('192.168.**.**');
      expect(maskIP('10.0.0.1')).toBe('10.0.**.**');
    });
  });

  describe('maskDeviceFingerprint', () => {
    it('should mask device fingerprint correctly', () => {
      expect(maskDeviceFingerprint('fp_a1b2c3d4e5f6')).toBe('fp_******a1b2');
    });
  });

  describe('maskObject', () => {
    it('should mask multiple fields in object', () => {
      const obj = { email: 'user@test.com', phone: '13812345678' };
      const masked = maskObject(obj, ['email', 'phone']);
      expect(masked.email).toBe('u***@test.com');
      expect(masked.phone).toBe('138****5678');
    });
  });

  describe('reversibleMask & reversibleUnmask', () => {
    it('should reversible mask and unmask correctly', () => {
      const authKey = 'test-auth-key-256-bits-long!!';
      const original = '13812345678';
      const masked = reversibleMask(original, 'phone', authKey);
      const unmasked = reversibleUnmask(masked, 'phone', authKey);
      expect(unmasked).toBe(original);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- tests/unit/dataMask.test.js
```
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 创建工具函数实现**

```javascript
const crypto = require('crypto');
const config = require('../../config/mask');

function maskEmail(email) {
  if (!email || typeof email !== 'string') return email;
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}***@${domain}`;
}

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length !== 11) return phone;
  return `${cleaned.slice(0, 3)}****${cleaned.slice(-4)}`;
}

function maskIdCard(idCard) {
  if (!idCard || typeof idCard !== 'string') return idCard;
  if (idCard.length < 8) return idCard;
  return `${idCard.slice(0, 6)}********${idCard.slice(-4)}`;
}

function maskBankCard(bankCard) {
  if (!bankCard || typeof bankCard !== 'string') return bankCard;
  const cleaned = bankCard.replace(/\s/g, '');
  if (cleaned.length < 8) return bankCard;
  return `${cleaned.slice(0, 6)}****${cleaned.slice(-5)}`;
}

function maskIP(ip) {
  if (!ip || typeof ip !== 'string') return ip;
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.**.**`;
}

function maskDeviceFingerprint(fp) {
  if (!fp || typeof fp !== 'string') return fp;
  if (fp.length < 8) return fp;
  return `${fp.slice(0, 3)}******${fp.slice(-4)}`;
}

function maskObject(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = { ...obj };
  for (const field of fields) {
    if (field in masked) {
      masked[field] = exports[field === 'deviceFingerprint' ? 'maskDeviceFingerprint' : `mask${field.charAt(0).toUpperCase() + field.slice(1)}`](masked[field]);
    }
  }
  return masked;
}

function reversibleMask(value, fieldType, authKey) {
  if (!value || !authKey) return value;
  const key = crypto.scryptSync(authKey, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(JSON.stringify({ value, fieldType }), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `rm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function reversibleUnmask(maskedValue, fieldType, authKey) {
  if (!maskedValue || !maskedValue.startsWith('rm:') || !authKey) return maskedValue;
  try {
    const parts = maskedValue.split(':');
    if (parts.length !== 4) return maskedValue;
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = parts[3];
    const key = crypto.scryptSync(authKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    const { value, fieldType: type } = JSON.parse(decrypted);
    return value;
  } catch {
    return maskedValue;
  }
}

module.exports = {
  maskEmail,
  maskPhone,
  maskIdCard,
  maskBankCard,
  maskIP,
  maskDeviceFingerprint,
  maskObject,
  reversibleMask,
  reversibleUnmask
};
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- tests/unit/dataMask.test.js
```
Expected: PASS

- [ ] **Step 5: 提交**

---

### 任务 3: 创建数据掩码服务

**Files:**
- Create: `server/services/dataMaskService.js`
- Test: 集成测试中验证

- [ ] **Step 1: 创建服务实现**

```javascript
const dataMask = require('../utils/dataMask');
const config = require('../../config/mask');

class DataMaskService {
  constructor() {
    this.config = config;
  }

  maskUserData(user) {
    if (!user) return null;
    const maskedUser = { ...user };
    const fields = this.config.fields;
    for (const field of fields) {
      if (field in maskedUser && maskedUser[field]) {
        const maskMethod = this.getMaskMethod(field);
        if (maskMethod) {
          maskedUser[field] = dataMask[maskMethod](maskedUser[field]);
        }
      }
    }
    return maskedUser;
  }

  getMaskMethod(field) {
    const methodMap = {
      email: 'maskEmail',
      phone: 'maskPhone',
      idCard: 'maskIdCard',
      bankCard: 'maskBankCard',
      ip: 'maskIP',
      deviceFingerprint: 'maskDeviceFingerprint'
    };
    return methodMap[field];
  }

  unmaskField(value, fieldType, authKey) {
    if (!value || !fieldType || !authKey) return value;
    return dataMask.reversibleUnmask(value, fieldType, authKey);
  }

  batchMask(dataArray, fields) {
    if (!Array.isArray(dataArray)) return dataArray;
    return dataArray.map(item => {
      if (typeof item === 'object' && item !== null) {
        return dataMask.maskObject(item, fields);
      }
      return item;
    });
  }

  getMaskedLogEntry(log) {
    if (!log || typeof log !== 'object') return log;
    const maskedLog = { ...log };
    const sensitiveFields = ['email', 'phone', 'ip', 'deviceFingerprint'];
    for (const field of sensitiveFields) {
      if (field in maskedLog && maskedLog[field]) {
        const maskMethod = this.getMaskMethod(field);
        if (maskMethod) {
          maskedLog[field] = dataMask[maskMethod](maskedLog[field]);
        }
      }
    }
    return maskedLog;
  }
}

module.exports = new DataMaskService();
```

- [ ] **Step 2: 提交**

---

### 任务 4: 创建数据掩码中间件

**Files:**
- Create: `server/middleware/dataMask.js`

- [ ] **Step 1: 创建中间件实现**

```javascript
const dataMaskService = require('../services/dataMaskService');
const config = require('../../config/mask');

function maskResponseBody(req, res, next) {
  if (!config.enabled) {
    return next();
  }

  const originalSend = res.send;
  res.send = function(body) {
    if (body && typeof body === 'object') {
      const maskedBody = dataMaskService.maskUserData(body);
      return originalSend.call(this, maskedBody);
    }
    return originalSend.call(this, body);
  };

  const originalJson = res.json;
  res.json = function(obj) {
    if (obj && typeof obj === 'object') {
      const maskedObj = dataMaskService.maskUserData(obj);
      return originalJson.call(this, maskedObj);
    }
    return originalJson.call(this, obj);
  };

  next();
}

function maskRequestBody(req, res, next) {
  if (!config.enabled) {
    return next();
  }

  if (req.body && typeof req.body === 'object') {
    req.body = dataMaskService.maskUserData(req.body);
  }
  next();
}

module.exports = {
  maskResponseBody,
  maskRequestBody
};
```

- [ ] **Step 2: 提交**

---

### 任务 5: 集成到登录路由

**Files:**
- Modify: `server/routes/auth.js`

- [ ] **Step 1: 查看现有路由代码**

```bash
cat server/routes/auth.js
```

- [ ] **Step 2: 添加导入语句**

在文件顶部添加：
```javascript
const dataMaskService = require('../services/dataMaskService');
```

- [ ] **Step 3: 修改登录响应**

找到登录成功响应处，添加掩码：
```javascript
// 登录成功后返回掩码后的用户数据
const maskedUser = dataMaskService.maskUserData(user);
res.json({ success: true, token, user: maskedUser });
```

- [ ] **Step 4: 提交**

---

### 任务 6: 创建集成测试

**Files:**
- Create: `tests/integration/dataMask.integration.test.js`

- [ ] **Step 1: 编写集成测试**

```javascript
const request = require('supertest');
const app = require('../../server/index'); // 根据实际入口文件调整

describe('Data Masking Integration', () => {
  describe('Login endpoint', () => {
    it('should mask user data in response', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      if (response.body.success) {
        expect(response.body.user).toBeDefined();
        if (response.body.user.email) {
          expect(response.body.user.email).toMatch(/^\w\*\*\*@/);
        }
      }
    });
  });

  describe('DataMaskService', () => {
    it('should mask user data correctly', () => {
      const user = {
        id: 1,
        email: 'user@test.com',
        phone: '13812345678',
        idCard: '110101199001011234'
      };
      const masked = dataMaskService.maskUserData(user);
      expect(masked.email).toBe('u***@test.com');
      expect(masked.phone).toBe('138****5678');
      expect(masked.idCard).toBe('110101********1234');
    });

    it('should batch mask array of users', () => {
      const users = [
        { id: 1, email: 'user1@test.com', phone: '13812345678' },
        { id: 2, email: 'user2@test.com', phone: '13912345678' }
      ];
      const masked = dataMaskService.batchMask(users, ['email', 'phone']);
      expect(masked[0].email).toBe('u***@test.com');
      expect(masked[1].phone).toBe('139****5678');
    });
  });
});
```

- [ ] **Step 2: 运行集成测试**

```bash
npm test -- tests/integration/dataMask.integration.test.js
```

- [ ] **Step 3: 提交**

---

## 验收标准

- [ ] 配置文件正确创建
- [ ] 工具函数库通过所有单元测试
- [ ] 服务正确封装掩码逻辑
- [ ] 中间件正确拦截响应
- [ ] 登录路由正确集成数据掩码
- [ ] 集成测试通过
- [ ] 所有敏感数据在API响应中被正确掩码

---

## 执行选择

**Plan complete and saved to `docs/superpowers/plans/2026-03-26-data-masking-implementation.md`. Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
