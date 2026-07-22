# OpenCode BrainSystem 集成指南

## 概述
本指南说明如何在 OpenCode 中集成 BrainSystem，让每次对话自动调用 AI 大脑功能。

## 方法1：使用 Node.js Hook (推荐)

### 步骤1：在项目目录创建 hook 文件
```bash
mkdir -p .opencode-hooks
```

### 步骤2：创建 brain-hook.js
```javascript
// .opencode-hooks/brain-hook.js
const BrainSystem = require('./src/core/BrainSystem');

module.exports = {
  name: 'BrainSystem-Hook',
  version: '1.0.0',
  
  beforeResponse: async (context) => {
    // 1. 强制思考
    const think = BrainSystem.forceThink?.(context.input);
    
    // 2. 意图分析
    const intent = BrainSystem.analyzeIntent?.(context.input);
    
    // 3. 持久化
    BrainSystem.autoPersist?.();
    
    // 4. 返回增强的上下文
    return {
      ...context,
      brainEnhanced: true,
      intent: intent?.intent,
      confidence: intent?.confidence,
      suggestions: intent?.suggestions
    };
  },
  
  afterResponse: async (context) => {
    // 1. 情感表达
    const emotion = BrainSystem.expressEmotion?.(context.input, context.response);
    
    // 2. 记录学习
    BrainSystem.learnInteraction?.(context.input, context.intent);
    
    return context;
  }
};
```

## 方法2：创建系统级 Hook (需用户配置)

### 在 OpenCode 配置中添加:
```json
{
  "hooks": {
    "before-response": "node /path/to/龙虾/src/core/brain-integration.js"
  }
}
```

## 方法3：使用快捷命令

在 AGENTS.md 或项目配置中添加快捷命令：
```
/brain on    - 开启BrainSystem增强
/brain off   - 关闭BrainSystem增强
/brain status - 查看状态
/brain test   - 运行测试
```

## 方法4：创建包装脚本

创建 `opencode-brain.bat` 启动脚本：
```batch
@echo off
REM OpenCode with BrainSystem
node brain-entry.js %*
```

## 验证集成

运行验证脚本：
```bash
node brain-entry.js --test
```

## 功能验证清单

- [ ] forceThink 强制思考
- [ ] analyzeIntent 意图分析
- [ ] proactiveThink 主动思考
- [ ] expressEmotion 情感表达
- [ ] predict 预测
- [ ] smartStore/smartSearch 智能记忆
- [ ] unifiedProcess 统一处理
- [ ] autoPersist 持久化
- [ ] recordImprovement 进化记录

## 注意事项

1. **权限**: Hook 需要用户显式授权才能执行
2. **性能**: 每次调用会增加少量延迟 (~50ms)
3. **持久化**: 数据保存在 `D:/龙虾/.opencode/evolution/`
4. **安全**: 确保项目路径正确，Hook 只在受信任的项目中执行

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| Cannot find module | 检查路径是否正确 |
| Hook 不执行 | 确认 OpenCode 版本支持 Hook |
| 性能慢 | 减少不必要的模块调用 |

## 参考

- BrainSystem: `src/core/BrainSystem.js`
- 入口脚本: `brain-entry.js`
- 持久化目录: `.opencode/evolution/`