# Auth 认证授权系统深度分析

## 概览

Auth 模块负责多种认证方式的管理：
- **OAuth** (Claude.ai 登录)
- **API Key** (环境变量、Keychain、配置文件)
- **第三方服务** (AWS Bedrock、Vertex、GCP Foundry)
- **外部认证** (apiKeyHelper、apiKeyHelper)

## 核心文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `utils/auth.ts` | 2002 | 认证核心逻辑 |
| `utils/http.ts` | 136 | HTTP 认证头获取 |
| `utils/authFileDescriptor.ts` | ~200 | 文件描述符 Token |
| `services/oauth/client.ts` | ~600 | OAuth 客户端实现 |
| `services/oauth/index.ts` | ~300 | OAuth 服务 |

---

## 认证来源优先级

### getAuthTokenSource()

```typescript
// 优先级从高到低
1. --bare 模式
   └─ apiKeyHelper (仅 --settings 来源)
   
2. 标准模式
   ├─ ANTHROPIC_AUTH_TOKEN (env)
   ├─ CLAUDE_CODE_OAUTH_TOKEN (env)
   ├─ File Descriptor OAuth Token
   │   ├─ CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
   │   └─ CCR_OAUTH_TOKEN_FILE (磁盘回退)
   ├─ apiKeyHelper
   ├─ claude.ai OAuth
   └─ none
```

### getAnthropicApiKeyWithSource()

```typescript
// API Key 来源优先级
1. --bare 模式
   ├─ ANTHROPIC_API_KEY (env)
   └─ apiKeyHelper (--settings)
   
2. CI/测试模式
   ├─ File Descriptor
   └─ env ANTHROPIC_API_KEY
   
3. 标准模式
   ├─ ANTHROPIC_API_KEY (已批准)
   ├─ File Descriptor
   ├─ apiKeyHelper
   └─ Config/macOS Keychain
```

---

## OAuth Token 管理

### Token 存储

```typescript
// SecureStorage 存储结构
{
  claudeAiOauth: {
    accessToken: string
    refreshToken: string | null
    expiresAt: number | null
    scopes: string[]
    subscriptionType: SubscriptionType | null
    rateLimitTier: string | null
  }
}
```

### Token 刷新

```typescript
// 401 错误处理流程
handleOAuth401Error(failedAccessToken)
    │
    ├─ 1. 清空缓存
    │   └─ clearOAuthTokenCache()
    │
    ├─ 2. 读取当前 Token
    │   └─ getClaudeAIOAuthTokensAsync()
    │
    ├─ 3. 检查 Keychain 是否有新 Token
    │   └─ 如果不同，说明其他进程已刷新
    │
    └─ 4. 强制刷新
        └─ checkAndRefreshOAuthTokenIfNeeded(0, true)
```

### 跨进程同步

```typescript
// 问题：多终端同时刷新导致冲突
// 解决：文件锁 + 重试机制

// 1. 磁盘变更检测
invalidateOAuthCacheIfDiskChanged()
    └─ stat(.credentials.json) 检查 mtime

// 2. 文件锁
const release = await lockfile.lock(claudeDir)
    ├─ 成功：执行刷新
    └─ 失败：重试 (最多5次，1-2秒延迟)
```

---

## API Key Helper

### 安全设计

```typescript
// apiKeyHelper 预检查
_executeApiKeyHelper()
    │
    └─ 信任检查
        ├─ apiKeyHelper 来自项目设置
        │   └─ 必须已接受信任对话框
        │
        └─ 信任未建立
            └─ 返回 null，记录安全事件
```

### 缓存策略 (SWR)

```typescript
// Stale-While-Revalidate
getApiKeyFromApiKeyHelper()
    │
    ├─ TTL 内：直接返回缓存
    │
    ├─ TTL 外：
    │   ├─ 同步返回陈旧值
    │   └─ 异步后台刷新
    │
    └─ 冷启动：
        └─ 等待刷新完成
```

---

## AWS Bedrock / GCP Vertex

### AWS 认证

```typescript
// awsAuthRefresh: 交互式认证 (aws sso login)
// awsCredentialExport: 凭证导出 (aws sts get-caller-identity)

refreshAndGetAwsCredentials = memoizeWithTTLAsync(
  async () => {
    // 1. 检查 STS 调用身份
    await checkStsCallerIdentity()
    
    // 2. 如果失败，运行刷新命令
    await runAwsAuthRefresh()
    
    // 3. 导出凭证
    return getAwsCredsFromCredentialExport()
  },
  60 * 60 * 1000  // 1小时 TTL
)
```

### GCP 认证

```typescript
// gcpAuthRefresh: 交互式认证 (gcloud auth login)
// 检查凭证有效性，避免挂载超时

checkGcpCredentialsValid()
    └─ 5秒超时
        └─ GoogleAuth.getAccessToken()
```

---

## Trust 检查

```typescript
// 项目设置中的危险命令必须检查 Trust
if (来自项目设置) {
  if (!checkHasTrustDialogAccepted()) {
    // 安全：阻止执行，记录事件
    return null
  }
}
```

### 受信任的命令

| 命令类型 | Trust 检查 |
|---------|-----------|
| apiKeyHelper | ✅ 必须 |
| awsAuthRefresh | ✅ 必须 |
| awsCredentialExport | ✅ 必须 |
| gcpAuthRefresh | ✅ 必须 |
| otelHeadersHelper | ✅ 必须 |

---

## 订阅类型判断

```typescript
// 订阅类型
type SubscriptionType = 
  | 'max'        // Claude Max
  | 'pro'       // Claude Pro
  | 'team'      // Claude Team
  | 'enterprise' // Claude Enterprise
  | null        // API 用户

// 判断函数
isClaudeAISubscriber()      // 是否有订阅
is1PApiCustomer()          // 是否是 1P API 用户
hasOpusAccess()            // 是否有 Opus 访问权限
isMaxSubscriber()           // 是否 Max 用户
isTeamSubscriber()          // 是否 Team 用户
isEnterpriseSubscriber()      // 是否 Enterprise 用户
```

---

## Auth Headers

```typescript
// HTTP 请求认证头
getAuthHeaders()
    │
    ├─ Claude.ai 订阅者
    │   └─ Authorization: Bearer <oauth_token>
    │
    └─ API Key 用户
        └─ x-api-key: <api_key>
```

### 401 自动重试

```typescript
withOAuth401Retry(request)
    │
    ├─ 首次请求
    │
    ├─ 401 错误
    │   └─ handleOAuth401Error()
    │
    └─ 重试请求
```

---

## 关键设计模式

### 1. SWR 缓存

```typescript
// apiKeyHelper 使用 SWR 模式
// - TTL 内返回缓存
// - TTL 外返回陈旧值，后台刷新
// - 冷启动等待刷新完成
```

### 2. 文件锁

```typescript
// 多进程 Token 刷新互斥
await lockfile.lock(claudeDir)
// ... 刷新逻辑 ...
await release()
```

### 3. Trust 检查

```typescript
// 来自项目设置的危险命令必须先检查 Trust
if (isFromProjectSettings(command)) {
  if (!checkHasTrustDialogAccepted()) {
    return null
  }
}
```

### 4. 多源回退

```typescript
// 从多个源获取 Token
const sources = [
  () => getOAuthTokenFromEnv(),
  () => getOAuthTokenFromFD(),
  () => getOAuthTokenFromStorage(),
]
for (const getToken of sources) {
  const token = getToken()
  if (token) return token
}
```

---

## 与其他模块的交互

```
Auth
    │
    ├── auth.ts ──> 认证核心
    │       │
    │       ├── http.ts ──> Auth Headers
    │       │
    │       ├── authFileDescriptor.ts ──> FD Token
    │       │
    │       └── oauth/client.ts ──> OAuth 刷新
    │
    ├── oauth/index.ts ──> OAuth 服务
    │
    └── secureStorage/ ──> Token 持久化
```

---

## 关键洞察

1. **多认证源支持**: OAuth、API Key、第三方服务、外部 Helper
2. **Trust 安全检查**: 项目设置中的危险命令必须先检查信任
3. **SWR 缓存**: API Key Helper 使用 Stale-While-Revalidate 模式
4. **跨进程同步**: 文件锁 + 磁盘变更检测
5. **自动刷新**: 401 错误自动触发 Token 刷新
6. **订阅类型判断**: 支持多种订阅级别和 API 用户
