---
name: 'openclaw-integration'
description: '集成 OpenClaw Zero Token，免费使用各种大模型。支持 DeepSeek/Claude/ChatGPT/Gemini/Qwen/Kimi/Doubao/Grok/GLM 等，无需 API Key。'
---

# OpenClaw 集成

免费使用各种大模型，无需 API Key。

## 支持的模型

| 提供商 | 模型示例 | 上下文长度 |
|--------|----------|------------|
| DeepSeek | deepseek-chat, deepseek-reasoner | 64K |
| Claude | claude-sonnet-4-6, claude-opus-4-6 | 195K |
| ChatGPT | GPT-4, GPT-4 Turbo | 128K |
| Gemini | Gemini Pro, Gemini Ultra | 1M |
| Qwen | Qwen 3.5 Plus, Qwen 3.5 Turbo | 128K |
| Kimi | moonshot-v1-8k/32K/128K | 128K |
| Doubao | doubao-seed-2.0 | 63K |
| Grok | Grok 1, Grok 2 | 131K |
| GLM | glm-4-Plus, glm-4-Think | 128K |
| Manus | Manus 1.6, Manus 1.6 Lite | - |

## 快速开始

### 1. 安装 OpenClaw

```bash
git clone https://github.com/linuxhsj/openclaw-zero-token.git
cd openclaw-zero-token
pnpm install && pnpm build && pnpm ui:build
```

### 2. 启动认证流程

```bash
# 启动 Chrome 调试模式
./start-chrome-debug.sh

# 在新终端运行认证向导
./onboard.sh webauth
```

### 3. 启动 Gateway

```bash
./server.sh start
```

### 4. 在代码中使用

```javascript
const { MultiModelManager } = require('./src/integrations/openclaw');

async function main() {
  const manager = new MultiModelManager({
    gatewayUrl: 'http://127.0.0.1:3002'
  });
  
  await manager.initialize();
  
  // 简单问答
  const result = await manager.ask('你好，介绍一下你自己');
  console.log(result.content);
}

main();
```

## API 参考

### MultiModelManager

```javascript
const { MultiModelManager } = require('./integrations/openclaw');

const manager = new MultiModelManager({
  gatewayUrl: 'http://127.0.0.1:3002',
  defaultModel: 'deepseek-web/deepseek-chat'
});
```

#### 方法

##### `initialize()`
初始化管理器，获取模型列表。

```javascript
await manager.initialize();
```

##### `ask(prompt, options)`
简单问答。

```javascript
const result = await manager.ask('解释什么是量子计算', {
  model: 'claude',  // 支持别名
  temperature: 0.7,
  stream: false
});
```

##### `chat(messages, options)`
聊天补全。

```javascript
const response = await manager.chat([
  { role: 'system', content: '你是一个有帮助的助手' },
  { role: 'user', content: '写一个 hello world 程序' }
], {
  model: 'deepseek-web/deepseek-chat'
});
```

##### `streamChat(messages, options)`
流式聊天。

```javascript
await manager.streamChat(messages, {
  onChunk: (chunk) => {
    process.stdout.write(chunk.choices?.[0]?.delta?.content || '');
  }
});
```

##### `askOnce(prompt, models, options)`
一问多答，同时向多个模型提问。

```javascript
const results = await manager.askOnce(
  '解释什么是大语言模型',
  ['claude', 'deepseek', 'qwen'],
  { temperature: 0.7 }
);

// results:
// [
//   { model: 'claude-web/claude-sonnet-4-6', success: true, content: '...' },
//   { model: 'deepseek-web/deepseek-chat', success: true, content: '...' },
//   { model: 'qwen-web/qwen-3-5-plus', success: true, content: '...' }
// ]
```

##### `switchModel(modelId)`
切换模型。

```javascript
await manager.switchModel('claude-web/claude-sonnet-4-6');
```

##### `getProviders()`
获取提供商列表。

```javascript
const providers = manager.getProviders();
// [
//   { id: 'deepseek-web', name: 'DeepSeek', models: [...] },
//   { id: 'claude-web', name: 'Claude', models: [...] },
//   ...
// ]
```

##### `searchModels(query)`
搜索模型。

```javascript
const models = manager.searchModels('claude');
```

### 模型别名

支持使用简短别名：

| 别名 | 对应模型 |
|------|----------|
| `deepseek` | deepseek-web/deepseek-chat |
| `claude` | claude-web/claude-sonnet-4-6 |
| `chatgpt` | chatgpt-web/gpt-4 |
| `gemini` | gemini-web/gemini-pro |
| `qwen` | qwen-web/qwen-3-5-plus |
| `kimi` | kimi-web/moonshot-v1-8k |
| `doubao` | doubao-web/doubao-seed-2.0 |
| `grok` | grok-web/grok-2 |
| `glm` | glm-web/glm-4-plus |
| `manus` | manus-api/manus-1.6 |

## AskOnce 功能

AskOnce 可以同时向多个模型提问，比较它们的回答：

```javascript
const { MultiModelManager } = require('./integrations/openclaw');

const manager = new MultiModelManager();
await manager.initialize();

// 一问多答
const results = await manager.askOnce(
  '用 Python 写一个快速排序',
  ['deepseek', 'claude', 'qwen']
);

for (const result of results) {
  console.log(`\n=== ${result.model} ===`);
  console.log(result.content);
}
```

## 与 MCP 集成

```javascript
const { getMultiModelManager } = require('./integrations/openclaw');
const { getMCPBridge } = require('./mcp/MCPBridge');

async function setup() {
  const modelManager = getMultiModelManager();
  const mcpBridge = getMCPBridge();
  
  await modelManager.initialize();
  
  // 注册为 MCP 工具
  mcpBridge.registerTool({
    name: 'ai_chat',
    description: '使用 AI 模型聊天',
    handler: async (params) => {
      return modelManager.ask(params.prompt, params);
    }
  });
}
```

## 事件

```javascript
const manager = new MultiModelManager();

manager.on('initialized', ({ modelCount }) => {
  console.log(`已加载 ${modelCount} 个模型`);
});

manager.on('modelSwitched', ({ model }) => {
  console.log(`已切换到 ${model}`);
});

manager.on('error', (error) => {
  console.error('错误:', error);
});

await manager.initialize();
```

## 错误处理

```javascript
try {
  const result = await manager.ask('你好');
} catch (error) {
  if (error.message.includes('Connection refused')) {
    console.error('OpenClaw Gateway 未启动');
    console.error('请运行: ./server.sh start');
  } else {
    throw error;
  }
}
```

## 配置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `gatewayUrl` | `http://127.0.0.1:3002` | Gateway 地址 |
| `token` | `''` | Gateway 认证 token |
| `timeout` | `120000` | 请求超时 (ms) |
| `retries` | `3` | 重试次数 |
| `cacheTTL` | `300000` | 模型缓存 TTL (ms) |

## 安全说明

1. **凭证存储**: Cookies 和 tokens 存储在本地 `auth.json`，不要提交到版本控制
2. **会话过期**: Web 会话会过期，可能需要重新登录
3. **速率限制**: Web 端点可能有速率限制
4. **合规性**: 仅用于个人学习和实验

---

## 与 opencode 集成

### 架构

```
opencode → OpenClaw Gateway → 各平台 Web UI
```

### 配置步骤

1. **启动 OpenClaw Gateway** (默认端口 3002)

2. **配置 opencode** (`~/.opencode/config.json`)

```json
{
  "api": {
    "provider": "openai",
    "baseUrl": "http://127.0.0.1:3002/v1",
    "apiKey": "any-placeholder-key",
    "defaultModel": "deepseek-web/deepseek-chat"
  }
}
```

### 模型标识

| 模型 | 标识 |
|------|------|
| DeepSeek | `deepseek-web/deepseek-chat` |
| Claude | `claude-web/claude-sonnet-4-6` |
| Qwen | `qwen-web/qwen-3-5-plus` |
| Kimi | `kimi-web/moonshot-v1-8k` |
| Doubao | `doubao-web/doubao-seed-2.0` |

详细配置见 [docs/openclaw-opencode-guide.md](docs/openclaw-opencode-guide.md)
