# OpenClaw + opencode 配置指南

让 opencode 通过 OpenClaw 免费使用各种大模型。

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        opencode                                  │
│                    (AI 代码助手)                                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ 配置 API 地址
                      │ http://localhost:3002/v1
                      │ (OpenClaw Gateway)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   OpenClaw Gateway                              │
│                    (localhost:3002)                             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  /v1/chat/completions  (OpenAI 兼容 API)               │   │
│  │  /v1/models                                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ Cookie 认证
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    浏览器登录 (一次性)                           │
│                                                                 │
│   DeepSeek │ Claude │ ChatGPT │ Gemini │ Qwen │ Kimi │ Doubao │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 第一步：部署 OpenClaw Gateway

### 1.1 克隆并安装

```bash
# 克隆项目
git clone https://github.com/linuxhsj/openclaw-zero-token.git
cd openclaw-zero-token

# 安装依赖
pnpm install
pnpm build
pnpm ui:build
```

### 1.2 启动 Chrome 调试模式

```bash
# 启动 Chrome（保持这个终端开着）
./start-chrome-debug.sh
```

### 1.3 认证（每个平台只需一次）

```bash
# 在新终端中运行认证向导
./onboard.sh webauth

# 选择要使用的平台，例如：
# ? Auth provider: DeepSeek (Browser Login)
# ? DeepSeek Auth Mode: Automated Login (Recommended)

# 重复此步骤添加更多平台
./onboard.sh webauth
```

### 1.4 启动 Gateway

```bash
# 启动 Gateway 服务
./server.sh start

# Gateway 现在运行在 http://127.0.0.1:3002
```

## 第二步：验证 Gateway

### 2.1 检查健康状态

```bash
curl http://127.0.0.1:3002/health
```

### 2.2 获取模型列表

```bash
curl http://127.0.0.1:3002/v1/models \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2.3 测试聊天

```bash
curl http://127.0.0.1:3002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "deepseek-web/deepseek-chat",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 第三步：配置 opencode

### 3.1 找到 opencode 配置文件

opencode 通常在以下位置查找配置文件：

```
~/.opencode/config.json
~/.config/opencode/config.json
./opencode.config.json
```

### 3.2 配置 API 地址

```json
{
  "api": {
    "provider": "openai",
    "baseUrl": "http://127.0.0.1:3002/v1",
    "apiKey": "any-placeholder-key",
    "models": [
      "deepseek-web/deepseek-chat",
      "claude-web/claude-sonnet-4-6",
      "qwen-web/qwen-3-5-plus"
    ],
    "defaultModel": "deepseek-web/deepseek-chat"
  }
}
```

### 3.3 使用模型

在 opencode 中选择模型时，使用以下标识：

| 模型 | 标识 | 说明 |
|------|------|------|
| DeepSeek | `deepseek-web/deepseek-chat` | 默认，免费 |
| Claude | `claude-web/claude-sonnet-4-6` | 免费，推理强 |
| Qwen | `qwen-web/qwen-3-5-plus` | 免费，中文好 |
| Kimi | `kimi-web/moonshot-v1-8k` | 免费，长上下文 |
| Doubao | `doubao-web/doubao-seed-2.0` | 免费，字节系 |

### 3.4 或者使用简短别名

如果 opencode 支持模型别名配置：

```json
{
  "models": {
    "deepseek": "deepseek-web/deepseek-chat",
    "claude": "claude-web/claude-sonnet-4-6",
    "qwen": "qwen-web/qwen-3-5-plus"
  }
}
```

## 第四步：使用示例

### 4.1 代码生成

```
/model deepseek-web/deepseek-chat

帮我写一个快速排序算法
```

### 4.2 代码审查

```
/model claude-web/claude-sonnet-4-6

帮我审查这段代码
```

### 4.3 长文本处理

```
/model kimi-web/moonshot-v1-128k

帮我分析这个长文档
```

## 注意事项

### Cookie 有效期

- Web 会话可能会过期
- 如果模型调用失败，运行 `./onboard.sh webauth` 重新认证
- 建议定期刷新认证

### 网络要求

- 确保能够访问各平台网站
- 国内可能需要代理访问部分平台
- 网络不稳定会导致调用失败

### 速率限制

- 各平台可能有速率限制
- 建议轮换使用多个模型
- 不要高频调用同一模型

### 合规使用

⚠️ **免责声明**：
- 仅用于个人学习和内部测试
- 请遵守各平台的服务条款
- 作者不对使用造成的任何问题负责

## 故障排除

### Gateway 无法连接

```bash
# 检查 Gateway 是否运行
./server.sh status

# 如果未运行，启动它
./server.sh start
```

### 模型调用失败

```bash
# 1. 检查认证状态
./onboard.sh webauth

# 2. 在浏览器中手动登录平台
# 例如：访问 https://chat.deepseek.com

# 3. 重新认证
./onboard.sh webauth
```

### opencode 连接失败

```bash
# 1. 确认 Gateway 端口
curl http://127.0.0.1:3002/health

# 2. 检查防火墙
# 确保 localhost:3002 可访问

# 3. 检查 opencode 配置
# baseUrl 应该指向 http://127.0.0.1:3002/v1
```

## 进阶配置

### 使用 UltraWork 路由层

UltraWork 提供了额外的路由层，支持更多功能：

```bash
# 启动 UltraWork 路由
OPENCLAW_GATEWAY_URL=http://127.0.0.1:3002 \
node src/integrations/openclaw/launch-router.js

# 路由运行在 http://127.0.0.1:3003
```

然后在 opencode 中配置：

```json
{
  "api": {
    "baseUrl": "http://127.0.0.1:3003/v1",
    "apiKey": "ultrawork-local-key"
  }
}
```

### 多模型比较

UltraWork 支持 "AskOnce" 功能，一问多答：

```bash
curl http://127.0.0.1:3003/api/openclaw/ask-once \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "解释什么是量子计算",
    "models": ["deepseek", "claude", "qwen"]
  }'
```

## 参考链接

- [OpenClaw Zero Token](https://github.com/linuxhsj/openclaw-zero-token)
- [opencode 文档](https://github.com/opencode-ai/opencode)
