# Security Patterns - 安全编码规范

本文档记录 UltraWork AI 平台的安全编码模式和最佳实践。

## 目录

1. [身份认证](#身份认证)
2. [数据加密](#数据加密)
3. [输入验证](#输入验证)
4. [SSRF 防护](#ssrf-防护)
5. [路径遍历防护](#路径遍历防护)
6. [注入攻击防护](#注入攻击防护)
7. [序列化安全](#序列化安全)
8. [敏感数据处理](#敏感数据处理)

---

## 身份认证

### 问题
默认允许匿名访问敏感端点。

### 修复模式
```javascript
// ❌ 错误：所有端点默认为匿名
app.post('/api/admin/*', (req, res) => {
  // 无权限检查
});

// ✅ 正确：显式要求认证
app.post('/api/admin/*', requireAuth, (req, res) => {
  // 业务逻辑
});

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !validateToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = decodeToken(token);
  next();
}
```

### 参考文件
- `src/api/PrivacyAPI.js`

---

## 数据加密

### 问题
使用弱哈希算法（SHA-256）存储密码。

### 修复模式
```javascript
// ❌ 错误：使用 SHA-256 哈希密码
const hash = crypto.createHash('sha256').update(password).digest('hex');

// ✅ 正确：使用 PBKDF2 或 bcrypt
const hashPassword = async (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
};

const salt = crypto.randomBytes(32).toString('hex');
const hash = await hashPassword(password, salt);
```

### 常数时间比较
```javascript
// ❌ 错误：使用 == 比较
if (providedHash === storedHash)

// ✅ 正确：使用 crypto.timingSafeEqual
const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};
```

### 参考文件
- `src/skills/enterprise/EnterpriseSystem.js`
- `src/compliance/PrivacyCompliance.js`

---

## 输入验证

### 问题
缺少输入类型和边界验证。

### 修复模式
```javascript
// ❌ 错误：直接使用用户输入
async sendToDisplay(deviceId, content) {
  this.process(content.body); // 可能包含 XSS
}

// ✅ 正确：严格验证输入
async sendToDisplay(deviceId, content) {
  if (typeof content !== 'object' || content === null) {
    return { error: 'Content must be an object' };
  }
  
  const sanitizedContent = {
    title: this._sanitizeString(content.title, 200),
    body: this._sanitizeString(content.body, 5000),
    type: ['text', 'image', 'video', 'chart'].includes(content.type) ? content.type : 'text'
  };
}

_sanitizeString(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, '').slice(0, maxLength);
}
```

### 白名单验证
```javascript
const ALLOWED_LOCALES = ['zh-CN', 'en', 'ja', 'de', 'fr', 'es', 'ar'];

function validateLocale(locale) {
  return ALLOWED_LOCALES.includes(locale) ? locale : 'en';
}
```

### 参考文件
- `src/hardware/SmartHardwareIntegration.js`
- `src/i18n/I18n.js`

---

## SSRF 防护

### 问题
允许任意 URL 作为 webhook 回调地址。

### 修复模式
```javascript
// ❌ 错误：无 URL 验证
registerWebhook(deviceId, callbackUrl) {
  device.webhooks.push({ url: callbackUrl });
}

// ✅ 正确：多层验证
registerWebhook(deviceId, callbackUrl) {
  // 1. 基本 URL 格式验证
  if (!this._isValidUrl(callbackUrl)) {
    return { error: 'Invalid webhook URL' };
  }
  
  const parsedUrl = new URL(callbackUrl);
  
  // 2. 协议验证
  if (parsedUrl.protocol !== 'https:') {
    return { error: 'Only HTTPS URLs are allowed' };
  }
  
  // 3. 阻止本地地址
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (blockedHosts.includes(parsedUrl.hostname)) {
    return { error: 'Localhost URLs not allowed' };
  }
  
  // 4. 阻止私有 IP 范围
  const privateIpRanges = [
    /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
    /^169\.254\./, /^fc00:/, /^fe80:/
  ];
  if (privateIpRanges.some(range => range.test(parsedUrl.hostname))) {
    return { error: 'Private IPs not allowed' };
  }
  
  device.webhooks.push({ url: callbackUrl });
}

_isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}
```

### 参考文件
- `src/hardware/SmartHardwareIntegration.js`

---

## 路径遍历防护

### 问题
日志轮转时未验证路径。

### 修复模式
```javascript
// ❌ 错误：直接使用用户输入拼接路径
rotateLogs(backupDir) {
  const logFile = path.join(backupDir, 'audit.log');
}

// ✅ 正确：验证规范化路径
rotateLogs(backupDir) {
  const normalizedBackup = path.normalize(backupDir);
  const normalizedBase = path.normalize(this.baseDir);
  
  if (!normalizedBackup.startsWith(normalizedBase)) {
    throw new Error('Invalid backup directory: path traversal detected');
  }
  
  const logFile = path.join(normalizedBackup, 'audit.log');
}
```

### 禁止路径字符
```javascript
const FORBIDDEN_CHARS = /[<>:"|?*\x00-\x1f]/;

function isValidPath(filepath) {
  return !FORBIDDEN_CHARS.test(filepath) && !filepath.includes('..');
}
```

### 参考文件
- `src/skills/enterprise/AuditReporter.js`

---

## 注入攻击防护

### CSV 注入防护
```javascript
// ❌ 错误：直接输出到 CSV
csv += `${row.name},${row.email},${row.value}\n`;

// ✅ 正确：转义 CSV 值
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

csv += `${escapeCSV(row.name)},${escapeCSV(row.email)},${escapeCSV(row.value)}\n`;
```

### HTML 注入防护
```javascript
function sanitizeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// 在 innerHTML 使用时
element.innerHTML = sanitizeHTML(userInput);
```

### 参考文件
- `src/skills/enterprise/AuditReporter.js`
- `frontend/privacy-settings.html`

---

## 序列化安全

### 问题
不验证反序列化数据。

### 修复模式
```javascript
// ❌ 错误：直接信任反序列化数据
importModel(data) {
  this.qTable = new Map(data.qTable);
  this.userModels = new Map(data.userModels);
}

// ✅ 正确：严格验证每个值
importModel(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid model data');
  }
  
  if (data.qTable && Array.isArray(data.qTable)) {
    for (const [key, value] of data.qTable) {
      // 验证键和值的类型
      if (typeof key === 'string' && typeof value === 'number' && isFinite(value)) {
        this.qTable.set(key, value);
      }
    }
  }
  
  if (data.userModels && Array.isArray(data.userModels)) {
    const validatedModels = new Map();
    for (const [userId, model] of data.userModels) {
      if (typeof userId === 'string' && model && typeof model === 'object') {
        validatedModels.set(userId, {
          // 验证并限制数值范围
          totalCalls: Math.max(0, Math.min(Number.isFinite(model.totalCalls) ? model.totalCalls : 0, 1e9)),
          successCount: Math.max(0, Math.min(Number.isFinite(model.successCount) ? model.successCount : 0, model.totalCalls || 0))
        });
      }
    }
    this.userModels = validatedModels;
  }
}
```

### ID 格式验证
```javascript
const ID_PATTERN = /^[a-z0-9-]+$/;

function validateId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id) && id.length <= 100;
}
```

### 参考文件
- `src/skills/recommendation/RLSkillRecommender.js`
- `src/skills/solutions/IndustrySolutions.js`

---

## 敏感数据处理

### PII 哈希
```javascript
// ❌ 错误：存储明文 PII
userData.email = email;

// ✅ 正确：哈希 PII
const hashPII = (value, salt) => {
  return crypto.createHash('sha256').update(salt + value).digest('hex');
};

userData.emailHash = hashPII(email, config.piiSalt);
```

### 日志脱敏
```javascript
function sanitizeForLog(data) {
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'ssn', 'creditCard'];
  const sanitized = { ...data };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '***REDACTED***';
    }
  }
  
  return sanitized;
}
```

### 参考文件
- `src/compliance/PrivacyCompliance.js`

---

## 安全检查清单

在提交代码前，确保：

- [ ] 所有 API 端点都有适当的权限检查
- [ ] 密码使用 PBKDF2 或 bcrypt 哈希
- [ ] 敏感比较使用 `crypto.timingSafeEqual`
- [ ] 用户输入经过验证和清理
- [ ] URL 回调地址验证协议和主机
- [ ] 文件路径经过遍历检查
- [ ] CSV/HTML 输出经过转义
- [ ] 反序列化数据经过严格验证
- [ ] PII 在存储和日志中脱敏

---

## 漏洞历史

| 日期 | 漏洞类型 | 严重性 | 文件 | 状态 |
|------|---------|--------|------|------|
| 2026-03-21 | Auth Bypass | Critical | PrivacyAPI.js | ✅ 已修复 |
| 2026-03-21 | Weak Hashing | High | EnterpriseSystem.js | ✅ 已修复 |
| 2026-03-21 | Path Traversal | High | AuditReporter.js | ✅ 已修复 |
| 2026-03-21 | CSV Injection | High | AuditReporter.js | ✅ 已修复 |
| 2026-03-21 | SSRF | High | SmartHardwareIntegration.js | ✅ 已修复 |
| 2026-03-21 | XSS | Medium | SmartHardwareIntegration.js | ✅ 已修复 |
| 2026-03-21 | Deserialization | High | RLSkillRecommender.js | ✅ 已修复 |
| 2026-03-21 | Deserialization | High | IndustrySolutions.js | ✅ 已修复 |
