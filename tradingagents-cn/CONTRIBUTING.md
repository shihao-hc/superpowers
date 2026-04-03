# Contributing to TradingAgents-CN

感谢您对 TradingAgents-CN 项目的关注！我们欢迎各种形式的贡献，包括但不限于代码改进、功能扩展、文档完善和 Bug 修复。

## 开发指南

### 环境设置

1. **克隆仓库**
```bash
git clone https://github.com/tradingagents-cn/tradingagents-cn.git
cd tradingagents-cn
```

2. **创建虚拟环境**
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate      # Windows
```

3. **安装依赖**
```bash
pip install -r requirements.txt

# 开发依赖
pip install pytest pytest-asyncio black isort mypy
```

4. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 填入必要的 API 密钥
```

### 开发工作流

1. **创建功能分支**
```bash
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

2. **编写代码**
- 遵循项目代码风格
- 添加必要的注释和文档字符串
- 确保类型注解完整

3. **运行测试**
```bash
# 单元测试
pytest tests/ -v

# 带覆盖率
pytest tests/ --cov=tradingagents --cov-report=html

# 快速测试（无需 API）
python test_run.py --quick
```

4. **代码格式化**
```bash
black tradingagents/
isort tradingagents/
```

5. **提交更改**
```bash
git add .
git commit -m "feat: 添加新功能描述"
```

### 代码规范

#### Python 代码风格
- 遵循 PEP 8
- 使用 Black 进行格式化
- 使用 isort 整理导入
- 添加类型注解

#### 提交信息规范
```
<type>(<scope>): <subject>

<body>

<footer>
```

类型 (type):
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

示例:
```
feat(llm): 添加 Ollama 本地模型支持

- 实现 OllamaAdapter 类
- 支持流式输出
- 添加模型列表和健康检查

Closes #123
```

### 测试指南

#### 单元测试
```python
# tests/test_ollama_adapter.py
import pytest
from tradingagents.llm import create_llm_adapter

class TestOllamaAdapter:
    @pytest.fixture
    def adapter(self):
        return create_llm_adapter("ollama", model="llama3")
    
    @pytest.mark.asyncio
    async def test_invoke(self, adapter):
        response = await adapter.ainvoke("Hello, world!")
        assert response.content
```

#### 集成测试
```bash
# 使用模拟 LLM 进行集成测试
USE_MOCK_LLM=true pytest tests/integration/ -v
```

### 前端开发

```bash
cd frontend

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 代码检查
npm run lint
```

### 文档贡献

- 更新 README.md 中的相关部分
- 为新功能添加示例代码
- 在 `.opencode/skills/` 添加 Skills 文档

## 领域适配器开发

如需添加新的领域适配器（如法律、产品审查等），请参考：

1. 查看 `tradingagents/domain_adapters/base/` 了解基础接口
2. 参考 `tradingagents/domain_adapters/code_review/` 的实现
3. 确保实现所有必需的方法：
   - `analyze()`: 执行分析
   - `validate()`: 验证输入
   - `format_report()`: 格式化输出

## LLM 适配器开发

如需添加新的 LLM 提供商：

1. 继承 `BaseLLMAdapter`
2. 实现必需方法：
   - `ainvoke()`: 异步调用
   - `astream()`: 流式调用（如果支持）
3. 在 `factory.py` 中注册

## 提交 PR

1. Fork 仓库
2. 创建功能分支
3. 确保所有测试通过
4. 提交 PR 并描述您的更改
5. 等待代码审查

## 问题反馈

- 使用 GitHub Issues 报告 Bug
- 使用 GitHub Discussions 讨论功能
- 提交 PR 时关联相关 Issue

## 社区

- GitHub Discussions: https://github.com/tradingagents-cn/tradingagents-cn/discussions
- 提交 Issue: https://github.com/tradingagents-cn/tradingagents-cn/issues

## 许可

通过贡献代码，您同意您的代码将在 MIT 许可证下发布。
