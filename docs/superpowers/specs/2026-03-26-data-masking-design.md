# 数据掩码功能设计规格说明

**版本**: 1.0  
**日期**: 2026-03-26  
**项目**: UltraWork AI 登录系统数据掩码功能  
**状态**: 进行中

---

## 1. 概述

### 1.1 目标

为 UltraWork AI 登录系统实现数据掩码（Data Masking）功能，保护用户敏感信息，支持可逆掩码（需授权），采用混合实现方案。

### 1.2 范围

- 保护数据类型：邮箱、手机号、身份证、银行卡、IP地址、设备指纹
- 应用场景：登录表单、错误日志、API响应、后端存储、前端缓存、监控审计

---

## 2. 功能需求

### 2.1 掩码数据类型

| 数据类型 | 掩码规则 | 可逆 |
|---------|---------|-----|
| 邮箱 | `a***@domain.com` | 是 |
| 手机号 | `138****5678` | 是 |
| 身份证 | `11010119900101****` | 是 |
| 银行卡 | `622202****1234` | 是 |
| IP地址 | `192.168.**.**` | 是 |
| 设备指纹 | `fp_******a1b2` | 是 |

### 2.2 安全级别

- **可逆掩码（需授权）**：通过授权密钥可以还原原始数据
- 授权密钥仅在特定场景下使用（管理员审查、法务需求）

### 2.3 掩码场景

1. **登录表单**：用户输入的敏感信息在前端即时掩码
2. **错误日志**：日志中不记录明文敏感信息
3. **API响应**：响应体中的敏感字段自动掩码
4. **后端存储**：数据库中可选择存储掩码值
5. **前端缓存**：LocalStorage/SessionStorage 中不存储明文
6. **监控审计**：审计日志中敏感信息掩码

---

## 3. 技术架构

### 3.1 混合实现方案

```
┌─────────────────────────────────────────────────────┐
│                   应用层                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  工具函数   │  │   中间件     │  │   服务       │ │
│  │ dataMask() │  │ maskMiddleware│  │ MaskService │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 3.2 模块设计

#### 3.2.1 工具函数库 (`server/utils/dataMask.js`)

- `maskEmail(email)` - 邮箱掩码
- `maskPhone(phone)` - 手机号掩码
- `maskIdCard(idCard)` - 身份证掩码
- `maskBankCard(bankCard)` - 银行卡掩码
- `maskIP(ip)` - IP地址掩码
- `maskDeviceFingerprint(fp)` - 设备指纹掩码
- `maskObject(obj, fields)` - 对象批量掩码
- `reversibleMask(value, key, authKey)` - 可逆掩码

#### 3.2.2 中间件 (`server/middleware/dataMask.js`)

- `maskResponseBody(req, res, next)` - 响应体自动掩码中间件
- `maskRequestBody(req, res, next)` - 请求体掩码中间件

#### 3.2.3 服务 (`server/services/dataMaskService.js`)

- `maskUserData(user)` - 用户数据掩码
- `unmaskField(value, fieldType, authKey)` - 字段解掩
- `batchMask(dataArray, fields)` - 批量掩码
- `getMaskedLogEntry(log)` - 掩码日志条目

---

## 4. API 设计

### 4.1 工具函数 API

```javascript
// 基础掩码
maskEmail('user@example.com')        // 'u***@example.com'
maskPhone('13812345678')             // '138****5678'
maskIdCard('110101199001011234')    // '110101********1234'
maskBankCard('6222021234567890123') // '622202****90123'

// 可逆掩码
const masked = reversibleMask('13812345678', 'phone', authKey)
// 解掩
const original = reversibleUnmask(masked, 'phone', authKey)
```

### 4.2 掩码服务 API

```javascript
// 用户数据掩码
const maskedUser = dataMaskService.maskUserData(user)
// 批量掩码
const maskedList = dataMaskService.batchMask(users, ['email', 'phone'])
// 解掩字段
const original = dataMaskService.unmaskField(maskedValue, 'phone', authKey)
```

---

## 5. 配置

### 5.1 环境变量

```env
# 数据掩码配置
MASK_SECRET_KEY=your-256-bit-secret-key
MASK_ENABLED=true
MASK_FIELDS=email,phone,idCard,bankCard,ip,deviceFingerprint
```

### 5.2 配置文件

```javascript
// config/mask.js
module.exports = {
  enabled: process.env.MASK_ENABLED === 'true',
  secretKey: process.env.MASK_SECRET_KEY,
  fields: process.env.MASK_FIELDS?.split(',') || ['email', 'phone'],
  reversible: true
}
```

---

## 6. 安全考虑

### 6.1 密钥管理

- 使用环境变量存储掩码密钥
- 密钥长度至少 256 位
- 密钥轮换策略：每 90 天更换

### 6.2 访问控制

- 解掩操作需要管理员权限
- 解掩操作记录审计日志
- 密钥不在日志中记录

---

## 7. 集成点

### 7.1 登录路由集成 (`server/routes/auth.js`)

- 登录响应：自动掩码用户敏感信息
- 注册响应：掩码新用户敏感信息

### 7.2 日志集成

- 错误日志：自动掩码敏感字段
- 审计日志：可选掩码

### 7.3 前端集成

- 登录表单：输入即时掩码显示
- 用户信息展示：显示掩码值

---

## 8. 测试计划

### 8.1 单元测试

- 各掩码函数测试
- 可逆掩码/解掩测试
- 边界条件测试

### 8.2 集成测试

- 中间件集成测试
- 服务集成测试
- 路由集成测试

---

## 9. 实施计划

### 9.1 阶段划分

1. **第一阶段**：工具函数库开发
2. **第二阶段**：掩码服务开发
3. **第三阶段**：中间件开发
4. **第四阶段**：路由集成
5. **第五阶段**：测试与文档

---

## 10. 验收标准

- [ ] 所有指定数据类型可正确掩码
- [ ] 可逆掩码功能正常工作
- [ ] 中间件正确拦截响应
- [ ] 路由集成不影响现有功能
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过
