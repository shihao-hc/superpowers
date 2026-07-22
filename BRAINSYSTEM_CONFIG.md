# BrainSystem 配置

## 概述
本文件配置 BrainSystem 在 AI 对话中的行为。

## 基础配置

### 自动启用
```javascript
BrainSystem 配置 = {
  autoThink: true,           // 强制思考
  autoIntent: true,          // 意图分析
  autoProactive: true,       // 主动思考
  autoEmotion: true,         // 情感表达
  autoPersist: true,         // 持久化
  autoPredict: true          // 预测
}
```

### 调用时机
```
每次对话前:
  1. forceThink(input) → 强制思考
  2. analyzeIntent(input) → 意图分析
  3. proactiveThink(input) → 主动思考
  4. autoPersist() → 持久化

每次对话后:
  1. expressEmotion(input, response) → 情感表达
  2. smartStore(interaction) → 智能记忆
  3. learnInteraction() → 学习交互
```

## 核心方法调用顺序

### 1. 强制思考 (必须)
在输出任何回复前调用：
```javascript
const { forceThink } = require('./src/core/BrainSystem');
forceThink(用户输入);
```

### 2. 意图分析 (建议)
理解用户真实意图：
```javascript
const { analyzeIntent } = require('./src/core/BrainSystem');
analyzeIntent('帮我写个函数');
// → { intent: 'code_create', confidence: 0.8 }
```

### 3. 主动思考 (建议)
主动生成建议和提问：
```javascript
const { proactiveThink } = require('./src/core/BrainSystem');
proactiveThink('测试输入', {});
```

### 4. 情感表达 (可选)
回应用户情感：
```javascript
const { expressEmotion } = require('./src/core/BrainSystem');
expressEmotion('谢谢', '不客气');
// → { detected: 'thankful', expression: '很高兴能帮到你' }
```

## 统一入口

使用 `brain-entry.js` 一键调用：
```bash
node brain-entry.js "用户输入"
node brain-entry.js --status
node brain-entry.js --test
```

## 输出格式

每次回复必须包含调用证明：
```
=== 本次调用证明 ===
called: true/false
metaCount: 数字
selfCheck: 状态
```

## 版本信息

- BrainSystem: v19.0
- 核心模块: 19个
- Skills: 304个
- 持久化: 支持

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| 模块找不到 | 检查路径 D:/龙虾/src/core/BrainSystem.js |
| 启动太慢 | 使用 lazy load，仅在使用时加载 |
| 权限错误 | 以管理员权限运行 |