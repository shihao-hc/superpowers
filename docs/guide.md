# 使用指南

## 快速开始

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd <project-name>

# 安装依赖
npm install

# 或使用Python（如果是AI大脑项目）
pip install -r requirements.txt
```

### 配置

1. 复制环境变量模板：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填入必要的配置：
```env
API_KEY=your_api_key_here
LOG_LEVEL=info
```

### 运行

```bash
# 开发模式
npm run dev

# 生产模式
npm start

# 运行测试
npm test
```

## 核心功能

### 1. AI大脑系统

AI大脑提供五大核心能力：

| 能力 | 功能 | 使用场景 |
|------|------|----------|
| 元认知 | 自我反思、思维监控 | 决策前分析 |
| 独立思维 | 多角度思考、因果链分析 | 问题分析 |
| 逆向思维 | 从结果反推、质疑假设 | 风险识别 |
| 自我进化 | 从经验学习、教训积累 | 持续改进 |
| 善用工具 | 智能工具选择、工具调用 | 任务执行 |

### 2. 使用示例

```javascript
// 初始化AI大脑
const BrainAgent = require('./src/agent/BrainAgent');
const brain = new BrainAgent({ verbose: true });

// 完整思考流程
const result = brain.thinkComplete('分析股票买入时机');

// 查看思考结果
console.log(result.metaQuestions);    // 元认知问题
console.log(result.perspectives);     // 多角度分析
console.log(result.reverseAnalysis); // 逆向思考
console.log(result.tools);           // 推荐工具
```

## 命令行工具

### 全方面检查

```bash
# 运行完整检查（55项）
node src/agent/ComprehensiveChecker.js

# 输出报告
node src/agent/ComprehensiveChecker.js --verbose
```

### 备份工具

```bash
# 创建备份
node scripts/backup/backup.js create

# 列出备份
node scripts/backup/backup.js list

# 恢复备份
node scripts/backup/backup.js restore <manifest-file>
```

## 常见问题

### Q: 如何添加新功能？

1. 在 `src/` 下创建新模块
2. 添加单元测试
3. 更新文档
4. 运行全方面检查

### Q: 如何报告问题？

1. 查看 `docs/recovery.md` 了解如何报告
2. 运行 `node src/agent/ComprehensiveChecker.js` 获取诊断信息
3. 创建 Issue 并附上诊断信息

### Q: 如何贡献代码？

1. Fork 项目
2. 创建功能分支
3. 编写测试和文档
4. 提交 Pull Request

## 相关文档

- [README](../README.md) - 项目概述
- [AI大脑文档](../docs/AI大脑.md) - 核心架构
- [灾难恢复](../docs/recovery.md) - 备份与恢复
- [CHANGELOG](../CHANGELOG.md) - 版本变更

## 获取帮助

- 文档：[docs/](.)
- Issue：[GitHub Issues](https://github.com/your-repo/issues)
- 讨论：[GitHub Discussions](https://github.com/your-repo/discussions)
