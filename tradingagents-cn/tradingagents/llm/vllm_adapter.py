"""
TradingAgents-CN vLLM Adapter
支持 vLLM 高性能推理引擎 (OpenAI 兼容 API)
"""

from typing import Optional, Dict, Any
from .openai_adapter import OpenAIAdapter

try:
    from prometheus_client import Histogram, Counter
    _PROMETHEUS_AVAILABLE = True
except ImportError:
    _PROMETHEUS_AVAILABLE = False

if _PROMETHEUS_AVAILABLE:
    vllm_inference_seconds = Histogram(
        'vllm_inference_seconds',
        'Time taken for vLLM inference',
        ['model'],
        buckets=(0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10)
    )
    vllm_requests_total = Counter(
        'vllm_requests_total',
        'Total number of vLLM requests',
        ['model', 'status']
    )


class VLLMAdapter(OpenAIAdapter):
    """vLLM 高性能推理引擎适配器
    
    vLLM 提供连续批处理 (Continuous Batching)，适合高并发场景。
    API 与 OpenAI 兼容，只需修改 base_url。
    
    部署示例:
        # 本地部署
        python -m vllm.entrypoints.openai.api_server \
            --model meta-llama/Llama-2-7b-chat-hf \
            --port 8000 \
            --gpu-memory-utilization 0.9
        
        # Docker 部署
        docker run --gpus all \
            -v ~/.cache/huggingface:/root/.cache/huggingface \
            -p 8000:8000 \
            --ipc=host \
            vllm/vllm-openai:latest \
            --model meta-llama/Llama-2-7b-chat-hf
    """

    DEFAULT_BASE_URL = "http://localhost:8000/v1"
    DEFAULT_MODEL = "meta-llama/Llama-2-7b-chat-hf"

    def __init__(
        self,
        api_key: str = "EMPTY",
        model: str = DEFAULT_MODEL,
        base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None
    ):
        import time
        self._start_time = time.time()
        
        super().__init__(
            api_key=api_key,
            model=model,
            base_url=base_url or self.DEFAULT_BASE_URL,
            config=config
        )
        
        self.temperature = self.config.get("temperature", 0.7)
        self.max_tokens = self.config.get("max_tokens", 4096)
        self.top_p = self.config.get("top_p", 0.95)
        self.top_k = self.config.get("top_k", -1)
        self.max_num_seqs = self.config.get("max_num_seqs", 256)
        self.max_num_batched_tokens = self.config.get("max_num_batched_tokens", 32768)

    async def ainvoke(self, prompt: str, **kwargs) -> 'LLMResponse':
        """异步调用 - 带性能指标"""
        import time
        
        messages = [{"role": "user", "content": prompt}]
        if "system" in kwargs:
            messages.insert(0, {"role": "system", "content": kwargs["system"]})

        start_time = time.time()
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=kwargs.get("temperature", self.temperature),
                max_tokens=kwargs.get("max_tokens", self.max_tokens),
                top_p=kwargs.get("top_p", self.top_p),
                stream=False,
            )

            duration = time.time() - start_time

            if _PROMETHEUS_AVAILABLE:
                vllm_inference_seconds.labels(model=self.model).observe(duration)
                vllm_requests_total.labels(model=self.model, status='success').inc()

            content = response.choices[0].message.content or ""
            return self._create_response(response, content)
        except Exception as e:
            if _PROMETHEUS_AVAILABLE:
                vllm_requests_total.labels(model=self.model, status='error').inc()
            raise

    def _create_response(self, response, content: str) -> 'LLMResponse':
        """创建响应对象"""
        from .base_llm import LLMResponse
        return LLMResponse(
            content=content,
            raw_response=response,
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
            model=self.model,
        )

    def supports_function_calling(self) -> bool:
        """vLLM 支持函数调用 (需要启用 guided decoding)"""
        return True

    def get_provider_name(self) -> str:
        return "vllm"

    @staticmethod
    def get_recommended_settings() -> Dict[str, Any]:
        """获取推荐配置"""
        return {
            "temperature": 0.7,
            "max_tokens": 4096,
            "top_p": 0.95,
            "top_k": -1,
            "gpu_memory_utilization": 0.9,
            "max_num_seqs": 256,
            "max_num_batched_tokens": 32768,
        }

    @staticmethod
    def get_docker_command(
        model: str,
        gpu_count: int = 1,
        port: int = 8000
    ) -> str:
        """生成 Docker 运行命令"""
        gpu_arg = ",".join([str(i) for i in range(gpu_count)])
        return f"""docker run --gpus all \\
    -v ~/.cache/huggingface:/root/.cache/huggingface \\
    -p {port}:8000 \\
    --ipc=host \\
    vllm/vllm-openai:latest \\
    --model {model} \\
    --gpu-memory-utilization 0.9 \\
    --max-num-seqs 256"""
