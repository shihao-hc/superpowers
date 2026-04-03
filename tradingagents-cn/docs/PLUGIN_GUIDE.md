# TradingAgents-CN 插件开发指南

本指南将帮助您为 TradingAgents-CN 创建自定义插件。插件可以扩展系统功能，包括新的 LLM 适配器、领域适配器、工具和监控集成。

## 目录

1. [LLM 适配器插件](#llm-适配器插件)
2. [领域适配器插件](#领域适配器插件)
3. [工具插件](#工具插件)
4. [监控插件](#监控插件)
5. [前端组件插件](#前端组件插件)

---

## LLM 适配器插件

### 基本结构

```python
from typing import AsyncIterator, Optional, Dict, Any
from tradingagents.llm.base_llm import BaseLLMAdapter, LLMResponse

class CustomLLMAdapter(BaseLLMAdapter):
    """自定义 LLM 适配器"""
    
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None
    ):
        super().__init__(api_key, model, base_url, config)
        # 初始化您的客户端
        
    async def ainvoke(self, prompt: str, **kwargs) -> LLMResponse:
        """异步调用"""
        # 实现您的调用逻辑
        return LLMResponse(
            content="response content",
            model=self.model
        )
    
    async def astream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        """异步流式调用"""
        # 实现流式输出
        for chunk in stream:
            yield chunk
    
    def supports_streaming(self) -> bool:
        return True
    
    def supports_function_calling(self) -> bool:
        return False
```

### 注册到工厂

编辑 `tradingagents/llm/factory.py`:

```python
from .custom_adapter import CustomLLMAdapter

PROVIDER_MAP = {
    # ... 其他提供商
    "custom": CustomLLMAdapter,
}

# 在 create_llm_adapter 函数中添加默认模型
default_models = {
    # ...
    "custom": "your-default-model",
}

# 在环境变量映射中添加
env_vars = {
    # ...
    "custom": "CUSTOM_API_KEY",
}
```

### 完整示例

参考 `tradingagents/llm/ollama_adapter.py`。

---

## 领域适配器插件

### 基本结构

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

class BaseDomainAdapter(ABC):
    """领域适配器基类"""
    
    def __init__(self, llm_adapter, config: Optional[Dict] = None):
        self.llm = llm_adapter
        self.config = config or {}
    
    @abstractmethod
    async def analyze(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """执行分析"""
        pass
    
    @abstractmethod
    def validate_input(self, input_data: Dict[str, Any]) -> bool:
        """验证输入"""
        pass
    
    @abstractmethod
    def format_report(self, result: Dict[str, Any]) -> str:
        """格式化报告"""
        pass
    
    def get_experts(self) -> List[str]:
        """返回专家角色列表"""
        return []
```

### 实现示例

```python
class MyDomainAdapter(BaseDomainAdapter):
    """自定义领域适配器"""
    
    EXPERTS = [
        "domain_expert",
        "technical_expert", 
        "business_expert"
    ]
    
    def validate_input(self, input_data: Dict[str, Any]) -> bool:
        required_fields = ["content", "context"]
        return all(field in input_data for field in required_fields)
    
    async def analyze(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        # 并行调用多个专家
        expert_results = await asyncio.gather(
            *[self.call_expert(name, input_data) 
              for name in self.EXPERTS]
        )
        
        # 汇总结果
        return self.summarize_results(expert_results)
    
    async def call_expert(self, expert_name: str, input_data: Dict) -> Dict:
        prompt = self.build_prompt(expert_name, input_data)
        response = await self.llm.ainvoke(prompt)
        return {
            "expert": expert_name,
            "analysis": response.content
        }
    
    def format_report(self, result: Dict[str, Any]) -> str:
        lines = ["# 分析报告\n"]
        for expert_result in result.get("analyses", []):
            lines.append(f"## {expert_result['expert']}\n")
            lines.append(f"{expert_result['analysis']}\n")
        return "\n".join(lines)
    
    def get_experts(self) -> List[str]:
        return self.EXPERTS
```

### 注册到系统

```python
# tradingagents/domain_adapters/__init__.py
from .my_domain_adapter import MyDomainAdapter

DOMAIN_ADAPTERS = {
    "my_domain": MyDomainAdapter,
}
```

---

## 工具插件

### 搜索工具

```python
from typing import Dict, Any, List, Optional
from tradingagents.tools.cache import CacheManager

class MySearchTool:
    """自定义搜索工具"""
    
    def __init__(self, cache_manager: Optional[CacheManager] = None):
        self.cache = cache_manager or CacheManager()
    
    @property
    def is_available(self) -> bool:
        """检查工具是否可用"""
        return True
    
    async def search(
        self,
        query: str,
        max_results: int = 5,
        **kwargs
    ) -> Dict[str, Any]:
        """执行搜索"""
        @self.cache.cached(key_prefix="my_search", ttl=1800)
        async def _search():
            # 实现搜索逻辑
            return {"query": query, "results": []}
        
        return await _search()
    
    def format_results(self, results: Dict[str, Any]) -> str:
        """格式化结果"""
        formatted = f"搜索: {results.get('query')}\n\n"
        for i, r in enumerate(results.get("results", [])[:5], 1):
            formatted += f"{i}. {r.get('title')}\n"
            formatted += f"   {r.get('snippet')}\n\n"
        return formatted
```

### 数据提供器

```python
class MyDataProvider:
    """自定义数据提供器"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
    
    async def get_data(
        self,
        symbol: str,
        start_date: str,
        end_date: str
    ) -> Dict[str, Any]:
        """获取数据"""
        pass
    
    async def get_realtime_quote(self, symbol: str) -> Dict[str, Any]:
        """获取实时报价"""
        pass
```

---

## 监控插件

### 自定义指标

```python
from prometheus_client import Counter, Histogram, Gauge

class CustomMetrics:
    """自定义监控指标"""
    
    def __init__(self, namespace: str = "tradingagents"):
        self.namespace = namespace
        
        self.requests_total = Counter(
            f"{namespace}_custom_requests_total",
            "Total custom requests",
            ["endpoint", "status"]
        )
        
        self.latency_seconds = Histogram(
            f"{namespace}_custom_latency_seconds",
            "Custom operation latency",
            ["operation"]
        )
        
        self.queue_size = Gauge(
            f"{namespace}_custom_queue_size",
            "Custom queue size"
        )
    
    def track_request(self, endpoint: str, status: str):
        self.requests_total.labels(endpoint=endpoint, status=status).inc()
    
    def track_latency(self, operation: str, duration: float):
        self.latency_seconds.labels(operation=operation).observe(duration)
```

### 告警规则

```yaml
# prometheus/custom_alerts.yml
groups:
  - name: custom_alerts
    rules:
      - alert: CustomHighErrorRate
        expr: rate(tradingagents_custom_requests_total{status="error"}[5m]) / rate(tradingagents_custom_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Custom operation error rate is high"
```

---

## 前端组件插件

### Vue 组件结构

```vue
<template>
  <div class="custom-component">
    <!-- 组件内容 -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'

interface Props {
  title: string
  variant?: 'default' | 'primary'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
})

const emit = defineEmits<{
  action: [data: any]
}>()

const settingsStore = useSettingsStore()
const localState = ref(null)

const computedValue = computed(() => {
  return settingsStore.settings.someField
})

const handleAction = () => {
  emit('action', { result: 'data' })
}

onMounted(() => {
  // 初始化逻辑
})
</script>

<style scoped>
.custom-component {
  /* 样式 */
}
</style>
```

### Pinia Store 扩展

```typescript
// stores/plugins/my-plugin-store.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMyPluginStore = defineStore('myPlugin', () => {
  const data = ref<any>(null)
  const loading = ref(false)
  
  async function fetchData() {
    loading.value = true
    try {
      const response = await fetch('/api/my-plugin/data')
      data.value = await response.json()
    } finally {
      loading.value = false
    }
  }
  
  return { data, loading, fetchData }
})
```

---

## 测试插件

### 单元测试

```python
# tests/test_my_plugin.py
import pytest
from my_plugin import MyPlugin

class TestMyPlugin:
    @pytest.fixture
    def plugin(self):
        return MyPlugin()
    
    def test_validate_input(self, plugin):
        valid_input = {"content": "test", "context": "test"}
        assert plugin.validate_input(valid_input) is True
        
        invalid_input = {"content": "test"}
        assert plugin.validate_input(invalid_input) is False
    
    @pytest.mark.asyncio
    async def test_analyze(self, plugin):
        result = await plugin.analyze({"content": "test"})
        assert "analyses" in result
```

### 集成测试

```python
# tests/integration/test_my_plugin_integration.py
import pytest

@pytest.mark.asyncio
async def test_full_flow():
    from tradingagents.llm import create_llm_adapter
    from my_plugin import MyPlugin
    
    llm = create_llm_adapter("mock")
    plugin = MyPlugin(llm)
    
    result = await plugin.analyze({"content": "test data"})
    report = plugin.format_report(result)
    
    assert len(report) > 0
```

---

## 发布插件

1. 创建 GitHub 仓库
2. 添加 `setup.py` 或 `pyproject.toml`
3. 发布到 PyPI（可选）
4. 添加到 `docs/PLUGINS.md` 列表

---

## 使用 Ollama 本地模型

### 安装 Ollama

1. 访问 [ollama.ai](https://ollama.ai) 下载并安装
2. 拉取模型：
```bash
ollama pull llama3
ollama pull qwen2.5
ollama pull codellama
```
3. 启动服务：
```bash
ollama serve  # 默认端口 11434
```

### 配置环境变量

在 `.env` 文件中添加：
```bash
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3
OLLAMA_BASE_URL=http://localhost:11434
```

### 在代码中使用

```python
from tradingagents.llm.factory import create_llm_adapter

# 自动从环境变量读取
llm = create_llm_adapter("ollama")

# 或手动指定
llm = create_llm_adapter(
    provider="ollama",
    model="llama3",
    base_url="http://localhost:11434"
)

# 调用
response = await llm.ainvoke("Hello, how are you?")
print(response.content)
```

### 在 Docker 中使用

```yaml
# docker-compose.yml
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

### 运行集成测试

```bash
# 设置环境变量
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama3

# 运行测试
pytest tests/integration/test_ollama_tavily.py -v
```

### 性能监控

Ollama 适配器已集成 Prometheus 指标：

```python
# 自动暴露以下指标
ollama_inference_seconds{model="llama3"}      # 推理延迟直方图
ollama_requests_total{model="llama3"}        # 请求计数器
ollama_tokens_total{model="llama3"}          # Token 计数器
```

在 Grafana 中创建面板观察 P95/P99 延迟。

---

## 使用 vLLM 高性能推理

### 什么是 vLLM？

vLLM 是一个高性能推理引擎，支持连续批处理 (Continuous Batching)，适合高并发生产环境。

**优势：**
- 高吞吐量：比 Ollama 更高的并发处理能力
- 连续批处理：动态批处理请求，提高 GPU 利用率
- PagedAttention：高效管理 KV 缓存

### 安装部署

**方式一：pip 安装**
```bash
pip install vllm
```

**方式二：Docker 部署**
```bash
docker run --gpus all \
    -v ~/.cache/huggingface:/root/.cache/huggingface \
    -p 8000:8000 \
    --ipc=host \
    vllm/vllm-openai:latest \
    --model meta-llama/Llama-2-7b-chat-hf \
    --gpu-memory-utilization 0.9 \
    --max-num-seqs 256
```

**方式三：Kubernetes 部署**
```yaml
# 使用 vLLM Operator 或直接部署
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-server
spec:
  template:
    spec:
      containers:
      - name: vllm
        image: vllm/vllm-openai:latest
        args:
        - --model
        - meta-llama/Llama-2-7b-chat-hf
        - --gpu-memory-utilization
        - "0.9"
        ports:
        - containerPort: 8000
        resources:
          limits:
            nvidia.com/gpu: 1
```

### 配置环境变量

```bash
LLM_PROVIDER=vllm
VLLM_MODEL=meta-llama/Llama-2-7b-chat-hf
VLLM_BASE_URL=http://localhost:8000/v1
```

### 在代码中使用

```python
from tradingagents.llm.factory import create_llm_adapter

# 自动从环境变量读取
llm = create_llm_adapter("vllm")

# 或手动指定
llm = create_llm_adapter(
    provider="vllm",
    model="meta-llama/Llama-2-7b-chat-hf",
    base_url="http://localhost:8000/v1"
)

# 调用
response = await llm.ainvoke("Hello, how are you?")
print(response.content)
```

### 性能调优参数

```python
from tradingagents.llm.vllm_adapter import VLLMAdapter

llm = VLLMAdapter(
    model="meta-llama/Llama-2-7b-chat-hf",
    config={
        "temperature": 0.7,
        "max_tokens": 4096,
        "top_p": 0.95,
        "top_k": -1,
        "max_num_seqs": 256,
        "max_num_batched_tokens": 32768,
    }
)
```

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `gpu_memory_utilization` | GPU 显存利用率 | 0.9 |
| `max_num_seqs` | 最大并发序列数 | 256 |
| `max_num_batched_tokens` | 最大批处理 token 数 | 32768 |
| `tensor_parallel_size` | 张量并行大小 | GPU 数量 |

### 性能基准测试

```bash
# 运行性能测试
python tests/performance/llm_benchmark.py

# 或使用 pytest
pytest tests/performance/llm_benchmark.py -v
```

### Ollama vs vLLM 对比

| 特性 | Ollama | vLLM |
|------|--------|------|
| 部署复杂度 | 低 | 中 |
| 吞吐量 | 中 | 高 |
| 连续批处理 | 否 | 是 |
| 多 GPU 支持 | 基础 | 高级 |
| 适合场景 | 开发/测试 | 生产高并发 |

**推荐：**
- 开发/测试：使用 Ollama
- 生产高并发：使用 vLLM

### 性能监控

vLLM 适配器已集成 Prometheus 指标：

```python
# 自动暴露以下指标
vllm_inference_seconds{model="..."}   # 推理延迟直方图
vllm_requests_total{model="..."}      # 请求计数器
```

---

## 使用 Tavily 联网搜索

### 获取 API Key

1. 注册 [Tavily](https://tavily.com) 账号
2. 在仪表盘复制 API Key
3. 免费额度：1000 次/天

### 配置环境变量

```bash
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxx
ENABLE_WEB_SEARCH=true  # 开启联网搜索
```

### 基础使用

```python
from tradingagents.tools.tavily_search import create_tavily_tool

tool = create_tavily_tool(api_key="tvly-xxx")

# 基础搜索
results = await tool.search("AAPL stock analysis")
print(results["answer"])  # AI 生成的答案
print(results["results"])  # 搜索结果列表

# 金融领域搜索
finance_results = await tool.search_finance("Tesla Q4 earnings")

# 新闻搜索
news_results = await tool.search_news("Fed interest rate", days=7)
```

### RAG 增强

```python
from tradingagents.tools.tavily_search import create_tavily_rag_tool

rag_tool = create_tavily_rag_tool(api_key="tvly-xxx")

# 增强上下文
original_context = "公司基本面分析：营收增长稳定..."
enhanced = await rag_tool.enhance_with_search(
    query="最新公司动态",
    context=original_context,
    max_search_results=3
)

# 使用增强后的上下文
response = await llm.ainvoke(f"基于以下信息分析：\n{enhanced}")
```

### 在新闻分析师中使用

新闻分析师已内置 Tavily 支持：

```python
# 启用联网搜索
import os
os.environ["ENABLE_WEB_SEARCH"] = "true"
os.environ["TAVILY_API_KEY"] = "tvly-xxx"

# 新闻分析时会自动获取实时网络新闻
from tradingagents.agents.analysts.news_analyst import NewsAnalyst
news_analyst = NewsAnalyst(llm)
report = await news_analyst.analyze("AAPL", "2026-03-22", state)
# 报告中会包含实时联网搜索的新闻摘要
```

### 集成测试

```bash
export TAVILY_API_KEY=tvly-xxx
pytest tests/integration/test_ollama_tavily.py::TestTavilyRealEnvironment -v
```

---

## 示例插件仓库

- [tradingagents-plugin-example](https://github.com/tradingagents-cn/plugin-example) - 官方示例插件

---

## 获取帮助

- 查看现有插件实现：`tradingagents/llm/`, `tradingagents/domain_adapters/`
- 阅读 Skills 文档：`.opencode/skills/`
- 在 GitHub Discussions 提问
